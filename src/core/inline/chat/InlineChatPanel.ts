/**
 * InlineChatPanel -- floating chat that mirrors the Sidebar-Chat composer (EPIC-33).
 *
 * UX per user feedback 2026-06-22:
 * - Trigger only via hotkey (Cmd+Shift+I) or editor-menu, NO auto-open
 * - Layout identical to sidebar-chat composer so users get the same
 *   muscle memory: model button, "+" menu, magnifier (Lookup quick-
 *   action, the inline-specific addition), "..." menu, send button
 * - Selected text shown above the message body as a collapsible
 *   preview (first 3 lines visible, "more" toggle reveals the rest)
 *
 * Uses the existing Sidebar CSS classes (.chat-input-container,
 * .chat-input-wrapper, .chat-textarea, .chat-toolbar, .toolbar-button,
 * etc.) so the look is identical without copy-pasting styles. The
 * panel adds a wrapper class (.agent-inline-panel) for positioning
 * + an anchor section class (.agent-inline-panel__anchor) for the
 * collapsible selection preview.
 *
 * Lucide icons are loaded via Obsidian's setIcon helper which is
 * supplied via an optional setIconHook (so unit-tests run without
 * Obsidian). The icons match the sidebar: 'plus', 'search', 'ellipsis',
 * 'send-horizontal'.
 *
 * Bot-Compliance: vanilla DOM only, no innerHTML, no inline style
 * mutation beyond position/size, all event listeners detached in close().
 */

import type { InlineTriggerContext } from '../InlineTriggerContext';

export type InlinePanelActionId =
    | 'free-chat'
    | 'lookup'
    | 'rewrite'
    | 'translate'
    | 'summarize'
    | 'find-action-items'
    | 'send-to-main';

export interface InlinePanelMessage {
    role: 'user' | 'assistant' | 'system';
    text: string;
}

export interface InlinePanelDispatchArgs {
    actionId: InlinePanelActionId;
    userInput: string;
    ctx: InlineTriggerContext;
}

export interface InlineCheckpointMarker {
    label: string;
    /** Short detail line (e.g. "Notes/Idee.md, 12:34"). */
    detail?: string;
    /** "Show diff" button (file-diff icon). */
    onShowDiff?: () => void;
    /** "Undo this" button (undo-2 icon). Restores just this checkpoint. */
    onRestore?: () => void;
    /**
     * "Undo from here" button (rotate-ccw icon). Restores this
     * checkpoint AND every later checkpoint in the same task -- mirrors
     * AgentSidebarView.restoreCheckpointsForward.
     */
    onRestoreFromHere?: () => void;
    /**
     * "More" overflow menu (more-vertical icon). The host owns the
     * menu surface (Obsidian `Menu` in production, a no-op in unit
     * tests) and decides which items to render. The panel only opens
     * the anchor and forwards the click.
     */
    onMoreMenu?: (anchor: HTMLElement) => void;
}

export interface InlinePanelHandle {
    appendMessage(message: InlinePanelMessage): string;
    appendStreamChunk(bubbleId: string, chunk: string): void;
    /**
     * Insert text into the composer at the caret. Prefixed-command
     * inserts (skill /slug, prompt #slug, workflow §slug) call this
     * with their full surface form so the user sees the prefix the
     * AgentTask resolver expects.
     */
    insertIntoComposer(text: string, mode?: 'replace' | 'prepend' | 'append'): void;
    /** Replace the model-button label (after model picker selection). */
    setModelLabel(label: string, tooltip?: string): void;
    /**
     * Flip the composer between Send (idle) and Stop (running). When
     * `running` is true the Send button hides and the Stop button
     * shows; vice versa on false.
     */
    setRunning(running: boolean): void;
    /**
     * Replace the bubble's plain-text streaming content with rendered
     * markdown (via the panel's renderMarkdown hook). Called once the
     * stream + appendix have completed. No-op when no renderMarkdown
     * hook is configured -- the bubble stays as plain text.
     */
    finalizeBubble(bubbleId: string): Promise<void>;
    /**
     * Render a checkpoint marker bubble below the chat history. The
     * marker shows the action label, a timestamp detail and two
     * buttons ("Diff anzeigen" + "Zurück"). Returns the bubble id so
     * the caller can later remove it if needed.
     */
    appendCheckpointMarker(marker: InlineCheckpointMarker): string;
    setStatus(text: string, level?: 'info' | 'error'): void;
    close(): void;
}

/**
 * Optional hook so Obsidian's setIcon() can render Lucide icons.
 * Unit-tests pass undefined and fall back to a plain text glyph.
 */
export type SetIconHook = (el: HTMLElement, name: string) => void;

/**
 * Optional hook so Obsidian's MarkdownRenderer.render() can render
 * the assistant bubble with full Obsidian markdown (wikilinks,
 * embeds, code fences, callouts, etc.) and the panel can wire
 * internal-link click handlers afterwards. Unit-tests pass
 * undefined and the bubble keeps the plain textContent.
 */
export type RenderMarkdownHook = (containerEl: HTMLElement, markdown: string) => Promise<void> | void;

/** Minimal interface shared with the sidebar's AutocompleteHandler. */
export interface AutocompleteLike {
    handleInput(): Promise<void> | void;
    handleKeyDown(ev: KeyboardEvent): boolean;
    hide(): void;
}

export interface InlineChatPanelOptions {
    containerEl: HTMLElement;
    ctx: InlineTriggerContext;
    position: { x: number; y: number };
    onDispatch: (args: InlinePanelDispatchArgs, handle: InlinePanelHandle) => void;
    /** Called by the "..." menu to surface secondary actions. */
    onShowMoreMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    /** Called by the "+" menu to surface attach/context options. */
    onShowPlusMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    /** Called by the model button to open the model picker. */
    onShowModelMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    /** Initial label for the model button (e.g. "Auto" or model id). */
    initialModelLabel?: string;
    initialModelTooltip?: string;
    /** Called when the Stop button is clicked (during a running turn). */
    onStop?: () => void;
    /**
     * Factory that builds an AutocompleteHandler-like object on
     * panel-open. Called once with the textarea + input-area refs.
     * The handler must expose handleInput() + handleKeyDown(ev) +
     * hide(). When undefined the panel skips autocomplete entirely.
     */
    autocompleteFactory?: (textarea: HTMLTextAreaElement, inputArea: HTMLElement) => AutocompleteLike;
    onClose?: () => void;
    /** Bridge to Obsidian's setIcon() for Lucide rendering. */
    setIcon?: SetIconHook;
    /**
     * Bridge to Obsidian's MarkdownRenderer.render() + link-wiring.
     * When set, finalizeBubble() runs the hook on the bubble element
     * with the accumulated markdown text so wikilinks, code fences,
     * and embeds render natively. When unset the bubble keeps the
     * plain textContent from streaming -- unit-tests run that way.
     */
    renderMarkdown?: RenderMarkdownHook;
}

const DEFAULT_WIDTH = 520;
const PREVIEW_VISIBLE_LINES = 3;

export class InlineChatPanel {
    private readonly containerEl: HTMLElement;
    private readonly ctx: InlineTriggerContext;
    private readonly position: { x: number; y: number };
    private readonly onDispatch: (args: InlinePanelDispatchArgs, handle: InlinePanelHandle) => void;
    private readonly onShowMoreMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    private readonly onShowPlusMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    private readonly onShowModelMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    private readonly initialModelLabel: string;
    private readonly initialModelTooltip: string;
    private readonly onStop?: () => void;
    private readonly autocompleteFactory?: (textarea: HTMLTextAreaElement, inputArea: HTMLElement) => AutocompleteLike;
    private modelButtonEl: HTMLElement | null = null;
    private sendButtonEl: HTMLElement | null = null;
    private stopButtonEl: HTMLElement | null = null;
    private chipBarEl: HTMLElement | null = null;
    private autocomplete: AutocompleteLike | null = null;
    private readonly onClose?: () => void;
    private readonly setIcon: SetIconHook;

    private rootEl: HTMLElement | null = null;
    private bodyEl: HTMLElement | null = null;
    private inputEl: HTMLTextAreaElement | null = null;
    private statusEl: HTMLElement | null = null;
    private previewEl: HTMLElement | null = null;
    private previewToggleEl: HTMLElement | null = null;
    private previewExpanded = false;
    private bubbleCounter = 0;
    private bubbleNodes = new Map<string, HTMLElement>();
    /** Raw markdown accumulator per bubble id (for finalizeBubble). */
    private bubbleMarkdown = new Map<string, string>();
    private readonly renderMarkdownHook?: RenderMarkdownHook;

    private boundKeyDown: ((ev: KeyboardEvent) => void) | null = null;

    constructor(options: InlineChatPanelOptions) {
        this.containerEl = options.containerEl;
        this.ctx = options.ctx;
        this.position = options.position;
        this.onDispatch = options.onDispatch;
        this.onShowMoreMenu = options.onShowMoreMenu;
        this.onShowPlusMenu = options.onShowPlusMenu;
        this.onShowModelMenu = options.onShowModelMenu;
        this.initialModelLabel = options.initialModelLabel ?? 'Auto';
        this.initialModelTooltip = options.initialModelTooltip ?? 'Model (inherited from main chat)';
        this.onStop = options.onStop;
        this.autocompleteFactory = options.autocompleteFactory;
        this.onClose = options.onClose;
        this.setIcon = options.setIcon ?? ((el, name) => { el.textContent = iconFallback(name); });
        this.renderMarkdownHook = options.renderMarkdown;
    }

    get isOpen(): boolean { return this.rootEl !== null; }
    /** Root container (used by callers to anchor popovers). */
    get root(): HTMLElement | null { return this.rootEl; }
    /** Attachment chip bar element (caller passes to AttachmentHandler). */
    get chipBar(): HTMLElement | null { return this.chipBarEl; }

    open(): InlinePanelHandle {
        this.close();
        const doc = this.containerEl.ownerDocument;
        const root = doc.createElement('div');
        root.classList.add('agent-inline-panel');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'Inline AI chat');
        // Bot-compliance: static rules (position/z-index) live in styles.css
        // under `.agent-inline-panel`. Per-instance width via setCssProps.
        root.setCssStyles({ width: `${DEFAULT_WIDTH}px` });

        // Selection preview (collapsible, 3 lines visible by default).
        this.buildSelectionPreview(root, doc);

        // Header close button (× in top-right corner).
        const closeBtn = doc.createElement('button');
        closeBtn.classList.add('agent-inline-panel__close');
        closeBtn.setAttribute('type', 'button');
        closeBtn.setAttribute('title', 'Close (esc)');
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (ev) => { ev.preventDefault(); this.close(); });
        root.appendChild(closeBtn);

        // Body: chat messages.
        const body = doc.createElement('div');
        body.classList.add('agent-inline-panel__body');
        root.appendChild(body);
        this.bodyEl = body;

        // Status pill.
        const status = doc.createElement('div');
        status.classList.add('agent-inline-panel__status');
        status.classList.add('agent-u-hidden');
        root.appendChild(status);
        this.statusEl = status;

        // Composer (sidebar-style: .chat-input-container > .chat-input-wrapper).
        const composerContainer = doc.createElement('div');
        composerContainer.classList.add('chat-input-container');
        composerContainer.classList.add('agent-inline-panel__composer');
        const wrapper = doc.createElement('div');
        wrapper.classList.add('chat-input-wrapper');
        composerContainer.appendChild(wrapper);

        // Attachment chip bar (sidebar-style: above textarea). Empty by
        // default; AttachmentHandler renders chips into this element.
        const chipBar = doc.createElement('div');
        chipBar.classList.add('chat-attachment-chips');
        wrapper.appendChild(chipBar);
        this.chipBarEl = chipBar;

        const textarea = doc.createElement('textarea');
        textarea.classList.add('chat-textarea');
        textarea.setAttribute('rows', '3');
        textarea.setAttribute('placeholder', 'Type your message here…');
        textarea.addEventListener('keydown', (ev) => {
            // Autocomplete first: lets the dropdown handle Up/Down/Enter/Esc.
            if (this.autocomplete !== null && this.autocomplete.handleKeyDown(ev) === true) return;
            if (ev.key === 'Enter' && ev.shiftKey === false && ev.ctrlKey === false && ev.metaKey === false && ev.isComposing === false) {
                ev.preventDefault();
                this.sendFromInput();
            }
        });
        textarea.addEventListener('input', () => {
            if (this.autocomplete !== null) {
                void this.autocomplete.handleInput();
            }
        });
        wrapper.appendChild(textarea);
        this.inputEl = textarea;

        // Build the autocomplete handler now that the textarea + wrapper exist.
        if (this.autocompleteFactory !== undefined) {
            try {
                this.autocomplete = this.autocompleteFactory(textarea, wrapper);
            } catch (e) {
                console.debug('[InlineChatPanel] autocompleteFactory failed:', e);
            }
        }

        const toolbar = doc.createElement('div');
        toolbar.classList.add('chat-toolbar');
        const left = doc.createElement('div');
        left.classList.add('chat-toolbar-left');
        const right = doc.createElement('div');
        right.classList.add('chat-toolbar-right');

        // Model button: same visual treatment as the sidebar. Click
        // opens the model picker (live wired by PluginWiring against
        // plugin.settings.activeModels + activeModelKey).
        const modelBtn = this.makeToolbarButton(doc, this.initialModelLabel);
        modelBtn.classList.add('model-button');
        modelBtn.setAttribute('title', this.initialModelTooltip);
        modelBtn.setAttribute('type', 'button');
        modelBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (this.onShowModelMenu !== undefined && this.rootEl !== null) {
                this.onShowModelMenu(modelBtn, this.ctx, this.makeHandle());
            }
        });
        left.appendChild(modelBtn);
        this.modelButtonEl = modelBtn;

        // "+" menu (attach / context / skills / prompts / workflows).
        const plusBtn = this.makeIconButton(doc, 'plus', 'Add context');
        plusBtn.classList.add('plus-button');
        plusBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (this.onShowPlusMenu !== undefined && this.rootEl !== null) {
                this.onShowPlusMenu(plusBtn, this.ctx, this.makeHandle());
            }
        });
        left.appendChild(plusBtn);

        // Magnifier = Lookup quick-action (the inline-specific addition).
        const lookupBtn = this.makeIconButton(doc, 'search', 'Lookup selection');
        lookupBtn.classList.add('lookup-button');
        lookupBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            this.dispatch('lookup', '');
        });
        left.appendChild(lookupBtn);

        // "..." menu (other actions: rewrite, translate, summarize, ...).
        const ellipsisBtn = this.makeIconButton(doc, 'ellipsis', 'More actions');
        ellipsisBtn.classList.add('ellipsis-button');
        ellipsisBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (this.onShowMoreMenu !== undefined && this.rootEl !== null) {
                this.onShowMoreMenu(ellipsisBtn, this.ctx, this.makeHandle());
            }
        });
        left.appendChild(ellipsisBtn);

        // Stop button (right side, hidden by default; the orchestrator
        // toggles visibility via handle.setRunning()).
        const stopBtn = this.makeIconButton(doc, 'square', 'Stop');
        stopBtn.classList.add('stop-button');
        stopBtn.classList.add('agent-u-hidden');
        stopBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (this.onStop !== undefined) this.onStop();
        });
        right.appendChild(stopBtn);
        this.stopButtonEl = stopBtn;

        // Send button (right side).
        const sendBtn = this.makeIconButton(doc, 'send-horizontal', 'Send');
        sendBtn.classList.add('send-button');
        sendBtn.addEventListener('click', (ev) => { ev.preventDefault(); this.sendFromInput(); });
        right.appendChild(sendBtn);
        this.sendButtonEl = sendBtn;

        toolbar.appendChild(left);
        toolbar.appendChild(right);
        wrapper.appendChild(toolbar);
        root.appendChild(composerContainer);

        this.containerEl.appendChild(root);
        this.rootEl = root;

        // Position + clamp to viewport.
        const clamped = this.clampToViewport(this.position, root);
        root.setCssStyles({ left: `${clamped.x}px`, top: `${clamped.y}px` });

        // Esc closes; outside-click does NOT close.
        this.boundKeyDown = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                ev.preventDefault();
                this.close();
            }
        };
        doc.addEventListener('keydown', this.boundKeyDown);

        try { textarea.focus(); } catch { /* test stub */ }

        return this.makeHandle();
    }

    close(): void {
        const wasOpen = this.rootEl !== null;
        if (this.rootEl !== null) {
            this.rootEl.remove();
            this.rootEl = null;
        }
        this.bodyEl = null;
        this.inputEl = null;
        this.statusEl = null;
        this.previewEl = null;
        this.previewToggleEl = null;
        this.previewExpanded = false;
        this.bubbleNodes.clear();
        this.bubbleMarkdown.clear();
        this.bubbleCounter = 0;
        if (this.autocomplete !== null) {
            try { this.autocomplete.hide(); } catch { /* swallow */ }
            this.autocomplete = null;
        }
        if (this.boundKeyDown !== null) {
            this.containerEl.ownerDocument.removeEventListener('keydown', this.boundKeyDown);
            this.boundKeyDown = null;
        }
        if (wasOpen && this.onClose !== undefined) {
            try { this.onClose(); } catch { /* swallow */ }
        }
    }

    dispose(): void { this.close(); }

    private buildSelectionPreview(root: HTMLElement, doc: Document): void {
        const sel = this.ctx.selectionText;
        if (sel.length === 0) return;

        const section = doc.createElement('div');
        section.classList.add('agent-inline-panel__anchor');

        const label = doc.createElement('div');
        label.classList.add('agent-inline-panel__anchor-label');
        label.textContent = 'Selection';

        const preview = doc.createElement('div');
        preview.classList.add('agent-inline-panel__anchor-text');
        preview.textContent = this.truncateToLines(sel, PREVIEW_VISIBLE_LINES);
        this.previewEl = preview;

        section.appendChild(label);
        section.appendChild(preview);

        // Show a tiny chevron toggle only if the selection has more
        // than PREVIEW_VISIBLE_LINES lines or exceeds a soft char cap.
        const lineCount = sel.split('\n').length;
        const needsToggle = lineCount > PREVIEW_VISIBLE_LINES || sel.length > 240;
        if (needsToggle) {
            const toggle = doc.createElement('button');
            toggle.classList.add('agent-inline-panel__anchor-toggle');
            toggle.setAttribute('type', 'button');
            toggle.setAttribute('aria-label', 'Expand selection preview');
            toggle.setAttribute('title', 'Expand');
            const iconSpan = doc.createElement('span');
            iconSpan.classList.add('agent-inline-panel__anchor-toggle-icon');
            this.setIcon(iconSpan, 'chevron-down');
            toggle.appendChild(iconSpan);
            toggle.addEventListener('click', (ev) => {
                ev.preventDefault();
                this.togglePreview();
            });
            section.appendChild(toggle);
            this.previewToggleEl = toggle;
        }

        root.appendChild(section);
    }

    private togglePreview(): void {
        if (this.previewEl === null || this.previewToggleEl === null) return;
        this.previewExpanded = !this.previewExpanded;
        // Replace the chevron icon inside the toggle button.
        this.previewToggleEl.empty?.();
        while (this.previewToggleEl.firstChild !== null) {
            this.previewToggleEl.removeChild(this.previewToggleEl.firstChild);
        }
        const iconSpan = this.containerEl.ownerDocument.createElement('span');
        iconSpan.classList.add('agent-inline-panel__anchor-toggle-icon');
        if (this.previewExpanded === true) {
            this.previewEl.textContent = this.ctx.selectionText;
            this.previewEl.classList.add('agent-inline-panel__anchor-text--expanded');
            this.setIcon(iconSpan, 'chevron-up');
            this.previewToggleEl.setAttribute('title', 'Collapse');
            this.previewToggleEl.setAttribute('aria-label', 'Collapse selection preview');
        } else {
            this.previewEl.textContent = this.truncateToLines(this.ctx.selectionText, PREVIEW_VISIBLE_LINES);
            this.previewEl.classList.remove('agent-inline-panel__anchor-text--expanded');
            this.setIcon(iconSpan, 'chevron-down');
            this.previewToggleEl.setAttribute('title', 'Expand');
            this.previewToggleEl.setAttribute('aria-label', 'Expand selection preview');
        }
        this.previewToggleEl.appendChild(iconSpan);
    }

    private truncateToLines(text: string, maxLines: number): string {
        const lines = text.split('\n');
        if (lines.length <= maxLines) return text;
        return lines.slice(0, maxLines).join('\n') + '…';
    }

    private makeToolbarButton(doc: Document, label: string): HTMLButtonElement {
        const btn = doc.createElement('button');
        btn.classList.add('toolbar-button');
        btn.setAttribute('type', 'button');
        btn.textContent = label;
        return btn;
    }

    private makeIconButton(doc: Document, iconName: string, tooltip: string): HTMLButtonElement {
        const btn = doc.createElement('button');
        btn.classList.add('toolbar-button');
        btn.classList.add('toolbar-ghost');
        btn.setAttribute('type', 'button');
        btn.setAttribute('aria-label', tooltip);
        btn.setAttribute('title', tooltip);
        const iconSpan = doc.createElement('span');
        iconSpan.classList.add('toolbar-icon');
        this.setIcon(iconSpan, iconName);
        btn.appendChild(iconSpan);
        return btn;
    }

    private dispatch(actionId: InlinePanelActionId, userInput: string): void {
        if (this.rootEl === null) return;
        const handle = this.makeHandle();
        try {
            this.onDispatch({ actionId, userInput, ctx: this.ctx }, handle);
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            handle.setStatus(`Error: ${err.message}`, 'error');
        }
    }

    private sendFromInput(): void {
        if (this.inputEl === null) return;
        const value = this.inputEl.value.trim();
        if (value.length === 0) return;
        this.inputEl.value = '';
        this.dispatch('free-chat', value);
    }

    /** Public accessor so callers (e.g. orchestrator hydrate-on-open)
     *  can append messages without going through onDispatch. */
    getHandle(): InlinePanelHandle { return this.makeHandle(); }

    private makeHandle(): InlinePanelHandle {
        return {
            appendMessage: (m) => this.appendMessage(m),
            appendStreamChunk: (id, c) => this.appendStreamChunk(id, c),
            finalizeBubble: (id) => this.finalizeBubble(id),
            appendCheckpointMarker: (m) => this.appendCheckpointMarker(m),
            insertIntoComposer: (text, mode) => this.insertIntoComposer(text, mode),
            setModelLabel: (label, tooltip) => this.setModelLabel(label, tooltip),
            setRunning: (running) => this.setRunning(running),
            setStatus: (t, l) => this.setStatus(t, l),
            close: () => this.close(),
        };
    }

    private setRunning(running: boolean): void {
        if (this.sendButtonEl !== null) {
            this.sendButtonEl.classList.toggle('agent-u-hidden', running === true);
        }
        if (this.stopButtonEl !== null) {
            this.stopButtonEl.classList.toggle('agent-u-hidden', running !== true);
        }
    }

    private insertIntoComposer(text: string, mode: 'replace' | 'prepend' | 'append' = 'prepend'): void {
        if (this.inputEl === null) return;
        const cur = this.inputEl.value;
        let next: string;
        if (mode === 'replace') {
            next = text;
        } else if (mode === 'append') {
            next = cur.length > 0 ? `${cur}${cur.endsWith(' ') ? '' : ' '}${text}` : text;
        } else {
            const trimmed = text.trimEnd();
            next = cur.length > 0 ? `${trimmed} ${cur.trimStart()}` : `${trimmed} `;
        }
        this.inputEl.value = next;
        try { this.inputEl.focus(); } catch { /* test stub */ }
        const pos = this.inputEl.value.length;
        try { this.inputEl.setSelectionRange(pos, pos); } catch { /* test stub */ }
    }

    private setModelLabel(label: string, tooltip?: string): void {
        if (this.modelButtonEl === null) return;
        this.modelButtonEl.textContent = label;
        if (tooltip !== undefined) this.modelButtonEl.setAttribute('title', tooltip);
    }

    private appendCheckpointMarker(marker: InlineCheckpointMarker): string {
        if (this.bodyEl === null) return '';
        const doc = this.containerEl.ownerDocument;

        // Sidebar-parity DOM: the same `.checkpoint-marker`/`.checkpoint-*`
        // CSS hierarchy AgentSidebarView.renderCheckpointMarker uses, so
        // the inline panel inherits the divider-line + ghost-icon-button
        // look without a parallel stylesheet.
        const wrap = doc.createElement('div');
        wrap.classList.add('checkpoint-marker');
        wrap.classList.add('agent-inline-panel__bubble');
        wrap.classList.add('agent-inline-panel__bubble--checkpoint');

        const iconEl = doc.createElement('span');
        iconEl.classList.add('checkpoint-icon');
        this.setIcon(iconEl, 'git-commit-vertical');
        wrap.appendChild(iconEl);

        const labelEl = doc.createElement('span');
        labelEl.classList.add('checkpoint-label');
        const labelText = marker.detail !== undefined && marker.detail.length > 0
            ? `${marker.label} -- ${marker.detail}`
            : marker.label;
        labelEl.textContent = labelText;
        wrap.appendChild(labelEl);

        const actions = doc.createElement('div');
        actions.classList.add('checkpoint-actions');

        const makeBtn = (icon: string, tooltip: string, handler: () => void): HTMLButtonElement => {
            const btn = doc.createElement('button');
            btn.classList.add('checkpoint-action-btn');
            btn.setAttribute('type', 'button');
            btn.setAttribute('aria-label', tooltip);
            this.setIcon(btn, icon);
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                try { handler(); } catch (e) { console.warn('[inline-checkpoint] action threw:', e); }
            });
            return btn;
        };

        if (marker.onShowDiff !== undefined) {
            actions.appendChild(makeBtn('file-diff', 'Diff anzeigen', () => marker.onShowDiff?.()));
        }
        if (marker.onRestore !== undefined) {
            actions.appendChild(makeBtn('undo-2', 'Diese Änderung zurücknehmen', () => marker.onRestore?.()));
        }
        if (marker.onRestoreFromHere !== undefined) {
            actions.appendChild(makeBtn('rotate-ccw', 'Ab hier zurücknehmen', () => marker.onRestoreFromHere?.()));
        }
        if (marker.onMoreMenu !== undefined) {
            const moreBtn = makeBtn('more-vertical', 'Weitere Optionen', () => {
                marker.onMoreMenu?.(moreBtn);
            });
            actions.appendChild(moreBtn);
        }
        wrap.appendChild(actions);

        this.bodyEl.appendChild(wrap);
        this.bubbleCounter += 1;
        const id = `c${this.bubbleCounter}`;
        this.bubbleNodes.set(id, wrap);
        this.scrollToBottom();
        return id;
    }

    private appendMessage(message: InlinePanelMessage): string {
        if (this.bodyEl === null) return '';
        const doc = this.containerEl.ownerDocument;
        const bubble = doc.createElement('div');
        bubble.classList.add('agent-inline-panel__bubble');
        bubble.classList.add(`agent-inline-panel__bubble--${message.role}`);
        bubble.textContent = message.text;
        this.bodyEl.appendChild(bubble);
        this.bubbleCounter += 1;
        const id = `b${this.bubbleCounter}`;
        this.bubbleNodes.set(id, bubble);
        this.bubbleMarkdown.set(id, message.text);
        this.scrollToBottom();
        return id;
    }

    private appendStreamChunk(bubbleId: string, chunk: string): void {
        const bubble = this.bubbleNodes.get(bubbleId);
        if (bubble === undefined) return;
        // Plain-text accumulation during streaming (cheap, no layout
        // thrash). The raw markdown buffer is what finalizeBubble later
        // feeds into the MarkdownRenderer.
        bubble.textContent = (bubble.textContent ?? '') + chunk;
        this.bubbleMarkdown.set(bubbleId, (this.bubbleMarkdown.get(bubbleId) ?? '') + chunk);
        this.scrollToBottom();
    }

    /**
     * Replace the bubble's plain-text streaming content with rendered
     * markdown via the renderMarkdown hook. Idempotent: subsequent
     * calls with the same id re-render (useful if the appendix arrives
     * after the LLM stream and the action calls finalize twice).
     */
    private async finalizeBubble(bubbleId: string): Promise<void> {
        if (this.renderMarkdownHook === undefined) return;
        const bubble = this.bubbleNodes.get(bubbleId);
        const markdown = this.bubbleMarkdown.get(bubbleId);
        if (bubble === undefined || markdown === undefined || markdown.length === 0) return;
        // Clear plain-text content; the hook will populate it.
        while (bubble.firstChild !== null) {
            bubble.removeChild(bubble.firstChild);
        }
        try {
            await this.renderMarkdownHook(bubble, markdown);
        } catch (e) {
            // Fallback: restore plain text so the user still sees the answer.
            bubble.textContent = markdown;
            console.debug('[InlineChatPanel] renderMarkdown failed (fallback to plain text):', e);
        }
        this.scrollToBottom();
    }

    private setStatus(text: string, level: 'info' | 'error' = 'info'): void {
        if (this.statusEl === null) return;
        this.statusEl.classList.remove('agent-u-hidden');
        this.statusEl.classList.toggle('agent-inline-panel__status--error', level === 'error');
        this.statusEl.textContent = text;
    }

    private scrollToBottom(): void {
        if (this.bodyEl === null) return;
        try { this.bodyEl.scrollTop = this.bodyEl.scrollHeight; } catch { /* jsdom stub */ }
    }

    private clampToViewport(pos: { x: number; y: number }, root: HTMLElement): { x: number; y: number } {
        const win = this.containerEl.ownerDocument.defaultView;
        if (win === null) return pos;
        const rect = root.getBoundingClientRect();
        const width = rect.width > 0 ? rect.width : DEFAULT_WIDTH;
        const height = rect.height > 0 ? rect.height : 320;
        const maxX = Math.max(0, win.innerWidth - width - 8);
        const maxY = Math.max(0, win.innerHeight - height - 8);
        return {
            x: Math.max(8, Math.min(pos.x, maxX)),
            y: Math.max(8, Math.min(pos.y, maxY)),
        };
    }
}

function iconFallback(name: string): string {
    switch (name) {
        case 'plus': return '+';
        case 'search': return '🔍';
        case 'ellipsis': return '⋯';
        case 'send-horizontal': return '↵';
        default: return '◇';
    }
}
