/**
 * SelectionWatcher -- auto-open the Floating-Menu when the user
 * finishes a selection in the active Markdown editor (FEAT-33-01 SC-04).
 *
 * Obsidian does not expose a native "selection-changed" event. We
 * approximate via mouseup + keyup listeners on document.body with a
 * debounce, plus a minimum-selection-length guard so casual
 * markieren-to-kopieren does not trigger the menu.
 *
 * Bot-Compliance:
 * - No fetch / innerHTML / direct style mutation
 * - Listeners are registered on document and detached on dispose()
 * - The watcher does NOT modify the DOM itself; it only calls back
 *   into InlineActionService.triggerMenu()
 *
 * Performance: the debounce-delay prevents per-keystroke overhead.
 * The actual trigger logic is in triggerMenu() which is itself
 * lightweight (no LLM call until the user picks an action).
 *
 * Related: FEAT-33-01 TR-1.4 + H-01 (Floating-Menu stoert nicht).
 */

export interface SelectionWatcherOptions {
    /** Container the watcher attaches listeners to (typically document.body). */
    target: Document | HTMLElement;
    /** Called after the debounce when the selection looks "settled". */
    onSettled: () => void;
    /** Minimum selection length to consider (default 2 chars). */
    minLength?: number;
    /** Debounce in ms (default 250). */
    debounceMs?: number;
    /** Live-callback: if it returns false the watcher stays silent. */
    isEnabled?: () => boolean;
}

export class SelectionWatcher {
    private readonly target: Document | HTMLElement;
    private readonly onSettled: () => void;
    private readonly minLength: number;
    private readonly debounceMs: number;
    private readonly isEnabled: () => boolean;

    private mouseHandler: ((ev: MouseEvent) => void) | null = null;
    private keyHandler: ((ev: KeyboardEvent) => void) | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private active = false;

    constructor(options: SelectionWatcherOptions) {
        this.target = options.target;
        this.onSettled = options.onSettled;
        this.minLength = options.minLength ?? 2;
        this.debounceMs = options.debounceMs ?? 250;
        this.isEnabled = options.isEnabled ?? (() => true);
    }

    start(): void {
        if (this.active === true) return;
        this.active = true;
        this.mouseHandler = (_ev: MouseEvent) => this.schedule();
        this.keyHandler = (ev: KeyboardEvent) => {
            // Only consider keys that may end a selection (arrows, shift+arrow, escape).
            if (ev.key.startsWith('Arrow') || ev.key === 'Home' || ev.key === 'End' || ev.key === 'PageUp' || ev.key === 'PageDown') {
                this.schedule();
            }
        };
        this.target.addEventListener('mouseup', this.mouseHandler);
        this.target.addEventListener('keyup', this.keyHandler);
    }

    stop(): void {
        this.active = false;
        if (this.mouseHandler !== null) this.target.removeEventListener('mouseup', this.mouseHandler);
        if (this.keyHandler !== null) this.target.removeEventListener('keyup', this.keyHandler);
        this.mouseHandler = null;
        this.keyHandler = null;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /** Cleanup hook for plugin onunload. */
    dispose(): void {
        this.stop();
    }

    private schedule(): void {
        if (this.isEnabled() !== true) return;
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = null;
            if (this.hasViableSelection() === false) return;
            this.onSettled();
        }, this.debounceMs);
    }

    private hasViableSelection(): boolean {
        try {
            const win = ('defaultView' in this.target ? this.target.defaultView : null) as Window | null;
            const doc = ('ownerDocument' in this.target ? (this.target as HTMLElement).ownerDocument : this.target as Document);
            const selection = (win ?? doc.defaultView)?.getSelection() ?? null;
            if (selection === null) return false;
            const text = selection.toString();
            return text.length >= this.minLength;
        } catch {
            return false;
        }
    }
}
