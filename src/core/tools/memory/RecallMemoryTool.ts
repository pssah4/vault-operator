/**
 * recall_memory -- Agent-facing tool for cold-memory retrieval.
 *
 * Lets the agent search Memory v2 facts by meaning (cosine via the
 * shared EmbeddingService -> FactStore embeddings) plus optional
 * 1-hop edge-walk via UnifiedGraphService. Used when the static
 * Hot-Memory-Block doesn't have what the agent needs and a deliberate
 * "lookup" is more appropriate than re-asking the user.
 *
 * Returns URI-typed RecallHit[] rendered as a Markdown list. The agent
 * is expected to synthesise the answer from the hits, not read each fact
 * individually.
 *
 * FEATURE-0317 / PLAN-006 task 9.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { FactStore } from '../../memory/FactStore';
import type { Fact, FactKind } from '../../memory/FactStore';
import type { RecallHit } from '../../memory/RecallHit';
import { cosine } from '../../memory/cosine';

export class RecallMemoryTool extends BaseTool<'recall_memory'> {
    readonly name = 'recall_memory' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'recall_memory',
            description:
                'Search the user memory store (Memory v2 facts + edges). ' +
                'Use when you need a specific past detail that is not already in the system-prompt ' +
                'memory block -- e.g. "what was the user\'s preferred deploy target last quarter?". ' +
                'Returns URI-typed hits with kind / topics / contributions. Synthesise your answer ' +
                'from the excerpts -- do NOT chain into read_file or further searches.',
            input_schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Natural-language query for cosine + keyword search over the fact store.',
                    },
                    top_k: {
                        type: 'number',
                        description: 'Max hits to return (default 5, max 15).',
                    },
                    multi_hop: {
                        type: 'boolean',
                        description:
                            'If true, expand each direct hit by 1 hop over fact_edges so neighbours surface too. ' +
                            'Default false. Multi-hop walks add ~50ms.',
                    },
                    kind_filter: {
                        type: 'string',
                        enum: ['fact', 'preference', 'identity', 'event'],
                        description: 'Restrict to one fact kind (e.g. "preference" for stable user prefs only).',
                    },
                },
                required: ['query'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const query = ((input.query as string) ?? '').trim();
        if (!query) {
            callbacks.pushToolResult(this.formatError(new Error('query parameter is required')));
            return;
        }
        const topK = Math.min(Math.max(Number(input.top_k) || 5, 1), 15);
        const multiHop = input.multi_hop === true;
        const kindFilter = (input.kind_filter as FactKind | undefined) ?? undefined;

        const memDB = this.plugin.memoryDB;
        if (!memDB?.isOpen()) {
            callbacks.pushToolResult(
                'Memory v2 is not available -- the memory database is not open.',
            );
            return;
        }

        try {
            const factStore = new FactStore(memDB);
            const hits = await this.queryFacts(factStore, query, topK, kindFilter);
            const expanded = multiHop
                ? this.expandOneHop(factStore, hits, topK)
                : hits;
            if (expanded.length === 0) {
                callbacks.pushToolResult(
                    `No memory facts matched: "${query}".`,
                );
                return;
            }
            const md = this.renderMarkdown(query, expanded, multiHop);
            callbacks.pushToolResult(md);
        } catch (e) {
            await callbacks.handleError('recall_memory', e);
        }
    }

    /**
     * IMP-03-17-01: Cosine over fact_embeddings as primary path. When the
     * EmbeddingService is wired and at least one fact carries an
     * embedding, we score by cosine(query, fact). Token-overlap is
     * preserved as a fallback for offline use, missing API key, or
     * facts inserted before EmbeddingService was wired.
     */
    private async queryFacts(
        store: FactStore,
        query: string,
        topK: number,
        kindFilter: FactKind | undefined,
    ): Promise<RecallHit[]> {
        const candidates = store.listLatest({ kind: kindFilter, limit: 500 });
        if (candidates.length === 0) return [];

        const cosineHits = await this.queryFactsCosine(candidates, query, topK);
        if (cosineHits) return cosineHits;
        return this.queryFactsTokenOverlap(candidates, query, topK);
    }

    /** Cosine path. Returns null if EmbeddingService is unavailable or no fact has an embedding. */
    private async queryFactsCosine(
        candidates: Fact[],
        query: string,
        topK: number,
    ): Promise<RecallHit[] | null> {
        const embeddings = this.plugin.embeddingService;
        if (!embeddings?.isReady()) return null;

        const factIds = candidates.map(f => f.id);
        const embeddingMap = this.loadEmbeddingsForFacts(factIds);
        if (embeddingMap.size === 0) return null;

        let queryVec: Float32Array;
        try {
            const result = await embeddings.embed([query]);
            queryVec = result[0];
        } catch (e) {
            console.debug('[recall_memory] embed failed, fallback to token-overlap:', e);
            return null;
        }

        const scored: Array<{ fact: Fact; score: number }> = [];
        for (const fact of candidates) {
            const factVec = embeddingMap.get(fact.id);
            if (!factVec) continue;
            const sim = cosine(queryVec, factVec);
            if (sim <= 0) continue;
            scored.push({ fact, score: sim + fact.importance * 0.1 });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK).map(({ fact, score }) => factToHit(fact, score));
    }

    /** Token-overlap fallback (legacy path, retained for offline use). */
    private queryFactsTokenOverlap(candidates: Fact[], query: string, topK: number): RecallHit[] {
        const queryTokens = tokenise(query);
        if (queryTokens.length === 0) return [];
        const scored: Array<{ fact: Fact; score: number }> = [];
        for (const fact of candidates) {
            const haystack = `${fact.text.toLowerCase()} ${fact.topics.join(' ').toLowerCase()}`;
            let hits = 0;
            for (const t of queryTokens) {
                if (haystack.includes(t)) hits += 1;
            }
            if (hits === 0) continue;
            scored.push({ fact, score: hits + fact.importance });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK).map(({ fact, score }) => factToHit(fact, score));
    }

    private loadEmbeddingsForFacts(factIds: readonly number[]): Map<number, Float32Array> {
        const out = new Map<number, Float32Array>();
        if (factIds.length === 0) return out;
        const memDB = this.plugin.memoryDB;
        if (!memDB?.isOpen()) return out;
        const placeholders = factIds.map(() => '?').join(',');
        const result = memDB.getDB().exec(
            `SELECT fact_id, embedding FROM fact_embeddings WHERE fact_id IN (${placeholders})`,
            [...factIds],
        );
        if (result.length === 0 || result[0].values.length === 0) return out;
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

    private expandOneHop(store: FactStore, seeds: RecallHit[], topK: number): RecallHit[] {
        if (seeds.length === 0) return [];
        const seenUris = new Set(seeds.map(s => s.uri));
        const expanded: RecallHit[] = [...seeds];
        // Pull fact rows by id, walk superseded_by + ord-by-importance
        // related facts. Cheap approximation; full edge-walk uses
        // UnifiedGraphService and lands in Phase 4.
        for (const s of seeds) {
            if (!s.uri.startsWith('fact:')) continue;
            const id = Number(s.uri.slice(5));
            const fact = store.getById(id);
            if (!fact) continue;
            // Pull other latest facts that share the primary topic.
            if (fact.topics.length === 0) continue;
            const related = store.listLatest({ limit: 20 })
                .filter(f => f.id !== fact.id && f.topics[0] === fact.topics[0]);
            for (const r of related) {
                const uri = `fact:${r.id}`;
                if (seenUris.has(uri)) continue;
                seenUris.add(uri);
                expanded.push(factToHit(r, r.importance * 0.6)); // distance penalty
            }
        }
        expanded.sort((a, b) => b.score - a.score);
        return expanded.slice(0, topK);
    }

    private renderMarkdown(query: string, hits: RecallHit[], multiHop: boolean): string {
        const lines: string[] = [];
        lines.push(`Recall results for: "${query}"`);
        lines.push(`(${hits.length} hits${multiHop ? ', multi-hop expansion' : ''})`);
        lines.push('');
        for (const h of hits) {
            const tag = h.kind ? ` _(${h.kind})_` : '';
            const topics = h.topics.length > 0 ? ` [${h.topics.join(', ')}]` : '';
            lines.push(`- **${h.text}**${tag}${topics}`);
            lines.push(`  \`${h.uri}\` -- score ${h.score.toFixed(2)}`);

            // External backlinks (thread://, vault://, https://, ...) per hit.
            // Skip for non-fact URIs to avoid recursion.
            if (h.uri.startsWith('fact:')) {
                const factId = Number(h.uri.slice('fact:'.length));
                const links = this.renderExternalEdges(factId);
                if (links.length > 0) {
                    for (const link of links) lines.push(`  ↳ ${link}`);
                }
            }
        }
        return lines.join('\n');
    }

    private renderExternalEdges(factId: number): string[] {
        const memDB = this.plugin.memoryDB;
        if (!memDB?.isOpen() || !Number.isFinite(factId)) return [];
        try {
            const result = memDB.getDB().exec(
                `SELECT to_external_ref, edge_type FROM fact_edges
                  WHERE from_fact_id = ? AND to_external_ref IS NOT NULL
                  ORDER BY created_at DESC LIMIT 6`,
                [factId],
            );
            if (result.length === 0 || result[0].values.length === 0) return [];
            return result[0].values.map(row => {
                const ref = row[0] as string;
                const edgeType = row[1] as string;
                return this.formatExternalRef(ref, edgeType);
            });
        } catch {
            return [];
        }
    }

    private formatExternalRef(uri: string, edgeType: string): string {
        // thread:// -> resolve to conversation title via ConversationStore,
        // render as clickable obsidian://obsilo-chat link.
        if (uri.startsWith('thread://')) {
            const id = uri.slice('thread://'.length);
            const meta = this.plugin.conversationStore?.list().find(m => m.id === id);
            const title = meta?.title?.trim() || 'Conversation';
            // Auto-link bracket <...> avoids Obsidian's markdown renderer
            // mistaking the protocol URL for a vault-internal file path.
            return `${edgeType}: [${title}](<obsidian://obsilo-chat?id=${encodeURIComponent(id)}>)`;
        }
        if (uri.startsWith('vault://')) {
            const path = uri.slice('vault://'.length);
            return `${edgeType}: [[${path}]]`;
        }
        if (uri.startsWith('https://') || uri.startsWith('http://')) {
            return `${edgeType}: <${uri}>`;
        }
        return `${edgeType}: \`${uri}\``;
    }
}

function factToHit(fact: Fact, score: number): RecallHit {
    return {
        uri: `fact:${fact.id}`,
        text: fact.text,
        score,
        topics: fact.topics,
        kind: fact.kind,
        contributions: { 'fact-text-match': score },
    };
}

function tokenise(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[\s_/,.;:!?()[\]{}"'`|@#=+*<>~^-]+/)
        .filter(t => t.length >= 3);
}
