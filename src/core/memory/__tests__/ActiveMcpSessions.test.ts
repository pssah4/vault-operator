import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    ActiveMcpSessions,
    hashInitialMessages,
    generateThreadId,
    isValidThreadId,
    makeKey,
    type SessionLookupContext,
} from '../ActiveMcpSessions';

function ctx(opts: Partial<SessionLookupContext> = {}): SessionLookupContext {
    return {
        mcpToken: 'token-A',
        sourceInterface: 'claude-ai',
        livingDocument: true,
        initialMessagesHash: 'h-1',
        ...opts,
    };
}

describe('ActiveMcpSessions (FIX-23-01-01 / ADR-110)', () => {
    let sessions: ActiveMcpSessions;
    beforeEach(() => {
        sessions = new ActiveMcpSessions();
        vi.useRealTimers();
    });

    describe('decide()', () => {
        it('first call returns null (no active session)', () => {
            expect(sessions.decide(ctx())).toBeNull();
        });

        it('living-document=true with matching hash returns the active session', () => {
            sessions.register(ctx(), 'conv-1', 'thread-1');
            const decision = sessions.decide(ctx());
            expect(decision?.conversationId).toBe('conv-1');
        });

        it('living-document=true with different hash now ALSO appends (Pass 7 relaxation)', () => {
            sessions.register(ctx(), 'conv-1', 'thread-1');
            // External clients often send only delta-messages -> hash differs
            // -> we must still append into the active session, not create new.
            const decision = sessions.decide(ctx({ initialMessagesHash: 'different' }));
            expect(decision?.conversationId).toBe('conv-1');
        });

        it('living-document=false always creates new', () => {
            sessions.register(ctx(), 'conv-1', 'thread-1');
            const decision = sessions.decide(ctx({ livingDocument: false }));
            expect(decision).toBeNull();
        });

        it('explicit conversation_id matching active returns it', () => {
            sessions.register(ctx(), 'conv-1', 'thread-1');
            const decision = sessions.decide(ctx({ explicitConversationId: 'conv-1' }));
            expect(decision?.conversationId).toBe('conv-1');
        });

        it('explicit conversation_id NOT matching forces a new conversation', () => {
            sessions.register(ctx(), 'conv-1', 'thread-1');
            const decision = sessions.decide(ctx({ explicitConversationId: 'conv-other' }));
            expect(decision).toBeNull();
        });

        it('different sourceInterface = different sessionKey = no match', () => {
            sessions.register(ctx({ sourceInterface: 'claude-ai' }), 'conv-1', 'thread-1');
            const decision = sessions.decide(ctx({ sourceInterface: 'chatgpt' }));
            expect(decision).toBeNull();
        });

        it('different mcpToken = different sessionKey = no match', () => {
            sessions.register(ctx({ mcpToken: 'token-A' }), 'conv-1', 'thread-1');
            const decision = sessions.decide(ctx({ mcpToken: 'token-B' }));
            expect(decision).toBeNull();
        });
    });

    describe('timeout (D2: 30 minutes)', () => {
        it('peek returns the session within 30min', () => {
            sessions.register(ctx(), 'conv-1', 'thread-1');
            const key = makeKey('token-A', 'claude-ai');
            expect(sessions.peek(key)?.conversationId).toBe('conv-1');
        });

        it('peek evicts session after 30min', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-05-03T10:00:00Z'));
            sessions.register(ctx(), 'conv-1', 'thread-1');
            vi.setSystemTime(new Date('2026-05-03T10:31:00Z')); // 31 min later
            const key = makeKey('token-A', 'claude-ai');
            expect(sessions.peek(key)).toBeNull();
        });

        it('decide returns null after timeout', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-05-03T10:00:00Z'));
            sessions.register(ctx(), 'conv-1', 'thread-1');
            vi.setSystemTime(new Date('2026-05-03T10:31:00Z'));
            expect(sessions.decide(ctx())).toBeNull();
        });
    });

    describe('close + evict', () => {
        it('closeByConversationId removes the matching session', () => {
            sessions.register(ctx(), 'conv-1', 'thread-1');
            expect(sessions.size()).toBe(1);
            const closed = sessions.closeByConversationId('conv-1');
            expect(closed).toBe(true);
            expect(sessions.size()).toBe(0);
        });

        it('closeByConversationId on unknown id returns false (idempotent)', () => {
            expect(sessions.closeByConversationId('nope')).toBe(false);
        });

        it('evictExpired removes only timed-out sessions', () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-05-03T10:00:00Z'));
            sessions.register(ctx({ mcpToken: 'old' }), 'conv-old', 'thread-old');
            vi.setSystemTime(new Date('2026-05-03T10:25:00Z'));
            sessions.register(ctx({ mcpToken: 'fresh' }), 'conv-fresh', 'thread-fresh');
            vi.setSystemTime(new Date('2026-05-03T10:31:00Z')); // old expired, fresh still alive
            const removed = sessions.evictExpired();
            expect(removed).toBe(1);
            expect(sessions.size()).toBe(1);
        });
    });
});

describe('hashInitialMessages', () => {
    it('produces stable hash for the first 5 messages', () => {
        const m = [
            { role: 'user', text: 'a' },
            { role: 'assistant', text: 'b' },
            { role: 'user', text: 'c' },
            { role: 'assistant', text: 'd' },
            { role: 'user', text: 'e' },
            { role: 'assistant', text: 'f' }, // ignored
        ];
        const h1 = hashInitialMessages(m);
        // adding more messages does not change the initial hash
        const h2 = hashInitialMessages([...m, { role: 'user', text: 'extra' }]);
        expect(h1).toBe(h2);
    });

    it('produces different hashes for different starts', () => {
        const a = hashInitialMessages([{ role: 'user', text: 'hello' }]);
        const b = hashInitialMessages([{ role: 'user', text: 'world' }]);
        expect(a).not.toBe(b);
    });
});

describe('generateThreadId + isValidThreadId', () => {
    it('generated IDs match the validation regex', () => {
        for (let i = 0; i < 5; i++) {
            const id = generateThreadId();
            expect(isValidThreadId(id)).toBe(true);
        }
    });

    it('rejects malformed strings', () => {
        expect(isValidThreadId('thread-2026-05-03-XYZQRS')).toBe(false); // non-hex
        expect(isValidThreadId('thread-2026-5-3-abcdef')).toBe(false);   // missing zero-pad
        expect(isValidThreadId('thread-abc')).toBe(false);
        expect(isValidThreadId(null)).toBe(false);
        expect(isValidThreadId(42)).toBe(false);
    });
});

describe('makeKey', () => {
    it('produces unique keys per (token, source) pair', () => {
        expect(makeKey('tA', 'claude-ai')).not.toBe(makeKey('tB', 'claude-ai'));
        expect(makeKey('tA', 'claude-ai')).not.toBe(makeKey('tA', 'chatgpt'));
    });
    it('is deterministic', () => {
        expect(makeKey('tA', 'claude-ai')).toBe(makeKey('tA', 'claude-ai'));
    });
});
