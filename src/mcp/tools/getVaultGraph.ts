/**
 * MCP handlers for the Memory v2 cross-DB walk endpoints.
 *
 * Setup-C standalone-engine deployments use McpKnowledgeAdapter as
 * their KnowledgeGraphAdapter; that adapter calls Plugin-MCP via RPC
 * for these two read-only endpoints. Setup A/B uses LocalKnowledgeAdapter
 * directly and never reaches this file.
 *
 * FEATURE-0317 / PLAN-006 task 10.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import { LocalKnowledgeAdapter } from '../../core/memory/LocalKnowledgeAdapter';

function text(s: string, isError = false): McpToolResult {
    return { content: [{ type: 'text', text: s }], isError: isError || undefined };
}

export async function handleGetVaultImplicitEdges(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const path = (args.path as string) ?? '';
    if (!path) return text('error: `path` is required', true);
    const hops = clampHops(Number(args.hops) || 1);
    const limit = Math.max(1, Math.min(Number(args.limit) || 20, 100));

    const adapter = makeAdapter(plugin);
    if (!adapter) return text('error: knowledge index not available', true);
    const neighbours = await adapter.getImplicitNeighbors(path, { hops, limit });
    return text(JSON.stringify({ path, hops, neighbours }, null, 2));
}

export async function handleGetVaultNoteMetadata(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const path = (args.path as string) ?? '';
    if (!path) return text('error: `path` is required', true);

    const adapter = makeAdapter(plugin);
    if (!adapter) return text('error: knowledge index not available', true);
    const metadata = await adapter.getNoteMetadata(path);
    return text(JSON.stringify(metadata ?? { path, missing: true }, null, 2));
}

function clampHops(n: number): number {
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(Math.floor(n), 3));
}

function makeAdapter(plugin: ObsidianAgentPlugin): LocalKnowledgeAdapter | null {
    if (!plugin.knowledgeDB?.isOpen() || !plugin.vectorStore) return null;
    return new LocalKnowledgeAdapter(plugin.knowledgeDB, plugin.vectorStore);
}
