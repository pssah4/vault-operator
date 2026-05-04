/**
 * execute_vault_op -- General-purpose tool dispatcher for MCP.
 *
 * Delegates to any registered Agent tool, routing the call through
 * `ToolExecutionPipeline` so that all governance layers participate:
 *
 *   - IgnoreService (path-based access control)
 *   - JSON-Schema input validation
 *   - Approval flow (write tools fail-closed when no callback is wired)
 *   - Checkpoint creation for write operations
 *   - Result cache for read operations
 *   - Operation log
 *
 * Tools in `AGENT_INTERNAL_TOOLS` are denied at the boundary regardless
 * of pipeline behaviour, because they are conceptually agent-only
 * (switch_mode, new_task, update_todo_list, ...). Write tools are denied
 * by the pipeline's fail-closed approval logic when no `onApprovalRequired`
 * callback is provided -- which is the case here, by design: an MCP
 * client has no user session to approve a write, so writes are not
 * permitted via this dispatcher. Dedicated MCP tools (`write_vault`)
 * exist for the cases where the user wants writes.
 *
 * AUDIT-013 C-1 (proper fix, replaces interim deny-list).
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import type { ToolName, ToolUse } from '../../core/tools/types';
import { AGENT_INTERNAL_TOOLS } from '../McpBridge';
import { ToolExecutionPipeline } from '../../core/tool-execution/ToolExecutionPipeline';

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

    // Defense in depth: agent-internal tools are not part of the MCP
    // surface. The pipeline would auto-approve some of them (group=agent
    // is auto-approved by checkApproval), so we filter here before the
    // pipeline runs.
    if (AGENT_INTERNAL_TOOLS.has(operation)) {
        return {
            content: [{ type: 'text', text: `Operation "${operation}" is agent-internal and not callable via MCP.` }],
            isError: true,
        };
    }

    // Look up the tool in the registry (early signal for unknown ops)
    const tool = plugin.toolRegistry.getTool(operation as ToolName);
    if (!tool) {
        const available = plugin.toolRegistry
            .getAllTools()
            .map((t) => t.name)
            .filter((n) => !AGENT_INTERNAL_TOOLS.has(n))
            .sort()
            .join(', ');
        return {
            content: [{
                type: 'text',
                text: `Unknown operation: "${operation}". Available operations: ${available}`,
            }],
            isError: true,
        };
    }

    // Per-call pipeline. No apiHandler is wired so tools that need an LLM
    // (e.g. plan_presentation) are unavailable from MCP context, and no
    // approval callback is wired so write tools fail-closed.
    const taskId = `mcp-vault-op-${Date.now()}`;
    const pipeline = new ToolExecutionPipeline(
        plugin,
        plugin.toolRegistry,
        taskId,
        'agent',
        // apiHandler intentionally omitted
    );

    const toolCall: ToolUse = {
        type: 'tool_use',
        id: taskId,
        name: operation as ToolName,
        input: params,
    };

    const resultParts: string[] = [];
    const logParts: string[] = [];

    let result;
    try {
        result = await pipeline.executeTool(
            toolCall,
            {
                pushToolResult(content: string | unknown): void {
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
                handleError(_toolName: string, error: unknown): Promise<void> {
                    const msg = error instanceof Error ? error.message : String(error);
                    resultParts.push(`Error: ${msg}`);
                    return Promise.resolve();
                },
                log(message: string): void {
                    logParts.push(message);
                },
            },
            // No extensions: no onApprovalRequired (writes fail-closed),
            // no spawnSubtask, no askQuestion, no readFiles tracking.
            undefined,
        );
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
            content: [{ type: 'text', text: `Operation "${operation}" failed: ${msg}` }],
            isError: true,
        };
    }

    // Pipeline returns content as a string OR a content-block array. Extract
    // text. For multimodal content blocks (rare here) only text is forwarded.
    const pipelineText = extractPipelineText(result.content);
    if (pipelineText) resultParts.push(pipelineText);

    const text = resultParts.join('\n') || `Operation "${operation}" completed (no output).`;
    if (logParts.length > 0) {
        console.debug(`[MCP:execute_vault_op] ${operation}: ${logParts.join('; ')}`);
    }
    return {
        content: [{ type: 'text', text }],
        isError: result.is_error ?? false,
    };
}

function extractPipelineText(content: string | unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter((b) => typeof b === 'object' && b !== null && 'text' in b)
            .map((b) => (b as { text: string }).text)
            .join('\n');
    }
    return '';
}
