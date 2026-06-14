/* eslint-disable @typescript-eslint/no-unsafe-assignment -- File-level disable: interacts with the untyped transformers.js/onnxruntime SDK whose runtime model/tokenizer/tensor outputs cannot be statically typed. Inputs (query/documents) are validated by callers; outputs (logits/scores) are coerced to plain numbers before crossing the boundary. */
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

/**
 * Tokenizer callable returned by AutoTokenizer.from_pretrained().
 * transformers.js v4 accepts arrays of query-document pairs, which lets us
 * batch the cross-encoder forward passes (retrieval wave 1, item 6).
 */
export type TokenizerFn = (texts: string[], options: { text_pair: string[]; padding: boolean; truncation: boolean }) => Promise<Record<string, unknown>>;
/** Model callable returned by AutoModelForSequenceClassification.from_pretrained() */
export type ModelFn = (inputs: Record<string, unknown>) => Promise<{ logits: { data: Float32Array; dims?: number[] } }>;

// ---------------------------------------------------------------------------
// RerankerService
// ---------------------------------------------------------------------------

const MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2';

/**
 * Options for AutoModelForSequenceClassification.from_pretrained().
 *
 * device MUST be 'auto', not 'wasm': we hand transformers.js a custom ONNX
 * runtime via globalThis[Symbol.for('onnxruntime')], and in that branch
 * transformers never populates its supportedDevices list. 'wasm' then throws
 * 'Unsupported device: "wasm". Should be one of: .' while 'auto' returns the
 * (empty) list without throwing. The wasm execution provider is instead
 * pinned explicitly through session_options.executionProviders, which
 * transformers passes through untouched (session_options.executionProviders
 * is only defaulted when absent).
 *
 * Exported so the regression test can pin this contract without loading
 * the real WASM backend.
 */
export const RERANKER_MODEL_OPTIONS = {
    dtype: 'q8',
    device: 'auto',
    session_options: { executionProviders: ['wasm'] },
} as const;

/** Query-document pairs scored per cross-encoder forward pass (bounds WASM memory). */
const RERANK_BATCH_SIZE = 8;

/**
 * Backoff windows after consecutive failures: 60s, then 300s, then 1800s
 * (capped). A successful rerank resets the counter back to the first tier.
 * Replaces the old permanent `_failed` flag so one transient WASM init
 * failure no longer disables reranking until plugin reload.
 */
const BACKOFF_WINDOWS_MS = [60_000, 300_000, 1_800_000];

export class RerankerService {
    private model: ModelFn | null = null;
    private tokenizer: TokenizerFn | null = null;
    private _loading = false;
    private _loaded = false;
    private _failureCount = 0;
    private _lastFailureAt: number | null = null;
    private readonly now: () => number;
    private readonly plugin: import('obsidian').Plugin;

    constructor(plugin: import('obsidian').Plugin, now: () => number = () => Date.now()) {
        this.plugin = plugin;
        this.now = now;
    }

    /** Whether the model is loaded and ready for inference. */
    get isLoaded(): boolean { return this._loaded; }

    /** Whether the model is currently being loaded. */
    get isLoading(): boolean { return this._loading; }

    /**
     * Whether the reranker is inside a failure backoff window. While true,
     * loadModel() is a no-op and rerank() passes candidates through.
     */
    get isInBackoff(): boolean {
        if (this._failureCount === 0 || this._lastFailureAt === null) return false;
        const idx = Math.min(this._failureCount, BACKOFF_WINDOWS_MS.length) - 1;
        return this.now() - this._lastFailureAt < BACKOFF_WINDOWS_MS[idx];
    }

    private registerFailure(): void {
        this._failureCount += 1;
        this._lastFailureAt = this.now();
    }

    private registerSuccess(): void {
        this._failureCount = 0;
        this._lastFailureAt = null;
    }

    /**
     * Load the cross-encoder model and tokenizer.
     * Downloads from HuggingFace Hub on first call (~23MB), cached locally after.
     * Typically takes 2-5s on first load, <1s on subsequent loads (cached).
     * Failures arm a backoff window (60s/300s/1800s) instead of disabling
     * the reranker permanently.
     */
    async loadModel(): Promise<void> {
        if (this._loaded || this._loading || this.isInBackoff) return;
        this._loading = true;

        try {
            const backend = await this.initBackend();
            if (!backend) {
                this.registerFailure();
                return;
            }
            this.tokenizer = backend.tokenizer;
            this.model = backend.model;
            this._loaded = true;
        } catch (e) {
            console.warn('[Reranker] Failed to load model (will retry after backoff):', e);
            this._loaded = false;
            this.registerFailure();
        } finally {
            this._loading = false;
        }
    }

    /**
     * Create the tokenizer + model backend. Separated from loadModel() so
     * the state machine (loading flag, backoff bookkeeping) can be tested
     * with a stubbed backend. Returns null when an optional prerequisite is
     * missing (warning already logged); throws on unexpected errors.
     */
    protected async initBackend(): Promise<{ tokenizer: TokenizerFn; model: ModelFn } | null> {
        // Force transformers.js onto the web/onnxruntime-web branch.
        // Electron exposes process.versions.node, so transformers'
        // IS_NODE_ENV check is true and it would otherwise try to load
        // the native onnxruntime-node binding (which fails in the
        // Obsidian sandbox). Pre-populating the onnxruntime symbol on
        // the global object tips the first branch of transformers'
        // ONNX selection chain so the IS_NODE_ENV check is never
        // reached. In Electron `window` IS the global object, so the
        // symbol is visible via `globalThis[Symbol.for("onnxruntime")]`
        // which is what transformers actually reads (review-bot Tier 3
        // prefers `window` over the literal globalThis reference).
        const ortSymbol = Symbol.for('onnxruntime');
        const globalSlot = window as unknown as Record<symbol, unknown>;
        if (!(ortSymbol in globalSlot)) {
            // onnxruntime-web is a transitive dep of @huggingface/transformers.
            // Subpath `/wasm` resolves to dist/ort.wasm.bundle.min.mjs whose
            // inlined emscripten glue pairs with the plain
            // ort-wasm-simd-threaded.wasm we ship as the pinned vault asset
            // (the /webgpu bundle pairs with the asyncify variant instead and
            // would reject our binary). It also registers only the cpu/wasm
            // backends, which is all the reranker needs. The subpath has no
            // resolvable .d.ts under moduleResolution=node, so we silence the
            // import-resolution error and rely on the runtime resolver.
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- runtime subpath, no type declarations resolvable for /wasm
            // @ts-ignore -- runtime subpath, no type declarations
            const ort = await import('onnxruntime-web/wasm');
            globalSlot[ortSymbol] = ort;
        }

        const { AutoModelForSequenceClassification, AutoTokenizer, env } = await import('@huggingface/transformers');

        // Keep the vault-provided wasmBinary authoritative: with the default
        // useWasmCache=true, transformers' ensureWasmLoaded() would download
        // the asyncify binary from the jsdelivr CDN and OVERWRITE the
        // wasmBinary we set below (also an undeclared network fetch, which
        // breaks offline use and review-bot rules). Disabling the cache
        // short-circuits that path entirely.
        env.useWasmCache = false;

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
            return null;
        }

        const { OptionalAssetManager, buildRerankerSpec } = await import('../assets/OptionalAssetManager');
        const { RERANKER_WASM_SHA256 } = await import('../assets/assetHashes');
        const manager = new OptionalAssetManager(this.plugin);
        const spec = buildRerankerSpec(this.plugin.manifest.version, RERANKER_WASM_SHA256);
        const wasmBinary = await manager.load(spec);
        if (!wasmBinary) {
            console.warn('[Reranker] ONNX asset not installed -- run Settings > Knowledge > Reranker > Install (12 MB)');
            return null;
        }
        onnxWasm.wasmBinary = wasmBinary;
        // transformers auto-sets wasmPaths to jsdelivr CDN URLs of the
        // ASYNCIFY build at import time. ORT treats wasmPaths.mjs as a glue
        // override and would import that CDN script instead of the plain
        // glue embedded in the injected /wasm bundle (mismatching our plain
        // wasmBinary and adding an undeclared network fetch). Clearing the
        // paths keeps the embedded glue plus the vault binary authoritative.
        onnxWasm.wasmPaths = undefined;
        // Single-threaded on purpose. The threaded build
        // (ort-wasm-simd-threaded.wasm) spawns pthread Web Workers that each
        // need to resolve the ORT loader script URL. In the bundled Electron
        // renderer, with wasmPaths cleared and no document.currentScript /
        // import.meta.url, that URL cannot be determined and worker spawn
        // throws "cannot determine the script source URL". numThreads=1 runs
        // the same binary on the main thread using the provided wasmBinary --
        // no workers, no URL resolution. A cross-encoder over ~20 candidates
        // does not need threads.
        onnxWasm.numThreads = 1;
        console.debug(`[Reranker] Loaded ONNX WASM from vault asset (${Math.round(wasmBinary.byteLength / 1024 / 1024)} MB)`);

        console.debug(`[Reranker] Loading model ${MODEL_ID}...`);
        const startTime = Date.now();

        const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID) as unknown as TokenizerFn;
        const model = await AutoModelForSequenceClassification.from_pretrained(MODEL_ID, RERANKER_MODEL_OPTIONS);

        console.debug(`[Reranker] Model loaded in ${Date.now() - startTime}ms`);
        return { tokenizer, model };
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
     * Pairs are scored in batched forward passes (RERANK_BATCH_SIZE per
     * call). Always fail-open: any failure returns the candidates in their
     * original order with rerankScore mirroring the fusion score.
     *
     * @param query - The search query
     * @param candidates - Candidates from previous pipeline stages
     * @param topK - Max results to return (default: all)
     * @returns Candidates sorted by rerankScore (descending); the original
     *          fusion score stays untouched in the score field
     */
    async rerank(query: string, candidates: RerankCandidate[], topK?: number): Promise<RerankResult[]> {
        if (candidates.length === 0) return [];

        const passThrough = (): RerankResult[] => candidates.map(c => ({ ...c, rerankScore: c.score }));

        // Inside a failure backoff window the reranker is unavailable,
        // even when a model instance is still loaded (a broken WASM state
        // would otherwise fail 20 forward passes per search).
        if (this.isInBackoff) return passThrough();

        if (!this._loaded) {
            // Lazy load on first rerank call
            await this.loadModel();
            if (!this._loaded) return passThrough();
        }

        const startTime = Date.now();

        try {
            if (!this.tokenizer || !this.model) throw new Error('Reranker model not loaded');

            // Truncate long texts to fit model's max sequence length (512 tokens)
            const texts = candidates.map(c => c.text.slice(0, 1500));
            const rerankScores: number[] = [];

            // Batched cross-encoder scoring: the transformers.js tokenizer
            // accepts arrays of query-document pairs, so we score chunks of
            // RERANK_BATCH_SIZE pairs per forward pass instead of one pass
            // per candidate. Chunking bounds peak WASM memory.
            for (let i = 0; i < texts.length; i += RERANK_BATCH_SIZE) {
                const batch = texts.slice(i, i + RERANK_BATCH_SIZE);
                const queries = new Array<string>(batch.length).fill(query);
                const inputs = await this.tokenizer(queries, { text_pair: batch, padding: true, truncation: true });
                const output = await this.model(inputs);

                // One logits row per pair. The cross-encoder has a single
                // relevance label, but the row stride is derived defensively
                // from dims (fallback: flat length / batch size).
                const data = output.logits.data;
                const stride = output.logits.dims?.[1] ?? Math.max(1, Math.floor(data.length / batch.length));
                for (let j = 0; j < batch.length; j++) {
                    const logit = data[j * stride];
                    rerankScores.push(1 / (1 + Math.exp(-logit))); // sigmoid
                }
            }

            const results: RerankResult[] = candidates.map((c, i) => ({ ...c, rerankScore: rerankScores[i] }));
            results.sort((a, b) => b.rerankScore - a.rerankScore);

            this.registerSuccess();
            console.debug(`[Reranker] Reranked ${candidates.length} candidates in ${Date.now() - startTime}ms`);

            return topK ? results.slice(0, topK) : results;
        } catch (e) {
            this.registerFailure();
            console.warn('[Reranker] Reranking failed, returning original order:', e);
            return passThrough();
        }
    }
}
/* eslint-enable -- end of file-level disable for transformers.js/onnxruntime boundary code */
