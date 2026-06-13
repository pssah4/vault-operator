/**
 * EPIC-26 / FEAT-26-05 -- chat-header model picker popover.
 *
 * Replaces the Obsidian-Menu-based dropdown so the user can search
 * through provider model lists. Bedrock and OpenRouter routinely
 * surface 50+ entries; without a filter the scroll is unusable.
 *
 * Visual layout matches `ToolPickerPopover` (.tool-picker-* CSS) so
 * the two popovers feel like siblings.
 *
 * Single-select semantics:
 *  - First entry is always "Auto" (returns null override)
 *  - Following entries are the discovered models of the active provider
 *  - Click sets the override on the parent and closes the popover
 */

import { setIcon } from 'obsidian';
import type { DiscoveredModel, ProviderConfig } from '../../types/settings';
import { getTierBadgeLabel } from '../../types/settings';
import { getModelEffortSupport } from '../../types/model-registry';
import { t } from '../../i18n';
import type { ThinkingOverride } from './thinkingOverride';
import type { EffortOverride } from './effortOverride';
import { isExplicitEffortOverride, effortControlVisibility } from './effortOverride';

export interface ChatModelPickerCallbacks {
    /** Currently selected override (null = Auto). */
    getCurrent: () => string | null;
    /** Called when the user picks a new override (null = Auto). */
    onSelect: (overrideId: string | null) => void;
    /** Current per-conversation thinking override. */
    getThinking: () => ThinkingOverride;
    /** Called when the user changes the thinking override. */
    onThinkingChange: (override: ThinkingOverride) => void;
    /** Current per-conversation reasoning-effort override. */
    getEffort: () => EffortOverride;
    /** Called when the user changes the reasoning-effort override. */
    onEffortChange: (override: EffortOverride) => void;
}

export class ChatModelPickerPopover {
    private popoverEl: HTMLElement | null = null;
    private closeHandler: ((e: MouseEvent) => void) | null = null;
    private resizeHandler: (() => void) | null = null;
    private keyHandler: ((e: KeyboardEvent) => void) | null = null;

    show(
        event: MouseEvent,
        anchorBtn: HTMLElement,
        containerEl: HTMLElement,
        provider: ProviderConfig,
        callbacks: ChatModelPickerCallbacks,
    ): void {
        this.close();

        const popover = activeDocument.createElement('div');
        popover.className = 'tool-picker-popover chat-model-picker';
        this.popoverEl = popover;

        // ── Header ───────────────────────────────────────────────────────
        const header = popover.createDiv('tool-picker-header');
        header.createSpan({
            cls: 'tool-picker-title',
            text: t('ui.sidebar.modelPickerTitle', {
                provider: provider.displayName ?? provider.type,
            }),
        });

        // ── Search input ─────────────────────────────────────────────────
        const searchInput = popover.createEl('input', {
            cls: 'tool-picker-search',
            attr: {
                placeholder: t('ui.sidebar.modelPickerSearch'),
                type: 'text',
                spellcheck: 'false',
            },
        });

        // ── Scroll body ──────────────────────────────────────────────────
        const scrollEl = popover.createDiv('tool-picker-scroll');

        const current = callbacks.getCurrent();
        const advisorDisabled = !(provider.tierOverrides?.flagship ?? provider.tierMapping?.flagship);

        // Auto row (always first, never filtered out)
        const autoRow = this.makeAutoRow(scrollEl, current === null, advisorDisabled);
        autoRow.addEventListener('click', () => {
            callbacks.onSelect(null);
            this.close();
        });

        // Model rows
        const models = provider.discoveredModels ?? [];
        const modelRows: Array<{ row: HTMLElement; needle: string }> = [];
        for (const m of models) {
            const row = this.makeModelRow(scrollEl, m, current);
            row.addEventListener('click', () => {
                callbacks.onSelect(m.id);
                this.close();
            });
            const needle = [
                m.id,
                m.displayName ?? '',
                m.autoTier ?? '',
            ].join(' ').toLowerCase();
            modelRows.push({ row, needle });
        }

        // Empty-state hint when the provider has no discovered models yet
        if (models.length === 0) {
            scrollEl.createDiv({
                cls: 'tp-empty-hint',
                text: t('ui.sidebar.modelPickerNoModels'),
            });
        }

        // ── Live filter ──────────────────────────────────────────────────
        const applyFilter = () => {
            const q = searchInput.value.trim().toLowerCase();
            for (const { row, needle } of modelRows) {
                const match = q === '' || needle.includes(q);
                row.classList.toggle('agent-u-hidden', !match);
            }
        };
        searchInput.addEventListener('input', applyFilter);

        // ── Thinking + reasoning-effort overrides (per conversation) ─────
        // The thinking toggle always shows. The effort control is revealed
        // only when thinking is On AND the active model can send a native
        // effort field; otherwise it is omitted (no inert control, no hint).
        const setThinkingDisabled = this.makeThinkingControl(popover, callbacks);
        const pinnedId = callbacks.getCurrent();
        const effortCapable = pinnedId !== null && getModelEffortSupport(pinnedId, provider.type);
        const thinkingOn = callbacks.getThinking() !== 'off';
        const visibility = effortControlVisibility(thinkingOn, effortCapable);
        if (visibility === 'control') {
            this.makeEffortControl(popover, callbacks, setThinkingDisabled);
        }
        // Coherence on open: if effort is already explicit, the thinking
        // toggle is greyed (effort drives reasoning depth on Claude).
        setThinkingDisabled(visibility === 'control' && isExplicitEffortOverride(callbacks.getEffort()));

        // ── Keyboard: Esc closes, Enter selects first visible ───────────
        this.keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const firstVisible = modelRows.find(({ row }) => !row.classList.contains('agent-u-hidden'));
                if (firstVisible) firstVisible.row.click();
                else autoRow.click();
            }
        };
        searchInput.addEventListener('keydown', this.keyHandler);

        // ── Mount + position ────────────────────────────────────────────
        activeDocument.body.appendChild(popover);
        this.positionPopover(popover, anchorBtn, containerEl);
        this.resizeHandler = () => this.positionPopover(popover, anchorBtn, containerEl);
        window.addEventListener('resize', this.resizeHandler);

        // Focus search on open
        window.setTimeout(() => searchInput.focus(), 30);

        // Close on outside click
        this.closeHandler = (e: MouseEvent) => {
            if (!this.popoverEl?.contains(e.target as Node) && e.target !== anchorBtn) {
                this.close();
            }
        };
        window.setTimeout(() => activeDocument.addEventListener('mousedown', this.closeHandler!), 50);
    }

    close(): void {
        if (this.closeHandler) {
            activeDocument.removeEventListener('mousedown', this.closeHandler);
            this.closeHandler = null;
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
        this.popoverEl?.remove();
        this.popoverEl = null;
        this.keyHandler = null;
    }

    isOpen(): boolean {
        return this.popoverEl !== null;
    }

    // ── Internals ──────────────────────────────────────────────────────

    private makeAutoRow(scrollEl: HTMLElement, isCurrent: boolean, advisorDisabled: boolean): HTMLElement {
        const row = scrollEl.createDiv({
            cls: 'tp-item-row chat-model-picker-row chat-model-picker-auto',
        });
        const iconEl = row.createSpan('tp-item-icon');
        setIcon(iconEl, 'sparkles');
        const labelWrap = row.createDiv('tp-item-label-wrap');
        labelWrap.createDiv({ cls: 'tp-item-label', text: t('ui.sidebar.modelAuto') });
        labelWrap.createDiv({
            cls: 'tp-item-desc',
            text: advisorDisabled
                ? t('ui.sidebar.modelAdvisorDisabled')
                : t('ui.sidebar.modelAutoTitle'),
        });
        if (isCurrent) {
            const check = row.createSpan('chat-model-picker-check');
            setIcon(check, 'check');
        }
        return row;
    }

    private makeModelRow(scrollEl: HTMLElement, m: DiscoveredModel, currentOverride: string | null): HTMLElement {
        const row = scrollEl.createDiv({ cls: 'tp-item-row chat-model-picker-row' });
        const labelWrap = row.createDiv('tp-item-label-wrap');
        const labelLine = labelWrap.createDiv('tp-item-label');
        labelLine.createSpan({ text: m.displayName ?? m.id });
        if (m.autoTier) {
            const tier = labelLine.createSpan({
                cls: `chat-model-picker-tier chat-model-picker-tier-${m.autoTier}`,
                text: getTierBadgeLabel(m.autoTier),
            });
            tier.setAttr('aria-label', `tier: ${getTierBadgeLabel(m.autoTier)}`);
        }
        if (m.displayName && m.displayName !== m.id) {
            labelWrap.createDiv({ cls: 'tp-item-desc', text: m.id });
        }
        if (currentOverride === m.id) {
            const check = row.createSpan('chat-model-picker-check');
            setIcon(check, 'check');
        }
        return row;
    }

    /**
     * Per-conversation thinking override (issue #44): a small segmented
     * control with Follow / On / Off. "Follow" is the default and keeps the
     * active model's own thinking setting, so an untouched picker changes
     * nothing.
     */
    private makeThinkingControl(popover: HTMLElement, callbacks: ChatModelPickerCallbacks): (disabled: boolean) => void {
        const footer = popover.createDiv('chat-model-picker-thinking');
        footer.createDiv({
            cls: 'chat-model-picker-thinking-label',
            text: t('ui.sidebar.thinkingOverrideLabel'),
        });
        const group = footer.createDiv('chat-model-picker-thinking-group');

        const options: Array<{ value: ThinkingOverride; label: string }> = [
            { value: 'follow', label: t('ui.sidebar.thinkingOverrideFollow') },
            { value: 'on', label: t('ui.sidebar.thinkingOverrideOn') },
            { value: 'off', label: t('ui.sidebar.thinkingOverrideOff') },
        ];

        const buttons: Array<{ value: ThinkingOverride; el: HTMLButtonElement }> = [];
        const sync = () => {
            const current = callbacks.getThinking();
            for (const b of buttons) {
                b.el.classList.toggle('is-active', b.value === current);
                b.el.setAttr('aria-pressed', b.value === current ? 'true' : 'false');
            }
        };

        for (const opt of options) {
            const btn = group.createEl('button', {
                cls: 'chat-model-picker-thinking-btn',
                text: opt.label,
                attr: { type: 'button' },
            });
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                callbacks.onThinkingChange(opt.value);
                sync();
            });
            buttons.push({ value: opt.value, el: btn });
        }
        sync();

        // Returned so the effort control can grey the thinking toggle when an
        // explicit effort level is set (effort drives reasoning depth, so a
        // Thinking=Off plus Effort=High combination is contradictory).
        return (disabled: boolean) => {
            footer.classList.toggle('is-disabled', disabled);
            for (const b of buttons) b.el.disabled = disabled;
        };
    }

    /**
     * Per-conversation reasoning-effort override: a segmented control with
     * Auto / Low / Medium / High. Only rendered when a model is pinned and the
     * model can send a native effort field. "Auto" (the default) sends no
     * effort field, so an untouched picker changes nothing.
     */
    private makeEffortControl(
        popover: HTMLElement,
        callbacks: ChatModelPickerCallbacks,
        setThinkingDisabled: (disabled: boolean) => void,
    ): void {
        // Ordered stops, left (Auto = no override) to right (High). A slider
        // rather than buttons, matching the Claude Code effort selector.
        const LEVELS: EffortOverride[] = ['auto', 'low', 'medium', 'high'];
        const labelFor = (level: EffortOverride): string => {
            switch (level) {
                case 'low': return t('ui.sidebar.effortLow');
                case 'medium': return t('ui.sidebar.effortMedium');
                case 'high': return t('ui.sidebar.effortHigh');
                case 'auto':
                default: return t('ui.sidebar.effortAuto');
            }
        };

        const row = popover.createDiv('chat-model-picker-effort');
        const labelWrap = row.createDiv('chat-model-picker-effort-labelwrap');
        labelWrap.createSpan({
            cls: 'chat-model-picker-effort-label',
            text: t('ui.sidebar.effortLabel'),
        });
        const valueEl = labelWrap.createSpan('chat-model-picker-effort-value');

        const slider = row.createEl('input', {
            cls: 'chat-model-picker-effort-slider',
            attr: { type: 'range', min: '0', max: String(LEVELS.length - 1), step: '1' },
        });
        slider.setAttr('aria-label', t('ui.sidebar.effortLabel'));

        const sync = () => {
            const current = callbacks.getEffort();
            const idx = Math.max(0, LEVELS.indexOf(current));
            slider.value = String(idx);
            // Filled portion of the pill track, driven by a CSS var so no
            // inline style property is assigned directly (bot-compliant).
            const pct = (idx / (LEVELS.length - 1)) * 100;
            slider.setCssProps({ '--effort-fill': `${pct}%` });
            const label = labelFor(current);
            valueEl.setText(label);
            slider.setAttr('aria-valuetext', label);
            setThinkingDisabled(isExplicitEffortOverride(current));
        };

        slider.addEventListener('input', () => {
            const level = LEVELS[Number(slider.value)] ?? 'auto';
            callbacks.onEffortChange(level);
            sync();
        });
        sync();
    }

    private positionPopover(popover: HTMLElement, anchorBtn: HTMLElement, containerEl: HTMLElement): void {
        const br = anchorBtn.getBoundingClientRect();
        const cr = containerEl.getBoundingClientRect();
        const pad = 8;
        popover.setCssProps({ '--tp-pos': 'fixed' });

        const popWidth = Math.min(400, cr.width - pad * 2);
        popover.setCssProps({
            '--tp-w': `${popWidth}px`,
            '--tp-min-w': `${Math.min(320, popWidth)}px`,
            '--tp-max-w': `${popWidth}px`,
        });

        const spaceAbove = br.top - cr.top - pad;
        const spaceBelow = cr.bottom - br.bottom - pad;
        if (spaceAbove >= spaceBelow) {
            popover.setCssProps({
                '--tp-bottom': (window.innerHeight - br.top + 4) + 'px',
                '--tp-top': '',
                '--tp-max-h': `${Math.max(spaceAbove, 240)}px`,
            });
        } else {
            popover.setCssProps({
                '--tp-top': (br.bottom + 4) + 'px',
                '--tp-bottom': '',
                '--tp-max-h': `${Math.max(spaceBelow, 240)}px`,
            });
        }

        let left = Math.max(br.left, cr.left + pad);
        if (left + popWidth > cr.right - pad) left = cr.right - pad - popWidth;
        left = Math.max(left, cr.left + pad);
        popover.setCssProps({ '--tp-left': `${left}px` });
    }
}
