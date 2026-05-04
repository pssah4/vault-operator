/**
 * AUDIT-015 H-1 regression test + saveConversation behaviour suite.
 *
 * Covers:
 *   - H-1: per-message text size cap rejects oversize messages
 *   - Living-Document Pass 7: second call within timeout appends
 *   - Pass 9: lazy auto-tracking does not create extra rows here
 *   - source_interface validation + reservation of 'obsilo'
 *   - syncMode resolution from settings (auto vs manual)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSaveConversation } from '../saveConversation';
import { ActiveMcpSessions } from '../../../core/memory/ActiveMcpSessions';
import { DEFAULT_CROSS_SURFACE_SETTINGS } from '../../../core/memory/SourceInterface';
import type ObsidianAgentPlugin from '../../../main';

interface ConvRecord {
    id: string;
    sourceInterface?: string;
    syncState?: string;
    title?: string;
    crossInterfaceThreadId?: string;
    apiMessages: Array<{ role: string; content: string }>;
    uiMessages: Array<{ role: string; text: string; ts: string }>;
}

function makePluginMock(opts: { syncMode?: 'auto' | 'manual'; livingDocumentByDefault?: boolean } = {}) {
    const conversations = new Map<string, ConvRecord>();
    const enqueueCalls: Array<{ conversationId: string; messages: unknown[] }> = [];
    const indexerCalls: Array<{ id: string; count: number }> = [];

    let nextId = 0;
    const store = {
        async create(_mode: string, _model: string, init?: { sourceInterface?: string; syncState?: string }) {
            const id = `conv-${++nextId}`;
            conversations.set(id, {
                id,
                sourceInterface: init?.sourceInterface,
                syncState: init?.syncState,
                apiMessages: [],
                uiMessages: [],
            });
            return id;
        },
        async updateMeta(id: string, patch: Record<string, unknown>) {
            const c = conversations.get(id);
            if (c) Object.assign(c, patch);
        },
        async save(id: string, api: typeof conversations extends Map<string, infer T> ? T extends ConvRecord ? T['apiMessages'] : never : never, ui: ConvRecord['uiMessages']) {
            const c = conversations.get(id);
            if (c) { c.apiMessages = api; c.uiMessages = ui; }
        },
        async load(id: string) {
            const c = conversations.get(id);
            return c ? { meta: { id }, messages: c.apiMessages, uiMessages: c.uiMessages } : null;
        },
        async appendMessages(id: string, deltaApi: ConvRecord['apiMessages'], deltaUi: ConvRecord['uiMessages']) {
            const c = conversations.get(id);
            if (!c) return -1;
            c.apiMessages.push(...deltaApi);
            c.uiMessages.push(...deltaUi);
            return c.uiMessages.length;
        },
    };

    const plugin = {
        conversationStore: store,
        activeMcpSessions: new ActiveMcpSessions(),
        settings: {
            mcpServerToken: 'fake-token',
            memory: {
                crossSurface: {
                    ...DEFAULT_CROSS_SURFACE_SETTINGS,
                    defaultSyncMode: opts.syncMode ?? 'auto',
                    livingDocumentByDefault: opts.livingDocumentByDefault ?? true,
                    perProvider: {
                        'claude-ai': 'global',
                        'chatgpt': 'global',
                        'perplexity': 'global',
                        'unknown': 'global',
                    },
                },
            },
        },
        extractionQueue: {
            enqueue: vi.fn(async (item: { conversationId: string; messages: unknown[] }) => {
                enqueueCalls.push(item);
            }),
            enqueueImmediate: vi.fn(),
        },
        historyIndexer: {
            onConversationSaved: vi.fn(async (id: string, msgs: unknown[]) => {
                indexerCalls.push({ id, count: msgs.length });
            }),
        },
    } as unknown as ObsidianAgentPlugin;

    return { plugin, conversations, enqueueCalls, indexerCalls, store };
}

describe('handleSaveConversation', () => {
    describe('AUDIT-015 H-1: per-message size cap', () => {
        it('rejects when ANY message exceeds 100k chars', async () => {
            const { plugin } = makePluginMock();
            const oversize = 'x'.repeat(100_001);
            const result = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [
                    { role: 'user', text: 'short' },
                    { role: 'assistant', text: oversize },
                ],
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toMatch(/100000/);
            expect(result.content[0].text).toMatch(/rejected/);
        });

        it('accepts a message exactly at the 100k boundary', async () => {
            const { plugin, conversations } = makePluginMock();
            const onLimit = 'y'.repeat(100_000);
            const result = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [{ role: 'user', text: onLimit }],
            });
            expect(result.isError).toBeUndefined();
            expect(conversations.size).toBe(1);
        });

        it('rejects when ALL messages are oversize (cap fires before count check)', async () => {
            const { plugin } = makePluginMock();
            const oversize = 'z'.repeat(100_001);
            const result = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [
                    { role: 'user', text: oversize },
                    { role: 'assistant', text: oversize },
                ],
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toMatch(/no valid|rejected/);
        });
    });

    describe('source_interface validation', () => {
        it('rejects "obsilo" as source (reserved for plugin-internal)', async () => {
            const { plugin } = makePluginMock();
            const result = await handleSaveConversation(plugin, {
                source_interface: 'obsilo',
                messages: [{ role: 'user', text: 'hi' }],
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toMatch(/reserved/);
        });

        it('falls back unknown values to "unknown" via whitelist', async () => {
            const { plugin, conversations } = makePluginMock();
            const result = await handleSaveConversation(plugin, {
                source_interface: 'totally-bogus',
                messages: [{ role: 'user', text: 'hi' }],
            });
            expect(result.isError).toBeUndefined();
            const conv = [...conversations.values()][0];
            expect(conv.sourceInterface).toBe('unknown');
        });
    });

    describe('Living-Document Pass 7 (relaxed Append)', () => {
        it('first call creates, second call within session APPENDS even when messages differ', async () => {
            const { plugin, conversations } = makePluginMock();

            const r1 = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [{ role: 'user', text: 'hello' }, { role: 'assistant', text: 'hi' }],
            });
            expect(r1.content[0].text).toMatch(/created/);
            expect(conversations.size).toBe(1);
            const firstId = [...conversations.keys()][0];

            // Second call with COMPLETELY different first message -> still appends
            // because Pass 7 dropped the hash-match requirement.
            const r2 = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [{ role: 'user', text: 'totally different topic' }],
            });
            expect(r2.content[0].text).toMatch(/appended/);
            expect(conversations.size).toBe(1);  // no second conversation
            const conv = conversations.get(firstId)!;
            expect(conv.uiMessages.length).toBe(3);
        });

        it('living_document=false forces a new conversation', async () => {
            const { plugin, conversations } = makePluginMock();
            await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [{ role: 'user', text: 'first' }],
            });
            await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                living_document: false,
                messages: [{ role: 'user', text: 'second' }],
            });
            expect(conversations.size).toBe(2);
        });

        it('different source_interface always creates new conversation', async () => {
            const { plugin, conversations } = makePluginMock();
            await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [{ role: 'user', text: 'in claude' }],
            });
            await handleSaveConversation(plugin, {
                source_interface: 'chatgpt',
                messages: [{ role: 'user', text: 'in chatgpt' }],
            });
            expect(conversations.size).toBe(2);
            const sources = [...conversations.values()].map((c) => c.sourceInterface).sort();
            expect(sources).toEqual(['chatgpt', 'claude-ai']);
        });
    });

    describe('Cross-Interface-Thread Klammer', () => {
        it('first save returns a fresh thread_id; explicit thread_id reused on follow-up', async () => {
            const { plugin, conversations } = makePluginMock();
            const r1 = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [{ role: 'user', text: 'hi' }],
            });
            const match = r1.content[0].text.match(/cross_interface_thread_id: (thread-\d{4}-\d{2}-\d{2}-[0-9a-f]{6})/);
            expect(match).not.toBeNull();
            const threadId = match![1];

            // Same thread_id, different source_interface -> NEW conv linked by thread.
            await handleSaveConversation(plugin, {
                source_interface: 'claude-code',
                cross_interface_thread_id: threadId,
                messages: [{ role: 'user', text: 'now in code' }],
            });
            expect(conversations.size).toBe(2);
            const allThreadIds = [...conversations.values()].map((c) => c.crossInterfaceThreadId);
            expect(allThreadIds.every((t) => t === threadId)).toBe(true);
        });

        it('rejects malformed thread_id and generates a fresh one', async () => {
            const { plugin, conversations } = makePluginMock();
            const r = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                cross_interface_thread_id: 'thread-bogus',  // wrong format
                messages: [{ role: 'user', text: 'hi' }],
            });
            const conv = [...conversations.values()][0];
            expect(conv.crossInterfaceThreadId).toMatch(/^thread-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/);
            expect(conv.crossInterfaceThreadId).not.toBe('thread-bogus');
            expect(r.isError).toBeUndefined();
        });
    });

    describe('Sync-Mode handling', () => {
        it('auto mode: enqueues into ExtractionQueue + sets syncState confirmed', async () => {
            const { plugin, conversations, enqueueCalls } = makePluginMock({ syncMode: 'auto' });
            await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [{ role: 'user', text: 'auto-mode test' }],
            });
            const conv = [...conversations.values()][0];
            expect(conv.syncState).toBe('confirmed');
            expect(enqueueCalls).toHaveLength(1);
        });

        it('manual mode: skips ExtractionQueue + sets syncState pending', async () => {
            const { plugin, conversations, enqueueCalls } = makePluginMock({ syncMode: 'manual' });
            await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [{ role: 'user', text: 'manual-mode test' }],
            });
            const conv = [...conversations.values()][0];
            expect(conv.syncState).toBe('pending');
            expect(enqueueCalls).toHaveLength(0);
        });
    });

    describe('Empty / malformed input handling', () => {
        it('rejects empty messages array', async () => {
            const { plugin } = makePluginMock();
            const result = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: [],
            });
            expect(result.isError).toBe(true);
        });

        it('rejects non-array messages', async () => {
            const { plugin } = makePluginMock();
            const result = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: 'not-an-array',
            });
            expect(result.isError).toBe(true);
        });

        it('rejects > 500 messages', async () => {
            const { plugin } = makePluginMock();
            const tooMany = Array.from({ length: 501 }, (_, i) => ({ role: 'user' as const, text: `m${i}` }));
            const result = await handleSaveConversation(plugin, {
                source_interface: 'claude-ai',
                messages: tooMany,
            });
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toMatch(/max 500/);
        });
    });
});
