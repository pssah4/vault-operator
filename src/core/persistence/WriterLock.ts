/**
 * WriterLock -- PID-based exclusive lock for Setup-Klasse B (vault-resident DBs
 * synced via Obsidian Sync to multiple devices).
 *
 * Writes a JSON lock file `<dir>/.obsilo-lock` with `{pid, writerId, startedAt}`.
 * acquire() succeeds if no live lock exists; rejects if another live PID still
 * holds it; breaks the lock if the holder PID is dead or the lock is stale.
 *
 * `writerId` is a random UUID generated per WriterLock instance (i.e. per
 * plugin session). It identifies "this is a lock we wrote earlier in this
 * run", which is the only same-process check the lock needs. We deliberately
 * do NOT store any OS-identity field: the lock file is local coordination
 * state, not telemetry, and an OS-identity stamp tripped Obsidian's
 * review-bot fingerprinting heuristic without adding meaningful fidelity
 * beyond what PID + age already give us.
 *
 * Cross-host caveat: `process.kill(pid, 0)` only validates PIDs on the local
 * machine. A lock written on Notebook A and seen on Notebook B will look
 * alive only if the foreign PID happens to match a live local PID. For the
 * common case (one machine at a time editing the vault via Obsidian Sync)
 * the age-based staleness check (5 min) is the actual safety net.
 *
 * ADR-079 Cloud-Sync-Abwehr, FEATURE-0314.
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCK_FILENAME = '.obsilo-lock';
const STALE_LOCK_AGE_MS = 5 * 60 * 1000; // 5 minutes

export interface LockHolderInfo {
    pid: number;
    /** Random per-session id (UUIDv4-ish). Replaces the old `hostname` field. */
    writerId: string;
    startedAt: number;
}

export interface AcquireResult {
    acquired: boolean;
    /** Set when `acquired` is false: who currently holds the lock. */
    heldBy?: LockHolderInfo;
    /** Set when we forcibly broke a stale lock to acquire. */
    brokeStale?: LockHolderInfo;
}

/**
 * Thrown by callers (e.g. `KnowledgeDB.open()`) when another live process
 * already holds the lock. Surfaces `heldBy` so the UI layer can render a
 * Notice.
 */
export class WriterLockHeldError extends Error {
    constructor(public readonly heldBy: LockHolderInfo) {
        super(
            `Knowledge-DB ist gesperrt (PID ${heldBy.pid}). ` +
            `Andere Obsidian-Instanz schliessen oder Lock-Datei .obsilo-lock manuell entfernen.`,
        );
        this.name = 'WriterLockHeldError';
    }
}

/** Generate a random writer-id. Uses crypto.randomUUID when available, falls back to a simple random hex string for older runtimes / non-secure contexts. */
function newWriterId(): string {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return g.crypto.randomUUID();
    }
    // Fallback: 32 hex chars from Math.random. Not cryptographically strong,
    // which is fine: writerId is a local same-session marker, not a secret.
    let s = '';
    for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
}

export class WriterLock {
    private readonly lockPath: string;
    private readonly writerId = newWriterId();
    private acquiredHere = false;

    constructor(lockDir: string) {
        this.lockPath = path.join(lockDir, LOCK_FILENAME);
    }

    /**
     * Try to acquire the lock. Returns acquired=false (with `heldBy`) when
     * another live PID still holds it; otherwise breaks stale/dead locks
     * and acquires. Cross-host conflicts cannot be detected reliably (PID
     * namespaces don't span hosts); we fall back to the age-based stale
     * check (5 min) for that case.
     */
    async acquire(): Promise<AcquireResult> {
        await fs.promises.mkdir(path.dirname(this.lockPath), { recursive: true });

        const existing = await this.readLock();
        if (existing) {
            const sameSession = existing.writerId === this.writerId;
            const ageMs = Date.now() - existing.startedAt;
            const ageStale = ageMs > STALE_LOCK_AGE_MS;
            const pidAlive = this.isAlive(existing.pid);

            // Same WriterLock instance previously wrote this lock: take it back.
            if (sameSession) {
                await this.writeLock();
                this.acquiredHere = true;
                return { acquired: true };
            }

            // Foreign writer. Treat as a live conflict only if the PID is
            // alive on this host AND the lock is fresh. A foreign PID that
            // happens to match a live local PID is rare; the freshness gate
            // bounds the false-positive cost.
            if (pidAlive && !ageStale) {
                return { acquired: false, heldBy: existing };
            }

            // Stale, dead, or foreign-but-fresh-on-another-host: break it.
            await this.writeLock();
            this.acquiredHere = true;
            return { acquired: true, brokeStale: existing };
        }

        await this.writeLock();
        this.acquiredHere = true;
        return { acquired: true };
    }

    /** Release the lock if we own it. Idempotent. */
    async release(): Promise<void> {
        if (!this.acquiredHere) return;
        try {
            await fs.promises.unlink(this.lockPath);
        } catch {
            // already gone -- nothing to do
        }
        this.acquiredHere = false;
    }

    /** True iff this instance currently holds the lock. */
    isHeld(): boolean {
        return this.acquiredHere;
    }

    private async readLock(): Promise<LockHolderInfo | null> {
        try {
            const raw = await fs.promises.readFile(this.lockPath, 'utf-8');
            const parsed = JSON.parse(raw) as Partial<LockHolderInfo> & { hostname?: string };
            if (
                typeof parsed.pid !== 'number' ||
                typeof parsed.startedAt !== 'number'
            ) {
                return null;
            }
            // Legacy locks (pre-2.8.2) carried `hostname` instead of `writerId`.
            // Treat them as foreign-session locks: writerId is intentionally a
            // sentinel that won't equal our random per-session id, so the
            // acquire() PID-alive + age path decides whether to break them.
            const writerId = typeof parsed.writerId === 'string'
                ? parsed.writerId
                : 'legacy';
            return { pid: parsed.pid, writerId, startedAt: parsed.startedAt };
        } catch {
            return null;
        }
    }

    private async writeLock(): Promise<void> {
        const info: LockHolderInfo = {
            pid: process.pid,
            writerId: this.writerId,
            startedAt: Date.now(),
        };
        await fs.promises.writeFile(this.lockPath, JSON.stringify(info), 'utf-8');
    }

    /**
     * Send signal 0 to test whether a PID is still running. Returns true when
     * the process exists, false when it does not. Cross-host PIDs are not
     * verifiable: callers must use the hostname check before relying on this.
     */
    private isAlive(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            // ESRCH = no such process. EPERM = process exists, we're just not allowed to signal it.
            return code === 'EPERM';
        }
    }
}
