import { describe, it, expect } from 'vitest';
import {
    normalizeModelId,
    getModelOutputCeiling,
    getModelMaxTokens,
    resolveOutputBudget,
    estimatePromptTokens,
    modelSupportsTemperature,
    getModelEffortSupport,
    modelUsesBudgetTokensThinking,
} from '../model-registry';

describe('normalizeModelId', () => {
    it('passes through bare model IDs unchanged', () => {
        expect(normalizeModelId('claude-opus-4-6')).toBe('claude-opus-4-6');
        expect(normalizeModelId('gpt-4o')).toBe('gpt-4o');
    });

    it('strips the OpenRouter vendor prefix', () => {
        expect(normalizeModelId('anthropic/claude-3.5-sonnet')).toBe('claude-3.5-sonnet');
        expect(normalizeModelId('openai/gpt-4o')).toBe('gpt-4o');
    });

    it('strips Bedrock region + vendor prefix and the version suffix', () => {
        expect(normalizeModelId('eu.anthropic.claude-opus-4-6-v1')).toBe('claude-opus-4-6');
        expect(normalizeModelId('anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe('claude-3-5-sonnet-20241022');
        expect(normalizeModelId('us.anthropic.claude-3-7-sonnet-20250219-v1:0')).toBe('claude-3-7-sonnet-20250219');
    });

    it('handles Bedrock inference-profile ARNs', () => {
        expect(
            normalizeModelId('arn:aws:bedrock:eu-central-1:123456789012:inference-profile/eu.anthropic.claude-opus-4-6-v1'),
        ).toBe('claude-opus-4-6');
    });
});

describe('getModelOutputCeiling / getModelMaxTokens', () => {
    it('resolves known models, including Bedrock-decorated IDs', () => {
        expect(getModelOutputCeiling('claude-opus-4-6')).toBe(128_000);
        expect(getModelOutputCeiling('eu.anthropic.claude-opus-4-6-v1')).toBe(128_000);
        expect(getModelOutputCeiling('claude-haiku-4-5-20251001')).toBe(8_192);
    });

    it('returns undefined for unknown models (no invented fallback)', () => {
        expect(getModelOutputCeiling('llama3.2')).toBeUndefined();
        expect(getModelOutputCeiling('some-custom-model')).toBeUndefined();
    });

    // BUG-2: the post-4.6 Anthropic lineup (Opus 4.7/4.8, Fable 5) was missing
    // from the registry, so resolveOutputBudget treated them as unknown and
    // capped visible output at the 8192 legacy default -- the silent
    // truncation that produced the "Write file" failure mode. These models
    // have a 1M context window and a 128K output ceiling.
    it('resolves the post-4.6 Anthropic lineup (Opus 4.7/4.8, Fable 5)', () => {
        expect(getModelOutputCeiling('claude-opus-4-7')).toBe(128_000);
        expect(getModelOutputCeiling('claude-opus-4-8')).toBe(128_000);
        expect(getModelOutputCeiling('claude-fable-5')).toBe(128_000);
        // Bedrock-decorated IDs normalize to the same registry entry.
        expect(getModelOutputCeiling('eu.anthropic.claude-opus-4-8-v1')).toBe(128_000);
        expect(getModelOutputCeiling('anthropic/claude-fable-5')).toBe(128_000);
    });

    it('getModelMaxTokens falls back to 8192 for unknown models', () => {
        expect(getModelMaxTokens('llama3.2')).toBe(8_192);
        expect(getModelMaxTokens('eu.anthropic.claude-opus-4-6-v1')).toBe(128_000);
    });
});

describe('resolveOutputBudget', () => {
    it('clamps a configured value to the model output ceiling', () => {
        // Haiku tops out at 8192 - an over-eager Settings value must not reach the API.
        expect(resolveOutputBudget('claude-haiku-4-5-20251001', 100_000)).toEqual({
            maxTokens: 8_192,
            thinkingBudgetTokens: 0,
        });
        expect(resolveOutputBudget('eu.anthropic.claude-opus-4-6-v1', 64_000)).toEqual({
            maxTokens: 64_000,
            thinkingBudgetTokens: 0,
        });
    });

    it('uses a generous default for known models when nothing is configured', () => {
        expect(resolveOutputBudget('claude-opus-4-6', undefined)).toEqual({
            maxTokens: 32_000,
            thinkingBudgetTokens: 0,
        });
        // gpt-4o ceiling is below the generous default -> clamped to the ceiling.
        expect(resolveOutputBudget('gpt-4o', undefined)).toEqual({
            maxTokens: 16_384,
            thinkingBudgetTokens: 0,
        });
    });

    it('stays conservative (8192) for unknown models with no configured value', () => {
        expect(resolveOutputBudget('llama3.2', undefined)).toEqual({
            maxTokens: 8_192,
            thinkingBudgetTokens: 0,
        });
    });

    // BUG-2: before the post-4.6 lineup was registered, Opus 4.8 / Fable 5 hit
    // the unknown-model path and were capped at 8192 visible output -- long
    // writes silently truncated. With registry entries they get the generous
    // 32k default like any other known cloud model.
    it('gives the post-4.6 Anthropic lineup the generous default, not the legacy 8192 cap', () => {
        expect(resolveOutputBudget('claude-opus-4-8', undefined)).toEqual({
            maxTokens: 32_000,
            thinkingBudgetTokens: 0,
        });
        expect(resolveOutputBudget('claude-fable-5', undefined)).toEqual({
            maxTokens: 32_000,
            thinkingBudgetTokens: 0,
        });
    });

    it('adds the thinking budget on top of the visible-output budget', () => {
        // Opus: 8192 visible + 10000 thinking = 18192 total, both well under the 128k ceiling.
        expect(resolveOutputBudget('claude-opus-4-6', 8_192, { enabled: true, budgetTokens: 10_000 })).toEqual({
            maxTokens: 18_192,
            thinkingBudgetTokens: 10_000,
        });
    });

    it('keeps budget_tokens strictly below max_tokens even against a tight ceiling', () => {
        const r = resolveOutputBudget('claude-haiku-4-5-20251001', 8_192, { enabled: true, budgetTokens: 10_000 });
        expect(r.maxTokens).toBe(8_192);
        expect(r.thinkingBudgetTokens).toBeLessThan(r.maxTokens);
        expect(r.thinkingBudgetTokens).toBeGreaterThanOrEqual(1_024);
    });

    it('shrinks the ceiling to the room left after the input (no input+max>window)', () => {
        // Sonnet: 200k context, 64k output ceiling. Input ~150k -> room ~46k.
        const r = resolveOutputBudget('claude-sonnet-4-5-20250929', 64_000, { estimatedInputTokens: 150_000 });
        expect(r.maxTokens).toBeLessThanOrEqual(200_000 - 150_000); // fits in the window
        expect(r.maxTokens).toBeGreaterThan(0);
        // The configured 64k is clamped because it would not fit.
        expect(r.maxTokens).toBeLessThan(64_000);
    });

    it('does not shrink when there is plenty of room', () => {
        const r = resolveOutputBudget('claude-opus-4-6', undefined, { estimatedInputTokens: 5_000 });
        expect(r.maxTokens).toBe(32_000); // model-scaled default, untouched
    });

    it('never returns a negative or zero max_tokens even with a near-full context', () => {
        const r = resolveOutputBudget('gpt-4o', 16_000, { estimatedInputTokens: 200_000 });
        expect(r.maxTokens).toBeGreaterThanOrEqual(1_024);
    });
});

describe('estimatePromptTokens', () => {
    it('counts system prompt + string message content (~chars/4)', () => {
        const sys = 'x'.repeat(4000);
        const messages = [{ content: 'y'.repeat(4000) }];
        expect(estimatePromptTokens(sys, messages)).toBe(2000);
    });

    it('counts text blocks inside array content', () => {
        const messages = [{ content: [{ type: 'text', text: 'z'.repeat(8000) }] }];
        expect(estimatePromptTokens('', messages)).toBe(2000);
    });

    it('charges a flat estimate for image blocks instead of base64 length', () => {
        const huge = 'A'.repeat(400_000); // base64 of a small image
        const messages = [{ content: [{ type: 'image', source: { data: huge } }] }];
        // ~1500 tokens, not 100k.
        expect(estimatePromptTokens('', messages)).toBe(1_500);
    });

    // FIX-18-04-02: the helper used to ignore tool-definition payloads.
    // vault-operator ships ~60 tools (~20-30k tokens of JSON Schema) which
    // OpenAI/Gemini/OpenRouter count toward the input window. Without this
    // verification resolveOutputBudget under-shrinks max_tokens and the
    // provider 400s with "context_length_exceeded".
    describe('FIX-18-04-02 tool-schema accounting', () => {
        it('adds the JSON-Schema char-count of supplied tools', () => {
            const sys = 'sys'; // 3 chars
            const messages = [{ content: 'hi' }]; // 2 chars
            // 8000 char tool schema -> +2000 tokens
            const tools = [{ name: 't', input_schema: { type: 'object', filler: 'x'.repeat(7960) } }];
            const without = estimatePromptTokens(sys, messages);
            const withTools = estimatePromptTokens(sys, messages, tools);
            expect(withTools - without).toBeGreaterThanOrEqual(1_900);
            expect(withTools - without).toBeLessThanOrEqual(2_100);
        });

        it('treats undefined / empty tools as no extra cost (backwards-compat)', () => {
            const sys = 'x'.repeat(4_000);
            const messages = [{ content: 'y'.repeat(4_000) }];
            const baseline = estimatePromptTokens(sys, messages);
            expect(estimatePromptTokens(sys, messages, undefined)).toBe(baseline);
            expect(estimatePromptTokens(sys, messages, [])).toBe(baseline);
        });

        it('resolveOutputBudget shrinks further once tools are accounted for', () => {
            // Tight scenario: gpt-4o has a 128k context. With 110k of chat
            // input the budget helper happily returns ~14k. Add 30k of
            // tool-schema tokens and the room collapses to the MIN floor.
            const sys = 'x'.repeat(110_000 * 4); // ~110k tokens
            const messages: Array<{ content: string }> = [];
            const tools = [{ name: 'big', schema: 'x'.repeat(30_000 * 4) }]; // ~30k tokens

            const withoutTools = resolveOutputBudget('gpt-4o', undefined, {
                estimatedInputTokens: estimatePromptTokens(sys, messages),
            });
            const withTools = resolveOutputBudget('gpt-4o', undefined, {
                estimatedInputTokens: estimatePromptTokens(sys, messages, tools),
            });
            // Tool accounting must visibly tighten the cap.
            expect(withTools.maxTokens).toBeLessThan(withoutTools.maxTokens);
        });
    });
});

describe('modelSupportsTemperature (FIX-04-03-02)', () => {
    it('flags Anthropic Opus 4.7 as default-only', () => {
        expect(modelSupportsTemperature('claude-opus-4-7')).toBe(false);
        expect(modelSupportsTemperature('claude-opus-4-7-20260415')).toBe(false);
    });

    it('flags Opus 4.7 across normalized aliases (OpenRouter, Bedrock)', () => {
        expect(modelSupportsTemperature('anthropic/claude-opus-4-7')).toBe(false);
        expect(modelSupportsTemperature('eu.anthropic.claude-opus-4-7-v1')).toBe(false);
    });

    it('flags Opus 4.8 and later 4.x snapshots as default-only', () => {
        expect(modelSupportsTemperature('claude-opus-4-8')).toBe(false);
        expect(modelSupportsTemperature('claude-opus-4-8-20260601')).toBe(false);
        expect(modelSupportsTemperature('claude-opus-4-9')).toBe(false);
    });

    it('flags hypothetical two-digit minor snapshots, keeps 4-6 and earlier', () => {
        // The regex covers a future 4-10 / 4-11 without matching 4-6.
        expect(modelSupportsTemperature('claude-opus-4-10')).toBe(false);
        expect(modelSupportsTemperature('claude-opus-4-11')).toBe(false);
        expect(modelSupportsTemperature('claude-opus-4-6')).toBe(true);
        expect(modelSupportsTemperature('claude-opus-4-5')).toBe(true);
    });

    it('flags Opus 4.8 across normalized aliases (OpenRouter, Bedrock)', () => {
        expect(modelSupportsTemperature('anthropic/claude-opus-4-8')).toBe(false);
        expect(modelSupportsTemperature('eu.anthropic.claude-opus-4-8-v1')).toBe(false);
        expect(modelSupportsTemperature('eu.anthropic.claude-opus-4-8')).toBe(false);
    });

    it('flags the Fable and Mythos families as default-only', () => {
        expect(modelSupportsTemperature('claude-fable-5')).toBe(false);
        expect(modelSupportsTemperature('claude-mythos-5')).toBe(false);
        expect(modelSupportsTemperature('claude-mythos-preview')).toBe(false);
        expect(modelSupportsTemperature('anthropic/claude-fable-5')).toBe(false);
        expect(modelSupportsTemperature('eu.anthropic.claude-fable-5')).toBe(false);
        expect(modelSupportsTemperature('eu.anthropic.claude-mythos-5')).toBe(false);
    });

    it('flags GPT-5 family as default-only', () => {
        expect(modelSupportsTemperature('gpt-5')).toBe(false);
        expect(modelSupportsTemperature('gpt-5.5')).toBe(false);
        expect(modelSupportsTemperature('gpt-5-turbo')).toBe(false);
        expect(modelSupportsTemperature('openai/gpt-5.5')).toBe(false);
    });

    it('allows temperature on older Claude + GPT-4 lineage', () => {
        expect(modelSupportsTemperature('claude-opus-4-6')).toBe(true);
        expect(modelSupportsTemperature('claude-sonnet-4-6')).toBe(true);
        expect(modelSupportsTemperature('claude-haiku-4-5-20251001')).toBe(true);
        expect(modelSupportsTemperature('gpt-4o')).toBe(true);
        expect(modelSupportsTemperature('gpt-4.1')).toBe(true);
    });

    it('does not flag unknown local model names', () => {
        expect(modelSupportsTemperature('llama-3.1-70b')).toBe(true);
        expect(modelSupportsTemperature('qwen3.5:9b')).toBe(true);
    });
});

describe('getModelEffortSupport', () => {
    it('supports Claude on Bedrock', () => {
        expect(getModelEffortSupport('eu.anthropic.claude-opus-4-8-v1', 'bedrock')).toBe(true);
    });

    it('supports Claude on anthropic-direct', () => {
        expect(getModelEffortSupport('claude-sonnet-4-6', 'anthropic')).toBe(true);
    });

    it('supports Claude on OpenRouter', () => {
        expect(getModelEffortSupport('anthropic/claude-opus-4-8', 'openrouter')).toBe(true);
    });

    it('supports GPT-5 on OpenAI', () => {
        expect(getModelEffortSupport('gpt-5', 'openai')).toBe(true);
        expect(getModelEffortSupport('gpt-5.5', 'openai')).toBe(true);
    });

    it('supports o-series on OpenAI / Copilot / ChatGPT-OAuth', () => {
        expect(getModelEffortSupport('o3', 'openai')).toBe(true);
        expect(getModelEffortSupport('o1-mini', 'github-copilot')).toBe(true);
        expect(getModelEffortSupport('o4-mini', 'chatgpt-oauth')).toBe(true);
    });

    it('supports GPT-5 / o-series via OpenRouter (non-Claude path)', () => {
        expect(getModelEffortSupport('openai/gpt-5', 'openrouter')).toBe(true);
        expect(getModelEffortSupport('openai/o3', 'openrouter')).toBe(true);
    });

    it('does NOT support Gemini', () => {
        expect(getModelEffortSupport('gemini-2.5-pro', 'gemini')).toBe(false);
    });

    it('does NOT support ollama / lmstudio / custom', () => {
        expect(getModelEffortSupport('llama-3.1-70b', 'ollama')).toBe(false);
        expect(getModelEffortSupport('qwen3.5:9b', 'lmstudio')).toBe(false);
        expect(getModelEffortSupport('some-model', 'custom')).toBe(false);
    });

    it('does NOT support a random custom id', () => {
        expect(getModelEffortSupport('totally-made-up-1234', 'custom')).toBe(false);
        expect(getModelEffortSupport('totally-made-up-1234', 'openai')).toBe(false);
    });

    it('does NOT support a non-Claude model on a Claude-only provider', () => {
        // A GPT model accidentally configured under anthropic must not flip on.
        expect(getModelEffortSupport('gpt-4o', 'anthropic')).toBe(false);
        // Claude under openai is not a real combination either.
        expect(getModelEffortSupport('claude-sonnet-4-6', 'openai')).toBe(false);
    });

    it('does NOT support GPT-4 lineage (no reasoning effort surface)', () => {
        expect(getModelEffortSupport('gpt-4o', 'openai')).toBe(false);
        expect(getModelEffortSupport('gpt-4.1', 'openai')).toBe(false);
    });
});

describe('modelUsesBudgetTokensThinking', () => {
    it('returns false for the adaptive-thinking Claude family (Opus 4.7/4.8/4.9)', () => {
        // These reject thinking.budget_tokens with a 400, adaptive only.
        expect(modelUsesBudgetTokensThinking('claude-opus-4-7')).toBe(false);
        expect(modelUsesBudgetTokensThinking('claude-opus-4-8')).toBe(false);
        expect(modelUsesBudgetTokensThinking('claude-opus-4-9')).toBe(false);
        expect(modelUsesBudgetTokensThinking('claude-opus-4-8-20260601')).toBe(false);
    });

    it('returns false for the Fable and Mythos families', () => {
        expect(modelUsesBudgetTokensThinking('claude-fable-5')).toBe(false);
        expect(modelUsesBudgetTokensThinking('claude-mythos-5')).toBe(false);
        expect(modelUsesBudgetTokensThinking('claude-mythos-preview')).toBe(false);
    });

    it('normalizes provider-decorated ids before deciding', () => {
        expect(modelUsesBudgetTokensThinking('anthropic/claude-opus-4-8')).toBe(false);
        expect(modelUsesBudgetTokensThinking('eu.anthropic.claude-opus-4-8-v1')).toBe(false);
        expect(modelUsesBudgetTokensThinking('eu.anthropic.claude-fable-5')).toBe(false);
    });

    it('returns true for older Claude that still takes budget_tokens', () => {
        expect(modelUsesBudgetTokensThinking('claude-opus-4-6')).toBe(true);
        expect(modelUsesBudgetTokensThinking('claude-sonnet-4-6')).toBe(true);
        expect(modelUsesBudgetTokensThinking('claude-opus-4-5')).toBe(true);
        expect(modelUsesBudgetTokensThinking('claude-3-5-sonnet-20241022')).toBe(true);
    });

    it('returns true for non-Claude and unknown ids (default to the existing budget path)', () => {
        expect(modelUsesBudgetTokensThinking('gpt-4o')).toBe(true);
        expect(modelUsesBudgetTokensThinking('totally-made-up-1234')).toBe(true);
    });
});
