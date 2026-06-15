import { Setting, setIcon } from 'obsidian';

/**
 * Open a small centered info-popover. Used by the settings info-icon
 * helpers below and by ProviderDetailModal's tier-row label. Body text
 * matches the .vault-op-box size (13px) so the visual register stays
 * consistent across intro banners, per-row hints, and tooltips.
 *
 * Dismiss: click outside, click the close button, or press Escape.
 */
export function openInfoPopover(title: string, body: string): void {
    const overlay = activeDocument.body.createDiv('agent-info-overlay');
    const popover = overlay.createDiv('agent-info-popover');
    const head = popover.createDiv('agent-info-head');
    head.createSpan({ cls: 'agent-info-title', text: title });
    const closeBtn = head.createEl('button', {
        cls: 'agent-info-close',
        attr: { type: 'button', 'aria-label': 'Close' },
    });
    setIcon(closeBtn, 'x');
    popover.createDiv({ cls: 'agent-info-body', text: body });
    const dismiss = (): void => overlay.remove();
    closeBtn.addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });
    const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
            dismiss();
            activeDocument.removeEventListener('keydown', onKey);
        }
    };
    activeDocument.addEventListener('keydown', onKey);
}

/**
 * Convert every legacy `<span class="mcm-desc">…</span>` inside `root`
 * into a clickable info-icon next to its sibling label.
 *
 * Background: ModelConfigModal was originally built with inline
 * descriptions rendered below each label. When the explanatory text
 * grew (e.g. EnBW Bedrock gateway, AWS credentials) the description
 * pushed the input column down to a few pixels wide. ProviderDetailModal
 * already uses the (i)-icon + popover pattern; this helper retrofits
 * the same look onto the legacy modal without touching every single
 * `createSpan({cls: 'mcm-desc'})` call site.
 *
 * Mechanics:
 *  - `.mcm-desc` is hidden by default via CSS.
 *  - For every `.mcm-label` that contains a `.mcm-desc` child, this
 *    helper appends an `.agent-info-btn` (Lucide info-glyph) right
 *    after the label span. Clicking it opens the existing popover
 *    with the description text.
 *  - Descriptions whose text is set lazily (apiKeyDescEl, baseUrlDescEl)
 *    are picked up via a MutationObserver, so the icon appears once
 *    the text shows up. The observer disconnects after the first wire.
 *  - Each label is marked with `data-tooltip-wired` so repeated calls
 *    are no-ops.
 */
export function wireMcmDescTooltips(root: HTMLElement): void {
    const labels = root.querySelectorAll<HTMLElement>('.mcm-label');
    labels.forEach((labelEl) => {
        if (labelEl.dataset.tooltipWired === '1') return;
        const desc = labelEl.querySelector<HTMLElement>(':scope > .mcm-desc');
        if (!desc) return;
        // The first non-desc child is treated as the label text. Most
        // call sites use a single span for the label.
        const labelChild = Array.from(labelEl.children).find(
            (c): c is HTMLElement => c instanceof HTMLElement && !c.classList.contains('mcm-desc'),
        );
        if (!labelChild) return;
        const labelText = (labelChild.textContent ?? '').trim();

        const attachIcon = (descText: string): void => {
            if (labelEl.querySelector(':scope > .agent-info-btn')) return;
            const btn = labelEl.createEl('button', {
                cls: 'agent-info-btn',
                attr: { type: 'button', 'aria-label': `${labelText}: info` },
            });
            setIcon(btn, 'info');
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openInfoPopover(labelText, descText);
            });
            // Sit right after the label text, before the (now hidden) desc.
            labelEl.insertBefore(btn, desc);
            labelEl.dataset.tooltipWired = '1';
        };

        const initialText = (desc.textContent ?? '').trim();
        if (initialText) {
            attachIcon(initialText);
            return;
        }
        // Late-binding: wait for the description text to land.
        const observer = new MutationObserver(() => {
            const text = (desc.textContent ?? '').trim();
            if (text) {
                observer.disconnect();
                attachIcon(text);
            }
        });
        observer.observe(desc, { childList: true, characterData: true, subtree: true });
    });
}

/**
 * Append a small info-icon button to an Obsidian Setting's name cell.
 * Clicking the icon opens a lightweight popover (centered overlay,
 * dismiss on outside-click / Escape) with the explanatory body.
 *
 * Use this to keep the inline `setDesc()` short ("what does this do
 * in one line") and move the rationale, edge cases, and defaults
 * recommendation into the tooltip.
 */
export function addInfoButton(setting: Setting, title: string, body: string): void {
    setting.nameEl.createEl('button', {
        cls: 'agent-info-btn',
        attr: { type: 'button', 'aria-label': `${title}: info`, title },
    }, (btn) => {
        setIcon(btn, 'info');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openInfoPopover(title, body);
        });
    });
}

/**
 * Render a section heading (h3) with an optional info-icon next to
 * the title. Clicking the icon opens the same popover used by
 * `addInfoButton`. Use this to attach a fachbegriff explanation to
 * a whole section without spending a coloured block of body text
 * on the tab.
 */
export function addSectionHeading(
    parent: HTMLElement,
    title: string,
    info?: { body: string },
    opts?: { level?: 'h3' | 'h4'; inlineHint?: string },
): HTMLHeadingElement {
    const tag = opts?.level ?? 'h3';
    const heading = parent.createEl(tag, { cls: 'agent-settings-section' });
    heading.createSpan({ cls: 'agent-settings-section-label', text: title });
    if (info?.body) {
        const btn = heading.createEl('button', {
            cls: 'agent-info-btn',
            attr: { type: 'button', 'aria-label': `${title}: info`, title },
        });
        setIcon(btn, 'info');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openInfoPopover(title, info.body);
        });
    }
    if (opts?.inlineHint) {
        parent.createEl('p', {
            cls: 'agent-settings-section-hint',
            text: opts.inlineHint,
        });
    }
    return heading;
}

/**
 * Add a slider with an inline, click-to-edit value display. The slider
 * track and the value sit inside the same .agent-slider-wrap container
 * so they read as one control instead of two side-by-side widgets.
 *
 * - Drag the slider -> the value updates.
 * - Click the value -> it turns into a number input. Type, then press
 *   Enter or click outside to commit. Values outside [min, max] are
 *   clamped before persisting.
 */
export function addSliderInput(
    setting: Setting,
    opts: {
        min: number;
        max: number;
        step: number;
        value: number;
        onChange: (v: number) => void | Promise<void>;
    },
): void {
    const clamp = (n: number): number =>
        Math.min(opts.max, Math.max(opts.min, n));
    // Snap a typed value to the nearest step so the slider thumb does
    // not land between detents (e.g. typing 7 with a step of 5 lands
    // on 5; typing 8 lands on 10).
    const snap = (n: number): number => {
        const steps = Math.round((n - opts.min) / opts.step);
        return clamp(opts.min + steps * opts.step);
    };

    const wrap = setting.controlEl.createDiv('agent-slider-wrap');
    const slider = wrap.createEl('input', {
        cls: 'agent-slider',
        attr: {
            type: 'range',
            min: String(opts.min),
            max: String(opts.max),
            step: String(opts.step),
            value: String(opts.value),
        },
    });
    const valueEl = wrap.createSpan({
        cls: 'agent-slider-value',
        text: String(opts.value),
        attr: { 'aria-label': 'Click to edit', role: 'button', tabindex: '0' },
    });

    const commit = (n: number): void => {
        const v = clamp(n);
        slider.value = String(v);
        valueEl.setText(String(v));
        void opts.onChange(v);
    };

    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        if (Number.isFinite(v)) {
            valueEl.setText(String(v));
            void opts.onChange(v);
        }
    });

    const openEditor = (): void => {
        const current = parseFloat(slider.value);
        valueEl.empty();
        valueEl.removeClass('agent-slider-value');
        valueEl.addClass('agent-slider-value-editing');
        const input = valueEl.createEl('input', {
            cls: 'agent-slider-input',
            attr: {
                type: 'number',
                min: String(opts.min),
                max: String(opts.max),
                step: String(opts.step),
                value: String(current),
            },
        });
        input.focus();
        input.select();
        const close = (cancel: boolean): void => {
            const parsed = parseFloat(input.value);
            valueEl.empty();
            valueEl.removeClass('agent-slider-value-editing');
            valueEl.addClass('agent-slider-value');
            if (!cancel && Number.isFinite(parsed)) {
                commit(snap(parsed));
            } else {
                valueEl.setText(slider.value);
            }
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); close(false); }
            if (e.key === 'Escape') { e.preventDefault(); close(true); }
        });
        input.addEventListener('blur', () => close(false));
    };

    valueEl.addEventListener('click', openEditor);
    valueEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openEditor();
        }
    });
}
