/**
 * MultiFileAtomicCommit -- coordinated atomic commit across multiple DB files
 * via a journal file.
 *
 * sql.js exports a database as a single Uint8Array. We need both per-file
 * atomicity (no partial write) and cross-file coordination (memory.db and
 * knowledge.db must move forward together) so Memory v2 can rely on a
 * consistent foundation.
 *
 * Pattern (4 phases):
 *   1. Stage every target as `<target>.tmp` via writeAtomic (writeFile + fsync).
 *   2. Write the journal `<appDataDir>/.commit-journal.json` (single fsync).
 *   3. For each target: rotate current to `.bak`, then rename `.tmp` to current.
 *   4. Unlink the journal.
 *
 * Recovery (called on plugin start):
 *   - No journal:        nothing to do.
 *   - Journal + all .tmp present (Phase 3 interrupted): replay Phase 3.
 *   - Journal + any .tmp missing (Phase 1 interrupted): rollback (delete tmps).
 *
 * ADR-079, FEATURE-0314.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface AtomicWrite {
    targetPath: string;
    data: Uint8Array;
}

interface JournalEntry {
    target: string;
    tmp: string;
}

interface Journal {
    id: string;
    pending: JournalEntry[];
    createdAt: number;
}

const JOURNAL_FILENAME = '.commit-journal.json';

export class MultiFileAtomicCommit {
    private readonly journalPath: string;
    private busy: Promise<void> = Promise.resolve();

    constructor(private readonly appDataDir: string) {
        this.journalPath = path.join(appDataDir, JOURNAL_FILENAME);
    }

    /**
     * Commit a batch of writes atomically. Multiple concurrent calls are
     * serialized: only one commit transaction is in flight at a time.
     */
    async commit(writes: AtomicWrite[]): Promise<void> {
        if (writes.length === 0) return;
        const next = this.busy.then(() => this.commitInternal(writes));
        // Replace the chain. Catch is only there to keep the chain alive on failure.
        this.busy = next.catch(() => undefined);
        return next;
    }

    private async commitInternal(writes: AtomicWrite[]): Promise<void> {
        await fs.promises.mkdir(this.appDataDir, { recursive: true });

        const journal: Journal = {
            id: this.makeJournalId(),
            pending: writes.map((w) => ({
                target: w.targetPath,
                tmp: w.targetPath + '.tmp',
            })),
            createdAt: Date.now(),
        };

        // Phase 1: stage every file as .tmp
        for (const w of writes) {
            await fs.promises.mkdir(path.dirname(w.targetPath), { recursive: true });
            await this.writeAtomic(w.targetPath + '.tmp', w.data);
        }

        // Phase 2: write the journal (its presence makes Phase 3 replayable)
        await this.writeAtomic(this.journalPath, Buffer.from(JSON.stringify(journal), 'utf-8'));

        // Phase 3: rotate current to .bak, rename .tmp to current
        for (const entry of journal.pending) {
            await this.rotateAndPromote(entry.target, entry.tmp);
        }

        // Phase 4: drop the journal
        await fs.promises.unlink(this.journalPath).catch(() => undefined);
    }

    /**
     * Inspect the journal on plugin startup and either replay or rollback.
     * Idempotent: safe to call repeatedly.
     */
    async recoverOnStartup(): Promise<{ action: 'none' | 'replay' | 'rollback'; entries: number }> {
        const exists = await fs.promises.access(this.journalPath).then(() => true).catch(() => false);
        if (!exists) return { action: 'none', entries: 0 };

        let journal: Journal;
        try {
            const raw = await fs.promises.readFile(this.journalPath, 'utf-8');
            journal = JSON.parse(raw) as Journal;
        } catch (e) {
            console.warn('[MultiFileAtomicCommit] Journal unreadable, removing:', e);
            await fs.promises.unlink(this.journalPath).catch(() => undefined);
            return { action: 'none', entries: 0 };
        }

        const tmpStates = await Promise.all(
            journal.pending.map((p) =>
                fs.promises.access(p.tmp).then(() => true).catch(() => false),
            ),
        );

        if (tmpStates.every(Boolean)) {
            // Phase 3 was interrupted: complete it
            for (const entry of journal.pending) {
                await this.rotateAndPromote(entry.target, entry.tmp);
            }
            await fs.promises.unlink(this.journalPath).catch(() => undefined);
            console.warn(
                `[MultiFileAtomicCommit] Replayed journal ${journal.id} (${journal.pending.length} files)`,
            );
            return { action: 'replay', entries: journal.pending.length };
        }

        // Phase 1 was interrupted: rollback whatever .tmp files remain
        for (const entry of journal.pending) {
            await fs.promises.unlink(entry.tmp).catch(() => undefined);
        }
        await fs.promises.unlink(this.journalPath).catch(() => undefined);
        console.warn(
            `[MultiFileAtomicCommit] Rolled back journal ${journal.id} (${journal.pending.length} files)`,
        );
        return { action: 'rollback', entries: journal.pending.length };
    }

    /**
     * writeFile + fsync. fsync ensures the bytes hit disk before we move on,
     * so a crash between Phases 1 and 2 leaves recoverable state.
     */
    private async writeAtomic(targetPath: string, data: Uint8Array | Buffer): Promise<void> {
        await fs.promises.writeFile(targetPath, data);
        try {
            const fh = await fs.promises.open(targetPath, 'r+');
            try {
                await fh.sync();
            } finally {
                await fh.close();
            }
        } catch (e) {
            // fsync is best-effort: some filesystems (e.g. remote/networked) reject it.
            console.debug('[MultiFileAtomicCommit] fsync skipped:', e);
        }
    }

    private async rotateAndPromote(target: string, tmp: string): Promise<void> {
        const bak = target + '.bak';
        try {
            await fs.promises.rename(target, bak);
        } catch {
            // First write -- nothing to rotate.
        }
        await fs.promises.rename(tmp, target);
    }

    private makeJournalId(): string {
        return `c-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    }
}
