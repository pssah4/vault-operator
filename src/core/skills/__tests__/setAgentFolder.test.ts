/**
 * FEATURE-0508 regression: the setAgentFolder / setSkillsDir setters on
 * VaultDNAScanner and SkillRegistry must replace the constructor-cached
 * path so later reads see the new value. Covers the P1 path — "live
 * re-target without a plugin reload".
 *
 * We avoid instantiating VaultDNAScanner (it needs App + Vault) and
 * instead exercise the setter through SkillRegistry's prompt output,
 * which embeds the `skillsDir` string.
 */

import { describe, it, expect } from 'vitest';
import { SkillRegistry } from '../SkillRegistry';
import type { VaultDNAScanner } from '../VaultDNAScanner';
import type { VaultDNA } from '../types';

function makeScannerStub(): VaultDNAScanner {
    const stub = {
        getEnabledPluginSkills: () => [],
        getDisabledPluginSkills: () => [],
        getVaultDNA: (): VaultDNA | null => null,
    };
    return stub as unknown as VaultDNAScanner;
}

describe('SkillRegistry.setSkillsDir (FEATURE-0508 P1)', () => {
    it('changes the path emitted in the prompt section at read time', () => {
        const registry = new SkillRegistry(
            makeScannerStub(),
            {},
            '.obsidian-agent/plugin-skills',
        );

        // Without any plugins, the section is empty — pre-populate a
        // disabled plugin so the section renders the skillsDir hint.
        const scannerWithDisabled = {
            getEnabledPluginSkills: () => [],
            getDisabledPluginSkills: () => [{
                id: 'dataview',
                name: 'Dataview',
                description: 'Query vault as DB',
                classification: 'FULL' as const,
                enabled: false,
                commands: [],
                source: 'vault-native' as const,
            }],
            getVaultDNA: () => null,
        };
        const registry2 = new SkillRegistry(
            scannerWithDisabled as unknown as VaultDNAScanner,
            {},
            '.obsidian-agent/plugin-skills',
        );

        const before = registry2.getPluginSkillsPromptSection();
        expect(before).toContain('.obsidian-agent/plugin-skills');
        expect(before).not.toContain('_private/agent/plugin-skills');

        registry2.setSkillsDir('_private/agent/plugin-skills');
        const after = registry2.getPluginSkillsPromptSection();
        expect(after).toContain('_private/agent/plugin-skills');
        expect(after).not.toContain('.obsidian-agent/plugin-skills');

        // The first registry should be unaffected (independent instance).
        expect(registry.getPluginSkillsPromptSection()).toBe('');
    });
});
