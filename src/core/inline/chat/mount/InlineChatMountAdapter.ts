/**
 * InlineChatMountAdapter -- mount-strategy seam for the inline chat panel (FEAT-33-12).
 *
 * Decouples the orchestrator from "where the panel lives in the DOM":
 *
 *   - OverlayPopoverMount   absolute-positioned floating panel, identical to
 *                           the FEAT-33-05 behaviour. Works in source,
 *                           live-preview and reading view.
 *
 *   - CodeMirrorBlockMount  CM6 block decoration inserted after the
 *                           selection end so the editor reserves a real
 *                           layout line and surrounding text pushes down
 *                           (VS-Code-style inline chat). Requires CM6 to be
 *                           active, so source + live-preview only.
 *
 * The InlineChatPanel surface itself is unchanged -- both adapters mount it
 * into a container they choose. The adapter is also responsible for tearing
 * down its mount artefacts (decoration, wrapper node) on dispose. The panel
 * close-callback fires the adapter's dispose so the lifecycles stay paired.
 *
 * Bot-compliance: no fetch / no innerHTML / no direct style mutation in this
 * interface; concrete adapters use Obsidian DOM helpers + CodeMirror's
 * decoration API exclusively.
 */

import type { MarkdownView } from 'obsidian';

/**
 * Outcome of canMount. ok=true means mount() may proceed. ok=false carries
 * a structured reason so the orchestrator can surface a tailored notice.
 *
 *   - reading-view    Block-Widget tried in a reading-mode view. Orchestrator
 *                     shows a notice asking the user to switch the editor
 *                     mode or change the display setting to Popover.
 *   - no-cm           CodeMirror EditorView could not be acquired (defensive).
 *   - no-view         No active MarkdownView at all.
 */
export type MountCheck =
    | { ok: true }
    | { ok: false; reason: 'reading-view' | 'no-cm' | 'no-view' };

/**
 * Handle returned by mount(). The orchestrator hands containerEl + position
 * to the InlineChatPanel; the panel renders into containerEl. On panel close
 * the orchestrator MUST call handle.destroy() so the adapter can remove its
 * own mount artefacts (e.g. the CM block-widget decoration).
 *
 * position is only used by overlay-style adapters. Block-mode adapters can
 * return { x: 0, y: 0 } -- the panel switches to display-mode block via
 * `displayMode: 'inline-block'` so absolute positioning is disabled in CSS.
 */
export interface MountHandle {
    containerEl: HTMLElement;
    position: { x: number; y: number };
    displayMode: 'popover' | 'inline-block';
    destroy(): void;
}

/**
 * Adapter contract. Pure -- no state held across mount() calls.
 */
export interface InlineChatMountAdapter {
    /** Returns 'cm-block-widget' or 'popover-overlay'. Diagnostic only. */
    readonly id: 'cm-block-widget' | 'popover-overlay';
    canMount(view: MarkdownView | null): MountCheck;
    mount(view: MarkdownView): MountHandle;
}
