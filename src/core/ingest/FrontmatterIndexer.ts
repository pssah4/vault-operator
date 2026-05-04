/**
 * FrontmatterIndexer -- Per-Note Hook fuer note_summaries +
 * frontmatter_properties Mirror.
 *
 * Backs FEAT-15-09, FEAT-15-10, FEAT-19-09. Liest pro Note das
 * Frontmatter, spiegelt Properties in die DB. Wenn `Zusammenfassung`
 * existiert: uebernimmt sie in note_summaries. Wenn `autoSummary.enabled`
 * und keine Summary vorhanden: optional via SummaryGenerator generieren
 * (wird hier per Constructor-Injection als optional Hook uebergeben,
 * damit der Indexer kein direktes LLM-Coupling hat).
 *
 * Nicht-blockierend: Failures pro Note werden geloggt, anderen Notes
 * laufen weiter. Idempotent ueber mtime: Re-Index derselben Note ohne
 * Aenderung loest keinen LLM-Call aus.
 */

import { TFile, type App } from 'obsidian';
import type { NoteSummaryStore } from '../knowledge/NoteSummaryStore';
import type { FrontmatterPropertyStore } from '../knowledge/FrontmatterPropertyStore';
import type { MemorySourceStore } from '../knowledge/MemorySourceStore';

/**
 * FEAT-03-25 / ADR-109: Bridge-Hook fuer Vault-zu-Memory-Pfad.
 * Plugin uebergibt diesen Callback. Wird aufgerufen bei jeder
 * indexierten Note die `memory-source: true` im Frontmatter traegt
 * ODER bereits in MemorySourceStore registriert ist. Der Hook
 * triggert die SingleCallProcessor-basierte Fact-Extraction.
 * Best-Effort: Hook-Fehler blockieren niemals den Indexer-Pfad.
 */
export type MemorySourceHookFn = (input: {
    file: TFile;
    /** True wenn Frontmatter den Marker hat. False wenn nur via Tool/Settings registriert. */
    fromFrontmatter: boolean;
}) => Promise<void> | void;

/**
 * Optional callback fuer Auto-Summary-Generation. Wird vom Plugin
 * mit einem konkreten LLM-Aufruf gefuellt (siehe SummaryGenerator
 * oder analoges Modul). Wenn nicht uebergeben: Indexer macht keine
 * Auto-Generation, nur Frontmatter-Read.
 */
export type SummaryGeneratorFn = (input: {
    notePath: string;
    content: string;
}) => Promise<{ summary: string; modelUsed: string } | null>;

export interface FrontmatterIndexerOptions {
    /** Default true: Frontmatter-Properties immer in frontmatter_properties spiegeln. */
    syncProperties?: boolean;
    /** Default false: ignore notes outside specific folders. */
    folderAllowList?: string[];
    /** Default false: nur generieren wenn explizit enabled (Setting-gated). */
    autoSummaryEnabled?: boolean;
    /** Optional Summary-Generator-Hook. Wenn null: kein Generate. */
    summaryGenerator?: SummaryGeneratorFn;
    /**
     * FEAT-03-25 / ADR-109: optional MemorySourceStore + Hook fuer
     * Vault-zu-Memory-Bruecke. Wenn beide gesetzt: Indexer
     * a) erkennt `memory-source: true`-Frontmatter-Marker,
     *    upserted in MemorySourceStore (markerSource='frontmatter');
     * b) ruft den memorySourceHook fuer markierte Notes -- das Plugin
     *    leitet den Aufruf an SingleCallProcessor weiter.
     */
    memorySourceStore?: MemorySourceStore;
    memorySourceHook?: MemorySourceHookFn;
}

export interface IndexingResult {
    noteIndexed: number;
    summariesUpdated: number;
    summariesGenerated: number;
    propertiesMirrored: number;
    skipped: number;
    errors: number;
}

export class FrontmatterIndexer {
    constructor(
        private readonly app: App,
        private readonly noteSummaryStore: NoteSummaryStore,
        private readonly frontmatterPropertyStore: FrontmatterPropertyStore,
        private readonly options: FrontmatterIndexerOptions = {},
    ) {}

    /**
     * Indexiert eine einzelne Note. Idempotent ueber mtime.
     * Returns 'skipped' wenn Note unveraendert seit letztem Index.
     */
    async indexNote(file: TFile): Promise<{
        summaryUpdated: boolean;
        summaryGenerated: boolean;
        propertiesMirrored: boolean;
        skipped: boolean;
        error?: string;
    }> {
        if (!this.isAllowed(file.path)) {
            return { summaryUpdated: false, summaryGenerated: false, propertiesMirrored: false, skipped: true };
        }

        const sourceMtime = file.stat.mtime;
        const cached = this.noteSummaryStore.get(file.path);
        const mtimeUnchanged = cached !== null && cached.sourceMtime === sourceMtime;

        try {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter ?? {};

            // Properties immer spiegeln (cheap, kein LLM-Call).
            let propsWritten = false;
            if (this.options.syncProperties !== false) {
                this.mirrorProperties(file.path, fm);
                propsWritten = true;
            }

            // FEAT-03-25 / ADR-109: Memory-Source-Bridge. Best-effort,
            // separater try/catch -- Hook-Fehler blockieren den Indexer
            // niemals (Vault-Indexing bleibt synchron-stabil).
            this.maybeRouteMemorySource(file, fm);

            // Summary-Logik: Frontmatter "Zusammenfassung" hat Vorrang.
            const fmSummary = readFrontmatterSummary(fm);
            if (fmSummary && (cached === null || cached.summary !== fmSummary || !mtimeUnchanged)) {
                this.noteSummaryStore.upsert(file.path, fmSummary, 'frontmatter', sourceMtime);
                return {
                    summaryUpdated: true,
                    summaryGenerated: false,
                    propertiesMirrored: propsWritten,
                    skipped: false,
                };
            }

            // Wenn Summary vorhanden und mtime unveraendert: skip.
            if (cached && mtimeUnchanged) {
                return {
                    summaryUpdated: false,
                    summaryGenerated: false,
                    propertiesMirrored: propsWritten,
                    skipped: true,
                };
            }

            // Auto-Generate-Pfad (Setting-gated).
            if (this.options.autoSummaryEnabled && this.options.summaryGenerator) {
                const content = await this.app.vault.cachedRead(file);
                const generated = await this.options.summaryGenerator({
                    notePath: file.path,
                    content,
                });
                if (generated) {
                    this.noteSummaryStore.upsert(file.path, generated.summary, generated.modelUsed, sourceMtime);
                    return {
                        summaryUpdated: false,
                        summaryGenerated: true,
                        propertiesMirrored: propsWritten,
                        skipped: false,
                    };
                }
            }

            return {
                summaryUpdated: false,
                summaryGenerated: false,
                propertiesMirrored: propsWritten,
                skipped: false,
            };
        } catch (err) {
            console.warn(`[FrontmatterIndexer] failed for ${file.path}:`, err);
            return {
                summaryUpdated: false,
                summaryGenerated: false,
                propertiesMirrored: false,
                skipped: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /** Bulk-Indexing-Helper. Sequentiell um LLM-Rate-Limits zu schonen. */
    async indexNotes(files: TFile[]): Promise<IndexingResult> {
        const result: IndexingResult = {
            noteIndexed: 0,
            summariesUpdated: 0,
            summariesGenerated: 0,
            propertiesMirrored: 0,
            skipped: 0,
            errors: 0,
        };
        for (const file of files) {
            const r = await this.indexNote(file);
            result.noteIndexed++;
            if (r.summaryUpdated) result.summariesUpdated++;
            if (r.summaryGenerated) result.summariesGenerated++;
            if (r.propertiesMirrored) result.propertiesMirrored++;
            if (r.skipped) result.skipped++;
            if (r.error) result.errors++;
        }
        return result;
    }

    private isAllowed(path: string): boolean {
        const allow = this.options.folderAllowList;
        if (!allow || allow.length === 0) return true;
        return allow.some((folder) => path.startsWith(folder));
    }

    /**
     * FEAT-03-25: Best-effort Bridge-Hook. Drei Faelle:
     *  - Note hat memory-source Marker UND ist NICHT registriert -> upsert + Hook
     *  - Note hat memory-source Marker UND ist registriert (markDirty bei modify)
     *  - Note ist registriert (via Tool/Settings) aber Frontmatter-Marker fehlt
     *    -> Hook trotzdem feuern (markerSource bleibt 'agent-tool'/'settings-list')
     */
    private maybeRouteMemorySource(file: TFile, fm: Record<string, unknown>): void {
        const memStore = this.options.memorySourceStore;
        const hook = this.options.memorySourceHook;
        if (!memStore && !hook) return;

        const fromFrontmatter = readMemorySourceMarker(fm);
        try {
            const isRegistered = memStore?.isMemorySource(file.path) ?? false;

            if (fromFrontmatter && memStore && !isRegistered) {
                memStore.upsert(file.path, 'frontmatter');
            } else if (fromFrontmatter && memStore && isRegistered) {
                memStore.markDirty(file.path);
            }

            if ((fromFrontmatter || isRegistered) && hook) {
                void Promise.resolve(hook({ file, fromFrontmatter })).catch((err) => {
                    console.warn(`[FrontmatterIndexer] memory-source hook failed for ${file.path}:`, err);
                });
            }
        } catch (err) {
            console.warn(`[FrontmatterIndexer] memory-source bridge failed for ${file.path}:`, err);
        }
    }

    private mirrorProperties(notePath: string, fm: Record<string, unknown>): void {
        const out: Record<string, string | string[]> = {};
        for (const [name, value] of Object.entries(fm)) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'string') {
                out[name] = value;
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                out[name] = String(value);
            } else if (Array.isArray(value)) {
                out[name] = value.map((v) => String(v));
            } else if (typeof value === 'object') {
                // Skip nested objects (Properties sind flach in Obsidian).
                continue;
            }
        }
        this.frontmatterPropertyStore.replaceForNote(notePath, out);
    }
}

/** Liest "Zusammenfassung" oder "summary" aus Frontmatter. */
export function readFrontmatterSummary(fm: Record<string, unknown>): string | null {
    const candidates = ['Zusammenfassung', 'zusammenfassung', 'summary', 'Summary'];
    for (const key of candidates) {
        const value = fm[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}

/**
 * FEAT-03-25: liest den `memory-source: true` Frontmatter-Marker.
 * Akzeptiert true, "true", "yes", 1 als wahr.
 */
export function readMemorySourceMarker(fm: Record<string, unknown>): boolean {
    const candidates = ['memory-source', 'memory_source', 'memorySource'];
    for (const key of candidates) {
        const value = fm[key];
        if (value === true || value === 1) return true;
        if (typeof value === 'string' && (value === 'true' || value === 'yes')) return true;
    }
    return false;
}
