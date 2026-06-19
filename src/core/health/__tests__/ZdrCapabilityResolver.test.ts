import { describe, it, expect } from 'vitest';

import { isFrontierZdrEnabled } from '../ZdrCapabilityResolver';
import type { ProviderConfig } from '../../../types/settings';

function cfg(over: Partial<ProviderConfig>): ProviderConfig {
    return {
        id: 'p',
        type: 'anthropic',
        enabled: true,
        discoveredModels: [],
        lastRefreshAt: 0,
        tierMapping: {},
        tierOverrides: {},
        ...over,
    } as ProviderConfig;
}

describe('isFrontierZdrEnabled', () => {
    it('returns false when there are no provider configs', () => {
        expect(isFrontierZdrEnabled([])).toBe(false);
        expect(isFrontierZdrEnabled(undefined)).toBe(false);
    });

    it('returns false when no provider is marked zdrCapable', () => {
        expect(
            isFrontierZdrEnabled([
                cfg({ enabled: true, tierMapping: { flagship: 'opus' } }),
            ]),
        ).toBe(false);
    });

    it('returns false when zdrCapable is set but no flagship tier is mapped', () => {
        expect(
            isFrontierZdrEnabled([
                cfg({ zdrCapable: true, tierMapping: { mid: 'haiku' } }),
            ]),
        ).toBe(false);
    });

    it('returns false when the provider is disabled', () => {
        expect(
            isFrontierZdrEnabled([
                cfg({ enabled: false, zdrCapable: true, tierMapping: { flagship: 'opus' } }),
            ]),
        ).toBe(false);
    });

    it('returns true when any enabled provider has zdrCapable + flagship', () => {
        expect(
            isFrontierZdrEnabled([
                cfg({ enabled: false, zdrCapable: false, tierMapping: { flagship: 'opus' } }),
                cfg({ enabled: true, zdrCapable: true, tierMapping: { flagship: 'opus' } }),
            ]),
        ).toBe(true);
    });

    it('accepts tierOverrides as the flagship path too', () => {
        expect(
            isFrontierZdrEnabled([
                cfg({ enabled: true, zdrCapable: true, tierOverrides: { flagship: 'opus' } }),
            ]),
        ).toBe(true);
    });
});
