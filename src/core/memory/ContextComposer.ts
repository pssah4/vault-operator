/**
 * ContextComposer -- builds the per-conversation Memory-Block.
 *
 * Pipeline (FEATURE-0317):
 *   1. Topic-Lock per session: TopicInference pick on first turn,
 *      cosine-drift check on every subsequent turn (threshold 0.6).
 *   2. Cold-Start fallback: if the locked topic has < 5 facts, pull
 *      the most recent N facts irrespective of topic.
 *   3. Hot-path retrieval: FactStore latest-by-importance filtered
 *      by the locked topic, plus optional graph walks (UnifiedGraphService)
 *      and the user-profile basics.
 *   4. Context-aware rerank (ContextRanker): topic-lock boost,
 *      recency boost, identity boost, event decay, stale penalty.
 *   5. Markdown render -- stable structure so KV-cache stays warm.
 *
 * The composer is stateful per session via an in-memory Map; the
 * caller supplies a sessionId. There is no persistence -- a plugin
 * reload resets locks (which is fine; the next user message re-infers).
 *
 * Constructor-Injection only, no obsidian, no plugin globals.
 *
 * FEATURE-0317 / PLAN-006 task 6.
 */

import type { Fact } from './FactStore';
import { FactStore } from './FactStore';
import { TopicInference } from './TopicInference';
import { UserProfileView, type UserProfile } from './UserProfileView';
import { rerank } from './ContextRanker';
import { isColdStart, type RecallHit } from './RecallHit';
import type { MemoryDB } from '../knowledge/MemoryDB';
import type { DriftEventBus } from './DriftEventBus';

const DRIFT_THRESHOLD = 0.6;
const COLD_START_THRESHOLD = 5;

export interface TopicLock {
    topic: string;
    score: number;
    /** Cached centroid for fast drift detection on follow-up turns. */
    centroid?: Float32Array;
}

export interface ComposeInput {
    sessionId: string;
    /** Embedding of the latest user message; null = use cached lock as-is. */
    userMessageEmbedding: Float32Array | null;
    /** Caller-supplied "now" so output stays deterministic in tests. */
    now?: Date;
    /** Override the lock detection -- useful for power-users or recovery. */
    topicLockOverride?: string;
    /**
     * Multi-profile selector (UCM-readiness). When provided, retrieval
     * filters facts to this profile only. Obsilo passes nothing today =
     * "all profiles" (effectively just 'default'); UCM hosts pass
     * 'work' / 'personal' / 'coding' to scope the hot-memory block.
     */
    profile?: string;
    /** Cap on the number of hits to render. Default 8. */
    maxHits?: number;
    /**
     * FEAT-03-26 (BA-25): optional pre-rendered Top-Hub-Block, der vor
     * dem Memory-Block in den stabilen Prompt-Prefix gehaengt wird
     * (KV-Cache-tauglich). Wird vom Caller (Plugin) erzeugt und
     * gecached; ContextComposer prefixt nur. Empty string = kein Block.
     */
    topHubBlockMarkdown?: string;
}

export interface ComposedContext {
    markdown: string;
    hits: RecallHit[];
    topicLock: TopicLock | null;
    /**
     * Set when the topic-lock changed mid-conversation due to drift.
     * FactExtractor (Phase 4) uses this to schedule a re-extract job.
     */
    driftEvent?: {
        previousTopic: string;
        newTopic: string | null;
        score: number;
    };
    /** True when the cold-start branch was taken (less than 5 facts on topic). */
    coldStart: boolean;
}

export class ContextComposer {
    private readonly locks = new Map<string, TopicLock>();
    private readonly factStore: FactStore;

    constructor(
        private readonly memoryDB: MemoryDB,
        private readonly topicInference: TopicInference,
        private readonly profileView: UserProfileView,
        /** Optional drift bus -- emits when mid-conversation drift fires. */
        private readonly driftBus: DriftEventBus | null = null,
    ) {
        this.factStore = new FactStore(memoryDB);
    }

    compose(input: ComposeInput): ComposedContext {
        const now = input.now ?? new Date();
        const maxHits = input.maxHits ?? 8;

        const { lock, drift } = this.resolveLock(input);
        const profile = this.profileView.getUserProfile();
        if (drift && this.driftBus) {
            this.driftBus.emit({
                sessionId: input.sessionId,
                previousTopic: drift.previousTopic,
                newTopic: drift.newTopic,
                score: drift.score,
                source: 'context-composer',
                timestamp: now.toISOString(),
            });
        }

        const candidates = this.gatherCandidates(lock, profile, input.profile);
        const factsForTopic = lock
            ? candidates.filter(h => h.topics.includes(lock.topic)).length
            : 0;
        const coldStart = lock ? isColdStart(factsForTopic, { threshold: COLD_START_THRESHOLD }) : true;

        const reranked = rerank(candidates, {
            topicLock: lock?.topic ?? null,
            now,
        }).slice(0, maxHits);

        let markdown = this.renderMarkdown(reranked, lock, profile, coldStart);
        // FEAT-03-26: Top-Hub-Block bleibt cache-stabil oben (Hub-Liste
        // aendert sich selten), Memory-Block darunter (variabel pro Topic).
        if (input.topHubBlockMarkdown && input.topHubBlockMarkdown.trim().length > 0) {
            markdown = input.topHubBlockMarkdown.trim() + '\n\n' + markdown;
        }

        return {
            markdown,
            hits: reranked,
            topicLock: lock,
            driftEvent: drift ?? undefined,
            coldStart,
        };
    }

    /** Drop the in-memory lock for a session. Called on session-end / reset. */
    clearLock(sessionId: string): void {
        this.locks.delete(sessionId);
    }

    private resolveLock(input: ComposeInput): { lock: TopicLock | null; drift: ComposedContext['driftEvent'] | null } {
        if (input.topicLockOverride) {
            const lock: TopicLock = { topic: input.topicLockOverride, score: 1.0 };
            this.locks.set(input.sessionId, lock);
            return { lock, drift: null };
        }

        const previous = this.locks.get(input.sessionId);

        // No embedding to evaluate against -- keep what we have.
        if (!input.userMessageEmbedding) {
            return { lock: previous ?? null, drift: null };
        }

        const match = this.topicInference.inferTopic(input.userMessageEmbedding, {
            minScore: DRIFT_THRESHOLD,
        });

        if (!previous) {
            const lock = match
                ? { topic: match.topic, score: match.score }
                : null;
            if (lock) this.locks.set(input.sessionId, lock);
            return { lock, drift: null };
        }

        // Drift detection: same topic still wins -> keep lock; different
        // topic above threshold -> drift event; nothing matches -> drop lock.
        if (match && match.topic === previous.topic) {
            const refreshed: TopicLock = { ...previous, score: match.score };
            this.locks.set(input.sessionId, refreshed);
            return { lock: refreshed, drift: null };
        }
        const newTopic = match?.topic ?? null;
        const newLock = match ? { topic: match.topic, score: match.score } : null;
        if (newLock) {
            this.locks.set(input.sessionId, newLock);
        } else {
            this.locks.delete(input.sessionId);
        }
        return {
            lock: newLock,
            drift: {
                previousTopic: previous.topic,
                newTopic,
                score: match?.score ?? 0,
            },
        };
    }

    private gatherCandidates(
        lock: TopicLock | null,
        profile: UserProfile,
        profileFilter: string | undefined,
    ): RecallHit[] {
        // Identity facts always matter; ContextRanker will boost them.
        // Profile filter applies post-hoc so identity stays visible across
        // partitions (the user's identity doesn't change per profile).
        const identityHits = profile.identity
            .filter(f => !profileFilter || f.profileId === profileFilter)
            .map(f => factToHit(f));

        // Pick the topic-filtered facts (first pass) and a recency
        // fallback. We over-fetch by 3x the limit so the rerank step
        // has room to reorder.
        const topicHits: RecallHit[] = [];
        if (lock) {
            const all = this.factStore.listLatest({ limit: 200, profileId: profileFilter });
            for (const f of all) {
                if (f.topics.includes(lock.topic)) topicHits.push(factToHit(f));
            }
        }

        const recentHits = this.factStore
            .listLatest({ orderBy: 'last_confirmed_at', limit: 20, profileId: profileFilter })
            .map(f => factToHit(f));

        // Dedup by uri keeping the highest score
        const byUri = new Map<string, RecallHit>();
        for (const list of [identityHits, topicHits, recentHits]) {
            for (const h of list) {
                const existing = byUri.get(h.uri);
                if (!existing || h.score > existing.score) byUri.set(h.uri, h);
            }
        }
        return [...byUri.values()];
    }

    private renderMarkdown(
        hits: RecallHit[],
        lock: TopicLock | null,
        profile: UserProfile,
        coldStart: boolean,
    ): string {
        const lines: string[] = [];
        // Stable identity block first -- supports ADR-062 cache-friendliness.
        if (profile.identity.length > 0) {
            lines.push('## Identity');
            for (const f of profile.identity.slice(0, 3)) {
                lines.push(`- ${f.text}`);
            }
            lines.push('');
        }
        if (profile.communicationStyle) {
            lines.push('## Communication style');
            lines.push(profile.communicationStyle.styleDescription);
            lines.push('');
        }
        // Topical block
        if (hits.length > 0) {
            const heading = lock
                ? `## Topical memory (lock: ${lock.topic})`
                : '## Recent memory';
            lines.push(heading);
            for (const h of hits) {
                const tag = h.kind ? ` _(${h.kind})_` : '';
                lines.push(`- ${h.text}${tag}`);
            }
            if (coldStart) {
                lines.push('');
                lines.push('_Cold-start: showing the most recent facts; topic context still warming up._');
                lines.push(
                    '_Hint: less than 5 facts on this topic. If the user shares something durable, ' +
                    'consider calling mark_for_memory or update_soul so it sticks for next time._',
                );
            }
            lines.push('');
        }
        return lines.join('\n').trimEnd();
    }
}

function factToHit(f: Fact): RecallHit {
    return {
        uri: `fact:${f.id}`,
        text: f.text,
        score: f.importance,
        topics: f.topics,
        kind: f.kind,
        contributions: { 'profile-fact': f.importance },
    };
}
