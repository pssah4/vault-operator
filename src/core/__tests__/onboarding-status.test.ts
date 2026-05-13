import { describe, it, expect } from 'vitest';
import { isActiveOnboardingFlow } from '../onboarding-status';
import type { ObsidianAgentSettings, CustomModel } from '../../types/settings';

/**
 * Regression test for FIX-24-09-01.
 *
 * Verifies that the system-prompt onboarding gate fires only during the
 * active first-time wizard, not for users who abandoned the wizard but
 * use the plugin productively (Sebastian's case discovered in the live
 * MESSLAUF test).
 */

function makeSettings(overrides: { completed?: boolean; activeModels?: CustomModel[] } = {}): ObsidianAgentSettings {
    return {
        onboarding: {
            completed: overrides.completed ?? false,
            currentStep: 'backup',
            skippedSteps: [],
            startedAt: '',
        },
        activeModels: overrides.activeModels ?? [],
    } as unknown as ObsidianAgentSettings;
}

const aModel: CustomModel = {
    name: 'claude-sonnet-4-7',
    provider: 'anthropic',
    enabled: true,
};

describe('isActiveOnboardingFlow (FIX-24-09-01)', () => {
    it('returns false when the wizard is completed (default productive user)', () => {
        const settings = makeSettings({ completed: true, activeModels: [aModel] });
        expect(isActiveOnboardingFlow(settings)).toBe(false);
    });

    it('returns true on a fresh install: not completed AND no models configured', () => {
        const settings = makeSettings({ completed: false, activeModels: [] });
        expect(isActiveOnboardingFlow(settings)).toBe(true);
    });

    it('returns false when the wizard was abandoned but the user has models (Sebastians case)', () => {
        // This is the bug fix: completed stays false forever for users who
        // abandoned the wizard early, but they still have activeModels and
        // use the plugin productively. The system prompt must show them
        // skill-directory + plugin-skills like any other productive user.
        const settings = makeSettings({ completed: false, activeModels: [aModel] });
        expect(isActiveOnboardingFlow(settings)).toBe(false);
    });

    it('returns false in the edge case of completed=true but no models', () => {
        // Conservative: if the wizard explicitly said "done", we trust it.
        // The user might have removed all models manually after onboarding.
        const settings = makeSettings({ completed: true, activeModels: [] });
        expect(isActiveOnboardingFlow(settings)).toBe(false);
    });

    it('returns false as soon as a single model is configured, even with multiple disabled ones', () => {
        // The check is `length === 0`. A disabled model still counts as a
        // configured one for this purpose; the user got past model-setup.
        const disabledModel: CustomModel = { ...aModel, enabled: false };
        const settings = makeSettings({ completed: false, activeModels: [disabledModel] });
        expect(isActiveOnboardingFlow(settings)).toBe(false);
    });
});
