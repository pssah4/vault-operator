/**
 * EPIC-26 / FEAT-26-04 / ADR-123 -- migrate legacy `activeModels[]` to the
 * new provider-only schema (`providerConfigs[]` + `activeProviderId`).
 *
 * Pure function. Idempotent. Detects anomalies the user should be aware
 * of (multiple auth-configs per provider type, missing flagship slot,
 * custom endpoints that need manual tier assignment). Does NOT mutate
 * the input.
 */

import type {
    CustomModel,
    DiscoveredModel,
    ObsidianAgentSettings,
    ProviderConfig,
    ProviderType,
} from '../../../types/settings';
import { getProviderBrandLabel } from '../../../types/settings';
import { classifyModelTier } from '../../routing/ModelTierClassifier';

export type MigrationAnomalyKind =
    | 'multi-auth'
    | 'missing-flagship'
    | 'manual-tier-required'
    | 'no-active-model';

export interface MigrationAnomaly {
    kind: MigrationAnomalyKind;
    providerType?: ProviderType;
    providerId?: string;
    detail: string;
}

export interface MigrationSummary {
    providersCreated: number;
    modelsClassified: number;
    activeProviderResolved: boolean;
    anomalies: MigrationAnomaly[];
}

export interface MigrationResult {
    /** True when migration actually ran. False on idempotent no-op. */
    didMigrate: boolean;
    /** Updated providerConfigs[] -- ready to write back to settings. */
    providerConfigs: ProviderConfig[];
    /** activeProviderId derived from settings.activeModelKey. */
    activeProviderId: string | null;
    /** Snapshot of the input activeModels[] (only set when didMigrate=true). */
    legacyBackup: CustomModel[];
    /** Schema version stamp to write into settings. */
    schemaVersion: string;
    /** Human-readable summary for the notification modal. */
    summary: MigrationSummary;
}

/** The schema-version stamp written into settings after a successful migration. */
export const SCHEMA_VERSION = '2026.5.15';

type MigrationInputSettings = Pick<ObsidianAgentSettings,
    'activeModels' | 'activeModelKey' | 'providerConfigs' | 'schemaVersion'
>;

function shouldMigrate(settings: MigrationInputSettings): boolean {
    if (settings.schemaVersion) return false; // already migrated
    if ((settings.providerConfigs ?? []).length > 0) return false;
    if (!settings.activeModels || settings.activeModels.length === 0) return false;
    return true;
}

function providerInstanceId(providerType: ProviderType, suffix?: string): string {
    return suffix ? `${providerType}-${suffix}` : `${providerType}-main`;
}

/**
 * Stable hash-ish discriminator for distinguishing multiple auth configs
 * of the same provider type. Uses the API key (first 8 chars) when set,
 * falls back to the baseUrl, falls back to "default".
 */
function authDiscriminator(m: CustomModel): string {
    if (m.apiKey) return m.apiKey.slice(0, 8);
    if (m.awsApiKey) return m.awsApiKey.slice(0, 8);
    if (m.awsAccessKey) return m.awsAccessKey.slice(0, 8);
    if (m.baseUrl) return m.baseUrl;
    return 'default';
}

function isCustomEndpoint(providerType: ProviderType): boolean {
    return providerType === 'ollama' || providerType === 'lmstudio' || providerType === 'custom';
}

function buildProviderConfigFromGroup(
    providerType: ProviderType,
    authKey: string,
    models: CustomModel[],
    isFirstAuth: boolean,
    anomalies: MigrationAnomaly[],
): ProviderConfig {
    const head = models[0];
    const providerId = providerInstanceId(providerType, isFirstAuth ? undefined : authKey);

    const discovered: DiscoveredModel[] = models.map((m) => {
        const classification = !isCustomEndpoint(providerType)
            ? classifyModelTier(m.name, { providerType })
            : null;
        return {
            id: m.name,
            displayName: m.displayName ?? m.name,
            maxOutputTokens: m.maxTokens,
            autoTier: classification?.tier,
            autoTierSource: classification?.source,
        };
    });

    const tierMapping: ProviderConfig['tierMapping'] = {};
    for (const m of discovered) {
        if (!m.autoTier) continue;
        if (!tierMapping[m.autoTier]) {
            tierMapping[m.autoTier] = m.id;
        }
    }

    // Anomaly: custom endpoints can't be classified
    if (isCustomEndpoint(providerType)) {
        anomalies.push({
            kind: 'manual-tier-required',
            providerType,
            providerId,
            detail: `${providerType} models need a manual tier assignment in Settings -> Providers.`,
        });
    } else if (!tierMapping.flagship) {
        anomalies.push({
            kind: 'missing-flagship',
            providerType,
            providerId,
            detail: `${providerType} has no flagship-tier model. The Advisor pattern (consult_flagship) is disabled for this provider until you add one.`,
        });
    }

    return {
        id: providerId,
        type: providerType,
        displayName: getProviderBrandLabel(providerType),
        enabled: true,
        apiKey: head.apiKey,
        baseUrl: head.baseUrl,
        apiVersion: head.apiVersion,
        awsAuthMode: head.awsAuthMode,
        awsRegion: head.awsRegion,
        awsApiKey: head.awsApiKey,
        awsAccessKey: head.awsAccessKey,
        awsSecretKey: head.awsSecretKey,
        awsSessionToken: head.awsSessionToken,
        discoveredModels: discovered,
        lastRefreshAt: 0,
        tierMapping,
        tierOverrides: {},
    };
}

/**
 * Build the migration result. Caller writes the result into settings
 * and persists. Does NOT mutate the input.
 */
export function migrateActiveModelsToProviders(settings: MigrationInputSettings): MigrationResult {
    const anomalies: MigrationAnomaly[] = [];

    if (!shouldMigrate(settings)) {
        return {
            didMigrate: false,
            providerConfigs: settings.providerConfigs ?? [],
            activeProviderId: null,
            legacyBackup: [],
            schemaVersion: settings.schemaVersion ?? SCHEMA_VERSION,
            summary: {
                providersCreated: 0,
                modelsClassified: 0,
                activeProviderResolved: false,
                anomalies: [],
            },
        };
    }

    // Group enabled models by provider type. Disabled models are ignored
    // (still preserved in legacyBackup for the user's record).
    const enabledModels = settings.activeModels.filter((m) => m.enabled);
    const byType = new Map<ProviderType, CustomModel[]>();
    for (const m of enabledModels) {
        const arr = byType.get(m.provider) ?? [];
        arr.push(m);
        byType.set(m.provider, arr);
    }

    const providerConfigs: ProviderConfig[] = [];
    let activeProviderId: string | null = null;

    for (const [providerType, models] of byType.entries()) {
        // Sub-group by auth discriminator -- catches multi-auth setups.
        const byAuth = new Map<string, CustomModel[]>();
        for (const m of models) {
            const key = authDiscriminator(m);
            const arr = byAuth.get(key) ?? [];
            arr.push(m);
            byAuth.set(key, arr);
        }

        if (byAuth.size > 1) {
            anomalies.push({
                kind: 'multi-auth',
                providerType,
                detail: `${providerType} has ${byAuth.size} distinct auth configurations. The first one was kept as the primary; review the others in Settings -> Providers.`,
            });
        }

        let isFirstAuth = true;
        for (const [authKey, authModels] of byAuth.entries()) {
            const config = buildProviderConfigFromGroup(
                providerType,
                authKey,
                authModels,
                isFirstAuth,
                anomalies,
            );
            providerConfigs.push(config);
            isFirstAuth = false;
        }
    }

    // Resolve activeProviderId from the legacy activeModelKey.
    if (settings.activeModelKey) {
        const [activeName, activeProvider] = settings.activeModelKey.split('|');
        const match = providerConfigs.find((p) => {
            if (p.type !== activeProvider) return false;
            return p.discoveredModels.some((m) => m.id === activeName);
        });
        if (match) {
            activeProviderId = match.id;
        }
    }

    // Fallback: pick the first provider if none resolved from activeModelKey.
    if (!activeProviderId && providerConfigs.length > 0) {
        activeProviderId = providerConfigs[0].id;
    }

    if (!activeProviderId) {
        anomalies.push({
            kind: 'no-active-model',
            detail: 'No active model was resolvable from the legacy setup. Pick an active provider in Settings -> Providers.',
        });
    }

    const totalModels = providerConfigs.reduce((sum, p) => sum + p.discoveredModels.length, 0);

    return {
        didMigrate: true,
        providerConfigs,
        activeProviderId,
        legacyBackup: [...settings.activeModels],
        schemaVersion: SCHEMA_VERSION,
        summary: {
            providersCreated: providerConfigs.length,
            modelsClassified: totalModels,
            activeProviderResolved: activeProviderId !== null,
            anomalies,
        },
    };
}
