/**
 * HistoryPanel
 *
 * Sliding overlay panel that displays conversation history grouped by date.
 * Placed inside the chat container as an absolute-positioned overlay.
 */

import { Notice, setIcon } from 'obsidian';
import type { ConversationMeta, ConversationStore } from '../../core/history/ConversationStore';
import { t } from '../../i18n';

// ---------------------------------------------------------------------------
// Date grouping helpers
// ---------------------------------------------------------------------------

type DateGroup = 'today' | 'yesterday' | 'thisWeek' | 'older';

const DATE_GROUP_KEYS: Record<DateGroup, string> = {
    today: 'ui.history.today',
    yesterday: 'ui.history.yesterday',
    thisWeek: 'ui.history.thisWeek',
    older: 'ui.history.older',
};

function getDateGroup(isoDate: string): DateGroup {
    const date = new Date(isoDate);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
    const weekStart = new Date(todayStart.getTime() - todayStart.getDay() * 86_400_000);

    if (date >= todayStart) return 'today';
    if (date >= yesterdayStart) return 'yesterday';
    if (date >= weekStart) return 'thisWeek';
    return 'older';
}

function formatTime(isoDate: string): string {
    const d = new Date(isoDate);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoDate: string): string {
    const d = new Date(isoDate);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// HistoryPanel
// ---------------------------------------------------------------------------

type SourceTab = 'all' | 'obsilo' | 'claude-ai' | 'claude-code' | 'chatgpt' | 'perplexity' | 'unknown';
const SOURCE_TAB_LABELS: Record<SourceTab, string> = {
    'all': 'All',
    'obsilo': 'Vault Operator',
    'claude-ai': 'Claude.ai',
    'claude-code': 'Claude Code',
    'chatgpt': 'ChatGPT',
    'perplexity': 'Perplexity',
    'unknown': 'Unknown',
};

export class HistoryPanel {
    private panelEl: HTMLElement | null = null;
    private isOpen = false;
    private filterText = '';
    private memoryOnly = false;
    /** BA-26 / FEAT-23-03: active Source-Tab. 'all' shows everything. */
    private sourceTab: SourceTab = 'all';
    /** FIX-23-01-01: when set, filter list to one cross-interface thread; null = no filter. */
    private threadFilter: string | null = null;

    constructor(
        private store: ConversationStore,
        private onLoad: (id: string) => void,
        private onDelete: (id: string) => void,
        private onStampLink: (conversationId: string, title: string) => void,
        private activeConversationId: string | null,
        private onSaveToMemory: ((id: string, title: string) => Promise<void> | void) | null = null,
        private onRemoveFromMemory: ((id: string, title: string) => Promise<void> | void) | null = null,
        private isInMemory: ((id: string) => boolean) | null = null,
        private onRename: ((id: string, currentTitle: string) => Promise<void> | void) | null = null,
        /** BA-26 / FEAT-23-04: confirm a pending external conversation (Manual-Sync). */
        private onConfirmPending: ((id: string, title: string) => Promise<void> | void) | null = null,
    ) {}

    /** Mount the panel inside a parent container. */
    mount(parent: HTMLElement): void {
        this.panelEl = parent.createDiv({ cls: 'history-panel' });
        this.panelEl.classList.add('agent-u-hidden');
    }

    /** Toggle open/close. */
    toggle(): void {
        if (this.isOpen) this.close();
        else this.open();
    }

    open(): void {
        if (!this.panelEl) return;
        this.isOpen = true;
        this.filterText = '';
        this.memoryOnly = false;
        this.render();
        this.panelEl.classList.remove('agent-u-hidden');
        window.requestAnimationFrame(() => this.panelEl?.addClass('history-panel-open'));
    }

    close(): void {
        if (!this.panelEl) return;
        this.isOpen = false;
        this.panelEl.removeClass('history-panel-open');
        window.setTimeout(() => {
            if (!this.isOpen && this.panelEl) this.panelEl.classList.add('agent-u-hidden');
        }, 200); // match CSS transition
    }

    /** Update active conversation id (for highlighting). */
    setActiveId(id: string | null): void {
        this.activeConversationId = id;
        if (this.isOpen) this.render();
    }

    /** Refresh if open (e.g., after a save). */
    refresh(): void {
        if (this.isOpen) this.render();
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    private render(): void {
        if (!this.panelEl) return;
        this.panelEl.empty();

        // Header
        const header = this.panelEl.createDiv({ cls: 'history-panel-header' });
        header.createSpan({ cls: 'history-panel-title', text: t('ui.history.title') });
        const closeBtn = header.createEl('button', { cls: 'history-panel-close clickable-icon' });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.close());

        // FIX-23-01-01: aktiver Thread-Filter wird oben als entfernbarer Chip
        // angezeigt -- gibt User die Sicht "alle Conversations dieses Threads
        // ueber alle Surfaces hinweg" plus klaren Exit.
        if (this.threadFilter) {
            const chipRow = this.panelEl.createDiv({ cls: 'history-panel-thread-chip-row' });
            const chip = chipRow.createDiv({ cls: 'history-panel-thread-chip' });
            chip.createSpan({ text: `Thread ${this.threadFilter.replace('thread-', '')}` });
            const closeBtn = chip.createEl('button', {
                cls: 'history-panel-thread-chip-close clickable-icon',
                attr: { 'aria-label': 'Clear thread filter' },
            });
            setIcon(closeBtn, 'x');
            closeBtn.addEventListener('click', () => {
                this.threadFilter = null;
                this.render();
            });
        }

        // BA-26 / FEAT-23-03: Source-Tabs. Tab erscheint nur wenn min. eine
        // Conversation der jeweiligen Source existiert. Klick filtert die
        // Liste vollstaendig -- keine Vermischung.
        const allConvs = this.store.list();
        const sourceCounts = new Map<SourceTab, number>();
        for (const c of allConvs) {
            const s = (c.sourceInterface ?? 'obsilo') as SourceTab;
            sourceCounts.set(s, (sourceCounts.get(s) ?? 0) + 1);
        }
        const visibleTabs: SourceTab[] = ['all'];
        for (const k of ['obsilo', 'claude-ai', 'claude-code', 'chatgpt', 'perplexity', 'unknown'] as SourceTab[]) {
            if ((sourceCounts.get(k) ?? 0) > 0) visibleTabs.push(k);
        }
        if (visibleTabs.length > 1) {
            const tabRow = this.panelEl.createDiv({ cls: 'history-panel-tabs' });
            for (const tab of visibleTabs) {
                const count = tab === 'all' ? allConvs.length : (sourceCounts.get(tab) ?? 0);
                const btn = tabRow.createEl('button', {
                    text: `${SOURCE_TAB_LABELS[tab]} (${count})`,
                    cls: `history-panel-tab${this.sourceTab === tab ? ' history-panel-tab-active' : ''}`,
                });
                btn.addEventListener('click', () => {
                    this.sourceTab = tab;
                    this.render();
                });
            }
        }

        // Filter
        const filterRow = this.panelEl.createDiv({ cls: 'history-panel-filter' });
        const filterInput = filterRow.createEl('input', {
            type: 'text',
            placeholder: t('ui.history.filter'),
            cls: 'history-panel-filter-input',
        });
        filterInput.value = this.filterText;
        filterInput.addEventListener('input', () => {
            this.filterText = filterInput.value;
            this.renderList(listEl);
        });

        // Memory-only toggle (FEATURE-0318): only meaningful when the
        // host wired the isInMemory predicate through.
        if (this.isInMemory) {
            const memToggle = filterRow.createEl('button', {
                cls: `history-panel-memory-toggle clickable-icon${this.memoryOnly ? ' history-panel-memory-toggle-active' : ''}`,
                attr: { 'aria-label': t('ui.history.filterMemoryOnly') },
            });
            setIcon(memToggle, 'star');
            memToggle.addEventListener('click', () => {
                this.memoryOnly = !this.memoryOnly;
                this.render();
            });
        }

        // List
        const listEl = this.panelEl.createDiv({ cls: 'history-panel-list' });
        this.renderList(listEl);
    }

    private renderList(container: HTMLElement): void {
        container.empty();

        let conversations = this.store.list();
        // FIX-23-01-01: Thread-Filter ueberschreibt Source-Tab-Filter --
        // wer einen Thread anklickt, will Conversations aller Surfaces sehen.
        if (this.threadFilter) {
            conversations = conversations.filter((c) =>
                c.crossInterfaceThreadId === this.threadFilter
            );
        } else if (this.sourceTab !== 'all') {
            // BA-26 / FEAT-23-03: Source-Tab-Filter, vollstaendige Trennung pro
            // Provider. Conversations ohne Tag gelten als 'obsilo'.
            conversations = conversations.filter((c) =>
                ((c.sourceInterface ?? 'obsilo') as SourceTab) === this.sourceTab
            );
        }
        if (this.filterText) {
            const lower = this.filterText.toLowerCase();
            conversations = conversations.filter((c) => c.title.toLowerCase().includes(lower));
        }
        if (this.memoryOnly && this.isInMemory) {
            conversations = conversations.filter((c) => this.isInMemory!(c.id));
        }

        if (conversations.length === 0) {
            container.createDiv({ cls: 'history-panel-empty', text: t('ui.history.empty') });
            return;
        }

        // Group by date
        const groups = new Map<DateGroup, ConversationMeta[]>();
        const order: DateGroup[] = ['today', 'yesterday', 'thisWeek', 'older'];
        for (const c of conversations) {
            const group = getDateGroup(c.updated);
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group)!.push(c);
        }

        for (const groupName of order) {
            const items = groups.get(groupName);
            if (!items || items.length === 0) continue;

            container.createDiv({ cls: 'history-group-label', text: t(DATE_GROUP_KEYS[groupName]) });

            for (const conv of items) {
                const row = container.createDiv({
                    cls: `history-row${conv.id === this.activeConversationId ? ' history-row-active' : ''}`,
                });

                const info = row.createDiv({ cls: 'history-row-info' });
                const titleRow = info.createDiv({ cls: 'history-row-title-row' });
                titleRow.createDiv({ cls: 'history-row-title', text: conv.title });
                // BA-26 / FEAT-23-03: Source-Pill (nur fuer non-obsilo + non-default).
                const source = conv.sourceInterface ?? 'obsilo';
                if (source !== 'obsilo') {
                    titleRow.createSpan({
                        cls: `history-row-source-pill history-row-source-pill-${source}`,
                        text: SOURCE_TAB_LABELS[source as SourceTab] ?? source,
                    });
                }
                // BA-26 / FEAT-23-04: Pending-Marker fuer Manual-Sync Conversations.
                if (conv.syncState === 'pending') {
                    titleRow.createSpan({
                        cls: 'history-row-pending-marker',
                        text: 'pending',
                    });
                }
                // FIX-23-01-01: Thread-Pill fuer Conversations mit
                // crossInterfaceThreadId. Klick filtert auf Thread-Mitglieder
                // ueber alle Source-Tabs hinweg. Skip wenn schon im
                // Thread-Filter (kein Sinn).
                if (conv.crossInterfaceThreadId && this.threadFilter !== conv.crossInterfaceThreadId) {
                    const threadPill = titleRow.createEl('button', {
                        cls: 'history-row-thread-pill',
                        text: 'Thread',
                        attr: { 'aria-label': `Filter by thread ${conv.crossInterfaceThreadId}` },
                    });
                    threadPill.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.threadFilter = conv.crossInterfaceThreadId ?? null;
                        this.render();
                    });
                }
                const meta = info.createDiv({ cls: 'history-row-meta' });
                const timeStr = groupName === 'today' || groupName === 'yesterday'
                    ? formatTime(conv.updated)
                    : formatDate(conv.updated);
                meta.createSpan({ text: timeStr });
                meta.createSpan({ text: ` \u00B7 ${t('ui.history.messageCount', { count: conv.messageCount })}` });

                // Action buttons (visible on hover)
                const actions = row.createDiv({ cls: 'history-row-actions' });

                // BA-26 / FEAT-23-04: Confirm-Button fuer Pending-Conversations.
                if (conv.syncState === 'pending' && this.onConfirmPending) {
                    const confirmBtn = actions.createEl('button', { cls: 'history-row-action clickable-icon' });
                    setIcon(confirmBtn, 'check');
                    confirmBtn.setAttribute('aria-label', 'Confirm and add to memory');
                    confirmBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const action = this.onConfirmPending!(conv.id, conv.title);
                        Promise.resolve(action).then(() => this.render()).catch(() => undefined);
                    });
                }

                const copyBtn = actions.createEl('button', { cls: 'history-row-action clickable-icon' });
                setIcon(copyBtn, 'link');
                copyBtn.setAttribute('aria-label', t('ui.history.copyLink'));
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const uri = `obsidian://vault-operator-chat?id=${encodeURIComponent(conv.id)}`;
                    let linkTitle = conv.title.replace(/\n.*/s, '').trim();
                    if (linkTitle.length > 60) linkTitle = linkTitle.slice(0, 57) + '...';
                    const mdLink = `[${linkTitle}](${uri})`;
                    void navigator.clipboard.writeText(mdLink).then(() => {
                        new Notice(t('ui.history.linkCopied'));
                    });
                });

                if (this.onRename) {
                    const renameBtn = actions.createEl('button', { cls: 'history-row-action clickable-icon' });
                    setIcon(renameBtn, 'pencil');
                    renameBtn.setAttribute('aria-label', t('ui.history.rename'));
                    renameBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const action = this.onRename!(conv.id, conv.title);
                        Promise.resolve(action).then(() => this.render()).catch(() => undefined);
                    });
                }

                const stampBtn = actions.createEl('button', { cls: 'history-row-action clickable-icon' });
                setIcon(stampBtn, 'file-plus');
                stampBtn.setAttribute('aria-label', t('ui.history.addToNote'));
                stampBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    let linkTitle = conv.title.replace(/\n.*/s, '').trim();
                    if (linkTitle.length > 60) linkTitle = linkTitle.slice(0, 57) + '...';
                    this.onStampLink(conv.id, linkTitle);
                });

                if (this.onSaveToMemory) {
                    const inMem = this.isInMemory?.(conv.id) ?? false;
                    const memBtn = actions.createEl('button', {
                        cls: `history-row-action clickable-icon${inMem ? ' history-row-action-pinned' : ''}`,
                    });
                    setIcon(memBtn, 'star');
                    memBtn.setAttribute('aria-label', inMem
                        ? t('ui.history.removeFromMemory')
                        : t('ui.history.saveToMemory'));
                    memBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        let title = conv.title.replace(/\n.*/s, '').trim();
                        if (title.length > 60) title = title.slice(0, 57) + '...';
                        const action = inMem
                            ? this.onRemoveFromMemory?.(conv.id, title)
                            : this.onSaveToMemory!(conv.id, title);
                        Promise.resolve(action).then(() => this.render()).catch(() => undefined);
                    });
                }

                const delBtn = actions.createEl('button', { cls: 'history-row-action history-row-action-danger clickable-icon' });
                setIcon(delBtn, 'trash-2');
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.onDelete(conv.id);
                    this.render();
                });

                row.addEventListener('click', () => {
                    this.onLoad(conv.id);
                    this.close();
                });
            }
        }
    }
}
