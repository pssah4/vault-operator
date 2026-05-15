/**
 * EPIC-26 / FEAT-26-03 -- per-provider configuration modal.
 *
 * The ProvidersTab shows providers as a compact list (one row each, with
 * the active-provider radio + enable toggle). All detail configuration
 * (auth fields, refresh, tier mapping, remove) lives in this modal so
 * the overview stays scannable.
 *
 * Modal layout follows Obsidian's native Setting API for visual
 * consistency with the rest of the settings UI.
 */

import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type {
    DiscoveredModel,
    ModelTier,
    ProviderConfig,
    ProviderType,
} from '../../types/settings';
import { PROVIDER_LABELS } from './constants';
import { t } from '../../i18n';

const TIER_ORDER: ModelTier[] = ['fast', 'mid', 'flagship'];

const OAUTH_PROVIDER_TYPES: ProviderType[] = ['github-copilot', 'chatgpt-oauth'];
const LOCAL_PROVIDER_TYPES: ProviderType[] = ['ollama', 'lmstudio', 'custom'];

export class ProviderDetailModal extends Modal {
    constructor(
        app: App,
        private readonly plugin: ObsidianAgentPlugin,
        private readonly providerId: string,
        private readonly onAfterChange: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private currentProvider(): ProviderConfig | null {
        return (this.plugin.settings.providerConfigs ?? []).find((p) => p.id === this.providerId) ?? null;
    }

    private providerLabel(type: ProviderType): string {
        return PROVIDER_LABELS[type] ?? type;
    }

    private async patch(mutator: (p: ProviderConfig) => void): Promise<void> {
        const list = this.plugin.settings.providerConfigs ?? [];
        const idx = list.findIndex((p) => p.id === this.providerId);
        if (idx < 0) return;
        mutator(list[idx]);
        await this.plugin.saveSettings();
        this.onAfterChange();
    }

    private render(): void {
        const provider = this.currentProvider();
        if (!provider) {
            this.contentEl.empty();
            this.contentEl.createEl('p', { text: 'Provider not found.' });
            return;
        }
        this.contentEl.empty();

        // Title
        this.titleEl.setText(t('settings.providers.modal.title', {
            name: provider.displayName ?? this.providerLabel(provider.type),
        }));

        // ── Identity section ─────────────────────────────────────────────
        this.contentEl.createEl('h3', {
            cls: 'agent-settings-section',
            text: t('settings.providers.modal.section.identity'),
        });

        new Setting(this.contentEl)
            .setName(t('settings.providers.modal.displayName'))
            .setDesc(t('settings.providers.modal.displayNameDesc'))
            .addText((text) => {
                text.setValue(provider.displayName ?? '')
                    .setPlaceholder(this.providerLabel(provider.type))
                    .onChange(async (v) => {
                        await this.patch((p) => {
                            p.displayName = v.trim() || this.providerLabel(p.type);
                        });
                    });
            });

        new Setting(this.contentEl)
            .setName(t('settings.providers.enabled'))
            .addToggle((toggle) => {
                toggle.setValue(provider.enabled).onChange(async (v) => {
                    await this.patch((p) => { p.enabled = v; });
                });
            });

        // ── Authentication section ──────────────────────────────────────
        this.contentEl.createEl('h3', {
            cls: 'agent-settings-section',
            text: t('settings.providers.modal.section.auth'),
        });

        this.renderAuthSection(this.contentEl, provider);

        // ── Discovery section ───────────────────────────────────────────
        this.contentEl.createEl('h3', {
            cls: 'agent-settings-section',
            text: t('settings.providers.modal.section.discovery'),
        });

        this.renderDiscoverySection(this.contentEl, provider);

        // ── Tier mapping section ────────────────────────────────────────
        this.contentEl.createEl('h3', {
            cls: 'agent-settings-section',
            text: t('settings.providers.modal.section.tiers'),
        });

        for (const tier of TIER_ORDER) {
            this.renderTierSetting(this.contentEl, provider, tier);
        }

        if (!this.resolveTierSlot(provider, 'flagship')) {
            const warn = this.contentEl.createDiv({ cls: 'agent-settings-warning' });
            const icon = warn.createSpan({ cls: 'agent-settings-warning-icon' });
            setIcon(icon, 'alert-triangle');
            warn.createSpan({ text: ' ' + t('settings.providers.advisorDisabled') });
        }

        // ── Danger zone ─────────────────────────────────────────────────
        this.contentEl.createEl('h3', {
            cls: 'agent-settings-section',
            text: t('settings.providers.modal.section.danger'),
        });

        new Setting(this.contentEl)
            .setName(t('settings.providers.removeProvider'))
            .setDesc(t('settings.providers.removeDesc'))
            .addButton((btn) => {
                btn.setButtonText(t('settings.providers.removeProvider'))
                    .setWarning()
                    .onClick(async () => {
                        const ok = window.confirm(t('settings.providers.removeConfirm', {
                            name: provider.displayName ?? this.providerLabel(provider.type),
                        }));
                        if (!ok) return;
                        const list = this.plugin.settings.providerConfigs ?? [];
                        this.plugin.settings.providerConfigs = list.filter((p) => p.id !== provider.id);
                        if (this.plugin.settings.activeProviderId === provider.id) {
                            this.plugin.settings.activeProviderId = null;
                        }
                        await this.plugin.saveSettings();
                        this.onAfterChange();
                        this.close();
                    });
            });
    }

    private renderAuthSection(parent: HTMLElement, provider: ProviderConfig): void {
        if (OAUTH_PROVIDER_TYPES.includes(provider.type)) {
            this.renderOAuthAuth(parent, provider);
            return;
        }
        if (provider.type === 'bedrock') {
            this.renderBedrockAuth(parent, provider);
            return;
        }

        // API-key based providers (anthropic, openai, gemini, openrouter, azure, custom)
        new Setting(parent)
            .setName(t('settings.providers.apiKey'))
            .setDesc(t('settings.providers.apiKeyDesc'))
            .addText((text) => {
                text.inputEl.type = 'password';
                text.setValue(provider.apiKey ?? '')
                    .setPlaceholder('••••••')
                    .onChange(async (v) => {
                        await this.patch((p) => { p.apiKey = v || undefined; });
                    });
            });

        if (LOCAL_PROVIDER_TYPES.includes(provider.type) || provider.type === 'azure') {
            new Setting(parent)
                .setName(t('settings.providers.baseUrl'))
                .setDesc(t('settings.providers.baseUrlDesc'))
                .addText((text) => {
                    text.setValue(provider.baseUrl ?? '')
                        .onChange(async (v) => {
                            await this.patch((p) => { p.baseUrl = v.trim() || undefined; });
                        });
                });
        }

        if (provider.type === 'azure') {
            new Setting(parent)
                .setName(t('settings.providers.apiVersion'))
                .setDesc(t('settings.providers.apiVersionDesc'))
                .addText((text) => {
                    text.setValue(provider.apiVersion ?? '')
                        .setPlaceholder('2024-10-21')
                        .onChange(async (v) => {
                            await this.patch((p) => { p.apiVersion = v.trim() || undefined; });
                        });
                });
        }
    }

    private renderOAuthAuth(parent: HTMLElement, provider: ProviderConfig): void {
        const isAuthed = !!provider.oauthToken
            || (provider.type === 'github-copilot' && !!this.plugin.settings.githubCopilotAccessToken)
            || (provider.type === 'chatgpt-oauth' && !!this.plugin.settings.chatgptOAuthAccessToken);

        new Setting(parent)
            .setName(t('settings.providers.oauthStatus'))
            .setDesc(isAuthed
                ? t('settings.providers.oauthAuthed')
                : t('settings.providers.oauthNotAuthed'))
            .addButton((btn) => {
                btn.setButtonText(isAuthed
                        ? t('settings.providers.oauthReauth')
                        : t('settings.providers.oauthSignIn'))
                    .setCta()
                    .onClick(() => {
                        new Notice(t('settings.providers.oauthSignInRedirect'));
                        this.plugin.openSettingsAt('agent', 'models');
                        this.close();
                    });
            });
    }

    private renderBedrockAuth(parent: HTMLElement, provider: ProviderConfig): void {
        new Setting(parent)
            .setName(t('settings.providers.bedrockRegion'))
            .setDesc(t('settings.providers.bedrockRegionDesc'))
            .addText((text) => {
                text.setPlaceholder('eu-central-1')
                    .setValue(provider.awsRegion ?? '')
                    .onChange(async (v) => {
                        await this.patch((p) => { p.awsRegion = v.trim() || undefined; });
                    });
            });

        new Setting(parent)
            .setName(t('settings.providers.bedrockAuthMode'))
            .setDesc(t('settings.providers.bedrockAuthModeDesc'))
            .addDropdown((dd) => {
                dd.addOption('api-key', 'API key (bearer)');
                dd.addOption('access-key', 'Access key + secret');
                dd.setValue(provider.awsAuthMode ?? 'api-key');
                dd.onChange(async (v) => {
                    await this.patch((p) => { p.awsAuthMode = v as 'api-key' | 'access-key'; });
                    this.render(); // re-render to swap key fields
                });
            });

        if ((provider.awsAuthMode ?? 'api-key') === 'api-key') {
            new Setting(parent)
                .setName(t('settings.providers.bedrockApiKey'))
                .addText((text) => {
                    text.inputEl.type = 'password';
                    text.setValue(provider.awsApiKey ?? '')
                        .onChange(async (v) => {
                            await this.patch((p) => { p.awsApiKey = v || undefined; });
                        });
                });
        } else {
            new Setting(parent)
                .setName(t('settings.providers.bedrockAccessKey'))
                .addText((text) => {
                    text.inputEl.type = 'password';
                    text.setValue(provider.awsAccessKey ?? '')
                        .onChange(async (v) => {
                            await this.patch((p) => { p.awsAccessKey = v || undefined; });
                        });
                });
            new Setting(parent)
                .setName(t('settings.providers.bedrockSecretKey'))
                .addText((text) => {
                    text.inputEl.type = 'password';
                    text.setValue(provider.awsSecretKey ?? '')
                        .onChange(async (v) => {
                            await this.patch((p) => { p.awsSecretKey = v || undefined; });
                        });
                });
        }
    }

    private renderDiscoverySection(parent: HTMLElement, provider: ProviderConfig): void {
        const count = provider.discoveredModels?.length ?? 0;
        const stamp = provider.lastRefreshAt
            ? new Date(provider.lastRefreshAt).toLocaleString()
            : '—';
        const desc = count > 0
            ? t('settings.providers.discoveryDesc', { count, stamp })
            : t('settings.providers.discoveryEmpty');

        const setting = new Setting(parent)
            .setName(t('settings.providers.discovery'))
            .setDesc(desc);

        setting.addButton((btn) => {
            btn.setButtonText(t('settings.providers.refresh'))
                .setCta()
                .onClick(async () => {
                    const discovery = this.plugin.modelDiscovery;
                    if (!discovery) {
                        new Notice(t('settings.providers.refreshUnavailable'));
                        return;
                    }
                    btn.setDisabled(true).setButtonText(t('settings.providers.refreshing'));
                    try {
                        await discovery.refreshProvider(provider.id);
                        new Notice(t('settings.providers.refreshDone'));
                    } catch (e) {
                        console.warn('[ProviderDetailModal] refresh failed:', e);
                        new Notice(t('settings.providers.refreshFailed', { msg: (e as Error).message }));
                    } finally {
                        this.render();
                    }
                });
        });
    }

    private renderTierSetting(parent: HTMLElement, provider: ProviderConfig, tier: ModelTier): void {
        const setting = new Setting(parent)
            .setName(t(`settings.providers.tier.${tier}`))
            .setDesc(t(`settings.providers.tier.${tier}Desc`));

        // Build current-state hint shown after the dropdown
        const resolvedId = this.resolveTierSlot(provider, tier);
        const isOverride = provider.tierOverrides?.[tier] !== undefined;
        const hintText = !resolvedId
            ? t('settings.providers.tier.empty')
            : isOverride
                ? t('settings.providers.tier.manuallySet')
                : t('settings.providers.tier.autoDetected');

        setting.addDropdown((dd) => {
            // Auto option label: actual model name (NOT "{id}" literal -- FIX-26-03-01)
            const autoSuggested = provider.tierMapping?.[tier];
            const autoLabel = autoSuggested
                ? t('settings.providers.tier.autoLabel', {
                    name: this.displayNameFor(provider, autoSuggested),
                })
                : t('settings.providers.tier.autoEmpty');
            dd.addOption('', autoLabel);

            // Sorted model options: same-tier first, others labelled
            const models = this.sortedModelsForTier(provider, tier);
            for (const m of models) {
                dd.addOption(m.id, this.modelOptionLabel(m, tier));
            }

            dd.setValue(provider.tierOverrides?.[tier] ?? '');
            dd.onChange(async (value) => {
                await this.patch((p) => {
                    p.tierOverrides = p.tierOverrides ?? {};
                    if (!value) {
                        delete p.tierOverrides[tier];
                    } else {
                        p.tierOverrides[tier] = value;
                    }
                });
                this.render();
            });
        });

        // Append a small status line under the row
        const hint = setting.descEl.createDiv({ cls: 'agent-settings-tier-hint' });
        hint.setText(`${hintText}${resolvedId ? ' · ' + this.displayNameFor(provider, resolvedId) : ''}`);
    }

    private resolveTierSlot(provider: ProviderConfig, tier: ModelTier): string | undefined {
        return provider.tierOverrides?.[tier] ?? provider.tierMapping?.[tier];
    }

    private displayNameFor(provider: ProviderConfig, modelId: string): string {
        const m = (provider.discoveredModels ?? []).find((x) => x.id === modelId);
        return m?.displayName ?? modelId;
    }

    private sortedModelsForTier(provider: ProviderConfig, tier: ModelTier): DiscoveredModel[] {
        const all = provider.discoveredModels ?? [];
        const inTier = all.filter((m) => m.autoTier === tier);
        const otherTiers = all.filter((m) => m.autoTier !== tier);
        return [...inTier, ...otherTiers];
    }

    private modelOptionLabel(m: DiscoveredModel, expectedTier: ModelTier): string {
        const base = m.displayName ?? m.id;
        if (!m.autoTier || m.autoTier === expectedTier) return base;
        return `${base}  (${t('settings.providers.tier.differentTier')})`;
    }
}
