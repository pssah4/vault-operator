/**
 * Setup-wizard skip hints (Phase 2.3).
 *
 * When the user closes the FirstRunWizard without finishing a step,
 * the corresponding setting tab shows an inline banner so the user
 * can pick the configuration back up later. Clicking "Re-open wizard"
 * launches the wizard at the matching step. Clicking the close icon
 * removes the hint without re-opening the wizard.
 */

import type ObsidianAgentPlugin from '../../main';

export type SkippedStepId =
    | 'welcome'
    | 'llm-model'
    | 'embedding-model'
    | 'role-models'
    | 'search-provider'
    | 'optional-downloads'
    | 'done';

const STEP_MESSAGES: Record<string, string> = {
    'llm-model':
        'You skipped this during setup. Add at least one LLM model so the agent can answer messages.',
    'embedding-model':
        'You skipped this during setup. Add an embedding model to unlock semantic search and memory retrieval.',
    'search-provider':
        'You skipped this during setup. Configure a search provider (Tavily, Brave) to enable the agent\'s web-search tools.',
    'role-models':
        'You skipped this during setup. Optionally assign smaller, cheaper models to titling, internal calls and memory extraction.',
};

/**
 * Render a hint banner at the top of a settings tab if the matching
 * step was skipped. Returns true if a hint was rendered (so callers
 * can adjust their layout, e.g. add extra spacing).
 */
export function renderSkipHintIfSkipped(
    containerEl: HTMLElement,
    plugin: ObsidianAgentPlugin,
    stepId: SkippedStepId,
): boolean {
    const skipped = plugin.settings.onboarding?.skippedSteps as string[] | undefined;
    if (!skipped || !skipped.includes(stepId)) return false;

    const message = STEP_MESSAGES[stepId];
    if (!message) return false;

    const banner = containerEl.createDiv({ cls: 'vault-operator-skip-hint' });
    banner.setCssStyles({ display: 'flex' });
    banner.setCssStyles({ alignItems: 'flex-start' });
    banner.setCssStyles({ gap: '12px' });
    banner.setCssStyles({ padding: '10px 12px' });
    banner.setCssStyles({ margin: '0 0 12px 0' });
    banner.setCssStyles({ borderLeft: '3px solid var(--interactive-accent)' });
    banner.setCssStyles({ background: 'var(--background-secondary)' });
    banner.setCssStyles({ borderRadius: '4px' });
    const text = banner.createDiv();
    text.setCssStyles({ flex: '1' });
    text.setCssStyles({ fontSize: '0.9em' });
    const headline = text.createEl('strong');
    headline.setText('Setup left this for later');
    headline.setCssStyles({ display: 'block' });
    headline.setCssStyles({ marginBottom: '4px' });
    text.createDiv({ text: message });

    const actions = banner.createDiv();
    actions.setCssStyles({ display: 'flex' });
    actions.setCssStyles({ gap: '6px' });
    actions.setCssStyles({ alignItems: 'center' });
    const reopenBtn = actions.createEl('button', { text: 'Reopen wizard' });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
    reopenBtn.addEventListener('click', async () => {
        const { FirstRunWizardModal } = await import('../modals/FirstRunWizardModal');
        new FirstRunWizardModal(plugin.app, plugin).open();
    });

    const dismissBtn = actions.createEl('button', { text: 'Dismiss' });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
    dismissBtn.addEventListener('click', async () => {
        const arr = plugin.settings.onboarding.skippedSteps as string[];
        const idx = arr.indexOf(stepId);
        if (idx >= 0) {
            arr.splice(idx, 1);
            await plugin.saveSettings();
        }
        banner.detach();
    });

    return true;
}
