/**
 * FrontmatterIndexer -- Per-Note Hook fuer note_summaries +
 * frontmatter_properties Mirror.
 *
 * Backs FEAT-15-09, FEAT-15-10, FEAT-19-09. Liest pro Note das
 * Frontmatter, spiegelt Properties in die DB. Wenn `Zusammenfassung`
 * existiert: uebernimmt sie in note_summaries. Wenn `autoSummary.enabled`
 * und keine Summary vorhanden: optional via SummaryGenerator generieren
 * (wird hier per Constructor-Injection als optional Hook uebergeben,
 * damit der Indexer kein direktes LLM-Coupling hat).
 *
 * Nicht-blockierend: Failures pro Note werden geloggt, anderen Notes
 * laufen weiter. Idempotent ueber mtime: Re-Index derselben Note ohne
 * Aenderung loest keinen LLM-Call aus.
 */

import { TFile, type App } from 'obsidian';
import type { NoteSummaryStore } from '../knowledge/NoteSummaryStore';
import type { FrontmatterPropertyStore } from '../knowledge/FrontmatterPropertyStore';

/**
 * Optional callback fuer Auto-Summary-Generation. Wird vom Plugin
 * mit einem konkreten LLM-Aufruf gefuellt (siehe SummaryGenerator
 * oder analoges Modul). Wenn nicht uebergeben: Indexer macht keine
 * Auto-Generation, nur Frontmatter-Read.
 */
export type SummaryGeneratorFn = (input: {
    notePath: string;
    content: string;
}) => Promise<{ summary: string; modelUsed: string } | null>;

export interface FrontmatterIndexerOptions {
    /** Default true: Frontmatter-Properties immer in frontmatter_properties spiegeln. */
    syncProperties?: boolean;
    /** Default false: ignore notes outside specific folders. */
    folderAllowList?: string[];
    /** Default false: nur generieren wenn explizit enabled (Setting-gated). */
    autoSummaryEnabled?: boolean;
    /** Optional Summary-Generator-Hook. Wenn null: kein Generate. */
    summaryGenerator?: SummaryGeneratorFn;
}

export interface IndexingResult {
    noteIndexed: number;
    summariesUpdated: number;
    summariesGenerated: number;
    propertiesMirrored: number;
    skipped: number;
    errors: number;
}

export class FrontmatterIndexer {
    constructor(
        private readonly app: App,
        private readonly noteSummaryStore: NoteSummaryStore,
        private readonly frontmatterPropertyStore: FrontmatterPropertyStore,
        private readonly options: FrontmatterIndexerOptions = {},
    ) {}

    /**
     * Indexiert eine einzelne Note. Idempotent ueber mtime.
     * Returns 'skipped' wenn Note unveraendert seit letztem Index.
     */
    async indexNote(file: TFile): Promise<{
        summaryUpdated: boolean;
        summaryGenerated: boolean;
        propertiesMirrored: boolean;
        skipped: boolean;
        error?: string;
    }> {
        if (!this.isAllowed(file.path)) {
            return { summaryUpdated: false, summaryGenerated: false, propertiesMirrored: false, skipped: true };
        }

        const sourceMtime = file.stat.mtime;
        const cached = this.noteSummaryStore.get(file.path);
        const mtimeUnchanged = cached !== null && cached.sourceMtime === sourceMtime;

        try {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter ?? {};

            // Properties immer spiegeln (cheap, kein LLM-Call).
            let propsWritten = false;
            if (this.options.syncProperties !== false) {
                this.mirrorProperties(file.path, fm);
                propsWritten = true;
            }

            // Summary-Logik: Frontmatter "Zusammenfassung" hat Vorrang.
            const fmSummary = readFrontmatterSummary(fm);
            if (fmSummary && (cached === null || cached.summary !== fmSummary || !mtimeUnchanged)) {
                this.noteSummaryStore.upsert(file.path, fmSummary, 'frontmatter', sourceMtime);
                return {
                    summaryUpdated: true,
                    summaryGenerated: false,
                    propertiesMirrored: propsWritten,
                    skipped: false,
                };
            }

            // Wenn Summary vorhanden und mtime unveraendert: skip.
            if (cached && mtimeUnchanged) {
                return {
                    summaryUpdated: false,
                    summaryGenerated: false,
                    propertiesMirrored: propsWritten,
                    skipped: true,
                };
            }

            // Auto-Generate-Pfad (Setting-gated).
            if (this.options.autoSummaryEnabled && this.options.summaryGenerator) {
                const content = await this.app.vault.cachedRead(file);
                const generated = await this.options.summaryGenerator({
                    notePath: file.path,
                    content,
                });
                if (generated) {
                    this.noteSummaryStore.upsert(file.path, generated.summary, generated.modelUsed, sourceMtime);
                    return {
                        summaryUpdated: false,
                        summaryGenerated: true,
                        propertiesMirrored: propsWritten,
                        skipped: false,
                    };
                }
            }

            return {
                summaryUpdated: false,
                summaryGenerated: false,
                propertiesMirrored: propsWritten,
                skipped: false,
            };
        } catch (err) {
            console.warn(`[FrontmatterIndexer] failed for ${file.path}:`, err);
            return {
                summaryUpdated: false,
                summaryGenerated: false,
                propertiesMirrored: false,
                skipped: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /** Bulk-Indexing-Helper. Sequentiell um LLM-Rate-Limits zu schonen. */
    async indexNotes(files: TFile[]): Promise<IndexingResult> {
        const result: IndexingResult = {
            noteIndexed: 0,
            summariesUpdated: 0,
            summariesGenerated: 0,
            propertiesMirrored: 0,
            skipped: 0,
            errors: 0,
        };
        for (const file of files) {
            const r = await this.indexNote(file);
            result.noteIndexed++;
            if (r.summaryUpdated) result.summariesUpdated++;
            if (r.summaryGenerated) result.summariesGenerated++;
            if (r.propertiesMirrored) result.propertiesMirrored++;
            if (r.skipped) result.skipped++;
            if (r.error) result.errors++;
        }
        return result;
    }

    private isAllowed(path: string): boolean {
        const allow = this.options.folderAllowList;
        if (!allow || allow.length === 0) return true;
        return allow.some((folder) => path.startsWith(folder));
    }

    private mirrorProperties(notePath: string, fm: Record<string, unknown>): void {
        const out: Record<string, string | string[]> = {};
        for (const [name, value] of Object.entries(fm)) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'string') {
                out[name] = value;
            } else if (typeof value === 'number' || typeof value === 'boolean') {
                out[name] = String(value);
            } else if (Array.isArray(value)) {
                out[name] = value.map((v) => String(v));
            } else if (typeof value === 'object') {
                // Skip nested objects (Properties sind flach in Obsidian).
                continue;
            }
        }
        this.frontmatterPropertyStore.replaceForNote(notePath, out);
    }
}

/** Liest "Zusammenfassung" oder "summary" aus Frontmatter. */
export function readFrontmatterSummary(fm: Record<string, unknown>): string | null {
    const candidates = ['Zusammenfassung', 'zusammenfassung', 'summary', 'Summary'];
    for (const key of candidates) {
        const value = fm[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}
