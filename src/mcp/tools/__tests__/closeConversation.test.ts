/**
 * AUDIT-015 Eval-Coverage: closeConversation MCP-Handler.
 */

import { describe, it, expect } from 'vitest';
import { handleCloseConversation } from '../closeConversation';
import { ActiveMcpSessions } from '../../../core/memory/ActiveMcpSessions';
import type ObsidianAgentPlugin from '../../../main';

function plugin(sessions: ActiveMcpSessions | null) {
    return { activeMcpSessions: sessions } as unknown as ObsidianAgentPlugin;
}

describe('handleCloseConversation (AUDIT-015 Eval-Coverage)', () => {
    it('rejects missing conversation_id', async () => {
        const r = await handleCloseConversation(plugin(new ActiveMcpSessions()), {});
        expect(r.isError).toBe(true);
    });

    it('returns soft-message when sessions store unavailable', async () => {
        const r = await handleCloseConversation(plugin(null), { conversation_id: 'abc' });
        expect(r.isError).toBeUndefined();
        expect(r.content[0].text).toMatch(/unavailable/i);
    });

    it('returns "already closed" message for unknown conversation_id (idempotent)', async () => {
        const sessions = new ActiveMcpSessions();
        const r = await handleCloseConversation(plugin(sessions), { conversation_id: 'unknown' });
        expect(r.content[0].text).toMatch(/already closed|never opened/i);
    });

    it('closes an active session and reports success', async () => {
        const sessions = new ActiveMcpSessions();
        sessions.register({
            mcpToken: 'tok', sourceInterface: 'claude-ai', livingDocument: true, initialMessagesHash: 'h',
        }, 'conv-1', 'thread-1');
        const r = await handleCloseConversation(plugin(sessions), { conversation_id: 'conv-1' });
        expect(r.content[0].text).toMatch(/closed/i);
        expect(sessions.size()).toBe(0);
    });
});
