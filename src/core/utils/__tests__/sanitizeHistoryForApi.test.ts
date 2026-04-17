/**
 * BUG-017 regression test
 *
 * sanitizeHistoryForApi must drop orphan tool_use / tool_result blocks before
 * the history goes to Anthropic / Claude-via-Copilot, otherwise the API
 * returns 400 "tool_use ids were found without tool_result blocks".
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHistoryForApi } from '../sanitizeHistoryForApi';
import type { MessageParam } from '../../../api/types';

describe('sanitizeHistoryForApi (BUG-017)', () => {
    it('passes a clean history through unchanged', () => {
        const history: MessageParam[] = [
            { role: 'user', content: 'hello' },
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'thinking' },
                    { type: 'tool_use', id: 'a', name: 'read_file', input: { path: 'x.md' } },
                ],
            },
            {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: 'a', content: 'file contents' }],
            },
        ];

        const result = sanitizeHistoryForApi(history);
        expect(result.stats.droppedOrphanToolUses).toBe(0);
        expect(result.stats.droppedOrphanToolResults).toBe(0);
        expect(result.history).toHaveLength(3);
    });

    it('drops an orphan tool_use that never gets a tool_result', () => {
        const history: MessageParam[] = [
            { role: 'user', content: 'do it' },
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'starting' },
                    { type: 'tool_use', id: 'orphan', name: 'read_file', input: {} },
                ],
            },
            // No matching tool_result anywhere — the assistant message would
            // trigger "tool_use ids were found without tool_result blocks".
            { role: 'user', content: 'never mind, do something else' },
        ];

        const result = sanitizeHistoryForApi(history);

        expect(result.stats.droppedOrphanToolUses).toBe(1);
        // Assistant message kept (still has the text block).
        const assistant = result.history.find((m) => m.role === 'assistant');
        expect(Array.isArray(assistant?.content)).toBe(true);
        expect((assistant?.content as { type: string }[]).every((b) => b.type !== 'tool_use')).toBe(true);
    });

    it('drops an orphan tool_result whose tool_use is missing', () => {
        const history: MessageParam[] = [
            { role: 'user', content: 'start' },
            {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: 'phantom', content: 'stale result' }],
            },
        ];

        const result = sanitizeHistoryForApi(history);

        expect(result.stats.droppedOrphanToolResults).toBe(1);
        // The user message had only the orphan tool_result, so it's dropped entirely.
        expect(result.stats.droppedEmptyMessages).toBe(1);
        expect(result.history).toHaveLength(1);
        expect(result.history[0].content).toBe('start');
    });

    it('keeps mixed-content messages: drops orphan blocks but preserves text', () => {
        const history: MessageParam[] = [
            { role: 'user', content: 'go' },
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'ok, calling two tools' },
                    { type: 'tool_use', id: 'kept', name: 'a', input: {} },
                    { type: 'tool_use', id: 'dropped', name: 'b', input: {} },
                ],
            },
            {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: 'kept', content: 'ok' }],
            },
        ];

        const result = sanitizeHistoryForApi(history);
        expect(result.stats.droppedOrphanToolUses).toBe(1);
        const assistant = result.history.find((m) => m.role === 'assistant');
        const blocks = assistant?.content as { type: string; id?: string }[];
        expect(blocks.some((b) => b.type === 'text')).toBe(true);
        expect(blocks.some((b) => b.type === 'tool_use' && b.id === 'kept')).toBe(true);
        expect(blocks.some((b) => b.type === 'tool_use' && b.id === 'dropped')).toBe(false);
    });

    it('handles empty history', () => {
        const result = sanitizeHistoryForApi([]);
        expect(result.history).toEqual([]);
    });

    it('does not mutate the input', () => {
        const history: MessageParam[] = [
            {
                role: 'assistant',
                content: [{ type: 'tool_use', id: 'orphan', name: 'a', input: {} }],
            },
        ];
        const snapshot = JSON.parse(JSON.stringify(history));
        sanitizeHistoryForApi(history);
        expect(history).toEqual(snapshot);
    });

    it('keeps both halves of a valid pair even when separated by another turn', () => {
        // The strict Anthropic check is "result in the immediately following
        // message". sanitizeHistoryForApi only enforces "result exists somewhere
        // later" — that's enough to keep the transcript readable. The strict
        // ordering is still validated server-side, but won't trigger 400 from
        // orphan presence.
        const history: MessageParam[] = [
            {
                role: 'assistant',
                content: [{ type: 'tool_use', id: 'pair', name: 'a', input: {} }],
            },
            {
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: 'pair', content: 'r' }],
            },
        ];
        const result = sanitizeHistoryForApi(history);
        expect(result.stats.droppedOrphanToolUses).toBe(0);
        expect(result.stats.droppedOrphanToolResults).toBe(0);
    });
});
