/**
 * MemoryViewerModal -- read + delete view over all Memory v2 facts.
 *
 * Built for data sovereignty: the user can see exactly what Obsilo
 * stores and remove anything. Editing/adding lives in the chat
 * (the agent uses update_soul / mark_for_memory), not here.
 *
 * Three sections:
 *   1. User memory      profile_id != '_obsilo' (or 'default')
 *   2. Obsilo's soul    profile_id == '_obsilo', topics contains 'soul'
 *   3. Capabilities     profile_id == '_obsilo', topics contains 'capability' (read-only)
 *
 * FEATURE-0319b follow-up: replaces the editor UI in MemoryTab with a
 * single "View memory" button + this modal.
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { FactStore, type Fact } from '../../core/memory/FactStore';
import { OBSILO_PROFILE } from '../../core/memory/SoulView';
import { confirmModal } from './PromptModal';

export class MemoryViewerModal extends Modal {
    private filterText = '';

    constructor(app: App, private plugin: ObsidianAgentPlugin) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText('Memory contents');
        this.contentEl.empty();
        this.contentEl.addClass('memory-viewer-modal');
        this.render();
    }

    private render(): void {
        this.contentEl.empty();

        if (!this.plugin.memoryDB?.isOpen()) {
            this.contentEl.createEl('p', {
                cls: 'memory-viewer-empty',
                text: 'Memory database is not open.',
            });
            return;
        }

        const intro = this.contentEl.createEl('p', { cls: 'memory-viewer-intro' });
        intro.setText(
            'Everything Obsilo stores about you and itself. ' +
            'Adding entries happens in chat (just tell the agent). ' +
            'Use this view to inspect or remove anything.',
        );

        // Filter input
        const filterRow = this.contentEl.createDiv({ cls: 'memory-viewer-filter' });
        const filterInput = filterRow.createEl('input', {
            type: 'text',
            placeholder: 'Filter...',
        });
        filterInput.value = this.filterText;
        filterInput.addEventListener('input', () => {
            this.filterText = filterInput.value;
            this.renderLists(listsContainer);
        });

        // Lists container -- rebuilt on filter change
        const listsContainer = this.contentEl.createDiv({ cls: 'memory-viewer-lists' });
        this.renderLists(listsContainer);
    }

    private renderLists(container: HTMLElement): void {
        container.empty();
        const factStore = new FactStore(this.plugin.memoryDB!);
        const all = factStore.listLatest({ limit: 1000 });
        const filtered = this.filterText
            ? all.filter(f =>
                f.text.toLowerCase().includes(this.filterText.toLowerCase())
                || f.topics.join(' ').toLowerCase().includes(this.filterText.toLowerCase()))
            : all;

        const userFacts = filtered.filter(f => f.profileId !== OBSILO_PROFILE);
        const soulFacts = filtered.filter(f =>
            f.profileId === OBSILO_PROFILE && f.topics.includes('soul'));
        const capabilityFacts = filtered.filter(f =>
            f.profileId === OBSILO_PROFILE && f.topics.includes('capability'));

        this.renderSection(container, 'User memory', userFacts, true,
            'Facts Obsilo learned about you across conversations.');
        this.renderSection(container, 'Obsilo’s soul', soulFacts, true,
            'How Obsilo behaves: identity, values, anti-patterns, communication style. ' +
            'Tell the agent in chat to add or change.');
        this.renderSection(container, 'Capabilities (read-only)', capabilityFacts, false,
            'What Obsilo knows about its own features. Auto-generated from the plugin code.');
    }

    private renderSection(
        container: HTMLElement,
        title: string,
        facts: Fact[],
        deletable: boolean,
        description: string,
    ): void {
        const section = container.createDiv({ cls: 'memory-viewer-section' });
        const header = section.createDiv({ cls: 'memory-viewer-section-header' });
        header.createEl('h3', { text: `${title} (${facts.length})` });
        section.createDiv({ cls: 'memory-viewer-section-desc', text: description });

        if (facts.length === 0) {
            section.createDiv({ cls: 'memory-viewer-empty', text: 'No entries.' });
            return;
        }

        const list = section.createEl('ul', { cls: 'memory-viewer-list' });
        for (const fact of facts) {
            const item = list.createEl('li', { cls: 'memory-viewer-item' });
            const main = item.createDiv({ cls: 'memory-viewer-item-main' });
            main.createDiv({ cls: 'memory-viewer-item-text', text: fact.text });
            const meta = main.createDiv({ cls: 'memory-viewer-item-meta' });
            const topics = fact.topics.length > 0 ? fact.topics.join(', ') : '(no topics)';
            meta.createSpan({ text: topics });
            meta.createSpan({ cls: 'memory-viewer-item-meta-sep', text: ' · ' });
            meta.createSpan({ text: `kind: ${fact.kind}` });
            meta.createSpan({ cls: 'memory-viewer-item-meta-sep', text: ' · ' });
            meta.createSpan({ text: shortDate(fact.lastConfirmedAt) });

            if (deletable) {
                const delBtn = item.createEl('button', {
                    cls: 'memory-viewer-item-delete clickable-icon',
                    attr: { 'aria-label': 'Remove this entry from memory' },
                });
                setIcon(delBtn, 'trash-2');
                delBtn.addEventListener('click', () => {
                    void this.handleDelete(fact);
                });
            }
        }
    }

    private async handleDelete(fact: Fact): Promise<void> {
        const ok = await confirmModal(this.app, {
            title: 'Remove this memory entry?',
            message: `"${fact.text}"\n\nThis is a soft-delete -- the audit trail keeps it for recovery.`,
            confirmLabel: 'Remove',
            cancelLabel: 'Cancel',
            destructive: true,
        });
        if (!ok) return;
        const factStore = new FactStore(this.plugin.memoryDB!);
        factStore.deprecate(fact.id, 'removed by user via memory viewer');
        await this.plugin.memoryDB!.save().catch(() => undefined);
        new Notice('Memory entry removed.');
        this.render();
    }
}

function shortDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric',
        });
    } catch {
        return iso;
    }
}
