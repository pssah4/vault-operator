/**
 * EPIC-26 / FEAT-26-03 -- Provider-only Settings tab.
 *
 * Overview list of providers using the same `.model-table` row layout as
 * ModelsTab so the two settings pages feel visually consistent. Columns:
 *  - Provider (name + small tier-summary sub-line)
 *  - Key (check icon when credentials set, minus otherwise)
 *  - Enable toggle
 *  - Default radio (which provider drives the chat)
 *  - Actions (cog opens ProviderDetailModal, trash removes)
 *
 * All detail configuration lives in `ProviderDetailModal.ts`.
 */

import { App, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { ModelTier, ProviderConfig, ProviderType } from '../../types/settings';
import { getProviderBrandLabel } from '../../types/settings';
import { ProviderDetailModal } from './ProviderDetailModal';
import { confirmModal } from '../modals/PromptModal';
import { purgeProviderLegacyState } from '../../core/security/providerLegacyPurge';
import { t } from '../../i18n';

const OAUTH_PROVIDER_TYPES: ProviderType[] = ['github-copilot', 'chatgpt-oauth'];
const LOCAL_PROVIDER_TYPES: ProviderType[] = ['ollama', 'lmstudio', 'custom'];

export class ProvidersTab {
    constructor(
        private readonly plugin: ObsidianAgentPlugin,
        private readonly app: App,
        private readonly rerender: () => void,
    ) {}

    build(containerEl: HTMLElement): void {
        // Intro banner -- matches ModelsTab pattern
        const intro = containerEl.createDiv({ cls: 'agent-settings-info-banner' });
        const introIcon = intro.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(introIcon, 'server');
        const introText = intro.createDiv({ cls: 'agent-settings-info-text' });
        introText.createEl('strong', { text: t('settings.providers.title') });
        introText.createDiv({ text: t('settings.providers.intro') });

        // Table with same .model-table layout as ModelsTab for visual parity.
        // The extra `.providers-table` class trims the grid to 5 columns
        // (no Provider column since the row IS a provider).
        const table = containerEl.createDiv('model-table providers-table');
        const header = table.createDiv('model-row model-row-header');
        header.createDiv({ cls: 'mc-name', text: t('settings.providers.headerProvider') });
        header.createDiv({ cls: 'mc-key', text: t('settings.providers.headerKey') });
        header.createDiv({ cls: 'mc-enable', text: t('settings.providers.headerEnable') });
        header.createDiv({ cls: 'mc-default', text: t('settings.providers.headerDefault') });
        header.createDiv({ cls: 'mc-actions' });

        const providers = this.plugin.settings.providerConfigs ?? [];
        if (providers.length === 0) {
            table.createDiv({ cls: 'model-table-empty', text: t('settings.providers.empty') });
        } else {
            for (const p of providers) this.renderProviderRow(table, p);
        }

        // Add provider footer (dropdown picker + button), same shape as ModelsTab footer.
        this.renderAddProviderFooter(containerEl);
    }

    private renderProviderRow(table: HTMLElement, provider: ProviderConfig): void {
        const isActive = this.plugin.settings.activeProviderId === provider.id;
        const hasKey = this.providerHasCredentials(provider);

        const rowCls = [
            'model-row',
            isActive ? 'model-row-active' : '',
            !provider.enabled ? 'model-row-disabled' : '',
        ].filter(Boolean).join(' ');
        const row = table.createDiv(rowCls);

        // Name column: provider label + small tier-summary sub-line
        const nameEl = row.createDiv('mc-name');
        nameEl.createSpan({
            text: provider.displayName ?? this.providerLabel(provider.type),
            cls: 'mc-name-text',
        });
        const summaryText = this.rowSummary(provider);
        if (summaryText) {
            const sub = nameEl.createDiv({ cls: 'mc-name-sub' });
            sub.setText(summaryText);
        }

        // Key indicator
        const keyEl = row.createDiv('mc-key');
        const keyIcon = keyEl.createSpan('mc-key-icon');
        setIcon(keyIcon, hasKey ? 'check' : 'minus');
        keyEl.addClass(hasKey ? 'mc-key-ok' : 'mc-key-missing');

        // Enable toggle (same .mc-toggle markup as ModelsTab)
        const enableEl = row.createDiv('mc-enable');
        const toggleLabel = enableEl.createEl('label', { cls: 'mc-toggle' });
        const toggleInput = toggleLabel.createEl('input', { attr: { type: 'checkbox' } });
        toggleLabel.createSpan({ cls: 'mc-toggle-track' });
        toggleInput.checked = provider.enabled;
        toggleInput.addEventListener('change', () => { void (async () => {
            provider.enabled = toggleInput.checked;
            // If we just disabled the active provider, clear the default.
            if (!toggleInput.checked && this.plugin.settings.activeProviderId === provider.id) {
                this.plugin.settings.activeProviderId = null;
            }
            await this.plugin.saveSettings();
            this.rerender();
        })(); });

        // Default radio
        const defaultEl = row.createDiv('mc-default');
        const defaultRadio = defaultEl.createEl('input', {
            attr: { type: 'radio', name: 'active-provider' },
        });
        defaultRadio.checked = isActive;
        defaultRadio.disabled = !provider.enabled;
        defaultRadio.addEventListener('change', () => { void (async () => {
            if (defaultRadio.checked) {
                this.plugin.settings.activeProviderId = provider.id;
                await this.plugin.saveSettings();
                this.rerender();
            }
        })(); });

        // Actions: gear (configure) + trash (remove)
        const actionsEl = row.createDiv('mc-actions');

        const configBtn = actionsEl.createEl('button', {
            cls: 'mc-action-btn',
            attr: { title: t('settings.providers.configure') },
        });
        setIcon(configBtn, 'settings');
        configBtn.addEventListener('click', () => {
            new ProviderDetailModal(
                this.app,
                this.plugin,
                provider,
                () => this.rerender(),
            ).open();
        });

        const delBtn = actionsEl.createEl('button', {
            cls: 'mc-action-btn mc-action-del',
            attr: { title: t('settings.providers.remove') },
        });
        setIcon(delBtn, 'trash');
        delBtn.addEventListener('click', () => { void (async () => {
            const ok = await confirmModal(this.app, {
                title: t('settings.providers.removeProvider'),
                message: t('settings.providers.removeConfirm', {
                    name: provider.displayName ?? this.providerLabel(provider.type),
                }),
                confirmLabel: t('settings.providers.remove'),
                destructive: true,
            });
            if (!ok) return;
            this.plugin.settings.providerConfigs =
                (this.plugin.settings.providerConfigs ?? []).filter((p) => p.id !== provider.id);
            if (this.plugin.settings.activeProviderId === provider.id) {
                this.plugin.settings.activeProviderId = null;
            }
            // EPIC-26 follow-up: purge plugin-level legacy state for this
            // provider type when no other instance remains.
            purgeProviderLegacyState(this.plugin.settings, provider.type);
            await this.plugin.saveSettings();
            this.rerender();
        })(); });
    }

    private rowSummary(provider: ProviderConfig): string {
        if (!provider.enabled) return t('settings.providers.rowSummaryDisabled');
        const count = provider.discoveredModels?.length ?? 0;
        if (count === 0) return t('settings.providers.rowSummaryEmpty');
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

    private providerHasCredentials(provider: ProviderConfig): boolean {
        if (LOCAL_PROVIDER_TYPES.includes(provider.type)) {
            // Local endpoints don't need a key; a BaseURL counts.
            return !!provider.baseUrl;
        }
        if (provider.type === 'bedrock') {
            return !!provider.awsApiKey || !!(provider.awsAccessKey && provider.awsSecretKey);
        }
        if (OAUTH_PROVIDER_TYPES.includes(provider.type)) {
            return !!provider.oauthToken
                || (provider.type === 'github-copilot' && !!this.plugin.settings.githubCopilotAccessToken)
                || (provider.type === 'chatgpt-oauth' && !!this.plugin.settings.chatgptOAuthAccessToken);
        }
        return !!provider.apiKey;
    }

    private renderAddProviderFooter(containerEl: HTMLElement): void {
        // EPIC-26 / FEAT-26-03 -- simple "+ Add provider" button (matches
        // EmbeddingsTab "+ Add embedding model" pattern). The provider-type
        // picker lives INSIDE the detail modal (mirrors ModelConfigModal
        // legacy where "+ Add model" opens a modal with a Provider dropdown
        // at the top).
        const footer = containerEl.createDiv('model-table-footer');
        const addBtn = footer.createEl('button', {
            cls: 'mod-cta model-add-btn',
            text: '+ ' + t('settings.providers.addProvider'),
        });
        addBtn.addEventListener('click', () => {
            new ProviderDetailModal(
                this.app,
                this.plugin,
                null,                 // null = new-provider draft mode
                () => this.rerender(),
            ).open();
        });
    }

    private providerLabel(type: ProviderType): string {
        return getProviderBrandLabel(type);
    }
}
