import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SnapshotJob, type SnapshotTarget } from '../SnapshotJob';

let workDir: string;

beforeEach(async () => {
    workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'obsilo-snapshot-'));
});

afterEach(async () => {
    await fs.promises.rm(workDir, { recursive: true, force: true });
});

function todayStr(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function writeFakeDB(p: string, marker = 'live'): Promise<void> {
    await fs.promises.writeFile(p, Buffer.from(marker, 'utf-8'));
}

describe('SnapshotJob', () => {
    it('creates a snapshot when none exists for today', async () => {
        const sourcePath = path.join(workDir, 'memory.db');
        await writeFakeDB(sourcePath);

        const job = new SnapshotJob();
        const targets: SnapshotTarget[] = [{ name: 'memory', sourcePath }];
        const results = await job.runDailySnapshot(targets);

        expect(results).toHaveLength(1);
        expect(results[0].action).toBe('created');
        expect(results[0].snapshotPath).toBeDefined();
        const snapshotPath = path.join(workDir, '.bak', 'memory', `${todayStr()}.db`);
        expect(fs.existsSync(snapshotPath)).toBe(true);
    });

    it('skips when today\'s snapshot already exists', async () => {
        const sourcePath = path.join(workDir, 'memory.db');
        await writeFakeDB(sourcePath, 'first');

        const job = new SnapshotJob();
        const targets: SnapshotTarget[] = [{ name: 'memory', sourcePath }];
        await job.runDailySnapshot(targets);

        // Modify live DB and run again same day -- snapshot should not change
        await writeFakeDB(sourcePath, 'second');
        const results = await job.runDailySnapshot(targets);

        expect(results[0].action).toBe('skipped-existing');
        const snapshotPath = path.join(workDir, '.bak', 'memory', `${todayStr()}.db`);
        const snapshotData = await fs.promises.readFile(snapshotPath, 'utf-8');
        expect(snapshotData).toBe('first'); // first snapshot preserved, not overwritten
    });

    it('skips with skipped-no-source when DB is missing', async () => {
        const sourcePath = path.join(workDir, 'never-existed.db');

        const job = new SnapshotJob();
        const results = await job.runDailySnapshot([{ name: 'never', sourcePath }]);

        expect(results[0].action).toBe('skipped-no-source');
    });

    it('cleans up snapshots older than 7 days', async () => {
        const sourcePath = path.join(workDir, 'memory.db');
        await writeFakeDB(sourcePath);
        const job = new SnapshotJob();
        const target: SnapshotTarget = { name: 'memory', sourcePath };

        // Plant an old snapshot manually (10 days back).
        const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const oldDate = `${old.getUTCFullYear()}-${String(old.getUTCMonth() + 1).padStart(2, '0')}-${String(old.getUTCDate()).padStart(2, '0')}`;
        const oldPath = path.join(workDir, '.bak', 'memory', `${oldDate}.db`);
        await fs.promises.mkdir(path.dirname(oldPath), { recursive: true });
        await fs.promises.writeFile(oldPath, 'ancient');
        // Backdate the file mtime so cleanup matches the age cutoff.
        const cutoff = (Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000;
        await fs.promises.utimes(oldPath, cutoff, cutoff);

        // Plant a fresh snapshot (today).
        await job.runDailySnapshot([target]);

        const removed = await job.cleanupOldSnapshots([target]);
        expect(removed).toBe(1);
        expect(fs.existsSync(oldPath)).toBe(false);
        expect(fs.existsSync(path.join(workDir, '.bak', 'memory', `${todayStr()}.db`))).toBe(true);
    });

    it('restoreFromSnapshot replaces the live DB and preserves the prior version', async () => {
        const sourcePath = path.join(workDir, 'memory.db');
        await writeFakeDB(sourcePath, 'snapshot-day');

        const job = new SnapshotJob();
        const target: SnapshotTarget = { name: 'memory', sourcePath };
        await job.runDailySnapshot([target]);

        // Now the live DB drifts forward.
        await writeFakeDB(sourcePath, 'corrupt-or-bad');

        await job.restoreFromSnapshot(target, todayStr());

        const restored = await fs.promises.readFile(sourcePath, 'utf-8');
        expect(restored).toBe('snapshot-day');
        // .pre-restore must contain the version we replaced
        const pre = await fs.promises.readFile(sourcePath + '.pre-restore', 'utf-8');
        expect(pre).toBe('corrupt-or-bad');
    });

    it('restoreFromSnapshot rejects malformed dates', async () => {
        const job = new SnapshotJob();
        await expect(
            job.restoreFromSnapshot(
                { name: 'memory', sourcePath: path.join(workDir, 'memory.db') },
                'not-a-date',
            ),
        ).rejects.toThrow(/Invalid date format/);
    });
});
