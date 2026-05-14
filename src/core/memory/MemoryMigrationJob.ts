/**
 * MemoryMigrationJob -- one-shot pipeline that migrates the legacy v1
 * memory MD files into the v2 fact + communication-style schema.
 *
 * Differentiated handling per file (FEATURE-0316 / PLAN-005 task 4):
 *
 *   user-profile.md, projects.md, patterns.md,         -> facts via Atomizer
 *     errors.md, custom-tools.md
 *
 *   soul.md                                            -> communication_styles
 *                                                        (single style row,
 *                                                        context_match='default')
 *
 *   knowledge.md                                       -> skip (stays as
 *                                                        on-demand vault note)
 *
 * Each source file is copied to `memory-v1-backup/{ISO}/{name}` BEFORE the
 * job touches the engine stores. The originals are NOT deleted -- Phase 5
 * (Living Document UX) will retire them after live verification proves
 * v2 stable.
 *
 * Dedup key for fact inserts: `(text, source_uri)`. A re-run after a
 * crash mid-job is therefore safe -- already-inserted candidates are
 * skipped, missing ones are added.
 *
 * Constructor-Injection only -- no obsidian, no plugin globals (ADR-080).
 */

import type { FileAdapter } from '../storage/types';
import type { FactStore } from './FactStore';
import type { CommunicationStyleStore } from './CommunicationStyleStore';
import type { MemoryAtomizer, FactCandidate } from './MemoryAtomizer';

export interface MigrationOptions {
    /** Don't write to stores; only report what would happen. Default false. */
    dryRun?: boolean;
    /** Override the source folder. Default: 'memory'. */
    sourceFolder?: string;
    /** Override the backup folder root. Default: 'memory-v1-backup'. */
    backupFolderRoot?: string;
    /** ISO timestamp -- override for tests. Default: new Date().toISOString(). */
    timestamp?: string;
    /** Default importance assigned by the Atomizer when LLM omits it. */
    defaultImportance?: number;
}

export interface FileMigrationReport {
    file: string;
    handled: 'facts' | 'style' | 'skipped' | 'missing';
    candidatesProposed: number;
    candidatesInserted: number;
    candidatesDeduped: number;
    candidatesRejected: number;
    backupPath?: string;
    notes?: string;
}

export interface MigrationReport {
    timestamp: string;
    backupFolder: string;
    dryRun: boolean;
    files: FileMigrationReport[];
    totalFactsInserted: number;
    totalStylesInserted: number;
}

const FILES_TO_ATOMIZE = ['user-profile.md', 'projects.md', 'patterns.md', 'errors.md', 'custom-tools.md'] as const;
const STYLE_FILE = 'soul.md';
const SKIP_FILES = ['knowledge.md'];

export class MemoryMigrationJob {
    constructor(
        private readonly fs: FileAdapter,
        private readonly factStore: FactStore,
        private readonly styleStore: CommunicationStyleStore,
        private readonly atomizer: MemoryAtomizer,
    ) {}

    async run(opts: MigrationOptions = {}): Promise<MigrationReport> {
        const dryRun = opts.dryRun ?? false;
        const sourceFolder = opts.sourceFolder ?? 'memory';
        const backupRoot = opts.backupFolderRoot ?? 'memory-v1-backup';
        const timestamp = opts.timestamp ?? new Date().toISOString();
        // ISO timestamps contain colons; replace for filesystem-safe folder names.
        const safeStamp = timestamp.replace(/[:]/g, '-');
        const backupFolder = `${backupRoot}/${safeStamp}`;

        if (!dryRun) {
            await this.fs.mkdir(backupFolder);
        }

        const reports: FileMigrationReport[] = [];
        let totalFactsInserted = 0;
        let totalStylesInserted = 0;

        for (const name of FILES_TO_ATOMIZE) {
            const report = await this.migrateFactsFile(
                name, sourceFolder, backupFolder, dryRun, opts.defaultImportance,
            );
            reports.push(report);
            totalFactsInserted += report.candidatesInserted;
        }

        const styleReport = await this.migrateStyleFile(
            STYLE_FILE, sourceFolder, backupFolder, dryRun,
        );
        reports.push(styleReport);
        totalStylesInserted += styleReport.candidatesInserted;

        for (const name of SKIP_FILES) {
            reports.push({
                file: name,
                handled: 'skipped',
                candidatesProposed: 0,
                candidatesInserted: 0,
                candidatesDeduped: 0,
                candidatesRejected: 0,
                notes: 'knowledge.md stays as on-demand vault note (FEATURE-0316 scope decision)',
            });
        }

        return {
            timestamp,
            backupFolder,
            dryRun,
            files: reports,
            totalFactsInserted,
            totalStylesInserted,
        };
    }

    // -----------------------------------------------------------------------
    // Per-file pipelines
    // -----------------------------------------------------------------------

    private async migrateFactsFile(
        name: string,
        sourceFolder: string,
        backupFolder: string,
        dryRun: boolean,
        defaultImportance: number | undefined,
    ): Promise<FileMigrationReport> {
        const sourcePath = `${sourceFolder}/${name}`;
        const sourceUri = `vault://${sourcePath}`;
        const exists = await this.fs.exists(sourcePath);
        if (!exists) {
            return baseReport(name, 'missing', 'source file does not exist (skipped)');
        }

        const content = await this.fs.read(sourcePath);
        if (content.trim().length === 0) {
            return baseReport(name, 'facts', 'source file is empty');
        }

        let backupPath: string | undefined;
        if (!dryRun) {
            backupPath = `${backupFolder}/${name}`;
            await this.fs.write(backupPath, content);
        }

        const atomized = await this.atomizer.atomize(content, {
            sourceLabel: name,
            defaultImportance,
        });

        const proposed = atomized.candidates.length;
        const rejected = atomized.rejected.length;
        let inserted = 0;
        let deduped = 0;

        for (const candidate of atomized.candidates) {
            if (dryRun) {
                inserted += 1;
                continue;
            }
            if (this.isDuplicate(candidate, sourceUri)) {
                deduped += 1;
                continue;
            }
            this.factStore.insert({
                text: candidate.text,
                topics: candidate.topics,
                importance: candidate.importance,
                kind: candidate.kind,
                sourceUri,
                metadata: candidate.rationale ? { rationale: candidate.rationale } : undefined,
            });
            inserted += 1;
        }

        return {
            file: name,
            handled: 'facts',
            candidatesProposed: proposed,
            candidatesInserted: inserted,
            candidatesDeduped: deduped,
            candidatesRejected: rejected,
            backupPath,
        };
    }

    private async migrateStyleFile(
        name: string,
        sourceFolder: string,
        backupFolder: string,
        dryRun: boolean,
    ): Promise<FileMigrationReport> {
        const sourcePath = `${sourceFolder}/${name}`;
        const exists = await this.fs.exists(sourcePath);
        if (!exists) {
            return baseReport(name, 'missing', 'source file does not exist (skipped)');
        }
        const content = (await this.fs.read(sourcePath)).trim();
        if (content.length === 0) {
            return baseReport(name, 'style', 'source file is empty');
        }

        let backupPath: string | undefined;
        if (!dryRun) {
            backupPath = `${backupFolder}/${name}`;
            await this.fs.write(backupPath, content);
        }

        if (dryRun) {
            return {
                file: name, handled: 'style',
                candidatesProposed: 1, candidatesInserted: 1,
                candidatesDeduped: 0, candidatesRejected: 0,
            };
        }

        // soul.md is treated as one block of style guidance, not atomised --
        // it is in-corpus voice/persona language, not factual statements.
        this.styleStore.addStyle({
            contextMatch: 'default',
            styleDescription: content,
            importance: 0.7,
            metadata: { sourceUri: `vault://${sourcePath}`, migratedFrom: 'soul.md' },
        });

        return {
            file: name, handled: 'style',
            candidatesProposed: 1, candidatesInserted: 1,
            candidatesDeduped: 0, candidatesRejected: 0,
            backupPath,
        };
    }

    private isDuplicate(candidate: FactCandidate, sourceUri: string): boolean {
        // Cheap dedup by exact (text, source_uri) -- enough for re-run safety.
        // The FactStore listLatest scan is bounded by sourceUri filter.
        const existing = this.factStore.listLatest({ onlyLatest: false, limit: 10000 });
        return existing.some(f => f.sourceUri === sourceUri && f.text === candidate.text);
    }
}

function baseReport(file: string, handled: FileMigrationReport['handled'], notes?: string): FileMigrationReport {
    return {
        file, handled,
        candidatesProposed: 0, candidatesInserted: 0,
        candidatesDeduped: 0, candidatesRejected: 0,
        notes,
    };
}
