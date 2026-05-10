/**
 * Tests for src/api/capabilities.ts
 *
 * Covers:
 * - exact, wildcard, and no-match pattern lookups
 * - pattern ordering (specific before generic)
 * - per-provider expectations from ADR-111 / IMP-18-01-01
 * - conservative fallback for unknown providers/models
 */

import { describe, it, expect } from 'vitest';
import { getCacheCapability, CACHE_CAPABILITY_TABLE } from '../capabilities';

describe('getCacheCapability', () => {
    describe('Anthropic direct', () => {
        it('matches Claude models with anthropic-ephemeral cache style', () => {
            const cap = getCacheCapability('anthropic', 'claude-sonnet-4-5-20250929');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('anthropic-ephemeral');
        });

        it('matches Claude haiku', () => {
            const cap = getCacheCapability('anthropic', 'claude-haiku-4-5-20251001');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('anthropic-ephemeral');
        });

        it('falls back to none for non-Claude anthropic model id', () => {
            const cap = getCacheCapability('anthropic', 'unknown-model');
            expect(cap.supportsPromptCache).toBe(false);
            expect(cap.cacheStyle).toBe('none');
        });
    });

    describe('GitHub Copilot', () => {
        it('matches Claude variant in Copilot with anthropic-ephemeral', () => {
            const cap = getCacheCapability('github-copilot', 'claude-sonnet-4');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('anthropic-ephemeral');
        });

        it('rejects non-Claude Copilot models', () => {
            const cap = getCacheCapability('github-copilot', 'gpt-4o');
            expect(cap.supportsPromptCache).toBe(false);
            expect(cap.cacheStyle).toBe('none');
        });
    });

    describe('Bedrock', () => {
        it('matches EU cross-region Anthropic with bedrock-cachepoint', () => {
            const cap = getCacheCapability('bedrock', 'eu.anthropic.claude-sonnet-4-5-20250929-v1:0');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('bedrock-cachepoint');
        });

        it('matches US cross-region Anthropic with bedrock-cachepoint', () => {
            const cap = getCacheCapability('bedrock', 'us.anthropic.claude-opus-4-6-v1');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('bedrock-cachepoint');
        });

        it('matches direct-region anthropic.claude with bedrock-cachepoint', () => {
            const cap = getCacheCapability('bedrock', 'anthropic.claude-3-7-sonnet-20250219-v1:0');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('bedrock-cachepoint');
        });

        it('rejects Amazon Nova on Bedrock', () => {
            const cap = getCacheCapability('bedrock', 'eu.amazon.nova-pro-v1:0');
            expect(cap.supportsPromptCache).toBe(false);
            expect(cap.cacheStyle).toBe('none');
        });
    });

    describe('OpenAI', () => {
        it('matches gpt-4o with openai-implicit', () => {
            const cap = getCacheCapability('openai', 'gpt-4o');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('openai-implicit');
        });

        it('matches gpt-4o-mini', () => {
            const cap = getCacheCapability('openai', 'gpt-4o-mini');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('openai-implicit');
        });

        it('matches gpt-4.1', () => {
            const cap = getCacheCapability('openai', 'gpt-4.1-mini');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('openai-implicit');
        });

        it('matches o1 family', () => {
            const cap = getCacheCapability('openai', 'o1-preview');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('openai-implicit');
        });

        it('matches o4 family', () => {
            const cap = getCacheCapability('openai', 'o4-mini');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('openai-implicit');
        });

        it('rejects gpt-3.5', () => {
            const cap = getCacheCapability('openai', 'gpt-3.5-turbo');
            expect(cap.supportsPromptCache).toBe(false);
            expect(cap.cacheStyle).toBe('none');
        });

        it('rejects legacy gpt-4', () => {
            const cap = getCacheCapability('openai', 'gpt-4-0613');
            expect(cap.supportsPromptCache).toBe(false);
            expect(cap.cacheStyle).toBe('none');
        });
    });

    describe('Kilo Gateway', () => {
        it('uses passthrough for any model id', () => {
            const cap = getCacheCapability('kilo-gateway', 'kilo/auto');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('passthrough');
        });
    });

    describe('Out-of-scope providers', () => {
        it.each([
            ['chatgpt-oauth', 'gpt-5'],
            ['gemini', 'gemini-2.5-pro'],
            ['ollama', 'llama3'],
            ['lmstudio', 'qwen2.5-coder'],
            ['openrouter', 'anthropic/claude-3-5-sonnet'],
            ['azure', 'gpt-4o-deployment'],
            ['custom', 'whatever'],
        ] as const)('returns supportsPromptCache=false for %s/%s', (providerType, modelId) => {
            const cap = getCacheCapability(providerType, modelId);
            expect(cap.supportsPromptCache).toBe(false);
            expect(cap.cacheStyle).toBe('none');
        });
    });

    describe('Pattern ordering and edge cases', () => {
        it('returns the first matching entry (specific before generic)', () => {
            const cap = getCacheCapability('github-copilot', 'claude-3-5-sonnet');
            expect(cap.cacheStyle).toBe('anthropic-ephemeral');
            expect(cap.supportsPromptCache).toBe(true);
        });

        it('is case-insensitive on the model id', () => {
            const cap = getCacheCapability('anthropic', 'CLAUDE-Sonnet-4-5');
            expect(cap.supportsPromptCache).toBe(true);
            expect(cap.cacheStyle).toBe('anthropic-ephemeral');
        });

        it('handles empty model id with conservative fallback', () => {
            const cap = getCacheCapability('anthropic', '');
            expect(cap.supportsPromptCache).toBe(false);
            expect(cap.cacheStyle).toBe('none');
        });

        it('returns a fallback entry shape for unknown provider mismatch (no entry)', () => {
            // Provider is in the union but no entry matches the model id;
            // every provider in this codebase has at least one entry, so
            // this exercises the explicit none-row that exists for each.
            const cap = getCacheCapability('chatgpt-oauth', 'gpt-5');
            expect(cap.providerType).toBe('chatgpt-oauth');
            expect(cap.supportsPromptCache).toBe(false);
        });
    });

    describe('Table integrity', () => {
        it('contains at least one entry per known provider type', () => {
            const knownProviders = [
                'anthropic',
                'github-copilot',
                'bedrock',
                'openai',
                'kilo-gateway',
                'chatgpt-oauth',
                'gemini',
                'ollama',
                'lmstudio',
                'openrouter',
                'azure',
                'custom',
            ] as const;
            for (const p of knownProviders) {
                const hasEntry = CACHE_CAPABILITY_TABLE.some((e) => e.providerType === p);
                expect(hasEntry, `expected at least one entry for provider ${p}`).toBe(true);
            }
        });
    });
});
