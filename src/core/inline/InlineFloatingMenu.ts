/**
 * InlineFloatingMenu -- DOM-Overlay-Render fuer das Floating-Menu (FEAT-33-01 TR-1.4).
 *
 * Renders the inline-action menu as an absolutely-positioned overlay
 * near the user's selection / cursor. Vanilla-DOM only so the unit
 * tests in jsdom cover render, position-clamping, escape-handling
 * and dispose semantics without requiring an Obsidian workspace.
 *
 * Bot-Compliance:
 * - Uses Element.textContent / append / createElement (no innerHTML)
 * - Uses CSS classes (.agent-inline-menu, ...) for styling, not
 *   element.style.X = Y mutations
 * - All event listeners are removed in close() / dispose() so
 *   re-open does not leak
 *
 * Architecture-map concept: inline-floating-menu
 * Related: ADR-138 (Sidebar-Independence), FEAT-33-01
 */

import type { InlineAction, InlineActionRegistry } from './InlineActionRegistry';
import type { InlineTriggerContext } from './InlineTriggerContext';

export interface MenuPosition {
    /** Page-x in CSS pixels. Will be clamped to viewport. */
    x: number;
    /** Page-y in CSS pixels. Will be clamped to viewport. */
    y: number;
}

export interface InlineFloatingMenuOptions {
    /**
     * Container the menu attaches to (typically document.body or the
     * plugin's view container). The menu uses position: absolute and
     * the container should not clip overflow.
     */
    containerEl: HTMLElement;
    /** Registry whose listActions(ctx) the menu renders. */
    registry: InlineActionRegistry;
    /**
     * Called when the user picks an action. The handler is responsible
     * for invoking the action's execute method - the menu only emits
     * the choice and closes.
     */
    onPick: (action: InlineAction, ctx: InlineTriggerContext) => void;
    /** Optional minimum width in CSS pixels (default 200). */
    minWidth?: number;
}

/**
 * Pure DOM overlay menu. No Obsidian APIs so the unit tests stay
 * vitest+jsdom compatible. The plugin entry-point wires it into the
 * Workspace via container = view-container or document.body.
 */
export class InlineFloatingMenu {
    private readonly containerEl: HTMLElement;
    private readonly registry: InlineActionRegistry;
    private readonly onPick: (action: InlineAction, ctx: InlineTriggerContext) => void;
    private readonly minWidth: number;

    private rootEl: HTMLElement | null = null;
    private currentCtx: InlineTriggerContext | null = null;
    /** Listeners we add on open() and remove on close(). */
    private boundOnKeyDown: ((ev: KeyboardEvent) => void) | null = null;
    private boundOnPointerDown: ((ev: MouseEvent) => void) | null = null;

    constructor(options: InlineFloatingMenuOptions) {
        this.containerEl = options.containerEl;
        this.registry = options.registry;
        this.onPick = options.onPick;
        this.minWidth = options.minWidth ?? 200;
    }

    /** True while the menu DOM is attached and visible. */
    get isOpen(): boolean {
        return this.rootEl !== null;
    }

    /**
     * Open the menu at the given position. Closes any prior instance
     * first (no double-rendering).
     */
    open(ctx: InlineTriggerContext, position: MenuPosition): void {
        this.close();

        const actions = this.registry.listActions(ctx);
        if (actions.length === 0) {
            // Nothing to render. Leave the menu closed so the user is
            // not confronted with an empty popover.
            return;
        }

        this.currentCtx = ctx;
        const root = this.containerEl.ownerDocument.createElement('div');
        root.classList.add('agent-inline-menu');
        root.setAttribute('role', 'menu');
        root.setAttribute('aria-label', 'Inline AI menu');
        // Bot-compliance: use setCssProps for dynamic values that cannot live
        // in styles.css (per-instance minWidth). Static rules (position/z-index)
        // live in styles.css under `.agent-inline-menu`.
        root.setCssStyles({ minWidth: `${this.minWidth}px` });

        for (const action of actions) {
            const item = this.containerEl.ownerDocument.createElement('button');
            item.classList.add('agent-inline-menu__item');
            item.setAttribute('role', 'menuitem');
            item.setAttribute('type', 'button');
            item.dataset.actionId = action.id;
            item.textContent = action.label;
            if (action.description !== undefined) {
                item.setAttribute('title', action.description);
            }
            item.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.pick(action);
            });
            root.appendChild(item);
        }

        this.containerEl.appendChild(root);

        // Clamp to viewport so menus near the edge are still fully visible.
        const clamped = this.clampToViewport(position, root);
        root.setCssStyles({ left: `${clamped.x}px`, top: `${clamped.y}px` });

        this.rootEl = root;
        this.attachDismissHandlers();
    }

    /** Close the menu, remove DOM, detach listeners. Idempotent. */
    close(): void {
        if (this.rootEl !== null) {
            this.rootEl.remove();
            this.rootEl = null;
        }
        this.currentCtx = null;
        this.detachDismissHandlers();
    }

    /** Cleanup hook for plugin onunload. */
    dispose(): void {
        this.close();
    }

    private pick(action: InlineAction): void {
        const ctx = this.currentCtx;
        if (ctx === null) return;
        // Capture the context BEFORE close() resets currentCtx so the
        // callback receives a stable value.
        this.close();
        this.onPick(action, ctx);
    }

    private attachDismissHandlers(): void {
        const doc = this.containerEl.ownerDocument;

        this.boundOnKeyDown = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                this.close();
            }
        };
        this.boundOnPointerDown = (ev: MouseEvent) => {
            if (this.rootEl === null) return;
            const target = ev.target as Node | null;
            if (target !== null && typeof this.rootEl.contains === 'function' && this.rootEl.contains(target)) return;
            this.close();
        };
        doc.addEventListener('keydown', this.boundOnKeyDown);
        // capture phase so we close before the editor consumes the click.
        doc.addEventListener('mousedown', this.boundOnPointerDown, true);
    }

    private detachDismissHandlers(): void {
        const doc = this.containerEl.ownerDocument;
        if (this.boundOnKeyDown !== null) {
            doc.removeEventListener('keydown', this.boundOnKeyDown);
            this.boundOnKeyDown = null;
        }
        if (this.boundOnPointerDown !== null) {
            doc.removeEventListener('mousedown', this.boundOnPointerDown, true);
            this.boundOnPointerDown = null;
        }
    }

    private clampToViewport(pos: MenuPosition, root: HTMLElement): MenuPosition {
        const win = this.containerEl.ownerDocument.defaultView;
        if (win === null) {
            return pos;
        }
        // Use a defensive default if the menu has not been measured yet.
        const rect = root.getBoundingClientRect();
        const width = rect.width > 0 ? rect.width : this.minWidth;
        const height = rect.height > 0 ? rect.height : 240;
        const maxX = Math.max(0, win.innerWidth - width - 8);
        const maxY = Math.max(0, win.innerHeight - height - 8);
        return {
            x: Math.max(8, Math.min(pos.x, maxX)),
            y: Math.max(8, Math.min(pos.y, maxY)),
        };
    }
}
