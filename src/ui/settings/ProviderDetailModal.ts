/**
 * EPIC-26 / FEAT-26-03 -- provider configuration modal (new + existing).
 *
 * Uses Obsidian's native `Setting` API for the form rows so the layout
 * matches the rest of the settings pages (wide info column, description
 * inline next to the name, control on the right). Section headers stay
 * as custom `.mcm-section` markers; action buttons at the bottom stay
 * in a `.mcm-actions` flex bar so Save/Cancel sit together on the right.
 *
 * Draft state lives in `form*` fields; nothing persists until the user
 * clicks Save. Provider-type can be swapped via a dropdown at the top.
 * Discovery + tier-mapping appear only for already-saved providers (a
 * fresh draft has no model list to map).
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { confirmModal } from '../modals/PromptModal';
import type {
    CustomModel,
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
import { purgeProviderLegacyState } from '../../core/security/providerLegacyPurge';
import { GitHubCopilotAuthService } from '../../core/security/GitHubCopilotAuthService';
import { ChatGptOAuthService } from '../../core/auth/ChatGptOAuthService';
import { isOpenAIChatCompletionModel } from './testModelConnection';
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

    // Draft state
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
        // Local providers (ollama, lmstudio) only work with a concrete base URL.
        // The placeholder-only pattern that cloud providers use leaves an empty
        // draft, and Discovery then falls back to the wrong default port. Seed
        // the field with the known local default so Refresh works out-of-the-box.
        this.formBaseUrl = seed.baseUrl
            ?? (this.isNew ? getDefaultBaseUrlForProvider(seed.type) ?? '' : '');
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

    private mkSection(parent: HTMLElement, title: string): void {
        parent.createEl('h4', { cls: 'mcm-section', text: title });
    }

    /**
     * Compact form row matching ModelConfigModal's `.mcm-row` layout
     * (110px label, 1fr control, 12px font). When `desc` is provided,
     * a clean Lucide info-icon sits next to the label; clicking it
     * opens a small popover with the description text at the same
     * size as the settings info-banners (13px). No extra border or
     * background on the icon -- just the `i`-in-circle Lucide glyph
     * in muted color.
     */
    private compactRow(
        parent: HTMLElement,
        opts: { label: string; desc?: string; build: (controlEl: HTMLElement) => void },
    ): HTMLDivElement {
        const row = parent.createDiv('mcm-row');
        const labelEl = row.createDiv('mcm-label');
        const labelLine = labelEl.createDiv('mcm-label-line');
        labelLine.createSpan({ text: opts.label });
        if (opts.desc) {
            const infoBtn = labelLine.createEl('button', {
                cls: 'mcm-info-btn',
                attr: {
                    type: 'button',
                    'aria-label': opts.label + ': info',
                },
            });
            setIcon(infoBtn, 'info');
            infoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openInfoPopover(opts.label, opts.desc!);
            });
        }
        const controlEl = row.createDiv('mcm-control');
        opts.build(controlEl);
        return row;
    }

    /**
     * Open a small info-popover that explains a setting. Title is the
     * setting label, body text matches the size of the settings info-
     * banner (13px) so the visual style stays consistent across
     * inline banners and per-row tooltips.
     */
    private openInfoPopover(title: string, body: string): void {
        const overlay = activeDocument.body.createDiv('mcm-info-overlay');
        const popover = overlay.createDiv('mcm-info-popover');
        const head = popover.createDiv('mcm-info-head');
        head.createSpan({ cls: 'mcm-info-title', text: title });
        const closeBtn = head.createEl('button', {
            cls: 'mcm-info-close',
            attr: { type: 'button', 'aria-label': 'Close' },
        });
        setIcon(closeBtn, 'x');
        popover.createDiv({ cls: 'mcm-info-body', text: body });
        const dismiss = (): void => overlay.remove();
        closeBtn.addEventListener('click', dismiss);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
        activeDocument.addEventListener('keydown', function onKey(e) {
            if (e.key === 'Escape') {
                dismiss();
                activeDocument.removeEventListener('keydown', onKey);
            }
        });
    }

    /** Helper: text/password input matching `.mcm-input` styling. */
    private compactInput(
        parent: HTMLElement,
        opts: {
            type?: 'text' | 'password';
            value: string;
            placeholder?: string;
            onInput: (v: string) => void;
        },
    ): HTMLInputElement {
        const input = parent.createEl('input', {
            cls: 'mcm-input',
            attr: { type: opts.type ?? 'text' },
        });
        input.value = opts.value;
        if (opts.placeholder) input.placeholder = opts.placeholder;
        input.addEventListener('input', () => opts.onInput(input.value));
        return input;
    }

    /** Helper: select dropdown matching `.mcm-select` styling. */
    private compactSelect(
        parent: HTMLElement,
        opts: {
            value: string;
            options: Array<{ value: string; label: string }>;
            onChange: (v: string) => void;
        },
    ): HTMLSelectElement {
        const select = parent.createEl('select', { cls: 'mcm-select' });
        for (const o of opts.options) {
            select.createEl('option', { value: o.value, text: o.label });
        }
        select.value = opts.value;
        select.addEventListener('change', () => opts.onChange(select.value));
        return select;
    }

    /** Helper: native checkbox toggle that visually matches `.mcm-toggle`. */
    private compactToggle(
        parent: HTMLElement,
        opts: { value: boolean; onChange: (v: boolean) => void },
    ): HTMLInputElement {
        const label = parent.createEl('label', { cls: 'mc-toggle' });
        const input = label.createEl('input', { attr: { type: 'checkbox' } });
        label.createSpan({ cls: 'mc-toggle-track' });
        input.checked = opts.value;
        input.addEventListener('change', () => opts.onChange(input.checked));
        return input;
    }

    /** Helper: button matching the compact ModelConfigModal action buttons. */
    private compactButton(
        parent: HTMLElement,
        opts: {
            text: string;
            variant?: 'default' | 'cta' | 'warning';
            onClick: (btn: HTMLButtonElement) => void;
        },
    ): HTMLButtonElement {
        const cls = ['mcm-btn'];
        if (opts.variant === 'cta') cls.push('mod-cta');
        if (opts.variant === 'warning') cls.push('mod-warning');
        const btn = parent.createEl('button', { cls: cls.join(' '), text: opts.text });
        btn.addEventListener('click', () => opts.onClick(btn));
        return btn;
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('model-config-modal', 'provider-detail-modal');

        contentEl.createEl('h3', {
            cls: 'modal-title',
            text: this.isNew
                ? t('settings.providers.modal.titleNew')
                : t('settings.providers.modal.title', {
                    name: this.formDisplayName || getProviderBrandLabel(this.formType),
                }),
        });

        // Wrap the form in `.mcm-form` so row spacing matches
        // ModelConfigModal's compact layout (12px font, 8px gap).
        const form = contentEl.createDiv('mcm-form');

        // ── Identity section ─────────────────────────────────────────────
        this.mkSection(form, t('settings.providers.modal.section.identity'));

        this.compactRow(form, {
            label: t('settings.providers.modal.providerType'),
            build: (ctrl) => this.compactSelect(ctrl, {
                value: this.formType,
                options: ALL_PROVIDER_TYPES.map((type) => ({
                    value: type,
                    label: getProviderBrandLabel(type),
                })),
                onChange: (v) => {
                    const previous = this.formType;
                    this.formType = v as ProviderType;
                    const prevDefault = getDefaultBaseUrlForProvider(previous) ?? '';
                    if (!this.formBaseUrl || this.formBaseUrl === prevDefault) {
                        this.formBaseUrl = LOCAL_PROVIDER_TYPES.includes(this.formType)
                            ? getDefaultBaseUrlForProvider(this.formType) ?? ''
                            : '';
                    }
                    this.render();
                },
            }),
        });

        this.compactRow(form, {
            label: t('settings.providers.modal.displayName'),
            desc: t('settings.providers.modal.displayNameDesc'),
            build: (ctrl) => this.compactInput(ctrl, {
                value: this.formDisplayName,
                placeholder: getProviderBrandLabel(this.formType),
                onInput: (v) => { this.formDisplayName = v; },
            }),
        });

        this.compactRow(form, {
            label: t('settings.providers.enabled'),
            build: (ctrl) => this.compactToggle(ctrl, {
                value: this.formEnabled,
                onChange: (v) => { this.formEnabled = v; },
            }),
        });

        // ── Authentication section ──────────────────────────────────────
        this.mkSection(form, t('settings.providers.modal.section.auth'));
        this.renderAuthSection(form);

        // Discovery + Tier mapping only for already-saved providers.
        if (!this.isNew) {
            this.mkSection(form, t('settings.providers.modal.section.discovery'));
            this.renderDiscoverySection(form);

            this.mkSection(form, t('settings.providers.modal.section.tiers'));
            // Tier-mapping intro infobox -- mirrors the settings-tab info-banner
            // pattern so the user understands what these three slots are for.
            this.renderTierInfoBanner(form);
            for (const tier of TIER_ORDER) {
                this.renderTierRow(form, tier);
            }
            // Advisor-disabled callout when refresh ran but flagship slot is still empty.
            if (this.discoveredModels.length === 0) {
                form.createDiv({
                    cls: 'mcm-hint',
                    text: t('settings.providers.modal.tiersAfterRefresh'),
                });
            } else if (!this.resolveDraftTierSlot('flagship')) {
                const warn = form.createDiv({ cls: 'mcm-warn' });
                const icon = warn.createSpan({ cls: 'mcm-warn-icon' });
                setIcon(icon, 'alert-triangle');
                warn.createSpan({ text: ' ' + t('settings.providers.advisorDisabled') });
            }

            this.mkSection(form, t('settings.providers.modal.section.danger'));
            this.compactRow(form, {
                label: t('settings.providers.removeProvider'),
                desc: t('settings.providers.removeDesc'),
                build: (ctrl) => this.compactButton(ctrl, {
                    text: t('settings.providers.removeProvider'),
                    variant: 'warning',
                    onClick: () => { void this.handleRemove(); },
                }),
            });
        } else {
            this.mkSection(form, t('settings.providers.modal.section.discovery'));
            form.createDiv({
                cls: 'mcm-hint',
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

    // ── Section helpers ───────────────────────────────────────────────

    private renderTierInfoBanner(parent: HTMLElement): void {
        const banner = parent.createDiv({ cls: 'agent-settings-info-banner mcm-info-banner' });
        const icon = banner.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(icon, 'info');
        const text = banner.createDiv({ cls: 'agent-settings-info-text' });
        text.createEl('strong', { text: t('settings.providers.modal.tierInfoTitle') });
        text.createDiv({ text: t('settings.providers.modal.tierInfoBody') });
    }

    // ── Save / Remove / Test ──────────────────────────────────────────

    private async handleSave(): Promise<void> {
        const trimmedDisplayName = this.formDisplayName.trim() || getProviderBrandLabel(this.formType);
        const list = [...(this.plugin.settings.providerConfigs ?? [])];
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
            if (this.plugin.settings.activeProviderId === null) {
                this.plugin.settings.activeProviderId = id;
            }
            await this.plugin.saveSettings();
            this.onAfterChange();
            this.isNew = false;
            this.originalId = id;
            this.render();
            await this.maybeAutoRefresh(id, trimmedDisplayName, credsChanged);
            return;
        }

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
            this.render();
            await this.maybeAutoRefresh(this.originalId, trimmedDisplayName, true);
            return;
        }
        this.close();
    }

    private async maybeAutoRefresh(providerId: string, displayName: string, credsChanged: boolean): Promise<void> {
        if (!credsChanged) return;
        if (!this.hasAnyCredentials()) return;
        const discovery = this.plugin.modelDiscovery;
        if (!discovery) return;
        new Notice(t('settings.providers.modal.autoFetching', { name: displayName }));
        try {
            const result = await discovery.refreshProvider(providerId);
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

    /**
     * EPIC-26 / FEAT-26-03 follow-up -- live credential probe. Builds a
     * CustomModel from the draft (no save required) and runs the existing
     * `testModelConnection` helper that the legacy ModelConfigModal uses.
     * Picks the highest-tier model the provider has discovered so far so
     * the probe exercises a model the user actually intends to use; falls
     * back to the first discovered model when no tier is set yet; falls
     * back further to a provider-default placeholder name for fresh drafts.
     */
    private async handleTestConnection(btn: HTMLButtonElement): Promise<void> {
        if (!this.hasAnyCredentials()) {
            new Notice(t('settings.providers.modal.testNoCreds'));
            return;
        }
        const modelId = this.pickModelForTest();
        const model: CustomModel = {
            name: modelId,
            provider: this.formType,
            displayName: this.formDisplayName || getProviderBrandLabel(this.formType),
            apiKey: this.formApiKey.trim() || undefined,
            baseUrl: this.formBaseUrl.trim() || undefined,
            apiVersion: this.formApiVersion.trim() || undefined,
            enabled: true,
            awsRegion: this.formAwsRegion.trim() || undefined,
            awsAuthMode: this.formAwsAuthMode,
            awsApiKey: this.formAwsApiKey.trim() || undefined,
            awsAccessKey: this.formAwsAccessKey.trim() || undefined,
            awsSecretKey: this.formAwsSecretKey.trim() || undefined,
            awsSessionToken: this.formAwsSessionToken.trim() || undefined,
        };
        btn.disabled = true;
        const originalLabel = btn.getText();
        btn.setText(t('settings.providers.modal.testing'));
        try {
            const { testModelConnection } = await import('./testModelConnection');
            const result = await testModelConnection(model);
            if (result.ok) {
                new Notice(t('settings.providers.modal.testOk', { msg: result.message }));
            } else {
                const detail = result.detail ? ` -- ${result.detail}` : '';
                new Notice(t('settings.providers.modal.testFail', {
                    msg: result.message + detail,
                }));
            }
        } catch (e) {
            console.warn('[ProviderDetailModal] testConnection failed:', e);
            new Notice(t('settings.providers.modal.testFail', { msg: (e as Error).message }));
        } finally {
            btn.disabled = false;
            btn.setText(originalLabel);
        }
    }

    private pickModelForTest(): string {
        // Collect tier candidates in priority order, then fall back to the
        // discovered list. For OpenAI we additionally filter out IDs that
        // are not callable via /v1/chat/completions (realtime, tts, audio,
        // image, search, deep-research, *-pro, *-codex). Without this the
        // test-connection picks a polluted tier entry from before the
        // EXCLUDE_RE was tightened, fires chat.completions, and returns
        // a confusing 404 / 400.
        const candidates: string[] = [];
        for (const tier of (['flagship', 'mid', 'fast'] as ModelTier[])) {
            const id = this.tierOverrides?.[tier] ?? this.tierMapping?.[tier];
            if (id) candidates.push(id);
        }
        for (const m of this.discoveredModels) candidates.push(m.id);
        const accept = this.formType === 'openai'
            ? isOpenAIChatCompletionModel
            : (_: string) => true;
        const picked = candidates.find(accept);
        if (picked) return picked;
        // ChatGPT OAuth has no `/v1/models` endpoint, so the legacy
        // "test-probe" fallback would surface the placeholder to the Codex
        // backend (HTTP 400 "model not found"). Use a known-good Codex model
        // instead so Test Connection still works right after sign-in, before
        // the background discovery has populated tierMapping/discoveredModels.
        if (this.formType === 'chatgpt-oauth') return 'gpt-5';
        // Provider-default placeholder for fresh drafts -- enough to ping the
        // /v1/models endpoint via testModelConnection which calls fetchProviderModels.
        return 'test-probe';
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
        const removedType = this.formType;
        this.plugin.settings.providerConfigs = list.filter((p) => p.id !== this.originalId);
        if (this.plugin.settings.activeProviderId === this.originalId) {
            this.plugin.settings.activeProviderId = null;
        }
        // EPIC-26 follow-up: when the LAST instance of an OAuth / gateway
        // provider type is removed, clear the plugin-level tokens too so
        // the next "Add provider" flow starts fresh. API-key-based
        // providers carry their credentials inside the ProviderConfig
        // entry and are already purged by the filter above.
        purgeProviderLegacyState(this.plugin.settings, removedType);
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

    private renderAuthSection(parent: HTMLElement): void {
        if (OAUTH_PROVIDER_TYPES.includes(this.formType)) {
            this.renderOAuthAuth(parent);
            return;
        }
        if (this.formType === 'bedrock') {
            this.renderBedrockAuth(parent);
            this.renderTestConnectionRow(parent);
            return;
        }

        this.compactRow(parent, {
            label: t('settings.providers.apiKey'),
            desc: t('settings.providers.apiKeyDesc'),
            build: (ctrl) => this.compactInput(ctrl, {
                type: 'password',
                value: this.formApiKey,
                placeholder: '••••••',
                onInput: (v) => { this.formApiKey = v; },
            }),
        });

        const defaultBaseUrl = getDefaultBaseUrlForProvider(this.formType) ?? '';
        this.compactRow(parent, {
            label: t('settings.providers.baseUrl'),
            desc: t('settings.providers.baseUrlDesc'),
            build: (ctrl) => this.compactInput(ctrl, {
                value: this.formBaseUrl,
                placeholder: defaultBaseUrl || t('settings.providers.baseUrlSdkDefault'),
                onInput: (v) => { this.formBaseUrl = v; },
            }),
        });

        if (this.formType === 'azure') {
            this.compactRow(parent, {
                label: t('settings.providers.apiVersion'),
                desc: t('settings.providers.apiVersionDesc'),
                build: (ctrl) => this.compactInput(ctrl, {
                    value: this.formApiVersion,
                    placeholder: '2024-10-21',
                    onInput: (v) => { this.formApiVersion = v; },
                }),
            });
        }

        this.renderTestConnectionRow(parent);
    }

    private renderTestConnectionRow(parent: HTMLElement): void {
        this.compactRow(parent, {
            label: t('settings.providers.modal.testConnection'),
            desc: t('settings.providers.modal.testConnectionDesc'),
            build: (ctrl) => this.compactButton(ctrl, {
                text: t('settings.providers.modal.testConnection'),
                onClick: (btn) => { void this.handleTestConnection(btn); },
            }),
        });
    }

    private renderOAuthAuth(parent: HTMLElement): void {
        const isAuthed = (this.formType === 'github-copilot' && !!this.plugin.settings.githubCopilotAccessToken)
            || (this.formType === 'chatgpt-oauth' && !!this.plugin.settings.chatgptOAuthAccessToken);
        this.compactRow(parent, {
            label: t('settings.providers.oauthStatus'),
            desc: isAuthed
                ? t('settings.providers.oauthAuthed')
                : t('settings.providers.oauthNotAuthed'),
            build: (ctrl) => isAuthed
                ? this.compactButton(ctrl, {
                    text: t('settings.providers.oauthSignOut'),
                    variant: 'warning',
                    onClick: () => { void this.handleOAuthSignOut(); },
                })
                : this.compactButton(ctrl, {
                    text: t('settings.providers.oauthSignIn'),
                    variant: 'cta',
                    onClick: (btn) => { void this.handleOAuthSignIn(btn); },
                }),
        });
        if (this.formType === 'github-copilot') {
            this.compactRow(parent, {
                label: t('settings.providers.copilotClientId'),
                desc: t('settings.providers.copilotClientIdDesc'),
                build: (ctrl) => this.compactInput(ctrl, {
                    value: this.plugin.settings.githubCopilotCustomClientId ?? '',
                    placeholder: t('settings.providers.copilotClientIdPlaceholder'),
                    onInput: (v) => { void (async () => {
                        this.plugin.settings.githubCopilotCustomClientId = v.trim();
                        await this.plugin.saveSettings();
                    })(); },
                }),
            });
        }
        this.renderTestConnectionRow(parent);
    }

    private async handleOAuthSignIn(btn: HTMLButtonElement): Promise<void> {
        btn.disabled = true;
        const originalLabel = btn.getText();
        try {
            if (this.formType === 'github-copilot') {
                await this.runCopilotSignIn(btn);
            } else if (this.formType === 'chatgpt-oauth') {
                await this.runChatGptSignIn(btn);
            }
        } catch (e) {
            console.warn('[ProviderDetailModal] OAuth sign-in failed:', e);
            new Notice(t('settings.providers.oauthSignInFailed', {
                msg: (e as Error).message,
            }));
        } finally {
            btn.disabled = false;
            btn.setText(originalLabel);
            this.render();
        }
    }

    private async runCopilotSignIn(btn: HTMLButtonElement): Promise<void> {
        const authService = GitHubCopilotAuthService.getInstance();
        btn.setText(t('settings.providers.oauthRequestingCode'));
        const flow = await authService.startDeviceFlow();
        new Notice(
            t('settings.providers.oauthDeviceCode', {
                code: flow.userCode,
                url: flow.verificationUri,
            }),
            0,
        );
        window.open(flow.verificationUri);
        btn.setText(t('settings.providers.oauthPolling'));
        await authService.pollForAccessToken(flow.deviceCode, flow.interval);
        new Notice(t('settings.providers.oauthSignedIn'));
    }

    private async runChatGptSignIn(btn: HTMLButtonElement): Promise<void> {
        const auth = ChatGptOAuthService.getInstance();
        if (!auth.isPlatformSupported()) {
            new Notice(t('settings.providers.chatgptUnsupported'));
            return;
        }
        btn.setText(t('settings.providers.oauthRequestingCode'));
        const flow = await auth.startAuthFlow();
        // Force the OS default browser. Obsidian's built-in webview breaks
        // federated logins (Microsoft SSO, Google Workspace); shell.openExternal
        // hands the URL to the OS so it opens in the user's default browser.
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron shell is only loadable via dynamic require in the renderer
        const electron = require('electron') as { shell?: { openExternal: (url: string) => Promise<void> } };
        if (electron.shell?.openExternal) {
            await electron.shell.openExternal(flow.authorizeUrl);
        } else {
            window.open(flow.authorizeUrl);
        }
        btn.setText(t('settings.providers.oauthPolling'));
        await flow.completion;
        new Notice(t('settings.providers.oauthSignedIn'));
    }

    private async handleOAuthSignOut(): Promise<void> {
        try {
            if (this.formType === 'github-copilot') {
                await GitHubCopilotAuthService.getInstance().logout();
            } else if (this.formType === 'chatgpt-oauth') {
                await ChatGptOAuthService.getInstance().logout();
            }
            new Notice(t('settings.providers.oauthSignedOut'));
        } catch (e) {
            console.warn('[ProviderDetailModal] OAuth sign-out failed:', e);
            new Notice(t('settings.providers.oauthSignOutFailed', {
                msg: (e as Error).message,
            }));
        } finally {
            this.render();
        }
    }

    private renderBedrockAuth(parent: HTMLElement): void {
        this.compactRow(parent, {
            label: t('settings.providers.bedrockRegion'),
            desc: t('settings.providers.bedrockRegionDesc'),
            build: (ctrl) => this.compactInput(ctrl, {
                value: this.formAwsRegion,
                placeholder: 'AWS region (eu-central-1)',
                onInput: (v) => { this.formAwsRegion = v; },
            }),
        });

        this.compactRow(parent, {
            label: t('settings.providers.bedrockAuthMode'),
            desc: t('settings.providers.bedrockAuthModeDesc'),
            build: (ctrl) => this.compactSelect(ctrl, {
                value: this.formAwsAuthMode,
                options: [
                    { value: 'api-key', label: 'API key (bearer)' },
                    { value: 'access-key', label: 'Access key + secret' },
                ],
                onChange: (v) => {
                    this.formAwsAuthMode = v as 'api-key' | 'access-key';
                    this.render();
                },
            }),
        });

        if (this.formAwsAuthMode === 'api-key') {
            this.compactRow(parent, {
                label: t('settings.providers.bedrockApiKey'),
                build: (ctrl) => this.compactInput(ctrl, {
                    type: 'password',
                    value: this.formAwsApiKey,
                    onInput: (v) => { this.formAwsApiKey = v; },
                }),
            });
        } else {
            this.compactRow(parent, {
                label: t('settings.providers.bedrockAccessKey'),
                build: (ctrl) => this.compactInput(ctrl, {
                    type: 'password',
                    value: this.formAwsAccessKey,
                    onInput: (v) => { this.formAwsAccessKey = v; },
                }),
            });
            this.compactRow(parent, {
                label: t('settings.providers.bedrockSecretKey'),
                build: (ctrl) => this.compactInput(ctrl, {
                    type: 'password',
                    value: this.formAwsSecretKey,
                    onInput: (v) => { this.formAwsSecretKey = v; },
                }),
            });
        }
    }

    // ── Discovery (existing providers only) ────────────────────────────

    private renderDiscoverySection(parent: HTMLElement): void {
        const count = this.discoveredModels.length;
        const stamp = this.lastRefreshAt
            ? new Date(this.lastRefreshAt).toLocaleString()
            : '—';
        const desc = count > 0
            ? t('settings.providers.discoveryDesc', { count, stamp })
            : t('settings.providers.discoveryEmpty');
        this.compactRow(parent, {
            label: t('settings.providers.discovery'),
            desc,
            build: (ctrl) => this.compactButton(ctrl, {
                text: t('settings.providers.refresh'),
                variant: 'cta',
                onClick: (btn) => { void this.handleRefresh(btn); },
            }),
        });
    }

    private async handleRefresh(btn: HTMLButtonElement): Promise<void> {
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
        btn.disabled = true;
        btn.setText(t('settings.providers.refreshing'));
        try {
            const result = await discovery.refreshProvider(this.originalId);
            const persisted = (this.plugin.settings.providerConfigs ?? []).find((p) => p.id === this.originalId);
            this.discoveredModels = result;
            this.lastRefreshAt = persisted?.lastRefreshAt ?? Date.now();
            this.tierMapping = { ...(persisted?.tierMapping ?? {}) };
            new Notice(t('settings.providers.refreshDone'));
        } catch (e) {
            console.warn('[ProviderDetailModal] refresh failed:', e);
            new Notice(t('settings.providers.refreshFailed', { msg: (e as Error).message }));
        } finally {
            this.render();
        }
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

    // ── Tier mapping (existing providers only) ─────────────────────────

    private renderTierRow(parent: HTMLElement, tier: ModelTier): void {
        // FEAT-26-03 Welle A follow-up: dropped the resolution-line
        // (`Auto-detected · ModelName`) because the dropdown selection
        // already shows the resolved model. Status (empty / manually-set /
        // auto-detected) lives as a tiny tag below the dropdown if useful.
        const row = parent.createDiv({ cls: 'mcm-tier-row' });
        const labelCol = row.createDiv({ cls: 'mcm-tier-label-col' });
        labelCol.createDiv({
            cls: 'mcm-tier-label',
            text: t(`settings.providers.tier.${tier}`),
        });
        labelCol.createDiv({
            cls: 'mcm-tier-desc',
            text: t(`settings.providers.tier.${tier}Desc`),
        });

        const controlCol = row.createDiv({ cls: 'mcm-tier-control-col' });
        const badge = controlCol.createSpan({
            cls: `chat-model-picker-tier chat-model-picker-tier-${tier} mcm-tier-badge-top`,
            text: getTierBadgeLabel(tier),
        });
        badge.setAttr('aria-label', `tier: ${getTierBadgeLabel(tier)}`);

        const select = controlCol.createEl('select', { cls: 'dropdown mcm-tier-dropdown' });
        const autoSuggested = this.tierMapping?.[tier];
        const autoLabel = autoSuggested
            ? t('settings.providers.tier.autoLabel', {
                name: this.displayNameForId(autoSuggested),
            })
            : t('settings.providers.tier.autoEmpty');
        const autoOpt = select.createEl('option', { text: autoLabel });
        autoOpt.value = '';
        for (const m of this.sortedModelsForTier(tier)) {
            const opt = select.createEl('option', { text: this.modelOptionLabel(m, tier) });
            opt.value = m.id;
        }
        select.value = this.tierOverrides?.[tier] ?? '';
        select.addEventListener('change', () => {
            const v = select.value;
            this.tierOverrides = { ...this.tierOverrides };
            if (!v) delete this.tierOverrides[tier];
            else this.tierOverrides[tier] = v;
            this.render();
        });
    }

    private resolveDraftTierSlot(tier: ModelTier): string | undefined {
        return this.tierOverrides?.[tier] ?? this.tierMapping?.[tier];
    }

    private displayNameForId(modelId: string): string {
        const m = this.discoveredModels.find((x) => x.id === modelId);
        return this.shortenDisplayName(m?.displayName ?? modelId);
    }

    /**
     * Strip a leading provider/brand prefix from a discovered-model
     * `displayName` so the dropdown doesn't repeat "Anthropic:" inside
     * a modal whose header already says "Configure Anthropic"
     * (and analogous for OpenRouter aggregator listings like
     * "Anthropic: Claude Haiku Latest"). Handles common separators
     * ("Foo: bar", "Foo / bar", "Foo - bar"). Leaves clean names alone.
     */
    private shortenDisplayName(name: string): string {
        const m = name.match(/^([\w][\w\s.&+-]{0,30})\s*[:/–—-]\s+(.+)$/);
        if (m) return m[2];
        return name;
    }

    private sortedModelsForTier(tier: ModelTier): DiscoveredModel[] {
        const inTier = this.discoveredModels.filter((m) => m.autoTier === tier);
        const otherTiers = this.discoveredModels.filter((m) => m.autoTier !== tier);
        return [...inTier, ...otherTiers];
    }

    private modelOptionLabel(m: DiscoveredModel, expectedTier: ModelTier): string {
        const base = this.shortenDisplayName(m.displayName ?? m.id);
        if (!m.autoTier) return base;
        const badge = getTierBadgeLabel(m.autoTier);
        if (m.autoTier === expectedTier) return `[${badge}]  ${base}`;
        return `[${badge}]  ${base}  (${t('settings.providers.tier.differentTier')})`;
    }
}
