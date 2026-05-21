/**
 * FEAT-29-10 Step C: tests for InvokeMcpServerTool.
 *
 * The tool exposes MCP server tools as a first-class composition step
 * within a skill workflow. It pushes a stack entry (so depth + cycle
 * tracking work across skill <-> mcp transitions), calls McpClient.callTool,
 * pops on return.
 *
 * Approval chain: McpClient.callTool already enforces the per-server
 * approval policy. invoke_mcp_server is a thin wrapper -- no bypass.
 */

import { describe, it, expect } from 'vitest';
import { InvokeMcpServerTool } from '../InvokeMcpServerTool';
import { CompositionStackService } from '../../../skills/CompositionStackService';
import type { ToolExecutionContext } from '../../types';

function makePlugin(opts: {
    mcpResult?: string;
    mcpError?: Error;
    knownServers?: string[];
    /** FEAT-29-10 SC-03: optional activeMcpServers whitelist for approval-bypass tests. */
    activeMcpServers?: string[];
}) {
    const calls: Array<{ server: string; tool: string; args: Record<string, unknown> }> = [];
    const known = new Set(opts.knownServers ?? ['notion', 'linear']);
    const plugin = {
        settings: {
            activeMcpServers: opts.activeMcpServers,
        },
        mcpClient: {
            async callTool(server: string, tool: string, args: Record<string, unknown>): Promise<string> {
                calls.push({ server, tool, args });
                if (opts.mcpError) throw opts.mcpError;
                if (!known.has(server)) {
                    return `Error: MCP server "${server}" is not configured`;
                }
                return opts.mcpResult ?? `result from ${server}/${tool}`;
            },
        },
    } as unknown as import('../../../../main').default;
    return { plugin, calls };
}

function makeContext(stack?: CompositionStackService) {
    const pushed: string[] = [];
    const ctx = {
        callbacks: {
            pushToolResult: (s: string) => pushed.push(s),
            log: () => {},
            handleError: async () => {},
        },
        compositionStack: stack ?? new CompositionStackService(5),
    } as unknown as ToolExecutionContext;
    return { ctx, pushed };
}

describe('InvokeMcpServerTool', () => {
    describe('happy path', () => {
        it('calls McpClient.callTool with the right server/tool/args', async () => {
            const { plugin, calls } = makePlugin({ mcpResult: 'OK' });
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx, pushed } = makeContext();

            await tool.execute(
                { server_id: 'notion', tool_name: 'search_page', args: { query: 'foo' } },
                ctx,
            );

            expect(calls).toEqual([
                { server: 'notion', tool: 'search_page', args: { query: 'foo' } },
            ]);
            expect(pushed.join('\n')).toMatch(/<success>/);
            expect(pushed.join('\n')).toContain('OK');
        });

        it('works without args (empty object)', async () => {
            const { plugin, calls } = makePlugin({});
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx } = makeContext();
            await tool.execute({ server_id: 'notion', tool_name: 'list_pages' }, ctx);
            expect(calls[0].args).toEqual({});
        });
    });

    describe('validation', () => {
        it('rejects empty server_id', async () => {
            const { plugin } = makePlugin({});
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx, pushed } = makeContext();
            await tool.execute({ server_id: '', tool_name: 'x' }, ctx);
            expect(pushed.join('\n')).toMatch(/server_id/);
        });

        it('rejects empty tool_name', async () => {
            const { plugin } = makePlugin({});
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx, pushed } = makeContext();
            await tool.execute({ server_id: 'notion', tool_name: '' }, ctx);
            expect(pushed.join('\n')).toMatch(/tool_name/);
        });

        it('rejects path-traversal in server_id', async () => {
            const { plugin } = makePlugin({});
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx, pushed } = makeContext();
            await tool.execute({ server_id: '../escape', tool_name: 'x' }, ctx);
            expect(pushed.join('\n')).toMatch(/Unsafe|invalid/i);
        });

        it('reports when McpClient is not configured on the plugin', async () => {
            const plugin = {} as unknown as import('../../../../main').default;
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx, pushed } = makeContext();
            await tool.execute({ server_id: 'notion', tool_name: 'x' }, ctx);
            expect(pushed.join('\n')).toMatch(/mcp.*not.*available/i);
        });
    });

    describe('cycle detection', () => {
        it('refuses to re-invoke the same server-tool combo already in the stack', async () => {
            const { plugin, calls } = makePlugin({});
            const tool = new InvokeMcpServerTool(plugin);
            const stack = new CompositionStackService(5);
            stack.push({ type: 'mcp', id: 'notion:search_page' });
            const { ctx, pushed } = makeContext(stack);

            await tool.execute(
                { server_id: 'notion', tool_name: 'search_page', args: {} },
                ctx,
            );

            expect(calls).toHaveLength(0);
            expect(pushed.join('\n')).toMatch(/cycle/i);
        });

        it('allows different tools on the same server', async () => {
            const { plugin, calls } = makePlugin({});
            const tool = new InvokeMcpServerTool(plugin);
            const stack = new CompositionStackService(5);
            stack.push({ type: 'mcp', id: 'notion:list_pages' });
            const { ctx } = makeContext(stack);

            await tool.execute({ server_id: 'notion', tool_name: 'search_page' }, ctx);
            expect(calls).toHaveLength(1);
        });
    });

    describe('depth limit', () => {
        it('refuses when stack would exceed maxDepth', async () => {
            const { plugin, calls } = makePlugin({});
            const tool = new InvokeMcpServerTool(plugin);
            const stack = new CompositionStackService(2);
            stack.push({ type: 'skill', id: 'a' });
            stack.push({ type: 'skill', id: 'b' });
            const { ctx, pushed } = makeContext(stack);

            await tool.execute({ server_id: 'notion', tool_name: 'x' }, ctx);
            expect(calls).toHaveLength(0);
            expect(pushed.join('\n')).toMatch(/depth|limit/i);
        });
    });

    describe('stack hygiene', () => {
        it('pops the entry after a successful call', async () => {
            const { plugin } = makePlugin({});
            const tool = new InvokeMcpServerTool(plugin);
            const stack = new CompositionStackService(5);
            const { ctx } = makeContext(stack);
            await tool.execute({ server_id: 'notion', tool_name: 'x' }, ctx);
            expect(stack.depth()).toBe(0);
        });

        it('pops the entry even when McpClient throws', async () => {
            const { plugin } = makePlugin({ mcpError: new Error('connection lost') });
            const tool = new InvokeMcpServerTool(plugin);
            const stack = new CompositionStackService(5);
            const { ctx, pushed } = makeContext(stack);
            await tool.execute({ server_id: 'notion', tool_name: 'x' }, ctx);
            expect(stack.depth()).toBe(0);
            expect(pushed.join('\n')).toMatch(/connection lost/i);
        });
    });

    /**
     * SC-03: "MCP approval chain must not be bypassable."
     *
     * use_mcp_tool gates calls behind plugin.settings.activeMcpServers
     * (server whitelist the user toggles in the chat tool-picker).
     * invoke_mcp_server is meant to be a composition-tracked twin --
     * it MUST apply the same whitelist or it becomes an approval bypass
     * (a skill could call a server the user has not enabled).
     */
    describe('SC-03: respects activeMcpServers whitelist', () => {
        it('rejects servers that are not in activeMcpServers when the whitelist is non-empty', async () => {
            const { plugin, calls } = makePlugin({
                knownServers: ['notion', 'linear'],
                activeMcpServers: ['notion'],   // linear NOT enabled
            });
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx, pushed } = makeContext();

            await tool.execute(
                { server_id: 'linear', tool_name: 'list_issues' },
                ctx,
            );

            expect(calls).toHaveLength(0);
            expect(pushed.join('\n')).toMatch(/not enabled|not in.*whitelist|activeMcpServers/i);
        });

        it('allows servers that ARE in activeMcpServers', async () => {
            const { plugin, calls } = makePlugin({
                knownServers: ['notion'],
                activeMcpServers: ['notion'],
            });
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx } = makeContext();

            await tool.execute({ server_id: 'notion', tool_name: 'search_page' }, ctx);

            expect(calls).toHaveLength(1);
        });

        it('skips the whitelist when activeMcpServers is empty (backward-compat: all servers allowed)', async () => {
            const { plugin, calls } = makePlugin({
                knownServers: ['notion', 'linear'],
                activeMcpServers: [],   // empty == legacy behaviour
            });
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx } = makeContext();

            await tool.execute({ server_id: 'linear', tool_name: 'list_issues' },  ctx);

            expect(calls).toHaveLength(1);
        });

        it('skips the whitelist when activeMcpServers is undefined (backward-compat: all servers allowed)', async () => {
            const { plugin, calls } = makePlugin({
                knownServers: ['notion'],
                // activeMcpServers omitted entirely
            });
            const tool = new InvokeMcpServerTool(plugin);
            const { ctx } = makeContext();

            await tool.execute({ server_id: 'notion', tool_name: 'x' }, ctx);

            expect(calls).toHaveLength(1);
        });

        it('rejects before the composition stack is touched (whitelist hit must not pollute the stack)', async () => {
            const { plugin } = makePlugin({
                activeMcpServers: ['notion'],
            });
            const tool = new InvokeMcpServerTool(plugin);
            const stack = new CompositionStackService(5);
            const { ctx } = makeContext(stack);

            await tool.execute({ server_id: 'linear', tool_name: 'x' }, ctx);

            expect(stack.depth()).toBe(0);
        });
    });
});
