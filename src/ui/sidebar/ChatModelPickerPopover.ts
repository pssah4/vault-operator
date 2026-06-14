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
import type { EffortLevel } from '../../types/model-registry';
import { t } from '../../i18n';
import type { ThinkingOverride } from './thinkingOverride';
import type { EffortOverride } from './effortOverride';
import {
    effortControlVisibility,
    effortStops,
    effortIndexForOverride,
    effortStopForIndex,
    effortFractionForIndex,
    effortIndexForFraction,
    thinkingSwitchIsOn,
} from './effortOverride';

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
    /**
     * Native effort levels for the model the next turn runs on (the pinned
     * model, else the default-active model). Empty means the model has no
     * native effort surface, so the effort control stays hidden.
     */
    getEffortLevels: () => EffortLevel[];
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

        // ── Thinking switch + reasoning-effort slider (per conversation) ──
        // Thinking is a binary On/Off pill switch. The effort slider is built
        // only when the model is effort-capable, and its row is shown only
        // while thinking is On. Flipping the switch toggles the row live.
        const levels = callbacks.getEffortLevels();
        const effortCapable = levels.length > 0;

        // Build the effort row once (if the model can send effort) so the
        // switch can show/hide it without rebuilding the DOM.
        const effortRow = effortCapable ? this.makeEffortControl(popover, callbacks, levels) : null;

        const syncEffortRowVisibility = () => {
            if (!effortRow) return;
            const visibility = effortControlVisibility(
                thinkingSwitchIsOn(callbacks.getThinking()),
                effortCapable,
            );
            effortRow.wrap.classList.toggle('agent-u-hidden', visibility !== 'control');
            if (visibility === 'control') effortRow.sync();
        };

        this.makeThinkingControl(popover, callbacks, syncEffortRowVisibility);
        syncEffortRowVisibility();

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
     * Per-conversation thinking switch: a binary On/Off pill switch (a track
     * with a sliding knob, accent when on). The picker keeps the tri-state
     * ThinkingOverride internally for default preservation: On reads as
     * override !== 'off' (so the byte-identical 'follow' default shows On), Off
     * reads as override === 'off'. Clicking sets an explicit 'on' or 'off'.
     *
     * Models without thinking ignore an 'on' override (the providers already
     * no-op it), so the switch stays a simple binary toggle.
     */
    private makeThinkingControl(
        popover: HTMLElement,
        callbacks: ChatModelPickerCallbacks,
        onToggle: () => void,
    ): void {
        const row = popover.createDiv('chat-model-picker-thinking');
        row.createDiv({
            cls: 'chat-model-picker-thinking-label',
            text: t('ui.sidebar.thinkingOverrideLabel'),
        });

        const switchBtn = row.createEl('button', {
            cls: 'chat-model-picker-thinking-switch',
            attr: { type: 'button', role: 'switch' },
        });
        switchBtn.createSpan('chat-model-picker-thinking-knob');
        const stateText = row.createSpan('chat-model-picker-thinking-state');

        const sync = () => {
            const on = thinkingSwitchIsOn(callbacks.getThinking());
            switchBtn.classList.toggle('is-on', on);
            switchBtn.setAttr('aria-checked', on ? 'true' : 'false');
            stateText.setText(on ? t('ui.sidebar.thinkingOn') : t('ui.sidebar.thinkingOff'));
        };

        switchBtn.addEventListener('click', () => {
            // currently-on -> off, currently-off -> on. Always an explicit value.
            const next: ThinkingOverride = thinkingSwitchIsOn(callbacks.getThinking()) ? 'off' : 'on';
            callbacks.onThinkingChange(next);
            sync();
            onToggle();
        });
        sync();
    }

    /**
     * Per-conversation reasoning-effort slider: a Claude-Code-style pill slider
     * (a pill track with one dot marker per stop and a round knob, accent-filled
     * up to the knob). Stops are ['auto', ...model-native levels]. 'auto' (the
     * leftmost default) sends no effort field, so an untouched picker changes
     * nothing. Returns the row wrap plus a sync() so the caller can re-sync when
     * it un-hides the row.
     */
    private makeEffortControl(
        popover: HTMLElement,
        callbacks: ChatModelPickerCallbacks,
        levels: EffortLevel[],
    ): { wrap: HTMLElement; sync: () => void } {
        const stops = effortStops(levels);
        const labelFor = (level: EffortOverride): string => {
            switch (level) {
                case 'minimal': return t('ui.sidebar.effortMinimal');
                case 'low': return t('ui.sidebar.effortLow');
                case 'medium': return t('ui.sidebar.effortMedium');
                case 'high': return t('ui.sidebar.effortHigh');
                case 'xhigh': return t('ui.sidebar.effortXhigh');
                case 'max': return t('ui.sidebar.effortMax');
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

        // Custom div slider (not a native <input type=range>): the native thumb
        // is inset by half its width at each end, so it can never sit flush-left
        // at 'auto' or flush-right at 'max', and its fill never lines up with the
        // thumb. Here the knob is positioned by a fraction var so it lands exactly
        // on each dot, flush at both extremes, and the fill ends under the knob.
        // The pill itself is the slider widget (role=slider, focusable).
        const pill = row.createDiv('chat-model-picker-effort-pill');
        pill.setAttrs({
            role: 'slider',
            tabindex: '0',
            'aria-label': t('ui.sidebar.effortLabel'),
            'aria-valuemin': '0',
            'aria-valuemax': String(stops.length - 1),
        });
        pill.createDiv('chat-model-picker-effort-fill');
        const dots = pill.createDiv('chat-model-picker-effort-dots');
        for (let i = 0; i < stops.length; i++) {
            dots.createSpan('chat-model-picker-effort-dot');
        }
        const knob = pill.createDiv('chat-model-picker-effort-knob');
        knob.setAttr('aria-hidden', 'true');

        const sync = () => {
            const idx = effortIndexForOverride(stops, callbacks.getEffort());
            const frac = effortFractionForIndex(idx, stops.length);
            // One fraction var drives both the knob position and the fill width
            // via CSS calc, so no inline geometry is assigned directly.
            pill.setCssProps({ '--effort-frac': String(frac) });
            const label = labelFor(stops[idx] ?? 'auto');
            valueEl.setText(label);
            pill.setAttr('aria-valuenow', String(idx));
            pill.setAttr('aria-valuetext', label);
        };

        const commitIndex = (idx: number) => {
            const level = effortStopForIndex(stops, idx);
            if (level !== callbacks.getEffort()) callbacks.onEffortChange(level);
            sync();
        };

        // Map a pointer x to the nearest stop. The knob is KNOB_PX wide and its
        // centre travels from KNOB_PX/2 to width-KNOB_PX/2, matching the CSS
        // calc(var(--effort-frac) * (100% - KNOB_PX)).
        const KNOB_PX = 18;
        const indexFromClientX = (clientX: number): number => {
            const rect = pill.getBoundingClientRect();
            const travel = rect.width - KNOB_PX;
            const x = clientX - rect.left - KNOB_PX / 2;
            const frac = travel > 0 ? x / travel : 0;
            return effortIndexForFraction(frac, stops.length);
        };

        let dragging = false;
        pill.addEventListener('pointerdown', (e: PointerEvent) => {
            dragging = true;
            pill.setPointerCapture(e.pointerId);
            // preventDefault stops text selection but also cancels the default
            // focus move, so focus the pill explicitly: otherwise the keyboard
            // (Arrow/Home/End) handler below stays unreachable after a click.
            pill.focus();
            commitIndex(indexFromClientX(e.clientX));
            e.preventDefault();
        });
        pill.addEventListener('pointermove', (e: PointerEvent) => {
            if (!dragging) return;
            commitIndex(indexFromClientX(e.clientX));
        });
        const endDrag = (e: PointerEvent) => {
            if (!dragging) return;
            dragging = false;
            if (pill.hasPointerCapture(e.pointerId)) pill.releasePointerCapture(e.pointerId);
        };
        pill.addEventListener('pointerup', endDrag);
        pill.addEventListener('pointercancel', endDrag);

        pill.addEventListener('keydown', (e: KeyboardEvent) => {
            const cur = effortIndexForOverride(stops, callbacks.getEffort());
            let next = cur;
            switch (e.key) {
                case 'ArrowLeft':
                case 'ArrowDown': next = cur - 1; break;
                case 'ArrowRight':
                case 'ArrowUp': next = cur + 1; break;
                case 'Home': next = 0; break;
                case 'End': next = stops.length - 1; break;
                default: return;
            }
            e.preventDefault();
            commitIndex(Math.min(Math.max(next, 0), stops.length - 1));
        });

        sync();

        return { wrap: row, sync };
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
