/**
 * KiloAuthService — Singleton für Kilo Gateway Auth & Session Management.
 *
 * Implementiert zwei Auth-Modi:
 *   1. Device Authorization Flow — Browser-basierte Autorisierung
 *   2. Manual Token — direkte API-Token-Eingabe
 *
 * Beide Modi landen im selben Session-State (KiloSession).
 * Alle HTTP-Calls nutzen Obsidian's `requestUrl` (Review-Bot compliant).
 * Der custom fetch-Wrapper (`getKiloFetch()`) wird in den OpenAI SDK injiziert
 * für Streaming Chat Completions.
 *
 * @see ADR-040 (Provider Architecture)
 * @see ADR-041 (Auth and Session Architecture)
 * @see FEATURE-1301 (Auth & Session Management)
 */

import { requestUrl } from 'obsidian';
import type { ObsidianAgentSettings } from '../../types/settings';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KILO_BASE = 'https://api.kilo.ai/api';
const DEVICE_AUTH_START_URL = `${KILO_BASE}/device-auth/codes`;
const PROFILE_URL           = `${KILO_BASE}/profile`;
const DEFAULTS_URL          = `${KILO_BASE}/defaults`;

function deviceAuthPollUrl(code: string): string {
    return `${KILO_BASE}/device-auth/codes/${code}`;
}

function orgDefaultsUrl(orgId: string): string {
    return `${KILO_BASE}/organizations/${orgId}/defaults`;
}

/** Polling-Intervall für Device Auth in ms. */
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 200; // ~10 min safety net (AUDIT-008 L-1)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KiloAuthMode = 'device-auth' | 'manual-token' | '';

export interface KiloDeviceFlowResult {
    /** Opaker Code für Polling. */
    deviceCode: string;
    /** Dem Nutzer anzuzeigender Code. */
    userCode: string;
    /** URL, die der Nutzer im Browser öffnen soll. */
    verificationUri: string;
    /** Gültigkeitsdauer in Sekunden. */
    expiresIn: number;
}

export interface KiloSession {
    authMode: KiloAuthMode;
    accountLabel: string;
    organizationId: string;
    lastValidatedAt: number; // epoch seconds
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KiloAuthService {
    private static instance: KiloAuthService | null = null;

    private token = '';
    private session: KiloSession = {
        authMode: '',
        accountLabel: '',
        organizationId: '',
        lastValidatedAt: 0,
    };

    private saveCallback: (() => Promise<void>) | null = null;

    private constructor() { /* Singleton — use getInstance() */ }

    static getInstance(): KiloAuthService {
        if (!KiloAuthService.instance) {
            KiloAuthService.instance = new KiloAuthService();
        }
        return KiloAuthService.instance;
    }

    // ---------------------------------------------------------------------------
    // State management
    // ---------------------------------------------------------------------------

    loadFromSettings(settings: ObsidianAgentSettings): void {
        this.token = settings.kiloToken ?? '';
        this.session = {
            authMode: settings.kiloAuthMode ?? '',
            accountLabel: settings.kiloAccountLabel ?? '',
            organizationId: settings.kiloOrganizationId ?? '',
            lastValidatedAt: settings.kiloLastValidatedAt ?? 0,
        };
    }

    saveToSettings(settings: ObsidianAgentSettings): void {
        settings.kiloToken = this.token;
        settings.kiloAuthMode = this.session.authMode;
        settings.kiloAccountLabel = this.session.accountLabel;
        settings.kiloOrganizationId = this.session.organizationId;
        settings.kiloLastValidatedAt = this.session.lastValidatedAt;
    }

    setSaveCallback(cb: () => Promise<void>): void {
        this.saveCallback = cb;
    }

    isAuthenticated(): boolean {
        return this.token.length > 0;
    }

    getToken(): string {
        return this.token;
    }

    getSession(): Readonly<KiloSession> {
        return { ...this.session };
    }

    // ---------------------------------------------------------------------------
    // Device Authorization Flow (FEATURE-1301)
    // ---------------------------------------------------------------------------

    /**
     * Schritt 1: Device Auth starten.
     * Gibt userCode + verificationUri zurück, die dem Nutzer angezeigt werden.
     */
    async startDeviceAuth(): Promise<KiloDeviceFlowResult> {
        const res = await requestUrl({
            url: DEVICE_AUTH_START_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ client_id: 'obsilo' }),
            throw: false,
        });

        if (res.status >= 400) {
            throw new Error(`Kilo device auth failed (HTTP ${res.status})`);
        }

        const data = res.json as Record<string, unknown>;
        if (!data.code || !data.user_code) {
            throw new Error(`Kilo device auth: unexpected response — ${JSON.stringify(data)}`);
        }

        return {
            deviceCode: data.code as string,
            userCode: data.user_code as string,
            verificationUri: (data.verification_uri as string) ?? 'https://app.kilo.ai/auth',
            expiresIn: (data.expires_in as number) ?? 600,
        };
    }

    /**
     * Schritt 2: Auf Nutzer-Autorisierung warten (Polling).
     * Blockiert bis Erfolg, Fehler oder AbortSignal.
     */
    async pollForSession(deviceCode: string, signal?: AbortSignal): Promise<void> {
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
            if (signal?.aborted) {
                throw new Error('Authorization cancelled');
            }

            await this.sleep(POLL_INTERVAL_MS);

            if (signal?.aborted) {
                throw new Error('Authorization cancelled');
            }

            const res = await requestUrl({
                url: deviceAuthPollUrl(deviceCode),
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                throw: false,
            });

            if (res.status === 202) {
                // Authorization pending — weiter pollen
                continue;
            }

            if (res.status === 200) {
                const data = res.json as Record<string, unknown>;
                const token = (data.token ?? data.access_token) as string | undefined;
                if (!token) {
                    throw new Error('Kilo auth: no token in response');
                }
                this.token = token;
                this.session.authMode = 'device-auth';
                this.session.lastValidatedAt = Math.floor(Date.now() / 1000);
                await this.loadProfile();
                await this.persist();
                return;
            }

            if (res.status === 400) {
                const data = res.json as Record<string, unknown>;
                const error = data.error as string | undefined;
                if (error === 'authorization_pending') continue;
                if (error === 'expired_token') throw new Error('Device code expired. Start authorization again.');
                if (error === 'access_denied') throw new Error('Authorization was denied.');
                throw new Error(`Kilo auth error: ${error ?? JSON.stringify(data)}`);
            }

            throw new Error(`Kilo auth poll failed (HTTP ${res.status})`);
        }
        throw new Error('Authorization timed out. Please try again.');
    }

    // ---------------------------------------------------------------------------
    // Manual Token (FEATURE-1307)
    // ---------------------------------------------------------------------------

    async validateAndSetManualToken(token: string): Promise<void> {
        const res = await requestUrl({
            url: PROFILE_URL,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json',
            },
            throw: false,
        });

        if (res.status === 401 || res.status === 403) {
            throw new Error('Invalid token — authentication rejected by Kilo.');
        }
        if (res.status >= 400) {
            throw new Error(`Token validation failed (HTTP ${res.status})`);
        }

        this.token = token;
        this.session.authMode = 'manual-token';
        this.session.lastValidatedAt = Math.floor(Date.now() / 1000);

        const data = res.json as Record<string, unknown>;
        this.session.accountLabel = this.extractAccountLabel(data);

        await this.persist();
    }

    // ---------------------------------------------------------------------------
    // Profile & Organization Context (FEATURE-1305)
    // ---------------------------------------------------------------------------

    async loadProfile(): Promise<void> {
        if (!this.token) return;

        try {
            const res = await requestUrl({
                url: PROFILE_URL,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json',
                },
                throw: false,
            });

            if (res.status === 200) {
                const data = res.json as Record<string, unknown>;
                this.session.accountLabel = this.extractAccountLabel(data);
            }
        } catch (e) {
            console.warn('[KiloAuth] Profile load failed:', e);
        }
    }

    async setOrganization(orgId: string): Promise<void> {
        this.session.organizationId = orgId;
        await this.persist();
    }

    async loadOrgDefaults(): Promise<Record<string, unknown>> {
        const orgId = this.session.organizationId;
        const url = orgId ? orgDefaultsUrl(orgId) : DEFAULTS_URL;

        const res = await requestUrl({
            url,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/json',
            },
            throw: false,
        });

        if (res.status !== 200) return {};
        return res.json as Record<string, unknown>;
    }

    // ---------------------------------------------------------------------------
    // Disconnect
    // ---------------------------------------------------------------------------

    async disconnect(): Promise<void> {
        this.token = '';
        this.session = {
            authMode: '',
            accountLabel: '',
            organizationId: '',
            lastValidatedAt: 0,
        };
        await this.persist();
    }

    // ---------------------------------------------------------------------------
    // Custom Fetch für OpenAI SDK (ADR-040)
    // ---------------------------------------------------------------------------

    /**
     * Gibt einen fetch-kompatiblen Wrapper zurück, der Kilo-Auth-Header injiziert.
     * Wird als `new OpenAI({ fetch: authService.getKiloFetch() })` übergeben.
     *
     * Review-Bot: SDK-internes globalThis.fetch ist toleriert (wie github-copilot.ts).
     */
    getKiloFetch(): typeof globalThis.fetch {
        return async (
            input: RequestInfo | URL,
            init?: RequestInit,
        ): Promise<Response> => {
            const headers = new Headers(init?.headers);

            headers.set('Authorization', `Bearer ${this.token}`);

            const orgId = this.session.organizationId;
            if (orgId) {
                headers.set('X-KiloCode-OrganizationId', orgId);
            }

            return globalThis.fetch(input, { ...init, headers });
        };
    }

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    private extractAccountLabel(profile: Record<string, unknown>): string {
        // Kilo profile may use email, username, or name depending on account type
        return (
            (profile.email as string) ??
            (profile.username as string) ??
            (profile.name as string) ??
            ''
        );
    }

    private async persist(): Promise<void> {
        if (this.saveCallback) {
            try {
                await this.saveCallback();
            } catch (e) {
                console.warn('[KiloAuth] Failed to persist session:', e);
            }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
