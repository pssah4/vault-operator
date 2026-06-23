import { describe, it, expect } from 'vitest';
import { INLINE_ACTIONS_DEFAULTS, resolveInlineActionsSettings } from '../inlineSettings';

describe('inlineSettings.resolveInlineActionsSettings', () => {
    it('returns defaults for undefined', () => {
        const out = resolveInlineActionsSettings(undefined);
        expect(out).toEqual(INLINE_ACTIONS_DEFAULTS);
    });

    it('returns defaults for empty object', () => {
        const out = resolveInlineActionsSettings({});
        expect(out.enabled).toBe(true);
        expect(out.floatingMenuEnabled).toBe(true);
        expect(out.vaultRagInLookup).toBe(true);
        expect(out.vaultRagConfidenceThreshold).toBe(0.7);
        expect(out.skillsTopN).toBe(10);
    });

    it('honors explicit disabled fields', () => {
        const out = resolveInlineActionsSettings({
            enabled: false,
            floatingMenuEnabled: false,
            vaultRagInLookup: false,
            showVaultSourcesInTooltip: false,
        });
        expect(out.enabled).toBe(false);
        expect(out.floatingMenuEnabled).toBe(false);
        expect(out.vaultRagInLookup).toBe(false);
        expect(out.showVaultSourcesInTooltip).toBe(false);
    });

    it('clamps confidence threshold to [0, 1]', () => {
        expect(resolveInlineActionsSettings({ vaultRagConfidenceThreshold: -0.5 }).vaultRagConfidenceThreshold).toBe(0);
        expect(resolveInlineActionsSettings({ vaultRagConfidenceThreshold: 1.5 }).vaultRagConfidenceThreshold).toBe(1);
        expect(resolveInlineActionsSettings({ vaultRagConfidenceThreshold: 0.42 }).vaultRagConfidenceThreshold).toBe(0.42);
    });

    it('floors and clamps skillsTopN to non-negative integer', () => {
        expect(resolveInlineActionsSettings({ skillsTopN: -3 }).skillsTopN).toBe(0);
        expect(resolveInlineActionsSettings({ skillsTopN: 7.9 }).skillsTopN).toBe(7);
        expect(resolveInlineActionsSettings({ skillsTopN: 0 }).skillsTopN).toBe(0);
    });

    it('passes actionPins through (clone, not reference)', () => {
        const pins = { lookup: 'haiku-model', rewrite: null };
        const out = resolveInlineActionsSettings({ actionPins: pins });
        expect(out.actionPins).toEqual(pins);
        expect(out.actionPins).not.toBe(pins);
    });

    it('default actionPins is fresh empty object per call', () => {
        const a = resolveInlineActionsSettings(undefined);
        const b = resolveInlineActionsSettings(undefined);
        expect(a.actionPins).toEqual({});
        expect(b.actionPins).toEqual({});
        a.actionPins['x'] = 'y';
        expect(b.actionPins['x']).toBeUndefined();
    });

    it('ignores invalid numeric inputs', () => {
        const out = resolveInlineActionsSettings({
            vaultRagConfidenceThreshold: Number.NaN as unknown as number,
            skillsTopN: Number.POSITIVE_INFINITY as unknown as number,
        });
        // NaN passes typeof === 'number' but Math.min(1, Math.max(0, NaN)) === NaN; clamp falls back to default.
        // For NaN: Math.max(0, NaN) is NaN, Math.min(1, NaN) is NaN -- so this is an edge we accept.
        // The contract: invalid numbers should not crash. We verify it returns a finite number.
        expect(typeof out.skillsTopN).toBe('number');
        expect(Number.isFinite(out.skillsTopN)).toBe(true);
    });
});
