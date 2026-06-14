/**
 * Issue #42-B -- Cohere discoverability preset.
 *
 * Cohere already works end to end through the generic `custom` provider
 * (OpenAI-compatible compatibility endpoint: chat, tools, streaming). The
 * only missing piece was discoverability, so this preset ships a disabled
 * built-in CustomModel pointing at Cohere's compatibility base URL as a
 * one-click starting point.
 *
 * These tests pin the preset so it stays a safe, additive, opt-in entry:
 * provider must be `custom`, it must carry the compatibility base URL, and
 * it must NOT auto-enable.
 */
import { describe, expect, it } from 'vitest';
import { BUILT_IN_MODELS } from '../settings';

describe('BUILT_IN_MODELS Cohere preset (#42-B)', () => {
    const cohere = BUILT_IN_MODELS.find(
        (m) => m.provider === 'custom' && (m.displayName ?? '').toLowerCase().includes('cohere'),
    );

    it('ships a Cohere starting-point model', () => {
        expect(cohere, 'expected a built-in Cohere preset using the custom provider').toBeDefined();
    });

    it('routes through the generic custom provider (no dedicated provider added)', () => {
        expect(cohere?.provider).toBe('custom');
    });

    it('points at Cohere\'s OpenAI compatibility base URL', () => {
        expect(cohere?.baseUrl).toBe('https://api.cohere.ai/compatibility/v1');
    });

    it('is a built-in entry', () => {
        expect(cohere?.isBuiltIn).toBe(true);
    });

    it('never auto-enables (opt-in only, needs an API key first)', () => {
        expect(cohere?.enabled).toBe(false);
    });
});
