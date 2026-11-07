/**
 * GitHubCopilotAuthService — Singleton for GitHub Copilot OAuth & Token Management.
 *
 * Implements the three-stage token chain:
 *   1. Device Code Flow → user authorization
 *   2. Access Token (long-lived, ~30 days)
 *   3. Copilot Token (short-lived, ~1h, auto-refreshed)
 *
 * All HTTP calls use Obsidian's `requestUrl` (Review-Bot compliant).
 * The custom fetch wrapper (`getCopilotFetch()`) is injected into the OpenAI SDK
 * for streaming chat completions — SDK-internal fetch is Review-Bot tolerated.
 *
 * @see ADR-036 (Streaming Strategy)
 * @see ADR-037 (Provider Architecture)
 * @see ADR-038 (Token Storage)
 * @see FEATURE-1201 (Auth & Token Management)
 */

import { requestUrl } from 'obsidian';
import type { ObsidianAgentSettings } from '../../types/settings';
import { safeOAuthErrorDetail } from './safeOAuthError';
import { validateProviderUrl } from '../../api/providers/providerUrlGuard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

const COPILOT_API_BASE = 'https://api.githubcopilot.com';


/**
 * FIX-45-03-01: the two chat routes Copilot serves. Path strings, matching the
 * values GitHub puts in each model's `supported_endpoints`.
 */
export const CHAT_COMPLETIONS_ENDPOINT = '/chat/completions';
export const RESPONSES_ENDPOINT = '/responses';

/** Required headers for all Copilot API calls. */
const COPILOT_HEADERS: Record<string, string> = {
    'User-Agent': 'GitHubCopilotChat/0.39.2',
    'Editor-Version': 'vscode/1.111.0',
    'Editor-Plugin-Version': 'copilot-chat/0.39.2',
    'Copilot-Integration-Id': 'vscode-chat',
    'Openai-Intent': 'conversation-panel',
    'X-GitHub-Api-Version': '2025-10-01',
};

/** Token refresh buffer — refresh 60s before actual expiry. */
const REFRESH_BUFFER_SECONDS = 60;

/** Maximum refresh attempts before giving up. */
const MAX_REFRESH_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeviceFlowResult {
    userCode: string;
    verificationUri: string;
    deviceCode: string;
    interval: number;
    expiresIn: number;
}

interface CopilotTokenResponse {
    token: string;
    expires_at: number;
    endpoints?: {
        api?: string;
        proxy?: string;
    };
}

export interface CopilotModel {
    id: string;
    name?: string;
    capabilities?: {
        type?: string;
        family?: string;
        limits?: {
            max_context_window_tokens?: number;
            max_output_tokens?: number;
            max_prompt_tokens?: number;
        };
        supports?: Record<string, boolean>;
    };
    /**
     * FIX-45-03-01: the request routes this model answers on, e.g.
     * ["/chat/completions"] or ["/responses"]. GitHub took the chat route away
     * from the GPT-5.6 lineup (Terra, Sol, Luna); those ids serve only on
     * /responses and reject /chat/completions with HTTP 400. Older entries omit
     * the field entirely, which we treat as "unknown" rather than guessing.
     *
     * Field name and semantics verified against the Copilot Chat extension's
     * own `useResponsesApi` getter, which reads exactly this array.
     */
    supported_endpoints?: string[];
    /** Model-level terms the account may still have to accept. */
    policy?: { state?: string; terms?: string };
    model_picker_enabled?: boolean;
    /**
     * FIX-45-03-01: billing tiers. A `long_context` entry is what makes the larger
     * context size selectable for a model (the GPT-5.6 lineup offers 1M this
     * way); without it the account is held to the default tier's prompt limit.
     * It is a pricing tier, not a request parameter — nothing extra is sent.
     */
    billing?: {
        token_prices?: {
            default?: Record<string, unknown>;
            long_context?: Record<string, unknown>;
        };
    };
}

/**
 * FIX-45-03-01: what we keep per model between sessions. Every field is optional
 * because the model list only reports what it reports; absent means "unknown",
 * which always resolves to the pre-fix behaviour rather than a guess.
 */
export interface CopilotModelMeta {
    /** Request routes the model answers on, e.g. ['/responses']. */
    endpoints?: string[];
    /** Largest usable context window, see resolveCopilotContextWindow. */
    contextWindow?: number;
    /** Provider-reported output cap. */
    maxOutputTokens?: number;
}

/**
 * The context size the user can pick for the GPT-5.6 lineup (Terra, Sol, Luna)
 * is a billing tier, not a request parameter. A model priced for long context
 * (`billing.token_prices.long_context`) may use the full
 * `max_context_window_tokens`; everything else is held to `max_prompt_tokens`.
 * We always take the largest window the account is entitled to.
 *
 * This mirrors `_getMaxPromptTokensOverride` in the Copilot Chat extension,
 * minus its 3-token safety subtraction — VO applies its own margin downstream
 * in resolveOutputBudget (CONTEXT_SAFETY_MARGIN).
 */
export function resolveCopilotContextWindow(model: CopilotModel): number | undefined {
    const limits = model.capabilities?.limits;
    if (!limits) return undefined;
    const hasLongContextTier = model.billing?.token_prices?.long_context !== undefined;
    if (hasLongContextTier && limits.max_context_window_tokens !== undefined) {
        return limits.max_context_window_tokens;
    }
    return limits.max_prompt_tokens ?? limits.max_context_window_tokens;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GitHubCopilotAuthService {
    private static instance: GitHubCopilotAuthService | null = null;

    // Token state
    private accessToken = '';
    private copilotToken = '';
    private copilotTokenExpiresAt = 0; // epoch seconds
    private customClientId = '';
    private enterpriseDomain = '';
    private apiBase = '';
    /**
     * FIX-45-03-01: modelId -> what the last /models response said about it.
     * Feeds the provider's route decision and its context window. Persisted so
     * the first request after a restart already goes to the right endpoint
     * instead of paying a 400 to find out, and so a model entered by hand (a
     * tier override, which never lands in discoveredModels) still gets its real
     * window instead of the 128k fallback.
     *
     * A Map, not a plain object: the keys are model ids straight out of an API
     * response, and `__proto__` as a key on a plain object is prototype
     * pollution. A Map has no such key.
     */
    private modelMeta = new Map<string, CopilotModelMeta>();

    // Concurrency guards
    private refreshPromise: Promise<void> | null = null;
    private generation = 0;

    // Settings persistence callback
    private saveCallback: (() => Promise<void>) | null = null;

    private constructor() { /* Singleton — use getInstance() */ }

    static getInstance(): GitHubCopilotAuthService {
        if (!GitHubCopilotAuthService.instance) {
            GitHubCopilotAuthService.instance = new GitHubCopilotAuthService();
        }
        return GitHubCopilotAuthService.instance;
    }

    /** Return a copy of the standard Copilot headers (for embedding requests etc.). */
    static getCopilotHeaders(): Record<string, string> {
        return { ...COPILOT_HEADERS };
    }

    // ---------------------------------------------------------------------------
    // State management
    // ---------------------------------------------------------------------------

    /**
     * Load token state from decrypted settings.
     * Call this after settings are loaded and decrypted in main.ts.
     */
    loadFromSettings(settings: ObsidianAgentSettings): void {
        this.accessToken = settings.githubCopilotAccessToken ?? '';
        this.copilotToken = settings.githubCopilotToken ?? '';
        this.copilotTokenExpiresAt = settings.githubCopilotTokenExpiresAt ?? 0;
        this.customClientId = settings.githubCopilotCustomClientId ?? '';
        this.enterpriseDomain = settings.githubCopilotEnterpriseDomain ?? '';
        this.apiBase = settings.githubCopilotApiBase ?? '';
        // Settings written before FIX-45-03-01 have no table; an empty one just
        // means every model starts as "route and limits unknown". The next
        // model-list refresh fills it in, so nothing has to be migrated.
        this.modelMeta = new Map(Object.entries(settings.githubCopilotModelMeta ?? {}));
    }

    /**
     * Write current token state back to settings (before save).
     */
    saveToSettings(settings: ObsidianAgentSettings): void {
        settings.githubCopilotAccessToken = this.accessToken;
        settings.githubCopilotToken = this.copilotToken;
        settings.githubCopilotTokenExpiresAt = this.copilotTokenExpiresAt;
        settings.githubCopilotCustomClientId = this.customClientId;
        settings.githubCopilotEnterpriseDomain = this.enterpriseDomain;
        settings.githubCopilotApiBase = this.apiBase;
        settings.githubCopilotModelMeta = Object.fromEntries(this.modelMeta);
    }

    /** Register a callback that persists settings to disk. */
    setSaveCallback(cb: () => Promise<void>): void {
        this.saveCallback = cb;
    }

    isAuthenticated(): boolean {
        return this.accessToken.length > 0;
    }

    getCustomClientId(): string {
        return this.customClientId;
    }

    setCustomClientId(clientId: string): void {
        this.customClientId = clientId;
    }

    /** GitHub Cloud hosts only. GHES does not host the Copilot token service. */
    private normalizeEnterpriseDomain(value: string): string {
        const raw = value.trim();
        if (!raw) return '';
        const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
        if (url.protocol !== 'https:' || url.username || url.password || url.port
            || url.search || url.hash || url.pathname !== '/'
            || (url.hostname !== 'github.com' && !(/^[a-z0-9-]+\.ghe\.com$/i.test(url.hostname) && !url.hostname.startsWith('-') && !url.hostname.split('.')[0].endsWith('-')))) {
            throw new Error('Use github.com or your Enterprise Cloud tenant (your-company.ghe.com). Self-hosted GitHub servers are not Copilot authentication hosts.');
        }
        return url.hostname === 'github.com' ? '' : url.hostname;
    }

    async setEnterpriseDomain(value: string): Promise<void> {
        const domain = this.normalizeEnterpriseDomain(value);
        if (domain === this.normalizeEnterpriseDomain(this.enterpriseDomain)) return;
        this.enterpriseDomain = domain;
        // Tokens and model catalogues belong to the old account. Invalidate
        // in-flight token writes before the next device flow starts.
        this.generation++;
        this.accessToken = '';
        this.invalidateCopilotToken();
        this.apiBase = '';
        this.modelMeta.clear();
        this.refreshPromise = null;
        await this.persistTokens();
    }

    getEnterpriseDomain(): string {
        return this.enterpriseDomain;
    }

    private authHost(): string {
        return this.normalizeEnterpriseDomain(this.enterpriseDomain) || 'github.com';
    }

    private githubApiBase(): string {
        const host = this.authHost();
        return host === 'github.com' ? 'https://api.github.com' : `https://api.${host}`;
    }

    /** Resolve only after getCopilotToken(), since refresh can change the route. */
    getApiBaseUrl(): string {
        const proxy = /(?:^|;)proxy-ep=([^;]+)/.exec(this.copilotToken)?.[1];
        const host = this.authHost();
        const fallback = host === 'github.com' ? COPILOT_API_BASE : `https://copilot-api.${host}`;
        const candidate = this.apiBase || (proxy ? `https://${proxy.replace(/^proxy\./, 'api.')}` : fallback);
        const url = validateProviderUrl('github-copilot', candidate)!;
        const trusted = url.hostname.endsWith('.githubcopilot.com')
            || url.hostname === 'copilot-proxy.githubusercontent.com'
            || (host !== 'github.com' && url.hostname.endsWith(`.${host}`));
        if (!trusted || url.username || url.password || url.port || url.search || url.hash) {
            throw new Error('Copilot returned an unsupported API endpoint');
        }
        return url.href.replace(/\/+$/, '');
    }

    // ---------------------------------------------------------------------------
    // OAuth Device Code Flow (FEATURE-1201)
    // ---------------------------------------------------------------------------

    /**
     * Step 1: Request a device code from GitHub.
     * Returns the user code and verification URI for the user to authorize.
     */
    async startDeviceFlow(): Promise<DeviceFlowResult> {
        const gen = this.generation;
        const clientId = this.customClientId || DEFAULT_CLIENT_ID;
        const body = `client_id=${encodeURIComponent(clientId)}&scope=read%3Auser`;

        const res = await requestUrl({
            url: `https://${this.authHost()}/login/device/code`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body,
        });

        if (gen !== this.generation) throw new Error('Copilot account changed during authorization');
        const data = res.json as Record<string, unknown>;

        if (!data.device_code || !data.user_code) {
            throw new Error(`Device flow failed: ${safeOAuthErrorDetail(data)}`);
        }

        return {
            deviceCode: data.device_code as string,
            userCode: data.user_code as string,
            verificationUri: (data.verification_uri as string) ?? `https://${this.authHost()}/login/device`,
            interval: (data.interval as number) ?? 5,
            expiresIn: (data.expires_in as number) ?? 900,
        };
    }

    /**
     * Step 2: Poll for the access token after user authorization.
     * Resolves when the user completes authorization or rejects on timeout/error.
     */
    async pollForAccessToken(
        deviceCode: string,
        interval: number,
        signal?: AbortSignal,
    ): Promise<string> {
        const clientId = this.customClientId || DEFAULT_CLIENT_ID;
        const gen = this.generation;
        const grantType = 'urn:ietf:params:oauth:grant-type:device_code';
        const body = `client_id=${encodeURIComponent(clientId)}&device_code=${encodeURIComponent(deviceCode)}&grant_type=${encodeURIComponent(grantType)}`;

        const pollIntervalMs = Math.max(interval, 5) * 1000;
        const maxAttempts = 120; // ~10 min safety net (AUDIT-008 L-1)

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (signal?.aborted || gen !== this.generation) {
                throw new Error('Authorization cancelled');
            }

            await this.sleep(pollIntervalMs);

            if (signal?.aborted || gen !== this.generation) {
                throw new Error('Authorization cancelled');
            }

            const res = await requestUrl({
                url: `https://${this.authHost()}/login/oauth/access_token`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                },
                body,
            });

            if (gen !== this.generation) throw new Error('Copilot account changed during authorization');
            const data = res.json as Record<string, unknown>;

            if (data.access_token) {
                this.accessToken = data.access_token as string;
                this.generation++;
                await this.persistTokens();
                return this.accessToken;
            }

            const error = data.error as string | undefined;
            if (error === 'authorization_pending') {
                continue; // Keep polling
            } else if (error === 'slow_down') {
                // Back off by 5 seconds
                await this.sleep(5000);
                continue;
            } else if (error === 'expired_token') {
                throw new Error('Device code expired. Please start the authorization again.');
            } else if (error === 'access_denied') {
                throw new Error('Authorization was denied by the user.');
            } else if (error) {
                const errDesc: string = typeof data.error_description === 'string' ? data.error_description : '';
                throw new Error(`OAuth error: ${String(error)} — ${errDesc}`);
            }
        }
        throw new Error('Authorization timed out. Please try again.');
    }

    // ---------------------------------------------------------------------------
    // Copilot Token Management
    // ---------------------------------------------------------------------------

    /**
     * Get a valid Copilot API token, auto-refreshing if needed.
     * Uses a promise-lock to prevent concurrent refresh requests.
     */
    async getCopilotToken(): Promise<string> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with GitHub. Please sign in first.');
        }

        const now = Math.floor(Date.now() / 1000);
        if (this.copilotToken && now < this.copilotTokenExpiresAt - REFRESH_BUFFER_SECONDS) {
            return this.copilotToken;
        }

        // Serialize concurrent refresh calls
        if (this.refreshPromise) {
            await this.refreshPromise;
            return this.copilotToken;
        }

        this.refreshPromise = this.refreshCopilotToken();
        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }

        return this.copilotToken;
    }

    /**
     * Invalidate the current Copilot token (e.g. after a 401).
     * Forces a refresh on the next getCopilotToken() call.
     */
    invalidateCopilotToken(): void {
        this.copilotToken = '';
        this.copilotTokenExpiresAt = 0;
    }

    private async refreshCopilotToken(): Promise<void> {
        const gen = this.generation;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < MAX_REFRESH_ATTEMPTS; attempt++) {
            // Abort if auth was reset during refresh
            if (this.generation !== gen) return;

            try {
                const res = await requestUrl({
                    url: `${this.githubApiBase()}/copilot_internal/v2/token`,
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Accept': 'application/json',
                        ...COPILOT_HEADERS,
                    },
                });

                if (res.status === 401) {
                    throw new Error('GitHub access token expired or revoked. Please sign in again.');
                }

                const data = res.json as CopilotTokenResponse;
                if (!data.token || !data.expires_at) {
                    throw new Error('Invalid Copilot token response');
                }

                // Guard against stale write after auth reset
                if (this.generation !== gen) return;

                this.copilotToken = data.token;
                this.apiBase = data.endpoints?.api ?? '';
                this.getApiBaseUrl(); // validate before persisting or sending the token
                this.copilotTokenExpiresAt = data.expires_at;
                await this.persistTokens();
                return;

            } catch (e) {
                lastError = e instanceof Error ? e : new Error(String(e));
                if (lastError.message.includes('expired or revoked')) {
                    throw lastError; // Don't retry auth failures
                }
                // Wait before retry (exponential: 1s, 2s, 4s)
                if (attempt < MAX_REFRESH_ATTEMPTS - 1) {
                    await this.sleep(1000 * Math.pow(2, attempt));
                }
            }
        }

        throw lastError ?? new Error('Failed to refresh Copilot token');
    }

    // ---------------------------------------------------------------------------
    // Model Listing (FEATURE-1205)
    // ---------------------------------------------------------------------------

    /**
     * Fetch available models from the Copilot API.
     * Requires a valid Copilot token (will auto-refresh if needed).
     */
    async listModels(): Promise<CopilotModel[]> {
        const gen = this.generation;
        const token = await this.getCopilotToken();
        if (gen !== this.generation) throw new Error('Copilot account changed during model discovery');

        const res = await requestUrl({
            url: `${this.getApiBaseUrl()}/models`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                ...COPILOT_HEADERS,
            },
        });

        if (gen !== this.generation) throw new Error('Copilot account changed during model discovery');
        const data = res.json as { data?: CopilotModel[] };
        // Copy before sorting: Array.sort mutates, and the caller's payload is
        // not ours to reorder.
        const models = [...(data.data ?? [])].sort((a, b) => a.id.localeCompare(b.id));
        this.rememberModelMeta(models);
        return models;
    }

    // ---------------------------------------------------------------------------
    // Model routes (FIX-45-03-01)
    // ---------------------------------------------------------------------------

    /**
     * Request routes the given model answers on, or undefined when the model
     * list never said. Undefined means "unknown", not "chat only" -- the caller
     * has to keep its current behaviour and let the server correct it.
     */
    getModelEndpoints(modelId: string): string[] | undefined {
        const endpoints = this.modelMeta.get(modelId)?.endpoints;
        return endpoints && endpoints.length > 0 ? [...endpoints] : undefined;
    }

    /**
     * Context window and output cap the model list reported for this model, or
     * undefined when it never mentioned it.
     *
     * Needed on top of the discovery path because a model can reach the
     * provider without ever passing through discovery: a tier override typed
     * into provider settings resolves to a bare id, and would otherwise run on
     * the 128k default while the model actually serves 1M.
     */
    getModelLimits(modelId: string): { contextWindow?: number; maxOutputTokens?: number } | undefined {
        const meta = this.modelMeta.get(modelId);
        if (!meta) return undefined;
        if (meta.contextWindow === undefined && meta.maxOutputTokens === undefined) return undefined;
        return { contextWindow: meta.contextWindow, maxOutputTokens: meta.maxOutputTokens };
    }

    /**
     * Pin a model the server just rejected on /chat/completions. Lets a model
     * that was configured before FIX-45-03-01 (and therefore carries no route
     * metadata) reach the right endpoint without the user re-fetching the list.
     */
    /**
     * The mirror of noteResponsesOnly: the server rejected /responses for this
     * model, so it is back on the chat route. A remembered route is a cache of
     * something GitHub controls, and it has moved these models before.
     */
    noteChatCompletions(modelId: string): void {
        const current = this.modelMeta.get(modelId);
        if (current?.endpoints?.includes(CHAT_COMPLETIONS_ENDPOINT)) return;
        this.modelMeta.set(modelId, { ...current, endpoints: [CHAT_COMPLETIONS_ENDPOINT] });
        void this.persistTokens();
    }

    noteResponsesOnly(modelId: string): void {
        const current = this.modelMeta.get(modelId);
        if (current?.endpoints?.length === 1 && current.endpoints[0] === RESPONSES_ENDPOINT) {
            return; // already pinned, no redundant write
        }
        // Keep whatever limits we know; only the route is being corrected.
        this.modelMeta.set(modelId, { ...current, endpoints: [RESPONSES_ENDPOINT] });
        void this.persistTokens();
    }

    /**
     * Replace the table with what this /models response reported. A full
     * replace (not a merge) so a model the account lost, or one whose routes
     * GitHub changed, does not keep a stale entry forever. Fields the response
     * omits stay absent, which is what makes them read back as "unknown".
     */
    private rememberModelMeta(models: CopilotModel[]): void {
        const next = new Map<string, CopilotModelMeta>();
        for (const model of models) {
            const meta: CopilotModelMeta = {};
            const endpoints = model.supported_endpoints;
            if (Array.isArray(endpoints) && endpoints.length > 0) {
                meta.endpoints = [...endpoints];
            }
            const contextWindow = resolveCopilotContextWindow(model);
            if (contextWindow !== undefined) meta.contextWindow = contextWindow;
            const maxOutput = model.capabilities?.limits?.max_output_tokens;
            if (maxOutput !== undefined) meta.maxOutputTokens = maxOutput;
            if (Object.keys(meta).length > 0) next.set(model.id, meta);
        }
        this.modelMeta = next;
        void this.persistTokens();
    }

    // ---------------------------------------------------------------------------
    // Logout
    // ---------------------------------------------------------------------------

    async logout(): Promise<void> {
        // Best-effort server-side revocation BEFORE clearing local state, so a
        // previously exfiltrated access token cannot keep minting Copilot
        // tokens (AUDIT-034 L-10). GitHub exposes a documented OAuth Apps
        // endpoint for this: DELETE /applications/{client_id}/grant. It
        // requires the OAuth app's client_id + client_secret as Basic auth.
        // We do not bundle a client secret in the plugin (the Device Flow
        // client app is public), so the call may be rejected. We send it
        // anyway as defense-in-depth, log the outcome at debug, and ALWAYS
        // clear local state below regardless of the network result.
        const clientId = this.customClientId || DEFAULT_CLIENT_ID;
        if (this.accessToken) {
            try {
                const res = await requestUrl({
                    url: `${this.githubApiBase()}/applications/${encodeURIComponent(clientId)}/grant`,
                    method: 'DELETE',
                    headers: {
                        'Accept': 'application/vnd.github+json',
                        'Authorization': `token ${this.accessToken}`,
                        'X-GitHub-Api-Version': '2022-11-28',
                    },
                    body: JSON.stringify({ access_token: this.accessToken }),
                    throw: false,
                });
                if (res.status >= 400) {
                    console.debug(
                        `[CopilotAuth] Best-effort grant revocation returned HTTP ${res.status}; clearing local credentials anyway.`,
                    );
                }
            } catch (e) {
                console.debug('[CopilotAuth] Best-effort grant revocation failed; clearing local credentials anyway.', e);
            }
        }

        this.accessToken = '';
        this.copilotToken = '';
        this.copilotTokenExpiresAt = 0;
        // FIX-45-03-01: the model table is account-scoped -- a different account
        // may be served a different lineup, so it must not survive a logout.
        this.modelMeta.clear();
        this.apiBase = '';
        this.generation++;
        await this.persistTokens();
    }

    // ---------------------------------------------------------------------------
    // Custom Fetch for OpenAI SDK (ADR-036)
    // ---------------------------------------------------------------------------

    /**
     * Returns a fetch-compatible function that injects Copilot auth headers.
     * Used as `new OpenAI({ fetch: authService.getCopilotFetch() })`.
     *
     * The wrapper:
     *  1. Calls getCopilotToken() (auto-refresh)
     *  2. Replaces Authorization header with Copilot token
     *  3. Adds required Copilot headers
     *  4. Delegates to window.fetch (SDK-internal, Review-Bot tolerated)
     */
    /**
     * @param baseFetch transport the wrapper delegates to. Side finding
     * (2026-08-14): this used to call window.fetch unconditionally, the same
     * shape that makes the Kilo gateway fail with a CORS preflight error in
     * the Electron renderer. api.githubcopilot.com currently sends the right
     * headers, so Copilot works -- but it works by the host's grace, not by
     * design, and it would break the day those headers change. Making the
     * transport injectable lets the provider hand in the Node transport the
     * other providers already use, without touching this class again.
     */
    getCopilotFetch(baseFetch: typeof window.fetch = window.fetch): typeof window.fetch {
        return async (
            input: RequestInfo | URL,
            init?: RequestInit,
        ): Promise<Response> => {
            const gen = this.generation;
            const token = await this.getCopilotToken();
            if (gen !== this.generation) throw new Error('Copilot account changed during request');
            const source = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
            if (source.origin !== COPILOT_API_BASE) throw new Error('Unexpected Copilot SDK request origin');
            const destination = `${this.getApiBaseUrl()}${source.pathname}${source.search}`;

            const headers = new Headers(init?.headers);
            headers.set('Authorization', `Bearer ${token}`);

            // Inject Copilot-specific headers
            for (const [key, value] of Object.entries(COPILOT_HEADERS)) {
                if (!headers.has(key)) {
                    headers.set(key, value);
                }
            }

            return baseFetch(destination, { ...init, headers });
        };
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private async persistTokens(): Promise<void> {
        if (this.saveCallback) {
            try {
                await this.saveCallback();
            } catch (e) {
                console.warn('[CopilotAuth] Failed to persist tokens:', e);
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }
}
