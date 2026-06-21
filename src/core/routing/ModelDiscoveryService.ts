/**
 * ModelDiscoveryService (EPIC-26 / FEAT-26-02 / ADR-121).
 *
 * Wraps the provider model-list APIs (via the existing
 * `fetchProviderModels()` in src/ui/settings/testModelConnection.ts)
 * and enriches the result with tier classification + a 24h cache.
 *
 * Lifecycle:
 *  - Plugin onload: `refreshOnStartup()` runs in the background for
 *    every enabled provider whose cache is stale or empty.
 *  - Settings UI: `refreshProvider(id)` on user request.
 *  - Tier resolution path: read from the settings-cached
 *    `discoveredModels` array; no API call at chat-send time.
 *
 * The service does NOT own the network call; tests inject a fake
 * fetcher. Production wiring is done in main.ts via the
 * `realModelFetcher` factory below.
 */

import type {
    DiscoveredModel,
    ProviderConfig,
    ProviderType,
} from '../../types/settings';
import { getModelInfo, normalizeModelId } from '../../types/model-registry';
import {
    classifyModelTier,
    isLocalProviderType,
    isNonChatModelId,
} from './ModelTierClassifier';

/** 24 hours in milliseconds. */
export const DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Raw payload a fetcher returns per model. The discovery service
 * enriches each entry with autoTier before persisting.
 */
export interface RawDiscoveredModel {
    id: string;
    displayName?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    pricingPromptUsd?: number;
    pricingCompletionUsd?: number;
}

export type ModelFetcher = (provider: ProviderConfig) => Promise<RawDiscoveredModel[]>;

export interface DiscoveryHost {
    /** Current list of providers from settings. */
    getProviderConfigs(): ProviderConfig[];
    /** Persist the updated providers list (full replace, atomic). */
    saveProviderConfigs(next: ProviderConfig[]): Promise<void>;
}

export class ModelDiscoveryService {
    /**
     * Rate-limit the "service down" debug log to once per provider per
     * plugin session. Without this the same line lands on every refresh
     * cycle (startup + every 24h tick + every Settings-tab open) which
     * adds noise to anyone running with DevTools verbose level on.
     */
    private serviceDownLogged = new Set<string>();

    constructor(
        private readonly host: DiscoveryHost,
        private readonly fetcher: ModelFetcher,
        private readonly nowMs: () => number = () => Date.now(),
    ) {}

    /** Read the cached discovered models for a provider. */
    getDiscoveredModels(providerId: string): DiscoveredModel[] {
        const provider = this.findProvider(providerId);
        return provider?.discoveredModels ?? [];
    }

    /** True when the cache is older than 24h or empty. */
    isStale(providerId: string): boolean {
        const provider = this.findProvider(providerId);
        if (!provider) return true;
        if (!provider.discoveredModels || provider.discoveredModels.length === 0) {
            return true;
        }
        const age = this.nowMs() - (provider.lastRefreshAt ?? 0);
        return age >= DISCOVERY_CACHE_TTL_MS;
    }

    /**
     * Refresh a single provider's model list. Re-classifies each model
     * and writes the result back to settings. On fetch error, keeps the
     * previous cache and returns it (no throw).
     */
    async refreshProvider(providerId: string): Promise<DiscoveredModel[]> {
        const provider = this.findProvider(providerId);
        if (!provider) return [];

        let raw: RawDiscoveredModel[];
        try {
            raw = await this.fetcher(provider);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Network-level failures (daemon down, host unresolved) are
            // expected when the user has an Ollama or LM Studio entry but
            // the local service is not running. Log them at debug so the
            // console stays clean; only escalate to warn for unexpected
            // errors (auth, parsing, server 5xx).
            const isLocalServiceDown =
                /ERR_CONNECTION_REFUSED|ECONNREFUSED|ENOTFOUND|ERR_NAME_NOT_RESOLVED|fetch failed/i.test(msg);
            if (isLocalServiceDown) {
                if (!this.serviceDownLogged.has(providerId)) {
                    this.serviceDownLogged.add(providerId);
                    console.debug(
                        `[ModelDiscoveryService] ${providerId} unreachable (skipping refresh): ${msg}`,
                    );
                }
            } else {
                // Reset the rate-limit on a non-network error: the next
                // time the service is unreachable, we want the debug line
                // again because the user touched the config in between.
                this.serviceDownLogged.delete(providerId);
                console.warn(
                    `[ModelDiscoveryService] refresh failed for ${providerId}:`,
                    msg,
                );
            }
            return provider.discoveredModels ?? [];
        }

        const enriched = this.enrichWithTier(raw, provider.type);
        const autoMapping = this.deriveTierMapping(enriched);
        await this.persistRefresh(providerId, enriched, autoMapping);
        return enriched;
    }

    /**
     * Run refreshProvider() in parallel for every enabled provider
     * whose cache is stale. Errors are swallowed per provider so one
     * slow API does not block plugin onload.
     */
    async refreshOnStartup(): Promise<void> {
        const targets = this.host
            .getProviderConfigs()
            .filter((p) => p.enabled && this.isStale(p.id));
        await Promise.allSettled(targets.map((p) => this.refreshProvider(p.id)));
    }

    private findProvider(providerId: string): ProviderConfig | undefined {
        return this.host.getProviderConfigs().find((p) => p.id === providerId);
    }

    private enrichWithTier(
        raw: RawDiscoveredModel[],
        providerType: ProviderType,
    ): DiscoveredModel[] {
        const unclassified: string[] = [];
        const enriched = raw.map((r) => {
            const registryInfo = getModelInfo(normalizeModelId(r.id));
            const contextWindow = r.contextWindow ?? registryInfo?.contextWindow;
            const maxOutputTokens = r.maxOutputTokens ?? registryInfo?.maxTokens;
            const classification = classifyModelTier(r.id, {
                providerType,
                modelInfo: registryInfo ?? (contextWindow !== undefined
                    ? { contextWindow, maxTokens: maxOutputTokens }
                    : undefined),
                pricing: {
                    promptUsd: r.pricingPromptUsd,
                    completionUsd: r.pricingCompletionUsd,
                },
            });
            if (classification === null && !isNonChatModelId(r.id)) {
                unclassified.push(r.id);
            }
            return {
                id: r.id,
                displayName: r.displayName,
                contextWindow,
                maxOutputTokens,
                pricingPromptUsd: r.pricingPromptUsd,
                pricingCompletionUsd: r.pricingCompletionUsd,
                autoTier: classification?.tier,
                autoTierSource: classification?.source,
            };
        });

        // One summary line per refresh instead of one debug line per id
        // (ISSUE-C). Local providers are skipped: unclassified is by
        // design there, tiers come from user tierOverrides.
        if (unclassified.length > 0 && !isLocalProviderType(providerType)) {
            const examples = unclassified.slice(0, 5).join(', ');
            console.debug(
                `[ModelDiscoveryService] ${providerType}: ${unclassified.length}/${raw.length} models unclassified (no pattern/pricing/capability signal), e.g. ${examples}`,
            );
            if (unclassified.length > 5) {
                console.debug(
                    `[ModelDiscoveryService] ${providerType} full unclassified list: ${unclassified.join(', ')}`,
                );
            }
        }

        return enriched;
    }

    private deriveTierMapping(models: DiscoveredModel[]): ProviderConfig['tierMapping'] {
        const mapping: ProviderConfig['tierMapping'] = {};
        // Take the first occurrence per tier; the caller can refine with
        // user-supplied tierOverrides at resolution time.
        for (const m of models) {
            if (!m.autoTier) continue;
            if (!mapping[m.autoTier]) {
                mapping[m.autoTier] = m.id;
            }
        }
        return mapping;
    }

    private async persistRefresh(
        providerId: string,
        models: DiscoveredModel[],
        autoMapping: ProviderConfig['tierMapping'],
    ): Promise<void> {
        const current = this.host.getProviderConfigs();
        const next = current.map((p) => {
            if (p.id !== providerId) return p;
            return {
                ...p,
                discoveredModels: models,
                lastRefreshAt: this.nowMs(),
                tierMapping: { ...p.tierMapping, ...autoMapping },
            };
        });
        await this.host.saveProviderConfigs(next);
    }
}
