/**
 * FIX-13-02-01 + FIX-13-02-02 + FIX-18-04-03 regression coverage for
 * KiloGatewayProvider. The bugs were spotted by the 2026-05-31 xhigh
 * focused code-review:
 *
 *   - tool_calls deltas streamed but finish_reason="stop"/"length" used to
 *     silently drop the tool_use (no post-loop flush; the same BUG-013
 *     pattern openai.ts and github-copilot.ts already guarded against).
 *   - delta.content as `[{type:'text', text:'...'}]` (the Claude-via-OpenAI
 *     shim form documented for Copilot) was strict-typechecked as a string
 *     and silently dropped while the gateway still billed tokens.
 *   - truncated tool inputs on finish_reason='length' produced the generic
 *     recovery message instead of the actionable "split write_file +
 *     append_to_file" guidance.
 *
 * The tests use the same SDK-stub pattern as openai-tool-call-flush.test.ts
 * so the two providers stay diff-able.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KiloGatewayProvider } from '../kilo-gateway';
import type { LLMProvider } from '../../../types/settings';
import type { ApiStreamChunk } from '../../types';

interface ChunkLike {
    id?: string;
    choices: Array<{
        delta: {
            content?: unknown;
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

    return (async function* () {
        for (const chunk of chunks) yield chunk;
    })();
}

function makeProvider(): KiloGatewayProvider {
    const config: LLMProvider = {
        id: 'test',
        name: 'Test Kilo',
        type: 'kilo-gateway',
        apiKey: 'sk-test',
        model: 'claude-sonnet-4-5',
    } as LLMProvider;
    const provider = new KiloGatewayProvider(config);
    (provider as unknown as { client: { chat: { completions: { create: unknown } } } }).client = {
        chat: {
            completions: {
                create: () => Promise.resolve(makeStream([])),
            },
        },
    };
    return provider;
}

function setStream(provider: KiloGatewayProvider, chunks: ChunkLike[]): void {
    (provider as unknown as { client: { chat: { completions: { create: unknown } } } }).client.chat.completions.create =
        () => Promise.resolve(makeStream(chunks));
}

async function collect(stream: AsyncIterable<ApiStreamChunk>): Promise<ApiStreamChunk[]> {
    const out: ApiStreamChunk[] = [];
    for await (const chunk of stream) out.push(chunk);
    return out;
}

describe('KiloGatewayProvider streaming (FIX-13-02-01 / 02-02, FIX-18-04-03)', () => {
    let provider: KiloGatewayProvider;

    beforeEach(() => {
        provider = makeProvider();
    });

    it('FIX-13-02-01: yields tool_use when finish_reason="stop" but tool_calls were streamed', async () => {
        setStream(provider, [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'list_files', arguments: '{"path":"."}' } }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));
        const toolUse = chunks.filter((c) => c.type === 'tool_use');
        expect(toolUse).toHaveLength(1);
        expect(toolUse[0]).toMatchObject({ id: 'call_1', name: 'list_files', input: { path: '.' } });
    });

    it('FIX-13-02-01: yields tool_use exactly once when finish_reason="tool_calls" (no double-yield)', async () => {
        setStream(provider, [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_2', function: { name: 'read_file', arguments: '{"path":"x.md"}' } }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));
        const toolUse = chunks.filter((c) => c.type === 'tool_use');
        expect(toolUse).toHaveLength(1);
        expect(toolUse[0]).toMatchObject({ id: 'call_2', name: 'read_file' });
    });

    it('FIX-13-02-02: yields text when delta.content arrives as the Claude shim array form', async () => {
        setStream(provider, [
            { choices: [{ delta: { content: [{ type: 'text', text: 'Hello ' }] }, finish_reason: null }] },
            { choices: [{ delta: { content: [{ type: 'text', text: 'world' }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));
        const text = chunks.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join('');
        expect(text).toBe('Hello world');
    });

    it('FIX-13-02-02: still yields text when delta.content is a plain string (canonical form)', async () => {
        setStream(provider, [
            { choices: [{ delta: { content: 'Hello world' }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));
        const text = chunks.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join('');
        expect(text).toBe('Hello world');
    });

    it('FIX-18-04-03: tool_error on length-truncated JSON carries the max-tokens guidance', async () => {
        setStream(provider, [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_len', function: { name: 'write_file', arguments: '{"path":"x.md","content":"abc' } }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'length' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));
        const err = chunks.find((c) => c.type === 'tool_error') as { error: string } | undefined;
        expect(err).toBeDefined();
        expect(err!.error).toMatch(/max output token limit|hit the max/i);
    });

    it('FIX-18-04-03: tool_error on JSON parse fail with finish_reason="stop" keeps the generic guidance', async () => {
        setStream(provider, [
            { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_stop', function: { name: 'write_file', arguments: '{bogus' } }] }, finish_reason: null }] },
            { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]);

        const chunks = await collect(provider.createMessage('sys', [], []));
        const err = chunks.find((c) => c.type === 'tool_error') as { error: string } | undefined;
        expect(err).toBeDefined();
        expect(err!.error).not.toMatch(/max output token limit|hit the max/i);
    });
});
