/**
 * EdgeStore -- URI-based edges from facts to other facts or external refs.
 *
 * The `fact_edges` table from ADR-077 carries two edge shapes in one
 * relation: fact-to-fact (`to_fact_id` set, `to_external_ref` NULL) and
 * fact-to-external (`to_fact_id` NULL, `to_external_ref` set as a URI like
 * `vault://Notes/X.md` or `entity:UniCredit`). The DB enforces the
 * exclusive-or via a CHECK constraint; this store guards the same shape
 * before issuing the INSERT so the surface is symmetric (TS sees a clear
 * "either fact or ref" API).
 *
 * Edge types stay granular at storage time (`co_occurrence`,
 * `mentions_entity`, `derived_from_episode`, ...). The higher-level
 * `update | extend | derive` lifecycle classes from ADR-077 map onto
 * those granular types in FactIntegrator (Phase 4); EdgeStore itself is
 * type-agnostic.
 *
 * Constructor-Injection only -- no `obsidian`, no plugin globals --
 * for engine-extract readiness (ADR-080).
 *
 * FEATURE-0315 / PLAN-004 task 3.
 */

import type { MemoryDB } from '../knowledge/MemoryDB';

export interface FactEdge {
    id: number;
    fromFactId: number;
    toFactId?: number;
    toExternalRef?: string;
    edgeType: string;
    weight: number;
    createdAt: string;
    sourceInterface: string;
    metadata?: Record<string, unknown>;
}

export interface EdgeOptions {
    /** Default 1.0. */
    weight?: number;
    /** Default 'obsilo'. */
    sourceInterface?: string;
    metadata?: Record<string, unknown>;
}

export class EdgeStore {
    constructor(private readonly memoryDB: MemoryDB) {}

    /** Edge from one fact to another. */
    addFactEdge(fromFactId: number, toFactId: number, edgeType: string, opts: EdgeOptions = {}): FactEdge {
        if (!Number.isInteger(fromFactId) || fromFactId <= 0) {
            throw new Error('EdgeStore: fromFactId must be a positive integer');
        }
        if (!Number.isInteger(toFactId) || toFactId <= 0) {
            throw new Error('EdgeStore: toFactId must be a positive integer');
        }
        if (fromFactId === toFactId) {
            throw new Error('EdgeStore: self-edges are not allowed');
        }
        validateEdgeType(edgeType);
        return this.insert({ fromFactId, toFactId, toExternalRef: undefined, edgeType, opts });
    }

    /** Edge from a fact to an external URI (vault://, entity:, thread://, ...). */
    addExternalEdge(fromFactId: number, toExternalRef: string, edgeType: string, opts: EdgeOptions = {}): FactEdge {
        if (!Number.isInteger(fromFactId) || fromFactId <= 0) {
            throw new Error('EdgeStore: fromFactId must be a positive integer');
        }
        if (typeof toExternalRef !== 'string' || toExternalRef.trim().length === 0) {
            throw new Error('EdgeStore: toExternalRef must be a non-empty string');
        }
        validateEdgeType(edgeType);
        return this.insert({ fromFactId, toFactId: undefined, toExternalRef, edgeType, opts });
    }

    getEdgesFrom(factId: number): FactEdge[] {
        return this.query('WHERE from_fact_id = ?', [factId]);
    }

    getEdgesByType(factId: number, edgeType: string): FactEdge[] {
        return this.query('WHERE from_fact_id = ? AND edge_type = ?', [factId, edgeType]);
    }

    getEdgesToFact(factId: number): FactEdge[] {
        return this.query('WHERE to_fact_id = ?', [factId]);
    }

    getEdgesToRef(externalRef: string): FactEdge[] {
        return this.query('WHERE to_external_ref = ?', [externalRef]);
    }

    /** Hard-delete an edge by id. Edges are not part of the fact lifecycle, so a real DELETE is fine. */
    removeEdge(id: number): void {
        const db = this.memoryDB.getDB();
        db.run('DELETE FROM fact_edges WHERE id = ?', [id]);
        this.memoryDB.markDirty();
    }

    /**
     * Stale-Edge-Lazy-Detection (FEATURE-0317 / PLAN-006 task 7).
     *
     * Mark an edge as stale via `metadata.stale=true` instead of deleting
     * it. Hybrid-Retrieval and ContextRanker respect the flag (score
     * scaled by 0.3) but the URI stays as a reference token. Reasons:
     *   - vault://Notes/X.md not found anymore (rename without cascade)
     *   - https://... 404 / network error
     *   - file:// path missing
     */
    markStale(id: number, reason: string): void {
        const db = this.memoryDB.getDB();
        const result = db.exec('SELECT metadata FROM fact_edges WHERE id = ?', [id]);
        if (result.length === 0 || result[0].values.length === 0) return;
        const raw = result[0].values[0][0] as string | null;
        let metadata: Record<string, unknown> = {};
        if (raw) {
            try { metadata = JSON.parse(raw) as Record<string, unknown>; } catch { /* keep empty */ }
        }
        metadata.stale = true;
        metadata.staleReason = reason;
        metadata.staleAt = new Date().toISOString();
        db.run(
            'UPDATE fact_edges SET metadata = ? WHERE id = ?',
            [JSON.stringify(metadata), id],
        );
        this.memoryDB.markDirty();
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    private insert(args: {
        fromFactId: number;
        toFactId: number | undefined;
        toExternalRef: string | undefined;
        edgeType: string;
        opts: EdgeOptions;
    }): FactEdge {
        const db = this.memoryDB.getDB();
        const now = new Date().toISOString();
        const weight = args.opts.weight ?? 1.0;
        const sourceInterface = args.opts.sourceInterface ?? 'obsilo';
        const metadata = args.opts.metadata ? JSON.stringify(args.opts.metadata) : null;

        db.run(
            `INSERT INTO fact_edges
                (from_fact_id, to_fact_id, to_external_ref, edge_type, weight,
                 created_at, source_interface, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                args.fromFactId,
                args.toFactId ?? null,
                args.toExternalRef ?? null,
                args.edgeType,
                weight,
                now,
                sourceInterface,
                metadata,
            ],
        );
        const id = (db.exec('SELECT last_insert_rowid()')[0].values[0][0] as number);
        this.memoryDB.markDirty();

        return {
            id,
            fromFactId: args.fromFactId,
            toFactId: args.toFactId,
            toExternalRef: args.toExternalRef,
            edgeType: args.edgeType,
            weight,
            createdAt: now,
            sourceInterface,
            metadata: args.opts.metadata,
        };
    }

    private query(whereClause: string, params: unknown[]): FactEdge[] {
        const db = this.memoryDB.getDB();
        const result = db.exec(
            `SELECT id, from_fact_id, to_fact_id, to_external_ref, edge_type, weight,
                    created_at, source_interface, metadata
               FROM fact_edges ${whereClause}
              ORDER BY id`,
            params,
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            id: row[0] as number,
            fromFactId: row[1] as number,
            toFactId: (row[2] as number | null) ?? undefined,
            toExternalRef: (row[3] as string | null) ?? undefined,
            edgeType: row[4] as string,
            weight: row[5] as number,
            createdAt: row[6] as string,
            sourceInterface: row[7] as string,
            metadata: row[8] ? safeParseJson(row[8] as string) : undefined,
        }));
    }
}

function validateEdgeType(edgeType: string): void {
    if (typeof edgeType !== 'string' || edgeType.trim().length === 0) {
        throw new Error('EdgeStore: edgeType must be a non-empty string');
    }
}

function safeParseJson(raw: string): Record<string, unknown> | undefined {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return undefined; }
}
