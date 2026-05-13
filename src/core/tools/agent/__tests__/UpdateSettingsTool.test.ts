import { describe, it, expect } from 'vitest';
import { WRITABLE_PATHS } from '../UpdateSettingsTool';

/**
 * FIX-24-07-01: regression guard against the pattern-drift discovered
 * during MESSLAUF Test 4. Five EPIC-24 settings had been added to the
 * ObsidianAgentSettings interface but never registered in
 * `UpdateSettingsTool.WRITABLE_PATHS`. Effect: the agent could not set
 * those settings via `update_settings`, even though they are
 * user-facing toggles by design.
 *
 * This test pins each EPIC-24 setting path so a future addition cannot
 * silently slip past the allowlist again.
 */

describe('UpdateSettingsTool WRITABLE_PATHS (FIX-24-07-01)', () => {
    it('contains the FEAT-24-02 microcompaction toggles', () => {
        expect(WRITABLE_PATHS.has('advancedApi.microcompactionEnabled')).toBe(true);
        expect(WRITABLE_PATHS.has('advancedApi.rollingSummaryThreshold')).toBe(true);
    });

    it('contains the FEAT-24-04 subtask token budget', () => {
        expect(WRITABLE_PATHS.has('advancedApi.subtaskTokenBudget')).toBe(true);
    });

    it('contains the FEAT-24-07 helper model key', () => {
        expect(WRITABLE_PATHS.has('helperModelKey')).toBe(true);
    });

    it('contains the FEAT-24-05 cost warn threshold', () => {
        expect(WRITABLE_PATHS.has('costWarnThresholdEur')).toBe(true);
    });

    it('does NOT contain sensitive paths (api keys, model definitions)', () => {
        // Smoke check: the model-key writeability comes from configure_model,
        // not update_settings. The activeModels array stays out of reach.
        expect(WRITABLE_PATHS.has('activeModels')).toBe(false);
        expect(WRITABLE_PATHS.has('activeModelKey')).toBe(false);
    });
});
