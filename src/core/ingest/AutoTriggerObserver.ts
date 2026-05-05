/**
 * AutoTriggerObserver -- vault.on-Listener fuer konfigurierbaren
 * Auto-Trigger via Frontmatter-Property.
 *
 * Backs FEAT-19-27 (ADR-102). Bei Note-create oder -modify prueft der
 * Observer Frontmatter-Property-Match (zB Sebastians "Kategorie: Quelle").
 * Wenn gematcht UND Cooldown abgelaufen UND nicht bereits triaged:
 * Trigger-Callback feuert (zB ingest_triage Tool-Call vom Plugin).
 */

import { TFile, type App } from 'obsidian';
import type { IngestTriageLogStore } from './IngestTriageLogStore';

export interface AutoTriggerOptions {
    enabled: boolean;
    propertyName: string;
    /** Erlaubte Werte. String oder String-Liste. */
    propertyValue: string | string[];
    /** Default 1h: kein Re-Trigger fuer dieselbe Note innerhalb dieser Spanne. */
    cooldownMs?: number;
    /** Optional folder-allowlist (zB ['Inbox/']). */
    folderAllowList?: string[];
    /**
     * AUDIT-014 L-2 (FIX-19-27-01, CWE-770):
     * Rate-Limit gegen vault.on-Storm (zB git pull mit vielen Notes).
     * Default 10 Trigger pro 60 Sekunden. Excess-Events werden silent
     * gedropped mit Warning-Log; Doppel-Trigger-Schutz via Triage-Log
     * bleibt unabhaengig wirksam.
     */
    rateLimitMaxPerWindow?: number;
    rateLimitWindowMs?: number;
}

export type TriggerCallback = (file: TFile) => void | Promise<void>;

export class AutoTriggerObserver {
    private listeners: Array<() => void> = [];
    private options: AutoTriggerOptions;
    /** AUDIT-014 L-2: sliding-window rate-limit timestamps (ms). */
    private recentTriggers: number[] = [];

    constructor(
        private readonly app: App,
        private readonly triageLog: IngestTriageLogStore,
        private readonly onTrigger: TriggerCallback,
        options: AutoTriggerOptions,
    ) {
        this.options = {
            cooldownMs: 3_600_000,
            rateLimitMaxPerWindow: 10,
            rateLimitWindowMs: 60_000,
            ...options,
        };
    }

    /** AUDIT-014 L-2: prune-and-check sliding-window rate-limit. */
    private allowRateLimit(): boolean {
        const max = this.options.rateLimitMaxPerWindow ?? 10;
        const windowMs = this.options.rateLimitWindowMs ?? 60_000;
        const now = Date.now();
        // Drop timestamps outside the window
        this.recentTriggers = this.recentTriggers.filter((t) => now - t < windowMs);
        if (this.recentTriggers.length >= max) {
            console.warn(`[AutoTriggerObserver] rate-limit hit (${max} triggers in ${windowMs}ms), dropping event`);
            return false;
        }
        this.recentTriggers.push(now);
        return true;
    }

    /** Registriert vault.on-Listener. Idempotent. */
    start(): void {
        if (this.listeners.length > 0) return;
        if (!this.options.enabled || !this.options.propertyName) return;

        const onCreate = this.app.vault.on('create', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                void this.maybeTrigger(file);
            }
        });
        const onModify = this.app.vault.on('modify', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                void this.maybeTrigger(file);
            }
        });
        // event-refs koennen via app.vault.offref() entfernt werden
        this.listeners.push(() => this.app.vault.offref(onCreate));
        this.listeners.push(() => this.app.vault.offref(onModify));
    }

    stop(): void {
        for (const off of this.listeners) {
            try { off(); } catch { /* ignore */ }
        }
        this.listeners = [];
    }

    /** Update options at runtime (zB nach Settings-Change). */
    updateOptions(options: AutoTriggerOptions): void {
        this.stop();
        this.options = { cooldownMs: 3_600_000, ...options };
        this.start();
    }

    /** Public fuer Tests. */
    async maybeTrigger(file: TFile): Promise<boolean> {
        if (!this.options.enabled) return false;
        if (!this.matchesAllowList(file.path)) return false;

        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter ?? {};
        const value = fm[this.options.propertyName];
        if (!this.matchesValue(value)) return false;

        const sourceUri = `vault://${file.path}`;
        if (this.triageLog.exists(sourceUri)) return false;
        if (this.triageLog.isInCooldown(sourceUri, this.options.cooldownMs)) return false;

        // AUDIT-014 L-2: Rate-Limit-Check VOR Triage-Log-Write um auch
        // pending-Records nicht zu spam-en bei vault.on-Storm.
        if (!this.allowRateLimit()) return false;

        // Record als pending zuerst (verhindert Doppel-Trigger durch parallele Events)
        const recorded = this.triageLog.record(sourceUri, 'pending');
        if (!recorded) return false;

        try {
            await this.onTrigger(file);
        } catch (err) {
            console.warn(`[AutoTriggerObserver] Trigger failed for ${file.path}:`, err);
        }
        return true;
    }

    private matchesAllowList(path: string): boolean {
        const allow = this.options.folderAllowList;
        if (!allow || allow.length === 0) return true;
        return allow.some((folder) => path.startsWith(folder));
    }

    private matchesValue(value: unknown): boolean {
        if (value === null || value === undefined) return false;
        const expected = this.options.propertyValue;
        const expectedArr = Array.isArray(expected) ? expected : [expected];
        const toScalar = (v: unknown): string => {
            if (typeof v === 'string') return v;
            if (typeof v === 'number' || typeof v === 'boolean') return String(v);
            return '';
        };
        const valueStrs = Array.isArray(value) ? value.map(toScalar) : [toScalar(value)];
        for (const v of valueStrs) {
            if (expectedArr.includes(v)) return true;
        }
        return false;
    }
}
