/**
 * FactIntegrator -- writes Single-Call output into FactStore + EdgeStore.
 *
 * Phase 4 (FEATURE-0318 / PLAN-007 task B.2). Consumes the
 * `ExtractionResult` produced by `SingleCallExtractor` and applies one
 * of four relation classes per fact candidate:
 *
 *   - `new`:    plain insert.
 *   - `update`: cosine lookup over `fact_embeddings` for facts that
 *               share `topic[0]`; if max cosine >= 0.9 we supersede,
 *               otherwise we fall back to insert (lazy resolution --
 *               we never fail an extraction over an ambiguous update).
 *   - `extend`: insert + `refines` edge to the most similar existing
 *               fact in the same topic. Edge is skipped when no
 *               candidate exists or embeddings are unavailable.
 *   - `derive`: insert + `derived_from` edge, same semantics.
 *
 * Embeddings are produced for every candidate in a single batch call
 * to `EmbeddingService` and persisted to `fact_embeddings` after
 * insert. When the service isn't ready (no provider configured) the
 * integrator degrades gracefully: `update` becomes plain insert,
 * `extend` / `derive` insert without edges, and the run records the
 * skip in stats.
 *
 * Pre-insert noise filter (`importance < 0.2`) lives in
 * SingleCallExtractor; the integrator does not re-filter so callers
 * can audit rejection reasons in one place.
 *
 * Constructor-Injection only -- no obsidian, no plugin globals.
 */

import type { Fact, NewFactInput } from './FactStore';
import type { FactStore } from './FactStore';
import type { EdgeStore } from './EdgeStore';
import type { EmbeddingService } from './EmbeddingService';
import type { MemoryDB } from '../knowledge/MemoryDB';
import type { FactCandidate, FactRelation, MentionCandidate } from './SingleCallExtractor';
import { cosine } from './cosine';

const COSINE_UPDATE_THRESHOLD = 0.9;
const MAX_TOPIC_CANDIDATES = 200;
/**
 * Dedup thresholds for relation=new candidates. Catches the
 * "User dislikes emojis" / "User prefers no emojis" duplicate-fact bug
 * we observed live: the LLM tagged both as new even though they mean
 * the same thing.
 *
 * - >= CONFIRM: treat as a re-confirmation of the existing fact (no
 *   new insert, just bump confirmation_count via FactStore.confirm).
 * - >= UPDATE_PROMOTE && < CONFIRM: promote to relation=update so the
 *   newer wording supersedes the older one.
 */
const COSINE_DEDUP_CONFIRM_THRESHOLD = 0.95;
const COSINE_DEDUP_UPDATE_THRESHOLD = 0.85;

export interface IntegrationInput {
    facts: readonly FactCandidate[];
    mentions: readonly MentionCandidate[];
    sessionId?: string;
    threadId?: string;
    /** Default 'default' (Obsilo single-user). UCM hosts pass per-profile keys. */
    profileId?: string;
    sourceInterface?: string;
    sourceUri?: string;
}

export interface IntegratedFact {
    fact: Fact;
    relation: FactRelation;
    /** Set when an `update` relation triggered a supersede. */
    supersededId?: number;
    /** Set when an `extend` or `derive` relation produced an edge. */
    edgeId?: number;
}

export interface IntegrationStats {
    inserted: number;
    superseded: number;
    refines: number;
    derives: number;
    /** Updates that found no cosine target and degraded to plain insert. */
    updateFallbacks: number;
    /** Extend/derive runs that found no candidate to attach to. */
    edgeFallbacks: number;
    /** new-relation candidates that matched an existing fact closely
     *  enough that we treated them as a confirmation instead of an
     *  insert (cosine >= 0.95 + same topic[0]). */
    dedupedAsConfirm: number;
    /** new-relation candidates close to an existing fact (0.85 <= cosine
     *  < 0.95) that we promoted to update via supersede. */
    dedupedAsUpdate: number;
    /** Per-candidate errors. The other candidates still complete. */
    errors: Array<{ text: string; error: string }>;
}

export interface IntegrationResult {
    integrated: IntegratedFact[];
    stats: IntegrationStats;
}

export class FactIntegrator {
    constructor(
        private readonly factStore: FactStore,
        private readonly edgeStore: EdgeStore,
        private readonly memoryDB: MemoryDB,
        private readonly embeddings: EmbeddingService | null,
    ) {}

    async integrate(input: IntegrationInput): Promise<IntegrationResult> {
        const stats: IntegrationStats = {
            inserted: 0, superseded: 0, refines: 0, derives: 0,
            updateFallbacks: 0, edgeFallbacks: 0,
            dedupedAsConfirm: 0, dedupedAsUpdate: 0,
            errors: [],
        };
        const integrated: IntegratedFact[] = [];

        if (input.facts.length === 0) return { integrated, stats };

        const candEmbeddings = await this.embedCandidates(input.facts);

        for (let i = 0; i < input.facts.length; i++) {
            const cand = input.facts[i];
            const candEmb = candEmbeddings?.[i] ?? null;
            try {
                const result = this.processCandidate(cand, candEmb, input, stats);
                if (result) integrated.push(result);
            } catch (e) {
                stats.errors.push({
                    text: cand.text,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }

        return { integrated, stats };
    }

    // --------------------------------------------------------------
    // Per-relation handlers
    // --------------------------------------------------------------

    private processCandidate(
        cand: FactCandidate,
        candEmb: Float32Array | null,
        input: IntegrationInput,
        stats: IntegrationStats,
    ): IntegratedFact | null {
        switch (cand.relation) {
            case 'new': return this.handleNew(cand, candEmb, input, stats);
            case 'update': return this.handleUpdate(cand, candEmb, input, stats);
            case 'extend': return this.handleExtendOrDerive(cand, candEmb, input, stats, 'refines', 'refines');
            case 'derive': return this.handleExtendOrDerive(cand, candEmb, input, stats, 'derived_from', 'derives');
            default: throw new Error(`FactIntegrator: unknown relation '${cand.relation as string}'`);
        }
    }

    private handleNew(
        cand: FactCandidate,
        candEmb: Float32Array | null,
        input: IntegrationInput,
        stats: IntegrationStats,
    ): IntegratedFact {
        // Dedup pre-check: even when the LLM tagged a candidate as
        // relation=new, it may semantically duplicate an existing fact.
        // We catch the high-cosine case here so duplicates don't pile
        // up under topics like preferences/communication.
        const dup = this.findDuplicate(cand, candEmb, input);
        if (dup && dup.cosine >= COSINE_DEDUP_CONFIRM_THRESHOLD) {
            this.factStore.confirm(dup.fact.id, input.sessionId);
            stats.dedupedAsConfirm += 1;
            return { fact: dup.fact, relation: 'new' };
        }
        if (dup && dup.cosine >= COSINE_DEDUP_UPDATE_THRESHOLD) {
            const { newFact, supersededId } = this.factStore.supersede(
                dup.fact.id,
                this.toNewFactInput(cand, input),
            );
            this.writeEmbedding(newFact.id, candEmb);
            stats.dedupedAsUpdate += 1;
            return { fact: newFact, relation: 'update', supersededId };
        }
        const fact = this.factStore.insert(this.toNewFactInput(cand, input));
        this.writeEmbedding(fact.id, candEmb);
        stats.inserted += 1;
        return { fact, relation: 'new' };
    }

    private findDuplicate(
        cand: FactCandidate,
        candEmb: Float32Array | null,
        input: IntegrationInput,
    ): { fact: Fact; cosine: number } | null {
        if (!candEmb) return null;
        const candidates = this.loadTopicCandidates(cand, input);
        if (candidates.length === 0) return null;
        const embeddings = this.loadEmbeddingsForFacts(candidates.map(c => c.id));
        let best: { fact: Fact; cosine: number } | null = null;
        for (const c of candidates) {
            const emb = embeddings.get(c.id);
            if (!emb) continue;
            const cos = cosine(candEmb, emb);
            if (!best || cos > best.cosine) best = { fact: c, cosine: cos };
        }
        if (!best || best.cosine < COSINE_DEDUP_UPDATE_THRESHOLD) return null;
        return best;
    }

    private handleUpdate(
        cand: FactCandidate,
        candEmb: Float32Array | null,
        input: IntegrationInput,
        stats: IntegrationStats,
    ): IntegratedFact {
        const target = this.findUpdateTarget(cand, candEmb, input);
        if (target) {
            const { newFact, supersededId } = this.factStore.supersede(
                target.id,
                this.toNewFactInput(cand, input),
            );
            this.writeEmbedding(newFact.id, candEmb);
            stats.superseded += 1;
            return { fact: newFact, relation: 'update', supersededId };
        }
        // Lazy fallback: no clear target -> insert as new.
        const fact = this.factStore.insert(this.toNewFactInput(cand, input));
        this.writeEmbedding(fact.id, candEmb);
        stats.inserted += 1;
        stats.updateFallbacks += 1;
        return { fact, relation: 'update' };
    }

    private handleExtendOrDerive(
        cand: FactCandidate,
        candEmb: Float32Array | null,
        input: IntegrationInput,
        stats: IntegrationStats,
        edgeType: string,
        statKey: 'refines' | 'derives',
    ): IntegratedFact {
        const fact = this.factStore.insert(this.toNewFactInput(cand, input));
        this.writeEmbedding(fact.id, candEmb);
        stats.inserted += 1;

        const target = this.findMostSimilar(cand, candEmb, input, fact.id);
        if (!target) {
            stats.edgeFallbacks += 1;
            return { fact, relation: cand.relation };
        }
        const edge = this.edgeStore.addFactEdge(fact.id, target.id, edgeType, {
            weight: target.cosine ?? 1.0,
            sourceInterface: input.sourceInterface,
        });
        stats[statKey] += 1;
        return { fact, relation: cand.relation, edgeId: edge.id };
    }

    // --------------------------------------------------------------
    // Cosine lookup (lazy: only update + extend/derive need it)
    // --------------------------------------------------------------

    private findUpdateTarget(
        cand: FactCandidate,
        candEmb: Float32Array | null,
        input: IntegrationInput,
    ): Fact | null {
        if (!candEmb) return null;
        const candidates = this.loadTopicCandidates(cand, input);
        if (candidates.length === 0) return null;
        const ids = candidates.map(c => c.id);
        const embeddings = this.loadEmbeddingsForFacts(ids);
        let best: { fact: Fact; cosine: number } | null = null;
        for (const c of candidates) {
            const emb = embeddings.get(c.id);
            if (!emb) continue;
            const cos = cosine(candEmb, emb);
            if (!best || cos > best.cosine) best = { fact: c, cosine: cos };
        }
        if (!best || best.cosine < COSINE_UPDATE_THRESHOLD) return null;
        return best.fact;
    }

    private findMostSimilar(
        cand: FactCandidate,
        candEmb: Float32Array | null,
        input: IntegrationInput,
        excludeFactId: number,
    ): { id: number; cosine: number } | null {
        if (!candEmb) return null;
        const candidates = this.loadTopicCandidates(cand, input)
            .filter(c => c.id !== excludeFactId);
        if (candidates.length === 0) return null;
        const ids = candidates.map(c => c.id);
        const embeddings = this.loadEmbeddingsForFacts(ids);
        let best: { id: number; cosine: number } | null = null;
        for (const c of candidates) {
            const emb = embeddings.get(c.id);
            if (!emb) continue;
            const cos = cosine(candEmb, emb);
            if (!best || cos > best.cosine) best = { id: c.id, cosine: cos };
        }
        return best;
    }

    private loadTopicCandidates(cand: FactCandidate, input: IntegrationInput): Fact[] {
        const topic = cand.topics[0];
        if (!topic) return [];
        const all = this.factStore.listLatest({
            profileId: input.profileId,
            limit: MAX_TOPIC_CANDIDATES,
        });
        return all.filter(f => f.topics[0] === topic);
    }

    // --------------------------------------------------------------
    // Embedding helpers
    // --------------------------------------------------------------

    private async embedCandidates(facts: readonly FactCandidate[]): Promise<Float32Array[] | null> {
        if (!this.embeddings || !this.embeddings.isReady()) return null;
        try {
            return await this.embeddings.embed(facts.map(f => f.text));
        } catch {
            return null;
        }
    }

    private writeEmbedding(factId: number, vec: Float32Array | null): void {
        if (!vec) return;
        const model = this.embeddings?.getModelInfo()?.model;
        if (!model) return;
        const bytes = new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength);
        const db = this.memoryDB.getDB();
        db.run(
            `INSERT OR REPLACE INTO fact_embeddings (fact_id, embedding, embedding_model, created_at)
             VALUES (?, ?, ?, ?)`,
            [factId, bytes, model, new Date().toISOString()],
        );
        this.memoryDB.markDirty();
    }

    private loadEmbeddingsForFacts(factIds: readonly number[]): Map<number, Float32Array> {
        const out = new Map<number, Float32Array>();
        if (factIds.length === 0) return out;
        const placeholders = factIds.map(() => '?').join(',');
        const db = this.memoryDB.getDB();
        const result = db.exec(
            `SELECT fact_id, embedding FROM fact_embeddings WHERE fact_id IN (${placeholders})`,
            [...factIds],
        );
        if (result.length === 0) return out;
        for (const row of result[0].values) {
            const id = row[0] as number;
            const blob = row[1] as Uint8Array;
            out.set(id, new Float32Array(blob.buffer.slice(
                blob.byteOffset,
                blob.byteOffset + blob.byteLength,
            )));
        }
        return out;
    }

    // --------------------------------------------------------------
    // Mapping
    // --------------------------------------------------------------

    private toNewFactInput(cand: FactCandidate, input: IntegrationInput): NewFactInput {
        return {
            text: cand.text,
            topics: cand.topics,
            importance: cand.importance,
            kind: cand.kind,
            sourceSessionId: input.sessionId,
            sourceThreadId: input.threadId,
            sourceInterface: input.sourceInterface,
            sourceUri: input.sourceUri,
            profileId: input.profileId,
            metadata: cand.rationale ? { rationale: cand.rationale } : undefined,
        };
    }
}

