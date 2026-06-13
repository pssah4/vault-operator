/**
 * Reasoning-effort wiring (Item 2).
 *
 * Per-conversation reasoning effort is mapped to each provider's native field:
 *   - Anthropic-direct: output_config.effort
 *   - OpenAI-family (openai/copilot/openrouter, effort-capable models):
 *     reasoning_effort (chat completions) or reasoning.effort (OpenRouter Claude)
 *
 * Default preservation is hard: reasoningEffort unset/auto -> NO effort field
 * is sent (byte-identical to today). The control is only honoured for
 * effort-capable (model, provider) pairs.
 *
 * Also covers the budget_tokens latent-bug fix in the Anthropic provider:
 * the adaptive-thinking Claude family (Opus 4.7/4.8, Fable, Mythos) must NOT
 * emit thinking.budget_tokens (those models 400 on it); older Claude keeps the
 * existing enabled+budget_tokens shape.
 */

import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '../anthropic';
import { OpenAiProvider } from '../openai';
import { ChatGptOAuthProvider } from '../chatgpt-oauth';
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

// ---------------------------------------------------------------------------
// Anthropic provider harness
// ---------------------------------------------------------------------------

function makeAnthropic(config: Partial<LLMProvider>): {
    provider: AnthropicProvider;
    lastRequest: () => Captured | null;
} {
    const full: LLMProvider = {
        id: 'test',
        name: 'Test',
        type: 'anthropic',
        apiKey: 'sk-test',
        model: 'claude-opus-4-8',
        ...config,
    } as LLMProvider;
    const provider = new AnthropicProvider(full);

    let captured: Captured | null = null;
    const stream = makeAsyncIterable([
        { type: 'message_start', message: { usage: { input_tokens: 5 } } },
        { type: 'message_delta', usage: { output_tokens: 1 }, delta: { stop_reason: 'end_turn' } },
    ]);
    (provider as unknown as { client: { messages: { stream: unknown } } }).client = {
        messages: {
            stream: (body: Captured) => {
                captured = body;
                return stream;
            },
        },
    };

    return { provider, lastRequest: () => captured };
}

// ---------------------------------------------------------------------------
// OpenAI provider harness
// ---------------------------------------------------------------------------

function makeOpenAi(config: Partial<LLMProvider>): {
    provider: OpenAiProvider;
    lastRequest: () => Captured | null;
} {
    const full: LLMProvider = {
        id: 'test',
        name: 'Test',
        type: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-5',
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

// ===========================================================================
// Anthropic-direct: output_config.effort
// ===========================================================================

describe('AnthropicProvider - reasoning effort', () => {
    it('adds output_config.effort when reasoningEffort is set', async () => {
        const { provider, lastRequest } = makeAnthropic({ reasoningEffort: 'high' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const req = lastRequest();
        expect(req?.output_config).toEqual({ effort: 'high' });
    });

    it('maps low/medium/high through verbatim', async () => {
        for (const level of ['low', 'medium', 'high'] as const) {
            const { provider, lastRequest } = makeAnthropic({ reasoningEffort: level });
            await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
            expect(lastRequest()?.output_config).toEqual({ effort: level });
        }
    });

    it('sends NO output_config when reasoningEffort is unset (byte-identical to today)', async () => {
        const { provider, lastRequest } = makeAnthropic({});
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect(lastRequest()).not.toBeNull();
        expect('output_config' in lastRequest()!).toBe(false);
    });
});

// ===========================================================================
// Anthropic budget_tokens latent-bug fix
// ===========================================================================

describe('AnthropicProvider - thinking budget_tokens latent bug', () => {
    it('adaptive family + thinking enabled -> adaptive type, NO budget_tokens', async () => {
        const { provider, lastRequest } = makeAnthropic({
            model: 'claude-opus-4-8',
            thinkingEnabled: true,
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const thinking = lastRequest()?.thinking as Record<string, unknown> | undefined;
        expect(thinking).toEqual({ type: 'adaptive' });
        expect(thinking && 'budget_tokens' in thinking).toBe(false);
    });

    it('Fable family + thinking enabled -> adaptive type, NO budget_tokens', async () => {
        const { provider, lastRequest } = makeAnthropic({
            model: 'claude-fable-5',
            thinkingEnabled: true,
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect(lastRequest()?.thinking).toEqual({ type: 'adaptive' });
    });

    it('older family + thinking enabled -> enabled type with budget_tokens', async () => {
        const { provider, lastRequest } = makeAnthropic({
            model: 'claude-opus-4-6',
            thinkingEnabled: true,
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const thinking = lastRequest()?.thinking as Record<string, unknown> | undefined;
        expect(thinking?.type).toBe('enabled');
        expect(typeof thinking?.budget_tokens).toBe('number');
        expect(thinking?.budget_tokens as number).toBeGreaterThan(0);
    });

    it('thinking disabled -> no thinking field at all', async () => {
        const { provider, lastRequest } = makeAnthropic({ model: 'claude-opus-4-8' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect('thinking' in lastRequest()!).toBe(false);
    });
});

// ===========================================================================
// OpenAI family: reasoning_effort / reasoning.effort
// ===========================================================================

describe('OpenAiProvider - reasoning effort', () => {
    it('adds reasoning_effort for an effort-capable model on openai', async () => {
        const { provider, lastRequest } = makeOpenAi({ type: 'openai', model: 'gpt-5', reasoningEffort: 'medium' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect(lastRequest()?.reasoning_effort).toBe('medium');
    });

    it('adds reasoning_effort for the o-series on github-copilot', async () => {
        const { provider, lastRequest } = makeOpenAi({ type: 'github-copilot', model: 'o3', reasoningEffort: 'high' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect(lastRequest()?.reasoning_effort).toBe('high');
    });

    it('OpenRouter Claude: sends reasoning.effort (normalized shape)', async () => {
        const { provider, lastRequest } = makeOpenAi({
            type: 'openrouter',
            model: 'anthropic/claude-opus-4-8',
            reasoningEffort: 'low',
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const reasoning = lastRequest()?.reasoning as Record<string, unknown> | undefined;
        expect(reasoning?.effort).toBe('low');
        // Not the chat-completions field on OpenRouter Claude.
        expect('reasoning_effort' in lastRequest()!).toBe(false);
    });

    it('OpenRouter non-Claude reasoning model: sends reasoning.effort', async () => {
        const { provider, lastRequest } = makeOpenAi({
            type: 'openrouter',
            model: 'openai/gpt-5',
            reasoningEffort: 'high',
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const reasoning = lastRequest()?.reasoning as Record<string, unknown> | undefined;
        expect(reasoning?.effort).toBe('high');
    });

    it('does NOT add any effort field when reasoningEffort is unset', async () => {
        const { provider, lastRequest } = makeOpenAi({ type: 'openai', model: 'gpt-5' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect('reasoning_effort' in lastRequest()!).toBe(false);
        expect('reasoning' in lastRequest()!).toBe(false);
    });

    it('does NOT add an effort field for an effort-incapable model (gpt-4o)', async () => {
        const { provider, lastRequest } = makeOpenAi({ type: 'openai', model: 'gpt-4o', reasoningEffort: 'high' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect('reasoning_effort' in lastRequest()!).toBe(false);
        expect('reasoning' in lastRequest()!).toBe(false);
    });

    it('does NOT add an effort field on a gated provider (gemini)', async () => {
        const { provider, lastRequest } = makeOpenAi({ type: 'gemini', model: 'gemini-2.5-pro', reasoningEffort: 'high' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect('reasoning_effort' in lastRequest()!).toBe(false);
        expect('reasoning' in lastRequest()!).toBe(false);
    });
});

// ===========================================================================
// ChatGPT OAuth: reasoning.effort (Responses API)
// ===========================================================================

function makeChatGptOAuth(config: Partial<LLMProvider>): {
    provider: ChatGptOAuthProvider;
    lastRequest: () => Captured | null;
} {
    const full: LLMProvider = {
        id: 'test',
        name: 'Test',
        type: 'chatgpt-oauth',
        model: 'gpt-5',
        ...config,
    } as LLMProvider;
    const provider = new ChatGptOAuthProvider(full);

    let captured: Captured | null = null;
    // Override the private HTTP layer: capture the body, return an empty SSE
    // stream so parseSseEvents drains cleanly.
    (provider as unknown as { streamRequest: unknown }).streamRequest = (body: Captured) => {
        captured = body;
        return Promise.resolve({
            status: 200,
            headers: {},
            stream: makeAsyncIterable<Buffer>([]),
        });
    };

    return { provider, lastRequest: () => captured };
}

describe('ChatGptOAuthProvider - reasoning effort', () => {
    it('keeps the hardcoded low default when reasoningEffort is unset (400-avoidance)', async () => {
        const { provider, lastRequest } = makeChatGptOAuth({ model: 'gpt-5' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const reasoning = lastRequest()?.reasoning as Record<string, unknown> | undefined;
        expect(reasoning?.effort).toBe('low');
    });

    it('user effort overrides the hardcoded low default', async () => {
        const { provider, lastRequest } = makeChatGptOAuth({ model: 'gpt-5', reasoningEffort: 'high' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const reasoning = lastRequest()?.reasoning as Record<string, unknown> | undefined;
        expect(reasoning?.effort).toBe('high');
    });

    it('honours an explicit medium override', async () => {
        const { provider, lastRequest } = makeChatGptOAuth({ model: 'gpt-5', reasoningEffort: 'medium' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const reasoning = lastRequest()?.reasoning as Record<string, unknown> | undefined;
        expect(reasoning?.effort).toBe('medium');
    });

    it('honours an explicit low override (stays low)', async () => {
        const { provider, lastRequest } = makeChatGptOAuth({ model: 'gpt-5', reasoningEffort: 'low' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const reasoning = lastRequest()?.reasoning as Record<string, unknown> | undefined;
        expect(reasoning?.effort).toBe('low');
    });
});
