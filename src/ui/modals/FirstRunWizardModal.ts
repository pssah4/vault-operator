/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * FirstRunWizardModal -- Phase 2.3.
 *
 * One-shot setup wizard that walks new users through the seven
 * choices the plugin can't sensibly default to: LLM model, embedding
 * model, role models (titling/internal calls/memory/contextual),
 * search provider, and the two optional asset downloads (reranker,
 * self-development source).
 *
 * Auto-opens on plugin load for the first three sessions unless the
 * user has dismissed it or completed it. Also triggerable from the
 * command palette. Every step is skippable; skipped steps appear as
 * inline banners in their respective settings tabs.
 *
 * After the final step closes the modal, the existing OnboardingFlow
 * starts in the sidebar to fill Memory + Soul via chat.
 */

import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { ModelConfigModal } from '../settings/ModelConfigModal';
import type { CustomModel } from '../../types/settings';
import { getModelKey } from '../../types/settings';

type StepId =
    | 'welcome'
    | 'llm-model'
    | 'embedding-model'
    | 'role-models'
    | 'search-provider'
    | 'optional-downloads'
    | 'done';

const STEPS: { id: StepId; title: string; canSkip: boolean }[] = [
    { id: 'welcome',            title: 'Welcome',             canSkip: false },
    { id: 'llm-model',          title: 'LLM model',           canSkip: true  },
    { id: 'embedding-model',    title: 'Embedding model',     canSkip: true  },
    { id: 'role-models',        title: 'Role models',         canSkip: true  },
    { id: 'search-provider',    title: 'Search provider',     canSkip: true  },
    { id: 'optional-downloads', title: 'Optional downloads',  canSkip: true  },
    { id: 'done',               title: 'Done',                canSkip: false },
];

export class FirstRunWizardModal extends Modal {
    private stepIndex = 0;
    private headerEl!: HTMLElement;
    private progressEl!: HTMLElement;
    private bodyEl!: HTMLElement;
    private footerEl!: HTMLElement;

    constructor(app: App, private readonly plugin: ObsidianAgentPlugin) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('vault-operator-wizard');
        this.modalEl.setCssStyles({ maxWidth: '720px' });
        this.headerEl   = contentEl.createDiv({ cls: 'wizard-header' });
        this.progressEl = contentEl.createDiv({ cls: 'wizard-progress' });
        this.bodyEl     = contentEl.createDiv({ cls: 'wizard-body' });
        this.footerEl   = contentEl.createDiv({ cls: 'wizard-footer' });

        void this.renderStep();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private async renderStep(): Promise<void> {
        const step = STEPS[this.stepIndex];

        this.headerEl.empty();
        this.headerEl.createEl('h2', { text: step.title });
        this.headerEl.createDiv({
            cls: 'wizard-step-counter',
            text: `Step ${this.stepIndex + 1} of ${STEPS.length}`,
        });

        this.renderProgress();
        this.bodyEl.empty();
        this.footerEl.empty();

        await this.renderStepBody(step.id);
        this.renderFooter(step);
    }

    private renderProgress(): void {
        this.progressEl.empty();
        STEPS.forEach((_step, idx) => {
            this.progressEl.createDiv({
                cls: `wizard-progress-segment${idx <= this.stepIndex ? ' active' : ''}`,
            });
        });
    }

    private renderFooter(step: { id: StepId; canSkip: boolean }): void {
        const left = this.footerEl.createDiv({ cls: 'wizard-footer-left' });
        const right = this.footerEl.createDiv({ cls: 'wizard-footer-right' });

        if (this.stepIndex > 0 && step.id !== 'done') {
            const backBtn = left.createEl('button', { text: 'Back' });
            backBtn.addEventListener('click', () => {
                this.stepIndex = Math.max(0, this.stepIndex - 1);
                void this.renderStep();
            });
        }

        if (step.id === 'welcome') {
            const dismissBtn = left.createEl('button', { text: "Don't show again" });
            // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
            dismissBtn.addEventListener('click', async () => {
                this.plugin.settings.onboarding.dontShowFirstRunAgain = true;
                await this.plugin.saveSettings();
                this.close();
            });
        }

        if (step.canSkip) {
            const skipBtn = right.createEl('button', { text: 'Skip this step' });
            skipBtn.addEventListener('click', () => { void this.skipStep(); });
        }

        if (step.id === 'done') {
            const finishBtn = right.createEl('button', { cls: 'mod-cta', text: 'Start chat to set up memory' });
            finishBtn.addEventListener('click', () => { void this.finishAndStartChat(); });
            const closeBtn = right.createEl('button', { text: 'Close' });
            closeBtn.addEventListener('click', () => { void this.finishWithoutChat(); });
        } else {
            const nextBtn = right.createEl('button', {
                cls: 'mod-cta',
                text: this.stepIndex === 0 ? 'Get started' : 'Next',
            });
            nextBtn.addEventListener('click', () => { void this.advance(); });
        }
    }

    private async skipStep(): Promise<void> {
        const step = STEPS[this.stepIndex];
        const skipped = this.plugin.settings.onboarding.skippedSteps as string[];
        if (!skipped.includes(step.id)) {
            skipped.push(step.id);
            await this.plugin.saveSettings();
        }
        await this.advance();
    }

    private async advance(): Promise<void> {
        if (this.stepIndex < STEPS.length - 1) {
            this.stepIndex++;
            await this.plugin.saveSettings();
            await this.renderStep();
        }
    }

    private async finishAndStartChat(): Promise<void> {
        this.plugin.settings.onboarding.modalCompleted = true;
        await this.plugin.saveSettings();
        this.close();
        try {
            await this.plugin.startOnboarding();
        } catch (e) {
            console.warn('[FirstRunWizard] Could not start onboarding chat:', e);
        }
    }

    private async finishWithoutChat(): Promise<void> {
        this.plugin.settings.onboarding.modalCompleted = true;
        await this.plugin.saveSettings();
        this.close();
    }

    // -----------------------------------------------------------------------
    // Reusable building blocks (Settings-look)
    // -----------------------------------------------------------------------

    private addInfoBanner(parent: HTMLElement, icon: string, headline: string, body: string): HTMLElement {
        const banner = parent.createDiv({ cls: 'wizard-info-banner' });
        const iconWrap = banner.createDiv({ cls: 'wizard-info-banner-icon' });
        setIcon(iconWrap, icon);
        const text = banner.createDiv({ cls: 'wizard-info-banner-text' });
        text.createEl('strong', { text: headline });
        text.createDiv({ text: body });
        return banner;
    }

    private addSection(parent: HTMLElement, title: string): void {
        parent.createEl('h3', { cls: 'wizard-section', text: title });
    }

    private addStatusLine(parent: HTMLElement, count: number, label: string): HTMLElement {
        const cls = count > 0 ? 'wizard-status is-ok' : 'wizard-status is-empty';
        const status = parent.createDiv({ cls });
        const iconWrap = status.createDiv({ cls: 'wizard-status-icon' });
        setIcon(iconWrap, count > 0 ? 'check-circle-2' : 'circle');
        const text = status.createDiv();
        if (count > 0) {
            text.createEl('strong', { text: `${count} ${label}${count === 1 ? '' : 's'} configured.` });
            text.createSpan({ text: ' You can skip this step.' });
        } else {
            text.createEl('strong', { text: `No ${label} configured yet.` });
            text.createSpan({ text: ' Pick an option below.' });
        }
        return status;
    }

    private addProviderCard(
        parent: HTMLElement,
        opts: { name: string; tier: 'free' | 'paid' | 'recommended'; tierLabel: string; url: string; note: string },
    ): void {
        const card = parent.createDiv({ cls: 'wizard-provider-card' });
        const header = card.createDiv({ cls: 'wizard-provider-header' });
        header.createDiv({ cls: 'wizard-provider-name', text: opts.name });
        const badge = header.createEl('span', { cls: `wizard-provider-badge is-${opts.tier}`, text: opts.tierLabel });
        badge.setAttr('title', opts.tierLabel);
        card.createDiv({ cls: 'wizard-provider-note', text: opts.note });
        if (opts.url) {
            const link = card.createEl('a', { cls: 'wizard-provider-link', text: 'Get an API key', href: opts.url });
            link.setAttr('target', '_blank');
            link.setAttr('rel', 'noopener noreferrer');
        }
    }

    // -----------------------------------------------------------------------
    // Step bodies
    // -----------------------------------------------------------------------

    private async renderStepBody(id: StepId): Promise<void> {
        switch (id) {
            case 'welcome':             return this.renderWelcome();
            case 'llm-model':           return this.renderLlmStep();
            case 'embedding-model':     return this.renderEmbeddingStep();
            case 'role-models':         return this.renderRoleModelsStep();
            case 'search-provider':     return this.renderSearchProviderStep();
            case 'optional-downloads':  return this.renderOptionalDownloadsStep();
            case 'done':                return this.renderDoneStep();
        }
    }

    private renderWelcome(): void {
        this.addInfoBanner(
            this.bodyEl,
            'sparkles',
            'Welcome to Vault Operator',
            'A handful of choices set the plugin up for you. Each step takes a few seconds. You can skip anything and come back to it later in Settings.',
        );

        this.addSection(this.bodyEl, 'What this wizard does');

        const list = this.bodyEl.createEl('ul');
        list.setCssStyles({ paddingLeft: '20px' });
        list.setCssStyles({ margin: '4px 0 8px 0' });
        list.setCssStyles({ lineHeight: '1.7' });
        const items = [
            'Connects an LLM provider so the agent can answer messages.',
            'Picks an embedding model for semantic search and memory.',
            'Splits cheap background tasks from your main model.',
            'Sets up a search provider for web research.',
            'Offers two optional downloads that improve quality.',
        ];
        for (const item of items) {
            list.createEl('li', { text: item });
        }

        const note = this.bodyEl.createDiv();
        note.setCssStyles({ fontSize: '12px' });
        note.setCssStyles({ color: 'var(--text-muted)' });
        note.setCssStyles({ marginTop: '16px' });
        note.setText('Privacy: nothing leaves your machine until you configure a provider. Then only the messages you send to that provider are transmitted.');
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- kept async for caller type consistency
    private async renderLlmStep(): Promise<void> {
        this.addInfoBanner(
            this.bodyEl,
            'brain',
            'Why an LLM is required',
            'The agent uses a large language model for every reply. Pick a provider, grab a free or paid API key, paste it once.',
        );

        this.addSection(this.bodyEl, 'Current status');
        const renderStatus = (parent: HTMLElement): HTMLElement => {
            const count = this.plugin.settings.activeModels.filter(m => m.enabled).length;
            return this.addStatusLine(parent, count, 'LLM model');
        };
        const statusWrap = this.bodyEl.createDiv();
        let statusEl = renderStatus(statusWrap);
        const refresh = () => {
            statusEl.remove();
            statusEl = renderStatus(statusWrap);
        };

        this.addSection(this.bodyEl, 'Where to get an API key');

        this.addProviderCard(this.bodyEl, {
            name: 'Google Gemini',
            tier: 'free',
            tierLabel: 'Free tier',
            url: 'https://aistudio.google.com/app/apikey',
            note: 'Easiest start. Sign in with Google, create an API key, no credit card needed. Good general-purpose quality.',
        });
        this.addProviderCard(this.bodyEl, {
            name: 'Anthropic Claude',
            tier: 'paid',
            tierLabel: 'Paid',
            url: 'https://console.anthropic.com/settings/keys',
            note: 'Best quality for agentic tool use. New accounts get $5 starting credit.',
        });
        this.addProviderCard(this.bodyEl, {
            name: 'OpenAI',
            tier: 'paid',
            tierLabel: 'Paid',
            url: 'https://platform.openai.com/api-keys',
            note: 'Solid all-rounder. GPT-5, GPT-4o and o-series models.',
        });
        this.addProviderCard(this.bodyEl, {
            name: 'Ollama (local)',
            tier: 'free',
            tierLabel: 'Free / local',
            url: 'https://ollama.com',
            note: 'Runs models on your own machine. No data ever leaves your computer. Install Ollama, pull a model like llama3.2 or qwen2.5.',
        });

        const actionRow = this.bodyEl.createDiv({ cls: 'wizard-action-row' });
        const addBtn = actionRow.createEl('button', { cls: 'mod-cta', text: 'Add model' });
        addBtn.addEventListener('click', () => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
            new ModelConfigModal(this.app, null, async (newModel: CustomModel) => {
                this.plugin.settings.activeModels.push(newModel);
                if (!this.plugin.settings.activeModelKey) {
                    this.plugin.settings.activeModelKey = getModelKey(newModel);
                }
                await this.plugin.saveSettings();
                refresh();
            }, false).open();
        });
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- kept async for caller type consistency
    private async renderEmbeddingStep(): Promise<void> {
        this.addInfoBanner(
            this.bodyEl,
            'search',
            'Why embeddings help',
            'Embeddings turn your notes into numbers so the agent can find them by meaning, not just exact words. Needed for semantic search and memory retrieval. You can skip this step. The agent still works without it, just with less powerful search.',
        );

        this.addSection(this.bodyEl, 'Current status');
        const renderStatus = (parent: HTMLElement): HTMLElement => {
            const count = (this.plugin.settings.embeddingModels ?? []).filter(m => m.enabled).length;
            return this.addStatusLine(parent, count, 'embedding model');
        };
        const statusWrap = this.bodyEl.createDiv();
        let statusEl = renderStatus(statusWrap);
        const refresh = () => {
            statusEl.remove();
            statusEl = renderStatus(statusWrap);
        };

        this.addSection(this.bodyEl, 'Recommended providers');

        this.addProviderCard(this.bodyEl, {
            name: 'OpenAI text-embedding-3-small',
            tier: 'paid',
            tierLabel: 'Cheap',
            url: 'https://platform.openai.com/api-keys',
            note: 'About $0.02 per million tokens. Reliable, runs on OpenAI servers.',
        });
        this.addProviderCard(this.bodyEl, {
            name: 'Google text-embedding-004',
            tier: 'free',
            tierLabel: 'Free tier',
            url: 'https://aistudio.google.com/app/apikey',
            note: 'Free for moderate usage. Same Google key works for both this and Google Gemini.',
        });
        this.addProviderCard(this.bodyEl, {
            name: 'Ollama (local)',
            tier: 'free',
            tierLabel: 'Free / local',
            url: 'https://ollama.com',
            note: 'No API key. Install Ollama, pull nomic-embed-text or similar. Privacy by default.',
        });

        const actionRow = this.bodyEl.createDiv({ cls: 'wizard-action-row' });
        const addBtn = actionRow.createEl('button', { cls: 'mod-cta', text: 'Add embedding model' });
        addBtn.addEventListener('click', () => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
            new ModelConfigModal(this.app, null, async (newModel: CustomModel) => {
                if (!this.plugin.settings.embeddingModels) this.plugin.settings.embeddingModels = [];
                this.plugin.settings.embeddingModels.push(newModel);
                if (!this.plugin.settings.activeEmbeddingModelKey) {
                    this.plugin.settings.activeEmbeddingModelKey = getModelKey(newModel);
                }
                await this.plugin.saveSettings();
                refresh();
            }, true).open();
        });
    }

    private renderRoleModelsStep(): void {
        this.addInfoBanner(
            this.bodyEl,
            'split',
            'Save cost with role-specific models',
            'Background tasks (titling, internal classification, memory extraction, contextual retrieval) can run on a smaller, cheaper model. Leave on "Use main LLM" if you do not care about the cost split.',
        );

        const llmModels = this.plugin.settings.activeModels.filter(m => m.enabled);
        if (llmModels.length === 0) {
            const empty = this.bodyEl.createDiv({ cls: 'wizard-status is-empty' });
            const iconWrap = empty.createDiv({ cls: 'wizard-status-icon' });
            setIcon(iconWrap, 'circle-alert');
            empty.createDiv({ text: 'Go back to the LLM step and add at least one model. Then this step can offer you choices.' });
            return;
        }

        const options: Record<string, string> = { '': 'Use main LLM' };
        for (const m of llmModels) {
            options[getModelKey(m)] = `${m.displayName ?? m.name} (${m.provider})`;
        }

        this.addSection(this.bodyEl, 'Role assignments');

        new Setting(this.bodyEl)
            .setName('Titling')
            .setDesc('Generates chat titles and semantic titles for notes the agent edited.')
            .addDropdown((d) => {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
                Object.entries(options).forEach(([k, label]) => d.addOption(k, label));
                d.setValue(this.plugin.settings.chatLinking?.titlingModelKey ?? '');
                d.onChange(async (v) => {
                    if (this.plugin.settings.chatLinking) {
                        this.plugin.settings.chatLinking.titlingModelKey = v;
                        await this.plugin.saveSettings();
                    }
                });
            });

        new Setting(this.bodyEl)
            .setName('Internal calls')
            .setDesc('Plugin-internal classification, context condensing, fast-path planner, recipe promotion.')
            .addDropdown((d) => {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
                Object.entries(options).forEach(([k, label]) => d.addOption(k, label));
                d.setValue(this.plugin.settings.helperModelKey ?? '');
                d.onChange(async (v) => {
                    this.plugin.settings.helperModelKey = v;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(this.bodyEl)
            .setName('Memory extraction')
            .setDesc('Extracts long-term facts from your conversation history.')
            .addDropdown((d) => {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
                Object.entries(options).forEach(([k, label]) => d.addOption(k, label));
                d.setValue(this.plugin.settings.memory?.memoryModelKey ?? '');
                d.onChange(async (v) => {
                    if (this.plugin.settings.memory) {
                        this.plugin.settings.memory.memoryModelKey = v;
                        await this.plugin.saveSettings();
                    }
                });
            });

        new Setting(this.bodyEl)
            .setName('Contextual retrieval')
            .setDesc('Adds context-aware embeddings during semantic indexing.')
            .addDropdown((d) => {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
                Object.entries(options).forEach(([k, label]) => d.addOption(k, label));
                d.setValue(this.plugin.settings.contextualModelKey ?? '');
                d.onChange(async (v) => {
                    this.plugin.settings.contextualModelKey = v;
                    await this.plugin.saveSettings();
                });
            });
    }

    private renderSearchProviderStep(): void {
        this.addInfoBanner(
            this.bodyEl,
            'globe',
            'Why web search is useful',
            'A search provider lets the agent fetch and read web pages. Without it, the agent can only work with what is in your vault. Both providers below have generous free tiers.',
        );

        this.addSection(this.bodyEl, 'Pick a provider');

        const providers: { id: 'tavily' | 'brave' | 'none'; label: string; tier: 'free' | 'paid' | 'recommended'; tierLabel: string; url: string; note: string }[] = [
            {
                id: 'tavily',
                label: 'Tavily',
                tier: 'free',
                tierLabel: '1000 free / month',
                url: 'https://app.tavily.com',
                note: 'Built for AI agents. Clean summarised results. Easiest to start with.',
            },
            {
                id: 'brave',
                label: 'Brave',
                tier: 'free',
                tierLabel: '2000 free / month',
                url: 'https://api.search.brave.com/app/keys',
                note: 'Higher free tier, broader index. Results are a bit noisier.',
            },
            {
                id: 'none',
                label: 'None',
                tier: 'paid',
                tierLabel: 'Disabled',
                url: '',
                note: 'Agent works only with vault content. Pick if you do not want any web access.',
            },
        ];

        const wt = this.plugin.settings.webTools;
        let currentProvider: 'tavily' | 'brave' | 'none' = wt.provider ?? 'none';
        const keyRowsByProvider: Record<string, HTMLElement> = {};

        for (const p of providers) {
            const card = this.bodyEl.createDiv({ cls: 'wizard-provider-card' });

            const radioRow = card.createDiv({ cls: 'wizard-radio-row' });
            const radio = radioRow.createEl('input', { type: 'radio' });
            radio.name = 'search-provider';
            radio.value = p.id;
            radio.checked = currentProvider === p.id;
            const label = radioRow.createEl('label');

            const header = label.createDiv({ cls: 'wizard-provider-header' });
            header.createDiv({ cls: 'wizard-provider-name', text: p.label });
            header.createEl('span', { cls: `wizard-provider-badge is-${p.tier}`, text: p.tierLabel });

            label.createDiv({ cls: 'wizard-provider-note', text: p.note });
            label.addEventListener('click', () => { radio.checked = true; radio.dispatchEvent(new Event('change')); });

            if (p.id !== 'none') {
                const link = card.createEl('a', { cls: 'wizard-provider-link', text: `Get a ${p.label} API key`, href: p.url });
                link.setAttr('target', '_blank');
                link.setAttr('rel', 'noopener noreferrer');

                const keyRow = card.createDiv({ cls: 'wizard-keyrow' });
                const input = keyRow.createEl('input', { type: 'password', placeholder: `${p.label} API key` });
                input.value = p.id === 'tavily' ? (wt.tavilyApiKey ?? '') : (wt.braveApiKey ?? '');
                // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
                input.addEventListener('input', async () => {
                    if (p.id === 'tavily') wt.tavilyApiKey = input.value.trim();
                    else if (p.id === 'brave') wt.braveApiKey = input.value.trim();
                    await this.plugin.saveSettings();
                });
                keyRow.setCssStyles({ display: currentProvider === p.id ? '' : 'none' });
                keyRowsByProvider[p.id] = keyRow;
            }

            // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
            radio.addEventListener('change', async () => {
                if (!radio.checked) return;
                currentProvider = p.id;
                wt.provider = p.id;
                wt.enabled = p.id !== 'none';
                await this.plugin.saveSettings();
                for (const [pid, row] of Object.entries(keyRowsByProvider)) {
                    row.setCssStyles({ display: (pid === currentProvider) ? '' : 'none' });
                }
            });
        }
    }

    private async renderOptionalDownloadsStep(): Promise<void> {
        this.addInfoBanner(
            this.bodyEl,
            'download',
            'Two optional one-time downloads',
            'Files land in your vault under .vault-operator/assets/ and are SHA256-verified before they are used. Both run locally, no API calls, no subscription.',
        );

        const { OptionalAssetManager, buildRerankerSpec, buildSelfDevSourceSpec } = await import('../../core/assets/OptionalAssetManager');
        const { RERANKER_WASM_SHA256 } = await import('../../core/assets/assetHashes');
        const { SELF_DEV_SOURCE_SHA256 } = await import('../../_generated/source-hash');

        const manager = new OptionalAssetManager(this.plugin);
        const items: {
            label: string;
            recommended: boolean;
            what: string;
            size: string;
            sha: string;
            spec: ReturnType<typeof buildRerankerSpec>;
        }[] = [
            {
                label: 'Semantic Reranker',
                recommended: true,
                what: 'Reorders semantic-search results by how relevant they actually are. The agent finds your notes much more accurately, especially for long or vague queries. Without it semantic search still works but matches are noisier.',
                size: '12 MB',
                sha: RERANKER_WASM_SHA256,
                spec: buildRerankerSpec(this.plugin.manifest.version, RERANKER_WASM_SHA256),
            },
            {
                label: 'Self-Development Source',
                recommended: false,
                what: 'Lets the agent read its own source code. Useful if you want the agent to help with extending the plugin itself. Most users do not need this.',
                size: '5 MB',
                sha: SELF_DEV_SOURCE_SHA256,
                spec: buildSelfDevSourceSpec(this.plugin.manifest.version, SELF_DEV_SOURCE_SHA256),
            },
        ];

        for (const item of items) {
            const card = this.bodyEl.createDiv({
                cls: item.recommended ? 'wizard-provider-card is-recommended' : 'wizard-provider-card',
            });

            const header = card.createDiv({ cls: 'wizard-provider-header' });
            header.createDiv({ cls: 'wizard-provider-name', text: `${item.label} (${item.size})` });
            if (item.recommended) {
                header.createEl('span', { cls: 'wizard-provider-badge is-recommended', text: 'Recommended' });
            }

            card.createDiv({ cls: 'wizard-provider-note', text: item.what });

            const statusEl = card.createDiv({ cls: 'wizard-asset-status' });
            const actions = card.createDiv({ cls: 'wizard-asset-actions' });
            const installBtn = actions.createEl('button', { cls: 'mod-cta', text: 'Install' });
            const fileBtn = actions.createEl('button', { text: 'Install from file' });
            fileBtn.setAttr('title', 'Pick a local copy if the GitHub release does not ship this asset yet');
            const removeBtn = actions.createEl('button', { text: 'Remove' });

            const refreshStatus = async () => {
                statusEl.empty();
                statusEl.className = 'wizard-asset-status';
                if (!item.sha) {
                    statusEl.classList.add('is-missing');
                    setIcon(statusEl.createDiv(), 'circle');
                    statusEl.createSpan({ text: 'Not available in this development build' });
                    installBtn.disabled = true;
                    installBtn.setCssStyles({ display: '' });
                    removeBtn.setCssStyles({ display: 'none' });
                    return;
                }
                const snap = await manager.snapshot(item.spec);
                if (snap.status === 'installed') {
                    statusEl.classList.add('is-installed');
                    setIcon(statusEl.createDiv(), 'check-circle-2');
                    statusEl.createSpan({ text: 'Installed' });
                    // Hide the Install button when the asset is healthy --
                    // clicking it would attempt a fresh download that just
                    // burns bandwidth or hits 404 on releases that do not
                    // ship this asset yet.
                    installBtn.setCssStyles({ display: 'none' });
                    removeBtn.setCssStyles({ display: '' });
                } else if (snap.status === 'outdated') {
                    statusEl.classList.add('is-outdated');
                    setIcon(statusEl.createDiv(), 'circle-alert');
                    statusEl.createSpan({ text: 'Installed but hash differs, re-install to update' });
                    installBtn.setText('Re-install');
                    installBtn.setCssStyles({ display: '' });
                    removeBtn.setCssStyles({ display: '' });
                } else {
                    statusEl.classList.add('is-missing');
                    setIcon(statusEl.createDiv(), 'circle');
                    statusEl.createSpan({ text: 'Not installed' });
                    installBtn.setText('Install');
                    installBtn.setCssStyles({ display: '' });
                    removeBtn.setCssStyles({ display: 'none' });
                }
            };
            await refreshStatus();

            // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
            installBtn.addEventListener('click', async () => {
                installBtn.disabled = true;
                installBtn.setText('Downloading...');
                try {
                    await manager.install(item.spec);
                    new Notice(`${item.label} installed.`);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    new Notice(`Install failed: ${msg}`, 10_000);
                } finally {
                    installBtn.disabled = false;
                    await refreshStatus();
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
            removeBtn.addEventListener('click', async () => {
                try {
                    await manager.remove(item.spec);
                    new Notice(`${item.label} removed.`);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    new Notice(`Remove failed: ${msg}`);
                } finally {
                    await refreshStatus();
                }
            });

            // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
            fileBtn.addEventListener('click', async () => {
                const { pickAndInstallAsset } = await import('../settings/installFromFile');
                pickAndInstallAsset(manager, item.spec, refreshStatus);
            });
        }
    }

    private renderDoneStep(): void {
        this.addInfoBanner(
            this.bodyEl,
            'check-circle-2',
            'Setup complete',
            'Next the agent opens a chat in the sidebar and asks a few questions to fill your personal memory and identity profile. Everything you tell it stays inside this vault.',
        );

        const p = (text: string): HTMLElement => {
            const el = this.bodyEl.createEl('p');
            el.setText(text);
            return el;
        };
        p('You can skip this chat too. Just press "Close" and start chatting whenever you like.');

        const skipped = this.plugin.settings.onboarding.skippedSteps;
        if (skipped && skipped.length > 0) {
            const note = this.bodyEl.createDiv({ cls: 'wizard-skip-list' });
            const label = skipped.map(id => {
                const step = STEPS.find(s => s.id === id);
                return step?.title ?? id;
            }).join(', ');
            note.createEl('strong', { text: 'You skipped: ' });
            note.createSpan({ text: label + '. The matching settings tabs show an inline hint so you can revisit them later.' });
        }
    }
}
