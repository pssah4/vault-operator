/**
 * BUG-013 / FEATURE-0409 regression test
 *
 * Some OpenAI-compatible providers (OpenRouter gpt-oss-120b, Groq, certain
 * local backends) stream tool_calls deltas but emit finish_reason="stop" or
 * "length" instead of "tool_calls". The provider must still yield the
 * accumulated tool_use events after the stream ends.
 *
 * The legacy bug dropped these tool calls silently and the agent treated the
 * response as text. This test pins the post-loop flush behaviour.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAiProvider } from '../openai';
import type { LLMProvider } from '../../../types/settings';
import type { ApiStreamChunk } from '../../types';

// Match OpenAI.ChatCompletionChunk shape. We only set the fields the provider reads.
interface ChunkLike {
    id?: string;
    choices: Array<{
        delta: {
            content?: string | null;
            tool_calls?: Array<{
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
            }>;
        };
        finish_reason: 'stop' | 'tool_calls' | 'length' | null;
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
}

function makeStream(chunks: ChunkLike[]): AsyncIterable<ChunkLike> {
    // Plain async generator over a sync source. The generator function uses
    // `async *` so it satisfies AsyncIterable, but it never `await`s — so we
    // disable require-await here to avoid a meaningless wait or a fake await.
    // eslint-disable-next-line @typescript-eslint/require-await -- mock stream wraps a sync source; await would be a no-op
    return (async function* () {
        for (const chunk of chunks) yield chunk;
    })();
}

function makeProvider(): OpenAiProvider {
    const config: LLMProvider = {
        id: 'test',
        name: 'Test OpenRouter',
        type: 'openrouter',
        apiKey: 'sk-test',
        model: 'openai/gpt-oss-120b',
    } as LLMProvider;
    const provider = new OpenAiProvider(config);
    // Stub the SDK client so createMessage uses our async iterable.
    (provider as unknown as { client: { chat: { completions: { create: unknown } } } }).client = {
        chat: {
            completions: {
                create: () => Promise.resolve(makeStream([])),
            },
        },
    };
    return provider;
}

async function collect(stream: AsyncIterable<ApiStreamChunk>): Promise<ApiStreamChunk[]> {
    const out: ApiStreamChunk[] = [];
    for await (const chunk of stream) out.push(chunk);
    return out;
}

function setStream(provider: OpenAiProvider, chunks: ChunkLike[]): void {
    (provider as unknown as { client: { chat: { completions: { create: unknown } } } }).client.chat.completions.create =
        () => Promise.resolve(makeStream(chunks));
}

describe('OpenAiProvider tool_call streaming flush (BUG-013 / FEATURE-0409)', () => {
    let provider: OpenAiProvider;

    beforeEach(() => {
        provider = makeProvider();
    });

    it('yields tool_use when finish_reason="stop" but tool_calls deltas were streamed', async () => {
        // Simulates OpenRouter gpt-oss-120b: tool_call deltas + final stop.
        setStream(provider, [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'list_files', arguments: '{"' } }] }, finish_reason: null }] },
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'path":"."}' } }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));

        const toolUse = chunks.filter((c) => c.type === 'tool_use');
        expect(toolUse).toHaveLength(1);
        expect(toolUse[0]).toMatchObject({
            type: 'tool_use',
            id: 'call_1',
            name: 'list_files',
            input: { path: '.' },
        });
    });

    it('yields tool_use exactly once when finish_reason="tool_calls" (no double-yield)', async () => {
        // Standard OpenAI behaviour. The in-loop branch flushes; post-loop must be a no-op.
        setStream(provider, [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_2', function: { name: 'read_file', arguments: '{"path":"x.md"}' } }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));

        const toolUse = chunks.filter((c) => c.type === 'tool_use');
        expect(toolUse).toHaveLength(1);
        expect(toolUse[0]).toMatchObject({ id: 'call_2', name: 'read_file', input: { path: 'x.md' } });
    });

    it('yields tool_use when finish_reason="length" with tool_calls deltas', async () => {
        // Defensive: token-limit cutoff with partial tool_calls. We still want
        // the agent to receive the (possibly truncated) tool_use event so it
        // can decide how to recover.
        setStream(provider, [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_3', function: { name: 'search_files', arguments: '{"query":"a"}' } }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'length' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));

        const toolUse = chunks.filter((c) => c.type === 'tool_use');
        expect(toolUse).toHaveLength(1);
        expect(toolUse[0]).toMatchObject({ id: 'call_3', name: 'search_files' });
    });

    it('handles multiple parallel tool_calls flushed at the end', async () => {
        // Two parallel tool_calls (different index). Both must come through.
        setStream(provider, [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', function: { name: 'list_files', arguments: '{}' } }] }, finish_reason: null }] },
            { choices: [{ delta: { tool_calls: [{ index: 1, id: 'b', function: { name: 'read_file', arguments: '{"path":"y.md"}' } }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));

        const toolUse = chunks.filter((c) => c.type === 'tool_use');
        expect(toolUse).toHaveLength(2);
        expect(toolUse.map((c) => (c as { id: string }).id).sort()).toEqual(['a', 'b']);
    });

    it('skips incomplete accumulators (no id, no name) without crashing', async () => {
        // Defensive guard: a stray delta with neither id nor name should be skipped.
        setStream(provider, [
            { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));
        const toolUse = chunks.filter((c) => c.type === 'tool_use');
        expect(toolUse).toHaveLength(0);
    });
});
