import { describe, it, expect } from 'vitest';
import { MemoryAtomizer } from '../MemoryAtomizer';
import type { ApiHandler, ApiStream, ApiStreamChunk, MessageParam } from '../../../api/types';
import type { ToolDefinition } from '../../tools/types';

/**
 * Mock ApiHandler that returns a scripted stream. Lets us simulate
 * tool_use payloads, text-only assistant responses, and tool errors
 * without spinning up a real provider.
 */
function makeMockApi(chunks: ApiStreamChunk[], capture?: { systemPrompt?: string; tools?: ToolDefinition[]; messages?: MessageParam[] }): ApiHandler {
    return {
        createMessage: (sys, msgs, tools): ApiStream => {
            if (capture) {
                capture.systemPrompt = sys;
                capture.tools = tools;
                capture.messages = msgs;
            }
            return (async function*() {
                for (const c of chunks) yield c;
            })();
        },
        getModel: () => ({ id: 'mock', info: { contextWindow: 100000, supportsTools: true, supportsStreaming: true } }),
    };
}

describe('MemoryAtomizer (PLAN-005 task 3)', () => {
    it('returns empty result for empty input without calling the API', async () => {
        const capture: { systemPrompt?: string } = {};
        const api = makeMockApi([], capture);
        const atomizer = new MemoryAtomizer(api);
        const result = await atomizer.atomize('   \n\n  ');
        expect(result.candidates).toEqual([]);
        expect(capture.systemPrompt).toBeUndefined(); // never called
    });

    it('extracts well-formed candidates from the tool_use payload', async () => {
        const api = makeMockApi([
            {
                type: 'tool_use',
                id: 'tu-1',
                name: '_memory_atomize',
                input: {
                    candidates: [
                        { text: 'Sebastian uses Obsidian', topics: ['tools'], importance: 0.8, kind: 'preference' },
                        { text: 'Plugin uses TypeScript', topics: ['tools', 'lang'], importance: 0.7, kind: 'fact' },
                    ],
                },
            },
        ]);
        const atomizer = new MemoryAtomizer(api);
        const result = await atomizer.atomize('# Profile\n- Uses Obsidian\n- Plugin in TS');

        expect(result.candidates).toHaveLength(2);
        expect(result.candidates[0]).toMatchObject({
            text: 'Sebastian uses Obsidian',
            topics: ['tools'],
            importance: 0.8,
            kind: 'preference',
        });
        expect(result.rejected).toEqual([]);
    });

    it('passes the configured tool schema and system prompt', async () => {
        const capture: { systemPrompt?: string; tools?: ToolDefinition[]; messages?: MessageParam[] } = {};
        const api = makeMockApi([
            { type: 'tool_use', id: '1', name: '_memory_atomize', input: { candidates: [] } },
        ], capture);
        await new MemoryAtomizer(api).atomize('# x', { sourceLabel: 'soul.md' });

        expect(capture.tools).toHaveLength(1);
        expect(capture.tools![0].name).toBe('_memory_atomize');
        expect(capture.tools![0].input_schema.properties).toHaveProperty('candidates');
        expect(capture.systemPrompt).toContain('atomic memory facts');
        expect(capture.messages![0].content).toContain('Source label: soul.md');
        expect(capture.messages![0].content).toContain('BEGIN MARKDOWN');
    });

    it('throws when the provider never calls the tool', async () => {
        const api = makeMockApi([{ type: 'text', text: 'Sorry, I can\'t.' }]);
        await expect(new MemoryAtomizer(api).atomize('# x')).rejects.toThrow(/did not call/);
    });

    it('propagates tool_error chunks from the provider', async () => {
        const api = makeMockApi([
            { type: 'tool_error', id: '1', name: '_memory_atomize', error: 'rate-limit' },
        ]);
        await expect(new MemoryAtomizer(api).atomize('# x')).rejects.toThrow(/rate-limit/);
    });

    it('captures plain assistant text alongside the tool call', async () => {
        const api = makeMockApi([
            { type: 'text', text: 'Found 1 fact.' },
            { type: 'tool_use', id: '1', name: '_memory_atomize', input: {
                candidates: [{ text: 'a', topics: ['x'], importance: 0.5, kind: 'fact' }],
            } },
        ]);
        const result = await new MemoryAtomizer(api).atomize('# x');
        expect(result.assistantText).toBe('Found 1 fact.');
    });

    describe('validation + rejection', () => {
        it('drops candidates with empty text', async () => {
            const api = makeMockApi([{
                type: 'tool_use', id: '1', name: '_memory_atomize', input: {
                    candidates: [
                        { text: '', topics: [], kind: 'fact' },
                        { text: 'good', topics: [], kind: 'fact' },
                    ],
                },
            }]);
            const result = await new MemoryAtomizer(api).atomize('# x');
            expect(result.candidates).toHaveLength(1);
            expect(result.rejected).toHaveLength(1);
            expect(result.rejected[0].reason).toMatch(/text is empty/);
        });

        it('drops candidates with non-array topics', async () => {
            const api = makeMockApi([{
                type: 'tool_use', id: '1', name: '_memory_atomize', input: {
                    candidates: [{ text: 'a', topics: 'oops', kind: 'fact' }],
                },
            }]);
            const result = await new MemoryAtomizer(api).atomize('# x');
            expect(result.candidates).toHaveLength(0);
            expect(result.rejected[0].reason).toMatch(/topics/);
        });

        it('drops candidates with kind outside the enum', async () => {
            const api = makeMockApi([{
                type: 'tool_use', id: '1', name: '_memory_atomize', input: {
                    candidates: [{ text: 'a', topics: [], kind: 'belief' }],
                },
            }]);
            const result = await new MemoryAtomizer(api).atomize('# x');
            expect(result.candidates).toHaveLength(0);
            expect(result.rejected[0].reason).toMatch(/enum/);
        });

        it('drops candidates with importance out of [0, 1]', async () => {
            const api = makeMockApi([{
                type: 'tool_use', id: '1', name: '_memory_atomize', input: {
                    candidates: [
                        { text: 'a', topics: [], kind: 'fact', importance: 1.5 },
                        { text: 'b', topics: [], kind: 'fact', importance: -0.1 },
                    ],
                },
            }]);
            const result = await new MemoryAtomizer(api).atomize('# x');
            expect(result.candidates).toHaveLength(0);
            expect(result.rejected).toHaveLength(2);
        });

        it('uses defaultImportance when LLM omits the field', async () => {
            const api = makeMockApi([{
                type: 'tool_use', id: '1', name: '_memory_atomize', input: {
                    candidates: [{ text: 'a', topics: [], kind: 'fact' }],
                },
            }]);
            const result = await new MemoryAtomizer(api).atomize('# x', { defaultImportance: 0.3 });
            expect(result.candidates[0].importance).toBe(0.3);
        });

        it('strips non-string entries from the topics array', async () => {
            const api = makeMockApi([{
                type: 'tool_use', id: '1', name: '_memory_atomize', input: {
                    candidates: [{ text: 'a', topics: ['ok', 42, null, 'fine'], kind: 'fact' }],
                },
            }]);
            const result = await new MemoryAtomizer(api).atomize('# x');
            expect(result.candidates[0].topics).toEqual(['ok', 'fine']);
        });

        it('returns nothing when the tool input is malformed (candidates missing)', async () => {
            const api = makeMockApi([{
                type: 'tool_use', id: '1', name: '_memory_atomize', input: { something: 'else' },
            }]);
            const result = await new MemoryAtomizer(api).atomize('# x');
            expect(result.candidates).toEqual([]);
            expect(result.rejected[0].reason).toMatch(/candidates is not an array/);
        });
    });

    it('preserves rationale when provided', async () => {
        const api = makeMockApi([{
            type: 'tool_use', id: '1', name: '_memory_atomize', input: {
                candidates: [{
                    text: 'Sebastian likes coffee', topics: ['preferences'],
                    kind: 'preference', importance: 0.5, rationale: 'mentioned 3 times',
                }],
            },
        }]);
        const result = await new MemoryAtomizer(api).atomize('# x');
        expect(result.candidates[0].rationale).toBe('mentioned 3 times');
    });
});
