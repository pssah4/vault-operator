/**
 * RerankerService -- Local cross-encoder reranking via transformers.js (WASM).
 *
 * Uses Xenova/ms-marco-MiniLM-L-6-v2 to re-score query+document pairs.
 * Pure JS + WASM — no native addon, no electron-rebuild, no external API calls.
 * Model is downloaded from HuggingFace Hub on first use and cached locally.
 *
 * ADR-052: Local Reranker Integration (transformers.js)
 * FEATURE-1504: Local Reranking
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RerankCandidate {
    path: string;
    text: string;
    score: number;
}

export interface RerankResult extends RerankCandidate {
    rerankScore: number;
}

// ---------------------------------------------------------------------------
// Transformers.js dynamic types (loaded at runtime via CDN)
// ---------------------------------------------------------------------------

/** Tokenizer callable returned by AutoTokenizer.from_pretrained() */
type TokenizerFn = (query: string, options: { text_pair: string; padding: boolean; truncation: boolean }) => Promise<Record<string, unknown>>;
/** Model callable returned by AutoModelForSequenceClassification.from_pretrained() */
type ModelFn = (inputs: Record<string, unknown>) => Promise<{ logits: { data: Float32Array } }>;

// ---------------------------------------------------------------------------
// RerankerService
// ---------------------------------------------------------------------------

const MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2';

export class RerankerService {
    private model: ModelFn | null = null;
    private tokenizer: TokenizerFn | null = null;
    private _loading = false;
    private _loaded = false;
    private _failed = false;
    private readonly plugin: import('obsidian').Plugin;

    constructor(plugin: import('obsidian').Plugin) {
        this.plugin = plugin;
    }

    /** Whether the model is loaded and ready for inference. */
    get isLoaded(): boolean { return this._loaded; }

    /** Whether the model is currently being loaded. */
    get isLoading(): boolean { return this._loading; }

    /**
     * Load the cross-encoder model and tokenizer.
     * Downloads from HuggingFace Hub on first call (~23MB), cached locally after.
     * Typically takes 2-5s on first load, <1s on subsequent loads (cached).
     */
    async loadModel(): Promise<void> {
        if (this._loaded || this._loading || this._failed) return;
        this._loading = true;

        try {
            // Force transformers.js onto the web/onnxruntime-web branch.
            // Electron exposes process.versions.node, so transformers'
            // IS_NODE_ENV check is true and it would otherwise try to load
            // the native onnxruntime-node binding (which fails in the
            // Obsidian sandbox). Pre-populating
            // globalThis[Symbol.for("onnxruntime")] tips the very first
            // branch of its ONNX selection chain so the IS_NODE_ENV check
            // is never reached.
            const ortSymbol = Symbol.for('onnxruntime');
            if (!(ortSymbol in (globalThis as Record<symbol, unknown>))) {
                // onnxruntime-web is a transitive dep of @huggingface/transformers.
                // Subpath `/webgpu` has no published .d.ts so we silence the
                // import-resolution error and rely on the runtime resolver.
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore -- runtime subpath, no type declarations
                const ort = await import('onnxruntime-web/webgpu');
                (globalThis as Record<symbol, unknown>)[ortSymbol] = ort;
            }

            const { AutoModelForSequenceClassification, AutoTokenizer, env } = await import('@huggingface/transformers');

            // ONNX WASM is an optional download. Settings > Knowledge >
            // Reranker has an Install button that fetches the binary
            // from the plugin's GitHub release into the vault. If the
            // user hasn't installed it, the reranker stays disabled --
            // semantic search still works without the rerank step.
            const onnxWasm = env.backends?.onnx?.wasm;
            if (!onnxWasm) {
                console.warn(
                    '[Reranker] ONNX WASM backend not available even after onnxruntime-web pre-load. ' +
                    'Reranker disabled, semantic search continues without re-ranking. ' +
                    'Please file a bug report.',
                );
                this._failed = true;
                return;
            }

            const { OptionalAssetManager, buildRerankerSpec } = await import('../assets/OptionalAssetManager');
            const { RERANKER_WASM_SHA256 } = await import('../assets/assetHashes');
            const manager = new OptionalAssetManager(this.plugin);
            const spec = buildRerankerSpec(this.plugin.manifest.version, RERANKER_WASM_SHA256);
            const wasmBinary = await manager.load(spec);
            if (!wasmBinary) {
                console.warn('[Reranker] ONNX asset not installed -- run Settings > Knowledge > Reranker > Install (12 MB)');
                this._failed = true;
                return;
            }
            onnxWasm.wasmBinary = wasmBinary;
            onnxWasm.numThreads = Math.min(4, navigator?.hardwareConcurrency ?? 4);
            console.debug(`[Reranker] Loaded ONNX WASM from vault asset (${Math.round(wasmBinary.byteLength / 1024 / 1024)} MB)`);

            console.debug(`[Reranker] Loading model ${MODEL_ID}...`);
            const startTime = Date.now();

            this.tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID) as unknown as TokenizerFn;
            this.model = await AutoModelForSequenceClassification.from_pretrained(MODEL_ID, {
                dtype: 'q8',
                device: 'wasm',
            });

            this._loaded = true;
            console.debug(`[Reranker] Model loaded in ${Date.now() - startTime}ms`);
        } catch (e) {
            console.warn('[Reranker] Failed to load model (will not retry):', e);
            this._loaded = false;
            this._failed = true;
        } finally {
            this._loading = false;
        }
    }

    /** Unload the model to free memory. */
    unload(): void {
        this.model = null;
        this.tokenizer = null;
        this._loaded = false;
    }

    /**
     * Rerank candidates using the cross-encoder model.
     * Each candidate is scored jointly with the query (not independently).
     *
     * @param query - The search query
     * @param candidates - Candidates from previous pipeline stages
     * @param topK - Max results to return (default: all)
     * @returns Candidates sorted by rerankScore (descending)
     */
    async rerank(query: string, candidates: RerankCandidate[], topK?: number): Promise<RerankResult[]> {
        if (!this._loaded) {
            // Lazy load on first rerank call
            await this.loadModel();
            if (!this._loaded) return candidates.map(c => ({ ...c, rerankScore: c.score }));
        }

        if (candidates.length === 0) return [];

        const startTime = Date.now();

        try {
            const results: RerankResult[] = [];

            if (!this.tokenizer || !this.model) throw new Error('Reranker model not loaded');

            for (const candidate of candidates) {
                // Truncate long texts to fit model's max sequence length (512 tokens)
                const text = candidate.text.slice(0, 1500);
                const inputs = await this.tokenizer(query, { text_pair: text, padding: true, truncation: true });
                const output = await this.model(inputs);

                // Extract logit and convert to score via sigmoid
                const logit = output.logits.data[0];
                const rerankScore = 1 / (1 + Math.exp(-logit)); // sigmoid

                results.push({ ...candidate, rerankScore });
            }

            results.sort((a, b) => b.rerankScore - a.rerankScore);

            console.debug(`[Reranker] Reranked ${candidates.length} candidates in ${Date.now() - startTime}ms`);

            return topK ? results.slice(0, topK) : results;
        } catch (e) {
            console.warn('[Reranker] Reranking failed, returning original order:', e);
            return candidates.map(c => ({ ...c, rerankScore: c.score }));
        }
    }
}
