/**
 * FEAT-24-01 (ADR-62 amendment): rolling prompt-cache breakpoints in the
 * Anthropic message history. One marker on the last user message (advances
 * each turn), one ~6 messages back (stays a stable cache prefix). Plus the
 * markLastBlock helper that puts cache_control on a message's last block,
 * converting string content to an array text block when needed.
 */

import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { markLastBlock, markRollingHistoryBreakpoints } from '../anthropic';

type Msg = Anthropic.MessageParam;

function hasCacheControl(block: unknown): boolean {
    return !!block && typeof block === 'object' && 'cache_control' in (block as Record<string, unknown>);
}

describe('markLastBlock', () => {
    it('converts a string-content message to a single cached text block', () => {
        const msg: Msg = { role: 'user', content: 'hello' };
        markLastBlock(msg);
        expect(Array.isArray(msg.content)).toBe(true);
        const blocks = msg.content as Anthropic.Messages.ContentBlockParam[];
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('text');
        expect(hasCacheControl(blocks[0])).toBe(true);
    });

    it('marks the last block of an array-content message', () => {
        const msg: Msg = { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] };
        markLastBlock(msg);
        const blocks = msg.content as Anthropic.Messages.ContentBlockParam[];
        expect(hasCacheControl(blocks[0])).toBe(false);
        expect(hasCacheControl(blocks[1])).toBe(true);
    });

    it('marks a tool_result block in place', () => {
        const msg: Msg = { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }] };
        markLastBlock(msg);
        const blocks = msg.content as Anthropic.Messages.ContentBlockParam[];
        expect(hasCacheControl(blocks[0])).toBe(true);
    });

    it('appends a tiny cached text block when the last block cannot carry cache_control', () => {
        const msg: Msg = { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AA==' } }] };
        markLastBlock(msg);
        const blocks = msg.content as Anthropic.Messages.ContentBlockParam[];
        expect(blocks).toHaveLength(2);
        expect(blocks[1].type).toBe('text');
        expect(hasCacheControl(blocks[1])).toBe(true);
        expect(hasCacheControl(blocks[0])).toBe(false);
    });
});

describe('markRollingHistoryBreakpoints', () => {
    function userBlocks(m: Msg): Anthropic.Messages.ContentBlockParam[] {
        return Array.isArray(m.content) ? m.content : [];
    }

    it('does nothing on an empty history', () => {
        const messages: Msg[] = [];
        markRollingHistoryBreakpoints(messages);
        expect(messages).toHaveLength(0);
    });

    it('marks only the last user message in a short history', () => {
        const messages: Msg[] = [
            { role: 'user', content: 'task' },
            { role: 'assistant', content: 'answer' },
            { role: 'user', content: 'follow up' },
        ];
        markRollingHistoryBreakpoints(messages);
        // last user (index 2) marked
        expect(hasCacheControl(userBlocks(messages[2])[0])).toBe(true);
        // first user (index 0) is only 2 messages back -> within the STABLE_BACKOFF of 6, not marked
        expect(messages[0].content).toBe('task');
    });

    it('marks the last user message AND a user message at least ~6 back in a long history', () => {
        const messages: Msg[] = [];
        // 12 turns: alternating user/assistant
        for (let i = 0; i < 12; i++) {
            messages.push({ role: 'user', content: `u${i}` });
            messages.push({ role: 'assistant', content: `a${i}` });
        }
        // make the very last message a user message
        messages.push({ role: 'user', content: 'final question' });
        const lastIdx = messages.length - 1;
        markRollingHistoryBreakpoints(messages);

        // last user marked
        expect(hasCacheControl(userBlocks(messages[lastIdx])[0])).toBe(true);
        // exactly one earlier user message marked, and it sits >= 6 positions back
        const markedEarlier = messages
            .map((m, idx) => ({ idx, m }))
            .filter(({ idx, m }) => idx < lastIdx && m.role === 'user' && Array.isArray(m.content) && hasCacheControl(userBlocks(m)[0]));
        expect(markedEarlier).toHaveLength(1);
        expect(lastIdx - markedEarlier[0].idx).toBeGreaterThanOrEqual(6);
    });
});
