import { setIcon } from 'obsidian';

/**
 * CommandPicker -- searchable single-select popover for skills, prompts,
 * and workflows.
 *
 * Anchored to a toolbar button, styled identically to VaultFilePicker so
 * the + menu stays coherent. Single-select because a chat turn only
 * activates one command at a time; multi-select is reserved for
 * VaultFilePicker where attachments are naturally plural.
 *
 * FEATURE-2209 (EPIC-022 follow-up, 2026-04-19): user feedback that
 * listing every skill inline under the + menu gets cluttered as the
 * library grows. Search + pick mirrors the VaultFilePicker UX.
 */
export interface CommandPickerItem {
    /** Display label, e.g. skill/prompt/workflow name. */
    label: string;
    /** Secondary line, usually `/slug`, `#slug`, or `§slug`. */
    sub: string;
    /** Short tag badge: 'Skill' | 'Prompt' | 'Workflow'. */
    tag: string;
    /** Optional lucide icon name for the row. */
    icon?: string;
    /** Arbitrary searchable text (e.g. description). */
    searchable?: string;
    onSelect: () => void;
}

export class CommandPicker {
    private containerEl: HTMLElement | null = null;
    private searchInput: HTMLInputElement | null = null;
    private listEl: HTMLElement | null = null;
    private activeIdx = 0;
    private filtered: CommandPickerItem[] = [];
    private resizeHandler: (() => void) | null = null;

    constructor(
        private readonly items: CommandPickerItem[],
        private readonly title: string,
        private readonly emptyLabel: string,
    ) {}

    show(anchor: HTMLElement, parentContainerEl?: HTMLElement): void {
        this.hide();
        this.activeIdx = 0;

        this.containerEl = activeDocument.body.createDiv('vault-file-picker command-picker');

        const positionPopover = () => {
            if (!this.containerEl) return;
            const br = anchor.getBoundingClientRect();
            const cr = parentContainerEl
                ? parentContainerEl.getBoundingClientRect()
                : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth, width: window.innerWidth };
            const pad = 8;

            this.containerEl.setCssProps({ '--vfp-pos': 'fixed' });

            const popWidth = Math.min(360, cr.width - pad * 2);
            this.containerEl.setCssProps({ '--vfp-w': `${popWidth}px` });

            const spaceAbove = br.top - cr.top - pad;
            const spaceBelow = cr.bottom - br.bottom - pad;

            if (spaceAbove >= spaceBelow) {
                this.containerEl.setCssProps({
                    '--vfp-bottom': (window.innerHeight - br.top + 4) + 'px',
                    '--vfp-top': '',
                    '--vfp-max-h': `${Math.max(spaceAbove, 200)}px`,
                });
            } else {
                this.containerEl.setCssProps({
                    '--vfp-top': (br.bottom + 4) + 'px',
                    '--vfp-bottom': '',
                    '--vfp-max-h': `${Math.max(spaceBelow, 200)}px`,
                });
            }

            let left = Math.max(br.left, cr.left + pad);
            if (left + popWidth > cr.right - pad) left = cr.right - pad - popWidth;
            left = Math.max(left, cr.left + pad);
            this.containerEl.setCssProps({ '--vfp-left': `${left}px` });
        };
        positionPopover();

        this.resizeHandler = positionPopover;
        window.addEventListener('resize', this.resizeHandler);

        const searchRow = this.containerEl.createDiv('vfp-search-row');
        const searchIconEl = searchRow.createSpan('vfp-search-icon');
        setIcon(searchIconEl, 'search');
        this.searchInput = searchRow.createEl('input', {
            cls: 'vfp-search-input',
            attr: { placeholder: this.title, type: 'text', spellcheck: 'false' },
        });

        this.listEl = this.containerEl.createDiv('vfp-list');

        this.searchInput.addEventListener('input', () => {
            this.activeIdx = 0;
            this.renderList();
        });

        this.searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.activeIdx = Math.min(this.activeIdx + 1, this.filtered.length - 1);
                    this.renderList();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.activeIdx = Math.max(this.activeIdx - 1, 0);
                    this.renderList();
                    break;
                case 'Enter': {
                    e.preventDefault();
                    const item = this.filtered[this.activeIdx];
                    if (item) {
                        this.hide();
                        item.onSelect();
                    }
                    break;
                }
                case 'Escape':
                    e.preventDefault();
                    this.hide();
                    break;
            }
        });

        const closeOnOutside = (e: MouseEvent) => {
            if (this.containerEl && !this.containerEl.contains(e.target as Node)) {
                this.hide();
                activeDocument.removeEventListener('mousedown', closeOnOutside);
            }
        };
        activeDocument.addEventListener('mousedown', closeOnOutside);

        this.renderList();
        window.setTimeout(() => this.searchInput?.focus(), 0);
    }

    hide(): void {
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
        this.containerEl?.remove();
        this.containerEl = null;
        this.searchInput = null;
        this.listEl = null;
        this.filtered = [];
    }

    private renderList(): void {
        if (!this.listEl) return;
        const query = (this.searchInput?.value ?? '').toLowerCase();

        this.filtered = this.items.filter((item) => {
            if (!query) return true;
            return item.label.toLowerCase().includes(query)
                || item.sub.toLowerCase().includes(query)
                || (item.searchable?.toLowerCase().includes(query) ?? false);
        });

        if (this.activeIdx >= this.filtered.length) this.activeIdx = 0;

        this.listEl.empty();

        if (this.filtered.length === 0) {
            this.listEl.createDiv({ cls: 'vfp-empty', text: this.emptyLabel });
            return;
        }

        this.filtered.forEach((item, idx) => {
            const isActive = idx === this.activeIdx;
            const row = this.listEl!.createDiv({
                cls: `vfp-row${isActive ? ' vfp-row-active' : ''}`,
            });

            if (item.icon) {
                const iconEl = row.createSpan('vfp-row-icon');
                setIcon(iconEl, item.icon);
            }

            const info = row.createDiv('vfp-row-info');
            info.createSpan({ cls: 'vfp-row-name', text: item.label });
            info.createSpan({ cls: 'vfp-row-path', text: item.sub });

            row.createSpan({ cls: 'autocomplete-tag', text: item.tag });

            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
                item.onSelect();
            });
        });

        const activeRow = this.listEl.querySelector<HTMLElement>('.vfp-row-active');
        activeRow?.scrollIntoView({ block: 'nearest' });
    }
}
