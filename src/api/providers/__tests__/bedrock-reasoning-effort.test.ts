/**
 * Bedrock Converse reasoning passthrough (Item 3, fail-safe / live-test only).
 *
 * Verifies that when config.reasoningEffort is set AND the model is an
 * effort-capable Claude model on Bedrock, createMessage attaches
 * additionalModelRequestFields carrying the Claude reasoning configuration.
 *
 * Default preservation is hard: reasoningEffort unset -> NO
 * additionalModelRequestFields key (byte-identical to today). A non-effort
 * model with reasoningEffort set must also omit the field.
 *
 * This passthrough is not CI-tested against a live Bedrock endpoint; it was
 * added on the maintainer's request for live verification, hence the
 * fail-safe wrapping in the provider. These tests cover the command-shaping
 * logic only, the way the existing bedrock tests mock the client.
 */

import { describe, it, expect } from 'vitest';
import { BedrockProvider } from '../bedrock';
import type { LLMProvider } from '../../../types/settings';
import type { ApiStreamChunk } from '../../types';

type Captured = Record<string, unknown>;

function makeAsyncIterable<T>(chunks: T[]): AsyncIterable<T> {
    return (async function* () {
        for (const chunk of chunks) yield chunk;
    })();
}

async function drain(stream: AsyncIterable<ApiStreamChunk>): Promise<ApiStreamChunk[]> {
    const out: ApiStreamChunk[] = [];
    for await (const c of stream) out.push(c);
    return out;
}

interface BedrockHarness {
    provider: BedrockProvider;
    lastInput: () => Captured | null;
}

function makeBedrock(config: Partial<LLMProvider>): BedrockHarness {
    const full: LLMProvider = {
        id: 'test',
        name: 'Test',
        type: 'bedrock',
        model: 'eu.anthropic.claude-opus-4-8-v1:0',
        awsRegion: 'eu-central-1',
        awsAuthMode: 'api-key',
        awsApiKey: 'test-key',
        ...config,
    } as LLMProvider;
    const provider = new BedrockProvider(full);

    let captured: Captured | null = null;
    // Replace the SDK client: capture the command input, return an empty stream
    // so the createMessage loop drains cleanly. command.input mirrors the object
    // passed to ConverseStreamCommand.
    (provider as unknown as { client: { send: unknown } }).client = {
        send: (command: { input: Captured }) => {
            captured = command.input;
            return Promise.resolve({ stream: makeAsyncIterable([]) });
        },
    };

    return { provider, lastInput: () => captured };
}

describe('BedrockProvider - reasoning effort passthrough', () => {
    it('attaches additionalModelRequestFields with the effort level on a Claude model', async () => {
        const { provider, lastInput } = makeBedrock({ reasoningEffort: 'high' });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const input = lastInput();
        expect(input).not.toBeNull();
        const amrf = input?.additionalModelRequestFields as
            | { reasoning_config?: { type?: string; effort?: string } }
            | undefined;
        expect(amrf).toBeDefined();
        expect(amrf?.reasoning_config?.type).toBe('enabled');
        expect(amrf?.reasoning_config?.effort).toBe('high');
    });

    it('maps low/medium/high through verbatim', async () => {
        for (const level of ['low', 'medium', 'high'] as const) {
            const { provider, lastInput } = makeBedrock({ reasoningEffort: level });
            await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
            const amrf = lastInput()?.additionalModelRequestFields as
                | { reasoning_config?: { effort?: string } }
                | undefined;
            expect(amrf?.reasoning_config?.effort).toBe(level);
        }
    });

    it('maps the Claude-only xhigh and max levels through verbatim', async () => {
        for (const level of ['xhigh', 'max'] as const) {
            const { provider, lastInput } = makeBedrock({ reasoningEffort: level });
            await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
            const amrf = lastInput()?.additionalModelRequestFields as
                | { reasoning_config?: { effort?: string } }
                | undefined;
            expect(amrf?.reasoning_config?.effort).toBe(level);
        }
    });

    it('omits additionalModelRequestFields when reasoningEffort is unset (byte-identical to today)', async () => {
        const { provider, lastInput } = makeBedrock({});
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const input = lastInput();
        expect(input).not.toBeNull();
        expect('additionalModelRequestFields' in input!).toBe(false);
    });

    it('omits additionalModelRequestFields for a non-effort model even when reasoningEffort is set', async () => {
        const { provider, lastInput } = makeBedrock({
            model: 'eu.amazon.nova-pro-v1:0',
            reasoningEffort: 'high',
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const input = lastInput();
        expect(input).not.toBeNull();
        expect('additionalModelRequestFields' in input!).toBe(false);
    });
});

describe('BedrockProvider - extended thinking (budget-tokens Claude)', () => {
    it('attaches reasoning_config budget_tokens and forces temperature 1 when thinking is on', async () => {
        const { provider, lastInput } = makeBedrock({
            model: 'eu.anthropic.claude-sonnet-4-6',
            thinkingEnabled: true,
            thinkingBudgetTokens: 6000,
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const input = lastInput();
        const amrf = input?.additionalModelRequestFields as
            | { reasoning_config?: { type?: string; budget_tokens?: number; effort?: string } }
            | undefined;
        expect(amrf?.reasoning_config?.type).toBe('enabled');
        expect(typeof amrf?.reasoning_config?.budget_tokens).toBe('number');
        expect(amrf?.reasoning_config?.budget_tokens as number).toBeGreaterThan(0);
        // A budget-tokens model never carries an effort enum.
        expect(amrf?.reasoning_config?.effort).toBeUndefined();
        // Extended thinking requires temperature == 1.
        const inf = input?.inferenceConfig as { temperature?: number } | undefined;
        expect(inf?.temperature).toBe(1);
    });

    it('omits the field and keeps normal temperature when thinking is off (byte-identical)', async () => {
        const { provider, lastInput } = makeBedrock({
            model: 'eu.anthropic.claude-sonnet-4-6',
            thinkingEnabled: false,
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        const input = lastInput();
        expect('additionalModelRequestFields' in input!).toBe(false);
        const inf = input?.inferenceConfig as { temperature?: number } | undefined;
        expect(inf?.temperature).not.toBe(1);
    });

    it('does NOT send budget_tokens for the adaptive lineup (Opus 4.8) on a bare thinking-on turn', async () => {
        // Opus 4.8 is adaptive, not budget-tokens; with no effort it sends no
        // reasoning_config and the model thinks by its own default.
        const { provider, lastInput } = makeBedrock({
            model: 'eu.anthropic.claude-opus-4-8-v1:0',
            thinkingEnabled: true,
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect('additionalModelRequestFields' in lastInput()!).toBe(false);
    });

    it('does NOT send a thinking field for non-Claude (Nova) even with thinking on', async () => {
        const { provider, lastInput } = makeBedrock({
            model: 'eu.amazon.nova-pro-v1:0',
            thinkingEnabled: true,
            thinkingBudgetTokens: 6000,
        });
        await drain(provider.createMessage('sys', [{ role: 'user', content: 'hi' }], []));
        expect('additionalModelRequestFields' in lastInput()!).toBe(false);
    });
});
