/**
 * ZdrCapabilityResolver -- looks up the active flagship provider in
 * settings and reports whether the user marked it as Zero-Data-
 * Retention capable.
 *
 * IMP-20-06-01 W4-T2 / ADR-135. The freshness verifier consults this
 * resolver before any frontier-tier call. Default fail-closed: an
 * unset flag is treated as not-ZDR, so the verifier stays on the mid
 * tier.
 *
 * Wayfinder entry: see `src/ARCHITECTURE.map`, row `zdr-capability`.
 */

import type { ProviderConfig } from '../../types/settings';

export function isFrontierZdrEnabled(providerConfigs: ProviderConfig[] | undefined): boolean {
    if (!providerConfigs?.length) return false;
    return providerConfigs.some((cfg) => {
        if (!cfg.enabled) return false;
        if (cfg.zdrCapable !== true) return false;
        return Boolean(cfg.tierMapping?.flagship ?? cfg.tierOverrides?.flagship);
    });
}
