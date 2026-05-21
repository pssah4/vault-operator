/**
 * FIX-04-03-06: Bedrock-Provider muss tool_use/tool_result-Bloecke aus
 * der History strippen wenn der Aufruf ohne tools erfolgt -- sonst
 * meldet AWS Converse `toolConfig must be defined when using toolUse
 * and toolResult content blocks`.
 *
 * Reine Helper-Tests. Volle createMessage-Integration laesst sich nur
 * gegen das echte AWS SDK testen, das hier nicht installiert ist.
 */

import { describe, it, expect } from 'vitest';
import { stripToolBlocksForNoToolsCall, messagesHaveToolBlocks } from '../bedrock';
import type { MessageParam } from '../../types';

describe('Bedrock helper: stripToolBlocksForNoToolsCall (FIX-04-03-06)', () => {
    it('replaces tool_use blocks with a text marker', () => {
        const messages: MessageParam[] = [
            { role: 'user', content: 'do a thing' },
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'sure, calling read_file' },
                    { type: 'tool_use', id: 'tu_1', name: 'read_file', input: { path: 'foo.md' } },
                ],
            },
            {
                role: 'user',
                content: [
                    { type: 'tool_result', tool_use_id: 'tu_1', content: 'file contents here' },
                ],
            },
        ];
        const sanitized = stripToolBlocksForNoToolsCall(messages);
        const assistantContent = sanitized[1].content;
        const userContent = sanitized[2].content;
        // Assistant tool_use -> text marker, original text preserved.
        if (typeof assistantContent === 'string' || !Array.isArray(assistantContent)) {
            throw new Error('assistant content should remain array');
        }
        expect(assistantContent.some((b) => b.type === 'tool_use')).toBe(false);
        expect(assistantContent.some((b) => b.type === 'text' && b.text.includes('read_file'))).toBe(true);
        // User tool_result -> text marker
        if (!Array.isArray(userContent)) throw new Error('user content should remain array');
        expect(userContent.some((b) => b.type === 'tool_result')).toBe(false);
        expect(userContent.some((b) => b.type === 'text' && /tool result/i.test(b.text))).toBe(true);
    });

    it('leaves messages alone when no tool blocks are present', () => {
        const messages: MessageParam[] = [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi' },
        ];
        const sanitized = stripToolBlocksForNoToolsCall(messages);
        expect(sanitized).toEqual(messages);
    });

    it('does not mutate the input array', () => {
        const messages: MessageParam[] = [
            {
                role: 'assistant',
                content: [
                    { type: 'tool_use', id: 'tu_1', name: 'read_file', input: {} },
                ],
            },
        ];
        const original = JSON.stringify(messages);
        stripToolBlocksForNoToolsCall(messages);
        expect(JSON.stringify(messages)).toBe(original);
    });

    it('preserves message order and roles', () => {
        const messages: MessageParam[] = [
            { role: 'user', content: 'a' },
            { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }] },
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'r' }] },
            { role: 'assistant', content: 'b' },
        ];
        const sanitized = stripToolBlocksForNoToolsCall(messages);
        expect(sanitized.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    });

    it('handles tool_result with array content (multimodal)', () => {
        const messages: MessageParam[] = [
            {
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: 'tu_1',
                        content: [{ type: 'text', text: 'some text content' }],
                    },
                ],
            },
        ];
        const sanitized = stripToolBlocksForNoToolsCall(messages);
        const content = sanitized[0].content;
        if (!Array.isArray(content)) throw new Error('should be array');
        expect(content.some((b) => b.type === 'tool_result')).toBe(false);
        expect(content[0].type).toBe('text');
    });
});

describe('Bedrock helper: messagesHaveToolBlocks (FIX-04-03-06)', () => {
    it('returns true when any message has tool_use', () => {
        const messages: MessageParam[] = [
            { role: 'user', content: 'a' },
            { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }] },
        ];
        expect(messagesHaveToolBlocks(messages)).toBe(true);
    });

    it('returns true when any message has tool_result', () => {
        const messages: MessageParam[] = [
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'r' }] },
        ];
        expect(messagesHaveToolBlocks(messages)).toBe(true);
    });

    it('returns false when only text + image blocks are present', () => {
        const messages: MessageParam[] = [
            { role: 'user', content: 'a' },
            { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
        ];
        expect(messagesHaveToolBlocks(messages)).toBe(false);
    });
});
