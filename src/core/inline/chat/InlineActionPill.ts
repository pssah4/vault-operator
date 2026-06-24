/**
 * InlineActionPill -- non-blocking selection affordance (FEAT-33-12 / user feedback 2026-06-24).
 *
 * Replaces the previous auto-open-on-selection behaviour. Instead of
 * opening the full inline chat the moment the user finishes a selection
 * (which steals focus and breaks Cmd+C / format toolbar / etc.), a small
 * lucide `sparkles` icon button appears at the top-right edge of the
 * selection. The selection stays alive, every native editor action
 * (copy, format, Cmd+B, ...) keeps working. Only when the user clicks
 * the pill does the orchestrator open the chat.
 *
 * Positioning (updated 2026-06-24):
 *   The pill sits just ABOVE the first rect of the selection (range
 *   getClientRects()[0]) at its trailing edge. That way the pill
 *   never overlaps the selected text and is consistently anchored to
 *   the top-right corner, independent of the selection's height
 *   (multi-line selections still get an unambiguous anchor).
 *
 * Lifecycle:
 *   show()  positions the pill at the top-right of the first selection
 *           rect. Idempotent -- a second show() removes the old pill
 *           first. No-op when there is no non-collapsed selection.
 *   hide()  removes the pill + all document-level listeners.
 *   dispose alias for hide(), wired into the plugin onunload chain.
 *
 * The pill self-hides on:
 *   - outside mousedown (not on the pill itself)
 *   - selection collapse (user clicks away, types, etc.)
 *   - editor / window scroll (pill is viewport-fixed, scrolling moves
 *     the selection but not the pill -- hide rather than mis-anchor)
 *   - Escape keydown
 *
 * The capture-phase outside-mousedown listener detects clicks BEFORE
 * any target handler runs, but does NOT call stopPropagation -- the
 * mousedown must still reach CodeMirror so the editor can move the
 * cursor / close menus normally. We only hide the pill.
 *
 * Bot-compliance: setIcon for the icon, classList for static styles,
 * setCssStyles only for the dynamic left/top values (same idiom as
 * InlineChatPanel).
 */

import { setIcon } from 'obsidian';

export interface InlineActionPillOptions {
    /** Container the pill mounts into. Usually plugin.app.workspace.containerEl. */
    target: HTMLElement;
    /** Called when the user clicks the pill. Pill auto-hides after the callback. */
    onClick: () => void;
    /** Optional label override for accessibility / tooltip. */
    label?: string;
    /** Lucide icon name (default: sparkles per user spec 2026-06-24). */
    icon?: string;
}

/** Estimated pill width in px, used for viewport-edge clamping. */
const PILL_WIDTH_PX = 22;
/** Estimated pill height in px, used to anchor above the selection. */
const PILL_HEIGHT_PX = 22;
/** Gap between the pill and the container right edge. */
const PILL_GAP_PX = 6;

export class InlineActionPill {
    private el: HTMLElement | null = null;
    private outsideMouseDownHandler: ((ev: MouseEvent) => void) | null = null;
    private selectionChangeHandler: (() => void) | null = null;
    private escapeHandler: ((ev: KeyboardEvent) => void) | null = null;
    private scrollHandler: (() => void) | null = null;

    private readonly target: HTMLElement;
    private readonly onClick: () => void;
    private readonly label: string;
    private readonly icon: string;

    constructor(options: InlineActionPillOptions) {
        this.target = options.target;
        this.onClick = options.onClick;
        this.label = options.label ?? 'Open inline AI chat';
        // Default: lucide `wand-sparkles` (pencil+sparkles isn't in the
        // Lucide set yet -- closest visual match is the magic wand with
        // sparkles, which reads as "AI edit"). Fallback to `sparkles` if
        // the active Obsidian / Lucide build doesn't ship the wand variant.
        this.icon = options.icon ?? 'wand-sparkles';
    }

    /** True when the pill is currently mounted. Surfaced for tests. */
    get isVisible(): boolean { return this.el !== null; }

    /**
     * Render the pill above the trailing edge of the first selection
     * rect. No-op when the selection is missing, collapsed, or every
     * rect is empty (e.g. selection across an image-only span).
     */
    show(): void {
        this.hide();
        const doc = this.target.ownerDocument;
        const win = doc.defaultView ?? (this.target as unknown as { defaultView?: Window | null }).defaultView ?? null;
        const sel = win?.getSelection?.() ?? null;
        if (sel === null || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (range.collapsed === true) return;
        const anchor = pickAnchor(range);
        if (anchor === null) return;

        const pill = doc.createElement('button');
        pill.classList.add('agent-inline-action-pill');
        pill.setAttribute('type', 'button');
        pill.setAttribute('aria-label', this.label);
        pill.setAttribute('title', this.label);
        // Defensive: prevent the pill from joining the tab-order. A
        // Tab focus would blur CodeMirror and collapse the selection.
        pill.setAttribute('tabindex', '-1');

        // Position (user feedback 2026-06-24, eighth pass):
        //   x = right edge of the rightmost word + GAP, so the pill
        //       sits OUTSIDE the text column to the right.
        //   y = vertical centre of the last line, with the pill's own
        //       centre aligned to it. The pill is therefore on the
        //       SAME vertical band as the last line, but OUTSIDE the
        //       text horizontally -- no overlap with selected text.
        const viewportW = win?.innerWidth ?? 1024;
        const viewportH = win?.innerHeight ?? 768;
        const desiredLeft = anchor.rightmostRight + PILL_GAP_PX;
        const left = Math.max(4, Math.min(desiredLeft, viewportW - PILL_WIDTH_PX - 4));
        const desiredTop = anchor.lastLineCenterY - PILL_HEIGHT_PX / 2;
        const top = Math.max(4, Math.min(desiredTop, viewportH - PILL_HEIGHT_PX - 4));
        pill.setCssStyles({ left: `${left}px`, top: `${top}px` });
        setIcon(pill, this.icon);
        // Defensive fallback (user feedback 2026-06-24, "kein icon angezeigt"):
        // if the requested lucide name does not exist in the bundled
        // Lucide build, setIcon is a silent no-op and the chromeless
        // pill is invisible. Try a known-good icon, and as a last
        // resort drop a Unicode sparkle glyph so the user sees SOMETHING.
        if (hasRenderedIcon(pill) === false) {
            setIcon(pill, 'sparkles');
        }
        if (hasRenderedIcon(pill) === false) {
            pill.textContent = '✨';
        }

        // mousedown swallow: preventDefault on mousedown blocks the
        // browser's DEFAULT focus shift to the button. Without it the
        // editor (CodeMirror) would blur, its selection would collapse,
        // and the chat orchestrator would open with an EMPTY selection.
        // The click event still fires normally -- preventDefault on
        // mousedown does not cancel the click sequence.
        pill.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
        });
        pill.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            this.onClick();
            this.hide();
        });

        this.target.appendChild(pill);
        this.el = pill;

        // Capture-phase outside listener so we hide BEFORE the target's
        // own mousedown handler runs. We DO NOT stopPropagation -- the
        // mousedown still reaches CodeMirror (cursor move, menu close).
        this.outsideMouseDownHandler = (ev: MouseEvent) => {
            if (ev.target === pill) return;
            if (pill.contains(ev.target as Node | null) === true) return;
            this.hide();
        };
        this.selectionChangeHandler = () => {
            const s = win?.getSelection?.() ?? null;
            if (s === null || s.rangeCount === 0 || s.getRangeAt(0).collapsed === true) {
                this.hide();
            }
        };
        this.escapeHandler = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') this.hide();
        };
        // Viewport-fixed positioning means the pill does not follow the
        // editor when the user scrolls. Rather than reposition on every
        // scroll frame (expensive + jittery), hide and let the next
        // selection re-trigger the watcher.
        //
        // Scroll-listener gotcha (final-verify finding): scroll events
        // do NOT bubble. A capture-phase listener on `document` only
        // catches scrolls of document/window itself, NOT scrolls of
        // nested scrollable containers like .cm-scroller. We register
        // the capture-phase listener on `target` (the workspace root)
        // so it catches every descendant scroll on the way down.
        this.scrollHandler = () => { this.hide(); };
        doc.addEventListener('mousedown', this.outsideMouseDownHandler, true);
        doc.addEventListener('selectionchange', this.selectionChangeHandler);
        doc.addEventListener('keydown', this.escapeHandler);
        this.target.addEventListener('scroll', this.scrollHandler, true);
    }

    hide(): void {
        const doc = this.target.ownerDocument;
        if (this.el !== null) {
            try { this.el.remove(); } catch { /* element already detached */ }
            this.el = null;
        }
        if (this.outsideMouseDownHandler !== null) {
            doc.removeEventListener('mousedown', this.outsideMouseDownHandler, true);
            this.outsideMouseDownHandler = null;
        }
        if (this.selectionChangeHandler !== null) {
            doc.removeEventListener('selectionchange', this.selectionChangeHandler);
            this.selectionChangeHandler = null;
        }
        if (this.escapeHandler !== null) {
            doc.removeEventListener('keydown', this.escapeHandler);
            this.escapeHandler = null;
        }
        if (this.scrollHandler !== null) {
            this.target.removeEventListener('scroll', this.scrollHandler, true);
            this.scrollHandler = null;
        }
    }

    dispose(): void { this.hide(); }
}

/**
 * setIcon does not return a status; we infer success by checking whether
 * the button now contains an SVG node. Used to drive the fallback chain
 * (preferred icon -> 'sparkles' -> unicode glyph).
 */
function hasRenderedIcon(el: HTMLElement): boolean {
    return el.querySelector('svg') !== null;
}

interface Anchor {
    /** Right edge of the rightmost rect in the selection (= the visually rightmost word). */
    rightmostRight: number;
    /** Vertical centre of the bottommost (= last) line of the selection. */
    lastLineCenterY: number;
}

/**
 * Resolve anchor coordinates from the live selection.
 *
 * User spec (ninth pass, 2026-06-24):
 *   x = right edge of the LAST LINE OF TEXT that contains part of the
 *       selection -- NOT the right edge of the selection itself. When
 *       the selection ends mid-line, the rest of the line still
 *       contributes its right edge, so the pill always lands beyond
 *       the visually last word of the line and never lands mid-text.
 *       Implementation: walk from range.endContainer to the nearest
 *       block container (.cm-line in CM6 source/live-preview;
 *       .markdown-rendered p/li in reading view) and use that
 *       element's right edge. Falls back to max(rect.right) of the
 *       selection itself when no such container is found (e.g. unit
 *       tests with a plain DOM stub).
 *   y = vertical centre of the bottommost (= last) line of the
 *       selection. The pill's vertical centre aligns to it so the
 *       icon reads as belonging to the last line of the marked block.
 *
 * Falls back to getBoundingClientRect when getClientRects is unavailable.
 */
function pickAnchor(range: Range): Anchor | null {
    try {
        const rects = range.getClientRects?.();
        if (rects !== undefined && rects.length > 0) {
            let selectionMaxRight = Number.NEGATIVE_INFINITY;
            let bottommostBottom = Number.NEGATIVE_INFINITY;
            let bottommostTop = 0;
            for (let i = 0; i < rects.length; i += 1) {
                const r = rects[i];
                if (r.width <= 0 && r.height <= 0) continue;
                if (r.right > selectionMaxRight) selectionMaxRight = r.right;
                if (r.bottom > bottommostBottom) {
                    bottommostBottom = r.bottom;
                    bottommostTop = r.top;
                }
            }
            if (selectionMaxRight !== Number.NEGATIVE_INFINITY && bottommostBottom !== Number.NEGATIVE_INFINITY) {
                // Override the x edge with the line's RIGHT EDGE so the
                // pill clears the visually last word of the line, not
                // just the last marked word.
                const lineRight = lineRightAtEndOfRange(range);
                const rightmostRight = lineRight !== null && lineRight > selectionMaxRight
                    ? lineRight
                    : selectionMaxRight;
                return {
                    rightmostRight,
                    lastLineCenterY: (bottommostTop + bottommostBottom) / 2,
                };
            }
        }
    } catch { /* fall through to bounding-rect path */ }
    const fallback = range.getBoundingClientRect();
    if (fallback.width === 0 && fallback.height === 0) return null;
    return {
        rightmostRight: fallback.right,
        lastLineCenterY: (fallback.top + fallback.bottom) / 2,
    };
}

/**
 * Find the right edge of the block-level line that owns the END of the
 * selection. CM6 source / live-preview wraps each editor line in
 * `.cm-line`; reading-view wraps prose in `.markdown-rendered p` /
 * `.markdown-rendered li`. We climb from the end container, find the
 * nearest such block, and read its bounding rect's right edge. Returns
 * null when no recognised container is found so the caller can fall
 * back to the selection's own rightmost edge.
 */
function lineRightAtEndOfRange(range: Range): number | null {
    try {
        const endNode = range.endContainer;
        const startEl: Element | null = endNode.nodeType === 1
            ? endNode as Element
            : endNode.parentElement;
        if (startEl === null) return null;
        // AUDIT-034 M-40: constrain the closest() walk to elements that
        // live inside a markdown view (CM6 editor or rendered preview).
        // Without this guard a Range whose endContainer sits in some
        // other Obsidian leaf (settings modal, sidebar) would let
        // closest() climb into structurally unrelated DOM and return a
        // bogus right edge.
        const trustedRoot = startEl.closest('.markdown-source-view, .markdown-reading-view, .markdown-preview-view, .cm-editor');
        if (trustedRoot === null) return null;
        // Block-level containers we recognise as "a line of text":
        //   .cm-line                       CM6 source + live-preview
        //   .markdown-rendered p / li      reading-view prose + lists
        //   .markdown-rendered h1..h6      reading-view headings
        //   .markdown-rendered blockquote  reading-view blockquotes
        //   .markdown-rendered pre         reading-view code blocks
        //   .markdown-rendered td / th     reading-view table cells
        // (Verify follow-up 2026-06-24: previously missed the blockquote /
        // pre / td/th cases, which let the pill land mid-text in those
        // contexts.)
        const lineEl = startEl.closest(
            '.cm-line, .markdown-rendered p, .markdown-rendered li, .markdown-rendered h1, .markdown-rendered h2, .markdown-rendered h3, .markdown-rendered h4, .markdown-rendered h5, .markdown-rendered h6, .markdown-rendered blockquote, .markdown-rendered pre, .markdown-rendered td, .markdown-rendered th',
        );
        if (lineEl === null) return null;
        const r = lineEl.getBoundingClientRect();
        if (r.width <= 0 && r.height <= 0) return null;
        return r.right;
    } catch {
        return null;
    }
}
