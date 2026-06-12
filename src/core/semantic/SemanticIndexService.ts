/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * SemanticIndexService v3 -- SQLite-backed (ADR-050, FEATURE-1500)
 *
 * Replaces vectra (single JSON file) with KnowledgeDB (sql.js WASM) +
 * VectorStore (Float32Array BLOBs + JS cosine similarity).
 *
 * Key features retained from v2:
 *  1. Batch embedding: N texts per API call
 *  2. Resumable indexing: checkpoint in DB (vectors.mtime + checkpoint table)
 *  3. Heading-aware chunking (2000 chars default)
 *  4. Cancel support: cancelBuild() flag
 *  5. Event-loop yielding between disk commits
 *
 * Storage: Managed by KnowledgeDB (global / local / obsidian-sync).
 */

import { requestUrl } from 'obsidian';
import type { Vault } from 'obsidian';
import type { CustomModel } from '../../types/settings';
import type { KnowledgeDB } from '../knowledge/KnowledgeDB';
import type { VectorStore } from '../knowledge/VectorStore';
import type { ApiHandler } from '../../api/types';
import * as path from 'path';
import * as fs from '../security/safeFs';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SemanticResult {
    path: string;
    excerpt: string;
    score: number;
    /**
     * Index of the chunk the excerpt was taken from (0 = opener chunk).
     * Optional: older code paths and MCP callers may omit it; consumers
     * must treat undefined as "unknown" and fall back to the excerpt as-is.
     */
    chunkIndex?: number;
}

export interface BuildResult {
    indexed: number;
    total: number;
    errors: number;
    cancelled: boolean;
    /** Sample of skipped file paths (max 10) for diagnostics */
    skippedFiles: string[];
    durationMs: number;
}

export interface SemanticIndexOptions {
    /** How many files to process before committing to disk. Default: 20 */
    batchSize?: number;
    /** How many texts to send per embedding API call. Default: 16 */
    embeddingBatchSize?: number;
    excludedFolders?: string[];
    /** Whether to also index PDF files. Default: false */
    indexPdfs?: boolean;
    /** Characters per chunk. Default: 2000. Changing this forces a full index rebuild. */
    chunkSize?: number;
    /** Contextual Retrieval: prepend LLM-generated context to chunks before embedding (ADR-051). Default: true */
    enableContextualRetrieval?: boolean;
    /**
     * AUDIT-013 follow-up: predicate that returns true for paths the user
     * has marked ignored (.obsidian-agentignore). Files matching this
     * predicate are excluded at BUILD time, so their content never enters
     * the embedding store. Defense in depth on top of read-time filters
     * in searchVault and SearchFilesTool.
     *
     * If undefined, the previous behaviour applies (no per-path ignore at
     * build); excludedFolders still works.
     */
    isIgnored?: (path: string) => boolean;
}

const DEFAULT_CHUNK_SIZE = 2000;   // chars — larger chunks → fewer API calls
const DEFAULT_COMMIT_EVERY = 20;   // files between disk commits
const DEFAULT_EMBED_BATCH = 16;    // texts per API request

// ---------------------------------------------------------------------------
// Keyword tokenization helpers. Shared by ALL token producers in this file
// (query terms, chunk tokens, filename tokens, tag tokens); folding only one
// side would silently break matching.
// ---------------------------------------------------------------------------

// Short acronyms that bypass the minimum token length filter.
// Checked case-insensitively: tokens are lowercased before the check.
// "re" is deliberately absent: tokenize() splits on hyphens, so every
// "re-index"/"re-test"/"re-run" would shed a noise "re" token into the
// index and into queries.
export const ACRONYM_ALLOWLIST: ReadonlySet<string> = new Set([
    'ki', 'ai', 'os', 'ba', 'js', 'db', 'ml', 'ui', 'ux', 'ci', 'it',
]);

// foldToken() runs on every token of every chunk during keywordSearch(),
// which re-tokenizes the corpus per query. The vocabulary is small and
// highly repetitive, so memoizing the fold turns five regex passes plus
// an NFKD normalize into a Map lookup for almost every call.
const FOLD_CACHE_MAX = 50000;
const foldCache = new Map<string, string>();

/**
 * Fold a lowercased token to its ASCII search form:
 * 1. Map German sharp s to "ss".
 * 2. NFKD-decompose and strip combining marks (u-umlaut becomes "u").
 * 3. Collapse the German transliteration digraphs ae/oe/ue to a/o/u
 *    ("ue" only when not preceded by a vowel or "q", mirroring Lucene's
 *    GermanNormalizationFilter) so the umlaut spelling and the ASCII
 *    transliteration of the same word produce an identical token.
 */
export function foldToken(token: string): string {
    const cached = foldCache.get(token);
    if (cached !== undefined) return cached;
    const folded = token
        .replace(/ß/g, 'ss')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ae/g, 'a')
        .replace(/oe/g, 'o')
        .replace(/(?<![aeiouq])ue/g, 'u');
    // Bounded cache: a full clear is rare (the vocabulary of a vault stays
    // far below the cap) and cheaper than LRU bookkeeping on the hot path.
    if (foldCache.size >= FOLD_CACHE_MAX) foldCache.clear();
    foldCache.set(token, folded);
    return folded;
}

// Common stop words that add noise to TF-IDF (German plus English).
// Kept minimal: IDF handles most stop words, but very common words like
// "ist", "wie", "the" appear in nearly every chunk and dilute scores.
// Entries pass through foldToken() so the set lives in the same folded
// space as the tokens it filters. "ueber" is intentionally NOT in the
// list: folded it would collide with the content word "über" and make
// notes like "Über das Projekt" unfindable. None of the folded entries
// collide with ACRONYM_ALLOWLIST (guarded by tokenizer-folding.test.ts).
export const KEYWORD_STOP_WORDS: ReadonlySet<string> = new Set([
    // German
    'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines',
    'ist', 'sind', 'war', 'hat', 'haben', 'wird', 'werden', 'kann', 'koennen',
    'wie', 'was', 'wer', 'wir', 'ich', 'sie', 'und', 'oder', 'aber', 'auch',
    'mit', 'von', 'aus', 'fuer', 'bei', 'nach', 'unter', 'auf',
    'nicht', 'noch', 'nur', 'sehr', 'schon', 'doch', 'dass', 'wenn', 'weil',
    // English
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
    'was', 'one', 'our', 'out', 'has', 'had', 'this', 'that', 'with', 'from',
    'have', 'been', 'will', 'they', 'were', 'which', 'their', 'what', 'about',
].map((w) => foldToken(w)));

// ---------------------------------------------------------------------------
// SemanticIndexService
// ---------------------------------------------------------------------------

export class SemanticIndexService {
    private vault: Vault;
    private knowledgeDB: KnowledgeDB;
    private vectorStore: VectorStore;

    private isBuilding = false;
    private cancelled = false;
    private abortController: AbortController | null = null;
    private builtAt: Date | null = null;

    private embeddingModel: CustomModel | null = null;
    private batchSize: number;
    private embeddingBatchSize: number;
    private excludedFolders: string[];
    private isIgnored?: (path: string) => boolean;
    private indexPdfs: boolean;
    private chunkSize: number;
    private enableContextualRetrieval: boolean;
    private contextualApiHandler: ApiHandler | null = null;
    /** BUG-016: once the configured context model fails permanently (auth / credit / quota), stop trying for the rest of the session. */
    private contextualApiDisabledReason: string | null = null;

    // Auto-update queue: process one file at a time so concurrent vault events
    // don't spawn dozens of simultaneous embedding calls (which freezes Obsidian).
    private autoUpdateQueue = new Set<string>();
    private autoIndexRunning = false;
    /** Number of unique files indexed (updated live during build). */
    docCount = 0;
    /** Live progress for external polling (e.g. Settings UI). */
    progressIndexed = 0;
    progressTotal = 0;
    /** Last build diagnostics — available after buildIndex() completes. */
    lastBuildResult: BuildResult | null = null;

    // Background enrichment state (Pass 2)
    /** Per-chunk freshness votes collected during enrichment (FEATURE-2006). */
    private freshnessVotes: Array<'volatile' | 'evolving' | 'stable'> = [];
    private enrichmentRunning = false;
    private enrichmentCancelled = false;
    private enrichmentAbortController: AbortController | null = null;
    /** Live progress for enrichment (Pass 2). */
    enrichmentProcessed = 0;
    enrichmentTotal = 0;
    /** Whether background enrichment is active (for UI polling). */
    get enriching(): boolean { return this.enrichmentRunning; }

    constructor(vault: Vault, knowledgeDB: KnowledgeDB, vectorStore: VectorStore, options: SemanticIndexOptions = {}) {
        this.vault = vault;
        this.knowledgeDB = knowledgeDB;
        this.vectorStore = vectorStore;
        this.batchSize = options.batchSize ?? DEFAULT_COMMIT_EVERY;
        this.embeddingBatchSize = options.embeddingBatchSize ?? DEFAULT_EMBED_BATCH;
        this.excludedFolders = options.excludedFolders ?? [];
        this.isIgnored = options.isIgnored;
        this.indexPdfs = options.indexPdfs ?? false;
        this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
        this.enableContextualRetrieval = options.enableContextualRetrieval ?? true;
    }

    /** Set the API handler for contextual prefix generation (FEATURE-1501). */
    setContextualApiHandler(handler: ApiHandler | null): void {
        this.contextualApiHandler = handler;
        if (handler) console.debug('[SemanticIndex] Contextual Retrieval model configured');
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    configure(options: SemanticIndexOptions): void {
        if (options.batchSize !== undefined) this.batchSize = options.batchSize;
        if (options.embeddingBatchSize !== undefined) this.embeddingBatchSize = options.embeddingBatchSize;
        if (options.excludedFolders !== undefined) this.excludedFolders = options.excludedFolders;
        if (options.isIgnored !== undefined) this.isIgnored = options.isIgnored;
        if (options.indexPdfs !== undefined) this.indexPdfs = options.indexPdfs;
        if (options.chunkSize !== undefined) this.chunkSize = options.chunkSize;
        if (options.enableContextualRetrieval !== undefined) this.enableContextualRetrieval = options.enableContextualRetrieval;
    }

    get isIndexed(): boolean { return this.builtAt !== null; }
    get building(): boolean { return this.isBuilding; }
    get lastBuiltAt(): Date | null { return this.builtAt; }

    setEmbeddingModel(model: CustomModel | null): void {
        this.embeddingModel = model;
        if (model) console.debug(`[SemanticIndex] Using embedding model: ${model.name} (${model.provider})`);
    }

    /**
     * Public adapter for the Memory v2 EmbeddingService thin-adapter pattern
     * (FEATURE-0316 / PLAN-005 task 6). Other engine modules can route their
     * embedding requests through VaultOperatorEmbeddingProvider, which delegates here
     * so the entire batch + retry + provider-quirk stack stays in one place.
     *
     * Throws when no embedding model is configured -- callers must pre-check
     * via `getEmbeddingModelInfo()` or wrap their own try/catch.
     */
    async embedTexts(texts: string[]): Promise<Float32Array[]> {
        return this.embedBatch(texts);
    }

    /**
     * Returns the active embedding model identity for callers that need to
     * surface it (UI, EmbeddingService.ModelInfo). Null when unconfigured.
     */
    getEmbeddingModelInfo(): { model: string; provider: string } | null {
        if (!this.embeddingModel) return null;
        return { model: this.embeddingModel.name, provider: this.embeddingModel.provider };
    }

    /** Stop an in-progress buildIndex(). Aborts pending API calls immediately. */
    cancelBuild(): void {
        this.cancelled = true;
        // Abort any pending HTTP requests (embedding + contextual prefix)
        this.abortController?.abort();
        // Also cancel background enrichment if running
        this.cancelEnrichment();
    }

    /** Cancel the background enrichment process (Pass 2). */
    cancelEnrichment(): void {
        this.enrichmentCancelled = true;
        this.enrichmentAbortController?.abort();
    }

    /** Restore state from checkpoint stored in the KnowledgeDB. */
    async initialize(): Promise<void> {
        try {
            if (!this.knowledgeDB.isOpen()) {
                await this.knowledgeDB.open();
            }
            const builtAt = this.knowledgeDB.getCheckpointValue('builtAt');
            if (builtAt) {
                this.builtAt = new Date(builtAt);
                // Always use the actual DB file count as source of truth (not the
                // checkpoint value which can be stale after settings changes like
                // enabling PDF indexing).
                this.docCount = this.vectorStore.getFileCount();
            }
        } catch { /* non-fatal */ }
    }

    /** Close the underlying KnowledgeDB. Call on plugin unload. */
    async close(): Promise<void> {
        await this.knowledgeDB.close();
    }

    /**
     * Build (or incrementally update) the index.
     *
     * @param onProgress  - Called with (indexed, total) after each file.
     * @param force       - Ignore checkpoint and rebuild from scratch.
     */
    async buildIndex(
        onProgress?: (indexed: number, total: number) => void,
        force = false,
    ): Promise<BuildResult> {
        if (this.isBuilding) return { indexed: 0, total: 0, errors: 0, cancelled: false, skippedFiles: [], durationMs: 0 };
        if (!this.embeddingModel) {
            throw new Error(
                'No embedding model configured. Go to Settings > Embeddings and add an ' +
                'embedding model (e.g. OpenAI text-embedding-3-small) before building the index.',
            );
        }
        this.isBuilding = true;
        this.cancelled = false;
        this.abortController = new AbortController();
        // Cancel any running background enrichment — will restart after build
        this.cancelEnrichment();
        const startTime = Date.now();
        const skippedFiles: string[] = [];

        try {
            // ----------------------------------------------------------------
            // 1. Determine file list (Markdown + optionally PDFs)
            // ----------------------------------------------------------------
            // Filter out non-indexable file types (.excalidraw.md = JSON blobs, not text)
            const NON_INDEXABLE_SUFFIXES = ['.excalidraw.md'];
            const mdFiles = this.vault.getMarkdownFiles()
                .filter((f) => !NON_INDEXABLE_SUFFIXES.some((s) => f.path.endsWith(s)));
            const DOCUMENT_EXTENSIONS = new Set(['pdf', 'pptx', 'xlsx', 'docx']);
            // Image OCR via text-extractor is available but NOT included in bulk indexing
            // (too slow — 382 images would take hours). Images can be indexed individually later.
            const allFiles = this.indexPdfs
                ? [
                    ...mdFiles,
                    ...this.vault.getFiles().filter((f) => DOCUMENT_EXTENSIONS.has(f.extension)),
                ]
                : mdFiles;
            // AUDIT-013 follow-up: respect IgnoreService at build time so
            // ignored notes never enter the embedding store. Read-time
            // filters (searchVault, SearchFilesTool) remain as a second
            // line of defence in case the index already contains older
            // entries.
            const folderFilter = this.excludedFolders.length > 0
                ? (path: string) => !this.excludedFolders.some((f) => path.startsWith(f + '/'))
                : () => true;
            const files = allFiles.filter((f) => {
                if (!folderFilter(f.path)) return false;
                if (this.isIgnored?.(f.path)) return false;
                return true;
            });
            const total = files.length;

            // Diagnostic: log file count breakdown so we can verify PDF inclusion
            const docCount = allFiles.length - mdFiles.length;
            const excluded = allFiles.length - files.length;
            console.debug(
                `[SemanticIndex] File breakdown: ${mdFiles.length} markdown, ${docCount} documents (indexPdfs=${this.indexPdfs}), ` +
                `${excluded} excluded (folders + ignore) -> ${total} total`,
            );

            const modelKey = this.modelKey();

            // ----------------------------------------------------------------
            // 2. Load checkpoint from DB — detect model/chunkSize change
            // ----------------------------------------------------------------
            const cpModel = force ? null : this.knowledgeDB.getCheckpointValue('embeddingModel');
            const cpChunkSize = force ? null : this.knowledgeDB.getCheckpointValue('chunkSize');
            const hasCheckpoint = cpModel !== null;
            const isModelChange = hasCheckpoint && cpModel !== modelKey;
            const isChunkSizeChange = hasCheckpoint && cpChunkSize !== null && parseInt(cpChunkSize, 10) !== this.chunkSize;
            const isFullRebuild = force || isModelChange || isChunkSizeChange || !hasCheckpoint;

            // Diagnostic: log WHY a full rebuild is triggered
            if (isFullRebuild) {
                const reasons: string[] = [];
                if (force) reasons.push('force=true');
                if (!hasCheckpoint) reasons.push('no checkpoint in DB');
                if (isModelChange) reasons.push(`model changed: "${cpModel}" -> "${modelKey}"`);
                if (isChunkSizeChange) reasons.push(`chunk size changed: ${cpChunkSize} -> ${this.chunkSize}`);
                console.debug(`[SemanticIndex] Full rebuild triggered: ${reasons.join(', ')}`);
            } else {
                const fileCount = this.vectorStore.getFileCount();
                console.debug(`[SemanticIndex] Incremental update from checkpoint (${fileCount} files indexed, model: ${cpModel})`);
            }

            if (isFullRebuild) {
                this.vectorStore.deleteAll();
            }

            // ----------------------------------------------------------------
            // 3. Determine which files need (re)indexing
            // ----------------------------------------------------------------
            const pathMtimes = isFullRebuild ? new Map<string, number>() : this.vectorStore.getPathMtimes();
            const toIndex = files.filter((f) => {
                if (isFullRebuild) return true;
                const storedMtime = pathMtimes.get(f.path);
                return storedMtime === undefined || storedMtime < (f.stat?.mtime ?? 0);
            });

            let indexed = isFullRebuild ? 0 : (files.length - toIndex.length);
            let errors = 0;

            this.progressIndexed = indexed;
            this.progressTotal = total;
            onProgress?.(indexed, total);

            if (toIndex.length === 0) {
                console.debug('[SemanticIndex] Index up to date — nothing to index.');
                this.builtAt = new Date();
                const result: BuildResult = { indexed: total, total, errors: 0, cancelled: false, skippedFiles: [], durationMs: Date.now() - startTime };
                this.lastBuildResult = result;
                return result;
            }

            // ----------------------------------------------------------------
            // 4. Embed + insert new chunks
            // ----------------------------------------------------------------
            let uncommitted = 0;

            for (const file of toIndex) {
                if (this.cancelled) {
                    console.debug('[SemanticIndex] Build cancelled — saving partial checkpoint.');
                    break;
                }

                try {
                    const content = await this.readFileContent(file);
                    const chunks = this.splitIntoChunks(content, this.chunkSize);

                    if (chunks.length > 0) {
                        // Prepend document title to chunk 0 so embeddings capture the filename.
                        // Critical for retrieval: "Mark Zimmermann.md" must be findable by name.
                        const title = file.path.split('/').pop()?.replace(/\.\w+$/, '') ?? '';
                        const enrichedChunks = title
                            ? [title + '\n\n' + chunks[0], ...chunks.slice(1)]
                            : chunks;

                        // Pass 1: embed chunks with title prefix (fast, no LLM call).
                        // Contextual Enrichment runs as Pass 2 in the background after build.
                        const vectors = await this.embedBatch(enrichedChunks);
                        this.vectorStore.insertChunks(file.path, enrichedChunks, vectors, file.stat?.mtime ?? 0, 0);
                    }

                    indexed++;
                    uncommitted++;
                    this.docCount = indexed;
                    this.progressIndexed = indexed;
                    onProgress?.(indexed, total);

                    // Persist every N files: save DB to disk + yield UI
                    if (uncommitted >= this.batchSize) {
                        this.saveCheckpointToDB(modelKey, indexed);
                        await this.knowledgeDB.save();
                        uncommitted = 0;
                        await new Promise<void>((r) => window.setTimeout(r, 0)); // yield
                    }
                } catch (e) {
                    errors++;
                    if (skippedFiles.length < 10) skippedFiles.push(file.path);
                    console.warn(`[SemanticIndex] Skipping "${file.path}":`, e);
                }
            }

            // Prune stale vectors for files no longer in the vault
            if (!isFullRebuild && !this.cancelled) {
                const vaultPaths = new Set(files.map((f) => f.path));
                const indexedPaths = this.vectorStore.getPathMtimes();
                for (const [p] of indexedPaths) {
                    // Only prune vault files, not session:/episode: prefixed entries
                    if (!p.includes(':') && !vaultPaths.has(p)) {
                        this.vectorStore.deleteByPath(p);
                    }
                }
            }

            // Final checkpoint + save
            this.saveCheckpointToDB(modelKey, indexed);
            await this.knowledgeDB.save();

            const builtAtStr = this.knowledgeDB.getCheckpointValue('builtAt')!;
            this.builtAt = new Date(builtAtStr);
            this.docCount = indexed;

            if (!this.cancelled) {
                console.debug(`[SemanticIndex] Build complete: ${indexed}/${total} files, ${errors} skipped.`);
            }

            const result: BuildResult = { indexed, total, errors, cancelled: this.cancelled, skippedFiles, durationMs: Date.now() - startTime };
            this.lastBuildResult = result;

            // Auto-start background enrichment (Pass 2) after successful build
            if (!this.cancelled && this.enableContextualRetrieval && this.contextualApiHandler) {
                window.setTimeout(() => {
                    void this.runBackgroundEnrichment();
                }, 1000);
            }

            return result;
        } catch (e) {
            if (this.cancelled) {
                console.debug('[SemanticIndex] Build cancelled by user.');
                return { indexed: 0, total: 0, errors: 0, cancelled: true, skippedFiles: [], durationMs: Date.now() - startTime };
            }
            console.error('[SemanticIndex] Build failed:', e);
            throw e;
        } finally {
            this.isBuilding = false;
            this.abortController = null;
        }
    }

    /**
     * Incrementally update a single file.
     * Removes its old chunks then re-embeds the current content.
     */
    async updateFile(filePath: string): Promise<void> {
        if (!this.knowledgeDB.isOpen()) return;
        try {
            const file = this.vault.getFileByPath(filePath);
            if (!file) return;

            const content = await this.readFileContent(file);
            const chunks = this.splitIntoChunks(content, this.chunkSize);
            if (chunks.length > 0) {
                // Prepend document title to chunk 0
                const title = filePath.split('/').pop()?.replace(/\.\w+$/, '') ?? '';
                const enrichedChunks = title
                    ? [title + '\n\n' + chunks[0], ...chunks.slice(1)]
                    : chunks;
                const vectors = await this.embedBatch(enrichedChunks);
                this.vectorStore.insertChunks(filePath, enrichedChunks, vectors, file.stat?.mtime ?? 0, 0);
            } else {
                this.vectorStore.deleteByPath(filePath);
            }
            this.knowledgeDB.markDirty();
        } catch (e) {
            console.warn(`[SemanticIndex] updateFile failed for ${filePath}:`, e);
        }
    }

    /**
     * Queue a file for auto-index. Safe to call on every vault event.
     * Deduplicates: if the same file is queued multiple times before it's
     * processed, only the latest version is indexed. All files are processed
     * sequentially (concurrency = 1) to prevent concurrent embedding calls
     * from freezing Obsidian's main thread.
     */
    queueAutoUpdate(filePath: string): void {
        this.autoUpdateQueue.add(filePath);
        if (!this.autoIndexRunning) {
            this.autoIndexRunning = true;
            void this.runAutoUpdateQueue();
        }
    }

    private async runAutoUpdateQueue(): Promise<void> {
        while (this.autoUpdateQueue.size > 0) {
            const paths = [...this.autoUpdateQueue];
            this.autoUpdateQueue.clear();
            for (const path of paths) {
                await this.updateFile(path).catch((e) =>
                    console.warn(`[SemanticIndex] Auto-update failed for ${path}:`, e)
                );
                // Pause between files so the Electron renderer can process user
                // input, paint frames, and run GC without freezing the UI.
                await this.sleep(2000);
            }
        }
        this.autoIndexRunning = false;
    }

    /**
     * Remove all chunks for a single file from the index.
     * Called on vault delete and rename (old path).
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- public API expects Promise for consistency
    async removeFile(filePath: string): Promise<void> {
        if (!this.knowledgeDB.isOpen()) return;
        try {
            if (!this.vectorStore.hasFile(filePath)) return;
            this.vectorStore.deleteByPath(filePath);
            this.docCount = Math.max(0, this.docCount - 1);
            this.knowledgeDB.markDirty();
        } catch (e) {
            console.warn(`[SemanticIndex] removeFile failed for "${filePath}":`, e);
        }
    }

    // -----------------------------------------------------------------------
    // Keyword search helpers: stemming + tokenization
    // -----------------------------------------------------------------------

    /**
     * Lightweight suffix stemmer for search term normalization.
     * Handles common English and German inflectional suffixes.
     * No external dependencies — intentionally simple to avoid over-stemming.
     */
    private static stemWord(word: string): string {
        if (word.length < 3) return word;
        let w = word;
        // English suffixes (longest first to avoid partial matches)
        if (w.endsWith('ings') && w.length > 6) w = w.slice(0, -4);
        else if (w.endsWith('tion') && w.length > 6) w = w.slice(0, -4) + 't';
        else if (w.endsWith('ness') && w.length > 6) w = w.slice(0, -4);
        else if (w.endsWith('ment') && w.length > 6) w = w.slice(0, -4);
        else if (w.endsWith('able') && w.length > 6) w = w.slice(0, -4);
        else if (w.endsWith('keit') && w.length > 6) w = w.slice(0, -4);
        else if (w.endsWith('heit') && w.length > 6) w = w.slice(0, -4);
        else if (w.endsWith('lich') && w.length > 6) w = w.slice(0, -4);
        else if (w.endsWith('isch') && w.length > 6) w = w.slice(0, -4);
        else if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
        else if (w.endsWith('ful') && w.length > 5) w = w.slice(0, -3);
        else if (w.endsWith('ung') && w.length > 5) w = w.slice(0, -3);
        else if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
        else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
        else if (w.endsWith('es') && w.length > 4) w = w.slice(0, -2);
        else if (w.endsWith('er') && w.length > 4) w = w.slice(0, -2);
        else if (w.endsWith('en') && w.length > 4) w = w.slice(0, -2);
        else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
        return w;
    }

    /**
     * Tokenize text into folded, stemmed words.
     * Splits on word boundaries (whitespace, hyphens, underscores, punctuation)
     * to handle compound words like "Meeting-Notiz" -> ["meeting", "notiz"].
     * Each token is folded via foldToken() (umlauts, sharp s, German
     * transliteration digraphs) BEFORE the length filter and stemming.
     * Filters tokens shorter than 3 characters unless they are listed in
     * ACRONYM_ALLOWLIST ("ki", "ai", "os", ...).
     */
    private static tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .split(/[\s_/,.;:!?()[\]{}"'`|@#=+*<>~^-]+/)
            .map((t) => foldToken(t))
            .filter((t) => t.length >= 3 || ACRONYM_ALLOWLIST.has(t))
            .map((t) => SemanticIndexService.stemWord(t));
    }

    /**
     * Keyword search over indexed chunks using TF-IDF scoring with folding
     * and stemming.
     *
     * Improvements over the previous substring-counting approach:
     * - Stemming: "meetings" matches "Meeting-Notiz" (both stem to "meeting")
     * - Word boundaries: "cat" does NOT match "category" (tokenized separately)
     * - IDF weighting: rare terms score higher than common words (language-agnostic)
     * - Compound-word splitting: "Meeting-Notiz" -> ["meeting", "notiz"]
     * - Unicode folding: "ueber" matches "über" (both fold to "uber")
     *
     * Used by hybrid search (RRF fusion) to catch exact names/tags the embedding misses.
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- public API expects Promise for consistency
    async keywordSearch(query: string, topK = 8): Promise<SemanticResult[]> {
        if (!this.knowledgeDB.isOpen()) return [];
        try {
            // 1. Tokenize + fold + stem query terms, deduplicate, remove stop words
            const queryTerms = [...new Set(SemanticIndexService.tokenize(query))]
                .filter(t => !KEYWORD_STOP_WORDS.has(t));
            if (queryTerms.length === 0) return [];

            const allChunks = this.vectorStore.getAllChunks();
            const N = allChunks.length;
            if (N === 0) return [];

            // 2. Pre-compute IDF: log((N+1) / (df+1)) per query term
            //    IDF naturally downweights frequent words regardless of language.
            const docFreq = new Map<string, number>();
            const chunkTokensCache: Map<number, Set<string>> = new Map();
            for (let idx = 0; idx < allChunks.length; idx++) {
                const chunk = allChunks[idx].text;
                if (!chunk) continue;
                const tokenSet = new Set(SemanticIndexService.tokenize(chunk));
                chunkTokensCache.set(idx, tokenSet);
                for (const qt of queryTerms) {
                    if (tokenSet.has(qt)) docFreq.set(qt, (docFreq.get(qt) ?? 0) + 1);
                }
            }

            // 3. Score each chunk: sum(TF * IDF) per matching term, keep best chunk per file
            const byPath = new Map<string, { excerpt: string; score: number; chunkIndex: number }>();
            for (let idx = 0; idx < allChunks.length; idx++) {
                const { path: filePath, text: chunk, chunkIndex } = allChunks[idx];
                if (!chunk || !filePath) continue;

                const tokenSet = chunkTokensCache.get(idx);
                if (!tokenSet) continue;

                let score = 0;
                // Tokenize the chunk at most once per chunk (not once per
                // matching query term): the TF loop only needs the token
                // list when at least one term is present in the token set.
                let tokens: string[] | null = null;
                for (const qt of queryTerms) {
                    if (!tokenSet.has(qt)) continue;
                    tokens ??= SemanticIndexService.tokenize(chunk);
                    const tf = tokens.filter((t) => t === qt).length;
                    const df = docFreq.get(qt) ?? 1;
                    const idf = Math.log((N + 1) / (df + 1));
                    score += tf * idf;
                }
                if (score === 0) continue;

                const existing = byPath.get(filePath);
                if (!existing || score > existing.score) {
                    byPath.set(filePath, { excerpt: chunk, score, chunkIndex });
                }
            }

            // 4. Title boost: if query terms appear in the filename, boost the score.
            // This ensures "Mark Zimmermann" query finds "Notes/Mark Zimmermann.md" at rank 1.
            for (const [filePath, entry] of byPath) {
                const fileName = filePath.split('/').pop()?.replace(/\.\w+$/, '')?.toLowerCase() ?? '';
                const fileTokens = new Set(SemanticIndexService.tokenize(fileName));
                let titleMatches = 0;
                for (const qt of queryTerms) {
                    if (fileTokens.has(qt)) titleMatches++;
                }
                if (titleMatches > 0) {
                    // Boost proportional to how many query terms match the title
                    entry.score *= 1 + titleMatches * 2;
                }
            }

            // 5. Normalize scores 0-1, sort, return top-K
            const entries = Array.from(byPath.entries());
            const maxScore = entries.reduce((m, [, v]) => Math.max(m, v.score), 1);
            return entries
                .map(([filePath, v]) => ({ path: filePath, excerpt: v.excerpt, score: v.score / maxScore, chunkIndex: v.chunkIndex }))
                .sort((a, b) => b.score - a.score)
                .slice(0, topK);
        } catch {
            return [];
        }
    }

    /**
     * Tag-match search: rank vault paths by how many query tokens overlap
     * with the note's tags in the `tags` table. Used as a third RRF signal
     * in `semantic_search` (FEATURE-0316 / PLAN-005 task 5) so notes that
     * carry the right hashtag bubble up even when their text doesn't match
     * the query verbatim.
     *
     * Returns SemanticResult shape (path, excerpt, score) with score
     * normalised 0-1 across the result set. Excerpt is the first chunk of
     * the file so the caller has something to render.
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- public API expects Promise for consistency
    async tagMatchSearch(query: string, topK = 8): Promise<SemanticResult[]> {
        if (!this.knowledgeDB.isOpen()) return [];
        try {
            const queryTokens = new Set(
                [...SemanticIndexService.tokenize(query)]
                    .filter(t => !KEYWORD_STOP_WORDS.has(t)),
            );
            if (queryTokens.size === 0) return [];

            const db = this.knowledgeDB.getDB();
            const result = db.exec('SELECT path, tag FROM tags');
            if (result.length === 0) return [];

            // Per-path hit count: how many distinct query tokens overlap with tags?
            const hitsByPath = new Map<string, Set<string>>();
            for (const row of result[0].values) {
                const path = row[0] as string;
                const tagRaw = row[1];
                const tag = (typeof tagRaw === 'string' ? tagRaw : '').toLowerCase();
                if (!tag) continue;
                const tagTokens = SemanticIndexService.tokenize(tag);
                for (const tt of tagTokens) {
                    if (queryTokens.has(tt)) {
                        if (!hitsByPath.has(path)) hitsByPath.set(path, new Set());
                        hitsByPath.get(path)!.add(tt);
                    }
                }
            }
            if (hitsByPath.size === 0) return [];

            const maxHits = [...hitsByPath.values()].reduce((m, s) => Math.max(m, s.size), 1);
            const ranked = [...hitsByPath.entries()]
                .map(([path, hits]) => ({ path, score: hits.size / maxHits }))
                .sort((a, b) => b.score - a.score)
                .slice(0, topK);

            // Hydrate with excerpts -- first chunk of each file
            return ranked.map(({ path, score }) => {
                const chunks = this.vectorStore.getChunkTextsByPath(path);
                return { path, excerpt: chunks[0] ?? '', score, chunkIndex: 0 };
            });
        } catch {
            return [];
        }
    }

    /**
     * Return all indexed chunks for a specific file, sorted by chunk order.
     * Used by graph-augmented RAG to load linked-note context.
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- public API expects Promise for consistency
    async getChunksByPath(filePath: string): Promise<string[]> {
        if (!this.knowledgeDB.isOpen()) return [];
        try {
            return this.vectorStore.getChunkTextsByPath(filePath);
        } catch {
            return [];
        }
    }

    /**
     * Search the index. Returns top-K most relevant chunks.
     * @param textForEmbedding - Optional override for what gets embedded (used by HyDE).
     *   When provided, this text is embedded instead of `query`.
     * @param options - Enhanced retrieval options (FEATURE-1501):
     *   - adjacentChunks: window size for adjacent chunk context (default: 0 = off)
     *   - adjacentThreshold: min similarity for adjacent chunks to be included (default: 0.3)
     *   - maxPerFile: max results per file (default: 1)
     */
    async search(
        query: string,
        topK = 5,
        textForEmbedding?: string,
        options?: { adjacentChunks?: number; adjacentThreshold?: number; maxPerFile?: number },
    ): Promise<SemanticResult[]> {
        if (!this.knowledgeDB.isOpen()) return [];
        try {
            const embedText = textForEmbedding ?? query;
            const [vector] = await this.embedBatch([embedText]);

            // Enhanced search with adjacent context + multi-chunk per file
            if (options?.adjacentChunks || (options?.maxPerFile && options.maxPerFile > 1)) {
                const results = this.vectorStore.searchWithContext(
                    vector,
                    topK,
                    options.adjacentChunks ?? 1,
                    options.adjacentThreshold ?? 0.3,
                    options.maxPerFile ?? 1,
                );
                return results.map((r) => ({
                    path: r.path,
                    excerpt: r.text,
                    score: r.score,
                    chunkIndex: r.chunkIndex,
                }));
            }

            // Default: single best chunk per file (backward compatible)
            const results = this.vectorStore.searchUniqueFiles(vector, topK);
            return results.map((r) => ({
                path: r.path,
                excerpt: r.text,
                score: r.score,
                chunkIndex: r.chunkIndex,
            }));
        } catch (e) {
            console.error('[SemanticIndex] Search failed:', e);
            return [];
        }
    }

    /**
     * Index a session summary into the vector store.
     * Called after SingleCallProcessor saves a session summary.
     * Items are tagged with source='session' so they can be filtered separately.
     */
    async indexSessionSummary(sessionId: string, content: string): Promise<void> {
        if (!this.knowledgeDB.isOpen()) return;
        try {
            const chunks = this.splitIntoChunks(content, this.chunkSize);
            if (chunks.length === 0) return;

            const vectors = await this.embedBatch(chunks);
            this.vectorStore.insertChunks(`session:${sessionId}`, chunks, vectors, Date.now());
            this.knowledgeDB.markDirty();
            console.debug(`[SemanticIndex] Indexed session summary: ${sessionId} (${chunks.length} chunks)`);
        } catch (e) {
            console.warn(`[SemanticIndex] Failed to index session ${sessionId}:`, e);
        }
    }

    /**
     * Search only session summaries in the index.
     * Returns top-K results filtered to path prefix 'session:'.
     */
    async searchSessions(query: string, topK = 3): Promise<SemanticResult[]> {
        if (!this.knowledgeDB.isOpen()) return [];
        try {
            const [vector] = await this.embedBatch([query]);
            const results = this.vectorStore.searchUniqueFiles(vector, topK, 'session:');
            return results.map((r) => ({
                path: r.path,
                excerpt: r.text,
                score: r.score,
            }));
        } catch (e) {
            console.warn('[SemanticIndex] Session search failed:', e);
            return [];
        }
    }

    /**
     * Index a task episode for episodic memory retrieval (ADR-018).
     * Follows the same pattern as indexSessionSummary with source='episode'.
     */
    async indexEpisode(episodeId: string, content: string): Promise<void> {
        if (!this.knowledgeDB.isOpen()) return;
        try {
            const chunks = this.splitIntoChunks(content, this.chunkSize);
            if (chunks.length === 0) return;

            const vectors = await this.embedBatch(chunks);
            this.vectorStore.insertChunks(`episode:${episodeId}`, chunks, vectors, Date.now());
            this.knowledgeDB.markDirty();
        } catch (e) {
            console.warn(`[SemanticIndex] Failed to index episode ${episodeId}:`, e);
        }
    }

    /**
     * Search only task episodes in the index (ADR-018).
     * Returns top-K results filtered to path prefix 'episode:'.
     */
    async searchEpisodes(query: string, topK = 3): Promise<SemanticResult[]> {
        if (!this.knowledgeDB.isOpen()) return [];
        try {
            const [vector] = await this.embedBatch([query]);
            const results = this.vectorStore.searchUniqueFiles(vector, topK, 'episode:');
            return results.map((r) => ({
                path: r.path,
                excerpt: r.text,
                score: r.score,
            }));
        } catch (e) {
            console.warn('[SemanticIndex] Episode search failed:', e);
            return [];
        }
    }

    /** Delete the DB and reset state. Reopens the DB so subsequent builds work. */
    async deleteIndex(): Promise<void> {
        this.cancelEnrichment();
        try {
            await this.knowledgeDB.deleteDB();
            // deleteDB() closes the DB — reopen so buildIndex() can use it immediately
            await this.knowledgeDB.open();
        } catch { /* non-fatal */ }
        this.builtAt = null;
        this.docCount = 0;
        this.progressIndexed = 0;
        this.progressTotal = 0;
        this.lastBuildResult = null;
        this.enrichmentProcessed = 0;
        this.enrichmentTotal = 0;
    }

    // -----------------------------------------------------------------------
    // Background Enrichment (Pass 2) — ADR-051 Stufe 0
    // -----------------------------------------------------------------------

    /** Get enrichment progress for UI polling. */
    getEnrichmentProgress(): { processed: number; total: number; running: boolean } {
        return {
            processed: this.enrichmentProcessed,
            total: this.enrichmentTotal,
            running: this.enrichmentRunning,
        };
    }

    /**
     * Pass 2: Background enrichment loop.
     * Fetches unenriched chunks in batches, generates Haiku prefixes,
     * re-embeds, and updates in place. Resumable: picks up where it left off
     * because it queries enriched=0 each iteration.
     *
     * Search works throughout — quality improves as chunks are enriched.
     */
    async runBackgroundEnrichment(): Promise<void> {
        if (this.enrichmentRunning || this.isBuilding) return;
        if (!this.enableContextualRetrieval || !this.contextualApiHandler) {
            console.debug('[SemanticIndex] Background enrichment skipped: contextual retrieval disabled or no handler');
            return;
        }
        if (!this.embeddingModel) return;

        this.enrichmentRunning = true;
        this.enrichmentCancelled = false;
        this.enrichmentAbortController = new AbortController();

        // Compute totals for progress
        this.enrichmentTotal = this.vectorStore.getTotalVaultChunkCount();
        this.enrichmentProcessed = this.enrichmentTotal - this.vectorStore.getUnenrichedCount();

        console.debug(
            `[SemanticIndex] Background enrichment started: ${this.enrichmentProcessed}/${this.enrichmentTotal} already enriched`,
        );

        try {
            const BATCH_SIZE = 50;
            let batch = this.vectorStore.getUnenrichedChunks(BATCH_SIZE);

            while (batch.length > 0 && !this.enrichmentCancelled) {
                // Group chunks by path so we read each file only once
                const byPath = new Map<string, typeof batch>();
                for (const chunk of batch) {
                    const list = byPath.get(chunk.path) ?? [];
                    list.push(chunk);
                    byPath.set(chunk.path, list);
                }

                for (const [filePath, chunks] of byPath) {
                    if (this.enrichmentCancelled) break;

                    // Read full document for context
                    let fullContent: string;
                    try {
                        const file = this.vault.getFileByPath(filePath);
                        if (!file) {
                            // File deleted since indexing — skip
                            this.enrichmentProcessed += chunks.length;
                            continue;
                        }
                        fullContent = await this.readFileContent(file);
                    } catch {
                        this.enrichmentProcessed += chunks.length;
                        continue;
                    }

                    // FIX-15-01-01: two-phase enrichment per file.
                    // Phase A: LLM-enrichment is intrinsically per-chunk (each
                    // chunk gets its own contextual prefix from the model) so
                    // we still loop one-by-one and collect the enriched texts.
                    // Phase B: a single batched embedBatch() call replaces the
                    // previous per-chunk single-text embed (which produced
                    // hundreds of `texts=1` HTTP roundtrips on a Vault reindex).
                    const pendingEmbeds: Array<{ chunkId: number; enrichedText: string }> = [];

                    // Phase A -- collect enriched texts (one LLM call per chunk).
                    for (const chunk of chunks) {
                        if (this.enrichmentCancelled) break;
                        try {
                            const enrichedTexts = await this.enrichChunkWithContext(
                                [chunk.text], filePath, fullContent,
                            );
                            pendingEmbeds.push({ chunkId: chunk.id, enrichedText: enrichedTexts[0] });
                        } catch (e) {
                            // Non-fatal: leave as unenriched, will retry next run
                            console.warn(`[SemanticIndex] Enrichment failed for chunk ${chunk.id}:`, e);
                            this.enrichmentProcessed++;
                        }
                        // Yield to UI thread between LLM calls
                        await new Promise<void>(r => window.setTimeout(r, 0));
                    }

                    // Phase B -- one batched embed for the whole file.
                    if (pendingEmbeds.length > 0 && !this.enrichmentCancelled) {
                        try {
                            const vectors = await this.embedBatch(pendingEmbeds.map(p => p.enrichedText));
                            for (let i = 0; i < pendingEmbeds.length; i++) {
                                this.vectorStore.updateChunkEnriched(
                                    pendingEmbeds[i].chunkId,
                                    pendingEmbeds[i].enrichedText,
                                    vectors[i],
                                );
                                this.enrichmentProcessed++;
                            }
                        } catch (e) {
                            // Batch embed failed -- leave the file's chunks
                            // unenriched, they will retry on the next run.
                            console.warn(`[SemanticIndex] Batch embed failed for ${filePath}:`, e);
                            this.enrichmentProcessed += pendingEmbeds.length;
                        }
                    } else if (this.enrichmentCancelled) {
                        // Cancelled mid Phase A -- whatever was collected is
                        // discarded; chunks stay unenriched for next run.
                        // No counter increment (we did not finish them).
                    }

                    // Store note-level freshness class from per-chunk votes (FEATURE-2006)
                    if (this.freshnessVotes.length > 0) {
                        this.storeFreshnessClass(filePath, this.freshnessVotes);
                        this.freshnessVotes = [];
                    }

                    // Pause between files to avoid rate limiting
                    await this.sleep(100);
                }

                // Persist progress periodically
                await this.knowledgeDB.save();

                // Fetch next batch
                batch = this.vectorStore.getUnenrichedChunks(BATCH_SIZE);
            }

            if (!this.enrichmentCancelled) {
                console.debug('[SemanticIndex] Background enrichment complete');
            } else {
                console.debug('[SemanticIndex] Background enrichment cancelled');
            }
        } catch (e) {
            console.warn('[SemanticIndex] Background enrichment error:', e);
        } finally {
            this.enrichmentRunning = false;
            this.enrichmentAbortController = null;
        }
    }

    // -----------------------------------------------------------------------
    // Contextual Retrieval (ADR-051 Stufe 0)
    // -----------------------------------------------------------------------

    /**
     * Enrich chunks with LLM-generated context prefixes (Anthropic Contextual Retrieval).
     * Each chunk gets a 2-3 sentence prefix describing its position within the activeDocument.
     * The enriched text is used for both embedding and storage — improving search quality
     * by 49-67% (Anthropic benchmark) because embeddings capture document-level context.
     *
     * Falls back to original chunks on any error or when disabled.
     */
    private async enrichChunkWithContext(
        chunks: string[],
        filePath: string,
        fullContent: string,
    ): Promise<string[]> {
        if (!this.enableContextualRetrieval || !this.contextualApiHandler || chunks.length === 0) {
            return chunks;
        }

        // Build a compact document summary for the prompt: title + headings + first 1500 chars
        // L-2: Sanitize user content to mitigate prompt injection via vault content
        const sanitize = (text: string, maxLen: number): string =>
            text.replace(/```/g, '').replace(/^(system|assistant|user):/gim, '').slice(0, maxLen);
        const title = sanitize(filePath.split('/').pop()?.replace(/\.\w+$/, '') ?? filePath, 200);
        const headings = sanitize(fullContent.match(/^#{1,3} .+$/gm)?.slice(0, 10)?.join('\n') ?? '', 500);
        const docContext = sanitize(fullContent, 1500);

        const enriched: string[] = [];
        for (const chunk of chunks) {
            // Respect cancel flag during enrichment (can take many seconds per chunk)
            if (this.cancelled) return chunks;
            try {
                const prompt =
                    `<document title="${title}">\n${headings ? `Headings:\n${headings}\n\n` : ''}${docContext}\n</document>\n\n` +
                    `<chunk>\n${chunk.slice(0, 800)}\n</chunk>\n\n` +
                    `First: Is this content time-sensitive? Reply <freshness>volatile</freshness> (changes rapidly, e.g. regulations, tech trends), ` +
                    `<freshness>evolving</freshness> (changes occasionally, e.g. research), or <freshness>stable</freshness> (rarely changes, e.g. history, math). ` +
                    `Then give a short (2-3 sentence) context that situates this chunk within the activeDocument. ` +
                    `Mention the document topic and what specific aspect this chunk covers.`;

                const rawPrefix = await this.generateContextPrefix(prompt);
                if (rawPrefix) {
                    // Extract freshness tag if present (FEATURE-2006)
                    const freshnessMatch = rawPrefix.match(/^<freshness>(volatile|evolving|stable)<\/freshness>\s*/);
                    const contextPrefix = freshnessMatch
                        ? rawPrefix.slice(freshnessMatch[0].length).trim()
                        : rawPrefix;
                    // Collect freshness classification per chunk
                    if (freshnessMatch) {
                        this.freshnessVotes.push(freshnessMatch[1] as 'volatile' | 'evolving' | 'stable');
                    }
                    enriched.push(contextPrefix ? `${contextPrefix}\n\n${chunk}` : chunk);
                } else {
                    enriched.push(chunk);
                }
            } catch {
                // Non-fatal: use original chunk without prefix
                enriched.push(chunk);
            }
        }
        return enriched;
    }

    /**
     * Store the note-level freshness class from per-chunk majority vote.
     * FEATURE-2006: zero additional cost -- piggybacks on enrichment.
     */
    private storeFreshnessClass(filePath: string, votes: Array<'volatile' | 'evolving' | 'stable'>): void {
        if (votes.length === 0) return;
        try {
            const db = this.knowledgeDB.getDB();
            // Majority vote
            const counts = { volatile: 0, evolving: 0, stable: 0 };
            for (const v of votes) counts[v]++;
            const winner = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])[0][0];
            db.run(
                'INSERT OR REPLACE INTO note_freshness (path, freshness_class, temporal_marker_count, classified_at) VALUES (?, ?, 0, ?)',
                [filePath, winner, new Date().toISOString()],
            );
        } catch {
            // Non-fatal: freshness is best-effort
        }
    }

    /**
     * Generate a context prefix using the configured contextual API handler.
     * Uses the same streaming pattern as chat titling (buildApiHandlerForModel).
     */
    private async generateContextPrefix(prompt: string): Promise<string | null> {
        if (!this.contextualApiHandler) return null;
        if (this.contextualApiDisabledReason) return null;

        const TIMEOUT_MS = 15_000;
        try {
            const resultPromise = (async () => {
                let result = '';
                for await (const chunk of this.contextualApiHandler!.createMessage(
                    'You generate short context descriptions for document chunks. Answer only with the context, no preamble.',
                    [{ role: 'user', content: prompt }],
                    [],
                )) {
                    if (this.cancelled) break;
                    if (chunk.type === 'text') result += chunk.text;
                }
                return result.trim();
            })();
            const abortPromise = this.abortController
                ? new Promise<never>((_, reject) => {
                    this.abortController!.signal.addEventListener('abort', () => reject(new Error('Build cancelled')), { once: true });
                })
                : new Promise<never>(() => {}); // never resolves
            const timeoutPromise = new Promise<string>((_, reject) =>
                window.setTimeout(() => reject(new Error('Context prefix timed out')), TIMEOUT_MS),
            );
            const trimmed = await Promise.race([resultPromise, abortPromise, timeoutPromise]);
            return trimmed.length > 10 ? trimmed : null;
        } catch (e) {
            // BUG-016: auth / credit / quota failures on the configured context model would
            // otherwise re-fire on every chunk of every rebuild. One warning, then disable.
            const msg = String((e as { message?: string })?.message ?? e ?? '');
            const statusCode = (e as { status?: number })?.status;
            const isPermanent = statusCode === 401 || statusCode === 402 || statusCode === 403
                || /credit balance is too low|insufficient.?quota|quota.?exceeded|invalid.?api.?key|api.?key.?not.?found|authentication.?failed/i.test(msg);
            if (isPermanent && !this.contextualApiDisabledReason) {
                this.contextualApiDisabledReason = msg || 'permanent provider error';
                console.warn(
                    `[SemanticIndex] Contextual retrieval paused for this session (context model returned a permanent error: ${this.contextualApiDisabledReason}). ` +
                        `Fix the configured context model in Settings > Embeddings, then reload Obsidian to resume.`,
                );
            } else {
                console.warn('[SemanticIndex] Context prefix generation failed:', e);
            }
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Batch embedding
    // -----------------------------------------------------------------------

    /**
     * Embed an array of texts via the configured API embedding model.
     * Sends batches of `embeddingBatchSize` texts per request (10-50x fewer API calls).
     */
    private async embedBatch(texts: string[]): Promise<Float32Array[]> {
        if (texts.length === 0) return [];
        if (!this.embeddingModel) {
            throw new Error('No embedding model configured.');
        }

        const results: Float32Array[] = [];
        for (let i = 0; i < texts.length; i += this.embeddingBatchSize) {
            if (this.cancelled) throw new Error('Build cancelled');
            const batch = texts.slice(i, i + this.embeddingBatchSize);
            const vectors = await this.embedBatchViaApiWithRetry(batch, this.embeddingModel);
            results.push(...vectors);
            if (i + this.embeddingBatchSize < texts.length) {
                await this.sleep(50);
            }
        }
        return results;
    }

    private async embedBatchViaApiWithRetry(
        texts: string[],
        model: CustomModel,
        maxRetries = 4,
    ): Promise<Float32Array[]> {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.embedBatchViaApi(texts, model);
            } catch (e: unknown) {
                // If build was cancelled, don't retry — bubble up immediately
                if (this.cancelled) throw e;
                const err = e as Record<string, unknown> | null;
                const status = err?.status ?? err?.statusCode;
                const msg = String((err?.message as string) ?? e ?? '');
                const isRateLimit =
                    status === 429 ||
                    msg.includes('429') ||
                    msg.toLowerCase().includes('rate limit');
                if (isRateLimit && attempt < maxRetries - 1) {
                    const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s
                    console.warn(`[SemanticIndex] Rate limited — retry in ${delay}ms`);
                    await this.sleep(delay);
                } else {
                    throw e;
                }
            }
        }
        throw new Error('[SemanticIndex] Max retries exceeded');
    }

    private async embedBatchViaApi(texts: string[], model: CustomModel): Promise<Float32Array[]> {
        // Azure uses requestUrl (deployment-based URL with api-key header)
        if (model.provider === 'azure') {
            return this.embedBatchViaRequestUrl(texts, model);
        }
        // All OpenAI-compatible providers use the OpenAI SDK
        // (requestUrl has issues with some providers like OpenRouter)
        return this.embedBatchViaSdk(texts, model);
    }

    /**
     * Embed via OpenAI SDK — works for OpenAI, OpenRouter, Ollama, LMStudio, custom.
     * The SDK handles HTTP correctly where requestUrl may fail.
     */
    private async embedBatchViaSdk(texts: string[], model: CustomModel): Promise<Float32Array[]> {
        const OpenAI = (await import('openai')).default;

        let baseURL: string;
        if (model.provider === 'openai') {
            baseURL = 'https://api.openai.com/v1';
        } else if (model.provider === 'openrouter') {
            baseURL = 'https://openrouter.ai/api/v1';
        } else if (model.provider === 'ollama' || model.provider === 'lmstudio') {
            const base = (
                model.baseUrl ||
                (model.provider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:11434')
            ).replace(/\/v1\/?$/, '').replace(/\/+$/, '');
            baseURL = `${base}/v1`;
        } else {
            const base = (model.baseUrl ?? '').replace(/\/+$/, '');
            baseURL = base.endsWith('/v1') ? base : `${base}/v1`;
        }

        const client = new OpenAI({
            apiKey: model.apiKey || 'unused',
            baseURL,
            dangerouslyAllowBrowser: true,
            timeout: 30_000,
        });

        console.debug(`[SemanticIndex] Embedding via SDK: ${model.provider} ${baseURL} model=${model.name} texts=${texts.length}`);

        const response = await client.embeddings.create({
            model: model.name,
            input: texts,
        });

        const sorted = response.data.sort((a, b) => a.index - b.index);
        return sorted.map((d) => new Float32Array(d.embedding));
    }

    /**
     * Embed via requestUrl — used for Azure (non-standard auth headers).
     */
    private async embedBatchViaRequestUrl(texts: string[], model: CustomModel): Promise<Float32Array[]> {
        const base = (model.baseUrl ?? '').replace(/\/+$/, '');
        const apiVersion = model.apiVersion ?? '2024-10-21';
        const url = `${base}/deployments/${model.name}/embeddings?api-version=${apiVersion}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (model.apiKey) headers['api-key'] = model.apiKey;
        const body = { input: texts };

        console.debug(`[SemanticIndex] Embedding via requestUrl: azure ${url} texts=${texts.length}`);
        const TIMEOUT_MS = 30_000;
        const timeoutPromise = new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error(`[SemanticIndex] API request timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS),
        );
        const abortPromise = this.abortController
            ? new Promise<never>((_, reject) => {
                this.abortController!.signal.addEventListener('abort', () => reject(new Error('Build cancelled')), { once: true });
            })
            : new Promise<never>(() => {});
        const res = await Promise.race([
            requestUrl({ url, method: 'POST', headers, body: JSON.stringify(body), throw: false }),
            timeoutPromise,
            abortPromise,
        ]);
        if (res.status !== 200) {
            const errText = (() => { try { return JSON.stringify(res.json).slice(0, 200); } catch { return ''; } })();
            throw new Error(`[SemanticIndex] Embedding API returned HTTP ${res.status}: ${errText}`);
        }

        const data: Array<{ embedding: number[]; index: number }> = res.json?.data;
        if (!data || !Array.isArray(data)) {
            throw new Error(`[SemanticIndex] Invalid embedding response: missing data array`);
        }
        data.sort((a, b) => a.index - b.index);
        return data.map((d) => new Float32Array(d.embedding));
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    // -----------------------------------------------------------------------
    // Checkpoint management (stored in KnowledgeDB checkpoint table)
    // -----------------------------------------------------------------------

    private saveCheckpointToDB(modelKey: string, docCount: number): void {
        this.knowledgeDB.setCheckpointValue('embeddingModel', modelKey);
        this.knowledgeDB.setCheckpointValue('chunkSize', String(this.chunkSize));
        this.knowledgeDB.setCheckpointValue('docCount', String(docCount));
        this.knowledgeDB.setCheckpointValue('builtAt', new Date().toISOString());
    }

    private modelKey(): string {
        if (!this.embeddingModel) return 'none';
        return `${this.embeddingModel.provider}:${this.embeddingModel.name}`;
    }

    // -----------------------------------------------------------------------
    // File reading (Markdown + PDF + Office documents + OCR images)
    // -----------------------------------------------------------------------

    private static readonly BINARY_DOCUMENT_EXTENSIONS = new Set(['pdf', 'pptx', 'potx', 'xlsx', 'docx']);
    private static readonly IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']);

    /**
     * Get the text-extractor plugin API (if installed).
     * Used for OCR on images — text-extractor handles Tesseract and caching.
     */
    private getTextExtractorApi(): { extractText: (file: unknown) => Promise<string>; canFileBeExtracted: (path: string) => boolean } | null {
        const app = (this.vault as unknown as { app?: { plugins?: { plugins?: Record<string, { api?: unknown }> } } }).app
            ?? (window as unknown as { app?: { plugins?: { plugins?: Record<string, { api?: unknown }> } } }).app;
        const api = app?.plugins?.plugins?.['text-extractor']?.api as
            { extractText: (file: unknown) => Promise<string>; canFileBeExtracted: (path: string) => boolean } | undefined;
        return api ?? null;
    }

    /**
     * Read a file's text content.
     * - Markdown/plaintext: uses vault.cachedRead (fast, cached)
     * - PDF/PPTX/XLSX/DOCX: extracts text via parseDocument (document-parsers module)
     * - Images: OCR via text-extractor plugin (if installed)
     */
    private async readFileContent(file: { path: string; extension: string }): Promise<string> {
        if (SemanticIndexService.BINARY_DOCUMENT_EXTENSIONS.has(file.extension)) {
            return this.extractDocumentText(file.path, file.extension);
        }
        // OCR for images via text-extractor companion plugin
        if (SemanticIndexService.IMAGE_EXTENSIONS.has(file.extension)) {
            return this.extractImageText(file.path);
        }
        // For all other types (md, txt, canvas, …) use the vault cache
        const vaultFile = this.vault.getFileByPath(file.path);
        if (!vaultFile) return '';
        return this.vault.cachedRead(vaultFile);
    }

    /**
     * Extract text from an image via the text-extractor plugin (OCR).
     * Returns empty string if the plugin is not installed or extraction fails.
     */
    private async extractImageText(filePath: string): Promise<string> {
        try {
            const api = this.getTextExtractorApi();
            if (!api) return '';
            const vaultFile = this.vault.getFileByPath(filePath);
            if (!vaultFile) return '';
            if (!api.canFileBeExtracted(filePath)) return '';
            const text = await api.extractText(vaultFile);
            return text?.trim() ?? '';
        } catch (e) {
            console.warn(`[SemanticIndex] Image OCR failed for ${filePath}:`, e);
            return '';
        }
    }

    /**
     * Extract plain text from a binary document (PDF, PPTX, XLSX, DOCX).
     * Delegates to the shared parseDocument function (document-parsers module).
     * Returns empty string on parse errors (circuit breaker for PDF-specific failures).
     */
    private async extractDocumentText(filePath: string, extension: string): Promise<string> {
        try {
            const basePath = (this.vault.adapter as import('obsidian').FileSystemAdapter).getBasePath?.() ?? '';
            const absPath = path.join(basePath, filePath);
            const buffer = await fs.promises.readFile(absPath);

            const { parseDocument } = await import('../document-parsers/parseDocument');
            const result = await parseDocument(buffer.buffer, extension);

            // OCR fallback for scanned PDFs (FEATURE-1905):
            // If pdfjs-dist found no text, try text-extractor plugin (Tesseract OCR)
            if (extension === 'pdf' && (!result.text || result.text.includes('No extractable text found'))) {
                const ocrText = await this.extractImageText(filePath);
                if (ocrText && ocrText.length > 10) {
                    console.debug(`[SemanticIndex] PDF OCR fallback for ${filePath}: ${ocrText.length} chars`);
                    return ocrText;
                }
            }

            return result.text;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('PasswordException') || msg.includes('InvalidPDFException')) {
                return '';
            }
            // Corrupted / non-zip-but-zip-extension files (broken .xlsx,
            // truncated .docx) throw "Can't find end of central directory"
            // from jszip. The user can't index a file that is structurally
            // broken; log at debug so the console stays clean and the
            // index build doesn't appear to "fail".
            const isCorruptedArchive =
                /end of central directory|invalid zip|corrupted/i.test(msg);
            if (isCorruptedArchive) {
                console.debug(
                    `[SemanticIndex] Skipping corrupted document ${filePath}: ${msg}`,
                );
                return '';
            }
            console.warn(`[SemanticIndex] Document extraction failed for ${filePath}:`, msg);
            return '';
        }
    }

    // -----------------------------------------------------------------------
    // Chunking
    // -----------------------------------------------------------------------

    /**
     * Split Markdown text into semantically meaningful chunks.
     *
     * Strategy (matches Obsidian Copilot's approach):
     *  1. Strip YAML frontmatter
     *  2. If whole note fits → single chunk (no splitting needed)
     *  3. Split at Markdown headings (##, ###, …)
     *  4. For oversized sections: split at paragraph boundaries (\n\n)
     *  5. For oversized paragraphs: hard split at maxChars
     */
    private splitIntoChunks(text: string, maxChars: number): string[] {
        // Extract YAML frontmatter content — keep the key:value lines so that
        // IDs, tags, and other frontmatter fields are searchable, but discard
        // the --- delimiters which carry no semantic meaning.
        let frontmatterContent = '';
        const bodyText = text.replace(/^---\n([\s\S]*?)\n---\n?/, (_, fm: string) => {
            frontmatterContent = fm.trim();
            return '';
        }).trim();

        // Prepend frontmatter (if any) to the body so IDs/tags appear in chunk 0
        const stripped = frontmatterContent ? `${frontmatterContent}\n\n${bodyText}` : bodyText;
        if (!stripped) return [];
        if (stripped.length <= maxChars) return [stripped];

        // Split at heading boundaries (keep heading with its content)
        const sections = stripped.split(/(?=^#{1,6} )/m);
        const result: string[] = [];

        for (const section of sections) {
            const trimmed = section.trim();
            if (!trimmed) continue;

            if (trimmed.length <= maxChars) {
                result.push(trimmed);
                continue;
            }

            // Section too large → split on paragraphs
            const paragraphs = trimmed.split(/\n\n+/);
            let current = '';
            for (const para of paragraphs) {
                if (!para.trim()) continue;
                if (current && current.length + para.length + 2 > maxChars) {
                    result.push(current.trim());
                    current = '';
                }
                if (para.length > maxChars) {
                    // Hard-split giant paragraph at word boundaries
                    if (current.trim()) result.push(current.trim());
                    current = '';
                    let i = 0;
                    while (i < para.length) {
                        let chunk = para.slice(i, i + maxChars);
                        if (i + maxChars < para.length) {
                            const b = Math.max(chunk.lastIndexOf(' '), chunk.lastIndexOf('\n'));
                            if (b > maxChars * 0.7) chunk = chunk.slice(0, b);
                        }
                        const t = chunk.trim();
                        if (t) result.push(t);
                        i += chunk.length || 1;
                    }
                } else {
                    current = current ? current + '\n\n' + para : para;
                }
            }
            if (current.trim()) result.push(current.trim());
        }

        const filtered = result.filter((c) => c.length > 0);

        // Add overlap: prepend the last 10% of the previous chunk to each
        // subsequent chunk so content at boundaries is not lost.
        const OVERLAP = Math.round(maxChars * 0.1);
        return filtered.map((chunk, i) => {
            if (i === 0) return chunk;
            const prev = filtered[i - 1];
            const tail = prev.slice(-OVERLAP).trim();
            if (!tail) return chunk;
            // Avoid duplicating content if the chunk already starts with the tail
            if (chunk.startsWith(tail)) return chunk;
            return `…${tail}\n\n${chunk}`;
        });
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
