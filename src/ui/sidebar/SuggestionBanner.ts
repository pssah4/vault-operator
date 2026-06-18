/**
 * SuggestionBanner — Implicit connection suggestions in the sidebar.
 *
 * Shows max 3 suggestions between chat and input area. Collapsible, dismissable.
 * Polls every 30s to pick up new suggestions after ImplicitConnectionService
 * completes its background computation.
 *
 * FEATURE-1506: Implicit Connection UI
 * FEATURE-0901: Extracted from AgentSidebarView.ts
 */

import { Notice, TFile, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { scheduleRecurring, type RecurringHandle } from '../../util/scheduleRecurring';
import { t } from '../../i18n';

export class SuggestionBanner {
    private bannerEl: HTMLElement | null = null;
    private container: HTMLElement | null = null;
    private pollTimer: RecurringHandle | null = null;

    constructor(
        private plugin: ObsidianAgentPlugin,
        private app: App,
    ) {}

    /**
     * Initialize the banner in the given container.
     * Starts polling every 30s for new suggestions.
     * @param container - The sidebar container element
     * @param registerCleanup - Callback to register cleanup on view close
     */
    mount(container: HTMLElement, registerCleanup: (fn: () => void) => void): void {
        this.container = container;

        this.refresh();

        if (!this.pollTimer) {
            this.pollTimer = scheduleRecurring(() => {
                this.refresh();
            }, 30_000);
            registerCleanup(() => {
                if (this.pollTimer) {
                    this.pollTimer.stop();
                    this.pollTimer = null;
                }
            });
        }
    }

    /** Refresh the banner. Removes old content, rebuilds if suggestions exist. */
    refresh(): void {
        if (this.bannerEl) {
            this.bannerEl.remove();
            this.bannerEl = null;
        }

        const container = this.container;
        if (!container) return;

        const implicitService = this.plugin.implicitConnectionService;
        if (!implicitService) return;
        if (!this.plugin.settings.enableImplicitConnections) return;
        if (!this.plugin.settings.enableSuggestionBanner) return;

        const suggestions = implicitService.getSuggestions(3);
        if (suggestions.length === 0) return;

        // Insert before the input area
        const banner = createDiv('agent-suggestions-banner');
        const inputArea = container.querySelector('.chat-input-container');
        if (inputArea) {
            container.insertBefore(banner, inputArea);
        } else {
            container.appendChild(banner);
        }
        this.bannerEl = banner;

        // Header (collapsible)
        let collapsed = false;
        const header = banner.createDiv('agent-suggestions-header');
        header.createSpan({ text: `Connections (${suggestions.length})`, cls: 'agent-suggestions-title' });

        const headerActions = header.createDiv('agent-suggestions-header-actions');
        const toggleIcon = headerActions.createSpan('agent-suggestions-toggle');
        setIcon(toggleIcon, 'chevron-down');

        // issue #45 quirk 3: permanent kill-switch directly in the header.
        // The per-item X dismisses one pair; users read the X as "close
        // the popup" and are confused when the polltimer rebuilds the
        // banner with the next pair 30s later. The header-level close
        // flips enableSuggestionBanner=false, removes the banner, stops
        // the poll and shows a Notice that points to the setting.
        const closeBtn = headerActions.createEl('button', {
            cls: 'agent-suggestion-btn agent-suggestions-close',
            attr: { 'aria-label': t('ui.suggestionBanner.hideAriaLabel') },
        });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.plugin.settings.enableSuggestionBanner = false;
            void this.plugin.saveSettings();
            banner.remove();
            this.bannerEl = null;
            if (this.pollTimer) {
                this.pollTimer.stop();
                this.pollTimer = null;
            }
            new Notice(t('ui.suggestionBanner.hiddenNotice'));
        });

        const listEl = banner.createDiv('agent-suggestions-list');

        header.addEventListener('click', (e) => {
            // Don't toggle collapse when clicking the close button.
            if ((e.target as HTMLElement | null)?.closest('.agent-suggestions-close')) return;
            collapsed = !collapsed;
            listEl.toggleClass('is-collapsed', collapsed);
            setIcon(toggleIcon, collapsed ? 'chevron-right' : 'chevron-down');
        });

        // Render suggestions
        for (const s of suggestions) {
            const item = listEl.createDiv('agent-suggestion-item');

            const nameA = s.pathA.split('/').pop()?.replace(/\.\w+$/, '') ?? s.pathA;
            const nameB = s.pathB.split('/').pop()?.replace(/\.\w+$/, '') ?? s.pathB;

            const textEl = item.createDiv('agent-suggestion-text');
            textEl.createSpan({ text: `[[${nameA}]]`, cls: 'agent-suggestion-link' });
            textEl.createSpan({ text: ' <-> ', cls: 'agent-suggestion-arrow' });
            textEl.createSpan({ text: `[[${nameB}]]`, cls: 'agent-suggestion-link' });
            textEl.createSpan({ text: ` (${s.similarity.toFixed(2)})`, cls: 'agent-suggestion-score' });

            const actions = item.createDiv('agent-suggestion-actions');

            const openBtn = actions.createEl('button', { cls: 'agent-suggestion-btn', attr: { 'aria-label': 'Open both notes' } });
            setIcon(openBtn, 'split');
            openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                void this.openNotesSplit(s.pathA, s.pathB);
            });

            const dismissBtn = actions.createEl('button', { cls: 'agent-suggestion-btn agent-suggestion-dismiss', attr: { 'aria-label': 'Dismiss' } });
            setIcon(dismissBtn, 'x');
            dismissBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                implicitService.dismissPair(s.pathA, s.pathB);
                item.remove();
                const remaining = listEl.querySelectorAll('.agent-suggestion-item').length;
                if (remaining === 0) {
                    banner.remove();
                    this.bannerEl = null;
                } else {
                    header.querySelector('.agent-suggestions-title')?.setText(`Connections (${remaining})`);
                }
            });
        }
    }

    /** Open two notes side by side in a split view. */
    private async openNotesSplit(pathA: string, pathB: string): Promise<void> {
        const fileA = this.app.vault.getAbstractFileByPath(pathA);
        const fileB = this.app.vault.getAbstractFileByPath(pathB);
        if (!(fileA instanceof TFile) || !(fileB instanceof TFile)) return;

        const leafA = this.app.workspace.getLeaf(false);
        await leafA.openFile(fileA);

        const leafB = this.app.workspace.getLeaf('split', 'vertical');
        await leafB.openFile(fileB);
    }
}
