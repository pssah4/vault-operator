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

import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
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

    private mkSection(parent: HTMLElement, title: string): void {
        parent.createEl('h4', { cls: 'mcm-section', text: title });
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

        // ── Identity section ─────────────────────────────────────────────
        this.mkSection(contentEl, t('settings.providers.modal.section.identity'));

        new Setting(contentEl)
            .setName(t('settings.providers.modal.providerType'))
            .addDropdown((dd) => {
                for (const type of ALL_PROVIDER_TYPES) {
                    dd.addOption(type, getProviderBrandLabel(type));
                }
                dd.setValue(this.formType);
                dd.onChange((v) => {
                    const previous = this.formType;
                    this.formType = v as ProviderType;
                    const prevDefault = getDefaultBaseUrlForProvider(previous) ?? '';
                    if (!this.formBaseUrl || this.formBaseUrl === prevDefault) {
                        this.formBaseUrl = '';
                    }
                    this.render();
                });
            });

        new Setting(contentEl)
            .setName(t('settings.providers.modal.displayName'))
            .setDesc(t('settings.providers.modal.displayNameDesc'))
            .addText((text) => {
                text.setPlaceholder(getProviderBrandLabel(this.formType))
                    .setValue(this.formDisplayName)
                    .onChange((v) => { this.formDisplayName = v; });
            });

        new Setting(contentEl)
            .setName(t('settings.providers.enabled'))
            .addToggle((toggle) => {
                toggle.setValue(this.formEnabled)
                    .onChange((v) => { this.formEnabled = v; });
            });

        // ── Authentication section ──────────────────────────────────────
        this.mkSection(contentEl, t('settings.providers.modal.section.auth'));
        this.renderAuthSection(contentEl);

        // Discovery + Tier mapping only for already-saved providers.
        if (!this.isNew) {
            this.mkSection(contentEl, t('settings.providers.modal.section.discovery'));
            this.renderDiscoverySection(contentEl);

            this.mkSection(contentEl, t('settings.providers.modal.section.tiers'));
            // Tier-mapping intro infobox -- mirrors the settings-tab info-banner
            // pattern so the user understands what these three slots are for.
            this.renderTierInfoBanner(contentEl);
            for (const tier of TIER_ORDER) {
                this.renderTierRow(contentEl, tier);
            }
            // Advisor-disabled callout when refresh ran but flagship slot is still empty.
            if (this.discoveredModels.length === 0) {
                contentEl.createDiv({
                    cls: 'mcm-hint',
                    text: t('settings.providers.modal.tiersAfterRefresh'),
                });
            } else if (!this.resolveDraftTierSlot('flagship')) {
                const warn = contentEl.createDiv({ cls: 'mcm-warn' });
                const icon = warn.createSpan({ cls: 'mcm-warn-icon' });
                setIcon(icon, 'alert-triangle');
                warn.createSpan({ text: ' ' + t('settings.providers.advisorDisabled') });
            }

            this.mkSection(contentEl, t('settings.providers.modal.section.danger'));
            new Setting(contentEl)
                .setName(t('settings.providers.removeProvider'))
                .setDesc(t('settings.providers.removeDesc'))
                .addButton((btn) => {
                    btn.setButtonText(t('settings.providers.removeProvider'))
                        .setWarning()
                        .onClick(() => { void this.handleRemove(); });
                });
        } else {
            this.mkSection(contentEl, t('settings.providers.modal.section.discovery'));
            contentEl.createDiv({
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
        for (const tier of (['flagship', 'mid', 'fast'] as ModelTier[])) {
            const id = this.tierOverrides?.[tier] ?? this.tierMapping?.[tier];
            if (id) return id;
        }
        if (this.discoveredModels.length > 0) return this.discoveredModels[0].id;
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

        new Setting(parent)
            .setName(t('settings.providers.apiKey'))
            .setDesc(t('settings.providers.apiKeyDesc'))
            .addText((text) => {
                text.inputEl.type = 'password';
                text.setPlaceholder('••••••')
                    .setValue(this.formApiKey)
                    .onChange((v) => { this.formApiKey = v; });
            });

        const defaultBaseUrl = getDefaultBaseUrlForProvider(this.formType) ?? '';
        new Setting(parent)
            .setName(t('settings.providers.baseUrl'))
            .setDesc(t('settings.providers.baseUrlDesc'))
            .addText((text) => {
                text.setPlaceholder(defaultBaseUrl || t('settings.providers.baseUrlSdkDefault'))
                    .setValue(this.formBaseUrl)
                    .onChange((v) => { this.formBaseUrl = v; });
            });

        if (this.formType === 'azure') {
            new Setting(parent)
                .setName(t('settings.providers.apiVersion'))
                .setDesc(t('settings.providers.apiVersionDesc'))
                .addText((text) => {
                    text.setPlaceholder('2024-10-21')
                        .setValue(this.formApiVersion)
                        .onChange((v) => { this.formApiVersion = v; });
                });
        }

        this.renderTestConnectionRow(parent);
    }

    private renderTestConnectionRow(parent: HTMLElement): void {
        new Setting(parent)
            .setName(t('settings.providers.modal.testConnection'))
            .setDesc(t('settings.providers.modal.testConnectionDesc'))
            .addButton((btn) => {
                btn.setButtonText(t('settings.providers.modal.testConnection'))
                    .onClick(() => { void this.handleTestConnection(btn.buttonEl); });
            });
    }

    private renderOAuthAuth(parent: HTMLElement): void {
        const isAuthed = (this.formType === 'github-copilot' && !!this.plugin.settings.githubCopilotAccessToken)
            || (this.formType === 'chatgpt-oauth' && !!this.plugin.settings.chatgptOAuthAccessToken);
        const setting = new Setting(parent)
            .setName(t('settings.providers.oauthStatus'))
            .setDesc(isAuthed
                ? t('settings.providers.oauthAuthed')
                : t('settings.providers.oauthNotAuthed'));
        if (!isAuthed) {
            setting.addButton((btn) => {
                btn.setButtonText(t('settings.providers.oauthSignIn'))
                    .setCta()
                    .onClick(() => { void this.handleOAuthSignIn(btn.buttonEl); });
            });
        } else {
            setting.addButton((btn) => {
                btn.setButtonText(t('settings.providers.oauthSignOut'))
                    .setWarning()
                    .onClick(() => { void this.handleOAuthSignOut(); });
            });
        }
        if (this.formType === 'github-copilot') {
            new Setting(parent)
                .setName(t('settings.providers.copilotClientId'))
                .setDesc(t('settings.providers.copilotClientIdDesc'))
                .addText((text) => {
                    text.setPlaceholder(t('settings.providers.copilotClientIdPlaceholder'))
                        .setValue(this.plugin.settings.githubCopilotCustomClientId ?? '')
                        .onChange((v) => { void (async () => {
                            this.plugin.settings.githubCopilotCustomClientId = v.trim();
                            await this.plugin.saveSettings();
                        })(); });
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
        new Setting(parent)
            .setName(t('settings.providers.bedrockRegion'))
            .setDesc(t('settings.providers.bedrockRegionDesc'))
            .addText((text) => {
                text.setPlaceholder('AWS region (eu-central-1)')
                    .setValue(this.formAwsRegion)
                    .onChange((v) => { this.formAwsRegion = v; });
            });

        new Setting(parent)
            .setName(t('settings.providers.bedrockAuthMode'))
            .setDesc(t('settings.providers.bedrockAuthModeDesc'))
            .addDropdown((dd) => {
                dd.addOption('api-key', 'API key (bearer)');
                dd.addOption('access-key', 'Access key + secret');
                dd.setValue(this.formAwsAuthMode);
                dd.onChange((v) => {
                    this.formAwsAuthMode = v as 'api-key' | 'access-key';
                    this.render();
                });
            });

        if (this.formAwsAuthMode === 'api-key') {
            new Setting(parent)
                .setName(t('settings.providers.bedrockApiKey'))
                .addText((text) => {
                    text.inputEl.type = 'password';
                    text.setValue(this.formAwsApiKey)
                        .onChange((v) => { this.formAwsApiKey = v; });
                });
        } else {
            new Setting(parent)
                .setName(t('settings.providers.bedrockAccessKey'))
                .addText((text) => {
                    text.inputEl.type = 'password';
                    text.setValue(this.formAwsAccessKey)
                        .onChange((v) => { this.formAwsAccessKey = v; });
                });
            new Setting(parent)
                .setName(t('settings.providers.bedrockSecretKey'))
                .addText((text) => {
                    text.inputEl.type = 'password';
                    text.setValue(this.formAwsSecretKey)
                        .onChange((v) => { this.formAwsSecretKey = v; });
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
        new Setting(parent)
            .setName(t('settings.providers.discovery'))
            .setDesc(desc)
            .addButton((btn) => {
                btn.setButtonText(t('settings.providers.refresh'))
                    .setCta()
                    .onClick(() => { void this.handleRefresh(btn.buttonEl); });
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

        // EPIC-26 follow-up #3: badge sits right-aligned ABOVE the dropdown
        // (not inline with the tier label) so it never overlaps the
        // description text on narrow widths.
        const row = parent.createDiv({ cls: 'mcm-tier-row' });
        const labelCol = row.createDiv({ cls: 'mcm-tier-label-col' });
        labelCol.createDiv({
            cls: 'mcm-tier-label',
            text: t(`settings.providers.tier.${tier}`),
        });
        labelCol.createDiv({ cls: 'mcm-tier-desc', text: descLines });

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
}
