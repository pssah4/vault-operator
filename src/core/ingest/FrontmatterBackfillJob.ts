/**
 * FrontmatterBackfillJob -- One-Shot Job zum Ergaenzen fehlender
 * Frontmatter-Properties auf bestehenden Vault-Notes.
 *
 * Backs FEAT-19-10 (Frontmatter-Write Toggle plus Backfill-Job).
 * Loese Sebastians Backfill-Schmerz: bei Aktivierung von autoSummary.
 * writeFrontmatter werden 1.500 bestehende Notes durchgegangen, fehlende
 * Properties ergaenzt, NIEMALS bestehende ueberschrieben (ADR-95).
 *
 * Pause/Resume/Abort Steuerung. Progress-Callback fuer UI. Pre-Diff-
 * Preview wird vom Caller (UI) ausgefuehrt; der Job liefert
 * pro-Note-Result-Records.
 */

import { TFile, type App, type Vault } from 'obsidian';
import { FrontmatterWriter, type FrontmatterPatch, type FrontmatterWriterOptions, type WriteResult } from './FrontmatterWriter';
import { FrontmatterIndexer, type SummaryGeneratorFn } from './FrontmatterIndexer';
import type { NoteSummaryStore } from '../knowledge/NoteSummaryStore';
import type { FrontmatterPropertyStore } from '../knowledge/FrontmatterPropertyStore';

export interface BackfillProgress {
    total: number;
    processed: number;
    summariesWritten: number;
    propertiesWritten: number;
    skipped: number;
    errors: number;
    currentPath: string | null;
}

export type ProgressListener = (progress: BackfillProgress) => void;

export interface BackfillJobOptions {
    /** Folder-allowlist. Empty = whole vault. */
    folderAllowList?: string[];
    /** Wenn true: jede Note bekommt einen DRY-RUN Patch (kein Write). */
    dryRun?: boolean;
    /** Optional: cap total files (for testing or budget control). */
    maxFiles?: number;
}

export class FrontmatterBackfillJob {
    private cancelled = false;
    private paused = false;
    private running = false;

    private progress: BackfillProgress = {
        total: 0,
        processed: 0,
        summariesWritten: 0,
        propertiesWritten: 0,
        skipped: 0,
        errors: 0,
        currentPath: null,
    };

    constructor(
        private readonly app: App,
        private readonly noteSummaryStore: NoteSummaryStore,
        private readonly frontmatterPropertyStore: FrontmatterPropertyStore,
        private readonly writerOptions: FrontmatterWriterOptions,
        private readonly summaryGenerator: SummaryGeneratorFn | null = null,
    ) {}

    isRunning(): boolean { return this.running; }
    isPaused(): boolean { return this.paused; }
    getProgress(): BackfillProgress { return { ...this.progress }; }

    async run(options: BackfillJobOptions = {}, onProgress?: ProgressListener): Promise<BackfillProgress> {
        if (this.running) throw new Error('Backfill already running');
        this.running = true;
        this.cancelled = false;
        this.paused = false;
        this.progress = {
            total: 0, processed: 0, summariesWritten: 0,
            propertiesWritten: 0, skipped: 0, errors: 0, currentPath: null,
        };

        try {
            const files = this.collectFiles(options);
            this.progress.total = files.length;

            const writer = new FrontmatterWriter(this.app, this.writerOptions);
            const indexer = new FrontmatterIndexer(
                this.app,
                this.noteSummaryStore,
                this.frontmatterPropertyStore,
                {
                    autoSummaryEnabled: this.summaryGenerator !== null,
                    summaryGenerator: this.summaryGenerator ?? undefined,
                },
            );

            for (const file of files) {
                if (this.cancelled) break;
                while (this.paused && !this.cancelled) {
                    await sleep(100);
                }
                if (this.cancelled) break;

                this.progress.currentPath = file.path;
                onProgress?.(this.getProgress());

                try {
                    // Phase 1: indexer reads frontmatter, mirrors properties, optional generates summary in DB.
                    const ir = await indexer.indexNote(file);
                    if (ir.skipped) {
                        this.progress.skipped++;
                    }
                    if (ir.summaryUpdated || ir.summaryGenerated) {
                        this.progress.summariesWritten++;
                    }
                    if (ir.propertiesMirrored) {
                        this.progress.propertiesWritten++;
                    }
                    if (ir.error) {
                        this.progress.errors++;
                    }

                    // Phase 2: write missing properties back to vault frontmatter (FEAT-19-10).
                    if (!options.dryRun && ir.summaryGenerated) {
                        const cached = this.noteSummaryStore.get(file.path);
                        if (cached) {
                            const patch: FrontmatterPatch = {
                                Zusammenfassung: { value: cached.summary },
                            };
                            const wr: WriteResult = await writer.write(file, patch);
                            if (!wr.written && wr.skippedReason === 'error') {
                                this.progress.errors++;
                            }
                        }
                    }
                } catch (err) {
                    this.progress.errors++;
                    console.warn(`[Backfill] failed for ${file.path}:`, err);
                }

                this.progress.processed++;
                onProgress?.(this.getProgress());
            }
        } finally {
            this.running = false;
            this.progress.currentPath = null;
        }

        onProgress?.(this.getProgress());
        return this.getProgress();
    }

    pause(): void { this.paused = true; }
    resume(): void { this.paused = false; }
    cancel(): void { this.cancelled = true; this.paused = false; }

    private collectFiles(options: BackfillJobOptions): TFile[] {
        const allow = options.folderAllowList;
        const vault = this.app.vault as Vault;
        const all = vault.getMarkdownFiles();
        const filtered = allow && allow.length > 0
            ? all.filter((f) => allow.some((folder) => f.path.startsWith(folder)))
            : all;
        const capped = options.maxFiles ? filtered.slice(0, options.maxFiles) : filtered;
        return capped;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
}
