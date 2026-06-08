/**
 * FactStore -- CRUD + lifecycle for atomic knowledge statements.
 *
 * Public engine API. Constructor-Injection only -- no `obsidian` import,
 * no plugin globals -- so Phase 7 (engine extract) is mechanical.
 *
 * Schema reference: ADR-077 (`facts` table). Lifecycle aligned with
 * ADR-085 (soft delete via `deprecated_at`, no DELETE on facts) and
 * ADR-077 lifecycle classes (`update`, `extend`, `derive`).
 *
 * Use-count is inline only -- no audit row -- because audit volume
 * would explode otherwise (R15 in PLAN-001). Insert / confirm /
 * supersede / deprecate go through `AuditLog`.
 *
 * FEATURE-0315 / PLAN-004 task 2.
 */

import type { MemoryDB } from '../knowledge/MemoryDB';
import { AuditLog } from './AuditLog';
import { normalizeTopics } from './topicSlug';

export type FactKind = 'fact' | 'preference' | 'identity' | 'event';

const ALLOWED_KINDS: ReadonlySet<FactKind> = new Set(['fact', 'preference', 'identity', 'event']);

export interface NewFactInput {
    text: string;
    topics: string[];
    /** 0.0 - 1.0, default 0.5. */
    importance?: number;
    /** Default 'fact'. */
    kind?: FactKind;
    sourceSessionId?: string;
    sourceThreadId?: string;
    /** Default 'obsilo'. */
    sourceInterface?: string;
    sourceUri?: string;
    /**
     * Multi-profile partitioning (UCM-readiness, schema v3). Default 'default'
     * matches Vault Operator's single-user reality; UCM hosts assign per-profile keys
     * like 'work' / 'personal' / 'coding'. The column is indexed.
     */
    profileId?: string;
    metadata?: Record<string, unknown>;
}

export interface Fact {
    id: number;
    text: string;
    topics: string[];
    importance: number;
    kind: FactKind;
    createdAt: string;
    lastConfirmedAt: string;
    confirmationCount: number;
    lastUsedAt?: string;
    useCount: number;
    sourceSessionId?: string;
    sourceThreadId?: string;
    sourceInterface: string;
    sourceUri?: string;
    /** Multi-profile partition key, default 'default' on existing rows. */
    profileId: string;
    supersededBy?: number;
    isLatest: boolean;
    deprecatedAt?: string;
    deprecationReason?: string;
    metadata?: Record<string, unknown>;
}

export interface ListOptions {
    /** Default true: only `is_latest=1 AND deprecated_at IS NULL`. */
    onlyLatest?: boolean;
    /** Optional kind filter. */
    kind?: FactKind;
    /**
     * Multi-profile filter (UCM-readiness). Defaults to undefined =
     * "no profile filter" so existing Vault Operator callers see everything.
     * UCM hosts pass `profileId: 'work'` to scope per partition.
     */
    profileId?: string;
    /** Default 100. */
    limit?: number;
    /** Default `'importance'`. */
    orderBy?: 'importance' | 'last_confirmed_at' | 'last_used_at';
}

export interface SupersedeResult {
    newFact: Fact;
    supersededId: number;
}

export class FactStore {
    private readonly audit: AuditLog;

    constructor(private readonly memoryDB: MemoryDB) {
        this.audit = new AuditLog(memoryDB);
    }

    insert(input: NewFactInput): Fact {
        validateInput(input);
        // FEAT-32-03 PR 3.2 / Audit Finding 17: normalize topics on the
        // write side so the inverted index stores `plan-mode` regardless
        // of whether the extractor produced `Plan Mode`, ` plan-mode `,
        // or `planMode`. Existing rows are migrated by the
        // MemoryV2UpgradeOrchestrator one-time backfill (separate FIX).
        const normalizedTopics = normalizeTopics(input.topics);
        const now = new Date().toISOString();
        const db = this.memoryDB.getDB();
        db.run(
            `INSERT INTO facts
                (text, topics, importance, kind, created_at, last_confirmed_at,
                 confirmation_count, use_count, source_session_id, source_thread_id,
                 source_interface, source_uri, profile_id, is_latest, metadata)
             VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, 1, ?)`,
            [
                input.text,
                JSON.stringify(normalizedTopics),
                input.importance ?? 0.5,
                input.kind ?? 'fact',
                now,
                now,
                input.sourceSessionId ?? null,
                input.sourceThreadId ?? null,
                input.sourceInterface ?? 'obsilo',
                input.sourceUri ?? null,
                input.profileId ?? 'default',
                input.metadata ? JSON.stringify(input.metadata) : null,
            ],
        );
        const id = this.lastInsertId(db);
        this.memoryDB.markDirty();
        this.audit.log({
            operation: 'insert',
            factId: id,
            sessionId: input.sourceSessionId,
            metadata: input.metadata,
        });
        const fact = this.getById(id);
        if (!fact) throw new Error(`FactStore: insert returned no row for id=${id}`);
        return fact;
    }

    getById(id: number): Fact | undefined {
        const db = this.memoryDB.getDB();
        const result = db.exec('SELECT * FROM facts WHERE id = ?', [id]);
        if (result.length === 0 || result[0].values.length === 0) return undefined;
        return rowToFact(result[0].columns, result[0].values[0]);
    }

    listLatest(opts: ListOptions = {}): Fact[] {
        const db = this.memoryDB.getDB();
        const onlyLatest = opts.onlyLatest ?? true;
        const limit = opts.limit ?? 100;
        const orderBy = opts.orderBy ?? 'importance';
        const where: string[] = [];
        const params: unknown[] = [];
        if (onlyLatest) where.push('is_latest = 1 AND deprecated_at IS NULL');
        if (opts.kind) {
            where.push('kind = ?');
            params.push(opts.kind);
        }
        if (opts.profileId !== undefined) {
            where.push('profile_id = ?');
            params.push(opts.profileId);
        }
        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit);
        const result = db.exec(
            `SELECT * FROM facts ${whereClause} ORDER BY ${orderBy} DESC LIMIT ?`,
            params,
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => rowToFact(result[0].columns, row));
    }

    confirm(id: number, sessionId?: string): void {
        const db = this.memoryDB.getDB();
        const now = new Date().toISOString();
        db.run(
            `UPDATE facts
                SET last_confirmed_at = ?, confirmation_count = confirmation_count + 1
              WHERE id = ?`,
            [now, id],
        );
        this.memoryDB.markDirty();
        this.audit.log({ operation: 'confirm', factId: id, sessionId });
    }

    supersede(oldId: number, newInput: NewFactInput): SupersedeResult {
        validateInput(newInput);
        const old = this.getById(oldId);
        if (!old) throw new Error(`FactStore.supersede: old fact ${oldId} not found`);

        // Inherit the old fact's profile by default so a supersede stays in
        // the same partition. Caller can override by setting profileId on
        // newInput explicitly.
        const newFact = this.insert({
            ...newInput,
            profileId: newInput.profileId ?? old.profileId,
        });

        const db = this.memoryDB.getDB();
        db.run(
            `UPDATE facts SET is_latest = 0, superseded_by = ? WHERE id = ?`,
            [newFact.id, oldId],
        );
        this.memoryDB.markDirty();
        this.audit.log({
            operation: 'supersede',
            factId: newFact.id,
            relatedFactId: oldId,
            sessionId: newInput.sourceSessionId,
        });
        return { newFact, supersededId: oldId };
    }

    deprecate(id: number, reason: string, sessionId?: string): void {
        const db = this.memoryDB.getDB();
        const now = new Date().toISOString();
        db.run(
            `UPDATE facts
                SET deprecated_at = ?, deprecation_reason = ?, is_latest = 0
              WHERE id = ?`,
            [now, reason, id],
        );
        this.memoryDB.markDirty();
        this.audit.log({ operation: 'deprecate', factId: id, sessionId, rationale: reason });
    }

    /** Inline counter only -- no audit row. R15. */
    recordUsage(id: number): void {
        const db = this.memoryDB.getDB();
        const now = new Date().toISOString();
        db.run(
            `UPDATE facts SET use_count = use_count + 1, last_used_at = ? WHERE id = ?`,
            [now, id],
        );
        this.memoryDB.markDirty();
    }

    private lastInsertId(db: ReturnType<MemoryDB['getDB']>): number {
        const result = db.exec('SELECT last_insert_rowid()');
        return result[0].values[0][0] as number;
    }
}

function validateInput(input: NewFactInput): void {
    if (!input.text || input.text.trim().length === 0) {
        throw new Error('FactStore: text must be non-empty');
    }
    if (!Array.isArray(input.topics)) {
        throw new Error('FactStore: topics must be an array of strings');
    }
    for (const t of input.topics) {
        if (typeof t !== 'string') throw new Error('FactStore: topic entries must be strings');
    }
    if (input.importance !== undefined) {
        if (typeof input.importance !== 'number' || input.importance < 0 || input.importance > 1) {
            throw new Error('FactStore: importance must be in [0, 1]');
        }
    }
    if (input.kind !== undefined && !ALLOWED_KINDS.has(input.kind)) {
        throw new Error(`FactStore: kind must be one of ${[...ALLOWED_KINDS].join(', ')}`);
    }
}

function rowToFact(columns: string[], row: unknown[]): Fact {
    const idx = (name: string) => columns.indexOf(name);
    const at = (name: string) => row[idx(name)];

    const topicsRaw = at('topics') as string | null;
    let topics: string[] = [];
    try {
        topics = topicsRaw ? JSON.parse(topicsRaw) as string[] : [];
    } catch {
        topics = [];
    }

    const metadataRaw = at('metadata') as string | null;
    let metadata: Record<string, unknown> | undefined;
    if (metadataRaw) {
        try { metadata = JSON.parse(metadataRaw) as Record<string, unknown>; } catch { /* ignore */ }
    }

    return {
        id: at('id') as number,
        text: at('text') as string,
        topics,
        importance: at('importance') as number,
        kind: at('kind') as FactKind,
        createdAt: at('created_at') as string,
        lastConfirmedAt: at('last_confirmed_at') as string,
        confirmationCount: at('confirmation_count') as number,
        lastUsedAt: (at('last_used_at') as string | null) ?? undefined,
        useCount: at('use_count') as number,
        sourceSessionId: (at('source_session_id') as string | null) ?? undefined,
        sourceThreadId: (at('source_thread_id') as string | null) ?? undefined,
        sourceInterface: at('source_interface') as string,
        sourceUri: (at('source_uri') as string | null) ?? undefined,
        profileId: ((at('profile_id') as string | null) ?? 'default'),
        supersededBy: (at('superseded_by') as number | null) ?? undefined,
        isLatest: at('is_latest') === 1,
        deprecatedAt: (at('deprecated_at') as string | null) ?? undefined,
        deprecationReason: (at('deprecation_reason') as string | null) ?? undefined,
        metadata,
    };
}
