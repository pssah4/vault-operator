import { describe, it, expect } from 'vitest';
import { resolveLeanFlags } from '../leanFlags';

/**
 * resolveLeanFlags (issue #44).
 *
 * The two lean system-prompt variants (cost-heuristics and plugin-skills)
 * were decided purely by routing heuristics:
 *   costHeuristicsLean = !modelOverrideActive
 *   pluginSkillsLean   = !recentPluginSkillUsage
 *
 * The optional global "Lean system prompt" setting ORs into both decisions.
 * Forcing lean only ever REDUCES tokens and reuses the already-validated
 * EPIC-26 variants, so the default (setting=false) MUST preserve the exact
 * old behaviour for every input combination.
 */
describe('resolveLeanFlags', () => {
    describe('setting=false preserves the old heuristic-only behaviour', () => {
        const cases: Array<[boolean, boolean]> = [
            [false, false],
            [false, true],
            [true, false],
            [true, true],
        ];

        it.each(cases)(
            'modelOverrideActive=%s recentPluginSkillUsage=%s mirrors the heuristics',
            (modelOverrideActive, recentPluginSkillUsage) => {
                const result = resolveLeanFlags(false, modelOverrideActive, recentPluginSkillUsage);
                expect(result).toEqual({
                    costHeuristicsLean: !modelOverrideActive,
                    pluginSkillsLean: !recentPluginSkillUsage,
                });
            },
        );
    });

    describe('setting=true forces both lean regardless of heuristics', () => {
        const cases: Array<[boolean, boolean]> = [
            [false, false],
            [false, true],
            [true, false],
            [true, true],
        ];

        it.each(cases)(
            'modelOverrideActive=%s recentPluginSkillUsage=%s forces both lean',
            (modelOverrideActive, recentPluginSkillUsage) => {
                const result = resolveLeanFlags(true, modelOverrideActive, recentPluginSkillUsage);
                expect(result).toEqual({
                    costHeuristicsLean: true,
                    pluginSkillsLean: true,
                });
            },
        );
    });
});
