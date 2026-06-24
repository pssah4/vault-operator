/**
 * OverlayPopoverMount -- legacy popover behaviour wrapped as adapter (FEAT-33-12).
 *
 * Implements `InlineChatMountAdapter` for the floating-overlay variant of
 * the inline chat. The mount returns the active MarkdownView's contentEl
 * as container (same as the pre-FEAT-33-12 path) plus a heuristic xy
 * position (top-left of the content area). The InlineChatPanel uses these
 * inputs to attach itself absolute-positioned on top of the editor.
 *
 * No CodeMirror interaction -- works in all three editor modes (source,
 * live-preview, reading), which makes this the natural fallback for users
 * who frequently read notes without the editor.
 *
 * destroy() is a no-op: the InlineChatPanel removes its own root element
 * during close(); the adapter has no extra mount artefacts to clean up.
 */

import type { MarkdownView } from 'obsidian';
import type { InlineChatMountAdapter, MountCheck, MountHandle } from './InlineChatMountAdapter';

export class OverlayPopoverMount implements InlineChatMountAdapter {
    readonly id = 'popover-overlay' as const;

    canMount(view: MarkdownView | null): MountCheck {
        if (view === null) return { ok: false, reason: 'no-view' };
        return { ok: true };
    }

    mount(view: MarkdownView): MountHandle {
        const container = view.contentEl;
        const rect = container.getBoundingClientRect();
        return {
            containerEl: container,
            position: { x: rect.left + 40, y: rect.top + 40 },
            displayMode: 'popover',
            destroy: () => { /* InlineChatPanel cleans up its own root */ },
        };
    }
}
