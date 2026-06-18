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

    describe('titleSource lock (issue #45 quirk 2)', () => {
        it('persistiert titleSource=user wenn das Feld explizit gesetzt wird', async () => {
            const id = await store.create('agent', 'opus-4-7');
            await store.updateMeta(id, { title: 'My Rename', titleSource: 'user' });
            const meta = store.list().find((c) => c.id === id);
            expect(meta?.title).toBe('My Rename');
            expect(meta?.titleSource).toBe('user');
        });

        it('skippt einen Auto-Title-Patch, wenn der User bereits umbenannt hat', async () => {
            const id = await store.create('agent', 'opus-4-7');
            await store.updateMeta(id, { title: 'My Rename', titleSource: 'user' });

            // Automatic writer (onComplete fallback / finalizeConversation /
            // MCP sync) sends just `{ title }` without titleSource.
            await store.updateMeta(id, { title: 'AI-generated title' });

            const meta = store.list().find((c) => c.id === id);
            expect(meta?.title).toBe('My Rename');
            expect(meta?.titleSource).toBe('user');
        });

        it('laesst Nicht-Title-Felder durch, auch wenn der Title geguardet ist', async () => {
            const id = await store.create('agent', 'opus-4-7');
            await store.updateMeta(id, { title: 'My Rename', titleSource: 'user' });

            // saveConversation.ts:163 schreibt z.B. { title, crossInterfaceThreadId }
            // -- title muss skippen, threadId trotzdem ankommen.
            await store.updateMeta(id, {
                title: 'auto-title',
                crossInterfaceThreadId: 'thread-2026-06-16-deadbe',
            });

            const meta = store.list().find((c) => c.id === id);
            expect(meta?.title).toBe('My Rename');
            expect(meta?.crossInterfaceThreadId).toBe('thread-2026-06-16-deadbe');
        });

        it('erlaubt einen erneuten User-Rename, der den Lock haelt', async () => {
            const id = await store.create('agent', 'opus-4-7');
            await store.updateMeta(id, { title: 'First Rename', titleSource: 'user' });
            await store.updateMeta(id, { title: 'Second Rename', titleSource: 'user' });

            const meta = store.list().find((c) => c.id === id);
            expect(meta?.title).toBe('Second Rename');
            expect(meta?.titleSource).toBe('user');
        });

        it('Auto-Patches funktionieren unveraendert, wenn der Title nie user-gelockt wurde', async () => {
            const id = await store.create('agent', 'opus-4-7');
            await store.updateMeta(id, { title: 'fallback' });
            await store.updateMeta(id, { title: 'semantic title' });

            const meta = store.list().find((c) => c.id === id);
            expect(meta?.title).toBe('semantic title');
            expect(meta?.titleSource).toBeUndefined();
        });
    });
});
