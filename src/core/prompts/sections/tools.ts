/**
 * Tools Section
 *
 * Generates tool descriptions filtered by the active mode's tool groups.
 * Tool metadata comes from the central toolMetadata.ts (single source of truth).
 * MCP tools are dynamically listed from connected servers when available.
 */

import type { ToolGroup } from '../../../types/settings';
import type { McpClient } from '../../mcp/McpClient';
import { buildToolPromptSection } from '../../tools/toolMetadata';

/**
 * FEAT-24-06 / ADR-118: cap MCP tool descriptions at 200 chars so a verbose
 * MCP server (long JSON-schema examples in the description) does not bloat
 * the cached system-prompt prefix. The model can pull the full description
 * on demand via `read_mcp_tool({ server, name })`.
 */
export const MCP_DESCRIPTION_CAP = 200;

export function capMcpDescription(description: string, server: string, name: string): string {
    if (description.length <= MCP_DESCRIPTION_CAP) return description;
    const head = description.slice(0, MCP_DESCRIPTION_CAP).trimEnd();
    return `${head} ... [full description: read_mcp_tool({ server: "${server}", name: "${name}" })]`;
}

export function getToolsSection(
    toolGroups: ToolGroup[],
    mcpClient?: McpClient,
    allowedMcpServers?: string[],
    webEnabled?: boolean,
    // ADR-080 Lever 8: default to COMPACT (one line per tool). Full docs via find_tool.
    includeExamples = false,
): string {
    const parts: string[] = [
        '====', '', 'TOOLS', '',
        'You have access to these tools. Use them proactively — do not guess at file contents or vault structure.', '',
    ];

    // Generate non-MCP tool descriptions from central metadata.
    // When web tools are disabled, remove the 'web' group from the prompt
    // and insert a notice so the LLM knows the capability exists but is not configured.
    let nonMcpGroups = toolGroups.filter((g) => g !== 'mcp');
    if (!webEnabled && nonMcpGroups.includes('web')) {
        nonMcpGroups = nonMcpGroups.filter((g) => g !== 'web');
        parts.push('**Web:** Disabled. When the user asks for internet search, the ONLY reason is webTools.enabled=false. Ask the user for permission first: "Web search is currently disabled. Shall I enable it?" If they agree, call update_settings(action:"set", path:"webTools.enabled", value:true), then use web_search. Do NOT enable without asking. Do NOT mention API keys or providers — that is handled at runtime. Do NOT fall back to vault search.\n');
    }
    if (nonMcpGroups.length > 0) {
        parts.push(buildToolPromptSection(nonMcpGroups, includeExamples));
    }

    // MCP tools: dynamic listing from connected servers when available
    if (toolGroups.includes('mcp')) {
        if (mcpClient) {
            const rawMcpTools = mcpClient.getAllTools();
            const allMcpTools = (allowedMcpServers && allowedMcpServers.length > 0)
                ? rawMcpTools.filter(({ serverName }) => allowedMcpServers.includes(serverName))
                : rawMcpTools;
            if (allMcpTools.length > 0) {
                const toolLines = allMcpTools.map(({ serverName, tool }) => {
                    const desc = tool.description
                        ? ' -- ' + capMcpDescription(tool.description, serverName, tool.name)
                        : '';
                    return `  - ${serverName}: ${tool.name}${desc}`;
                }).join('\n');
                parts.push(
                    `**MCP Tools (via use_mcp_tool):**\n` +
                    `- use_mcp_tool(server_name, tool_name, arguments): Call a tool on a connected MCP server.\n` +
                    `- read_mcp_tool(server, name): Read the full description and input-schema summary of a single MCP tool (use when the listing below shows a truncated description).\n\n` +
                    `Connected servers and their tools:\n${toolLines}`
                );
            } else {
                parts.push(buildToolPromptSection(['mcp']));
            }
        } else {
            parts.push(buildToolPromptSection(['mcp']));
        }
        parts.push('');
    }

    return parts.join('\n');
}
