/**
 * EPIC-26 / FEAT-26-03 -- provider configuration modal (new + existing).
 *
 * Mirrors the legacy ModelConfigModal pattern:
 *  - Draft state held in `form*` fields; nothing persists until the user
 *    clicks Save.
 *  - Provider-type dropdown at the top (changeable both for new entries
 *    and when fixing an existing provider's type).
 *  - Auth fields swap based on provider type.
 *  - Discovery + Tier-mapping sections only show for already-saved
 *    providers (you can't refresh credentials that don't exist yet).
 *  - Save / Cancel buttons in the `.mcm-actions` footer.
 *
 * Constructor takes either an existing `ProviderConfig` or `null` for a
 * fresh entry. Saving a new entry assigns a unique id and appends to
 * `providerConfigs[]`.
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { confirmModal } from '../modals/PromptModal';
import type {
    DiscoveredModel,
    ModelTier,
    ProviderConfig,
    ProviderType,
} from '../../types/settings';
import {
    getDefaultBaseUrlForProvider,
    getProviderBrandLabel,
    getTierBadgeLabel,
} from '../../types/settings';
import { t } from '../../i18n';

const TIER_ORDER: ModelTier[] = ['fast', 'mid', 'flagship'];

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

export class ProviderDetailModal extends Modal {
    private isNew: boolean;
    private originalId: string | null;

    // Draft state (mirrors ModelConfigModal form* pattern)
    private formType: ProviderType;
    private formDisplayName: string;
    private formEnabled: boolean;
    private formApiKey: string;
    private formBaseUrl: string;
    private formApiVersion: string;
    private formAwsRegion: string;
    private formAwsAuthMode: 'api-key' | 'access-key';
    private formAwsApiKey: string;
    private formAwsAccessKey: string;
    private formAwsSecretKey: string;
    private formAwsSessionToken: string;

    // Snapshots that don't get edited via the form (only via Refresh / tier dropdown)
    private discoveredModels: DiscoveredModel[];
    private lastRefreshAt: number;
    private tierMapping: ProviderConfig['tierMapping'];
    private tierOverrides: ProviderConfig['tierOverrides'];

    constructor(
        app: App,
        private readonly plugin: ObsidianAgentPlugin,
        provider: ProviderConfig | null,
        private readonly onAfterChange: () => void,
    ) {
        super(app);
        this.isNew = provider === null;
        this.originalId = provider?.id ?? null;
        const seed = provider ?? this.defaultDraftProvider();
        this.formType = seed.type;
        this.formDisplayName = seed.displayName ?? '';
        this.formEnabled = seed.enabled;
        this.formApiKey = seed.apiKey ?? '';
        this.formBaseUrl = seed.baseUrl ?? '';
        this.formApiVersion = seed.apiVersion ?? '';
        this.formAwsRegion = seed.awsRegion ?? '';
        this.formAwsAuthMode = seed.awsAuthMode ?? 'api-key';
        this.formAwsApiKey = seed.awsApiKey ?? '';
        this.formAwsAccessKey = seed.awsAccessKey ?? '';
        this.formAwsSecretKey = seed.awsSecretKey ?? '';
        this.formAwsSessionToken = seed.awsSessionToken ?? '';
        this.discoveredModels = seed.discoveredModels ?? [];
        this.lastRefreshAt = seed.lastRefreshAt ?? 0;
        this.tierMapping = { ...(seed.tierMapping ?? {}) };
        this.tierOverrides = { ...(seed.tierOverrides ?? {}) };
    }

    private defaultDraftProvider(): ProviderConfig {
        return {
            id: '',
            type: 'anthropic',
            displayName: '',
            enabled: true,
            discoveredModels: [],
            lastRefreshAt: 0,
            tierMapping: {},
            tierOverrides: {},
        };
    }

    onOpen(): void {
        this.render();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    // ── Render ─────────────────────────────────────────────────────────

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('model-config-modal');

        contentEl.createEl('h3', {
            cls: 'modal-title',
            text: this.isNew
                ? t('settings.providers.modal.titleNew')
                : t('settings.providers.modal.title', {
                    name: this.formDisplayName || getProviderBrandLabel(this.formType),
                }),
        });

        const form = contentEl.createDiv('mcm-form');

        // ── Identity section ─────────────────────────────────────────────
        this.mkSection(form, t('settings.providers.modal.section.identity'));

        // Provider type dropdown (always shown -- legacy parity).
        const provRow = this.mkRow(form, t('settings.providers.modal.providerType'));
        const provSelect = provRow.createEl('select', { cls: 'mcm-select' });
        for (const type of ALL_PROVIDER_TYPES) {
            provSelect.createEl('option', { value: type, text: getProviderBrandLabel(type) });
        }
        provSelect.value = this.formType;
        provSelect.addEventListener('change', () => {
            const previous = this.formType;
            this.formType = provSelect.value as ProviderType;
            // Carry the user's overridden baseUrl across if they had set one;
            // otherwise let it default to the new type's recommended URL.
            const prevDefault = getDefaultBaseUrlForProvider(previous) ?? '';
            if (!this.formBaseUrl || this.formBaseUrl === prevDefault) {
                this.formBaseUrl = '';
            }
            this.render();
        });

        const dnRow = this.mkRow(
            form,
            t('settings.providers.modal.displayName'),
            t('settings.providers.modal.displayNameDesc'),
        );
        const dnInput = dnRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'text', placeholder: getProviderBrandLabel(this.formType) },
        });
        dnInput.value = this.formDisplayName;
        dnInput.addEventListener('input', () => { this.formDisplayName = dnInput.value; });

        const enabledRow = this.mkRow(form, t('settings.providers.enabled'));
        const enabledLabel = enabledRow.createEl('label', { cls: 'mc-toggle' });
        const enabledInput = enabledLabel.createEl('input', { attr: { type: 'checkbox' } });
        enabledLabel.createSpan({ cls: 'mc-toggle-track' });
        enabledInput.checked = this.formEnabled;
        enabledInput.addEventListener('change', () => { this.formEnabled = enabledInput.checked; });

        // ── Authentication section ──────────────────────────────────────
        this.mkSection(form, t('settings.providers.modal.section.auth'));
        this.renderAuthSection(form);

        // Discovery + Tier mapping only when the provider already exists
        // (you can't refresh a draft and tier-mapping needs discovered models).
        if (!this.isNew) {
            this.mkSection(form, t('settings.providers.modal.section.discovery'));
            this.renderDiscoverySection(form);

            this.mkSection(form, t('settings.providers.modal.section.tiers'));
            for (const tier of TIER_ORDER) {
                this.renderTierRow(form, tier);
            }
            // Surface the advisor-pattern warning ONLY when the provider has
            // actually discovered models (i.e. Refresh ran). Without models
            // every tier is naturally empty and the warning is misleading --
            // a "Refresh to populate tiers" hint is shown instead.
            if (this.discoveredModels.length === 0) {
                form.createDiv({
                    cls: 'mcm-row mcm-hint',
                    text: t('settings.providers.modal.tiersAfterRefresh'),
                });
            } else if (!this.resolveDraftTierSlot('flagship')) {
                const warn = form.createDiv({ cls: 'mcm-row mcm-warn' });
                const icon = warn.createSpan({ cls: 'mcm-warn-icon' });
                setIcon(icon, 'alert-triangle');
                warn.createSpan({ text: ' ' + t('settings.providers.advisorDisabled') });
            }

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
            removeBtn.addEventListener('click', () => { void this.handleRemove(); });
        } else {
            // For a draft: hint that discovery + tiers come after Save.
            this.mkSection(form, t('settings.providers.modal.section.discovery'));
            form.createDiv({
                cls: 'mcm-row mcm-hint',
                text: t('settings.providers.modal.discoveryAfterSave'),
            });
        }

        // ── Footer actions ─────────────────────────────────────────────
        const actions = contentEl.createDiv('mcm-actions');
        const cancelBtn = actions.createEl('button', {
            text: t('settings.providers.modal.cancel'),
        });
        cancelBtn.addEventListener('click', () => this.close());
        const saveBtn = actions.createEl('button', {
            cls: 'mod-cta',
            text: this.isNew
                ? t('settings.providers.modal.addProvider')
                : t('settings.providers.modal.save'),
        });
        saveBtn.addEventListener('click', () => { void this.handleSave(); });
    }

    // ── Save / Remove ─────────────────────────────────────────────────

    private async handleSave(): Promise<void> {
        const trimmedDisplayName = this.formDisplayName.trim() || getProviderBrandLabel(this.formType);
        const list = [...(this.plugin.settings.providerConfigs ?? [])];
        // Capture whether credentials moved so we know to auto-refresh after Save.
        const credsChanged = this.isNew || this.hasUnsavedAuthChanges();

        if (this.isNew) {
            const id = this.allocateInstanceId(this.formType);
            const provider: ProviderConfig = {
                id,
                type: this.formType,
                displayName: trimmedDisplayName,
                enabled: this.formEnabled,
                apiKey: this.formApiKey.trim() || undefined,
                baseUrl: this.formBaseUrl.trim() || undefined,
                apiVersion: this.formApiVersion.trim() || undefined,
                awsRegion: this.formAwsRegion.trim() || undefined,
                awsAuthMode: this.formAwsAuthMode,
                awsApiKey: this.formAwsApiKey.trim() || undefined,
                awsAccessKey: this.formAwsAccessKey.trim() || undefined,
                awsSecretKey: this.formAwsSecretKey.trim() || undefined,
                awsSessionToken: this.formAwsSessionToken.trim() || undefined,
                discoveredModels: [],
                lastRefreshAt: 0,
                tierMapping: {},
                tierOverrides: {},
            };
            list.push(provider);
            this.plugin.settings.providerConfigs = list;
            // First provider becomes active automatically.
            if (this.plugin.settings.activeProviderId === null) {
                this.plugin.settings.activeProviderId = id;
            }
            await this.plugin.saveSettings();
            this.onAfterChange();
            // Flip to existing-mode so the modal now shows Discovery + Tiers
            // and the user can verify auto-discovery before closing.
            this.isNew = false;
            this.originalId = id;
            this.render();
            await this.maybeAutoRefresh(id, trimmedDisplayName, credsChanged);
            return;
        }

        // Existing -- update in-place by originalId.
        const idx = list.findIndex((p) => p.id === this.originalId);
        if (idx < 0) {
            new Notice(t('settings.providers.modal.notFound'));
            this.close();
            return;
        }
        list[idx] = {
            ...list[idx],
            type: this.formType,
            displayName: trimmedDisplayName,
            enabled: this.formEnabled,
            apiKey: this.formApiKey.trim() || undefined,
            baseUrl: this.formBaseUrl.trim() || undefined,
            apiVersion: this.formApiVersion.trim() || undefined,
            awsRegion: this.formAwsRegion.trim() || undefined,
            awsAuthMode: this.formAwsAuthMode,
            awsApiKey: this.formAwsApiKey.trim() || undefined,
            awsAccessKey: this.formAwsAccessKey.trim() || undefined,
            awsSecretKey: this.formAwsSecretKey.trim() || undefined,
            awsSessionToken: this.formAwsSessionToken.trim() || undefined,
            tierMapping: this.tierMapping,
            tierOverrides: this.tierOverrides,
        };
        this.plugin.settings.providerConfigs = list;
        await this.plugin.saveSettings();
        this.onAfterChange();
        if (credsChanged && this.originalId) {
            this.render(); // keep modal open while we refresh
            await this.maybeAutoRefresh(this.originalId, trimmedDisplayName, true);
            return;
        }
        this.close();
    }

    /**
     * Background-refresh after a Save that changed credentials (or after a
     * fresh provider was created). Keeps the modal open while running so
     * the user sees the discovered model count + tier population without
     * a separate Refresh click.
     */
    private async maybeAutoRefresh(providerId: string, displayName: string, credsChanged: boolean): Promise<void> {
        if (!credsChanged) return;
        if (!this.hasAnyCredentials()) return; // no point firing a doomed call
        const discovery = this.plugin.modelDiscovery;
        if (!discovery) return;

        new Notice(t('settings.providers.modal.autoFetching', { name: displayName }));
        try {
            const result = await discovery.refreshProvider(providerId);
            // Sync the local draft snapshot so the re-render shows the
            // freshly-discovered models + tier mapping immediately.
            const persisted = (this.plugin.settings.providerConfigs ?? []).find((p) => p.id === providerId);
            this.discoveredModels = result;
            this.lastRefreshAt = persisted?.lastRefreshAt ?? Date.now();
            this.tierMapping = { ...(persisted?.tierMapping ?? {}) };
            this.onAfterChange();
            new Notice(t('settings.providers.modal.autoFetched', {
                count: result.length,
                name: displayName,
            }));
            this.render();
        } catch (e) {
            console.warn('[ProviderDetailModal] auto-refresh failed:', e);
            new Notice(t('settings.providers.modal.autoFetchFailed', {
                msg: (e as Error).message,
            }));
        }
    }

    /** True when at least one credential field has a non-empty value (auth-mode-aware). */
    private hasAnyCredentials(): boolean {
        if (LOCAL_PROVIDER_TYPES.includes(this.formType)) {
            return !!this.formBaseUrl.trim();
        }
        if (this.formType === 'bedrock') {
            return this.formAwsAuthMode === 'api-key'
                ? !!this.formAwsApiKey.trim()
                : !!this.formAwsAccessKey.trim() && !!this.formAwsSecretKey.trim();
        }
        if (OAUTH_PROVIDER_TYPES.includes(this.formType)) {
            return (this.formType === 'github-copilot' && !!this.plugin.settings.githubCopilotAccessToken)
                || (this.formType === 'chatgpt-oauth' && !!this.plugin.settings.chatgptOAuthAccessToken);
        }
        return !!this.formApiKey.trim();
    }

    private async handleRemove(): Promise<void> {
        const ok = await confirmModal(this.app, {
            title: t('settings.providers.removeProvider'),
            message: t('settings.providers.removeConfirm', {
                name: this.formDisplayName || getProviderBrandLabel(this.formType),
            }),
            confirmLabel: t('settings.providers.remove'),
            destructive: true,
        });
        if (!ok) return;
        const list = this.plugin.settings.providerConfigs ?? [];
        this.plugin.settings.providerConfigs = list.filter((p) => p.id !== this.originalId);
        if (this.plugin.settings.activeProviderId === this.originalId) {
            this.plugin.settings.activeProviderId = null;
        }
        await this.plugin.saveSettings();
        this.onAfterChange();
        this.close();
    }

    private allocateInstanceId(type: ProviderType): string {
        const existing = new Set((this.plugin.settings.providerConfigs ?? []).map((p) => p.id));
        const base = `${type}-main`;
        if (!existing.has(base)) return base;
        let n = 2;
        while (existing.has(`${type}-${n}`)) n++;
        return `${type}-${n}`;
    }

    // ── Auth rendering ─────────────────────────────────────────────────

    private renderAuthSection(form: HTMLElement): void {
        if (OAUTH_PROVIDER_TYPES.includes(this.formType)) {
            this.renderOAuthAuth(form);
            return;
        }
        if (this.formType === 'bedrock') {
            this.renderBedrockAuth(form);
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
        akInput.value = this.formApiKey;
        akInput.addEventListener('input', () => { this.formApiKey = akInput.value; });

        const defaultBaseUrl = getDefaultBaseUrlForProvider(this.formType) ?? '';
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
        buInput.value = this.formBaseUrl;
        buInput.addEventListener('input', () => { this.formBaseUrl = buInput.value; });

        if (this.formType === 'azure') {
            const avRow = this.mkRow(
                form,
                t('settings.providers.apiVersion'),
                t('settings.providers.apiVersionDesc'),
            );
            const avInput = avRow.createEl('input', {
                cls: 'mcm-input',
                attr: { type: 'text', placeholder: '2024-10-21' },
            });
            avInput.value = this.formApiVersion;
            avInput.addEventListener('input', () => { this.formApiVersion = avInput.value; });
        }
    }

    private renderOAuthAuth(form: HTMLElement): void {
        const isAuthed = (this.formType === 'github-copilot' && !!this.plugin.settings.githubCopilotAccessToken)
            || (this.formType === 'chatgpt-oauth' && !!this.plugin.settings.chatgptOAuthAccessToken);
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
            // OAuth flow still lives in the legacy ModelConfigModal; redirect
            // there for now. Tokens persist at the plugin-settings level so
            // they're picked up by isAuthed on next render.
            new Notice(t('settings.providers.oauthSignInRedirect'));
            this.plugin.openSettingsAt('agent', 'models');
            this.close();
        });
    }

    private renderBedrockAuth(form: HTMLElement): void {
        const regRow = this.mkRow(
            form,
            t('settings.providers.bedrockRegion'),
            t('settings.providers.bedrockRegionDesc'),
        );
        const regInput = regRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'text', placeholder: 'AWS region (eu-central-1)' },
        });
        regInput.value = this.formAwsRegion;
        regInput.addEventListener('input', () => { this.formAwsRegion = regInput.value; });

        const modeRow = this.mkRow(
            form,
            t('settings.providers.bedrockAuthMode'),
            t('settings.providers.bedrockAuthModeDesc'),
        );
        const modeSelect = modeRow.createEl('select', { cls: 'mcm-select' });
        modeSelect.createEl('option', { value: 'api-key', text: 'API key (bearer)' });
        modeSelect.createEl('option', { value: 'access-key', text: 'Access key + secret' });
        modeSelect.value = this.formAwsAuthMode;
        modeSelect.addEventListener('change', () => {
            this.formAwsAuthMode = modeSelect.value as 'api-key' | 'access-key';
            this.render();
        });

        if (this.formAwsAuthMode === 'api-key') {
            const akRow = this.mkRow(form, t('settings.providers.bedrockApiKey'));
            const akInput = akRow.createEl('input', {
                cls: 'mcm-input',
                attr: { type: 'password' },
            });
            akInput.value = this.formAwsApiKey;
            akInput.addEventListener('input', () => { this.formAwsApiKey = akInput.value; });
        } else {
            const akRow = this.mkRow(form, t('settings.providers.bedrockAccessKey'));
            const akInput = akRow.createEl('input', {
                cls: 'mcm-input',
                attr: { type: 'password' },
            });
            akInput.value = this.formAwsAccessKey;
            akInput.addEventListener('input', () => { this.formAwsAccessKey = akInput.value; });

            const skRow = this.mkRow(form, t('settings.providers.bedrockSecretKey'));
            const skInput = skRow.createEl('input', {
                cls: 'mcm-input',
                attr: { type: 'password' },
            });
            skInput.value = this.formAwsSecretKey;
            skInput.addEventListener('input', () => { this.formAwsSecretKey = skInput.value; });
        }
    }

    // ── Discovery (existing providers only) ────────────────────────────

    private renderDiscoverySection(form: HTMLElement): void {
        const count = this.discoveredModels.length;
        const stamp = this.lastRefreshAt
            ? new Date(this.lastRefreshAt).toLocaleString()
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
            // Refresh persists immediately on the SAVED provider entry; the
            // user's unsaved auth edits in this draft are NOT sent because
            // we must call refresh against the committed credentials. Warn
            // when the draft drifts from the persisted state.
            if (!this.originalId) return;
            if (this.hasUnsavedAuthChanges()) {
                const ok = await confirmModal(this.app, {
                    title: t('settings.providers.refresh'),
                    message: t('settings.providers.modal.refreshDirtyConfirm'),
                    confirmLabel: t('settings.providers.refresh'),
                });
                if (!ok) return;
            }
            const discovery = this.plugin.modelDiscovery;
            if (!discovery) {
                new Notice(t('settings.providers.refreshUnavailable'));
                return;
            }
            refreshBtn.disabled = true;
            refreshBtn.setText(t('settings.providers.refreshing'));
            try {
                const result = await discovery.refreshProvider(this.originalId);
                this.discoveredModels = result;
                const persisted = (this.plugin.settings.providerConfigs ?? []).find((p) => p.id === this.originalId);
                this.lastRefreshAt = persisted?.lastRefreshAt ?? Date.now();
                this.tierMapping = { ...(persisted?.tierMapping ?? {}) };
                new Notice(t('settings.providers.refreshDone'));
            } catch (e) {
                console.warn('[ProviderDetailModal] refresh failed:', e);
                new Notice(t('settings.providers.refreshFailed', { msg: (e as Error).message }));
            } finally {
                this.render();
            }
        })(); });
    }

    private hasUnsavedAuthChanges(): boolean {
        const persisted = (this.plugin.settings.providerConfigs ?? []).find((p) => p.id === this.originalId);
        if (!persisted) return false;
        return (persisted.apiKey ?? '') !== this.formApiKey.trim()
            || (persisted.baseUrl ?? '') !== this.formBaseUrl.trim()
            || (persisted.apiVersion ?? '') !== this.formApiVersion.trim()
            || (persisted.awsApiKey ?? '') !== this.formAwsApiKey.trim()
            || (persisted.awsAccessKey ?? '') !== this.formAwsAccessKey.trim()
            || (persisted.awsSecretKey ?? '') !== this.formAwsSecretKey.trim();
    }

    // ── Tier mapping (existing providers only) ─────────────────────────

    private renderTierRow(form: HTMLElement, tier: ModelTier): void {
        const resolvedId = this.resolveDraftTierSlot(tier);
        const isOverride = this.tierOverrides?.[tier] !== undefined;
        const hint = !resolvedId
            ? t('settings.providers.tier.empty')
            : isOverride
                ? t('settings.providers.tier.manuallySet')
                : t('settings.providers.tier.autoDetected');
        const descLines = [
            t(`settings.providers.tier.${tier}Desc`),
            resolvedId ? `${hint} · ${this.displayNameForId(resolvedId)}` : hint,
        ].join(' — ');

        const row = form.createDiv('mcm-row');
        const labelEl = row.createDiv('mcm-label');
        const labelLine = labelEl.createSpan({ cls: 'mcm-label-line' });
        labelLine.createSpan({ text: t(`settings.providers.tier.${tier}`) });
        const badge = labelLine.createSpan({
            cls: `chat-model-picker-tier chat-model-picker-tier-${tier}`,
            text: getTierBadgeLabel(tier),
        });
        badge.setAttr('aria-label', `tier: ${getTierBadgeLabel(tier)}`);
        labelEl.createSpan({ text: descLines, cls: 'mcm-desc' });

        const select = row.createEl('select', { cls: 'mcm-select' });

        const autoSuggested = this.tierMapping?.[tier];
        const autoLabel = autoSuggested
            ? t('settings.providers.tier.autoLabel', {
                name: this.displayNameForId(autoSuggested),
            })
            : t('settings.providers.tier.autoEmpty');
        select.createEl('option', { value: '', text: autoLabel });

        const models = this.sortedModelsForTier(tier);
        for (const m of models) {
            select.createEl('option', { value: m.id, text: this.modelOptionLabel(m, tier) });
        }
        select.value = this.tierOverrides?.[tier] ?? '';
        select.addEventListener('change', () => {
            this.tierOverrides = { ...this.tierOverrides };
            if (!select.value) delete this.tierOverrides[tier];
            else this.tierOverrides[tier] = select.value;
            this.render();
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private resolveDraftTierSlot(tier: ModelTier): string | undefined {
        return this.tierOverrides?.[tier] ?? this.tierMapping?.[tier];
    }

    private displayNameForId(modelId: string): string {
        const m = this.discoveredModels.find((x) => x.id === modelId);
        return m?.displayName ?? modelId;
    }

    private sortedModelsForTier(tier: ModelTier): DiscoveredModel[] {
        const inTier = this.discoveredModels.filter((m) => m.autoTier === tier);
        const otherTiers = this.discoveredModels.filter((m) => m.autoTier !== tier);
        return [...inTier, ...otherTiers];
    }

    private modelOptionLabel(m: DiscoveredModel, expectedTier: ModelTier): string {
        const base = m.displayName ?? m.id;
        if (!m.autoTier) return base;
        const badge = getTierBadgeLabel(m.autoTier);
        if (m.autoTier === expectedTier) return `[${badge}]  ${base}`;
        return `[${badge}]  ${base}  (${t('settings.providers.tier.differentTier')})`;
    }

    // ── Layout primitives (mirror ModelConfigModal mkRow / mkSection) ─

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
}
