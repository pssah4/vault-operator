/**
 * ReadMcpToolTool -- FEAT-24-06 / ADR-118 (MCP on-demand detail).
 *
 * The MCP listing in the stable system-prompt prefix
 * (`prompts/sections/tools.ts`) caps every tool description at 200 chars.
 * When the model needs the full text or the input schema before calling
 * `use_mcp_tool`, it calls this tool first; the body lives in the message
 * stream and falls under microcompaction (FEAT-24-02) like any other tool
 * result.
 *
 * NOT in DEFERRED_TOOL_NAMES -- must be available immediately so the
 * "truncated description -> read_mcp_tool -> use_mcp_tool" chain is a
 * single round-trip, not two.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { McpClient, McpToolInfo } from '../../mcp/McpClient';

export class ReadMcpToolTool extends BaseTool<'read_mcp_tool'> {
    readonly name = 'read_mcp_tool' as const;
    readonly isWriteOperation = false;

    private readonly mcpClient: McpClient;

    constructor(plugin: ObsidianAgentPlugin, mcpClient: McpClient) {
        super(plugin);
        this.mcpClient = mcpClient;
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'read_mcp_tool',
            description:
                'Read the full description and a compact input-schema summary of a single tool on a connected MCP server. '
                + 'Use this when the MCP listing in the system prompt shows '
                + '"... [full description: read_mcp_tool({ server, name })]" '
                + 'and you need the rest of the description or the schema '
                + 'before calling the tool via use_mcp_tool.',
            input_schema: {
                type: 'object',
                properties: {
                    server: {
                        type: 'string',
                        description: 'Exact MCP server name as listed in the system prompt.',
                    },
                    name: {
                        type: 'string',
                        description: 'Tool name on that server (without server prefix).',
                    },
                },
                required: ['server', 'name'],
            },
        };
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- BaseTool contract requires a Promise<void> return; this tool's work is CPU-bound only
    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const server = typeof input.server === 'string' ? input.server.trim() : '';
        const toolName = typeof input.name === 'string' ? input.name.trim() : '';

        if (!server || !toolName) {
            callbacks.pushToolResult(this.formatError(new Error('server and name are required')));
            return;
        }

        // Same whitelist check as use_mcp_tool: the user must have enabled
        // this MCP server in the tool picker.
        const activeMcpServers: string[] = this.plugin.settings.activeMcpServers ?? [];
        if (activeMcpServers.length > 0 && !activeMcpServers.includes(server)) {
            callbacks.pushToolResult(
                this.formatError(new Error(
                    `MCP server "${server}" is not enabled. `
                    + 'Use the tool picker (pocket-knife button) in the chat toolbar to enable it.',
                )),
            );
            return;
        }

        const conn = this.mcpClient.getConnection(server);
        if (!conn || conn.status !== 'connected') {
            const connected = this.mcpClient.getConnections()
                .filter(c => c.status === 'connected')
                .map(c => c.name);
            const list = connected.length > 0 ? connected.join(', ') : '(none)';
            callbacks.pushToolResult(
                this.formatError(new Error(
                    `MCP server "${server}" is not connected. Connected servers: ${list}.`,
                )),
            );
            return;
        }

        const tool = conn.tools.find(t => t.name === toolName);
        if (!tool) {
            const available = conn.tools.map(t => t.name);
            const list = available.length > 0 ? available.join(', ') : '(server reports no tools)';
            callbacks.pushToolResult(
                this.formatError(new Error(
                    `Tool "${toolName}" not found on MCP server "${server}". Available tools: ${list}.`,
                )),
            );
            return;
        }

        callbacks.pushToolResult(this.formatSuccess(this.render(server, tool)));
    }

    // -----------------------------------------------------------------------
    // Renderer
    // -----------------------------------------------------------------------

    private render(server: string, tool: McpToolInfo): string {
        const description = tool.description?.trim();
        const schemaSummary = this.renderInputSchemaSummary(tool.inputSchema);
        const parts: string[] = [
            `## MCP TOOL: ${server}.${tool.name}`,
            'Call this tool via use_mcp_tool(server, tool_name, arguments) when ready.',
            '',
        ];
        if (description) {
            parts.push(`**Description:** ${description}`);
        } else {
            parts.push('**Description:** (the server returned no description)');
        }
        if (schemaSummary) {
            parts.push('', '**Input schema summary:**', schemaSummary);
        } else {
            parts.push('', '**Input schema summary:** (no input schema reported by the server)');
        }
        return parts.join('\n');
    }

    private renderInputSchemaSummary(schema: Record<string, unknown> | undefined): string | null {
        if (!schema || typeof schema !== 'object') return null;
        const propsRaw = (schema as { properties?: unknown }).properties;
        if (!propsRaw || typeof propsRaw !== 'object') return null;
        const requiredRaw = (schema as { required?: unknown }).required;
        const required = new Set<string>(Array.isArray(requiredRaw)
            ? requiredRaw.filter((r): r is string => typeof r === 'string')
            : []);
        const lines: string[] = [];
        for (const [propName, propSchema] of Object.entries(propsRaw as Record<string, unknown>)) {
            lines.push(`- ${propName}: ${this.describeType(propSchema)}${required.has(propName) ? ', required' : ''}`);
        }
        return lines.length > 0 ? lines.join('\n') : null;
    }

    private describeType(propSchema: unknown): string {
        if (!propSchema || typeof propSchema !== 'object') return 'any';
        const ps = propSchema as { type?: unknown; enum?: unknown; items?: unknown };
        if (Array.isArray(ps.enum)) {
            const values = ps.enum
                .filter((v): v is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof v))
                .map(v => JSON.stringify(v));
            if (values.length > 0) return `enum(${values.join(' | ')})`;
        }
        if (typeof ps.type === 'string') {
            if (ps.type === 'array' && ps.items && typeof ps.items === 'object') {
                return `array<${this.describeType(ps.items)}>`;
            }
            return ps.type;
        }
        if (Array.isArray(ps.type)) {
            return ps.type
                .filter((t): t is string => typeof t === 'string')
                .join(' | ') || 'any';
        }
        return 'any';
    }
}
