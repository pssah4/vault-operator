/**
 * recall_memory -- BA-26 / FEAT-23-02.
 *
 * MCP exposure of the agent-internal RecallMemoryTool. External
 * clients (Claude Desktop, ChatGPT, Claude Code, Perplexity) call
 * this to retrieve facts via Cosine over fact_embeddings.
 *
 * Optional source_interface filter (e.g. "give me only what
 * Claude Code stored").
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import { wrapVaultContentForMcp } from '../McpBridge';
import { FactStore } from '../../core/memory/FactStore';
import { cosine } from '../../core/memory/cosine';
import {
    validateSourceInterface,
    type SourceInterface,
} from '../../core/memory/SourceInterface';
import type { Fact, FactKind } from '../../core/memory/FactStore';

const VALID_KINDS: FactKind[] = ['fact', 'preference', 'identity', 'event'];

export async function handleRecallMemory(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return errorResult('query is required');

    const memDB = plugin.memoryDB;
    if (!memDB?.isOpen()) return errorResult('Memory database is not available');

    const topK = clamp(Number(args.top_k) || 10, 1, 30);
    const kindFilter = (typeof args.kind === 'string' && VALID_KINDS.includes(args.kind as FactKind))
        ? args.kind as FactKind
        : undefined;
    const sourceFilter: SourceInterface | undefined = args.source_interface !== undefined
        ? validateSourceInterface(args.source_interface)
        : undefined;

    // AUDIT-015 M-3: strictSourceIsolation erzwingt source_interface
    // Filter -- ohne explicit Wert lehnt das Tool den Call ab.
    const crossSurface = plugin.settings?.memory?.crossSurface;
    if (crossSurface?.strictSourceIsolation) {
        if (!sourceFilter) {
            return errorResult(
                'strictSourceIsolation is enabled in Settings -- recall_memory requires '
                + 'an explicit source_interface argument to scope the read.',
            );
        }
    }

    try {
        const store = new FactStore(memDB);
        const candidates = store.listLatest({ kind: kindFilter, limit: 500 });
        const filtered = sourceFilter
            ? candidates.filter((f) => f.sourceInterface === sourceFilter)
            : candidates;
        if (filtered.length === 0) {
            return { content: [{ type: 'text', text: `No facts matched.` }] };
        }

        const hits = await rank(plugin, filtered, query, topK);
        if (hits.length === 0) {
            return { content: [{ type: 'text', text: `No facts matched: "${query}".` }] };
        }

        // AUDIT-037 H-3: facts ingested from external chat surfaces are user
        // (i.e. vault-controlled) untrusted text. Wrap the body in the same
        // trust-tag searchVault and readNotes use so a downstream MCP client
        // cannot be steered by a planted "Ignore previous instructions" hit.
        const lines: string[] = [`Recall results for "${query}" (${hits.length} hits):`, ''];
        for (const h of hits) {
            const tags = h.fact.topics.length > 0 ? ` [${h.fact.topics.join(', ')}]` : '';
            lines.push(`- _(${h.fact.kind})_${tags}`);
            lines.push(wrapVaultContentForMcp(`fact:${h.fact.id}`, h.fact.text));
            lines.push(`  fact:${h.fact.id} -- score ${h.score.toFixed(2)} -- source: ${h.fact.sourceInterface}`);
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
        return errorResult(`Recall failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function rank(
    plugin: ObsidianAgentPlugin,
    facts: Fact[],
    query: string,
    topK: number,
): Promise<Array<{ fact: Fact; score: number }>> {
    // Try cosine first when EmbeddingService is wired.
    const embeddings = plugin.embeddingService;
    if (embeddings?.isReady()) {
        const embeddingMap = loadEmbeddingsForFacts(plugin, facts.map((f) => f.id));
        if (embeddingMap.size > 0) {
            try {
                const [queryVec] = await embeddings.embed([query]);
                const scored: Array<{ fact: Fact; score: number }> = [];
                for (const fact of facts) {
                    const factVec = embeddingMap.get(fact.id);
                    if (!factVec) continue;
                    const sim = cosine(queryVec, factVec);
                    if (sim <= 0) continue;
                    scored.push({ fact, score: sim + fact.importance * 0.1 });
                }
                scored.sort((a, b) => b.score - a.score);
                return scored.slice(0, topK);
            } catch (e) {
                console.debug('[mcp recall_memory] cosine failed, falling back:', e);
            }
        }
    }

    // Fallback: token overlap.
    const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    if (queryTokens.length === 0) return [];
    const scored: Array<{ fact: Fact; score: number }> = [];
    for (const fact of facts) {
        const haystack = `${fact.text.toLowerCase()} ${fact.topics.join(' ').toLowerCase()}`;
        let hits = 0;
        for (const t of queryTokens) {
            if (haystack.includes(t)) hits += 1;
        }
        if (hits === 0) continue;
        scored.push({ fact, score: hits + fact.importance });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
}

function loadEmbeddingsForFacts(
    plugin: ObsidianAgentPlugin,
    factIds: number[],
): Map<number, Float32Array> {
    const out = new Map<number, Float32Array>();
    if (factIds.length === 0) return out;
    const memDB = plugin.memoryDB;
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

function clamp(n: number, min: number, max: number): number {
    return Math.min(Math.max(n, min), max);
}

function errorResult(text: string): McpToolResult {
    return { content: [{ type: 'text', text: 'Error: ' + text }], isError: true };
}
