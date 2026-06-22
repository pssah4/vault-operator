/**
 * UseMcpToolTool — bridge from LLM tool calls to the MCP client.
 *
 * The LLM calls: use_mcp_tool(server_name, tool_name, arguments)
 * This tool forwards the call to the connected McpClient instance.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { McpClient } from '../../mcp/McpClient';
import { stigmergyMcpId } from '../../stigmergy/StigmergyAdapter';
import { emitStigmergyInvoked, emitStigmergyReturned } from '../../stigmergy/stigmergyEmitGate';

interface UseMcpToolInput {
    server_name: string;
    tool_name: string;
    arguments?: Record<string, unknown>;
}

export class UseMcpToolTool extends BaseTool<'use_mcp_tool'> {
    readonly name = 'use_mcp_tool' as const;
    // H-6: MCP tools are dynamic and may perform writes, deletes, or other destructive ops.
    // Treat as write so IgnoreService path-checks apply if the tool passes a 'path' argument.
    // Approval is already triggered via TOOL_GROUPS['use_mcp_tool'] = 'mcp' regardless of this flag.
    readonly isWriteOperation = true;

    private mcpClient: McpClient;

    constructor(plugin: ObsidianAgentPlugin, mcpClient: McpClient) {
        super(plugin);
        this.mcpClient = mcpClient;
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'use_mcp_tool',
            description:
                'Call a tool on a connected MCP (Model Context Protocol) server. ' +
                'Use this to access external tools and data sources configured in Settings → MCP.',
            input_schema: {
                type: 'object',
                properties: {
                    server_name: {
                        type: 'string',
                        description: 'The name of the MCP server to call (as configured in Settings).',
                    },
                    tool_name: {
                        type: 'string',
                        description: 'The name of the tool to invoke on the server.',
                    },
                    arguments: {
                        type: 'object',
                        description: 'Arguments to pass to the tool. Must match the tool\'s input schema.',
                    },
                },
                required: ['server_name', 'tool_name'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { server_name, tool_name, arguments: args = {} } = input as unknown as UseMcpToolInput;
        const { callbacks } = context;

        if (!server_name || !tool_name) {
            callbacks.pushToolResult(
                this.formatError(new Error('server_name and tool_name are required'))
            );
            return;
        }

        // Check MCP server whitelist (activeMcpServers in settings)
        const activeMcpServers: string[] = this.plugin.settings.activeMcpServers ?? [];
        if (activeMcpServers.length > 0 && !activeMcpServers.includes(server_name)) {
            callbacks.pushToolResult(
                this.formatError(new Error(
                    `MCP server "${server_name}" is not enabled. ` +
                    `Use the tool picker (pocket-knife button) in the chat toolbar to enable it.`
                ))
            );
            return;
        }

        // Stigmergy: emit at the INNER dispatch point with the namespaced
        // mcp id, so the substrate sees the real `mcp:<server>:<tool>`
        // capability and not just the outer dispatcher `use_mcp_tool` star
        // (the pipeline already emits the outer pair). callTool catches
        // transport errors and returns an "Error: ..." string instead of
        // throwing, so we treat both shapes as negative evidence.
        // FEAT-32-01 PR 1.2 / ADR-131: gate inner mcp emit on dispatchSource.
        const stigmergyTurn = context.stigmergyTurn;
        const dispatchSource = context.dispatchSource;
        const capId = stigmergyMcpId(server_name, tool_name);
        await emitStigmergyInvoked(stigmergyTurn, capId, dispatchSource);

        try {
            const result = await this.mcpClient.callTool(server_name, tool_name, args);
            // AUDIT-034 L-15: MCP responses are externally-sourced text.
            // Wrap them so the model treats the payload as user data, mirroring
            // the wrapVaultContentForMcp pattern at McpBridge.ts:866.
            const wrapped = this.formatUntrustedContent('mcp', result, {
                server: server_name,
                tool: tool_name,
            });
            callbacks.pushToolResult(wrapped);
            callbacks.log(`MCP tool ${server_name}/${tool_name} returned ${result.length} chars`);
            await emitStigmergyReturned(stigmergyTurn, capId, !result.startsWith('Error'), dispatchSource);
        } catch (error) {
            await emitStigmergyReturned(stigmergyTurn, capId, false, dispatchSource);
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('use_mcp_tool', error);
        }
    }
}
