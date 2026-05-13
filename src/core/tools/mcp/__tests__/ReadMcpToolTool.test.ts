import { describe, it, expect, beforeEach } from 'vitest';
import { ReadMcpToolTool } from '../ReadMcpToolTool';
import type { McpClient, McpConnection, McpToolInfo } from '../../../mcp/McpClient';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';

/**
 * Tests for ReadMcpToolTool (FEAT-24-06 / ADR-118).
 */

function makeTool(overrides: Partial<McpToolInfo> = {}): McpToolInfo {
    return {
        name: 'create_page',
        description: 'Create a new page in a workspace. The page is created at the root by default.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                parent: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['title'],
        },
        ...overrides,
    };
}

function makeConnection(serverName: string, status: McpConnection['status'], tools: McpToolInfo[] = []): McpConnection {
    return {
        name: serverName,
        config: { type: 'streamable-http', url: 'http://example' },
        client: undefined,
        tools,
        status,
    };
}

function makeMcpClient(connections: McpConnection[]): McpClient {
    const map = new Map(connections.map(c => [c.name, c]));
    return {
        getConnection: (name: string) => map.get(name),
        getConnections: () => [...map.values()],
    } as unknown as McpClient;
}

function makePlugin(activeMcpServers: string[] = []): ObsidianAgentPlugin {
    return {
        settings: { activeMcpServers },
    } as unknown as ObsidianAgentPlugin;
}

interface CapturedResult { content: string }

function makeContext(): { ctx: ToolExecutionContext; results: CapturedResult[] } {
    const results: CapturedResult[] = [];
    const ctx = {
        callbacks: {
            pushToolResult: (content: string) => { results.push({ content }); },
            log: () => undefined,
        },
    } as unknown as ToolExecutionContext;
    return { ctx, results };
}

describe('ReadMcpToolTool', () => {
    let plugin: ObsidianAgentPlugin;
    let mcpClient: McpClient;

    beforeEach(() => {
        plugin = makePlugin([]);
        mcpClient = makeMcpClient([]);
    });

    it('returns an error when server or name is missing', async () => {
        const tool = new ReadMcpToolTool(plugin, mcpClient);
        const { ctx, results } = makeContext();
        await tool.execute({ server: '', name: 'create_page' }, ctx);
        expect(results[0].content).toMatch(/server and name are required/i);
    });

    it('returns an error when the server is not in activeMcpServers (whitelist enforced)', async () => {
        const lockedPlugin = makePlugin(['other-server']);
        const tool = new ReadMcpToolTool(lockedPlugin, mcpClient);
        const { ctx, results } = makeContext();
        await tool.execute({ server: 'notion', name: 'create_page' }, ctx);
        expect(results[0].content).toMatch(/MCP server "notion" is not enabled/);
        expect(results[0].content).toContain('tool picker');
    });

    it('returns an error when the server is not connected', async () => {
        mcpClient = makeMcpClient([
            makeConnection('notion', 'disconnected'),
            makeConnection('linear', 'connected'),
        ]);
        const tool = new ReadMcpToolTool(plugin, mcpClient);
        const { ctx, results } = makeContext();
        await tool.execute({ server: 'notion', name: 'create_page' }, ctx);
        expect(results[0].content).toMatch(/MCP server "notion" is not connected/);
        expect(results[0].content).toContain('linear');
    });

    it('returns an error with the list of available tools when the tool name is unknown', async () => {
        mcpClient = makeMcpClient([
            makeConnection('notion', 'connected', [makeTool({ name: 'create_page' }), makeTool({ name: 'update_page' })]),
        ]);
        const tool = new ReadMcpToolTool(plugin, mcpClient);
        const { ctx, results } = makeContext();
        await tool.execute({ server: 'notion', name: 'does_not_exist' }, ctx);
        expect(results[0].content).toMatch(/Tool "does_not_exist" not found/);
        expect(results[0].content).toContain('create_page');
        expect(results[0].content).toContain('update_page');
    });

    it('renders the full description and a compact input-schema summary when the tool is found', async () => {
        mcpClient = makeMcpClient([
            makeConnection('notion', 'connected', [makeTool()]),
        ]);
        const tool = new ReadMcpToolTool(plugin, mcpClient);
        const { ctx, results } = makeContext();
        await tool.execute({ server: 'notion', name: 'create_page' }, ctx);
        const out = results[0].content;
        expect(out).toContain('## MCP TOOL: notion.create_page');
        expect(out).toContain('use_mcp_tool');
        expect(out).toContain('Create a new page in a workspace');
        expect(out).toContain('**Input schema summary:**');
        expect(out).toContain('- title: string, required');
        expect(out).toContain('- parent: string');
        expect(out).toContain('- tags: array<string>');
    });

    it('handles a tool with no input schema gracefully', async () => {
        mcpClient = makeMcpClient([
            makeConnection('notion', 'connected', [makeTool({ inputSchema: undefined })]),
        ]);
        const tool = new ReadMcpToolTool(plugin, mcpClient);
        const { ctx, results } = makeContext();
        await tool.execute({ server: 'notion', name: 'create_page' }, ctx);
        const out = results[0].content;
        expect(out).toContain('## MCP TOOL: notion.create_page');
        expect(out).toContain('(no input schema reported by the server)');
    });

    it('describes enum properties using their literal values', async () => {
        mcpClient = makeMcpClient([
            makeConnection('notion', 'connected', [makeTool({
                inputSchema: {
                    type: 'object',
                    properties: {
                        mode: { type: 'string', enum: ['draft', 'published'] },
                    },
                    required: ['mode'],
                },
            })]),
        ]);
        const tool = new ReadMcpToolTool(plugin, mcpClient);
        const { ctx, results } = makeContext();
        await tool.execute({ server: 'notion', name: 'create_page' }, ctx);
        expect(results[0].content).toContain('- mode: enum("draft" | "published"), required');
    });
});
