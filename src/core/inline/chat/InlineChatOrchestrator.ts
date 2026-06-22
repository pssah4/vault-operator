/**
 * InlineChatOrchestrator -- panel surface for the inline-action stack (EPIC-33).
 *
 * Owns the active InlineChatPanel + a per-panel PanelChatController.
 * Free-chat (the textarea) drives a true Sidebar-style agent loop via
 * AgentTaskRunner; quick-actions (Lookup, Rewrite, Translate, ...) run
 * through the InlineActionRegistry and stream into the panel's
 * assistant bubble.
 *
 * Key design points (per EPIC-33 audit synthesis):
 *  - Free-chat NEVER goes through InlineChatAction (deleted) or
 *    NoteWriter (deleted). The panel is the only conversation surface.
 *  - Quick-action dispatch shows the action label as a STATUS PILL,
 *    not as a synthetic `[Label]` user bubble (audit cleanup target).
 *  - Multi-turn: the PanelChatController retains the MessageParam[]
 *    history across turns; AgentTask mutates the array in place.
 *
 * Related: PanelChatController, InlineChatPanel, EPIC-33 audit wd39z8ehx.
 */

import type { AgentTaskCallbacks } from '../../AgentTask';
import type { InlineActionRegistry } from '../InlineActionRegistry';
import type { InlineTriggerResolver, SelectionTriggerInput } from '../InlineTriggerResolver';
import type { InlineTriggerContext } from '../InlineTriggerContext';
import type ObsidianAgentPlugin from '../../../main';
import {
    InlineChatPanel,
    type InlinePanelActionId,
    type InlinePanelDispatchArgs,
    type InlinePanelHandle,
    type SetIconHook,
    type RenderMarkdownHook,
} from './InlineChatPanel';
import { PanelChatController } from './PanelChatController';

export interface EditorChatProbe {
    probe(): SelectionTriggerInput | null;
    getPanelContainer(): HTMLElement | null;
    getPanelPosition(): { x: number; y: number };
}

export interface InlineChatOrchestratorOptions {
    plugin: ObsidianAgentPlugin;
    editorProbe: EditorChatProbe;
    registry: InlineActionRegistry;
    resolver: InlineTriggerResolver;
    isEnabled?: () => boolean;
    setIcon?: SetIconHook;
    /** Bridge to Obsidian's MarkdownRenderer.render (+ link wiring). */
    renderMarkdown?: RenderMarkdownHook;
    showMoreMenu?: (
        anchor: HTMLElement,
        ctx: InlineTriggerContext,
        handle: InlinePanelHandle,
        dispatch: (actionId: InlinePanelActionId) => void,
    ) => void;
    showPlusMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext) => void;
}

/** Quick-actions map onto registered InlineAction ids. */
function panelActionToRegistryId(panelId: InlinePanelActionId): string | null {
    switch (panelId) {
        case 'lookup': return 'lookup';
        case 'rewrite': return 'rewrite';
        case 'translate': return 'translate:english';
        case 'summarize': return 'summarize:medium';
        case 'find-action-items': return 'find-action-items';
        case 'send-to-main': return 'send-to-main-chat';
        case 'free-chat': return null; // handled by PanelChatController, not the registry
    }
}

/** Human-readable label for a panel action (status pill copy). */
function panelActionLabel(panelId: InlinePanelActionId): string {
    switch (panelId) {
        case 'lookup': return 'Lookup';
        case 'rewrite': return 'Rewrite';
        case 'translate': return 'Translate';
        case 'summarize': return 'Summarize';
        case 'find-action-items': return 'Find action items';
        case 'send-to-main': return 'Send to main chat';
        case 'free-chat': return 'Chat';
    }
}

export class InlineChatOrchestrator {
    private readonly plugin: ObsidianAgentPlugin;
    private readonly editorProbe: EditorChatProbe;
    private readonly registry: InlineActionRegistry;
    private readonly resolver: InlineTriggerResolver;
    private readonly isEnabled: () => boolean;
    private readonly setIconHook?: SetIconHook;
    private readonly renderMarkdownHook?: RenderMarkdownHook;
    private readonly showMoreMenu?: (
        anchor: HTMLElement,
        ctx: InlineTriggerContext,
        handle: InlinePanelHandle,
        dispatch: (actionId: InlinePanelActionId) => void,
    ) => void;
    private readonly showPlusMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext) => void;

    private activePanel: InlineChatPanel | null = null;
    private activeController: PanelChatController | null = null;

    constructor(options: InlineChatOrchestratorOptions) {
        this.plugin = options.plugin;
        this.editorProbe = options.editorProbe;
        this.registry = options.registry;
        this.resolver = options.resolver;
        this.isEnabled = options.isEnabled ?? (() => true);
        this.setIconHook = options.setIcon;
        this.renderMarkdownHook = options.renderMarkdown;
        this.showMoreMenu = options.showMoreMenu;
        this.showPlusMenu = options.showPlusMenu;
    }

    triggerPanel(): void {
        if (this.isEnabled() !== true) return;
        const input = this.editorProbe.probe();
        if (input === null) return;
        const container = this.editorProbe.getPanelContainer();
        if (container === null) return;

        const ctx = this.resolver.resolveFromSelection(input);
        this.closePanel();

        // Fresh controller per panel -- in-memory history scoped to
        // the panel lifetime. Closing the panel disposes the controller.
        this.activeController = new PanelChatController({ plugin: this.plugin, ctx });

        const panel = new InlineChatPanel({
            containerEl: container,
            ctx,
            position: this.editorProbe.getPanelPosition(),
            onDispatch: (args, handle) => { void this.handleDispatch(args, handle); },
            onShowMoreMenu: this.showMoreMenu !== undefined
                ? (anchor, c, handle) => {
                    this.showMoreMenu!(anchor, c, handle, (actionId) => {
                        void this.handleDispatch({ actionId, userInput: '', ctx: c }, handle);
                    });
                }
                : undefined,
            onShowPlusMenu: this.showPlusMenu,
            onClose: () => {
                if (this.activeController !== null) {
                    this.activeController.dispose();
                    this.activeController = null;
                }
                this.activePanel = null;
            },
            setIcon: this.setIconHook,
            renderMarkdown: this.renderMarkdownHook,
        });
        panel.open();
        this.activePanel = panel;
    }

    closePanel(): void {
        if (this.activePanel !== null) {
            this.activePanel.close();
            this.activePanel = null;
        }
        if (this.activeController !== null) {
            this.activeController.dispose();
            this.activeController = null;
        }
    }

    dispose(): void { this.closePanel(); }

    private async handleDispatch(args: InlinePanelDispatchArgs, handle: InlinePanelHandle): Promise<void> {
        // Free-chat: drive the panel-scoped chat controller (true multi-turn).
        if (args.actionId === 'free-chat') {
            if (this.activeController === null) {
                handle.setStatus('Panel not initialised.', 'error');
                return;
            }
            handle.appendMessage({ role: 'user', text: args.userInput });
            const assistantId = handle.appendMessage({ role: 'assistant', text: '' });
            handle.setStatus('Thinking…');
            await this.activeController.sendTurn({
                userInput: args.userInput,
                handle,
                assistantBubbleId: assistantId,
            });
            // Render markdown + wire links once the controller signals completion.
            await handle.finalizeBubble(assistantId);
            return;
        }

        // Quick-action: status pill carries the label, no synthetic user bubble.
        const registryId = panelActionToRegistryId(args.actionId);
        if (registryId === null) {
            handle.setStatus(`Unknown action: ${args.actionId}`, 'error');
            return;
        }
        const action = this.registry.getAction(registryId);
        if (action === undefined) {
            handle.setStatus(`Action not registered: ${registryId}`, 'error');
            return;
        }
        if (action.isEligible(args.ctx) !== true) {
            handle.setStatus(`Not eligible in current editor mode.`, 'error');
            return;
        }

        const label = panelActionLabel(args.actionId);
        const assistantId = handle.appendMessage({ role: 'assistant', text: '' });
        handle.setStatus(`${label}…`);
        const callbacks = this.buildPanelCallbacks(handle, assistantId);
        try {
            await action.execute(args.ctx, callbacks);
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            handle.setStatus(`Error: ${err.message}`, 'error');
        }
        // Render markdown + wire links once the action's stream has
        // completed (and the appendix chunk -- if any -- has landed).
        await handle.finalizeBubble(assistantId);
    }

    private buildPanelCallbacks(handle: InlinePanelHandle, assistantBubbleId: string): AgentTaskCallbacks {
        return {
            onText: (chunk) => handle.appendStreamChunk(assistantBubbleId, chunk),
            onToolStart: () => {},
            onToolResult: () => {},
            onComplete: () => { handle.setStatus('Done'); },
            onError: (err) => { handle.setStatus(`Error: ${err.message}`, 'error'); },
        };
    }
}
