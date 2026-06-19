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

    it('VaultHealthSettings shape carries exactly one toggle today', () => {
        const probe: VaultHealthSettings = { autoApplyRuleRepairs: true };
        const keys = Object.keys(probe).sort();
        expect(keys).toEqual(['autoApplyRuleRepairs']);
    });
});
