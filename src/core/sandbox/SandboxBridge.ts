/**
 * SandboxBridge
 *
 * Plugin-side bridge that handles requests from the sandboxed iframe.
 * Controls vault access, URL allowlisting, path validation, and rate limiting.
 *
 * Part of Self-Development Phase 3: Sandbox + Dynamic Modules.
 */

import { TFile, TFolder, requestUrl, Notice } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';

// ---------------------------------------------------------------------------
// SandboxBridge
// ---------------------------------------------------------------------------

export class SandboxBridge {
    private writeCount = 0;
    private requestCount = 0;
    private lastReset = Date.now();
    private readonly MAX_WRITES_PER_MIN = 10;
    private readonly MAX_REQUESTS_PER_MIN = 5;

    // M-8: Circuit breaker — disable bridge after excessive consecutive errors.
    // BUG-027 (2026-04-19): auto-reset after COOLDOWN_MS so a stuck circuit
    // doesn't permanently wedge the agent for the rest of the session. Once
    // tripped, the bridge stays closed for the cooldown window, then gives
    // the caller one chance to succeed and resets the counter.
    private consecutiveErrors = 0;
    private lastErrorAt = 0;
    private static readonly MAX_CONSECUTIVE_ERRORS = 20;
    private static readonly CIRCUIT_COOLDOWN_MS = 30_000;
    private circuitOpen = false;

    private readonly URL_ALLOWLIST = [
        'unpkg.com',
        'cdn.jsdelivr.net',
        'registry.npmjs.org',
        'esm.sh',
    ];

    constructor(private plugin: ObsidianAgentPlugin) {}

    async vaultRead(path: string): Promise<string> {
        this.checkCircuitBreaker();
        try {
            const normalised = normaliseVaultPath(path);
            this.validateVaultPath(normalised);
            this.logBridgeOp('vault-read', normalised);
            // FEAT-29-05: paths under hidden folders (.vault-operator/, etc.)
            // are not in Obsidian's TFile index, so getAbstractFileByPath
            // returns null and the read fails. Fall back to adapter.read
            // which works directly on the filesystem path.
            if (this.isHiddenPath(normalised)) {
                if (!(await this.plugin.app.vault.adapter.exists(normalised))) {
                    throw new Error(`Not a file: ${path}`);
                }
                const result = await this.plugin.app.vault.adapter.read(normalised);
                this.recordSuccess();
                return result;
            }
            const file = this.plugin.app.vault.getAbstractFileByPath(normalised);
            if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
            const result = await this.plugin.app.vault.read(file);
            this.recordSuccess();
            return result;
        } catch (e) {
            this.recordError();
            throw e;
        }
    }

    async vaultReadBinary(path: string): Promise<ArrayBuffer> {
        this.checkCircuitBreaker();
        try {
            const normalised = normaliseVaultPath(path);
            this.validateVaultPath(normalised);
            this.logBridgeOp('vault-read-binary', normalised);
            if (this.isHiddenPath(normalised)) {
                if (!(await this.plugin.app.vault.adapter.exists(normalised))) {
                    throw new Error(`Not a file: ${path}`);
                }
                const result = await this.plugin.app.vault.adapter.readBinary(normalised);
                this.recordSuccess();
                return result;
            }
            const file = this.plugin.app.vault.getAbstractFileByPath(normalised);
            if (!(file instanceof TFile)) throw new Error(`Not a file: ${path}`);
            const result = await this.plugin.app.vault.readBinary(file);
            this.recordSuccess();
            return result;
        } catch (e) {
            this.recordError();
            throw e;
        }
    }

    /**
     * FEAT-29-05: a vault path is "hidden" when ANY segment starts with a
     * dot (`.vault-operator/`, `.obsidian/`, but NOT `notes/My.File.md`).
     * The TFile API skips those folders; the adapter handles them.
     */
    private isHiddenPath(path: string): boolean {
        return path.split('/').some((seg) => seg.startsWith('.'));
    }

    async vaultList(path: string): Promise<string[]> {
        this.checkCircuitBreaker();
        try {
            // BUG-022: vaultList('/') used to throw because
            // getAbstractFileByPath('/') returns null -- Obsidian addresses the
            // vault root with an empty string and offers vault.getRoot() for
            // the special case.
            // BUG-028 (2026-04-19): trailing slashes on folder paths
            // (e.g. 'Notes/') also returned null from getAbstractFileByPath.
            // normaliseVaultPath now strips them globally.
            const normalised = normaliseVaultPath(path);
            this.validateVaultPath(normalised);
            this.logBridgeOp('vault-list', normalised);
            // FEAT-29-05: adapter.list for hidden folders (TFolder skips them).
            if (normalised !== '' && this.isHiddenPath(normalised)) {
                if (!(await this.plugin.app.vault.adapter.exists(normalised))) {
                    throw new Error(`Not a folder: ${path}`);
                }
                const listing = await this.plugin.app.vault.adapter.list(normalised);
                const result = [...listing.files, ...listing.folders];
                this.recordSuccess();
                return result;
            }
            const folder = normalised === ''
                ? this.plugin.app.vault.getRoot()
                : this.plugin.app.vault.getAbstractFileByPath(normalised);
            if (!(folder instanceof TFolder)) throw new Error(`Not a folder: ${path}`);
            const result = folder.children.map(c => c.path);
            this.recordSuccess();
            return result;
        } catch (e) {
            this.recordError();
            throw e;
        }
    }

    async vaultWrite(path: string, content: string): Promise<void> {
        this.checkCircuitBreaker();
        this.validateVaultPath(path, true);
        // M-2: Write-Size-Limit
        if (content.length > SandboxBridge.MAX_WRITE_SIZE) {
            throw new Error(`Write too large: ${content.length} bytes (max ${SandboxBridge.MAX_WRITE_SIZE})`);
        }
        this.checkWriteRateLimit();
        this.logBridgeOp('vault-write', `${path} (${content.length} chars)`);
        // FEAT-29-05: adapter.write for hidden folders (Vault.create skips them).
        if (this.isHiddenPath(path)) {
            await this.plugin.app.vault.adapter.write(path, content);
            this.recordSuccess();
            return;
        }
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            await this.plugin.app.vault.modify(file, content);
        } else {
            await this.plugin.app.vault.create(path, content);
        }
        this.recordSuccess();
    }

    /**
     * FEAT-29-05: create a folder (and parents on the way) inside the
     * vault. Obsidian's adapter.mkdir is not recursive, so we walk the
     * path segment by segment. Idempotent -- existing folders are a
     * silent success.
     */
    async vaultMkdir(path: string): Promise<void> {
        this.checkCircuitBreaker();
        try {
            const normalised = normaliseVaultPath(path);
            this.validateVaultPath(normalised, true);
            this.logBridgeOp('vault-mkdir', normalised);
            const adapter = this.plugin.app.vault.adapter;
            const segments = normalised.split('/').filter((s) => s.length > 0);
            let current = '';
            for (const seg of segments) {
                current = current ? `${current}/${seg}` : seg;
                if (!(await adapter.exists(current))) {
                    await adapter.mkdir(current);
                }
            }
            this.recordSuccess();
        } catch (e) {
            this.recordError();
            throw e;
        }
    }

    async vaultWriteBinary(path: string, content: ArrayBuffer): Promise<void> {
        this.checkCircuitBreaker();
        this.validateVaultPath(path, true);
        // M-2: Write-Size-Limit
        if (content.byteLength > SandboxBridge.MAX_WRITE_SIZE) {
            throw new Error(`Write too large: ${content.byteLength} bytes (max ${SandboxBridge.MAX_WRITE_SIZE})`);
        }
        this.checkWriteRateLimit();
        this.logBridgeOp('vault-write-binary', `${path} (${content.byteLength} bytes)`);
        if (this.isHiddenPath(path)) {
            await this.plugin.app.vault.adapter.writeBinary(path, content);
            this.recordSuccess();
            return;
        }
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            await this.plugin.app.vault.modifyBinary(file, content);
        } else {
            await this.plugin.app.vault.createBinary(path, content);
        }
        this.recordSuccess();
    }

    async requestUrlBridge(
        url: string,
        options?: { method?: string; body?: string },
    ): Promise<{ status: number; text: string }> {
        this.checkCircuitBreaker();
        this.checkRequestRateLimit();
        if (!this.isAllowedUrl(url)) {
            throw new Error(
                `URL not on allowlist: ${url}. Allowed: ${this.URL_ALLOWLIST.join(', ')}`
            );
        }
        // M-8: Validate options payload for prototype pollution
        if (options && this.hasPollutionKeys(options)) {
            throw new Error('Rejected: payload contains prototype pollution keys');
        }
        this.logBridgeOp('request-url', url);
        const response = await requestUrl({
            url,
            method: options?.method,
            body: options?.body,
        });
        this.recordSuccess();
        return { status: response.status, text: response.text };
    }

    // -----------------------------------------------------------------------
    // M-8: Security Hardening
    // -----------------------------------------------------------------------

    /**
     * Check for prototype pollution keys in bridge payloads.
     * Rejects objects containing __proto__, constructor, or prototype.
     */
    hasPollutionKeys(obj: unknown): boolean {
        if (typeof obj !== 'object' || obj === null) return false;
        const keys = Object.keys(obj);
        if (keys.some(k => k === '__proto__' || k === 'constructor' || k === 'prototype')) {
            return true;
        }
        for (const k of keys) {
            if (this.hasPollutionKeys((obj as Record<string, unknown>)[k])) {
                return true;
            }
        }
        return false;
    }

    /** Log a bridge operation for observability. */
    private logBridgeOp(type: string, detail: string): void {
        console.debug(`[SandboxBridge] ${type}: ${detail}`);
    }

    /**
     * Check circuit breaker — throws if bridge is disabled. BUG-027: the
     * circuit auto-resets after CIRCUIT_COOLDOWN_MS of inactivity so a stuck
     * state doesn't permanently block the agent. The one probe that follows
     * the cooldown either succeeds (recordSuccess clears the counter) or
     * fails (recordError re-trips).
     */
    private checkCircuitBreaker(): void {
        if (!this.circuitOpen) return;
        const sinceLast = Date.now() - this.lastErrorAt;
        if (sinceLast >= SandboxBridge.CIRCUIT_COOLDOWN_MS) {
            console.debug('[SandboxBridge] Circuit auto-reset after', sinceLast, 'ms cooldown');
            this.consecutiveErrors = 0;
            this.circuitOpen = false;
            return;
        }
        throw new Error(
            `SandboxBridge circuit open — too many consecutive errors. Will auto-reset in ${Math.max(0, SandboxBridge.CIRCUIT_COOLDOWN_MS - sinceLast)} ms.`,
        );
    }

    /** Record a successful operation — resets error counter and closes the circuit. */
    private recordSuccess(): void {
        this.consecutiveErrors = 0;
        this.circuitOpen = false;
    }

    /** Record a failed operation — may trip the circuit breaker. */
    recordError(): void {
        this.consecutiveErrors++;
        this.lastErrorAt = Date.now();
        if (this.consecutiveErrors >= SandboxBridge.MAX_CONSECUTIVE_ERRORS && !this.circuitOpen) {
            this.circuitOpen = true;
            console.warn(`[SandboxBridge] Circuit breaker tripped — bridge disabled after ${SandboxBridge.MAX_CONSECUTIVE_ERRORS} consecutive errors. Auto-reset in ${SandboxBridge.CIRCUIT_COOLDOWN_MS / 1000}s.`);
            // AUDIT-037 L-3: surface the trip to the user instead of failing
            // silently. A buggy or hostile sandbox script can repeatedly
            // throw to disable the bridge; without a notice the user sees
            // tools become inert with no explanation.
            try {
                new Notice(
                    `Vault Operator sandbox bridge paused after ${SandboxBridge.MAX_CONSECUTIVE_ERRORS} errors. Auto-reset in ${SandboxBridge.CIRCUIT_COOLDOWN_MS / 1000}s. Reset manually from settings if needed.`,
                    8000,
                );
            } catch { /* Notice may be unavailable in non-UI tests */ }
        }
    }

    /** Reset the circuit breaker (e.g. when sandbox is recreated). */
    resetCircuitBreaker(): void {
        this.consecutiveErrors = 0;
        this.circuitOpen = false;
    }

    // -----------------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------------

    private static readonly MAX_WRITE_SIZE = 10 * 1024 * 1024; // 10 MB (Audit M-2)

    private validateVaultPath(path: string, isWrite = false): void {
        if (path.includes('..') || path.startsWith('/') || path.startsWith('\\')) {
            throw new Error(`Invalid path: ${path}`);
        }

        // Shai Hulud Mitigation: Block ALL writes to configDir (Audit L-2: Allowlist)
        if (isWrite) {
            const configDir = this.plugin.app.vault.configDir;
            const normalized = path.replace(/\\/g, '/');

            if (normalized.startsWith(`${configDir}/`) || normalized === configDir) {
                throw new Error(`Sandbox write blocked: ${configDir}/ is protected`);
            }
        }
    }

    private isAllowedUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname;

            // Block non-HTTPS (data:, file:, ftp:, etc.)
            if (parsed.protocol !== 'https:') return false;

            // Block IP addresses (IPv4 and IPv6) — require domain names only
            if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
            if (host.startsWith('[') || host === 'localhost') return false;

            // Block non-standard ports
            if (parsed.port && parsed.port !== '443') return false;

            return this.URL_ALLOWLIST.some(
                a => host === a || host.endsWith('.' + a)
            );
        } catch {
            return false;
        }
    }

    // -----------------------------------------------------------------------
    // Rate Limiting
    // -----------------------------------------------------------------------

    private checkWriteRateLimit(): void {
        this.resetIfMinuteElapsed();
        // Fix: increment AFTER check (>= instead of > after ++)
        if (this.writeCount >= this.MAX_WRITES_PER_MIN) {
            throw new Error('Write rate limit exceeded (max 10/min)');
        }
        this.writeCount++;
    }

    private checkRequestRateLimit(): void {
        this.resetIfMinuteElapsed();
        if (this.requestCount >= this.MAX_REQUESTS_PER_MIN) {
            throw new Error('Request rate limit exceeded (max 5/min)');
        }
        this.requestCount++;
    }

    private resetIfMinuteElapsed(): void {
        if (Date.now() - this.lastReset > 60000) {
            this.writeCount = 0;
            this.requestCount = 0;
            this.lastReset = Date.now();
        }
    }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * BUG-028 (2026-04-19): Obsidian's `getAbstractFileByPath` treats `Notes`
 * and `Notes/` as different paths -- the trailing slash makes it return
 * null. Agents naturally type folder paths with a trailing slash
 * (`vault.list('Notes/')`), so every vault-bridge entry normalises the
 * path before validation. Also translates root variants (`/`, `.`) to the
 * empty string so vaultList's getRoot() branch is reachable.
 *
 * Exported for unit tests.
 */
export function normaliseVaultPath(raw: string): string {
    if (raw === '/' || raw === '.' || raw === './') return '';
    // Strip trailing slashes (except on the root which is already ''); leave
    // leading characters alone so validateVaultPath can still reject
    // absolute paths.
    return raw.replace(/\/+$/, '');
}
