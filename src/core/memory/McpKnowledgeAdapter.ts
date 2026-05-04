/**
 * McpKnowledgeAdapter -- Setup-C implementation of KnowledgeGraphAdapter.
 *
 * Used when Memory v2 runs as a standalone engine (separate process or
 * UCM service) and the vault index lives in the Obsilo plugin behind
 * an MCP-server endpoint. The adapter calls plugin-MCP tools
 * `get_vault_implicit_edges`, `get_vault_note_metadata`, and
 * `search_vault` via the host-supplied transport; LAN-RTT 20-50 ms is
 * acceptable per ADR-081.
 *
 * The transport is injected so this class never touches Node's `fetch`
 * directly -- different hosts (Electron, Node service, browser-based
 * UCM) need different RPC mechanisms.
 *
 * FEATURE-0317 / PLAN-006 task 11.
 */

import type {
    KnowledgeGraphAdapter,
    ImplicitNeighbor,
    NoteMetadata,
    SimilarSearchHit,
} from './KnowledgeGraphAdapter';

/**
 * Transport closure -- given a tool name + args, return the JSON
 * payload the plugin-MCP would have produced. Hosts implement this
 * over their RPC of choice (HTTP, MCP-stdio, in-proc).
 */
export type McpToolCaller = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export class McpKnowledgeAdapter implements KnowledgeGraphAdapter {
    constructor(private readonly call: McpToolCaller) {}

    async getImplicitNeighbors(
        notePath: string,
        opts: { hops?: number; limit?: number } = {},
    ): Promise<ImplicitNeighbor[]> {
        const payload = await this.callTool('get_vault_implicit_edges', {
            path: notePath,
            hops: opts.hops ?? 1,
            limit: opts.limit ?? 20,
        });
        const parsed = parseJsonString(payload);
        const list = (parsed as { neighbours?: ImplicitNeighbor[] } | null)?.neighbours;
        return Array.isArray(list) ? list : [];
    }

    async getNoteMetadata(notePath: string): Promise<NoteMetadata | null> {
        const payload = await this.callTool('get_vault_note_metadata', { path: notePath });
        const parsed = parseJsonString(payload) as Record<string, unknown> | null;
        if (!parsed || parsed.missing === true) return null;
        return {
            path: typeof parsed.path === 'string' ? parsed.path : notePath,
            tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string') : [],
            lastIndexedAt: typeof parsed.lastIndexedAt === 'string' ? parsed.lastIndexedAt : undefined,
        };
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- KnowledgeAdapter interface contract; Phase-4 lifts the no-op and adds the real network call
    async searchSimilar(
        _queryVector: Float32Array,
        opts: { topK?: number } = {},
    ): Promise<SimilarSearchHit[]> {
        // Plugin-MCP exposes `search_vault` text-side only; embedding-vector
        // search is cross-process not portable. Phase-3 returns an empty
        // array here -- ContextComposer relies on FactStore directly when
        // vault embeddings are not reachable. Phase-4 lifts this.
        void opts;
        return [];
    }

    private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        try {
            return await this.call(name, args);
        } catch (e) {
            console.warn(`[McpKnowledgeAdapter] ${name} failed:`, e);
            return null;
        }
    }
}

function parseJsonString(payload: unknown): unknown {
    if (typeof payload === 'string') {
        try { return JSON.parse(payload); } catch { return null; }
    }
    if (payload && typeof payload === 'object') return payload;
    return null;
}
