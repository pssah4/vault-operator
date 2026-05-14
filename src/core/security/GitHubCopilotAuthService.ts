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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_API_BASE = 'https://api.githubcopilot.com';
const MODELS_URL = `${COPILOT_API_BASE}/models`;

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

interface CopilotModel {
    id: string;
    name?: string;
    capabilities?: Record<string, boolean>;
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
    }

    /**
     * Write current token state back to settings (before save).
     */
    saveToSettings(settings: ObsidianAgentSettings): void {
        settings.githubCopilotAccessToken = this.accessToken;
        settings.githubCopilotToken = this.copilotToken;
        settings.githubCopilotTokenExpiresAt = this.copilotTokenExpiresAt;
        settings.githubCopilotCustomClientId = this.customClientId;
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

    // ---------------------------------------------------------------------------
    // OAuth Device Code Flow (FEATURE-1201)
    // ---------------------------------------------------------------------------

    /**
     * Step 1: Request a device code from GitHub.
     * Returns the user code and verification URI for the user to authorize.
     */
    async startDeviceFlow(): Promise<DeviceFlowResult> {
        const clientId = this.customClientId || DEFAULT_CLIENT_ID;
        const body = `client_id=${encodeURIComponent(clientId)}&scope=read%3Auser`;

        const res = await requestUrl({
            url: DEVICE_CODE_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body,
        });

        const data = res.json as Record<string, unknown>;

        if (!data.device_code || !data.user_code) {
            throw new Error(`Device flow failed: ${JSON.stringify(data)}`);
        }

        return {
            deviceCode: data.device_code as string,
            userCode: data.user_code as string,
            verificationUri: (data.verification_uri as string) ?? 'https://github.com/login/device',
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
        const grantType = 'urn:ietf:params:oauth:grant-type:device_code';
        const body = `client_id=${encodeURIComponent(clientId)}&device_code=${encodeURIComponent(deviceCode)}&grant_type=${encodeURIComponent(grantType)}`;

        const pollIntervalMs = Math.max(interval, 5) * 1000;
        const maxAttempts = 120; // ~10 min safety net (AUDIT-008 L-1)

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (signal?.aborted) {
                throw new Error('Authorization cancelled');
            }

            await this.sleep(pollIntervalMs);

            if (signal?.aborted) {
                throw new Error('Authorization cancelled');
            }

            const res = await requestUrl({
                url: ACCESS_TOKEN_URL,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                },
                body,
            });

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
                    url: COPILOT_TOKEN_URL,
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
        const token = await this.getCopilotToken();

        const res = await requestUrl({
            url: MODELS_URL,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
                ...COPILOT_HEADERS,
            },
        });

        const data = res.json as { data?: CopilotModel[] };
        return (data.data ?? []).sort((a, b) => a.id.localeCompare(b.id));
    }

    // ---------------------------------------------------------------------------
    // Logout
    // ---------------------------------------------------------------------------

    async logout(): Promise<void> {
        this.accessToken = '';
        this.copilotToken = '';
        this.copilotTokenExpiresAt = 0;
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
    getCopilotFetch(): typeof window.fetch {
        return async (
            input: RequestInfo | URL,
            init?: RequestInit,
        ): Promise<Response> => {
            const token = await this.getCopilotToken();

            const headers = new Headers(init?.headers);
            headers.set('Authorization', `Bearer ${token}`);

            // Inject Copilot-specific headers
            for (const [key, value] of Object.entries(COPILOT_HEADERS)) {
                if (!headers.has(key)) {
                    headers.set(key, value);
                }
            }

            return window.fetch(input, { ...init, headers });
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
