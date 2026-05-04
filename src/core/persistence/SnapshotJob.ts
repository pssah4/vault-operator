/**
 * SnapshotJob -- daily DB snapshots into `.bak/{YYYY-MM-DD}.db`.
 *
 * Why: the live `.bak` rotation only ever holds the most recent prior version.
 * One bad day of writes (silent corruption, sync conflict, agent bug) replaces
 * it before the user notices. A 7-day rolling window of date-stamped copies
 * gives a meaningful Undo on top of the per-write rotation, without the storage
 * cost of full backups.
 *
 * Scope: only for storage modes where the DB lives on the local filesystem
 * (`global` and `local`). For `obsidian-sync` we'd be duplicating files inside
 * a synced folder, which iCloud/Dropbox would then replicate -- the same DB
 * three times in three places. C2-Beschluss 2026-04-26 deferred sync-mode
 * snapshots to the persistence service in Klasse C.
 *
 * ADR-079, FEATURE-0314.
 */

import * as fs from 'fs';
import * as path from 'path';

const SNAPSHOT_DIR = '.bak';
const RETENTION_DAYS = 7;
const SNAPSHOT_FILE_REGEX = /^(\d{4}-\d{2}-\d{2})\.db$/;

export interface SnapshotTarget {
    /** Logical name used as snapshot file basename, e.g. 'memory', 'knowledge'. */
    name: string;
    /** Absolute path to the live DB file. */
    sourcePath: string;
}

export interface SnapshotResult {
    name: string;
    action: 'created' | 'skipped-existing' | 'skipped-no-source' | 'error';
    snapshotPath?: string;
    error?: string;
}

export class SnapshotJob {
    /**
     * Run the daily snapshot pass for the given targets. Idempotent for the
     * day: a second call within the same date is a no-op per target.
     */
    async runDailySnapshot(targets: SnapshotTarget[]): Promise<SnapshotResult[]> {
        const today = formatDate(new Date());
        const results: SnapshotResult[] = [];

        for (const target of targets) {
            const result = await this.snapshotTarget(target, today);
            results.push(result);
        }

        return results;
    }

    /** Drop snapshots older than RETENTION_DAYS across every target's snapshot dir. */
    async cleanupOldSnapshots(targets: SnapshotTarget[]): Promise<number> {
        const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
        let removed = 0;

        const seenDirs = new Set<string>();
        for (const target of targets) {
            const snapshotDir = path.join(path.dirname(target.sourcePath), SNAPSHOT_DIR, target.name);
            if (seenDirs.has(snapshotDir)) continue;
            seenDirs.add(snapshotDir);

            const exists = await fs.promises.access(snapshotDir).then(() => true).catch(() => false);
            if (!exists) continue;

            const entries = await fs.promises.readdir(snapshotDir).catch(() => []);
            for (const entry of entries) {
                const match = entry.match(SNAPSHOT_FILE_REGEX);
                if (!match) continue;

                const dateStr = match[1];
                const ageMs = Date.now() - new Date(dateStr).getTime();
                if (ageMs <= RETENTION_DAYS * 24 * 60 * 60 * 1000) continue;

                const filePath = path.join(snapshotDir, entry);
                try {
                    const stats = await fs.promises.stat(filePath);
                    if (stats.mtimeMs < cutoffMs) {
                        await fs.promises.unlink(filePath);
                        removed += 1;
                    }
                } catch (e) {
                    console.warn('[SnapshotJob] cleanup failed for', filePath, e);
                }
            }
        }

        return removed;
    }

    /**
     * Restore a target's live DB from the snapshot taken on `date`. The caller
     * is expected to have closed the live DB first (otherwise sql.js will
     * still have the old bytes in memory when it next saves).
     */
    async restoreFromSnapshot(target: SnapshotTarget, date: string): Promise<void> {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new Error(`Invalid date format, expected YYYY-MM-DD: ${date}`);
        }
        const snapshotPath = this.snapshotPath(target, date);
        const exists = await fs.promises.access(snapshotPath).then(() => true).catch(() => false);
        if (!exists) {
            throw new Error(`No snapshot found for ${target.name} on ${date}: ${snapshotPath}`);
        }

        const data = await fs.promises.readFile(snapshotPath);
        // Move the current live DB out of the way before overwriting; this makes
        // an accidental restore reversible by inspecting the .pre-restore file.
        const preRestorePath = target.sourcePath + '.pre-restore';
        try {
            await fs.promises.rename(target.sourcePath, preRestorePath);
        } catch {
            // No live DB -- restore is starting from scratch.
        }
        await fs.promises.writeFile(target.sourcePath, data);
    }

    /** List available snapshots per target (for the agent tool / UI). */
    async listSnapshots(target: SnapshotTarget): Promise<string[]> {
        const dir = this.snapshotDir(target);
        const exists = await fs.promises.access(dir).then(() => true).catch(() => false);
        if (!exists) return [];

        const entries = await fs.promises.readdir(dir);
        return entries
            .map((e) => e.match(SNAPSHOT_FILE_REGEX))
            .filter((m): m is RegExpMatchArray => m !== null)
            .map((m) => m[1])
            .sort()
            .reverse();
    }

    private async snapshotTarget(target: SnapshotTarget, today: string): Promise<SnapshotResult> {
        const sourceExists = await fs.promises
            .access(target.sourcePath)
            .then(() => true)
            .catch(() => false);
        if (!sourceExists) {
            return { name: target.name, action: 'skipped-no-source' };
        }

        const snapshotPath = this.snapshotPath(target, today);
        const snapshotExists = await fs.promises
            .access(snapshotPath)
            .then(() => true)
            .catch(() => false);
        if (snapshotExists) {
            return { name: target.name, action: 'skipped-existing', snapshotPath };
        }

        try {
            await fs.promises.mkdir(path.dirname(snapshotPath), { recursive: true });
            await fs.promises.copyFile(target.sourcePath, snapshotPath);
            return { name: target.name, action: 'created', snapshotPath };
        } catch (e) {
            return {
                name: target.name,
                action: 'error',
                error: (e as Error).message,
            };
        }
    }

    private snapshotDir(target: SnapshotTarget): string {
        return path.join(path.dirname(target.sourcePath), SNAPSHOT_DIR, target.name);
    }

    private snapshotPath(target: SnapshotTarget, date: string): string {
        return path.join(this.snapshotDir(target), `${date}.db`);
    }
}

function formatDate(d: Date): string {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
