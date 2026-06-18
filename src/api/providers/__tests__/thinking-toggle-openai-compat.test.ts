/**
 * FIX-04-03-10 regression test
 *
 * Per-conversation thinking toggle for OpenAI-compatible local backends
 * (custom / ollama / lmstudio). Until v2.14.7 the toggle was a no-op for these
 * provider types because the only thinking branch in openai.ts was gated on
 * type === 'openrouter'. Qwen3/Gemma3 over oMLX kept emitting `<think>` blocks
 * regardless of the OFF toggle (Issue #44).
 *
 * The fix sends two abstain mechanisms when `thinkingEnabled` is explicitly set
 * (true or false) AND the provider type is one of {custom, ollama, lmstudio}:
 *   1. `chat_template_kwargs: { enable_thinking: <bool> }` as an extra body
 *      field. Pass-through for vLLM and MLX-LM (oMLX substrate). Unknown
 *      backends ignore extra fields per OpenAI-spec convention.
 *   2. For Qwen-family model names (regex /qwen3?/i): prefix the system prompt
 *      with `/no_think ` (off) or `/think ` (on). Fallback for servers that
 *      drop chat_template_kwargs (Ollama up to today, some LM-Studio builds).
 *
 * Undefined `thinkingEnabled` is byte-identical to today.
 *
 * See FIX-04-03-10-thinking-toggle-openai-compat.md for the full root cause.
 */

import { describe, it, expect } from 'vitest';
import { OpenAiProvider } from '../openai';
import type { LLMProvider } from '../../../types/settings';
import type { ApiStreamChunk } from '../../types';

type Captured = Record<string, unknown>;

function makeAsyncIterable<T>(chunks: T[]): AsyncIterable<T> {
    // eslint-disable-next-line @typescript-eslint/require-await -- generator wraps a sync source
    return (async function* () {
        for (const chunk of chunks) yield chunk;
    })();
}

async function drain(stream: AsyncIterable<ApiStreamChunk>): Promise<ApiStreamChunk[]> {
    const out: ApiStreamChunk[] = [];
    for await (const c of stream) out.push(c);
    return out;
}

function makeProvider(config: Partial<LLMProvider>): {
    provider: OpenAiProvider;
    lastRequest: () => Captured | null;
} {
    const full: LLMProvider = {
        id: 'test',
        name: 'Test',
        type: 'custom',
        apiKey: 'sk-test',
        baseUrl: 'http://localhost:8000/v1',
        model: 'qwen3-32b',
        ...config,
    } as LLMProvider;
    const provider = new OpenAiProvider(full);

    let captured: Captured | null = null;
    const stream = makeAsyncIterable([
        { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
    ]);
    (provider as unknown as { client: { chat: { completions: { create: unknown } } } }).client = {
        chat: {
            completions: {
                create: (body: Captured) => {
                    captured = body;
                    return Promise.resolve(stream);
                },
            },
        },
    };

    return { provider, lastRequest: () => captured };
}

function firstSystemMessageContent(req: Captured | null): string {
    const messages = req?.messages as Array<{ role: string; content: unknown }> | undefined;
    const sys = messages?.find((m) => m.role === 'system');
    if (!sys) return '';
    if (typeof sys.content === 'string') return sys.content;
    // Some providers serialise system as a content-part array; flatten text parts.
    if (Array.isArray(sys.content)) {
        return (sys.content as Array<{ type?: string; text?: string }>)
            .filter((p) => p?.type === 'text' && typeof p.text === 'string')
            .map((p) => p.text)
            .join('');
    }
    return '';
}

describe('OpenAiProvider - thinking toggle on OpenAI-compatible local backends (FIX-04-03-10)', () => {
    it('custom + Qwen3 + thinkingEnabled=false -> chat_template_kwargs.enable_thinking=false AND /no_think system prefix', async () => {
        const { provider, lastRequest } = makeProvider({
            type: 'custom',
            model: 'qwen3-32b',
            thinkingEnabled: false,
        });
        await drain(provider.createMessage('You are a helpful assistant.', [{ role: 'user', content: 'hi' }], []));

        const req = lastRequest();
        const cck = req?.chat_template_kwargs as Record<string, unknown> | undefined;
        expect(cck).toBeDefined();
        expect(cck?.enable_thinking).toBe(false);

        const sys = firstSystemMessageContent(req);
        expect(sys.startsWith('/no_think ')).toBe(true);
        expect(sys).toContain('You are a helpful assistant.');
    });

    it('custom + Qwen3 + thinkingEnabled=true -> chat_template_kwargs.enable_thinking=true AND /think system prefix', async () => {
        const { provider, lastRequest } = makeProvider({
            type: 'custom',
            model: 'qwen3-32b',
            thinkingEnabled: true,
        });
        await drain(provider.createMessage('You are a helpful assistant.', [{ role: 'user', content: 'hi' }], []));

        const req = lastRequest();
        const cck = req?.chat_template_kwargs as Record<string, unknown> | undefined;
        expect(cck?.enable_thinking).toBe(true);

        const sys = firstSystemMessageContent(req);
        expect(sys.startsWith('/think ')).toBe(true);
    });

    it('custom + non-Qwen model + thinkingEnabled=false -> chat_template_kwargs set, system prompt unchanged', async () => {
        const { provider, lastRequest } = makeProvider({
            type: 'custom',
            model: 'gemma3-27b-it',
            thinkingEnabled: false,
        });
        await drain(provider.createMessage('You are a helpful assistant.', [{ role: 'user', content: 'hi' }], []));

        const req = lastRequest();
        const cck = req?.chat_template_kwargs as Record<string, unknown> | undefined;
        expect(cck?.enable_thinking).toBe(false);

        const sys = firstSystemMessageContent(req);
        expect(sys).toBe('You are a helpful assistant.');
        expect(sys.includes('/no_think')).toBe(false);
        expect(sys.includes('/think')).toBe(false);
    });

    it('custom + thinkingEnabled unset -> NO chat_template_kwargs, system prompt unchanged (byte-identical)', async () => {
        const { provider, lastRequest } = makeProvider({
            type: 'custom',
            model: 'qwen3-32b',
            // thinkingEnabled intentionally omitted
        });
        await drain(provider.createMessage('You are a helpful assistant.', [{ role: 'user', content: 'hi' }], []));

        const req = lastRequest();
        expect(req && 'chat_template_kwargs' in req).toBe(false);

        const sys = firstSystemMessageContent(req);
        expect(sys).toBe('You are a helpful assistant.');
    });

    it('ollama and lmstudio behave the same as custom (allow-list members)', async () => {
        for (const type of ['ollama', 'lmstudio'] as const) {
            const { provider, lastRequest } = makeProvider({
                type,
                model: 'qwen3:14b',
                thinkingEnabled: false,
            });
            await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));

            const req = lastRequest();
            const cck = req?.chat_template_kwargs as Record<string, unknown> | undefined;
            expect(cck?.enable_thinking).toBe(false);
            expect(firstSystemMessageContent(req).startsWith('/no_think ')).toBe(true);
        }
    });

    it('coexists with reasoningEffort (effort-incapable Qwen3 -> no effort field, thinking gate still applies)', async () => {
        const { provider, lastRequest } = makeProvider({
            type: 'custom',
            model: 'qwen3-32b',
            thinkingEnabled: false,
            reasoningEffort: 'low',
        });
        await drain(provider.createMessage('You are a helpful assistant.', [{ role: 'user', content: 'hi' }], []));

        const req = lastRequest();
        // reasoning_effort is only emitted for effort-capable (model, provider)
        // pairs (gpt-5 / o-series). A custom-typed Qwen3 is NOT in that set, so
        // the effort field is dropped -- and the thinking gate still fires.
        expect(req && 'reasoning_effort' in req).toBe(false);
        const cck = req?.chat_template_kwargs as Record<string, unknown> | undefined;
        expect(cck?.enable_thinking).toBe(false);
        expect(firstSystemMessageContent(req).startsWith('/no_think ')).toBe(true);
    });

    it('openai / azure / openrouter / gemini -> NO chat_template_kwargs even when thinkingEnabled=false', async () => {
        const cases: Array<{ type: LLMProvider['type']; baseUrl: string; model: string }> = [
            { type: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'qwen3-32b' },
            { type: 'azure', baseUrl: 'https://example.openai.azure.com', model: 'qwen3-32b' },
            { type: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'qwen/qwen3-32b' },
            { type: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'qwen3-32b' },
        ];
        for (const c of cases) {
            const { provider, lastRequest } = makeProvider({
                type: c.type,
                baseUrl: c.baseUrl,
                model: c.model,
                thinkingEnabled: false,
            });
            await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));

            const req = lastRequest();
            expect(req && 'chat_template_kwargs' in req).toBe(false);
        }
    });
});
