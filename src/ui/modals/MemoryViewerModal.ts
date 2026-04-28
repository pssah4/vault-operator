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
import { confirmModal, promptModal } from './PromptModal';

type Tab = 'all' | 'user' | 'soul' | 'capabilities';

export class MemoryViewerModal extends Modal {
    private filterText = '';
    private activeTab: Tab = 'all';

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

        // Compute counts per bucket
        const factStore = new FactStore(this.plugin.memoryDB!);
        const all = factStore.listLatest({ limit: 5000 });
        const userFacts = all.filter(f => f.profileId !== OBSILO_PROFILE);
        const soulFacts = all.filter(f =>
            f.profileId === OBSILO_PROFILE && f.topics.includes('soul'));
        const capabilityFacts = all.filter(f =>
            f.profileId === OBSILO_PROFILE && f.topics.includes('capability'));
        let sessionCount = 0;
        try {
            const result = this.plugin.memoryDB!.getDB().exec('SELECT COUNT(*) FROM sessions');
            if (result.length > 0 && result[0].values.length > 0) {
                sessionCount = Number(result[0].values[0][0]);
            }
        } catch { /* sessions table may not exist on fresh DB */ }

        const stats = this.contentEl.createEl('p', { cls: 'memory-viewer-stats' });
        stats.setText(`${all.length} fact(s) · ${sessionCount} session summary(ies)`);

        // Tab switcher
        const tabBar = this.contentEl.createDiv({ cls: 'memory-viewer-tabs' });
        const tabs: Array<{ key: Tab; label: string; count: number }> = [
            { key: 'all', label: 'All', count: all.length },
            { key: 'user', label: 'User memory', count: userFacts.length },
            { key: 'soul', label: 'Obsilo’s soul', count: soulFacts.length },
            { key: 'capabilities', label: 'Capabilities', count: capabilityFacts.length },
        ];
        for (const tab of tabs) {
            const btn = tabBar.createEl('button', {
                cls: `memory-viewer-tab${this.activeTab === tab.key ? ' memory-viewer-tab-active' : ''}`,
                text: `${tab.label} (${tab.count})`,
            });
            btn.addEventListener('click', () => {
                this.activeTab = tab.key;
                this.render();
            });
        }

        // Filter input
        const filterRow = this.contentEl.createDiv({ cls: 'memory-viewer-filter' });
        const filterInput = filterRow.createEl('input', {
            type: 'text',
            placeholder: 'Filter within current tab...',
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
        const all = factStore.listLatest({ limit: 5000 });

        const userFacts = all.filter(f => f.profileId !== OBSILO_PROFILE);
        const soulFacts = all.filter(f =>
            f.profileId === OBSILO_PROFILE && f.topics.includes('soul'));
        const capabilityFacts = all.filter(f =>
            f.profileId === OBSILO_PROFILE && f.topics.includes('capability'));

        const filterFn = (facts: Fact[]) => this.filterText
            ? facts.filter(f =>
                f.text.toLowerCase().includes(this.filterText.toLowerCase())
                || f.topics.join(' ').toLowerCase().includes(this.filterText.toLowerCase()))
            : facts;

        if (this.activeTab === 'all' || this.activeTab === 'user') {
            this.renderSection(container, 'User memory', filterFn(userFacts), true,
                'Facts Obsilo learned about you across conversations.');
        }
        if (this.activeTab === 'all' || this.activeTab === 'soul') {
            this.renderSection(container, 'Obsilo’s soul', filterFn(soulFacts), true,
                'How Obsilo behaves: identity, values, anti-patterns, communication style. ' +
                'Tell the agent in chat to add or change.');
        }
        if (this.activeTab === 'all' || this.activeTab === 'capabilities') {
            this.renderSection(container, 'Capabilities (read-only)', filterFn(capabilityFacts), false,
                'What Obsilo knows about its own features. Auto-generated from the plugin code.');
        }
    }

    private renderSection(
        container: HTMLElement,
        title: string,
        facts: Fact[],
        editable: boolean,
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

            // Tag chips: primary category + secondary topics
            const tags = main.createDiv({ cls: 'memory-viewer-item-tags' });
            const primary = primaryTag(fact);
            if (primary) {
                tags.createSpan({ cls: 'memory-viewer-tag memory-viewer-tag-primary', text: primary });
            }
            for (const topic of fact.topics) {
                if (topic === primary || topic === 'soul' || topic === 'capability') continue;
                tags.createSpan({ cls: 'memory-viewer-tag', text: topic });
            }

            // Date below tags
            const meta = main.createDiv({ cls: 'memory-viewer-item-meta' });
            meta.createSpan({ text: shortDate(fact.lastConfirmedAt) });

            const actions = item.createDiv({ cls: 'memory-viewer-item-actions' });
            if (editable) {
                const editBtn = actions.createEl('button', {
                    cls: 'memory-viewer-item-edit clickable-icon',
                    attr: { 'aria-label': 'Edit this memory entry' },
                });
                setIcon(editBtn, 'pencil');
                editBtn.addEventListener('click', () => { void this.handleEdit(fact); });

                const delBtn = actions.createEl('button', {
                    cls: 'memory-viewer-item-delete clickable-icon',
                    attr: { 'aria-label': 'Remove this entry from memory' },
                });
                setIcon(delBtn, 'trash-2');
                delBtn.addEventListener('click', () => { void this.handleDelete(fact); });
            }
        }
    }

    private async handleEdit(fact: Fact): Promise<void> {
        const next = await promptModal(this.app, {
            title: 'Edit memory entry',
            message: 'Updating creates a new entry that supersedes the old one. The audit trail keeps the prior version.',
            placeholder: fact.text,
            defaultValue: fact.text,
            submitLabel: 'Save',
        });
        if (next === null) return;
        const trimmed = next.trim();
        if (!trimmed || trimmed === fact.text) return;
        const factStore = new FactStore(this.plugin.memoryDB!);
        factStore.supersede(fact.id, {
            text: trimmed,
            topics: fact.topics,
            importance: fact.importance,
            kind: fact.kind,
            sourceSessionId: fact.sourceSessionId,
            sourceThreadId: fact.sourceThreadId,
            sourceInterface: fact.sourceInterface,
            sourceUri: fact.sourceUri,
            profileId: fact.profileId,
            metadata: fact.metadata,
        });
        await this.plugin.memoryDB!.save().catch(() => undefined);
        new Notice('Memory entry updated.');
        this.render();
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

/**
 * Primary "where this lives" tag. For soul facts, the L2 sub-category
 * (value/anti_pattern/identity/communication). For capabilities, the
 * area (tool/ui/setting/mode). For user facts, the kind.
 */
function primaryTag(fact: Fact): string | null {
    if (fact.profileId === OBSILO_PROFILE) {
        if (fact.topics.includes('soul')) {
            for (const c of ['identity', 'value', 'anti_pattern', 'communication']) {
                if (fact.topics.includes(c)) return c;
            }
            return 'soul';
        }
        if (fact.topics.includes('capability')) {
            for (const a of ['tool', 'ui', 'setting', 'mode', 'command']) {
                if (fact.topics.includes(a)) return a;
            }
            return 'capability';
        }
    }
    return fact.kind;
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
