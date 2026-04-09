/**
 * execute_vault_op -- General-purpose tool dispatcher for MCP.
 *
 * Delegates to ANY registered Agent tool via ToolRegistry.
 * This is the "master key" that allows MCP clients to invoke
 * all Obsilo capabilities: vault_health_check, generate_canvas,
 * update_frontmatter, semantic_search, create_base, etc.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import type { ToolName } from '../../core/tools/types';

export async function handleExecuteVaultOp(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const operation = args.operation as string | undefined;
    const params = (args.params as Record<string, unknown>) ?? {};

    if (!operation) {
        return {
            content: [{ type: 'text', text: 'Error: operation parameter is required' }],
            isError: true,
        };
    }

    // Look up the tool in the registry
    const tool = plugin.toolRegistry.getTool(operation as ToolName);
    if (!tool) {
        const available = plugin.toolRegistry.getAllTools().map(t => t.name).sort().join(', ');
        return {
            content: [{
                type: 'text',
                text: `Unknown operation: "${operation}". Available operations: ${available}`,
            }],
            isError: true,
        };
    }

    // Execute the tool with a simple callback collector
    const resultParts: string[] = [];
    const logParts: string[] = [];

    try {
        await tool.execute(params, {
            taskId: `mcp-vault-op-${Date.now()}`,
            mode: 'agent',
            callbacks: {
                pushToolResult(content: unknown): void {
                    if (typeof content === 'string') {
                        resultParts.push(content);
                    } else if (Array.isArray(content)) {
                        for (const block of content) {
                            if (typeof block === 'object' && block !== null && 'text' in block) {
                                resultParts.push((block as { text: string }).text);
                            }
                        }
                    }
                },
                handleError(_toolName: string, error: unknown): void {
                    const msg = error instanceof Error ? error.message : String(error);
                    resultParts.push(`Error: ${msg}`);
                },
                log(message: string): void {
                    logParts.push(message);
                },
            },
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
            content: [{ type: 'text', text: `Operation "${operation}" failed: ${msg}` }],
            isError: true,
        };
    }

    const result = resultParts.join('\n') || `Operation "${operation}" completed.`;
    if (logParts.length > 0) {
        console.debug(`[MCP:execute_vault_op] ${operation}: ${logParts.join('; ')}`);
    }

    return {
        content: [{ type: 'text', text: result }],
        isError: false,
    };
}
