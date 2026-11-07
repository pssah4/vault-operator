/**
 * User-owned Google Desktop OAuth clients, isolated by provider instance.
 * Fixed Google endpoints; PKCE/state loopback; encrypted settings own refresh
 * tokens while access tokens stay in memory. FEAT-04-14, ADR-89.
 */
import { Platform, requestUrl } from 'obsidian';
import { setTimeout, clearTimeout } from 'node:timers';
import type { ProviderConfig } from '../../types/settings';
import { SafeStorageService } from '../security/SafeStorageService';
import { startPkceLoopbackServer } from './PkceLoopbackServer';

export interface GeminiOAuthDependencies {
    request(body: URLSearchParams): Promise<{ status: number; body: unknown }>;
    loopback: typeof startPkceLoopbackServer;
    supported(): boolean;
    now(): number;
}
interface AuthHost {
    getProvider(): ProviderConfig | undefined;
    save(): Promise<void>;
}
export interface GeminiAuthFlow {
    authorizeUrl: string;
    completion: Promise<void>;
    abort(): void;
}
const SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/generative-language.retriever',
];
function record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : {};
}
function randomString(length: number): string {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(length))).toString('base64url');
}
function identity(config: ProviderConfig): string {
    return JSON.stringify([config.id, config.type, config.geminiOAuthClientId, config.geminiOAuthClientSecret, config.geminiOAuthProjectId]);
}

export class GeminiOAuthService {
    private static instances = new Map<string, GeminiOAuthService>();
    private static providers: (() => ProviderConfig[]) | undefined;
    private static save: (() => Promise<void>) | undefined;
    static dispose(): void {
        for (const instance of this.instances.values()) instance.cancel();
        this.instances.clear(); this.providers = undefined; this.save = undefined;
    }
    static configure(providers: () => ProviderConfig[], save: () => Promise<void>): void {
        for (const instance of this.instances.values()) instance.cancel();
        this.instances.clear(); this.providers = providers; this.save = save;
    }
    static forProvider(id: string | undefined): GeminiOAuthService {
        if (!id || !this.providers || !this.save) throw new Error('Configure a Google Gemini (OAuth) provider and sign in first.');
        let instance = this.instances.get(id);
        if (!instance) {
            instance = new GeminiOAuthService({
                getProvider: () => this.providers?.().find(provider => provider.id === id),
                save: () => this.save?.() ?? Promise.resolve(),
            });
            this.instances.set(id, instance);
        }
        return instance;
    }
    private generation = 0;
    private boundIdentity = '';
    private accessToken = '';
    private expiresAt = 0;
    private refreshPromise: Promise<void> | undefined;
    private abortFlow: (() => void) | undefined;
    private readonly deps: GeminiOAuthDependencies;
    constructor(private readonly host: AuthHost, deps?: Partial<GeminiOAuthDependencies>) {
        this.deps = {
            request: async body => {
                let timer: ReturnType<typeof setTimeout> | undefined;
                try {
                const response = await Promise.race([requestUrl({
                    url: 'https://oauth2.googleapis.com/token', method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body.toString(), throw: false,
                }), new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('Google OAuth request timed out. Retry sign-in.')), 30_000);
                })]);
                let parsed: unknown;
                try { parsed = JSON.parse(response.text) as unknown; } catch { parsed = undefined; }
                return { status: response.status, body: parsed };
                } finally { if (timer !== undefined) clearTimeout(timer); }
            },
            loopback: startPkceLoopbackServer,
            supported: () => Platform.isDesktop && new SafeStorageService().isAvailable(),
            now: () => Date.now(), ...deps,
        };
    }
    getSessionId(): string { return this.host.getProvider()?.geminiOAuthSessionId ?? ''; }
    isAuthenticated(): boolean { return !!this.host.getProvider()?.geminiOAuthRefreshToken; }
    private config(): ProviderConfig {
        if (!this.deps.supported()) throw new Error('Google OAuth requires desktop Obsidian with an available OS keychain.');
        const config = this.host.getProvider();
        if (!config || config.type !== 'gemini-oauth') throw new Error('Google OAuth provider was removed or changed.');
        if (!config.geminiOAuthClientId?.trim() || !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(config.geminiOAuthClientId)) {
            throw new Error('Enter a Google Desktop OAuth client ID.');
        }
        if (!config.geminiOAuthProjectId || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(config.geminiOAuthProjectId)) {
            throw new Error('Enter a Google Cloud project ID for API quota.');
        }
        const key = identity(config);
        if (this.boundIdentity !== key) { this.cancel(); this.boundIdentity = key; }
        return config;
    }
    /** Invalidates pending work without changing persisted settings. */
    cancel(): void {
        this.generation++; this.accessToken = ''; this.expiresAt = 0;
        this.refreshPromise = undefined;
        const abort = this.abortFlow; this.abortFlow = undefined; abort?.();
    }
    private current(generation: number, expectedIdentity: string): ProviderConfig {
        const config = this.host.getProvider();
        if (generation !== this.generation || !config || identity(config) !== expectedIdentity) {
            throw new Error('Google OAuth configuration changed or authentication was cancelled.');
        }
        return config;
    }
    async startAuthFlow(): Promise<GeminiAuthFlow> {
        const config = this.config(); this.cancel();
        const generation = this.generation; const key = identity(config);
        const verifier = randomString(64); const state = randomString(32);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        this.current(generation, key);
        const loopback = await this.deps.loopback(state, { ports: [0], callbackPath: '/' });
        try { this.current(generation, key); } catch (error) {
            void loopback.callback.catch(() => {}); loopback.abort(); throw error;
        }
        const redirect = `http://127.0.0.1:${loopback.port}/`;
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.search = new URLSearchParams({
            client_id: config.geminiOAuthClientId!, redirect_uri: redirect,
            response_type: 'code', scope: SCOPES.join(' '), state,
            code_challenge: Buffer.from(digest).toString('base64url'), code_challenge_method: 'S256',
            access_type: 'offline', prompt: 'consent',
        }).toString();
        this.abortFlow = loopback.abort;
        const completion = (async () => {
            try {
                const result = await loopback.callback;
                if (result.state !== state) throw new Error('Google OAuth state mismatch.');
                this.current(generation, key);
                await this.exchange(config, new URLSearchParams({
                    grant_type: 'authorization_code', code: result.code,
                    redirect_uri: redirect, code_verifier: verifier,
                }), generation, key, true);
            } finally {
                loopback.abort();
                if (this.abortFlow === loopback.abort) this.abortFlow = undefined;
            }
        })();
        // Caller may still be opening the OS browser when cancellation occurs.
        void completion.catch(() => {});
        return { authorizeUrl: url.href, completion, abort: () => this.cancel() };
    }
    async getHeaders(): Promise<Record<string, string>> {
        const config = this.config(); const key = identity(config); const generation = this.generation;
        if (!this.accessToken || this.expiresAt <= this.deps.now() + 60_000) {
            if (!this.refreshPromise) {
                if (!config.geminiOAuthRefreshToken) throw new Error('Google authorization is missing. Sign in again.');
                const pending = this.exchange(config, new URLSearchParams({
                    grant_type: 'refresh_token', refresh_token: config.geminiOAuthRefreshToken,
                }), generation, key, false);
                this.refreshPromise = pending;
                void pending.finally(() => { if (this.refreshPromise === pending) this.refreshPromise = undefined; }).catch(() => {});
            }
            await this.refreshPromise;
        }
        const current = this.current(generation, key);
        return { Authorization: `Bearer ${this.accessToken}`, 'x-goog-user-project': current.geminiOAuthProjectId! };
    }
    private async exchange(config: ProviderConfig, body: URLSearchParams, generation: number, key: string, requireRefresh: boolean): Promise<void> {
        body.set('client_id', config.geminiOAuthClientId!);
        if (config.geminiOAuthClientSecret) body.set('client_secret', config.geminiOAuthClientSecret);
        const response = await this.deps.request(body);
        const current = this.current(generation, key); const data = record(response.body);
        if (response.status !== 200) {
            if (data.error === 'invalid_grant') {
                await this.logout();
                throw new Error('Google authorization expired. Sign in again.');
            }
            throw new Error(`Google OAuth request failed (HTTP ${response.status}). Check the Desktop client and consent configuration.`);
        }
        if (typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 16_384
            || data.token_type !== 'Bearer' || typeof data.expires_in !== 'number'
            || !Number.isFinite(data.expires_in) || data.expires_in <= 0
            || (requireRefresh && (typeof data.refresh_token !== 'string' || !data.refresh_token))) {
            throw new Error('Google returned an invalid OAuth token response. Sign in again.');
        }
        if (typeof data.refresh_token === 'string' && data.refresh_token.length > 0) {
            if (data.refresh_token.length > 16_384) throw new Error('Google returned an invalid refresh token.');
            current.geminiOAuthRefreshToken = data.refresh_token;
            if (requireRefresh) current.geminiOAuthSessionId = randomString(24);
            await this.host.save();
            this.current(generation, key);
        }
        this.accessToken = data.access_token;
        this.expiresAt = this.deps.now() + Math.min(data.expires_in, 86400) * 1000;
    }
    async logout(): Promise<void> {
        this.cancel();
        const config = this.host.getProvider();
        if (config) { delete config.geminiOAuthRefreshToken; delete config.geminiOAuthSessionId; await this.host.save(); }
    }
}
