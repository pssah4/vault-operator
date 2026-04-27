import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MultiFileAtomicCommit } from '../MultiFileAtomicCommit';

let workDir: string;

beforeEach(async () => {
    workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'obsilo-multi-commit-'));
});

afterEach(async () => {
    await fs.promises.rm(workDir, { recursive: true, force: true });
});

function readBytes(p: string): Uint8Array {
    return new Uint8Array(fs.readFileSync(p));
}

describe('MultiFileAtomicCommit', () => {
    it('commits multiple files atomically (happy path)', async () => {
        const helper = new MultiFileAtomicCommit(workDir);
        const a = path.join(workDir, 'a.db');
        const b = path.join(workDir, 'b.db');
        const dataA = new Uint8Array([1, 2, 3]);
        const dataB = new Uint8Array([4, 5, 6, 7]);

        await helper.commit([
            { targetPath: a, data: dataA },
            { targetPath: b, data: dataB },
        ]);

        expect(readBytes(a)).toEqual(dataA);
        expect(readBytes(b)).toEqual(dataB);
        // No journal or .tmp left behind
        expect(fs.existsSync(path.join(workDir, '.commit-journal.json'))).toBe(false);
        expect(fs.existsSync(a + '.tmp')).toBe(false);
        expect(fs.existsSync(b + '.tmp')).toBe(false);
    });

    it('rotates the previous version into .bak on a second commit', async () => {
        const helper = new MultiFileAtomicCommit(workDir);
        const target = path.join(workDir, 'rotating.db');
        const v1 = new Uint8Array([1, 1, 1]);
        const v2 = new Uint8Array([2, 2, 2, 2]);

        await helper.commit([{ targetPath: target, data: v1 }]);
        await helper.commit([{ targetPath: target, data: v2 }]);

        expect(readBytes(target)).toEqual(v2);
        expect(fs.existsSync(target + '.bak')).toBe(true);
        expect(readBytes(target + '.bak')).toEqual(v1);
    });

    it('replays an interrupted commit (Phase 3 crash) on recoverOnStartup', async () => {
        const helper = new MultiFileAtomicCommit(workDir);
        const target = path.join(workDir, 'crashy.db');
        const data = new Uint8Array([9, 9, 9]);

        // Simulate a crash mid-Phase 3: stage tmp + write journal, but never rename.
        await fs.promises.writeFile(target + '.tmp', Buffer.from(data));
        const journal = {
            id: 'sim',
            pending: [{ target, tmp: target + '.tmp' }],
            createdAt: Date.now(),
        };
        await fs.promises.writeFile(
            path.join(workDir, '.commit-journal.json'),
            JSON.stringify(journal),
            'utf-8',
        );

        const result = await helper.recoverOnStartup();
        expect(result.action).toBe('replay');
        expect(result.entries).toBe(1);
        expect(readBytes(target)).toEqual(data);
        expect(fs.existsSync(target + '.tmp')).toBe(false);
        expect(fs.existsSync(path.join(workDir, '.commit-journal.json'))).toBe(false);
    });

    it('rolls back when .tmp files are missing (Phase 1 crash)', async () => {
        const helper = new MultiFileAtomicCommit(workDir);
        const target = path.join(workDir, 'rollback.db');

        // Journal exists, but the .tmp it points at does not -- Phase 1 was incomplete.
        const journal = {
            id: 'sim',
            pending: [{ target, tmp: target + '.tmp' }],
            createdAt: Date.now(),
        };
        await fs.promises.writeFile(
            path.join(workDir, '.commit-journal.json'),
            JSON.stringify(journal),
            'utf-8',
        );

        const result = await helper.recoverOnStartup();
        expect(result.action).toBe('rollback');
        expect(fs.existsSync(target)).toBe(false);
        expect(fs.existsSync(path.join(workDir, '.commit-journal.json'))).toBe(false);
    });

    it('serializes concurrent commits', async () => {
        const helper = new MultiFileAtomicCommit(workDir);
        const target = path.join(workDir, 'serial.db');

        const writes: Promise<void>[] = [];
        for (let i = 0; i < 5; i++) {
            writes.push(helper.commit([{ targetPath: target, data: new Uint8Array([i]) }]));
        }
        await Promise.all(writes);

        // The final state must be one of the writes (last one wins under serialization).
        const final = readBytes(target);
        expect(final.length).toBe(1);
        expect(final[0]).toBeGreaterThanOrEqual(0);
        expect(final[0]).toBeLessThanOrEqual(4);
        // No leftover .tmp / journal
        expect(fs.existsSync(target + '.tmp')).toBe(false);
        expect(fs.existsSync(path.join(workDir, '.commit-journal.json'))).toBe(false);
    });
});
