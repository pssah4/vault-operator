/**
 * EPIC-26 / FEAT-26-03 -- per-provider configuration modal.
 *
 * Same `.mcm-form` row layout as ModelConfigModal so the two modals feel
 * identical visually. Sections live under `<h4 class="mcm-section">`
 * headers; rows are `.mcm-row` with `.mcm-label` + `.mcm-input` /
 * `.mcm-select` / native toggle. Actions go in `.mcm-actions` at the
 * bottom (Close button only -- changes save on each field-change).
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type {
    DiscoveredModel,
    ModelTier,
    ProviderConfig,
    ProviderType,
} from '../../types/settings';
import { getDefaultBaseUrlForProvider, getProviderBrandLabel } from '../../types/settings';
import { t } from '../../i18n';

const TIER_ORDER: ModelTier[] = ['fast', 'mid', 'flagship'];

const OAUTH_PROVIDER_TYPES: ProviderType[] = ['github-copilot', 'chatgpt-oauth'];

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

    private async patch(mutator: (p: ProviderConfig) => void): Promise<void> {
        const list = this.plugin.settings.providerConfigs ?? [];
        const idx = list.findIndex((p) => p.id === this.providerId);
        if (idx < 0) return;
        mutator(list[idx]);
        await this.plugin.saveSettings();
        this.onAfterChange();
    }

    // ── Row + section helpers (match ModelConfigModal `.mcm-form` pattern) ─

    private mkRow(form: HTMLElement, label: string, desc?: string): HTMLElement {
        const row = form.createDiv('mcm-row');
        const labelEl = row.createDiv('mcm-label');
        labelEl.createSpan({ text: label });
        if (desc) labelEl.createSpan({ text: desc, cls: 'mcm-desc' });
        return row;
    }

    private mkSection(parent: HTMLElement, title: string): void {
        parent.createEl('h4', { cls: 'mcm-section', text: title });
    }

    private render(): void {
        const provider = this.currentProvider();
        if (!provider) {
            this.contentEl.empty();
            this.contentEl.createEl('p', { text: 'Provider not found.' });
            return;
        }
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('model-config-modal');

        contentEl.createEl('h3', {
            cls: 'modal-title',
            text: t('settings.providers.modal.title', {
                name: provider.displayName ?? getProviderBrandLabel(provider.type),
            }),
        });

        const form = contentEl.createDiv('mcm-form');

        // ── Identity section ─────────────────────────────────────────────
        this.mkSection(form, t('settings.providers.modal.section.identity'));

        const dnRow = this.mkRow(
            form,
            t('settings.providers.modal.displayName'),
            t('settings.providers.modal.displayNameDesc'),
        );
        const dnInput = dnRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'text', placeholder: getProviderBrandLabel(provider.type) },
        });
        dnInput.value = provider.displayName ?? '';
        dnInput.addEventListener('change', () => { void this.patch((p) => {
            p.displayName = dnInput.value.trim() || getProviderBrandLabel(p.type);
        }); });

        const enabledRow = this.mkRow(form, t('settings.providers.enabled'));
        const enabledLabel = enabledRow.createEl('label', { cls: 'mc-toggle' });
        const enabledInput = enabledLabel.createEl('input', { attr: { type: 'checkbox' } });
        enabledLabel.createSpan({ cls: 'mc-toggle-track' });
        enabledInput.checked = provider.enabled;
        enabledInput.addEventListener('change', () => { void this.patch((p) => { p.enabled = enabledInput.checked; }); });

        // ── Authentication section ──────────────────────────────────────
        this.mkSection(form, t('settings.providers.modal.section.auth'));
        this.renderAuthSection(form, provider);

        // ── Discovery section ───────────────────────────────────────────
        this.mkSection(form, t('settings.providers.modal.section.discovery'));
        this.renderDiscoverySection(form, provider);

        // ── Tier mapping section ────────────────────────────────────────
        this.mkSection(form, t('settings.providers.modal.section.tiers'));
        for (const tier of TIER_ORDER) {
            this.renderTierRow(form, provider, tier);
        }
        if (!this.resolveTierSlot(provider, 'flagship')) {
            const warn = form.createDiv({ cls: 'mcm-row mcm-warn' });
            const icon = warn.createSpan({ cls: 'mcm-warn-icon' });
            setIcon(icon, 'alert-triangle');
            warn.createSpan({ text: ' ' + t('settings.providers.advisorDisabled') });
        }

        // ── Danger zone ─────────────────────────────────────────────────
        this.mkSection(form, t('settings.providers.modal.section.danger'));
        const dangerRow = this.mkRow(
            form,
            t('settings.providers.removeProvider'),
            t('settings.providers.removeDesc'),
        );
        const removeBtn = dangerRow.createEl('button', {
            cls: 'mcm-btn-danger',
            text: t('settings.providers.removeProvider'),
        });
        removeBtn.addEventListener('click', () => { void (async () => {
            const ok = window.confirm(t('settings.providers.removeConfirm', {
                name: provider.displayName ?? getProviderBrandLabel(provider.type),
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
        })(); });

        // ── Footer actions ─────────────────────────────────────────────
        const actions = contentEl.createDiv('mcm-actions');
        const closeBtn = actions.createEl('button', {
            cls: 'mod-cta',
            text: t('settings.providers.modal.close'),
        });
        closeBtn.addEventListener('click', () => this.close());
    }

    // ── Auth rendering ─────────────────────────────────────────────────

    private renderAuthSection(form: HTMLElement, provider: ProviderConfig): void {
        if (OAUTH_PROVIDER_TYPES.includes(provider.type)) {
            this.renderOAuthAuth(form, provider);
            return;
        }
        if (provider.type === 'bedrock') {
            this.renderBedrockAuth(form, provider);
            return;
        }

        const akRow = this.mkRow(
            form,
            t('settings.providers.apiKey'),
            t('settings.providers.apiKeyDesc'),
        );
        const akInput = akRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'password', placeholder: '••••••' },
        });
        akInput.value = provider.apiKey ?? '';
        akInput.addEventListener('change', () => { void this.patch((p) => {
            p.apiKey = akInput.value.trim() || undefined;
        }); });

        const defaultBaseUrl = getDefaultBaseUrlForProvider(provider.type) ?? '';
        const buRow = this.mkRow(
            form,
            t('settings.providers.baseUrl'),
            t('settings.providers.baseUrlDesc'),
        );
        const buInput = buRow.createEl('input', {
            cls: 'mcm-input',
            attr: {
                type: 'text',
                placeholder: defaultBaseUrl || t('settings.providers.baseUrlSdkDefault'),
            },
        });
        buInput.value = provider.baseUrl ?? '';
        buInput.addEventListener('change', () => { void this.patch((p) => {
            p.baseUrl = buInput.value.trim() || undefined;
        }); });

        if (provider.type === 'azure') {
            const avRow = this.mkRow(
                form,
                t('settings.providers.apiVersion'),
                t('settings.providers.apiVersionDesc'),
            );
            const avInput = avRow.createEl('input', {
                cls: 'mcm-input',
                attr: { type: 'text', placeholder: '2024-10-21' },
            });
            avInput.value = provider.apiVersion ?? '';
            avInput.addEventListener('change', () => { void this.patch((p) => {
                p.apiVersion = avInput.value.trim() || undefined;
            }); });
        }
    }

    private renderOAuthAuth(form: HTMLElement, provider: ProviderConfig): void {
        const isAuthed = !!provider.oauthToken
            || (provider.type === 'github-copilot' && !!this.plugin.settings.githubCopilotAccessToken)
            || (provider.type === 'chatgpt-oauth' && !!this.plugin.settings.chatgptOAuthAccessToken);

        const row = this.mkRow(
            form,
            t('settings.providers.oauthStatus'),
            isAuthed
                ? t('settings.providers.oauthAuthed')
                : t('settings.providers.oauthNotAuthed'),
        );
        const btn = row.createEl('button', {
            cls: 'mod-cta',
            text: isAuthed
                ? t('settings.providers.oauthReauth')
                : t('settings.providers.oauthSignIn'),
        });
        btn.addEventListener('click', () => {
            new Notice(t('settings.providers.oauthSignInRedirect'));
            this.plugin.openSettingsAt('agent', 'models');
            this.close();
        });
    }

    private renderBedrockAuth(form: HTMLElement, provider: ProviderConfig): void {
        const regRow = this.mkRow(
            form,
            t('settings.providers.bedrockRegion'),
            t('settings.providers.bedrockRegionDesc'),
        );
        const regInput = regRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'text', placeholder: 'eu-central-1' },
        });
        regInput.value = provider.awsRegion ?? '';
        regInput.addEventListener('change', () => { void this.patch((p) => {
            p.awsRegion = regInput.value.trim() || undefined;
        }); });

        const modeRow = this.mkRow(
            form,
            t('settings.providers.bedrockAuthMode'),
            t('settings.providers.bedrockAuthModeDesc'),
        );
        const modeSelect = modeRow.createEl('select', { cls: 'mcm-select' });
        modeSelect.createEl('option', { value: 'api-key', text: 'API key (bearer)' });
        modeSelect.createEl('option', { value: 'access-key', text: 'Access key + secret' });
        modeSelect.value = provider.awsAuthMode ?? 'api-key';
        modeSelect.addEventListener('change', () => { void (async () => {
            await this.patch((p) => { p.awsAuthMode = modeSelect.value as 'api-key' | 'access-key'; });
            this.render();
        })(); });

        if ((provider.awsAuthMode ?? 'api-key') === 'api-key') {
            const akRow = this.mkRow(form, t('settings.providers.bedrockApiKey'));
            const akInput = akRow.createEl('input', {
                cls: 'mcm-input',
                attr: { type: 'password' },
            });
            akInput.value = provider.awsApiKey ?? '';
            akInput.addEventListener('change', () => { void this.patch((p) => {
                p.awsApiKey = akInput.value.trim() || undefined;
            }); });
        } else {
            const akRow = this.mkRow(form, t('settings.providers.bedrockAccessKey'));
            const akInput = akRow.createEl('input', {
                cls: 'mcm-input',
                attr: { type: 'password' },
            });
            akInput.value = provider.awsAccessKey ?? '';
            akInput.addEventListener('change', () => { void this.patch((p) => {
                p.awsAccessKey = akInput.value.trim() || undefined;
            }); });

            const skRow = this.mkRow(form, t('settings.providers.bedrockSecretKey'));
            const skInput = skRow.createEl('input', {
                cls: 'mcm-input',
                attr: { type: 'password' },
            });
            skInput.value = provider.awsSecretKey ?? '';
            skInput.addEventListener('change', () => { void this.patch((p) => {
                p.awsSecretKey = skInput.value.trim() || undefined;
            }); });
        }
    }

    // ── Discovery row (count + refresh) ────────────────────────────────

    private renderDiscoverySection(form: HTMLElement, provider: ProviderConfig): void {
        const count = provider.discoveredModels?.length ?? 0;
        const stamp = provider.lastRefreshAt
            ? new Date(provider.lastRefreshAt).toLocaleString()
            : '—';
        const desc = count > 0
            ? t('settings.providers.discoveryDesc', { count, stamp })
            : t('settings.providers.discoveryEmpty');
        const row = this.mkRow(form, t('settings.providers.discovery'), desc);
        const refreshBtn = row.createEl('button', {
            cls: 'mod-cta',
            text: t('settings.providers.refresh'),
        });
        refreshBtn.addEventListener('click', () => { void (async () => {
            const discovery = this.plugin.modelDiscovery;
            if (!discovery) {
                new Notice(t('settings.providers.refreshUnavailable'));
                return;
            }
            refreshBtn.disabled = true;
            refreshBtn.setText(t('settings.providers.refreshing'));
            try {
                await discovery.refreshProvider(provider.id);
                new Notice(t('settings.providers.refreshDone'));
            } catch (e) {
                console.warn('[ProviderDetailModal] refresh failed:', e);
                new Notice(t('settings.providers.refreshFailed', { msg: (e as Error).message }));
            } finally {
                this.render();
            }
        })(); });
    }

    // ── Tier mapping rows ──────────────────────────────────────────────

    private renderTierRow(form: HTMLElement, provider: ProviderConfig, tier: ModelTier): void {
        const resolvedId = this.resolveTierSlot(provider, tier);
        const isOverride = provider.tierOverrides?.[tier] !== undefined;
        const hint = !resolvedId
            ? t('settings.providers.tier.empty')
            : isOverride
                ? t('settings.providers.tier.manuallySet')
                : t('settings.providers.tier.autoDetected');
        const descLines = [
            t(`settings.providers.tier.${tier}Desc`),
            resolvedId ? `${hint} · ${this.displayNameFor(provider, resolvedId)}` : hint,
        ].join(' — ');

        const row = this.mkRow(form, t(`settings.providers.tier.${tier}`), descLines);
        const select = row.createEl('select', { cls: 'mcm-select' });

        const autoSuggested = provider.tierMapping?.[tier];
        const autoLabel = autoSuggested
            ? t('settings.providers.tier.autoLabel', {
                name: this.displayNameFor(provider, autoSuggested),
            })
            : t('settings.providers.tier.autoEmpty');
        select.createEl('option', { value: '', text: autoLabel });

        const models = this.sortedModelsForTier(provider, tier);
        for (const m of models) {
            select.createEl('option', { value: m.id, text: this.modelOptionLabel(m, tier) });
        }
        select.value = provider.tierOverrides?.[tier] ?? '';
        select.addEventListener('change', () => { void (async () => {
            await this.patch((p) => {
                p.tierOverrides = p.tierOverrides ?? {};
                if (!select.value) delete p.tierOverrides[tier];
                else p.tierOverrides[tier] = select.value;
            });
            this.render();
        })(); });
    }

    // ── Pure helpers ───────────────────────────────────────────────────

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
