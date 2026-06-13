/**
 * Per-conversation reasoning-effort override logic.
 *
 * These tests pin the pure decision that maps a conversation effort-override
 * state onto the effective effort level the built model should carry. The
 * default 'auto' sends no effort field, so existing conversations stay
 * byte-identical to before.
 */
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_EFFORT_OVERRIDE,
    effortControlVisibility,
    isExplicitEffortOverride,
    resolveEffectiveEffort,
} from '../effortOverride';

describe('resolveEffectiveEffort', () => {
    it('auto resolves to undefined (no override, no field sent)', () => {
        expect(resolveEffectiveEffort('auto')).toBe(undefined);
    });

    it('resolves every native level verbatim (minimal..max)', () => {
        expect(resolveEffectiveEffort('minimal')).toBe('minimal');
        expect(resolveEffectiveEffort('low')).toBe('low');
        expect(resolveEffectiveEffort('medium')).toBe('medium');
        expect(resolveEffectiveEffort('high')).toBe('high');
        expect(resolveEffectiveEffort('xhigh')).toBe('xhigh');
        expect(resolveEffectiveEffort('max')).toBe('max');
    });
});

describe('isExplicitEffortOverride', () => {
    it('is false for auto (no change, no field)', () => {
        expect(isExplicitEffortOverride('auto')).toBe(false);
    });

    it('is true for every native level', () => {
        expect(isExplicitEffortOverride('minimal')).toBe(true);
        expect(isExplicitEffortOverride('low')).toBe(true);
        expect(isExplicitEffortOverride('medium')).toBe(true);
        expect(isExplicitEffortOverride('high')).toBe(true);
        expect(isExplicitEffortOverride('xhigh')).toBe(true);
        expect(isExplicitEffortOverride('max')).toBe(true);
    });
});

describe('DEFAULT_EFFORT_OVERRIDE', () => {
    it('defaults to auto so existing behavior is preserved', () => {
        expect(DEFAULT_EFFORT_OVERRIDE).toBe('auto');
        expect(isExplicitEffortOverride(DEFAULT_EFFORT_OVERRIDE)).toBe(false);
        expect(resolveEffectiveEffort(DEFAULT_EFFORT_OVERRIDE)).toBe(undefined);
    });
});

describe('effortControlVisibility', () => {
    it('shows the control only when thinking is on and the model is effort-capable', () => {
        expect(effortControlVisibility(true, true)).toBe('control');
    });

    it('renders nothing when thinking is off (effort is hidden, no coherence collapse needed)', () => {
        expect(effortControlVisibility(false, true)).toBe('none');
        expect(effortControlVisibility(false, false)).toBe('none');
    });

    it('renders nothing when thinking is on but the model cannot send effort', () => {
        expect(effortControlVisibility(true, false)).toBe('none');
    });
});
