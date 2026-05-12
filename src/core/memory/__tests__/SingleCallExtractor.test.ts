import { describe, it, expect } from 'vitest';
import { SingleCallExtractor, type SingleCallMessage } from '../SingleCallExtractor';
import type { ApiHandler, ApiStream, ApiStreamChunk, MessageParam } from '../../../api/types';
import type { ToolDefinition } from '../../tools/types';

interface Capture {
    systemPrompt?: string;
    tools?: ToolDefinition[];
    messages?: MessageParam[];
    abortSignal?: AbortSignal;
}

function makeMockApi(chunks: ApiStreamChunk[], capture?: Capture): ApiHandler {
    return {
        createMessage: (sys, msgs, tools, abortSignal): ApiStream => {
            if (capture) {
                capture.systemPrompt = sys;
                capture.tools = tools;
                capture.messages = msgs;
                capture.abortSignal = abortSignal;
            }
            return (async function*() {
                for (const c of chunks) yield c;
            })();
        },
        getModel: () => ({ id: 'mock', info: { contextWindow: 100000, supportsTools: true, supportsStreaming: true } }),
    };
}

function makeMessages(...texts: Array<{ role: 'user' | 'assistant'; text: string }>): SingleCallMessage[] {
    return texts.map((t, i) => ({ role: t.role, text: t.text, index: i }));
}

const validToolInput = {
    session_summary: 'User asked about plugin features.',
    episode_outcome: { success: true, result_summary: 'Answered.' },
    facts: [],
    mentions: [],
    conversation_so_far: 'User explored plugin features.',
    topic_drift_detected: false,
};

describe('SingleCallExtractor (PLAN-007 task B.1)', () => {
    describe('basic flow', () => {
        it('returns empty result for empty messages without calling API', async () => {
            const capture: Capture = {};
            const api = makeMockApi([], capture);
            const result = await new SingleCallExtractor(api).extract({ messages: [] });
            expect(result.facts).toEqual([]);
            expect(result.mentions).toEqual([]);
            expect(result.sessionSummary).toBe('');
            expect(capture.systemPrompt).toBeUndefined();
        });

        it('returns empty result when startMessageIndex skips everything', async () => {
            const capture: Capture = {};
            const api = makeMockApi([], capture);
            const messages = makeMessages(
                { role: 'user', text: 'hi' },
                { role: 'assistant', text: 'hi back' },
            );
            const result = await new SingleCallExtractor(api).extract({
                messages,
                startMessageIndex: 99,
            });
            expect(result.lastMessageIndex).toBe(99);
            expect(capture.systemPrompt).toBeUndefined();
        });

        it('extracts well-formed payload via _memory_single_call', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use',
                    id: 'tu-1',
                    name: '_memory_single_call',
                    input: {
                        ...validToolInput,
                        session_summary: 'Sebastian configured Vault Operator.',
                        facts: [
                            {
                                text: 'Sebastian uses Obsidian',
                                topics: ['tools'],
                                importance: 0.8,
                                kind: 'preference',
                                relation: 'new',
                            },
                            {
                                text: 'Plugin uses TypeScript',
                                topics: ['tools', 'lang'],
                                importance: 0.7,
                                kind: 'fact',
                                relation: 'new',
                                rationale: 'stated in onboarding',
                            },
                        ],
                        mentions: [
                            { uri: 'vault://Notes/Setup.md', label: 'Setup', kind: 'note' },
                        ],
                    },
                },
            ]);
            const messages = makeMessages(
                { role: 'user', text: 'I use Obsidian and TypeScript.' },
            );
            const result = await new SingleCallExtractor(api).extract({ messages });

            expect(result.facts).toHaveLength(2);
            expect(result.facts[0]).toMatchObject({
                text: 'Sebastian uses Obsidian',
                topics: ['tools'],
                importance: 0.8,
                kind: 'preference',
                relation: 'new',
            });
            expect(result.facts[1].rationale).toBe('stated in onboarding');
            expect(result.mentions).toEqual([
                { uri: 'vault://Notes/Setup.md', label: 'Setup', kind: 'note' },
            ]);
            expect(result.sessionSummary).toBe('Sebastian configured Vault Operator.');
            expect(result.rejected).toEqual([]);
        });

        it('passes the configured tool schema and system prompt', async () => {
            const capture: Capture = {};
            const api = makeMockApi([
                { type: 'tool_use', id: '1', name: '_memory_single_call', input: validToolInput },
            ], capture);
            const messages = makeMessages({ role: 'user', text: 'hello' });
            await new SingleCallExtractor(api).extract({ messages });

            expect(capture.tools).toHaveLength(1);
            expect(capture.tools![0].name).toBe('_memory_single_call');
            expect(capture.tools![0].input_schema.properties).toHaveProperty('facts');
            expect(capture.tools![0].input_schema.properties).toHaveProperty('mentions');
            expect(capture.tools![0].input_schema.properties).toHaveProperty('conversation_so_far');
            expect(capture.tools![0].input_schema.properties).toHaveProperty('topic_drift_detected');
            expect(capture.systemPrompt).toContain('memory engine for Vault Operator');
            expect(capture.systemPrompt).toContain('ATOMIC FACT RULE');
            expect(capture.systemPrompt).toContain('NOISE FILTER');
            expect(capture.messages![0].content).toContain('Conversation transcript');
            expect(capture.messages![0].content).toContain('[0] user: hello');
        });

        it('throws when the provider never calls the tool', async () => {
            const api = makeMockApi([{ type: 'text', text: 'no tool call' }]);
            const messages = makeMessages({ role: 'user', text: 'hi' });
            await expect(new SingleCallExtractor(api).extract({ messages })).rejects.toThrow(/did not call/);
        });

        it('propagates tool_error chunks', async () => {
            const api = makeMockApi([
                { type: 'tool_error', id: '1', name: '_memory_single_call', error: 'rate-limit' },
            ]);
            const messages = makeMessages({ role: 'user', text: 'hi' });
            await expect(new SingleCallExtractor(api).extract({ messages })).rejects.toThrow(/rate-limit/);
        });

        it('captures usage chunks from the provider', async () => {
            const api = makeMockApi([
                { type: 'usage', inputTokens: 1234, outputTokens: 56 },
                { type: 'tool_use', id: '1', name: '_memory_single_call', input: validToolInput },
            ]);
            const messages = makeMessages({ role: 'user', text: 'hi' });
            const result = await new SingleCallExtractor(api).extract({ messages });
            expect(result.usage).toEqual({ inputTokens: 1234, outputTokens: 56 });
        });

        it('returns null usage when provider does not surface it', async () => {
            const api = makeMockApi([
                { type: 'tool_use', id: '1', name: '_memory_single_call', input: validToolInput },
            ]);
            const messages = makeMessages({ role: 'user', text: 'hi' });
            const result = await new SingleCallExtractor(api).extract({ messages });
            expect(result.usage).toBeNull();
        });

        it('tracks lastMessageIndex from the highest message index processed', async () => {
            const api = makeMockApi([
                { type: 'tool_use', id: '1', name: '_memory_single_call', input: validToolInput },
            ]);
            const messages: SingleCallMessage[] = [
                { role: 'user', text: 'a', index: 5 },
                { role: 'assistant', text: 'b', index: 6 },
                { role: 'user', text: 'c', index: 12 },
            ];
            const result = await new SingleCallExtractor(api).extract({ messages });
            expect(result.lastMessageIndex).toBe(12);
        });

        it('forwards abortSignal to the API', async () => {
            const capture: Capture = {};
            const api = makeMockApi([
                { type: 'tool_use', id: '1', name: '_memory_single_call', input: validToolInput },
            ], capture);
            const ctl = new AbortController();
            const messages = makeMessages({ role: 'user', text: 'hi' });
            await new SingleCallExtractor(api).extract({ messages, abortSignal: ctl.signal });
            expect(capture.abortSignal).toBe(ctl.signal);
        });
    });

    describe('delta-window mode', () => {
        it('prepends conversationSoFar in the user message', async () => {
            const capture: Capture = {};
            const api = makeMockApi([
                { type: 'tool_use', id: '1', name: '_memory_single_call', input: validToolInput },
            ], capture);
            const messages: SingleCallMessage[] = [
                { role: 'user', text: 'old', index: 0 },
                { role: 'user', text: 'new question', index: 5 },
            ];
            await new SingleCallExtractor(api).extract({
                messages,
                conversationSoFar: 'Earlier we discussed X.',
                startMessageIndex: 5,
            });
            const content = capture.messages![0].content as string;
            expect(content).toContain('Conversation so far');
            expect(content).toContain('Earlier we discussed X.');
            expect(content).toContain('New messages since last extraction');
            expect(content).toContain('[5] user: new question');
            expect(content).not.toContain('[0] user: old');
        });

        it('includes priorTopicLock in the user message when set', async () => {
            const capture: Capture = {};
            const api = makeMockApi([
                { type: 'tool_use', id: '1', name: '_memory_single_call', input: validToolInput },
            ], capture);
            const messages = makeMessages({ role: 'user', text: 'about cooking' });
            await new SingleCallExtractor(api).extract({
                messages,
                priorTopicLock: 'coding',
            });
            expect(capture.messages![0].content).toContain('Prior topic lock: coding');
        });
    });

    describe('validation + rejection', () => {
        it('rejects facts with empty text', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        facts: [
                            { text: '', topics: [], importance: 0.5, kind: 'fact', relation: 'new' },
                            { text: 'good', topics: [], importance: 0.5, kind: 'fact', relation: 'new' },
                        ],
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.facts).toHaveLength(1);
            expect(result.rejected[0].reason).toMatch(/text empty/);
        });

        it('rejects facts with bad kind', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        facts: [
                            { text: 'a', topics: [], importance: 0.5, kind: 'belief', relation: 'new' },
                        ],
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.facts).toHaveLength(0);
            expect(result.rejected[0].reason).toMatch(/kind/);
        });

        it('rejects facts with bad relation', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        facts: [
                            { text: 'a', topics: [], importance: 0.5, kind: 'fact', relation: 'merge' },
                        ],
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.facts).toHaveLength(0);
            expect(result.rejected[0].reason).toMatch(/relation/);
        });

        it('rejects facts with non-array topics', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        facts: [
                            { text: 'a', topics: 'oops', importance: 0.5, kind: 'fact', relation: 'new' },
                        ],
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.facts).toHaveLength(0);
            expect(result.rejected[0].reason).toMatch(/topics/);
        });

        it('rejects facts with importance out of [0, 1]', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        facts: [
                            { text: 'a', topics: [], importance: 1.5, kind: 'fact', relation: 'new' },
                            { text: 'b', topics: [], importance: -0.1, kind: 'fact', relation: 'new' },
                        ],
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.facts).toHaveLength(0);
            expect(result.rejected).toHaveLength(2);
        });

        it('drops facts below noise floor importance < 0.2', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        facts: [
                            { text: 'noise', topics: [], importance: 0.15, kind: 'fact', relation: 'new' },
                            { text: 'borderline', topics: [], importance: 0.2, kind: 'fact', relation: 'new' },
                            { text: 'good', topics: [], importance: 0.5, kind: 'fact', relation: 'new' },
                        ],
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.facts.map(f => f.text)).toEqual(['borderline', 'good']);
            expect(result.rejected[0].reason).toMatch(/noise floor/);
        });

        it('strips non-string entries from topics', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        facts: [
                            { text: 'a', topics: ['ok', 42, null, 'fine'], importance: 0.5, kind: 'fact', relation: 'new' },
                        ],
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.facts[0].topics).toEqual(['ok', 'fine']);
        });

        it('defaults importance to 0.5 when omitted', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        facts: [
                            { text: 'a', topics: [], kind: 'fact', relation: 'new' },
                        ],
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.facts[0].importance).toBe(0.5);
        });

        it('rejects mentions with empty uri', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        mentions: [
                            { uri: '   ' },
                            { uri: 'vault://X.md' },
                        ],
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.mentions).toHaveLength(1);
            expect(result.mentions[0].uri).toBe('vault://X.md');
            expect(result.rejected[0].reason).toMatch(/uri empty/);
        });

        it('parses topic_drift_detected and episode_outcome.success correctly', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        ...validToolInput,
                        episode_outcome: { success: false, result_summary: 'Aborted.' },
                        topic_drift_detected: true,
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.topicDriftDetected).toBe(true);
            expect(result.episodeOutcome).toEqual({ success: false, resultSummary: 'Aborted.' });
        });

        it('coerces missing string fields to empty strings without throwing', async () => {
            const api = makeMockApi([
                {
                    type: 'tool_use', id: '1', name: '_memory_single_call', input: {
                        // omit session_summary, conversation_so_far, episode_outcome entirely
                        facts: [],
                        mentions: [],
                        topic_drift_detected: false,
                    },
                },
            ]);
            const result = await new SingleCallExtractor(api).extract({
                messages: makeMessages({ role: 'user', text: 'x' }),
            });
            expect(result.sessionSummary).toBe('');
            expect(result.conversationSoFar).toBe('');
            expect(result.episodeOutcome).toEqual({ success: false, resultSummary: '' });
        });
    });
});
