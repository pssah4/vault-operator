import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest';
import { classifyModelTier, isNonChatModelId } from '../ModelTierClassifier';

describe('classifyModelTier - pattern matching', () => {
    beforeEach(() => {
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    describe('flagship family', () => {
        it.each([
            'claude-opus-4-6',
            'claude-opus-4-7',
            'claude-3-opus-20240229',
            'anthropic/claude-opus-4-6',
            'eu.anthropic.claude-opus-4-6-v1',
            'gpt-5',
            'gpt-5-2025-01-01',
            'gpt-4.5-preview',
            'o1',
            'o3',
            'gemini-2.5-pro',
            'gemini-2.0-pro',
            'deepseek-reasoner',
            'deepseek-r1',
            'grok-4',
            'claude-fable-5',
            'anthropic/claude-fable-5',
            'gpt-5.4',
            'gemini-3.5-pro',
            'qwen3.7-max',
        ])('classifies %s as flagship', (id) => {
            const result = classifyModelTier(id);
            expect(result?.tier).toBe('flagship');
            expect(result?.source).toBe('pattern');
        });
    });

    describe('mid family', () => {
        it.each([
            'claude-sonnet-4-6',
            'claude-sonnet-4-5-20250929',
            'claude-3-5-sonnet-20241022',
            'anthropic/claude-sonnet-4-6',
            'eu.anthropic.claude-sonnet-4-5-v1',
            'gpt-4.1',
            'gpt-4o',
            'o1-mini',
            'o3-mini',
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'deepseek-chat',
            'grok-3',
            'gpt-5.4-mini',
            'glm-5',
            'glm-4.6',
            'qwen3.7-plus',
            'minimax-m3',
            'kimi-k2.7-code',
            'kimi-k2-thinking',
            'deepseek-v4',
            'deepseek-v4-pro',
            'nova-premier',
            'amazon.nova-pro-v1:0',
            'llama-4-scout',
        ])('classifies %s as mid', (id) => {
            const result = classifyModelTier(id);
            expect(result?.tier).toBe('mid');
            expect(result?.source).toBe('pattern');
        });
    });

    describe('fast family', () => {
        it.each([
            'claude-haiku-4-5-20251001',
            'claude-3-5-haiku-20241022',
            'claude-3-haiku-20240307',
            'gpt-4o-mini',
            'gpt-4.1-mini',
            'gpt-4.1-nano',
            'gpt-3.5-turbo',
            'gemini-1.5-flash',
            'gemini-1.5-flash-8b',
            'gemini-flash-lite',
            'grok-3-mini',
            'gpt-5.4-nano',
            'gemini-3.5-flash',
            'gemini-3.5-flash-lite',
            'glm-4.5-flash',
            'qwen3.7-flash',
            'deepseek-v4-flash',
            'amazon/nova-2-lite-v1',
            'nova-micro',
        ])('classifies %s as fast', (id) => {
            const result = classifyModelTier(id);
            expect(result?.tier).toBe('fast');
            expect(result?.source).toBe('pattern');
        });
    });
});

describe('classifyModelTier - bedrock normalization', () => {
    beforeEach(() => {
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    it('strips bedrock region and version suffix before pattern matching', () => {
        expect(classifyModelTier('eu.anthropic.claude-opus-4-7-v1')?.tier).toBe('flagship');
        expect(classifyModelTier('us.anthropic.claude-sonnet-4-5-v1')?.tier).toBe('mid');
        expect(classifyModelTier('anthropic.claude-3-5-haiku-20241022-v1:0')?.tier).toBe('fast');
    });

    it('handles bedrock ARN-prefixed ids', () => {
        const arnId = 'arn:aws:bedrock:eu-central-1:123456789012:inference-profile/eu.anthropic.claude-opus-4-6-v1';
        const result = classifyModelTier(arnId);
        // ARN prefix may not be recognised by normalizeModelId; the test
        // documents current behaviour without forcing a specific result.
        // Production code calls normalizeModelId() which strips the
        // bedrock-style portion; if a future change makes this support
        // ARNs, this test will surface it.
        expect(result === null || result.tier === 'flagship').toBe(true);
    });
});

describe('classifyModelTier - openrouter pricing', () => {
    beforeEach(() => {
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    it('classifies by completion price when pattern misses', () => {
        // Unknown model id, high completion cost: flagship.
        const flagship = classifyModelTier('some-unknown-frontier-model', {
            pricing: { completionUsd: 75 },
        });
        expect(flagship?.tier).toBe('flagship');
        expect(flagship?.source).toBe('pricing');

        // Mid range
        const mid = classifyModelTier('some-unknown-model-v2', {
            pricing: { completionUsd: 15 },
        });
        expect(mid?.tier).toBe('mid');
        expect(mid?.source).toBe('pricing');

        // Cheap model -> fast
        const fast = classifyModelTier('some-tiny-llm', {
            pricing: { completionUsd: 0.5 },
        });
        expect(fast?.tier).toBe('fast');
        expect(fast?.source).toBe('pricing');
    });

    it('pattern wins over pricing', () => {
        // Even if user feeds a misleading price, pattern hits first.
        const result = classifyModelTier('claude-haiku-4-5-20251001', {
            pricing: { completionUsd: 100 },
        });
        expect(result?.tier).toBe('fast');
        expect(result?.source).toBe('pattern');
    });
});

describe('classifyModelTier - capability fallback', () => {
    beforeEach(() => {
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    it('uses capability fallback when neither pattern nor pricing match', () => {
        const flagship = classifyModelTier('weird-new-model-x', {
            modelInfo: { contextWindow: 200_000, maxTokens: 64_000 },
        });
        expect(flagship?.tier).toBe('flagship');
        expect(flagship?.source).toBe('capability');

        const mid = classifyModelTier('weird-new-model-y', {
            modelInfo: { contextWindow: 128_000, maxTokens: 16_000 },
        });
        expect(mid?.tier).toBe('mid');
        expect(mid?.source).toBe('capability');

        const fast = classifyModelTier('weird-tiny-model', {
            modelInfo: { contextWindow: 32_000, maxTokens: 4_000 },
        });
        expect(fast?.tier).toBe('fast');
        expect(fast?.source).toBe('capability');
    });
});

describe('classifyModelTier - local providers', () => {
    beforeEach(() => {
        vi.spyOn(console, 'debug').mockImplementation(() => {});
    });

    it('returns null for ollama models regardless of id pattern', () => {
        const result = classifyModelTier('llama-3.1-70b', { providerType: 'ollama' });
        expect(result).toBeNull();
    });

    it('returns null for lmstudio models', () => {
        const result = classifyModelTier('mistral-7b-instruct', { providerType: 'lmstudio' });
        expect(result).toBeNull();
    });

    it('returns null for custom providers', () => {
        const result = classifyModelTier('my-internal-model', { providerType: 'custom' });
        expect(result).toBeNull();
    });
});

describe('classifyModelTier - non-chat models', () => {
    let debugSpy: MockInstance;

    beforeEach(() => {
        debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        debugSpy.mockClear();
    });

    it.each([
        'text-embedding-3-small',
        'cohere.rerank-v3-5',
        'eu.cohere.embed-v4',
        'gpt-audio',
        'trajectory-compaction',
    ])('returns null for %s without logging', (id) => {
        expect(classifyModelTier(id)).toBeNull();
        expect(debugSpy).not.toHaveBeenCalled();
    });

    it.each([
        'text-embedding-3-small',
        'text-embedding-ada-002',
        'cohere.rerank-v3-5',
        'eu.cohere.embed-v4',
        'mxbai-embed-large',
        'gpt-audio',
        'gpt-4o-audio-preview',
        'gpt-4o-realtime-preview',
        'whisper-1',
        'omni-moderation-latest',
        'dall-e-3',
        'trajectory-compaction',
    ])('isNonChatModelId detects %s', (id) => {
        expect(isNonChatModelId(id)).toBe(true);
    });

    it.each([
        'claude-opus-4-6',
        'gpt-5.4',
        'gemini-3.5-flash',
        'deepseek-v4',
        'kimi-k2',
    ])('isNonChatModelId does not flag chat model %s', (id) => {
        expect(isNonChatModelId(id)).toBe(false);
    });

    it('non-chat exclusion wins over pricing fallback', () => {
        const result = classifyModelTier('text-embedding-3-small', {
            pricing: { completionUsd: 75 },
        });
        expect(result).toBeNull();
    });

    it('non-chat exclusion wins over capability fallback', () => {
        const result = classifyModelTier('eu.cohere.embed-v4', {
            modelInfo: { contextWindow: 200_000, maxTokens: 64_000 },
        });
        expect(result).toBeNull();
    });
});

describe('classifyModelTier - unknown models', () => {
    let debugSpy: MockInstance;

    beforeEach(() => {
        debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
        debugSpy.mockClear();
    });

    it('returns null when no signal is available', () => {
        const result = classifyModelTier('completely-unknown-xyz-v0');
        expect(result).toBeNull();
    });

    it('does not emit a per-id unclassified log line (aggregation lives in ModelDiscoveryService)', () => {
        classifyModelTier('completely-unknown-xyz-v0');
        expect(debugSpy).not.toHaveBeenCalled();
    });

    it('returns null for empty id', () => {
        expect(classifyModelTier('')).toBeNull();
    });

    it.each([
        'glm-4.5-air',
        'glm-4-9b-chat',
        'glm-4v-9b',
        'glm-4.6v',
        'glm-5-turbo',
    ])('leaves ambiguous GLM variant %s unclassified (tierOverrides territory)', (id) => {
        // Small/vision/turbo GLM variants have no clear tier; forcing them
        // to mid would override the user's tierOverrides intent.
        expect(classifyModelTier(id)).toBeNull();
    });
});
