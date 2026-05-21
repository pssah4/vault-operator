/**
 * InvokeMcpServerTool -- FEAT-29-10 Step C.
 *
 * Skill-to-MCP composition. The agent calls this tool from within a
 * skill workflow to invoke a tool exposed by a configured MCP server
 * as a first-class composition step. The wrapper pushes a stack entry
 * so cycle-detection and depth-limit cross the skill <-> mcp boundary,
 * then delegates to McpClient.callTool, then pops.
 *
 * Approval: McpClient.callTool already enforces the per-server
 * approval policy. This tool is a thin wrapper -- no bypass.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { isSafePathSegment } from '../../utils/safePathName';
import {
    CompositionCycleError,
    CompositionDepthExceededError,
} from '../../skills/CompositionStackService';

interface InvokeMcpServerArgs {
    server_id: string;
    tool_name: string;
    args?: Record<string, unknown>;
}

export class InvokeMcpServerTool extends BaseTool<'invoke_mcp_server'> {
    readonly name = 'invoke_mcp_server' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'invoke_mcp_server',
            description:
                'Call a tool exposed by a configured MCP server as a first-class composition step '
                + 'within a skill workflow. Use this when a skill names an MCP-server tool as a '
                + 'building block ("now call notion.search_page with the topic"). The MCP server\'s '
                + 'own approval policy still applies. Cycle detection and a max-depth limit '
                + '(default 5) protect against runaway recursion across skill <-> mcp transitions.',
            input_schema: {
                type: 'object',
                properties: {
                    server_id: {
                        type: 'string',
                        description: 'Configured MCP server id (the name in the MCP settings).',
                    },
                    tool_name: {
                        type: 'string',
                        description: 'Name of the tool exposed by that MCP server.',
                    },
                    args: {
                        type: 'object',
                        description: 'JSON-serializable arguments passed to the MCP tool.',
                        additionalProperties: true,
                    },
                },
                required: ['server_id', 'tool_name'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks, compositionStack } = context;
        const args = input as unknown as InvokeMcpServerArgs;
        const serverId = (args.server_id ?? '').trim();
        const toolName = (args.tool_name ?? '').trim();
        const callArgs = args.args ?? {};

        if (!serverId) {
            callbacks.pushToolResult(this.formatError(new Error('server_id parameter is required')));
            return;
        }
        if (!toolName) {
            callbacks.pushToolResult(this.formatError(new Error('tool_name parameter is required')));
            return;
        }
        if (!isSafePathSegment(serverId)) {
            callbacks.pushToolResult(this.formatError(
                new Error(`Unsafe or invalid server_id (path-traversal guard): ${JSON.stringify(serverId)}`),
            ));
            return;
        }
        if (!isSafePathSegment(toolName)) {
            callbacks.pushToolResult(this.formatError(
                new Error(`Unsafe or invalid tool_name (path-traversal guard): ${JSON.stringify(toolName)}`),
            ));
            return;
        }

        const mcpClient = this.plugin.mcpClient;
        if (!mcpClient) {
            callbacks.pushToolResult(this.formatError(
                new Error('MCP is not available: mcpClient not configured on the plugin.'),
            ));
            return;
        }

        // SC-03 / AUDIT-EPIC-29 L-1: enforce the activeMcpServers whitelist
        // unconditionally. Pre-L-1 the check was guarded by
        // `activeMcpServers.length > 0`, which silently let any serverId
        // through when the user had not enabled any servers. Fail-closed
        // now: an empty list means no skill-driven MCP calls are allowed.
        const activeMcpServers: string[] = this.plugin.settings?.activeMcpServers ?? [];
        if (!activeMcpServers.includes(serverId)) {
            callbacks.pushToolResult(this.formatError(new Error(
                `MCP server "${serverId}" is not in the active servers list. `
                + `Enable it via the pocket-knife button in the chat toolbar.`,
            )));
            return;
        }

        if (!compositionStack) {
            callbacks.pushToolResult(this.formatError(
                new Error('Composition stack not configured on this AgentTask.'),
            ));
            return;
        }

        const stackId = `${serverId}:${toolName}`;
        try {
            compositionStack.push({ type: 'mcp', id: stackId });
        } catch (e) {
            if (e instanceof CompositionCycleError || e instanceof CompositionDepthExceededError) {
                callbacks.pushToolResult(this.formatError(e));
                return;
            }
            callbacks.pushToolResult(this.formatError(e));
            return;
        }

        try {
            const result = await mcpClient.callTool(serverId, toolName, callArgs);
            callbacks.pushToolResult(this.formatSuccess(JSON.stringify({
                ok: true,
                server: serverId,
                tool: toolName,
                depth: compositionStack.depth(),
                result,
            }, null, 2)));
            callbacks.log(`Invoked MCP tool: ${stackId} (depth ${compositionStack.depth()})`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            callbacks.pushToolResult(this.formatError(
                new Error(`MCP tool ${stackId} failed: ${msg}`),
            ));
        } finally {
            compositionStack.pop();
        }
    }
}
