import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationStore } from '../ConversationStore';
import type { FileAdapter } from '../../storage/types';

function makeFs(): FileAdapter {
    const store: Record<string, string> = {};
    return {
        exists: (p: string) => Promise.resolve(p in store),
        read: (p: string) => p in store ? Promise.resolve(store[p]) : Promise.reject(new Error('Not found')),
        write: (p: string, data: string) => { store[p] = data; return Promise.resolve(); },
        mkdir: () => Promise.resolve(),
        list: () => Promise.resolve({ files: [] as string[], folders: [] as string[] }),
        remove: (p: string) => { delete store[p]; return Promise.resolve(); },
        append: () => Promise.resolve(),
        stat: () => Promise.resolve(null),
    };
}

describe('ConversationStore (FIX-23-01-01: appendMessages + listByThread)', () => {
    let fs: FileAdapter;
    let store: ConversationStore;

    beforeEach(async () => {
        fs = makeFs();
        store = new ConversationStore(fs);
        await store.initialize();
    });

    describe('appendMessages', () => {
        it('appendet delta-messages an existing conversation', async () => {
            const id = await store.create('mcp', 'claude-ai', { sourceInterface: 'claude-ai' });
            await store.save(id, [
                { role: 'user', content: 'Hi' },
                { role: 'assistant', content: 'Hello' },
            ], [
                { role: 'user', text: 'Hi', ts: 't1' },
                { role: 'assistant', text: 'Hello', ts: 't2' },
            ]);
            const newCount = await store.appendMessages(id,
                [{ role: 'user', content: 'How are you?' }, { role: 'assistant', content: 'Fine' }],
                [{ role: 'user', text: 'How are you?', ts: 't3' }, { role: 'assistant', text: 'Fine', ts: 't4' }],
            );
            expect(newCount).toBe(4);
            const data = await store.load(id);
            expect(data?.uiMessages).toHaveLength(4);
            expect(data?.uiMessages[2].text).toBe('How are you?');
            expect(data?.meta.messageCount).toBe(4);
        });

        it('returns -1 fuer unknown conversation_id', async () => {
            const result = await store.appendMessages('unknown', [], []);
            expect(result).toBe(-1);
        });
    });

    describe('listByThread', () => {
        it('groups conversations by crossInterfaceThreadId across sources', async () => {
            const threadId = 'thread-2026-05-03-abc123';
            const a = await store.create('mcp', 'claude-ai', { sourceInterface: 'claude-ai' });
            await store.updateMeta(a, { crossInterfaceThreadId: threadId });
            const b = await store.create('mcp', 'claude-code', { sourceInterface: 'claude-code' });
            await store.updateMeta(b, { crossInterfaceThreadId: threadId });
            const c = await store.create('mcp', 'chatgpt', { sourceInterface: 'chatgpt' }); // not in thread

            const members = store.listByThread(threadId);
            expect(members.map((m) => m.id).sort()).toEqual([a, b].sort());
            expect(members.find((m) => m.id === c)).toBeUndefined();
        });

        it('returns empty when no conversation matches', () => {
            expect(store.listByThread('thread-nope')).toEqual([]);
        });
    });
});
