/**
 * InlineWebLookup -- one-shot web search for the inline Lookup-Action (EPIC-33).
 *
 * Wraps the project's existing WebSearchProvider (Brave / Tavily) so
 * the inline action can fall back to the web when the vault has
 * insufficient coverage. NO AgentTask, NO tool registry, NO subtask.
 *
 * Honors the same privacy gates as the WebSearchTool:
 *  - settings.webTools.enabled
 *  - settings.webTools.provider in {'brave', 'tavily'}
 *  - API key present for the picked provider
 * Any gate failing -> search() returns [] (caller treats as web-unavailable).
 *
 * Audit reference: edgesAudit.webTools "non-tool callers (e.g. the
 * IMP-20-06-01 FreshnessVerifier web pass) can reuse the same
 * provider plumbing without going through the agent tool loop."
 */

import {
    searchByProvider,
    type WebSearchProviderName,
    type WebSearchResult,
} from '../../tools/web/WebSearchProvider';

export interface WebLookupResult {
    title: string;
    url: string;
    snippet: string;
    /** Synthetic rank-based score for sort stability. */
    score: number;
}

export interface WebToolsSettingsShape {
    enabled: boolean;
    provider: 'brave' | 'tavily' | 'none';
    braveApiKey: string;
    tavilyApiKey: string;
}

/** Hard limits to keep one Lookup-action bounded (AUDIT-EPIC-33 H-03). */
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_SNIPPET_CHARS = 500;
const MAX_TITLE_CHARS = 200;
const MAX_URL_CHARS = 500;

export interface InlineWebLookupOptions {
    /** Reads the live webTools settings on every call. */
    getWebSettings: () => WebToolsSettingsShape;
    /** Injectable provider call for unit tests. */
    fetchProvider?: typeof searchByProvider;
    /** Optional override of the per-call timeout (ms). */
    timeoutMs?: number;
}

export class InlineWebLookup {
    private readonly getWebSettings: () => WebToolsSettingsShape;
    private readonly fetchProvider: typeof searchByProvider;
    private readonly timeoutMs: number;

    constructor(options: InlineWebLookupOptions) {
        this.getWebSettings = options.getWebSettings;
        this.fetchProvider = options.fetchProvider ?? searchByProvider;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    async search(query: string, count = 3): Promise<WebLookupResult[]> {
        const settings = this.getWebSettings();
        if (settings.enabled !== true) return [];
        if (settings.provider === 'none') return [];

        const providerName: WebSearchProviderName = settings.provider;
        const apiKey = providerName === 'brave' ? settings.braveApiKey : settings.tavilyApiKey;
        if (apiKey.length === 0) return [];

        const q = buildQuery(query);
        if (q.length === 0) return [];

        try {
            const raw: WebSearchResult[] = await this.withTimeout(
                this.fetchProvider(providerName, q, count, apiKey),
                this.timeoutMs,
            );
            return raw.slice(0, count).map((r, idx) => ({
                title: clamp(r.title, MAX_TITLE_CHARS),
                url: clamp(r.url, MAX_URL_CHARS),
                snippet: clamp(r.snippet, MAX_SNIPPET_CHARS),
                score: Math.max(0, 1.0 - 0.1 * idx),
            }));
        } catch (e) {
            console.debug('[InlineWebLookup] provider call failed (fallback to []):', e);
            return [];
        }
    }

    /**
     * Race the provider call against a hard deadline. The underlying
     * fetch keeps running for now (no AbortSignal threading through
     * searchByProvider yet) but the inline action stops waiting.
     */
    private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`InlineWebLookup timeout after ${ms}ms`)), ms);
            p.then(
                v => { clearTimeout(t); resolve(v); },
                e => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); },
            );
        });
    }
}

function clamp(text: string, max: number): string {
    if (typeof text !== 'string') return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

function buildQuery(text: string): string {
    const oneLine = text.trim().split('\n')[0].slice(0, 200);
    if (oneLine.length === 0) return '';
    // Short uppercase tokens are likely acronyms -> add a hint.
    if (/^[A-Z0-9]{2,10}$/.test(oneLine)) return `${oneLine} definition`;
    return oneLine;
}
