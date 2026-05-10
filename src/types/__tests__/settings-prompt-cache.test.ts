/**
 * Tests for the prompt-caching default-switch in modelToLLMProvider().
 * IMP-18-01-01 / ADR-111: undefined acts as true at runtime; explicit
 * false stays false; explicit true stays true.
 */

import { describe, it, expect } from 'vitest';
import { modelToLLMProvider } from '../settings';
import type { CustomModel } from '../settings';

function makeModel(overrides: Partial<CustomModel> = {}): CustomModel {
    return {
        name: 'claude-sonnet-4-5-20250929',
        provider: 'anthropic',
        enabled: true,
        ...overrides,
    };
}

describe('modelToLLMProvider promptCachingEnabled default', () => {
    it('treats undefined as true (default-on at runtime)', () => {
        const provider = modelToLLMProvider(makeModel({ promptCachingEnabled: undefined }));
        expect(provider.promptCachingEnabled).toBe(true);
    });

    it('preserves explicit true', () => {
        const provider = modelToLLMProvider(makeModel({ promptCachingEnabled: true }));
        expect(provider.promptCachingEnabled).toBe(true);
    });

    it('preserves explicit false (user opt-out)', () => {
        const provider = modelToLLMProvider(makeModel({ promptCachingEnabled: false }));
        expect(provider.promptCachingEnabled).toBe(false);
    });

    it('treats a model object without the field at all as true', () => {
        // Mimic an old data.json entry that never carried the field.
        const provider = modelToLLMProvider(makeModel());
        expect(provider.promptCachingEnabled).toBe(true);
    });
});
