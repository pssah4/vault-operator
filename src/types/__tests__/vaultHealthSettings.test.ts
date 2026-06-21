import { describe, it, expect } from 'vitest';

import {
    DEFAULT_VAULT_HEALTH_SETTINGS,
    DEFAULT_SETTINGS,
    type VaultHealthSettings,
} from '../settings';

/**
 * IMP-19-01-01 AC-05: vaultHealth.autoApplyRuleRepairs defaults OFF
 * so existing users see no behaviour change until they opt in.
 */

describe('VaultHealthSettings (IMP-19-01-01)', () => {
    it('default is auto-apply OFF', () => {
        expect(DEFAULT_VAULT_HEALTH_SETTINGS.autoApplyRuleRepairs).toBe(false);
    });

    it('DEFAULT_SETTINGS wires vaultHealth into the plugin shape', () => {
        expect(DEFAULT_SETTINGS.vaultHealth).toBeDefined();
        expect(DEFAULT_SETTINGS.vaultHealth.autoApplyRuleRepairs).toBe(false);
    });

    it('VaultHealthSettings shape carries the four current toggles', () => {
        const probe: VaultHealthSettings = {
            autoApplyRuleRepairs: true,
            orphansTargetFolder: 'Inbox/Orphans',
            silenceWithContextOrphans: true,
            orphanExcludePathPrefixes: ['TaskNotes/'],
        };
        const keys = Object.keys(probe).sort();
        expect(keys).toEqual([
            'autoApplyRuleRepairs',
            'orphanExcludePathPrefixes',
            'orphansTargetFolder',
            'silenceWithContextOrphans',
        ]);
    });

    it('IMP-19-01-02: orphansTargetFolder defaults to Inbox/Orphans', () => {
        expect(DEFAULT_VAULT_HEALTH_SETTINGS.orphansTargetFolder).toBe('Inbox/Orphans');
        expect(DEFAULT_SETTINGS.vaultHealth.orphansTargetFolder).toBe('Inbox/Orphans');
    });

    it('FIX-19-01-05: silenceWithContextOrphans defaults to true (Base-as-backlink workflow)', () => {
        expect(DEFAULT_VAULT_HEALTH_SETTINGS.silenceWithContextOrphans).toBe(true);
        expect(DEFAULT_SETTINGS.vaultHealth.silenceWithContextOrphans).toBe(true);
    });

    it('FIX-19-01-05: orphanExcludePathPrefixes defaults to TaskNotes/ + Inbox/Orphans/', () => {
        expect(DEFAULT_VAULT_HEALTH_SETTINGS.orphanExcludePathPrefixes).toEqual([
            'TaskNotes/', 'Inbox/Orphans/',
        ]);
    });
});
