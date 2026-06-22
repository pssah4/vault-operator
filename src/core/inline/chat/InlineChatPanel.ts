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

export interface InlinePanelHandle {
    appendMessage(message: InlinePanelMessage): string;
    appendStreamChunk(bubbleId: string, chunk: string): void;
    /**
     * Replace the bubble's plain-text streaming content with rendered
     * markdown (via the panel's renderMarkdown hook). Called once the
     * stream + appendix have completed. No-op when no renderMarkdown
     * hook is configured -- the bubble stays as plain text.
     */
    finalizeBubble(bubbleId: string): Promise<void>;
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

export interface InlineChatPanelOptions {
    containerEl: HTMLElement;
    ctx: InlineTriggerContext;
    position: { x: number; y: number };
    onDispatch: (args: InlinePanelDispatchArgs, handle: InlinePanelHandle) => void;
    /** Called by the "..." menu to surface secondary actions. */
    onShowMoreMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    /** Called by the "+" menu to surface attach/context options. */
    onShowPlusMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext) => void;
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
    private readonly onShowPlusMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext) => void;
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
        this.onClose = options.onClose;
        this.setIcon = options.setIcon ?? ((el, name) => { el.textContent = iconFallback(name); });
        this.renderMarkdownHook = options.renderMarkdown;
    }

    get isOpen(): boolean { return this.rootEl !== null; }

    open(): InlinePanelHandle {
        this.close();
        const doc = this.containerEl.ownerDocument;
        const root = doc.createElement('div');
        root.classList.add('agent-inline-panel');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'Inline AI chat');
        root.style.setProperty('position', 'absolute');
        root.style.setProperty('width', `${DEFAULT_WIDTH}px`);
        root.style.setProperty('z-index', '1000');

        // Selection preview (collapsible, 3 lines visible by default).
        this.buildSelectionPreview(root, doc);

        // Header close button (× in top-right corner).
        const closeBtn = doc.createElement('button');
        closeBtn.classList.add('agent-inline-panel__close');
        closeBtn.setAttribute('type', 'button');
        closeBtn.setAttribute('title', 'Close (Esc)');
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

        const textarea = doc.createElement('textarea');
        textarea.classList.add('chat-textarea');
        textarea.setAttribute('rows', '3');
        textarea.setAttribute('placeholder', 'Type your message here…');
        textarea.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && ev.shiftKey === false && ev.ctrlKey === false && ev.metaKey === false && ev.isComposing === false) {
                ev.preventDefault();
                this.sendFromInput();
            }
        });
        wrapper.appendChild(textarea);
        this.inputEl = textarea;

        const toolbar = doc.createElement('div');
        toolbar.classList.add('chat-toolbar');
        const left = doc.createElement('div');
        left.classList.add('chat-toolbar-left');
        const right = doc.createElement('div');
        right.classList.add('chat-toolbar-right');

        // Model button (display-only here; the real selector lives in the
        // sidebar settings -- this mirrors the sidebar visual layout).
        const modelBtn = this.makeToolbarButton(doc, 'Auto');
        modelBtn.classList.add('model-button');
        modelBtn.setAttribute('title', 'Model (inherited from main chat)');
        modelBtn.setAttribute('type', 'button');
        left.appendChild(modelBtn);

        // "+" menu (attach / context).
        const plusBtn = this.makeIconButton(doc, 'plus', 'Add context');
        plusBtn.classList.add('plus-button');
        plusBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            if (this.onShowPlusMenu !== undefined) {
                this.onShowPlusMenu(plusBtn, this.ctx);
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

        // Send button (right side).
        const sendBtn = this.makeIconButton(doc, 'send-horizontal', 'Send');
        sendBtn.classList.add('send-button');
        sendBtn.addEventListener('click', (ev) => { ev.preventDefault(); this.sendFromInput(); });
        right.appendChild(sendBtn);

        toolbar.appendChild(left);
        toolbar.appendChild(right);
        wrapper.appendChild(toolbar);
        root.appendChild(composerContainer);

        this.containerEl.appendChild(root);
        this.rootEl = root;

        // Position + clamp to viewport.
        const clamped = this.clampToViewport(this.position, root);
        root.style.setProperty('left', `${clamped.x}px`);
        root.style.setProperty('top', `${clamped.y}px`);

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

    private makeHandle(): InlinePanelHandle {
        return {
            appendMessage: (m) => this.appendMessage(m),
            appendStreamChunk: (id, c) => this.appendStreamChunk(id, c),
            finalizeBubble: (id) => this.finalizeBubble(id),
            setStatus: (t, l) => this.setStatus(t, l),
            close: () => this.close(),
        };
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
