/**
 * Per-conversation thinking on/off override logic (issue #44).
 *
 * These tests pin the pure decision that maps a conversation thinking-override
 * state plus the active model's own thinkingEnabled onto the effective value
 * the built model should carry. The default 'follow' keeps the model's own
 * value so existing conversations behave unchanged.
 */
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_THINKING_OVERRIDE,
    isExplicitThinkingOverride,
    resolveEffectiveThinkingEnabled,
} from '../thinkingOverride';

describe('resolveEffectiveThinkingEnabled', () => {
    it('follow keeps the model value (true)', () => {
        expect(resolveEffectiveThinkingEnabled('follow', true)).toBe(true);
    });

    it('follow keeps the model value (false)', () => {
        expect(resolveEffectiveThinkingEnabled('follow', false)).toBe(false);
    });

    it('follow keeps the model value (undefined)', () => {
        expect(resolveEffectiveThinkingEnabled('follow', undefined)).toBe(undefined);
    });

    it('on forces true regardless of the model value', () => {
        expect(resolveEffectiveThinkingEnabled('on', false)).toBe(true);
        expect(resolveEffectiveThinkingEnabled('on', undefined)).toBe(true);
        expect(resolveEffectiveThinkingEnabled('on', true)).toBe(true);
    });

    it('off forces false regardless of the model value', () => {
        expect(resolveEffectiveThinkingEnabled('off', true)).toBe(false);
        expect(resolveEffectiveThinkingEnabled('off', undefined)).toBe(false);
        expect(resolveEffectiveThinkingEnabled('off', false)).toBe(false);
    });
});

describe('isExplicitThinkingOverride', () => {
    it('is false for follow (no change to the model value)', () => {
        expect(isExplicitThinkingOverride('follow')).toBe(false);
    });

    it('is true for on and off', () => {
        expect(isExplicitThinkingOverride('on')).toBe(true);
        expect(isExplicitThinkingOverride('off')).toBe(true);
    });
});

describe('DEFAULT_THINKING_OVERRIDE', () => {
    it('defaults to follow so existing behavior is preserved', () => {
        expect(DEFAULT_THINKING_OVERRIDE).toBe('follow');
        expect(isExplicitThinkingOverride(DEFAULT_THINKING_OVERRIDE)).toBe(false);
    });
});
