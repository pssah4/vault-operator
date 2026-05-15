/**
 * EPIC-26 / FEAT-26-03 -- Provider-only Settings tab.
 *
 * Overview list of providers. One row per provider with:
 *  - Provider name (+ "Active" badge when this is the default)
 *  - Tier summary text (e.g. "12 models · Opus / Sonnet / Haiku")
 *  - Star button to set as active
 *  - Enable toggle
 *  - Cog button to open the per-provider configuration modal
 *
 * All detail configuration (auth, refresh, tier mapping, remove) lives
 * in `ProviderDetailModal.ts`. Visual design follows Obsidian's native
 * Setting API to match the rest of the settings pages.
 */

import { App, Notice, setIcon, Setting } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { ModelTier, ProviderConfig, ProviderType } from '../../types/settings';
import { PROVIDER_LABELS } from './constants';
import { ProviderDetailModal } from './ProviderDetailModal';
import { t } from '../../i18n';

const CLOUD_PROVIDER_TYPES: ProviderType[] = [
    'anthropic', 'openai', 'gemini', 'openrouter', 'azure', 'bedrock',
];
const OAUTH_PROVIDER_TYPES: ProviderType[] = ['github-copilot', 'chatgpt-oauth'];
const LOCAL_PROVIDER_TYPES: ProviderType[] = ['ollama', 'lmstudio', 'custom'];
const ALL_PROVIDER_TYPES: ProviderType[] = [
    ...CLOUD_PROVIDER_TYPES,
    ...OAUTH_PROVIDER_TYPES,
    ...LOCAL_PROVIDER_TYPES,
    'kilo-gateway',
];

export class ProvidersTab {
    constructor(
        private readonly plugin: ObsidianAgentPlugin,
        private readonly app: App,
        private readonly rerender: () => void,
    ) {}

    build(containerEl: HTMLElement): void {
        // Intro banner -- matches the McpTab pattern
        const intro = containerEl.createDiv({ cls: 'agent-settings-info-banner' });
        const introIcon = intro.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(introIcon, 'server');
        const introText = intro.createDiv({ cls: 'agent-settings-info-text' });
        introText.createEl('strong', { text: t('settings.providers.title') });
        introText.createDiv({ text: t('settings.providers.intro') });

        const providers = this.plugin.settings.providerConfigs ?? [];

        // Provider list (one Setting row per provider). When list is empty
        // we skip the list and surface the "add provider" picker only.
        if (providers.length > 0) {
            for (const p of providers) {
                this.renderProviderRow(containerEl, p);
            }
        } else {
            containerEl.createEl('p', {
                cls: 'agent-settings-desc',
                text: t('settings.providers.empty'),
            });
        }

        // Add provider picker -- always at the bottom of the list
        this.renderAddProviderRow(containerEl);
    }

    private renderProviderRow(containerEl: HTMLElement, provider: ProviderConfig): void {
        const isActive = this.plugin.settings.activeProviderId === provider.id;
        const label = provider.displayName ?? this.providerLabel(provider.type);

        const setting = new Setting(containerEl)
            .setName(this.renderRowName(label, isActive))
            .setDesc(this.renderRowSummary(provider));

        // Star/radio: set as active. Filled star = currently active.
        setting.addExtraButton((btn) => {
            btn.setIcon(isActive ? 'star' : 'star-off')
                .setTooltip(isActive
                    ? t('settings.providers.activeBadge')
                    : t('settings.providers.activeLabel'))
                .onClick(async () => {
                    if (!provider.enabled) {
                        new Notice(t('settings.providers.rowSummaryDisabled'));
                        return;
                    }
                    this.plugin.settings.activeProviderId = isActive ? null : provider.id;
                    await this.plugin.saveSettings();
                    this.rerender();
                });
        });

        // Enable toggle
        setting.addToggle((toggle) => {
            toggle.setValue(provider.enabled).onChange(async (v) => {
                provider.enabled = v;
                if (!v && this.plugin.settings.activeProviderId === provider.id) {
                    // Disabling the active provider clears the activeProviderId.
                    this.plugin.settings.activeProviderId = null;
                }
                await this.plugin.saveSettings();
                this.rerender();
            });
        });

        // Cog button: open detail modal
        setting.addExtraButton((btn) => {
            btn.setIcon('settings-2')
                .setTooltip(t('settings.providers.configure'))
                .onClick(() => {
                    new ProviderDetailModal(
                        this.app,
                        this.plugin,
                        provider.id,
                        () => this.rerender(),
                    ).open();
                });
        });
    }

    private renderRowName(label: string, isActive: boolean): DocumentFragment {
        // Use a DocumentFragment so we can mix text + a styled "Active" badge.
        const frag = document.createDocumentFragment();
        frag.createSpan({ text: label });
        if (isActive) {
            const badge = frag.createSpan({
                cls: 'agent-provider-active-badge',
                text: t('settings.providers.activeBadge'),
            });
            badge.style.setProperty('margin-left', '0.5em');
        }
        return frag;
    }

    private renderRowSummary(provider: ProviderConfig): string {
        if (!provider.enabled) {
            return t('settings.providers.rowSummaryDisabled');
        }
        const count = provider.discoveredModels?.length ?? 0;
        if (count === 0) {
            return t('settings.providers.rowSummaryEmpty');
        }
        return t('settings.providers.rowSummary', {
            count,
            flagship: this.tierShortLabel(provider, 'flagship'),
            mid: this.tierShortLabel(provider, 'mid'),
            fast: this.tierShortLabel(provider, 'fast'),
        });
    }

    private tierShortLabel(provider: ProviderConfig, tier: ModelTier): string {
        const id = provider.tierOverrides?.[tier] ?? provider.tierMapping?.[tier];
        if (!id) return '—';
        const m = (provider.discoveredModels ?? []).find((x) => x.id === id);
        return m?.displayName ?? id;
    }

    private renderAddProviderRow(containerEl: HTMLElement): void {
        const setting = new Setting(containerEl)
            .setName(t('settings.providers.addProviderLabel'))
            .setDesc(t('settings.providers.addProviderDesc'));

        let pickerValue: ProviderType | '' = '';
        setting.addDropdown((dd) => {
            dd.addOption('', t('settings.providers.choosePicker'));
            for (const type of ALL_PROVIDER_TYPES) {
                dd.addOption(type, this.providerLabel(type));
            }
            dd.setValue('');
            dd.onChange((v) => { pickerValue = (v as ProviderType | ''); });
        });

        setting.addButton((btn) => {
            btn.setButtonText(t('settings.providers.addProvider'))
                .setCta()
                .onClick(async () => {
                    if (!pickerValue) return;
                    const id = this.allocateInstanceId(pickerValue);
                    const provider: ProviderConfig = {
                        id,
                        type: pickerValue,
                        displayName: this.providerLabel(pickerValue),
                        enabled: true,
                        discoveredModels: [],
                        lastRefreshAt: 0,
                        tierMapping: {},
                        tierOverrides: {},
                    };
                    this.plugin.settings.providerConfigs = [
                        ...(this.plugin.settings.providerConfigs ?? []),
                        provider,
                    ];
                    // First provider becomes active automatically.
                    if (this.plugin.settings.activeProviderId === null) {
                        this.plugin.settings.activeProviderId = id;
                    }
                    await this.plugin.saveSettings();
                    this.rerender();
                    // Open detail modal so the user can immediately add credentials.
                    new ProviderDetailModal(
                        this.app,
                        this.plugin,
                        id,
                        () => this.rerender(),
                    ).open();
                });
        });
    }

    private allocateInstanceId(type: ProviderType): string {
        const existing = new Set((this.plugin.settings.providerConfigs ?? []).map((p) => p.id));
        const base = `${type}-main`;
        if (!existing.has(base)) return base;
        let n = 2;
        while (existing.has(`${type}-${n}`)) n++;
        return `${type}-${n}`;
    }

    private providerLabel(type: ProviderType): string {
        return PROVIDER_LABELS[type] ?? type;
    }
}
