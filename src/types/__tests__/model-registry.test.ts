import { describe, it, expect } from 'vitest';
import {
    normalizeModelId,
    getModelOutputCeiling,
    getModelMaxTokens,
    resolveOutputBudget,
    estimatePromptTokens,
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

    it('getModelMaxTokens falls back to 8192 for unknown models', () => {
        expect(getModelMaxTokens('llama3.2')).toBe(8_192);
        expect(getModelMaxTokens('eu.anthropic.claude-opus-4-6-v1')).toBe(128_000);
    });
});

describe('resolveOutputBudget', () => {
    it('clamps a configured value to the model output ceiling', () => {
        // Haiku tops out at 8192 — an over-eager Settings value must not reach the API.
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
});
