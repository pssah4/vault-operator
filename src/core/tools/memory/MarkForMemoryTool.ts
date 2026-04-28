/**
 * mark_for_memory -- explicit user-triggered memory save.
 *
 * Bypasses the autoExtractSessions toggle and the extractionThreshold
 * gate so the user can always force a save with phrases like "remember
 * this" / "merk dir das" / "save to memory". The agent calls this tool
 * when it detects such an instruction; the queue treats the item as
 * `bypassThrottle=true` so future re-extract throttles will not skip
 * it either.
 *
 * The queue itself runs SingleCallProcessor (Phase 4 / FEATURE-0318):
 * one tool-call extracts session summary + facts + mentions in one go.
 *
 * FEATURE-0318 / PLAN-007 task A.6 + manual-trigger half.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

export class MarkForMemoryTool extends BaseTool<'mark_for_memory'> {
    readonly name = 'mark_for_memory' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'mark_for_memory',
            description:
                'Save the current sidebar conversation to long-term memory immediately, ' +
                'bypassing the auto-extract toggle and message-count threshold. ' +
                'Call this when the user says "remember this", "merk dir das", ' +
                '"save to memory", "save this conversation" or any equivalent instruction. ' +
                'No arguments required; the active conversation is picked up automatically.',
            input_schema: {
                type: 'object',
                properties: {
                    reason: {
                        type: 'string',
                        description:
                            'Optional one-line note about why this was marked. Surfaced in telemetry only.',
                    },
                },
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const queue = this.plugin.extractionQueue;
        if (!this.plugin.settings.memory.enabled) {
            callbacks.pushToolResult(
                'Memory is disabled in Settings -> Memory. Enable it first, then try again.',
            );
            return;
        }
        if (!queue) {
            callbacks.pushToolResult(
                'Memory pipeline is not initialised. The conversation could not be queued.',
            );
            return;
        }
        const snapshot = this.plugin.snapshotActiveConversationForMemory();
        if (!snapshot) {
            callbacks.pushToolResult(
                'No active conversation to save. Make sure the chat sidebar is open and has at least one user message.',
            );
            return;
        }
        try {
            await queue.enqueueImmediate(snapshot);
            const reason = typeof input.reason === 'string' && input.reason.trim().length > 0
                ? ` (${input.reason.trim()})`
                : '';
            callbacks.pushToolResult(
                `Conversation '${snapshot.title}' queued for immediate memory extraction${reason}. ` +
                `Single-Call extraction will run in the background.`,
            );
        } catch (e) {
            callbacks.pushToolResult(this.formatError(e));
        }
    }
}
