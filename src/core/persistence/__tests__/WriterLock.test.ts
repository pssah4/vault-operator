import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WriterLock, WriterLockHeldError } from '../WriterLock';

let workDir: string;

beforeEach(async () => {
    workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'obsilo-writerlock-'));
});

afterEach(async () => {
    await fs.promises.rm(workDir, { recursive: true, force: true });
});

describe('WriterLock', () => {
    it('acquires when no lock exists', async () => {
        const lock = new WriterLock(workDir);
        const result = await lock.acquire();
        expect(result.acquired).toBe(true);
        expect(lock.isHeld()).toBe(true);
        expect(fs.existsSync(path.join(workDir, '.obsilo-lock'))).toBe(true);
    });

    it('rejects acquire when a live lock from this process exists', async () => {
        const a = new WriterLock(workDir);
        await a.acquire();

        const b = new WriterLock(workDir);
        const result = await b.acquire();
        expect(result.acquired).toBe(false);
        expect(result.heldBy?.pid).toBe(process.pid);
        expect(b.isHeld()).toBe(false);
    });

    it('breaks a stale lock from a dead PID on the same host', async () => {
        // Pick a PID that is essentially never alive: 99999999 is far above any
        // reasonable Linux/macOS PID. process.kill(deadPid, 0) -> ESRCH.
        const deadPid = 99999999;
        const lockFile = path.join(workDir, '.obsilo-lock');
        await fs.promises.writeFile(
            lockFile,
            JSON.stringify({
                pid: deadPid,
                hostname: os.hostname(),
                startedAt: Date.now() - 10 * 60 * 1000, // 10 min old
            }),
            'utf-8',
        );

        const lock = new WriterLock(workDir);
        const result = await lock.acquire();
        expect(result.acquired).toBe(true);
        expect(result.brokeStale?.pid).toBe(deadPid);

        // The new lock should record THIS process now.
        const raw = JSON.parse(await fs.promises.readFile(lockFile, 'utf-8'));
        expect(raw.pid).toBe(process.pid);
    });

    it('release is idempotent', async () => {
        const lock = new WriterLock(workDir);
        await lock.acquire();
        await lock.release();
        await lock.release(); // second release must not throw
        expect(lock.isHeld()).toBe(false);
        expect(fs.existsSync(path.join(workDir, '.obsilo-lock'))).toBe(false);
    });

    // BUG-029: KnowledgeDB.open()/close() lifecycle relies on this -- a fresh
    // open() after the previous instance closed cleanly must succeed.
    it('release frees the lock for a subsequent acquire', async () => {
        const first = new WriterLock(workDir);
        const r1 = await first.acquire();
        expect(r1.acquired).toBe(true);
        await first.release();

        const second = new WriterLock(workDir);
        const r2 = await second.acquire();
        expect(r2.acquired).toBe(true);
        expect(r2.brokeStale).toBeUndefined();
    });
});

// BUG-029: KnowledgeDB.open() throws this when another live PID holds the lock.
describe('WriterLockHeldError', () => {
    it('carries holder info and renders a German notice message', () => {
        const err = new WriterLockHeldError({
            pid: 4242,
            hostname: 'macbook-test',
            startedAt: 1_700_000_000_000,
        });
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('WriterLockHeldError');
        expect(err.heldBy.pid).toBe(4242);
        expect(err.message).toContain('macbook-test');
        expect(err.message).toContain('4242');
    });
});
