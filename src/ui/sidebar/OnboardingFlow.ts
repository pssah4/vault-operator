/**
 * OnboardingFlow — First-contact setup helper in the sidebar chat.
 *
 * Renders the welcome card with two buttons. The "Set up a model" button
 * opens the same ModelConfigModal that the Settings tab uses (so the user
 * sees exactly one model-config UI everywhere, including the Test
 * connection button). The "Open settings" button opens the Settings page.
 *
 * The wizard / Modal / ModelConfigModal path owns everything related to
 * provider selection, API key entry, key testing and persistence. This
 * flow does NOT intercept chat input anymore.
 */

import { MarkdownRenderer } from 'obsidian';
import type { App, Component } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { CustomModel } from '../../types/settings';
import { getModelKey } from '../../types/settings';
import { ModelConfigModal } from '../settings/ModelConfigModal';
import { t } from '../../i18n';
import { isActiveOnboardingFlow } from '../../core/onboarding-status';

interface OnboardingCallbacks {
    addAssistantMessage: (markdown: string) => void;
    updateModelButton: () => void;
    startOnboardingChat: () => void;
    openSettings: () => void;
}

export class OnboardingFlow {
    constructor(
        private plugin: ObsidianAgentPlugin,
        private app: App,
    ) {}

    /**
     * Kept for backwards compatibility with AgentSidebarView call sites.
     * The new flow never intercepts user input — ModelConfigModal owns the
     * entire API-key entry + test path.
     */
    get isAwaitingKey(): boolean {
        return false;
    }

    reset(): void {
        // No state to reset anymore.
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async kept for caller signature
    async handleKeyInput(_text: string, _callbacks: OnboardingCallbacks): Promise<boolean> {
        return false;
    }

    /**
     * Show the welcome message with setup buttons (first run only).
     */
    showWelcomeMessage(
        chatContainer: HTMLElement,
        renderComponent: Component,
        callbacks: OnboardingCallbacks,
    ): void {
        const ob = this.plugin.settings.onboarding;
        if (ob.completed || ob.startedAt || !this.plugin.memoryService) return;
        // FIX (2026-06-15): the welcome message is the legacy in-chat
        // first-run prompt. After Restart-Setup + Cancel from Settings the
        // onboarding flags read like a fresh install (completed=false,
        // startedAt=''), but the user already has a provider configured.
        // `isActiveOnboardingFlow` returns false in that case and we skip
        // the legacy welcome too.
        if (!isActiveOnboardingFlow(this.plugin.settings)) return;

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

        const setupBtn = btnRow.createEl('button', {
            cls: 'setup-welcome-btn setup-welcome-btn-primary',
            text: t('onboarding.welcome.setupButton'),
        });
        setupBtn.addEventListener('click', () => {
            this.disableButtons(btnRow);
            // FIX-26-99-02: pre-fix this routed to openAddModelModal() which
            // wrote to settings.activeModels[]. After the EPIC-26 migration
            // the canonical store is settings.providerConfigs[]; legacy
            // writes were either migrated away on next reload (user-visible
            // disappearance of their config) or never reflected in the
            // provider-only UI. Sending the user directly to the providers
            // tab keeps everything on one canonical path.
            callbacks.openSettings();
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
            t('onboarding.noModel.setupHint'),
        ].join('\n');

        void MarkdownRenderer.render(this.app, markdown, bubble, '', renderComponent);

        const btnRow = bubble.createDiv('setup-welcome-buttons');

        const setupBtn = btnRow.createEl('button', {
            cls: 'setup-welcome-btn setup-welcome-btn-primary',
            text: t('onboarding.welcome.setupButton'),
        });
        setupBtn.addEventListener('click', () => {
            this.disableButtons(btnRow);
            // FIX-26-99-02: pre-fix this routed to openAddModelModal() which
            // wrote to settings.activeModels[]. After the EPIC-26 migration
            // the canonical store is settings.providerConfigs[]; legacy
            // writes were either migrated away on next reload (user-visible
            // disappearance of their config) or never reflected in the
            // provider-only UI. Sending the user directly to the providers
            // tab keeps everything on one canonical path.
            callbacks.openSettings();
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
     * Open the same ModelConfigModal that "Add model" in Settings uses.
     * On save: persist, refresh UI, and start the onboarding chat if this
     * was the first model the user configured.
     */
    private openAddModelModal(callbacks: OnboardingCallbacks): void {
        const wasFirstModel = !this.plugin.settings.onboarding.completed;

        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- callback returns a Promise; errors handled inside
        new ModelConfigModal(this.app, null, async (newModel: CustomModel) => {
            const key = getModelKey(newModel);
            const existingIdx = this.plugin.settings.activeModels.findIndex(
                (m) => getModelKey(m) === key,
            );
            if (existingIdx >= 0) {
                this.plugin.settings.activeModels[existingIdx] = newModel;
            } else {
                this.plugin.settings.activeModels.push(newModel);
            }
            if (!this.plugin.settings.activeModelKey) {
                this.plugin.settings.activeModelKey = key;
            }
            await this.plugin.saveSettings();
            this.plugin.initApiHandler();

            callbacks.addAssistantMessage(
                t('onboarding.test.success', {
                    provider: newModel.displayName ?? newModel.name,
                }),
            );
            callbacks.updateModelButton();

            if (wasFirstModel && !this.plugin.settings.onboarding.completed) {
                window.setTimeout(() => callbacks.startOnboardingChat(), 800);
            }
        }, false).open();
    }

    /** Disable all buttons in a row (gray out after choice). */
    private disableButtons(row: HTMLElement): void {
        row.querySelectorAll('button').forEach((btn) => {
            btn.disabled = true;
            btn.addClass('setup-btn-disabled');
        });
    }
}
