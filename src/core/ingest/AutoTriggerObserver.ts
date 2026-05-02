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
}

export type TriggerCallback = (file: TFile) => void | Promise<void>;

export class AutoTriggerObserver {
    private listeners: Array<() => void> = [];
    private options: AutoTriggerOptions;

    constructor(
        private readonly app: App,
        private readonly triageLog: IngestTriageLogStore,
        private readonly onTrigger: TriggerCallback,
        options: AutoTriggerOptions,
    ) {
        this.options = { cooldownMs: 3_600_000, ...options };
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
        const valueStrs = Array.isArray(value) ? value.map(String) : [String(value)];
        for (const v of valueStrs) {
            if (expectedArr.includes(v)) return true;
        }
        return false;
    }
}
