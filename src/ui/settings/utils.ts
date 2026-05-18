import type { SliderComponent, TextComponent } from 'obsidian';
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
 * Add a slider AND a small number input to a Setting, both kept in
 * sync. Replaces the standalone `addText` pattern for numeric values:
 * the slider is the primary interaction (drag, click-to-set), the
 * input box lets you type an exact value when the slider step is too
 * coarse. Values from the input are clamped to [min, max] before
 * being persisted.
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
    let slider: SliderComponent | null = null;
    let input: TextComponent | null = null;

    const clamp = (n: number): number =>
        Math.min(opts.max, Math.max(opts.min, n));

    setting.addSlider((s) => {
        slider = s;
        s.setLimits(opts.min, opts.max, opts.step)
            .setValue(opts.value)
            .setDynamicTooltip()
            .onChange((v) => {
                if (input) input.setValue(String(v));
                void opts.onChange(v);
            });
    });
    setting.addText((c) => {
        input = c;
        c.setValue(String(opts.value));
        c.inputEl.classList.add('agent-slider-input');
        c.inputEl.setAttribute('type', 'number');
        c.inputEl.setAttribute('min', String(opts.min));
        c.inputEl.setAttribute('max', String(opts.max));
        c.inputEl.setAttribute('step', String(opts.step));
        c.onChange((raw) => {
            const parsed = parseFloat(raw);
            if (Number.isFinite(parsed)) {
                const v = clamp(parsed);
                if (slider) slider.setValue(v);
                void opts.onChange(v);
            }
        });
    });
}
