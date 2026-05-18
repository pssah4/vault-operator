import { App, Modal, Notice, setIcon } from 'obsidian';
import type { CustomModel, ProviderType } from '../../types/settings';
import { getDefaultBaseUrlForProvider } from '../../types/settings';
import { getCacheCapability } from '../../api/capabilities';
import { getModelOutputCeiling, normalizeModelId } from '../../types/model-registry';
import { PROVIDER_LABELS, MODEL_SUGGESTIONS, EMBEDDING_PROVIDERS, EMBEDDING_SUGGESTIONS } from './constants';
import { testModelConnection, testEmbeddingConnection, fetchProviderModels, fetchOllamaModels, fetchEmbeddingModels, isTemperatureFixed, maxTemperature } from './testModelConnection';
import { GitHubCopilotAuthService } from '../../core/security/GitHubCopilotAuthService';
import { KiloAuthService } from '../../core/security/KiloAuthService';
import { ChatGptOAuthService } from '../../core/auth/ChatGptOAuthService';
import { t } from '../../i18n';

/** Derive vendor group for a Copilot model ID (no slash-prefix like OpenRouter). */
function copilotModelVendor(modelId: string): string {
    if (/^claude/i.test(modelId)) return 'Anthropic';
    if (/^gpt|^o[1-9]|^chatgpt|^codex/i.test(modelId)) return 'OpenAI';
    if (/^gemini/i.test(modelId)) return 'Google';
    if (/^mistral/i.test(modelId)) return 'Mistral';
    return 'Other';
}

/**
 * Recommended max output tokens per model. Used when a model is selected from
 * the Quick Pick to set a sensible default that maximizes the model's capability.
 * Falls back to pattern matching if the exact ID is not listed.
 */
function recommendedMaxTokens(modelId: string): number {
    // Reduce OpenRouter / Bedrock / ARN-decorated IDs to the bare model name.
    const bare = normalizeModelId(modelId);

    // Exact matches first. Values are generous defaults (output is billed per
    // generated token, not per limit), bounded well below each model's hard cap.
    const EXACT: Record<string, number> = {
        'claude-opus-4-6': 32_000,
        'claude-sonnet-4-6': 32_000,
        'claude-sonnet-4-5': 32_000,
        'claude-sonnet-4-5-20250929': 32_000,
        'claude-sonnet-4': 32_000,
        'claude-haiku-4-5-20251001': 8_192,
        'claude-3-7-sonnet-20250219': 16_384,
        'claude-3-5-sonnet-20241022': 8_192,
        'claude-3.5-sonnet': 8_192,
        'claude-3-5-haiku-20241022': 8_192,
        'gpt-5': 32_768,
        'gpt-5-mini': 16_384,
        'gpt-5.4': 16_384,
        'gpt-4.1': 32_768,
        'gpt-4.1-mini': 16_384,
        'gpt-4.1-nano': 16_384,
        'gpt-4o': 16_384,
        'gpt-4o-mini': 16_384,
        'o3': 100_000,
        'o3-mini': 65_536,
        'o4-mini': 100_000,
        'o1': 32_768,
        'codex-mini-latest': 16_384,
        'gemini-2.0-flash': 8_192,
        'mistral-large-latest': 8_192,
    };
    const raw = EXACT[bare] ?? (() => {
        // Pattern-based fallbacks
        if (/^claude-opus/i.test(bare)) return 32_000;
        if (/^claude-sonnet-4/i.test(bare)) return 32_000;
        if (/^claude/i.test(bare)) return 8_192;
        if (/^o[1-9]/i.test(bare)) return 100_000;
        if (/^gpt-5/i.test(bare)) return 32_768;
        if (/^gpt-4\.1/i.test(bare)) return 32_768;
        if (/^gpt-4/i.test(bare)) return 16_384;
        return 8_192; // safe default
    })();
    // Never recommend more than the model's real output ceiling (when known).
    const ceiling = getModelOutputCeiling(bare);
    return ceiling ? Math.min(raw, ceiling) : raw;
}

export class ModelConfigModal extends Modal {
    private model: CustomModel;
    private isNew: boolean;
    private onSave: (model: CustomModel) => void;
    private forEmbedding: boolean;

    private formName: string;
    private formDisplayName: string;
    private formProvider: ProviderType;
    private formApiKey: string;
    private formBaseUrl: string;
    private formApiVersion: string;
    /** When true, max_tokens is left to the runtime (resolveOutputBudget). The slider below is the manual override used only when this is false. */
    private formAutoMaxTokens: boolean;
    private formMaxTokens: number;
    private formTemperatureEnabled: boolean;
    private formTemperatureValue: number;
    private formPromptCachingEnabled: boolean;
    private formThinkingEnabled: boolean;
    private formThinkingBudgetTokens: number;
    private formAwsRegion: string;
    private formAwsAuthMode: 'api-key' | 'access-key';
    private formAwsApiKey: string;
    private formAwsAccessKey: string;
    private formAwsSecretKey: string;
    private formAwsSessionToken: string;
    private formAwsEndpoint: string;

    private apiKeyRow: HTMLElement | null = null;
    private baseUrlRow: HTMLElement | null = null;
    private baseUrlInputEl: HTMLInputElement | null = null;
    private apiVersionRow: HTMLElement | null = null;
    private suggestRow: HTMLElement | null = null;
    private suggestSelEl: HTMLSelectElement | null = null;
    private ollamaBrowserRow: HTMLElement | null = null;
    private customBrowserRow: HTMLElement | null = null;
    private providerGuideEl: HTMLElement | null = null;
    private apiKeyDescEl: HTMLElement | null = null;
    private baseUrlDescEl: HTMLElement | null = null;
    private testResultEl: HTMLElement | null = null;
    private testBtn: HTMLButtonElement | null = null;
    private nameInputEl: HTMLInputElement | null = null;
    private dnInputEl: HTMLInputElement | null = null;
    private temperatureRow: HTMLElement | null = null;
    private temperatureSliderEl: HTMLInputElement | null = null;
    private temperatureValueEl: HTMLElement | null = null;
    private temperatureNoteEl: HTMLElement | null = null;
    private promptCachingRow: HTMLElement | null = null;
    private thinkingRow: HTMLElement | null = null;
    private thinkingBudgetRow: HTMLElement | null = null;
    private thinkingNoteEl: HTMLElement | null = null;
    private maxTokensRow: HTMLElement | null = null;
    private maxTokensManualWrap: HTMLElement | null = null;
    private maxTokensSliderEl: HTMLInputElement | null = null;
    private maxTokensValueEl: HTMLElement | null = null;
    private maxTokensRecBtnEl: HTMLButtonElement | null = null;
    private maxTokensNoteEl: HTMLElement | null = null;
    private copilotAuthRow: HTMLElement | null = null;
    private kiloAuthRow: HTMLElement | null = null;
    private bedrockAuthRow: HTMLElement | null = null;
    private chatgptOAuthRow: HTMLElement | null = null;
    private thinkingBudgetSliderEl: HTMLInputElement | null = null;
    private thinkingBudgetValueEl: HTMLElement | null = null;

    constructor(app: App, model: CustomModel | null, onSave: (m: CustomModel) => void, forEmbedding = false) {
        super(app);
        this.forEmbedding = forEmbedding;
        this.isNew = model === null;
        this.model = model ?? {
            name: '',
            provider: 'openai',
            displayName: '',
            apiKey: '',
            baseUrl: '',
            enabled: true,
            isBuiltIn: false,
        };
        this.onSave = onSave;
        this.formName = this.model.name;
        this.formDisplayName = this.model.displayName ?? '';
        this.formProvider = this.model.provider;
        this.formApiKey = this.model.apiKey ?? '';
        this.formBaseUrl = this.model.baseUrl ?? getDefaultBaseUrlForProvider(this.model.provider) ?? '';
        this.formApiVersion = this.model.apiVersion ?? '2024-10-21';
        // Auto by default: an undefined stored value means "let the runtime size
        // it" (resolveOutputBudget). An explicit value means the user picked a cap.
        this.formAutoMaxTokens = this.model.maxTokens === undefined;
        this.formMaxTokens = this.model.maxTokens ?? recommendedMaxTokens(this.model.name);
        this.formTemperatureEnabled = this.model.temperature !== undefined;
        this.formTemperatureValue = this.model.temperature ?? 0.7;
        // IMP-18-01-01: default-on for cache-capable models, preserve explicit user value otherwise.
        this.formPromptCachingEnabled = this.model.promptCachingEnabled
            ?? getCacheCapability(this.model.provider, this.model.name).supportsPromptCache;
        this.formThinkingEnabled = this.model.thinkingEnabled ?? false;
        this.formThinkingBudgetTokens = this.model.thinkingBudgetTokens ?? 10000;
        this.formAwsRegion = this.model.awsRegion ?? 'eu-central-1';
        this.formAwsAuthMode = this.model.awsAuthMode ?? 'api-key';
        this.formAwsApiKey = this.model.awsApiKey ?? '';
        this.formAwsAccessKey = this.model.awsAccessKey ?? '';
        this.formAwsSecretKey = this.model.awsSecretKey ?? '';
        this.formAwsSessionToken = this.model.awsSessionToken ?? '';
        this.formAwsEndpoint = this.model.provider === 'bedrock' ? (this.model.baseUrl ?? '') : '';
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('model-config-modal');
        contentEl.createEl('h3', {
            text: this.isNew
                ? (this.forEmbedding ? t('modal.modelConfig.addEmbedding') : t('modal.modelConfig.addModel'))
                : t('modal.modelConfig.configure', { name: this.model.displayName ?? this.model.name }),
            cls: 'modal-title',
        });
        this.buildForm(contentEl);
        this.buildActions(contentEl);
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private buildForm(el: HTMLElement): void {
        const form = el.createDiv('mcm-form');

        const row = (label: string, desc?: string): HTMLElement => {
            const r = form.createDiv('mcm-row');
            const labelEl = r.createDiv('mcm-label');
            labelEl.createSpan({ text: label });
            if (desc) labelEl.createSpan({ text: desc, cls: 'mcm-desc' });
            return r;
        };

        // ── Provider setup guide (dynamic, shown at top) ─────────────────
        this.providerGuideEl = form.createDiv('mcm-guide');

        // ── Provider ─────────────────────────────────────────────────────
        const provRow = row(t('modal.modelConfig.provider'));
        const provSel = provRow.createEl('select', { cls: 'mcm-select' });
        (this.forEmbedding ? EMBEDDING_PROVIDERS : ['anthropic', 'openai', 'gemini', 'bedrock', 'github-copilot', 'chatgpt-oauth', 'kilo-gateway', 'ollama', 'lmstudio', 'openrouter', 'azure', 'custom'] as ProviderType[]).forEach((p) => {
            const opt = provSel.createEl('option', { value: p, text: PROVIDER_LABELS[p] });
            if (p === this.formProvider) opt.selected = true;
        });
        if (!this.isNew && this.model.isBuiltIn) provSel.disabled = true;
        provSel.addEventListener('change', () => {
            const previousProvider = this.formProvider;
            const previousDefaultBaseUrl = getDefaultBaseUrlForProvider(previousProvider) ?? '';
            this.formProvider = provSel.value as ProviderType;
            const nextDefaultBaseUrl = getDefaultBaseUrlForProvider(this.formProvider) ?? '';
            if (!this.formBaseUrl || this.formBaseUrl === previousDefaultBaseUrl) {
                this.formBaseUrl = nextDefaultBaseUrl;
                if (this.baseUrlInputEl) this.baseUrlInputEl.value = this.formBaseUrl;
            }
            this.updateFieldVisibility();
        });

        // ── Quick Pick (suggestions per provider) ─────────────────────────
        this.suggestRow = form.createDiv('mcm-row mcm-suggest-row');
        const suggestLabel = this.suggestRow.createDiv('mcm-label');
        suggestLabel.createSpan({ text: t('modal.modelConfig.quickPick') });
        suggestLabel.createSpan({ text: t('modal.modelConfig.quickPickDesc'), cls: 'mcm-desc' });
        const suggestControls = this.suggestRow.createDiv('mcm-suggest-controls');
        this.suggestSelEl = suggestControls.createEl('select', { cls: 'mcm-select mcm-suggest-sel' });
        this.suggestSelEl.createEl('option', { value: '', text: t('modal.modelConfig.pickModel'), attr: { disabled: '', selected: '' } });
        this.suggestSelEl.addEventListener('change', () => {
            const val = this.suggestSelEl!.value;
            if (!val) return;
            if (this.nameInputEl) {
                this.formName = val;
                this.nameInputEl.value = val;
            }
            const opt = this.suggestSelEl!.options[this.suggestSelEl!.selectedIndex];
            if (this.dnInputEl && !this.dnInputEl.value && opt) {
                const label = opt.text.split('  (')[0].trim();
                if (label && label !== val) {
                    this.formDisplayName = label;
                    this.dnInputEl.value = label;
                }
            }
            // Set recommended max tokens for the selected model
            const rec = recommendedMaxTokens(val);
            this.formMaxTokens = rec;
            if (this.maxTokensSliderEl) this.maxTokensSliderEl.value = String(rec);
            if (this.maxTokensValueEl) this.maxTokensValueEl.setText(rec.toLocaleString());

            this.suggestSelEl!.selectedIndex = 0;
            this.updateFieldVisibility();
        });
        // Fetch button — fetches current model list from the provider's API
        const fetchBtn = suggestControls.createEl('button', { cls: 'mcm-fetch-btn', attr: { title: t('modal.modelConfig.fetchModels') } });
        setIcon(fetchBtn, 'refresh-cw');
        fetchBtn.addEventListener('click', () => { void (async () => {
            if (!this.suggestSelEl) return;
            fetchBtn.disabled = true;
            setIcon(fetchBtn, 'loader');
            try {
                const bedrockCreds = this.formProvider === 'bedrock' ? {
                    region: this.formAwsRegion,
                    authMode: this.formAwsAuthMode,
                    apiKey: this.formAwsApiKey,
                    accessKey: this.formAwsAccessKey,
                    secretKey: this.formAwsSecretKey,
                    sessionToken: this.formAwsSessionToken,
                    endpoint: this.formAwsEndpoint,
                } : undefined;
                const models = this.forEmbedding
                    ? await fetchEmbeddingModels(this.formProvider, this.formApiKey, this.formBaseUrl || undefined, this.formApiVersion || undefined)
                    : await fetchProviderModels(this.formProvider, this.formApiKey, this.formBaseUrl || undefined, undefined, bedrockCreds);
                this.suggestSelEl.options.length = 0;
                this.suggestSelEl.createEl('option', { value: '', text: t('modal.modelConfig.modelsFetched', { count: models.length }), attr: { disabled: '', selected: '' } });
                // For OpenRouter and Copilot chat models, group by vendor
                if (!this.forEmbedding && (this.formProvider === 'openrouter' || this.formProvider === 'github-copilot')) {
                    const groups = new Map<string, typeof models>();
                    models.forEach((m) => {
                        const grp = this.formProvider === 'openrouter'
                            ? m.id.split('/')[0]
                            : copilotModelVendor(m.id);
                        if (!groups.has(grp)) groups.set(grp, []);
                        groups.get(grp)!.push(m);
                    });
                    groups.forEach((items, grp) => {
                        const og = activeDocument.createElement('optgroup');
                        og.label = grp;
                        items.forEach((m) => {
                            const opt = activeDocument.createElement('option');
                            opt.value = m.id;
                            opt.text = `${m.label}  (${m.id})`;
                            og.appendChild(opt);
                        });
                        this.suggestSelEl!.appendChild(og);
                    });
                } else {
                    models.forEach((m) => {
                        this.suggestSelEl!.createEl('option', { value: m.id, text: m.label !== m.id ? `${m.label}  (${m.id})` : m.id });
                    });
                }
            } catch (e: unknown) {
                // requestUrl can throw a Response-like object (no .message) — handle both
                const errObj = e as { message?: string; status?: number };
                const errMsg = errObj?.message ?? (errObj?.status ? `HTTP ${errObj.status}` : String(e));
                new Notice(t('modal.modelConfig.fetchFailed', { error: errMsg }));
            } finally {
                fetchBtn.disabled = false;
                setIcon(fetchBtn, 'refresh-cw');
            }
        })(); });

        // ── Model ID ─────────────────────────────────────────────────────
        const nameRow = row(t('modal.modelConfig.modelId'), t('modal.modelConfig.modelIdDesc'));
        this.nameInputEl = nameRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'text', placeholder: t('modal.modelConfig.modelIdPlaceholder') },
        });
        this.nameInputEl.value = this.formName;
        this.nameInputEl.addEventListener('input', () => {
            this.formName = this.nameInputEl!.value.trim();
            // For a brand-new model, keep Max Output Tokens snapped to the value
            // recommended for whatever model ID has been entered so far. Existing
            // models keep the user's stored value.
            if (this.isNew) this.formMaxTokens = recommendedMaxTokens(this.formName);
            // IMP-18-01-01: model id drives cache + thinking visibility (e.g. Bedrock Claude vs Nova,
            // Copilot Claude vs GPT). Always re-evaluate, not only for Copilot.
            this.updateFieldVisibility();
            this.updateThinkingUI();
        });
        if (!this.isNew && this.model.isBuiltIn) this.nameInputEl.disabled = true;

        // ── Ollama model browser (shown only for Ollama) ──────────────────
        this.ollamaBrowserRow = form.createDiv('mcm-ollama-browser');
        this.buildOllamaBrowser(this.ollamaBrowserRow);

        // ── Custom / LM Studio / Mistral model browser ────────────────────
        this.customBrowserRow = form.createDiv('mcm-ollama-browser');
        this.buildCustomBrowser(this.customBrowserRow);

        // ── Display Name ──────────────────────────────────────────────────
        const dnRow = row(t('modal.modelConfig.displayName'), t('modal.modelConfig.displayNameDesc'));
        this.dnInputEl = dnRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'text', placeholder: this.formName || t('modal.modelConfig.displayNamePlaceholder', { name: 'GPT-4o' }) },
        });
        this.dnInputEl.value = this.formDisplayName;
        this.dnInputEl.addEventListener('input', () => (this.formDisplayName = this.dnInputEl!.value));

        // ── API Key ───────────────────────────────────────────────────────
        this.apiKeyRow = form.createDiv('mcm-row');
        const akLabel = this.apiKeyRow.createDiv('mcm-label');
        akLabel.createSpan({ text: t('modal.modelConfig.apiKey') });
        this.apiKeyDescEl = akLabel.createSpan({ cls: 'mcm-desc' });
        const akInput = this.apiKeyRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'password', placeholder: t('modal.modelConfig.apiKeyPlaceholder') },
        });
        akInput.value = this.formApiKey;
        akInput.addEventListener('input', () => (this.formApiKey = akInput.value.trim()));

        // ── GitHub Copilot Auth (shown instead of API Key for github-copilot) ──
        this.copilotAuthRow = form.createDiv('mcm-row mcm-copilot-auth');
        this.buildCopilotAuthSection(this.copilotAuthRow);

        // ── Kilo Gateway Auth (shown instead of API Key for kilo-gateway) ──
        this.kiloAuthRow = form.createDiv('mcm-row mcm-kilo-auth');
        this.buildKiloAuthSection(this.kiloAuthRow);

        // ── Bedrock Auth (shown instead of API Key for bedrock) ──
        // This is a section wrapper, not a row -- it contains multiple rows internally.
        this.bedrockAuthRow = form.createDiv('mcm-bedrock-auth');
        this.buildBedrockAuthSection(this.bedrockAuthRow);

        // ── ChatGPT OAuth Auth (shown instead of API Key for chatgpt-oauth) ──
        this.chatgptOAuthRow = form.createDiv('mcm-row mcm-chatgpt-oauth-auth');
        this.buildChatGptOAuthSection(this.chatgptOAuthRow);

        // ── Base URL ──────────────────────────────────────────────────────
        this.baseUrlRow = form.createDiv('mcm-row');
        const buLabel = this.baseUrlRow.createDiv('mcm-label');
        buLabel.createSpan({ text: t('modal.modelConfig.baseUrl') });
        this.baseUrlDescEl = buLabel.createSpan({ cls: 'mcm-desc' });
        const defaultBaseUrl = 'http://localhost:11434';
        this.baseUrlInputEl = this.baseUrlRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'text', placeholder: defaultBaseUrl },
        });
        this.baseUrlInputEl.value = this.formBaseUrl;
        this.baseUrlInputEl.addEventListener('input', () => (this.formBaseUrl = this.baseUrlInputEl!.value.trim()));

        // ── API Version (Azure + some enterprise gateways) ───────────────
        this.apiVersionRow = form.createDiv('mcm-row');
        const avLabel = this.apiVersionRow.createDiv('mcm-label');
        avLabel.createSpan({ text: t('modal.modelConfig.apiVersion') });
        avLabel.createSpan({ text: t('modal.modelConfig.apiVersionDesc'), cls: 'mcm-desc' });
        const avInput = this.apiVersionRow.createEl('input', {
            cls: 'mcm-input mcm-input-sm',
            attr: { type: 'text', placeholder: t('modal.modelConfig.apiVersionPlaceholder') },
        });
        avInput.value = this.formApiVersion;
        avInput.addEventListener('input', () => (this.formApiVersion = avInput.value.trim()));

        // ── Max Output Tokens ────────────────────────────────────────────
        this.maxTokensRow = form.createDiv('mcm-row');
        const mtLabel = this.maxTokensRow.createDiv('mcm-label');
        mtLabel.createSpan({ text: t('modal.modelConfig.maxTokens') });
        mtLabel.createSpan({ text: t('modal.modelConfig.maxTokensDesc'), cls: 'mcm-desc' });

        const mtControls = this.maxTokensRow.createDiv('mcm-temperature-controls');

        // Auto toggle — when on, the runtime sizes max_tokens per model and
        // shrinks it when the prompt is large; the slider below is hidden.
        const mtAutoWrap = mtControls.createDiv('mcm-checkbox-line');
        const mtAutoChk = mtAutoWrap.createEl('input', { attr: { type: 'checkbox' } });
        mtAutoChk.checked = this.formAutoMaxTokens;
        mtAutoWrap.createSpan({ text: t('modal.modelConfig.maxTokensAuto') });
        mtAutoChk.addEventListener('change', () => {
            this.formAutoMaxTokens = mtAutoChk.checked;
            this.updateMaxTokensVisibility();
        });

        // Manual override (slider) — only used when "auto" is unchecked.
        this.maxTokensManualWrap = mtControls.createDiv();
        const mtSliderWrap = this.maxTokensManualWrap.createDiv('mcm-temperature-slider-wrap');
        this.maxTokensSliderEl = mtSliderWrap.createEl('input', {
            attr: { type: 'range', min: '1024', max: '200000', step: '1024' },
            cls: 'mcm-temperature-slider',
        });
        this.maxTokensSliderEl.value = String(this.formMaxTokens);
        this.maxTokensValueEl = mtSliderWrap.createSpan({
            cls: 'mcm-temperature-value',
            text: this.formMaxTokens.toLocaleString(),
        });
        // One-click jump to the value recommended for the current model — shown
        // only when the slider is not already at that value.
        this.maxTokensRecBtnEl = mtSliderWrap.createEl('button', {
            cls: 'mcm-recommend-btn',
            attr: { type: 'button', title: t('modal.modelConfig.maxTokensUseRecommendedTitle') },
        });
        this.maxTokensRecBtnEl.addEventListener('click', () => {
            this.formMaxTokens = recommendedMaxTokens(this.formName);
            this.updateMaxTokensSliderRange();
            this.updateThinkingUI();
        });
        this.maxTokensSliderEl.addEventListener('input', () => {
            this.formMaxTokens = parseInt(this.maxTokensSliderEl!.value);
            if (this.maxTokensValueEl) {
                this.maxTokensValueEl.setText(this.formMaxTokens.toLocaleString());
            }
            this.refreshMaxTokensRecBtn();
            this.updateThinkingUI();
        });
        this.maxTokensNoteEl = this.maxTokensManualWrap.createDiv({ cls: 'mcm-temperature-note', text: t('modal.modelConfig.maxTokensNote') });
        this.updateMaxTokensVisibility();

        // ── Temperature ───────────────────────────────────────────────────
        if (!this.forEmbedding) {
            this.temperatureRow = form.createDiv('mcm-row mcm-temperature-row');
            const tempLabel = this.temperatureRow.createDiv('mcm-label');
            tempLabel.createSpan({ text: t('modal.modelConfig.temperature') });
            tempLabel.createSpan({ text: t('modal.modelConfig.temperatureDesc'), cls: 'mcm-desc' });

            const tempControls = this.temperatureRow.createDiv('mcm-temperature-controls');

            const toggleWrap = tempControls.createDiv('mcm-temperature-toggle');
            const toggleChk = toggleWrap.createEl('input', { attr: { type: 'checkbox' } });
            toggleChk.checked = this.formTemperatureEnabled;
            toggleWrap.createSpan({ text: t('modal.modelConfig.customTemperature'), cls: 'mcm-temperature-toggle-label' });

            const sliderWrap = tempControls.createDiv('mcm-temperature-slider-wrap');
            this.temperatureSliderEl = sliderWrap.createEl('input', {
                attr: { type: 'range', min: '0', max: '2', step: '0.05' },
                cls: 'mcm-temperature-slider',
            });
            this.temperatureSliderEl.value = String(this.formTemperatureValue);
            this.temperatureValueEl = sliderWrap.createSpan({
                cls: 'mcm-temperature-value',
                text: this.formTemperatureValue.toFixed(2),
            });
            this.temperatureNoteEl = tempControls.createDiv({ cls: 'mcm-temperature-note' });

            toggleChk.addEventListener('change', () => {
                this.formTemperatureEnabled = toggleChk.checked;
                this.updateTemperatureUI();
            });
            this.temperatureSliderEl.addEventListener('input', () => {
                this.formTemperatureValue = parseFloat(this.temperatureSliderEl!.value);
                if (this.temperatureValueEl) {
                    this.temperatureValueEl.setText(this.formTemperatureValue.toFixed(2));
                }
            });
        }

        // -- Prompt Caching (visibility data-driven via capability table, IMP-18-01-01) --
        if (!this.forEmbedding) {
            this.promptCachingRow = form.createDiv('mcm-row');
            const cacheLabel = this.promptCachingRow.createDiv('mcm-label');
            cacheLabel.createSpan({ text: t('modal.modelConfig.promptCaching') });
            cacheLabel.createSpan({ text: t('modal.modelConfig.promptCachingDesc'), cls: 'mcm-desc' });
            const cacheChk = this.promptCachingRow.createEl('input', {
                attr: {
                    type: 'checkbox',
                    title: t('modal.modelConfig.promptCachingTooltip'),
                },
            });
            cacheChk.checked = this.formPromptCachingEnabled;
            cacheChk.addEventListener('change', () => {
                this.formPromptCachingEnabled = cacheChk.checked;
            });
        }

        // -- Extended Thinking (Anthropic only) --
        if (!this.forEmbedding) {
            this.thinkingRow = form.createDiv('mcm-row');
            const thinkLabel = this.thinkingRow.createDiv('mcm-label');
            thinkLabel.createSpan({ text: t('modal.modelConfig.thinking') });
            thinkLabel.createSpan({ text: t('modal.modelConfig.thinkingDesc'), cls: 'mcm-desc' });
            const thinkChk = this.thinkingRow.createEl('input', { attr: { type: 'checkbox' } });
            thinkChk.checked = this.formThinkingEnabled;
            thinkChk.addEventListener('change', () => {
                this.formThinkingEnabled = thinkChk.checked;
                this.updateThinkingUI();
                this.updateTemperatureUI();
            });
            this.thinkingNoteEl = this.thinkingRow.createDiv({ cls: 'mcm-temperature-note' });

            // Budget slider
            this.thinkingBudgetRow = form.createDiv('mcm-row');
            const budgetLabel = this.thinkingBudgetRow.createDiv('mcm-label');
            budgetLabel.createSpan({ text: t('modal.modelConfig.thinkingBudget') });
            budgetLabel.createSpan({ text: t('modal.modelConfig.thinkingBudgetDesc'), cls: 'mcm-desc' });
            const budgetControls = this.thinkingBudgetRow.createDiv('mcm-temperature-controls');
            const budgetSliderWrap = budgetControls.createDiv('mcm-temperature-slider-wrap');
            this.thinkingBudgetSliderEl = budgetSliderWrap.createEl('input', {
                attr: { type: 'range', min: '1024', max: '128000', step: '1024' },
                cls: 'mcm-temperature-slider',
            });
            this.thinkingBudgetSliderEl.value = String(this.formThinkingBudgetTokens);
            this.thinkingBudgetValueEl = budgetSliderWrap.createSpan({
                cls: 'mcm-temperature-value',
                text: this.formThinkingBudgetTokens.toLocaleString(),
            });
            this.thinkingBudgetSliderEl.addEventListener('input', () => {
                this.formThinkingBudgetTokens = parseInt(this.thinkingBudgetSliderEl!.value);
                if (this.thinkingBudgetValueEl) {
                    this.thinkingBudgetValueEl.setText(this.formThinkingBudgetTokens.toLocaleString());
                }

                // Auto-adjust maxTokens slider if thinking budget exceeds it
                if (this.formThinkingBudgetTokens > this.formMaxTokens) {
                    this.formMaxTokens = this.formThinkingBudgetTokens;
                    if (this.maxTokensSliderEl) {
                        this.maxTokensSliderEl.value = String(this.formMaxTokens);
                    }
                    if (this.maxTokensValueEl) {
                        this.maxTokensValueEl.setText(this.formMaxTokens.toLocaleString());
                    }
                }
                this.updateThinkingUI();
            });
        }

        // Test result (inline)
        this.testResultEl = form.createDiv('mcm-test-result');
        this.testResultEl.classList.add('agent-u-hidden');

        this.updateFieldVisibility();
    }

    private buildActions(el: HTMLElement): void {
        const bar = el.createDiv('mcm-actions');

        this.testBtn = bar.createEl('button', { cls: 'mcm-btn-test', text: t('modal.modelConfig.testConnection') });
        this.testBtn.addEventListener('click', () => void this.runTest());

        const saveBtn = bar.createEl('button', { cls: 'mod-cta', text: this.isNew ? t('modal.modelConfig.add') : t('modal.modelConfig.save') });
        saveBtn.addEventListener('click', () => this.save());

        const cancelBtn = bar.createEl('button', { text: t('modal.modelConfig.cancel') });
        cancelBtn.addEventListener('click', () => this.close());
    }

    private updateFieldVisibility(): void {
        if (!this.apiKeyRow || !this.baseUrlRow || !this.providerGuideEl) return;
        const p = this.formProvider;

        // Show/hide fields per provider
        const isCopilot = p === 'github-copilot';
        const isKilo = p === 'kilo-gateway';
        const isBedrock = p === 'bedrock';
        const isChatGpt = p === 'chatgpt-oauth';
        this.apiKeyRow.classList.toggle('agent-u-hidden', p === 'ollama' || p === 'lmstudio' || isCopilot || isKilo || isBedrock || isChatGpt);
        if (this.copilotAuthRow) this.copilotAuthRow.classList.toggle('agent-u-hidden', !isCopilot);
        if (this.kiloAuthRow) this.kiloAuthRow.classList.toggle('agent-u-hidden', !isKilo);
        if (this.bedrockAuthRow) this.bedrockAuthRow.classList.toggle('agent-u-hidden', !isBedrock);
        if (this.chatgptOAuthRow) this.chatgptOAuthRow.classList.toggle('agent-u-hidden', !isChatGpt);
        if (isBedrock) this.updateBedrockAuthVisibility();
        this.baseUrlRow.classList.toggle('agent-u-hidden', p === 'openai' || p === 'gemini' || p === 'openrouter' || isCopilot || isKilo || isBedrock || isChatGpt);
        if (this.apiVersionRow) this.apiVersionRow.classList.toggle('agent-u-hidden', p !== 'azure');
        if (this.ollamaBrowserRow) this.ollamaBrowserRow.classList.toggle('agent-u-hidden', p !== 'ollama');
        if (this.customBrowserRow) this.customBrowserRow.classList.toggle('agent-u-hidden', p !== 'custom' && p !== 'lmstudio');
        // Max Tokens slider always visible (not provider-specific); cap its range
        // to the model's real output ceiling when we know it.
        this.updateMaxTokensSliderRange();
        const isCopilotClaude = isCopilot && /^claude/i.test(this.formName);
        // IMP-18-01-01: prompt-caching toggle visibility is data-driven via the capability table.
        const cacheCap = getCacheCapability(p, this.formName);
        if (this.promptCachingRow) this.promptCachingRow.classList.toggle('agent-u-hidden', !cacheCap.supportsPromptCache);
        const supportsThinking = p === 'anthropic' || p === 'openrouter' || isCopilotClaude;
        if (this.thinkingRow) this.thinkingRow.classList.toggle('agent-u-hidden', !supportsThinking);
        if (this.thinkingBudgetRow) this.thinkingBudgetRow.classList.toggle('agent-u-hidden', !supportsThinking || !this.formThinkingEnabled);

        // Quick Pick: use embedding suggestions or chat suggestions depending on mode
        const suggestions = this.forEmbedding
            ? (EMBEDDING_SUGGESTIONS[p] ?? [])
            : (MODEL_SUGGESTIONS[p] ?? []);
        const hasStaticSuggestions = suggestions.length > 0;
        // Fetch is available for embedding providers with live APIs (not azure — no list endpoint)
        const hasFetchFetch = this.forEmbedding
            ? (p === 'openai' || p === 'openrouter' || p === 'ollama' || p === 'lmstudio' || p === 'custom' || isCopilot)
            : (p === 'anthropic' || p === 'openai' || p === 'gemini' || p === 'openrouter' || p === 'lmstudio' || p === 'bedrock' || isCopilot || isKilo);
        if (this.suggestRow) {
            this.suggestRow.classList.toggle('agent-u-hidden', !hasStaticSuggestions && !hasFetchFetch);
            if (this.suggestSelEl) {
                // Rebuild static options (reset to defaults when provider changes)
                while (this.suggestSelEl.options.length > 1) this.suggestSelEl.remove(1);
                // Remove optgroups
                this.suggestSelEl.querySelectorAll('optgroup').forEach((og) => og.remove());
                const groups = [...new Set(suggestions.map((s) => s.group))];
                groups.forEach((grp) => {
                    const og = activeDocument.createElement('optgroup');
                    og.label = grp;
                    suggestions.filter((s) => s.group === grp).forEach((s) => {
                        const opt = activeDocument.createElement('option');
                        opt.value = s.id;
                        opt.text = `${s.label}  (${s.id})`;
                        og.appendChild(opt);
                    });
                    this.suggestSelEl!.appendChild(og);
                });
                this.suggestSelEl.selectedIndex = 0;
                // Show/hide the fetch button
                const fetchBtn = this.suggestRow.querySelector<HTMLButtonElement>('.mcm-fetch-btn');
                if (fetchBtn) fetchBtn.classList.toggle('agent-u-hidden', !hasFetchFetch);
            }
        }

        // Update inline field hints
        if (this.apiKeyDescEl) {
            const hints: Record<string, string> = {
                anthropic: t('modal.modelConfig.keyHint.anthropic'),
                openai: t('modal.modelConfig.keyHint.openai'),
                gemini: t('modal.modelConfig.keyHint.gemini'),
                openrouter: t('modal.modelConfig.keyHint.openrouter'),
                azure: t('modal.modelConfig.keyHint.azure'),
                custom: t('modal.modelConfig.keyHint.local'),
            };
            this.apiKeyDescEl.setText(hints[p] ?? '');
        }
        if (this.baseUrlDescEl) {
            const hints: Record<string, string> = {
                ollama: t('modal.modelConfig.urlHint.ollama'),
                lmstudio: t('modal.modelConfig.urlHint.lmstudio'),
                azure: t('modal.modelConfig.urlHint.azure'),
                custom: t('modal.modelConfig.urlHint.custom'),
            };
            this.baseUrlDescEl.setText(hints[p] ?? '');
        }
        if (this.baseUrlInputEl) {
            const placeholders: Partial<Record<ProviderType, string>> = {
                anthropic: 'https://api.anthropic.com',
                ollama: 'http://localhost:11434',
                lmstudio: 'http://localhost:1234',
                azure: 'https://your-resource.openai.azure.com',
                custom: 'https://your-openai-compatible-endpoint/v1',
            };
            this.baseUrlInputEl.placeholder = placeholders[p] ?? '';
        }

        // Update Copilot auth status when visible
        if (isCopilot && this.copilotAuthRow) {
            this.updateCopilotAuthStatus();
        }

        // Update Kilo auth status when visible
        if (isKilo && this.kiloAuthRow) {
            this.updateKiloAuthStatus();
        }

        // Update ChatGPT OAuth auth status when visible
        if (isChatGpt && this.chatgptOAuthRow) {
            this.updateChatGptOAuthStatus();
        }

        // Render provider setup guide
        this.providerGuideEl.empty();
        this.renderProviderGuide(this.providerGuideEl, p);
        this.updateTemperatureUI();
    }

    private updateTemperatureUI(): void {
        if (!this.temperatureRow || !this.temperatureSliderEl || this.forEmbedding) return;
        const fixed = isTemperatureFixed(this.formProvider, this.formName);
        const max = maxTemperature(this.formProvider);

        // Clamp current value to provider max
        if (this.formTemperatureValue > max) {
            this.formTemperatureValue = max;
            this.temperatureSliderEl.value = String(max);
            if (this.temperatureValueEl) this.temperatureValueEl.setText(max.toFixed(2));
        }
        this.temperatureSliderEl.max = String(max);

        if (fixed) {
            this.formTemperatureEnabled = false;
            this.formTemperatureValue = 1.0;
            this.temperatureSliderEl.value = '1';
            this.temperatureSliderEl.disabled = true;
            if (this.temperatureValueEl) this.temperatureValueEl.setText('1.00');
            if (this.temperatureNoteEl) {
                this.temperatureNoteEl.setText(t('modal.modelConfig.temperatureFixed'));
                this.temperatureNoteEl.classList.remove('agent-u-hidden');
            }
            this.temperatureRow.querySelectorAll('input[type=checkbox]').forEach((el: Element) => {
                (el as HTMLInputElement).checked = false;
                (el as HTMLInputElement).disabled = true;
            });
        } else if (this.formThinkingEnabled && (this.formProvider === 'anthropic' || (this.formProvider === 'github-copilot' && /^claude/i.test(this.formName)))) {
            // Extended thinking forces temperature to 1
            if (this.temperatureNoteEl) {
                this.temperatureNoteEl.setText(t('modal.modelConfig.temperatureThinkingNote'));
                this.temperatureNoteEl.classList.remove('agent-u-hidden');
            }
        } else {
            if (this.temperatureNoteEl) this.temperatureNoteEl.classList.add('agent-u-hidden');
            this.temperatureRow.querySelectorAll('input[type=checkbox]').forEach((el: Element) => {
                (el as HTMLInputElement).disabled = false;
            });
            this.temperatureSliderEl.disabled = !this.formTemperatureEnabled;
        }

        const sliderWrap = this.temperatureSliderEl.closest<HTMLElement>('.mcm-temperature-slider-wrap');
        if (sliderWrap) sliderWrap.classList.toggle('agent-u-hidden', !this.formTemperatureEnabled);
    }

    /**
     * Cap the Max Output Tokens slider to the model's real output ceiling (when
     * we have a registry entry) so the user cannot pick a value the API rejects.
     * Unknown models (custom, local, gateway-routed) keep the wide default range
     * — the provider layer clamps anyway via resolveOutputBudget.
     */
    private updateMaxTokensSliderRange(): void {
        if (!this.maxTokensSliderEl) return;
        const cap = getModelOutputCeiling(this.formName) ?? 200_000;
        this.maxTokensSliderEl.max = String(cap);
        if (this.formMaxTokens > cap) this.formMaxTokens = cap;
        if (this.formMaxTokens < 1024) this.formMaxTokens = 1024;
        this.maxTokensSliderEl.value = String(this.formMaxTokens);
        if (this.maxTokensValueEl) this.maxTokensValueEl.setText(this.formMaxTokens.toLocaleString());
        this.refreshMaxTokensRecBtn();
    }

    /** Show/hide the "use recommended" button depending on whether the slider is already there. */
    private refreshMaxTokensRecBtn(): void {
        if (!this.maxTokensRecBtnEl) return;
        const rec = recommendedMaxTokens(this.formName);
        const show = rec !== this.formMaxTokens && this.formName.length > 0;
        this.maxTokensRecBtnEl.classList.toggle('agent-u-hidden', !show);
        this.maxTokensRecBtnEl.setText(show ? t('modal.modelConfig.maxTokensUseRecommended', { value: rec.toLocaleString() }) : '');
    }

    /** Hide the manual max_tokens slider when "automatic" is selected. */
    private updateMaxTokensVisibility(): void {
        this.maxTokensManualWrap?.classList.toggle('agent-u-hidden', this.formAutoMaxTokens);
    }

    private updateThinkingUI(): void {
        if (!this.thinkingBudgetRow || !this.thinkingNoteEl) return;
        this.thinkingBudgetRow.classList.toggle('agent-u-hidden', !this.formThinkingEnabled);
        if (this.formThinkingEnabled) {
            // Check if budget exceeds maxTokens and show appropriate message
            if (this.formThinkingBudgetTokens > this.formMaxTokens) {
                this.thinkingNoteEl.setText(
                    `${t('modal.modelConfig.thinkingNote')} ⚠️ Max Tokens was automatically increased to ${this.formMaxTokens.toLocaleString()}.`
                );
            } else {
                this.thinkingNoteEl.setText(t('modal.modelConfig.thinkingNote'));
            }
            this.thinkingNoteEl.classList.remove('agent-u-hidden');
        } else {
            this.thinkingNoteEl.classList.add('agent-u-hidden');
        }
    }

    private renderProviderGuide(container: HTMLElement, provider: ProviderType): void {
        const guide = container.createDiv('mcm-guide-inner');

        if (provider === 'anthropic') {
            guide.createEl('strong', { text: t('guide.anthropic.heading') });
            const steps = guide.createEl('ol', { cls: 'mcm-guide-steps' });
            steps.createEl('li', { text: t('guide.anthropic.step1') });
            steps.createEl('li', { text: t('guide.anthropic.step2') });
            steps.createEl('li', { text: t('guide.anthropic.step3') });
            steps.createEl('li', { text: t('guide.anthropic.step4') });
            guide.createDiv({ cls: 'mcm-guide-tip', text: t('guide.anthropic.tip') });

        } else if (provider === 'openai') {
            guide.createEl('strong', { text: t('guide.openai.heading') });
            const steps = guide.createEl('ol', { cls: 'mcm-guide-steps' });
            steps.createEl('li', { text: t('guide.openai.step1') });
            steps.createEl('li', { text: t('guide.openai.step2') });
            steps.createEl('li', { text: t('guide.openai.step3') });
            steps.createEl('li', { text: t('guide.openai.step4') });
            guide.createDiv({ cls: 'mcm-guide-tip', text: t('guide.openai.tip') });

        } else if (provider === 'gemini') {
            guide.createEl('strong', { text: t('guide.gemini.heading') });
            const steps = guide.createEl('ol', { cls: 'mcm-guide-steps' });
            steps.createEl('li', { text: t('guide.gemini.step1') });
            steps.createEl('li', { text: t('guide.gemini.step2') });
            steps.createEl('li', { text: t('guide.gemini.step3') });
            guide.createDiv({ cls: 'mcm-guide-tip', text: t('guide.gemini.tip') });

        } else if (provider === 'ollama') {
            guide.createEl('strong', { text: t('guide.ollama.heading') });
            const steps = guide.createEl('ol', { cls: 'mcm-guide-steps' });
            steps.createEl('li', { text: t('guide.ollama.step1') });
            steps.createEl('li', { text: t('guide.ollama.step2') });
            steps.createEl('li', { text: t('guide.ollama.step3') });
            steps.createEl('li', { text: t('guide.ollama.step4') });
            guide.createDiv({ cls: 'mcm-guide-tip', text: t('guide.ollama.tip') });

        } else if (provider === 'openrouter') {
            guide.createEl('strong', { text: t('guide.openrouter.heading') });
            const steps = guide.createEl('ol', { cls: 'mcm-guide-steps' });
            steps.createEl('li', { text: t('guide.openrouter.step1') });
            steps.createEl('li', { text: t('guide.openrouter.step2') });
            steps.createEl('li', { text: t('guide.openrouter.step3') });
            steps.createEl('li', { text: t('guide.openrouter.step4') });
            steps.createEl('li', { text: t('guide.openrouter.step5') });
            guide.createDiv({ cls: 'mcm-guide-tip', text: t('guide.openrouter.tip') });

        } else if (provider === 'azure') {
            guide.createEl('strong', { text: t('guide.azure.heading') });
            const steps = guide.createEl('ol', { cls: 'mcm-guide-steps' });
            steps.createEl('li', { text: t('guide.azure.step1') });
            steps.createEl('li', { text: t('guide.azure.step2') });
            steps.createEl('li', { text: t('guide.azure.step3') });
            steps.createEl('li', { text: t('guide.azure.step4') });
            steps.createEl('li', { text: t('guide.azure.step5') });
            guide.createDiv({ cls: 'mcm-guide-tip', text: t('guide.azure.tip') });

        } else if (provider === 'lmstudio') {
            guide.createEl('strong', { text: t('guide.lmstudio.heading') });
            const steps = guide.createEl('ol', { cls: 'mcm-guide-steps' });
            steps.createEl('li', { text: t('guide.lmstudio.step1') });
            steps.createEl('li', { text: t('guide.lmstudio.step2') });
            steps.createEl('li', { text: t('guide.lmstudio.step3') });
            steps.createEl('li', { text: t('guide.lmstudio.step4') });
            guide.createDiv({ cls: 'mcm-guide-tip', text: t('guide.lmstudio.tip') });

        } else if (provider === 'github-copilot') {
            guide.createEl('strong', { text: t('guide.copilot.heading') });
            const steps = guide.createEl('ol', { cls: 'mcm-guide-steps' });
            steps.createEl('li', { text: t('guide.copilot.step1') });
            steps.createEl('li', { text: t('guide.copilot.step2') });
            steps.createEl('li', { text: t('guide.copilot.step3') });
            guide.createDiv({ cls: 'mcm-guide-tip', text: t('guide.copilot.disclaimer') });

        } else if (provider === 'bedrock') {
            const bedrockHeading = guide.createEl('strong');
            bedrockHeading.appendText('Amazon Bedrock setup');
            const steps = guide.createEl('ol', { cls: 'mcm-guide-steps' });
            const bedrockStep1 = steps.createEl('li');
            bedrockStep1.appendText('In the AWS console, open Bedrock in your preferred region and request access to the model families you need on the model access page. Approval is usually instant for the common foundation models.');
            const bedrockStep2 = steps.createEl('li');
            bedrockStep2.appendText('Pick an authentication method. The Bedrock API key is a single bearer token copied once from the Bedrock console. The IAM access key + secret is the classic flow if you already have one set up.');
            const bedrockStep3 = steps.createEl('li');
            bedrockStep3.appendText('Pick the region that hosts your access. For the EU, the Frankfurt region is the common choice.');
            const bedrockStep4 = steps.createEl('li');
            bedrockStep4.appendText('Pick a model from the quick pick dropdown. The EU cross-region inference profiles work from any EU region, and the US profiles cover US regions.');
            guide.createDiv({
                cls: 'mcm-guide-tip',
                text: 'Tip: Frankfurt combined with an EU inference profile gives the lowest latency from Europe while keeping data inside the EU.',
            });

        } else if (provider === 'custom') {
            guide.createEl('strong', { text: t('guide.custom.heading') });
            const table = guide.createEl('table', { cls: 'mcm-guide-table' });
            const rows: [string, string, string][] = [
                ['Mistral', 'Get key at console.mistral.ai \u2192 API Keys', 'https://api.mistral.ai/v1'],
                ['Groq', 'Get key at console.groq.com \u2192 API Keys', 'https://api.groq.com/openai/v1'],
                ['OpenRouter', 'Get key at openrouter.ai \u2192 Keys', 'https://openrouter.ai/api/v1'],
            ];
            rows.forEach(([service, hint, url]) => {
                const tr = table.createEl('tr');
                tr.createEl('td', { text: service, cls: 'mcm-guide-service' });
                const td = tr.createEl('td');
                td.createSpan({ text: hint });
                tr.createEl('td', { cls: 'mcm-guide-url' }).createEl('code', { text: url });
            });
            guide.createDiv({ cls: 'mcm-guide-tip', text: t('guide.custom.tip') });
        }
    }

    private buildOllamaBrowser(container: HTMLElement): void {
        const browseBtn = container.createEl('button', { cls: 'mcm-browse-btn' });
        setIcon(browseBtn.createSpan('mcm-browse-icon'), 'list');
        const browseLabelEl = browseBtn.createSpan({ text: t('modal.modelConfig.browseInstalled') });

        const listEl = container.createDiv('mcm-model-list');
        listEl.classList.add('agent-u-hidden');

        browseBtn.addEventListener('click', () => { void (async () => {
            browseBtn.disabled = true;
            browseLabelEl.setText(t('modal.modelConfig.loadingModels'));
            listEl.empty();
            try {
                const baseUrl = this.formBaseUrl || 'http://localhost:11434';
                const models = await fetchOllamaModels(baseUrl);
                listEl.classList.remove('agent-u-hidden');
                if (models.length === 0) {
                    listEl.createDiv({ cls: 'mcm-model-empty', text: t('modal.modelConfig.noModelsOllama') });
                } else {
                    models.forEach((name) => {
                        const item = listEl.createEl('button', { cls: 'mcm-model-item', text: name });
                        item.addEventListener('click', () => {
                            this.formName = name;
                            if (this.nameInputEl) this.nameInputEl.value = name;
                            // IMP-18-01-01: capability lookup is model-id sensitive.
                            this.updateFieldVisibility();
                            item.addClass('mcm-model-item-selected');
                            listEl.querySelectorAll('.mcm-model-item').forEach((el: Element) => {
                                if (el !== item) el.removeClass('mcm-model-item-selected');
                            });
                        });
                    });
                }
            } catch {
                listEl.classList.remove('agent-u-hidden');
                listEl.createDiv({
                    cls: 'mcm-model-empty',
                    text: t('modal.modelConfig.ollamaUnreachable'),
                });
            }
            browseBtn.disabled = false;
            browseLabelEl.setText(t('modal.modelConfig.browseInstalled'));
        })(); });
    }

    /** Browse models from an OpenAI-compatible local or remote server (LM Studio, Mistral, Groq...) */
    private buildCustomBrowser(container: HTMLElement): void {
        const browseBtn = container.createEl('button', { cls: 'mcm-browse-btn' });
        setIcon(browseBtn.createSpan('mcm-browse-icon'), 'list');
        const browseLabelEl = browseBtn.createSpan({ text: t('modal.modelConfig.browseAvailable') });

        const listEl = container.createDiv('mcm-model-list');
        listEl.classList.add('agent-u-hidden');

        browseBtn.addEventListener('click', () => { void (async () => {
            browseBtn.disabled = true;
            browseLabelEl.setText(t('modal.modelConfig.loadingModels'));
            listEl.empty();
            try {
                const models = await fetchProviderModels('custom', this.formApiKey, this.formBaseUrl || undefined);
                listEl.classList.remove('agent-u-hidden');
                if (models.length === 0) {
                    listEl.createDiv({ cls: 'mcm-model-empty', text: t('modal.modelConfig.noModelsUrl') });
                } else {
                    models.forEach(({ id }) => {
                        const item = listEl.createEl('button', { cls: 'mcm-model-item', text: id });
                        item.addEventListener('click', () => {
                            this.formName = id;
                            if (this.nameInputEl) this.nameInputEl.value = id;
                            // IMP-18-01-01: capability lookup is model-id sensitive.
                            this.updateFieldVisibility();
                            item.addClass('mcm-model-item-selected');
                            listEl.querySelectorAll('.mcm-model-item').forEach((el: Element) => {
                                if (el !== item) el.removeClass('mcm-model-item-selected');
                            });
                        });
                    });
                }
            } catch (e: unknown) {
                listEl.classList.remove('agent-u-hidden');
                const errMsg = (e as { message?: string })?.message ?? 'Unknown error';
                listEl.createDiv({
                    cls: 'mcm-model-empty',
                    text: t('modal.modelConfig.serverUnreachable', { error: errMsg }),
                });
            }
            browseBtn.disabled = false;
            browseLabelEl.setText(t('modal.modelConfig.browseAvailable'));
        })(); });
    }

    private async runTest(): Promise<void> {
        if (!this.testBtn || !this.testResultEl) return;
        const isBedrock = this.formProvider === 'bedrock';
        const bedrockIsApiKey = isBedrock && this.formAwsAuthMode === 'api-key';
        const m: CustomModel = {
            name: this.formName || this.model.name,
            provider: this.formProvider,
            apiKey: isBedrock ? undefined : (this.formApiKey || undefined),
            // Bedrock reuses baseUrl for the optional endpoint URL.
            baseUrl: isBedrock
                ? (this.formAwsEndpoint || undefined)
                : (this.formBaseUrl || undefined),
            apiVersion: this.formApiVersion || undefined,
            enabled: true,
            // Bedrock-specific fields -- without these, testModelConnection's
            // pre-validation fails with "AWS region required" even when the
            // dropdown shows a region, because runTest wouldn't otherwise pass
            // them through.
            awsRegion: isBedrock ? (this.formAwsRegion || undefined) : undefined,
            awsAuthMode: isBedrock ? this.formAwsAuthMode : undefined,
            awsApiKey: bedrockIsApiKey ? (this.formAwsApiKey || undefined) : undefined,
            awsAccessKey: isBedrock && !bedrockIsApiKey ? (this.formAwsAccessKey || undefined) : undefined,
            awsSecretKey: isBedrock && !bedrockIsApiKey ? (this.formAwsSecretKey || undefined) : undefined,
            awsSessionToken: isBedrock && !bedrockIsApiKey ? (this.formAwsSessionToken || undefined) : undefined,
        };
        if (!m.name) { this.showTestResult(false, t('modal.modelConfig.enterModelIdFirst'), undefined); return; }
        this.testBtn.disabled = true;
        this.testBtn.setText(t('modal.modelConfig.testing'));
        this.testResultEl.classList.add('agent-u-hidden');
        const res = this.forEmbedding
            ? await testEmbeddingConnection(m)
            : await testModelConnection(m);
        this.testBtn.disabled = false;
        this.testBtn.setText(t('modal.modelConfig.testConnection'));
        this.showTestResult(res.ok, res.message, res.detail);
    }

    private showTestResult(ok: boolean, msg: string, detail: string | undefined): void {
        if (!this.testResultEl) return;
        this.testResultEl.empty();
        this.testResultEl.classList.remove('agent-u-hidden');
        this.testResultEl.className = `mcm-test-result ${ok ? 'mcm-ok' : 'mcm-err'}`;
        const header = this.testResultEl.createDiv('mcm-result-header');
        setIcon(header.createSpan('mcm-result-icon'), ok ? 'check-circle' : 'x-circle');
        header.createSpan({ text: msg });
        if (detail) {
            this.testResultEl.createDiv({ cls: 'mcm-result-detail', text: detail });
        }
    }

    // ---------------------------------------------------------------------------
    // GitHub Copilot Auth Section
    // ---------------------------------------------------------------------------

    private buildCopilotAuthSection(container: HTMLElement): void {
        const label = container.createDiv('mcm-label');
        label.createSpan({ text: t('copilot.auth') });
        label.createSpan({ text: t('copilot.authDesc'), cls: 'mcm-desc' });

        const controls = container.createDiv('mcm-copilot-controls');

        // Status badge
        controls.createDiv({ cls: 'mcm-copilot-status' });

        // Sign in button
        const signInBtn = controls.createEl('button', {
            cls: 'mcm-copilot-signin',
            text: t('copilot.signIn'),
        });
        signInBtn.addEventListener('click', () => { void this.startCopilotAuth(signInBtn); });

        // Sign out button
        const signOutBtn = controls.createEl('button', {
            cls: 'mcm-copilot-signout',
            text: t('copilot.signOut'),
        });
        signOutBtn.addEventListener('click', () => { void (async () => {
            const authService = GitHubCopilotAuthService.getInstance();
            await authService.logout();
            this.updateCopilotAuthStatus();
            new Notice(t('copilot.signedOut'));
        })(); });
    }

    private updateCopilotAuthStatus(): void {
        if (!this.copilotAuthRow) return;
        const authService = GitHubCopilotAuthService.getInstance();
        const isAuth = authService.isAuthenticated();

        const statusEl = this.copilotAuthRow.querySelector<HTMLElement>('.mcm-copilot-status');
        if (statusEl) {
            statusEl.empty();
            statusEl.classList.toggle('mcm-copilot-status--connected', isAuth);
            statusEl.classList.toggle('mcm-copilot-status--disconnected', !isAuth);
            statusEl.createSpan({ text: isAuth ? t('copilot.authenticated') : t('copilot.notConnected') });
        }

        const signInBtn = this.copilotAuthRow.querySelector<HTMLElement>('.mcm-copilot-signin');
        const signOutBtn = this.copilotAuthRow.querySelector<HTMLElement>('.mcm-copilot-signout');
        if (signInBtn) signInBtn.classList.toggle('agent-u-hidden', isAuth);
        if (signOutBtn) signOutBtn.classList.toggle('agent-u-hidden', !isAuth);
    }

    private async startCopilotAuth(btn: HTMLButtonElement): Promise<void> {
        const authService = GitHubCopilotAuthService.getInstance();
        btn.disabled = true;
        btn.setText(t('copilot.polling'));

        try {
            const flow = await authService.startDeviceFlow();

            // Show device code in a Notice
            new Notice(
                `${t('copilot.deviceCodeNotice')}\n\n${flow.userCode}\n\n${flow.verificationUri}`,
                0, // persistent until dismissed
            );

            // Open verification URL in browser
            window.open(flow.verificationUri);

            // Poll for access token
            await authService.pollForAccessToken(flow.deviceCode, flow.interval);

            new Notice(t('copilot.authSuccess'));
            this.updateCopilotAuthStatus();

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(t('copilot.authFailed', { error: msg }));
        } finally {
            btn.disabled = false;
            btn.setText(t('copilot.signIn'));
        }
    }

    // ---------------------------------------------------------------------------
    // ChatGPT OAuth Auth Section (EPIC-021)
    // ---------------------------------------------------------------------------

    private buildChatGptOAuthSection(container: HTMLElement): void {
        const label = container.createDiv('mcm-label');
        label.createSpan({ text: t('chatgpt.auth') });
        const desc = label.createSpan({ cls: 'mcm-desc' });
        desc.setText(t('chatgpt.authDesc'));

        const controls = container.createDiv('mcm-chatgpt-controls');

        // Status badge
        controls.createDiv({ cls: 'mcm-chatgpt-status' });

        // Sign in button
        const signInBtn = controls.createEl('button', {
            cls: 'mcm-chatgpt-signin',
            text: t('chatgpt.signIn'),
        });
        signInBtn.addEventListener('click', () => { void this.startChatGptOAuth(signInBtn); });

        // Sign out button
        const signOutBtn = controls.createEl('button', {
            cls: 'mcm-chatgpt-signout',
            text: t('chatgpt.signOut'),
        });
        signOutBtn.addEventListener('click', () => { void (async () => {
            const auth = ChatGptOAuthService.getInstance();
            await auth.logout();
            this.updateChatGptOAuthStatus();
            new Notice(t('chatgpt.signedOut'));
        })(); });
    }

    private updateChatGptOAuthStatus(): void {
        if (!this.chatgptOAuthRow) return;
        const auth = ChatGptOAuthService.getInstance();
        const isAuth = auth.isAuthenticated();
        const supported = auth.isPlatformSupported();

        const statusEl = this.chatgptOAuthRow.querySelector<HTMLElement>('.mcm-chatgpt-status');
        if (statusEl) {
            statusEl.empty();
            statusEl.classList.toggle('mcm-chatgpt-status--connected', isAuth);
            statusEl.classList.toggle('mcm-chatgpt-status--disconnected', !isAuth);
            if (!supported) {
                statusEl.createSpan({ text: t('chatgpt.unsupportedPlatform') });
            } else if (isAuth) {
                const info = auth.getAccountInfo();
                const planLabel = info.planTier === 'pro' ? 'ChatGPT Pro'
                    : info.planTier === 'plus' ? 'ChatGPT Plus'
                    : 'ChatGPT';
                const text = info.email ? `${planLabel} (${info.email})` : planLabel;
                statusEl.createSpan({ text });
            } else {
                statusEl.createSpan({ text: t('chatgpt.notConnected') });
            }
        }

        const signInBtn = this.chatgptOAuthRow.querySelector<HTMLElement>('.mcm-chatgpt-signin');
        const signOutBtn = this.chatgptOAuthRow.querySelector<HTMLElement>('.mcm-chatgpt-signout');
        if (signInBtn) {
            signInBtn.classList.toggle('agent-u-hidden', isAuth || !supported);
        }
        if (signOutBtn) {
            signOutBtn.classList.toggle('agent-u-hidden', !isAuth);
        }
    }

    private async startChatGptOAuth(btn: HTMLButtonElement): Promise<void> {
        const auth = ChatGptOAuthService.getInstance();
        btn.disabled = true;
        btn.setText(t('chatgpt.polling'));

        try {
            const flow = await auth.startAuthFlow();
            // Force the OS default browser. window.open() lands inside Obsidian's
            // built-in webview, which breaks federated logins (Microsoft SSO,
            // Google Workspace) because those identity providers refuse the
            // embedded webview's user-agent. shell.openExternal hands the URL
            // to the OS, which resolves it via the user's default browser.
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron shell only loadable via dynamic require in the renderer
            const electron = require('electron') as { shell?: { openExternal: (url: string) => Promise<void> } };
            if (electron.shell?.openExternal) {
                await electron.shell.openExternal(flow.authorizeUrl);
            } else {
                window.open(flow.authorizeUrl);
            }
            new Notice(t('chatgpt.openedBrowser'), 5000);
            await flow.completion;
            new Notice(t('chatgpt.authSuccess'));
            this.updateChatGptOAuthStatus();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(t('chatgpt.authFailed', { error: msg }));
        } finally {
            btn.disabled = false;
            btn.setText(t('chatgpt.signIn'));
        }
    }

    // ---------------------------------------------------------------------------
    // Kilo Gateway Auth Section
    // ---------------------------------------------------------------------------

    private buildKiloAuthSection(container: HTMLElement): void {
        const label = container.createDiv('mcm-label');
        label.createSpan({ text: t('kilo.auth') });
        label.createSpan({ text: t('kilo.authDesc'), cls: 'mcm-desc' });

        const controls = container.createDiv('mcm-kilo-controls');

        // Status badge
        controls.createDiv({ cls: 'mcm-kilo-status' });

        // Sign in button (Device Flow)
        const signInBtn = controls.createEl('button', {
            cls: 'mcm-kilo-signin',
            text: t('kilo.signIn'),
        });
        signInBtn.addEventListener('click', () => { void this.startKiloDeviceAuth(signInBtn); });

        // Manual token button
        const manualBtn = controls.createEl('button', {
            cls: 'mcm-kilo-manual',
            text: t('kilo.manualToken'),
        });
        manualBtn.addEventListener('click', () => { void this.showKiloManualTokenInput(controls); });

        // Disconnect button
        const disconnectBtn = controls.createEl('button', {
            cls: 'mcm-kilo-signout',
            text: t('kilo.disconnect'),
        });
        disconnectBtn.addEventListener('click', () => { void (async () => {
            await KiloAuthService.getInstance().disconnect();
            this.updateKiloAuthStatus();
            new Notice(t('kilo.disconnected'));
        })(); });

        this.updateKiloAuthStatus();
    }

    private updateKiloAuthStatus(): void {
        if (!this.kiloAuthRow) return;
        const authService = KiloAuthService.getInstance();
        const isAuth = authService.isAuthenticated();
        const session = authService.getSession();

        const statusEl = this.kiloAuthRow.querySelector<HTMLElement>('.mcm-kilo-status');
        if (statusEl) {
            statusEl.empty();
            statusEl.classList.toggle('mcm-copilot-status--connected', isAuth);
            statusEl.classList.toggle('mcm-copilot-status--disconnected', !isAuth);
            const label = isAuth && session.accountLabel
                ? t('kilo.authenticated', { account: session.accountLabel })
                : isAuth
                    ? t('kilo.authenticatedNoLabel')
                    : t('kilo.notConnected');
            statusEl.createSpan({ text: label });
        }

        const signInBtn = this.kiloAuthRow.querySelector<HTMLElement>('.mcm-kilo-signin');
        const manualBtn = this.kiloAuthRow.querySelector<HTMLElement>('.mcm-kilo-manual');
        const disconnectBtn = this.kiloAuthRow.querySelector<HTMLElement>('.mcm-kilo-signout');
        if (signInBtn) signInBtn.classList.toggle('agent-u-hidden', isAuth);
        if (manualBtn) manualBtn.classList.toggle('agent-u-hidden', isAuth);
        if (disconnectBtn) disconnectBtn.classList.toggle('agent-u-hidden', !isAuth);
    }

    private async startKiloDeviceAuth(btn: HTMLButtonElement): Promise<void> {
        const authService = KiloAuthService.getInstance();
        btn.disabled = true;
        btn.setText(t('kilo.deviceFlow.waiting'));

        const abort = new AbortController();

        try {
            const flow = await authService.startDeviceAuth();

            // Code und URL dem Nutzer anzeigen
            new Notice(
                `${t('kilo.deviceFlow.openBrowser')}\n\n${t('kilo.deviceFlow.code', { code: flow.userCode })}\n\n${flow.verificationUri}`,
                0,
            );

            window.open(flow.verificationUri);

            await authService.pollForSession(flow.deviceCode, abort.signal);

            new Notice(t('kilo.deviceFlow.success'));
            this.updateKiloAuthStatus();

        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg !== 'Authorization cancelled') {
                new Notice(t('kilo.deviceFlow.failed', { error: msg }));
            }
        } finally {
            btn.disabled = false;
            btn.setText(t('kilo.signIn'));
        }
    }

    private showKiloManualTokenInput(controls: HTMLElement): void {
        // Vorhandenes Inline-Input entfernen
        controls.querySelector('.mcm-kilo-token-input-row')?.remove();

        const row = controls.createDiv('mcm-kilo-token-input-row');
        const input = row.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'password', placeholder: t('kilo.manualTokenPlaceholder') },
        });

        const confirmBtn = row.createEl('button', { text: t('kilo.manualTokenConfirm') });
        confirmBtn.addEventListener('click', () => { void (async () => {
            const token = input.value.trim();
            if (!token) return;
            confirmBtn.disabled = true;
            confirmBtn.setText(t('kilo.manualTokenValidating'));
            try {
                await KiloAuthService.getInstance().validateAndSetManualToken(token);
                row.remove();
                this.updateKiloAuthStatus();
                new Notice(t('kilo.deviceFlow.success'));
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                new Notice(t('kilo.manualTokenInvalid', { error: msg }));
                confirmBtn.disabled = false;
                confirmBtn.setText(t('kilo.manualTokenConfirm'));
            }
        })(); });

        const cancelBtn = row.createEl('button', { text: t('modal.modelConfig.cancel') });
        cancelBtn.addEventListener('click', () => row.remove());

        input.focus();
    }

    // ---------------------------------------------------------------------------
    // Amazon Bedrock Auth Section
    // ---------------------------------------------------------------------------

    private bedrockApiKeyRow: HTMLElement | null = null;
    private bedrockAccessKeyRow: HTMLElement | null = null;
    private bedrockSecretKeyRow: HTMLElement | null = null;
    private bedrockSessionTokenRow: HTMLElement | null = null;

    private buildBedrockAuthSection(container: HTMLElement): void {
        const BEDROCK_REGIONS: { id: string; label: string }[] = [
            { id: 'eu-central-1',  label: 'Europe, Frankfurt (eu-central-1)' },
            { id: 'eu-west-1',     label: 'Europe, Ireland (eu-west-1)' },
            { id: 'eu-west-2',     label: 'Europe, London (eu-west-2)' },
            { id: 'eu-west-3',     label: 'Europe, Paris (eu-west-3)' },
            { id: 'eu-north-1',    label: 'Europe, Stockholm (eu-north-1)' },
            { id: 'us-east-1',     label: 'US, N. Virginia (us-east-1)' },
            { id: 'us-east-2',     label: 'US, Ohio (us-east-2)' },
            { id: 'us-west-2',     label: 'US, Oregon (us-west-2)' },
            { id: 'ap-northeast-1', label: 'Asia Pacific, Tokyo (ap-northeast-1)' },
            { id: 'ap-southeast-1', label: 'Asia Pacific, Singapore (ap-southeast-1)' },
            { id: 'ap-southeast-2', label: 'Asia Pacific, Sydney (ap-southeast-2)' },
        ];

        const mkRow = (label: string, desc?: string): HTMLElement => {
            const r = container.createDiv('mcm-row');
            const labelEl = r.createDiv('mcm-label');
            labelEl.createSpan({ text: label });
            if (desc) labelEl.createSpan({ text: desc, cls: 'mcm-desc' });
            return r;
        };

        // ── Authentication method ────────────────────────────────────────
        const authRow = mkRow(
            'Authentication',
            'Bedrock API key is the new AWS bearer-token scheme and works with a single token. Access key + secret is the classic IAM flow.',
        );
        const authSel = authRow.createEl('select', { cls: 'mcm-select' });
        authSel.createEl('option', { value: 'api-key',    text: 'Bedrock API key (bearer token, recommended)' });
        authSel.createEl('option', { value: 'access-key', text: 'Access key + secret key' });
        authSel.value = this.formAwsAuthMode;
        authSel.addEventListener('change', () => {
            this.formAwsAuthMode = authSel.value as 'api-key' | 'access-key';
            this.updateBedrockAuthVisibility();
        });

        // ── Region ────────────────────────────────────────────────────────
        const regionRow = mkRow(
            'Region',
            'The AWS region hosting your Bedrock access. Cross-region inference profiles (eu., us.) route across regions in that geography.',
        );
        const regionSel = regionRow.createEl('select', { cls: 'mcm-select' });
        BEDROCK_REGIONS.forEach(({ id, label }) => {
            const opt = regionSel.createEl('option', { value: id, text: label });
            if (id === this.formAwsRegion) opt.selected = true;
        });
        regionSel.addEventListener('change', () => {
            this.formAwsRegion = regionSel.value;
        });

        // ── Custom endpoint URL (optional) ───────────────────────────────
        const endpointRow = mkRow(
            'Endpoint URL',
            'Optional. Leave empty to use the default regional endpoint. Set explicitly for VPC endpoints or providers like https://bedrock-runtime.eu-central-1.amazonaws.com.',
        );
        const endpointInput = endpointRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'text', placeholder: 'https://bedrock-runtime.eu-central-1.amazonaws.com' },
        });
        endpointInput.value = this.formAwsEndpoint;
        endpointInput.addEventListener('input', () => (this.formAwsEndpoint = endpointInput.value.trim()));

        // ── Bedrock API key (bearer token) ───────────────────────────────
        this.bedrockApiKeyRow = mkRow(
            'Bedrock API key',
            'Paste the bearer token from the Bedrock console or from the AWS_BEARER_TOKEN_BEDROCK environment variable.',
        );
        const apiKeyInput = this.bedrockApiKeyRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'password', placeholder: 'Paste your API key' },
        });
        apiKeyInput.value = this.formAwsApiKey;
        apiKeyInput.addEventListener('input', () => (this.formAwsApiKey = apiKeyInput.value.trim()));

        // ── Access key ID (classic mode) ─────────────────────────────────
        this.bedrockAccessKeyRow = mkRow(
            'Access key ID',
            'From IAM → users → security credentials. Requires the invoke model and invoke model with response stream actions.',
        );
        const akInput = this.bedrockAccessKeyRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'text', placeholder: 'Paste your access key ID' },
        });
        akInput.value = this.formAwsAccessKey;
        akInput.addEventListener('input', () => (this.formAwsAccessKey = akInput.value.trim()));

        // ── Secret access key (classic mode) ─────────────────────────────
        this.bedrockSecretKeyRow = mkRow('Secret access key');
        const skInput = this.bedrockSecretKeyRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'password', placeholder: 'Paste the secret access key' },
        });
        skInput.value = this.formAwsSecretKey;
        skInput.addEventListener('input', () => (this.formAwsSecretKey = skInput.value.trim()));

        // ── Session token (classic mode, optional) ───────────────────────
        this.bedrockSessionTokenRow = mkRow(
            'Session token',
            'Optional. Only for temporary credentials from AWS SSO or STS.',
        );
        const stInput = this.bedrockSessionTokenRow.createEl('input', {
            cls: 'mcm-input',
            attr: { type: 'password', placeholder: 'Leave empty for long-lived credentials' },
        });
        stInput.value = this.formAwsSessionToken;
        stInput.addEventListener('input', () => (this.formAwsSessionToken = stInput.value.trim()));

        // Apply initial visibility based on current auth mode
        this.updateBedrockAuthVisibility();
    }

    private updateBedrockAuthVisibility(): void {
        const isApiKey = this.formAwsAuthMode === 'api-key';
        this.bedrockApiKeyRow?.classList.toggle('agent-u-hidden', !isApiKey);
        this.bedrockAccessKeyRow?.classList.toggle('agent-u-hidden', isApiKey);
        this.bedrockSecretKeyRow?.classList.toggle('agent-u-hidden', isApiKey);
        this.bedrockSessionTokenRow?.classList.toggle('agent-u-hidden', isApiKey);
    }

    private save(): void {
        const name = this.formName || this.model.name;
        if (!name) { new Notice(t('modal.modelConfig.modelIdRequired')); return; }
        const isBedrock = this.formProvider === 'bedrock';
        const bedrockIsApiKey = isBedrock && this.formAwsAuthMode === 'api-key';
        this.onSave({
            ...this.model,
            name,
            provider: this.formProvider,
            displayName: this.formDisplayName || undefined,
            apiKey: isBedrock ? undefined : (this.formApiKey || undefined),
            // Bedrock re-uses baseUrl for the optional custom endpoint URL.
            baseUrl: isBedrock
                ? (this.formAwsEndpoint || undefined)
                : (this.formBaseUrl || undefined),
            apiVersion: this.formApiVersion || undefined,
            // Auto -> undefined: resolveOutputBudget sizes it per model at request time.
            maxTokens: this.formAutoMaxTokens ? undefined : this.formMaxTokens,
            temperature: this.formTemperatureEnabled ? this.formTemperatureValue : undefined,
            promptCachingEnabled: this.formPromptCachingEnabled || undefined,
            thinkingEnabled: this.formThinkingEnabled || undefined,
            thinkingBudgetTokens: this.formThinkingEnabled ? this.formThinkingBudgetTokens : undefined,
            awsRegion: isBedrock ? (this.formAwsRegion || undefined) : undefined,
            awsAuthMode: isBedrock ? this.formAwsAuthMode : undefined,
            // Only persist credentials matching the selected auth mode so we don't
            // leak a secret access key when the user switched to the bearer path.
            awsApiKey: bedrockIsApiKey ? (this.formAwsApiKey || undefined) : undefined,
            awsAccessKey: isBedrock && !bedrockIsApiKey ? (this.formAwsAccessKey || undefined) : undefined,
            awsSecretKey: isBedrock && !bedrockIsApiKey ? (this.formAwsSecretKey || undefined) : undefined,
            awsSessionToken: isBedrock && !bedrockIsApiKey ? (this.formAwsSessionToken || undefined) : undefined,
        });
        this.close();
    }
}
