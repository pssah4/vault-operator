/**
 * OnboardingFlow — First-contact setup wizard in the sidebar chat.
 *
 * Manages the onboarding state machine: welcome message, provider selection,
 * API key input, test & save. All rendered as chat bubbles.
 *
 * FEATURE-0901: Extracted from AgentSidebarView.ts
 */

import { MarkdownRenderer } from 'obsidian';
import type { App, Component } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { CustomModel, ProviderType } from '../../types/settings';
import { BUILT_IN_MODELS, getModelKey, getDefaultBaseUrlForProvider } from '../../types/settings';
import { buildApiHandlerForModel } from '../../api/index';
import { t } from '../../i18n';

type OnboardingKeyState = 'awaiting_choice' | 'awaiting_key_free' | 'awaiting_provider' | 'awaiting_key_own' | 'testing' | null;

interface OnboardingCallbacks {
    addAssistantMessage: (markdown: string) => void;
    addUserMessage: (text: string) => void;
    updateModelButton: () => void;
    startOnboardingChat: () => void;
    openSettings: () => void;
}

export class OnboardingFlow {
    private keyState: OnboardingKeyState = null;
    private selectedProvider: { label: string; provider: ProviderType; model: string } | null = null;

    constructor(
        private plugin: ObsidianAgentPlugin,
        private app: App,
    ) {}

    /** Current key-interception state (read by handleSendMessage). */
    get isAwaitingKey(): boolean {
        return this.keyState === 'awaiting_key_free' || this.keyState === 'awaiting_key_own';
    }

    /** Reset onboarding state (e.g. on conversation clear). */
    reset(): void {
        this.keyState = null;
        this.selectedProvider = null;
    }

    /**
     * Show the welcome message with setup buttons.
     * @param chatContainer - The chat message container element
     * @param renderComponent - Obsidian Component for MarkdownRenderer lifecycle
     * @param callbacks - Callbacks back into the SidebarView
     */
    showWelcomeMessage(
        chatContainer: HTMLElement,
        renderComponent: Component,
        callbacks: OnboardingCallbacks,
    ): void {
        const ob = this.plugin.settings.onboarding;
        if (ob.completed || ob.startedAt || !this.plugin.memoryService) return;

        const welcomeText = [
            `## ${t('onboarding.welcome.heading')}`,
            '',
            t('onboarding.welcome.modelNeeded'),
            t('onboarding.welcome.quickFree'),
        ].join('\n');

        const wrapper = chatContainer.createDiv('message assistant-message');
        const bubble = wrapper.createDiv('message-bubble');
        void MarkdownRenderer.render(this.app, welcomeText, bubble, '', renderComponent);

        const btnRow = bubble.createDiv('setup-welcome-buttons');

        const freeBtn = btnRow.createEl('button', {
            cls: 'setup-welcome-btn setup-welcome-btn-primary',
            text: t('onboarding.welcome.freeButton'),
        });
        freeBtn.addEventListener('click', () => {
            this.disableButtons(btnRow);
            this.showFreeKeyInstructions(callbacks);
        });

        const ownBtn = btnRow.createEl('button', {
            cls: 'setup-welcome-btn setup-welcome-btn-secondary',
            text: t('onboarding.welcome.apiKeyButton'),
        });
        ownBtn.addEventListener('click', () => {
            this.disableButtons(btnRow);
            this.showProviderSelection(chatContainer, renderComponent, callbacks);
        });

        this.keyState = 'awaiting_choice';
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    /** Show Google free key instructions. */
    private showFreeKeyInstructions(callbacks: OnboardingCallbacks): void {
        this.keyState = 'awaiting_key_free';
        this.selectedProvider = {
            label: 'Google (Gemini)',
            provider: 'gemini' as ProviderType,
            model: 'gemini-2.5-flash',
        };

        const markdown = [
            t('onboarding.free.intro'),
            '',
            `**${t('onboarding.free.howTo')}**`,
            '',
            t('onboarding.free.step1'),
            t('onboarding.free.step2'),
            t('onboarding.free.step3'),
            t('onboarding.free.step4'),
            t('onboarding.free.step5'),
            '',
            `> ${t('onboarding.free.noCreditCard')}`,
            '',
            t('onboarding.free.pasteKey'),
        ].join('\n');

        callbacks.addAssistantMessage(markdown);
    }

    /** Show provider selection buttons. */
    private showProviderSelection(
        chatContainer: HTMLElement,
        renderComponent: Component,
        callbacks: OnboardingCallbacks,
    ): void {
        this.keyState = 'awaiting_provider';

        const providers: { label: string; provider: ProviderType; model: string }[] = [
            { label: t('onboarding.provider.anthropic'), provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
            { label: t('onboarding.provider.openai'), provider: 'openai', model: 'gpt-4o' },
            { label: t('onboarding.provider.google'), provider: 'gemini', model: 'gemini-2.5-flash' },
            { label: t('onboarding.provider.openrouter'), provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
        ];

        const wrapper = chatContainer.createDiv('message assistant-message');
        const bubble = wrapper.createDiv('message-bubble');
        void MarkdownRenderer.render(this.app, t('onboarding.provider.selectPrompt'), bubble, '', renderComponent);

        const btnRow = bubble.createDiv('setup-welcome-buttons setup-provider-buttons');
        for (const p of providers) {
            const btn = btnRow.createEl('button', {
                cls: 'setup-welcome-btn setup-welcome-btn-secondary',
                text: p.label,
            });
            btn.addEventListener('click', () => {
                this.disableButtons(btnRow);
                this.selectedProvider = p;
                this.keyState = 'awaiting_key_own';
                callbacks.addAssistantMessage(t('onboarding.provider.pasteKey', { label: p.label }));
            });
        }

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    /**
     * Show setup message when no model is configured (works outside onboarding too).
     */
    showNoModelSetupMessage(
        chatContainer: HTMLElement,
        renderComponent: Component,
        callbacks: OnboardingCallbacks,
    ): void {
        const wrapper = chatContainer.createDiv('message assistant-message');
        const bubble = wrapper.createDiv('message-bubble');

        const markdown = [
            t('onboarding.noModel.heading'),
            '',
            t('onboarding.noModel.freeOffer'),
            '',
            t('onboarding.noModel.step1'),
            t('onboarding.noModel.step2'),
            t('onboarding.noModel.step3'),
            '',
            t('onboarding.noModel.orSettings'),
        ].join('\n');

        void MarkdownRenderer.render(this.app, markdown, bubble, '', renderComponent);

        const btnRow = bubble.createDiv('setup-welcome-buttons');

        const freeBtn = btnRow.createEl('button', {
            cls: 'setup-welcome-btn setup-welcome-btn-primary',
            text: t('onboarding.noModel.googleButton'),
        });
        freeBtn.addEventListener('click', () => {
            this.disableButtons(btnRow);
            this.selectedProvider = {
                label: 'Google (Gemini)',
                provider: 'gemini' as ProviderType,
                model: 'gemini-2.5-flash',
            };
            this.keyState = 'awaiting_key_free';
            callbacks.addAssistantMessage(t('onboarding.noModel.pasteMessage'));
        });

        const settingsBtn = btnRow.createEl('button', {
            cls: 'setup-welcome-btn setup-welcome-btn-secondary',
            text: t('onboarding.noModel.settingsButton'),
        });
        settingsBtn.addEventListener('click', () => {
            this.disableButtons(btnRow);
            callbacks.openSettings();
        });

        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    /**
     * Intercept a message as an API key (called from handleSendMessage when isAwaitingKey).
     * Tests the key, saves if successful, triggers onboarding chat.
     * Returns true if the message was consumed (caller should not process further).
     */
    async handleKeyInput(
        text: string,
        callbacks: OnboardingCallbacks,
    ): Promise<boolean> {
        if (!this.isAwaitingKey) return false;

        const apiKey = text.trim();
        if (!apiKey) return true; // consumed but empty

        // Show masked key as user bubble
        const masked = apiKey.length > 8
            ? apiKey.slice(0, 4) + '...' + apiKey.slice(-4)
            : '****';
        callbacks.addUserMessage(masked);
        callbacks.addAssistantMessage(t('onboarding.test.testing'));
        this.keyState = 'testing';

        const provider = this.selectedProvider!;
        const success = await this.testAndSaveKey(provider.model, provider.provider, apiKey);

        if (success) {
            callbacks.addAssistantMessage(
                t('onboarding.test.success', { provider: provider.label }),
            );
            this.keyState = null;
            this.selectedProvider = null;
            callbacks.updateModelButton();
            if (!this.plugin.settings.onboarding.completed) {
                setTimeout(() => callbacks.startOnboardingChat(), 800);
            }
        } else {
            callbacks.addAssistantMessage(t('onboarding.test.failed'));
            this.keyState = provider.provider === 'gemini'
                ? 'awaiting_key_free'
                : 'awaiting_key_own';
        }

        return true; // consumed
    }

    /** Test an API key and save to settings if successful. */
    private async testAndSaveKey(
        modelName: string,
        provider: ProviderType,
        apiKey: string,
    ): Promise<boolean> {
        const builtIn = BUILT_IN_MODELS.find((m) => m.name === modelName);
        const model: CustomModel = {
            name: modelName,
            provider,
            displayName: builtIn?.displayName ?? modelName,
            apiKey,
            baseUrl: builtIn?.baseUrl
                ?? getDefaultBaseUrlForProvider(provider),
            enabled: true,
            isBuiltIn: builtIn?.isBuiltIn ?? false,
        };

        try {
            const handler = buildApiHandlerForModel(model);
            const stream = handler.createMessage(
                'Respond with exactly: "OK"',
                [{ role: 'user', content: 'Test' }],
                [],
            );
            let text = '';
            for await (const chunk of stream) {
                if (chunk.type === 'text') text += chunk.text;
            }
            if (!text.trim()) throw new Error('Empty response');

            const key = getModelKey(model);
            const existingIdx = this.plugin.settings.activeModels.findIndex(
                (m) => getModelKey(m) === key,
            );
            if (existingIdx >= 0) {
                this.plugin.settings.activeModels[existingIdx].apiKey = apiKey;
                this.plugin.settings.activeModels[existingIdx].enabled = true;
            } else {
                this.plugin.settings.activeModels.push(model);
            }
            this.plugin.settings.activeModelKey = key;
            await this.plugin.saveSettings();
            this.plugin.initApiHandler();
            return true;
        } catch {
            return false;
        }
    }

    /** Disable all buttons in a row (gray out after choice). */
    private disableButtons(row: HTMLElement): void {
        row.querySelectorAll('button').forEach((btn) => {
            btn.disabled = true;
            btn.addClass('setup-btn-disabled');
        });
    }
}
