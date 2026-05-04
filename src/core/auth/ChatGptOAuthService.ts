/**
 * ChatGptOAuthService -- Singleton for ChatGPT OAuth & Token Management.
 *
 * Implements the PKCE flow against auth.openai.com that codex-cli and
 * opencode use. Tokens are persisted via SafeStorageService (encrypted
 * via OS keychain). HTTP calls go through Obsidian's `requestUrl`. The
 * loopback callback runs in a fresh PkceLoopbackServer instance per
 * flow.
 *
 * @see ADR-088 (Provider Architecture)
 * @see ADR-089 (PKCE Loopback Flow)
 * @see FEATURE-021-001 (OAuth Lifecycle)
 */

import { requestUrl, Platform } from 'obsidian';
import type { ObsidianAgentSettings } from '../../types/settings';
import { SafeStorageService } from '../security/SafeStorageService';
import { startPkceLoopbackServer } from './PkceLoopbackServer';
import { decodeJwtClaims, readStringClaim } from './jwt-decode';

void SafeStorageService; // import retained for future direct use

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Codex-CLI OAuth client id. Public, used by codex-rs and opencode.
 * Schema as observed 2026-04-28.
 */
const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

const AUTH_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize';
const AUTH_TOKEN_URL = 'https://auth.openai.com/oauth/token';

/** Refresh access_token this many seconds before its expiry. */
const REFRESH_BUFFER_SECONDS = 60;

/** Possible JWT claim names for the chatgpt-account-id header. */
const ACCOUNT_ID_CLAIMS = [
    'https://api.openai.com/auth.chatgpt_account_id',
    'chatgpt_account_id',
    'account_id',
];

/** Possible JWT claim names for the plan tier. */
const PLAN_TIER_CLAIMS = [
    'https://api.openai.com/auth.chatgpt_plan_type',
    'chatgpt_plan_type',
    'plan',
    'subscription_plan',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountInfo {
    accountId: string;
    email: string;
    planTier: 'plus' | 'pro' | 'unknown' | '';
}

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    token_type: string;
    expires_in: number;
}

export interface AuthFlowState {
    /** Open this URL in the browser. */
    authorizeUrl: string;
    /** Resolves once the user completes the browser flow. */
    completion: Promise<void>;
    /** Force-cancel the flow. */
    abort: () => void;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ChatGptOAuthService {
    private static instance: ChatGptOAuthService | null = null;

    private accessToken = '';
    private refreshToken = '';
    private idToken = '';
    private accountId = '';
    private email = '';
    private planTier: 'plus' | 'pro' | 'unknown' | '' = '';
    private expiresAt = 0; // Unix ms

    private platformReady: boolean;

    private refreshPromise: Promise<void> | null = null;
    private generation = 0;

    private saveCallback: (() => Promise<void>) | null = null;

    private constructor() {
        const safeStorage = new SafeStorageService();
        this.platformReady = safeStorage.isAvailable();
    }

    static getInstance(): ChatGptOAuthService {
        if (!ChatGptOAuthService.instance) {
            ChatGptOAuthService.instance = new ChatGptOAuthService();
        }
        return ChatGptOAuthService.instance;
    }

    // ---------------------------------------------------------------------------
    // Settings persistence
    // ---------------------------------------------------------------------------

    /**
     * Hydrate the service state from decrypted settings.
     * The plugin's central decryptSettings() runs before this; tokens
     * arrive in plaintext.
     */
    loadFromSettings(settings: ObsidianAgentSettings): void {
        this.accessToken = settings.chatgptOAuthAccessToken ?? '';
        this.refreshToken = settings.chatgptOAuthRefreshToken ?? '';
        this.idToken = settings.chatgptOAuthIdToken ?? '';
        this.accountId = settings.chatgptOAuthAccountId ?? '';
        this.email = settings.chatgptOAuthEmail ?? '';
        this.planTier = settings.chatgptOAuthPlanTier ?? '';
        this.expiresAt = settings.chatgptOAuthExpiresAt ?? 0;
    }

    /**
     * Mirror service state into settings as plaintext.
     * The plugin's encryptSettingsForSave() runs before saveData() and
     * applies safeStorage.encrypt to the three token fields.
     */
    saveToSettings(settings: ObsidianAgentSettings): void {
        settings.chatgptOAuthAccessToken = this.accessToken;
        settings.chatgptOAuthRefreshToken = this.refreshToken;
        settings.chatgptOAuthIdToken = this.idToken;
        settings.chatgptOAuthAccountId = this.accountId;
        settings.chatgptOAuthEmail = this.email;
        settings.chatgptOAuthPlanTier = this.planTier;
        settings.chatgptOAuthExpiresAt = this.expiresAt;
    }

    setSaveCallback(cb: () => Promise<void>): void {
        this.saveCallback = cb;
    }

    isAuthenticated(): boolean {
        return this.accessToken.length > 0;
    }

    isPlatformSupported(): boolean {
        return Platform.isDesktop && this.platformReady;
    }

    getAccountInfo(): AccountInfo {
        return {
            accountId: this.accountId,
            email: this.email,
            planTier: this.planTier,
        };
    }

    // ---------------------------------------------------------------------------
    // PKCE Auth Flow (FEATURE-021-001, ADR-089)
    // ---------------------------------------------------------------------------

    /**
     * Begin a fresh OAuth flow.
     *
     * Returns a state bundle: the authorize URL the caller must open in the
     * browser, and a Promise that resolves once the loopback callback has
     * been received and the tokens persisted. If the user closes the
     * browser tab, the loopback timeout (5 min) rejects the promise.
     */
    async startAuthFlow(): Promise<AuthFlowState> {
        if (!this.isPlatformSupported()) {
            throw new Error('ChatGPT OAuth requires desktop Obsidian with an available OS keychain.');
        }

        const codeVerifier = randomUrlSafe(64);
        const codeChallenge = await sha256Base64Url(codeVerifier);
        const state = randomUrlSafe(32);

        const loopback = await startPkceLoopbackServer(state);
        // Codex-CLI uses `localhost`, not `127.0.0.1`. The OAuth client
        // app_EMoamEEZ73f0CkXaXp7hrann is registered with localhost-based
        // redirect URIs only. Verified against codex-rs/login/src/server.rs.
        const redirectUri = `http://localhost:${loopback.port}/auth/callback`;

        const authorizeUrl = buildAuthorizeUrl({
            clientId: CLIENT_ID,
            redirectUri,
            codeChallenge,
            state,
        });

        const completion = (async () => {
            const result = await loopback.callback;
            await this.exchangeCodeForTokens({
                code: result.code,
                codeVerifier,
                redirectUri,
            });
        })();

        return {
            authorizeUrl,
            completion,
            abort: () => loopback.abort(),
        };
    }

    private async exchangeCodeForTokens(args: {
        code: string;
        codeVerifier: string;
        redirectUri: string;
    }): Promise<void> {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: args.code,
            redirect_uri: args.redirectUri,
            client_id: CLIENT_ID,
            code_verifier: args.codeVerifier,
        }).toString();

        const res = await requestUrl({
            url: AUTH_TOKEN_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body,
            throw: false,
        });

        if (res.status >= 400) {
            const detail = safeJsonString(res.text);
            throw new Error(`Token exchange failed (HTTP ${res.status}): ${detail}`);
        }

        const data = res.json as TokenResponse;
        this.applyTokenResponse(data);
        this.generation++;
        await this.persist();
    }

    private applyTokenResponse(data: TokenResponse): void {
        if (!data.access_token || !data.expires_in) {
            throw new Error('OAuth response missing access_token or expires_in.');
        }
        this.accessToken = data.access_token;
        if (data.refresh_token) this.refreshToken = data.refresh_token;
        if (data.id_token) {
            this.idToken = data.id_token;
            this.applyIdTokenClaims(data.id_token);
        }
        this.expiresAt = Date.now() + data.expires_in * 1000;
    }

    private applyIdTokenClaims(idToken: string): void {
        const claims = decodeJwtClaims(idToken);
        if (!claims) return;
        this.accountId = readStringClaim(claims, ...ACCOUNT_ID_CLAIMS) || this.accountId;
        const email = readStringClaim(claims, 'email');
        if (email) this.email = email;
        const planRaw = readStringClaim(claims, ...PLAN_TIER_CLAIMS).toLowerCase();
        this.planTier = planRaw === 'pro' ? 'pro' : planRaw === 'plus' ? 'plus' : planRaw ? 'unknown' : '';
    }

    // ---------------------------------------------------------------------------
    // Token refresh (FEATURE-021-001 SC-02 + SC-06)
    // ---------------------------------------------------------------------------

    /**
     * Get a valid access_token, auto-refreshing if it is within the buffer
     * window of expiry. Concurrent calls share the same refresh promise.
     */
    async getValidAccessToken(): Promise<string> {
        if (!this.accessToken) {
            throw new Error('Not signed in to ChatGPT. Please connect first.');
        }

        const bufferMs = REFRESH_BUFFER_SECONDS * 1000;
        if (Date.now() < this.expiresAt - bufferMs) {
            return this.accessToken;
        }

        if (this.refreshPromise) {
            await this.refreshPromise;
            return this.accessToken;
        }

        this.refreshPromise = this.refreshAccessToken();
        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = null;
        }
        return this.accessToken;
    }

    /** Force-invalidate the access_token (e.g. after a 401 from the API). */
    invalidateAccessToken(): void {
        this.expiresAt = 0;
    }

    private async refreshAccessToken(): Promise<void> {
        if (!this.refreshToken) {
            throw new Error('No refresh token available. Please sign in again.');
        }

        const gen = this.generation;
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken,
            client_id: CLIENT_ID,
        }).toString();

        const res = await requestUrl({
            url: AUTH_TOKEN_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body,
            throw: false,
        });

        if (this.generation !== gen) return; // logout/relogin happened during the call

        if (res.status >= 400) {
            const detail = safeJsonString(res.text);
            throw new Error(`Token refresh failed (HTTP ${res.status}): ${detail}`);
        }

        const data = res.json as TokenResponse;
        this.applyTokenResponse(data);
        await this.persist();
    }

    // ---------------------------------------------------------------------------
    // Logout (FEATURE-021-001 SC-03)
    // ---------------------------------------------------------------------------

    async logout(): Promise<void> {
        this.accessToken = '';
        this.refreshToken = '';
        this.idToken = '';
        this.accountId = '';
        this.email = '';
        this.planTier = '';
        this.expiresAt = 0;
        this.generation++;
        await this.persist();
    }

    // ---------------------------------------------------------------------------
    // Codex header helpers (used by the API handler in FEATURE-021-002)
    // ---------------------------------------------------------------------------

    getAccountId(): string {
        return this.accountId;
    }

    // ---------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------

    private async persist(): Promise<void> {
        if (!this.saveCallback) return;
        try {
            await this.saveCallback();
        } catch (e) {
            console.warn('[ChatGptOAuth] Failed to persist tokens:', e);
        }
    }
}

// ---------------------------------------------------------------------------
// Crypto helpers (PKCE)
// ---------------------------------------------------------------------------

function buildAuthorizeUrl(args: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state: string;
}): string {
    // Scopes and Codex-specific flags verified against codex-rs/login/src/server.rs:
    // the OAuth client expects api.connectors.read and api.connectors.invoke
    // beyond the standard four scopes, plus id_token_add_organizations and
    // codex_cli_simplified_flow.
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: args.clientId,
        redirect_uri: args.redirectUri,
        scope: 'openid profile email offline_access api.connectors.read api.connectors.invoke',
        code_challenge: args.codeChallenge,
        code_challenge_method: 'S256',
        state: args.state,
        id_token_add_organizations: 'true',
        codex_cli_simplified_flow: 'true',
    });
    return `${AUTH_AUTHORIZE_URL}?${params.toString()}`;
}

function randomUrlSafe(numBytes: number): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js crypto for PKCE; only available via dynamic require in Electron renderer
    const crypto = require('crypto') as typeof import('crypto');
    return crypto.randomBytes(numBytes).toString('base64url');
}

// eslint-disable-next-line @typescript-eslint/require-await -- async signature kept for symmetry with future SubtleCrypto path that returns a Promise
async function sha256Base64Url(input: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js crypto for PKCE; web SubtleCrypto path is not always available in Electron renderer
    const crypto = require('crypto') as typeof import('crypto');
    return crypto.createHash('sha256').update(input).digest('base64url');
}

function safeJsonString(text: string | undefined): string {
    if (!text) return '<empty>';
    if (text.length > 500) return text.slice(0, 500) + '...';
    return text;
}
