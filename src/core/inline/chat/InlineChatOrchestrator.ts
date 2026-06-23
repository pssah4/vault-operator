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
import { applyInlineEdit, inlineTaskId } from '../InlineEditApplier';
import { showEditReviewModal, showCheckpointReviewModal } from '../../../ui/edit-review/EditReviewModal';
import { Menu } from 'obsidian';
import type { EditReviewEntry, EditReviewDecision } from '../../../ui/edit-review/EditReviewPanel';

export interface EditorChatProbe {
    probe(): SelectionTriggerInput | null;
    getPanelContainer(): HTMLElement | null;
    getPanelPosition(): { x: number; y: number };
    /**
     * Write back arbitrary content into the original editor selection
     * range. Implemented by the live wiring via MarkdownView.editor.
     * Returns true on success, false when no active editor matches.
     */
    writeBackToSelection?(args: { notePath: string; from: number; to: number; content: string }): Promise<boolean>;
}

export interface InlineChatOrchestratorOptions {
    plugin: ObsidianAgentPlugin;
    editorProbe: EditorChatProbe;
    registry: InlineActionRegistry;
    resolver: InlineTriggerResolver;
    isEnabled?: () => boolean;
    setIcon?: SetIconHook;
    /** Build per-panel surface (pickers + chip bar wiring). */
    buildSurface?: (panelRoot: HTMLElement, chipBar: HTMLElement) => unknown;
    /** Set the active surface for the menu callbacks. */
    setActiveSurface?: (surface: unknown) => void;
    /** Bridge to Obsidian's MarkdownRenderer.render (+ link wiring). */
    renderMarkdown?: RenderMarkdownHook;
    showMoreMenu?: (
        anchor: HTMLElement,
        ctx: InlineTriggerContext,
        handle: InlinePanelHandle,
        dispatch: (actionId: InlinePanelActionId) => void,
    ) => void;
    showPlusMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    /** Model-picker (live wired against plugin.settings.activeModels). */
    showModelMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    /** Initial model-button label (resolved once at panel-open). */
    getInitialModelLabel?: () => { label: string; tooltip: string };
    /** Factory for the textarea autocomplete handler (mirrors sidebar). */
    autocompleteFactory?: (textarea: HTMLTextAreaElement, inputArea: HTMLElement) => import('./InlineChatPanel').AutocompleteLike;
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
    private readonly showPlusMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    private readonly showModelMenu?: (anchor: HTMLElement, ctx: InlineTriggerContext, handle: InlinePanelHandle) => void;
    private readonly getInitialModelLabel?: () => { label: string; tooltip: string };
    private readonly autocompleteFactory?: (textarea: HTMLTextAreaElement, inputArea: HTMLElement) => import('./InlineChatPanel').AutocompleteLike;
    private readonly buildSurface?: (panelRoot: HTMLElement, chipBar: HTMLElement) => unknown;
    private readonly setActiveSurface?: (surface: unknown) => void;
    private activeSurface: unknown = null;

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
        this.showModelMenu = options.showModelMenu;
        this.getInitialModelLabel = options.getInitialModelLabel;
        this.autocompleteFactory = options.autocompleteFactory;
        this.buildSurface = options.buildSurface;
        this.setActiveSurface = options.setActiveSurface;
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
        // The controller pulls the AttachmentHandler from the active
        // panel surface so '@'-mention picks + the Plus -> Attach file
        // popover both feed the multimodal content-block builder.
        this.activeController = new PanelChatController({
            plugin: this.plugin,
            ctx,
            getAttachments: () => {
                const s = this.activeSurface as { attachments?: { pending: unknown[]; clear: () => void } } | null;
                return s?.attachments as never ?? null;
            },
        });

        const initialModel = this.getInitialModelLabel?.() ?? { label: 'Auto', tooltip: 'Model' };
        const panel = new InlineChatPanel({
            containerEl: container,
            ctx,
            position: this.editorProbe.getPanelPosition(),
            initialModelLabel: initialModel.label,
            initialModelTooltip: initialModel.tooltip,
            onDispatch: (args, handle) => { void this.handleDispatch(args, handle); },
            onShowMoreMenu: this.showMoreMenu !== undefined
                ? (anchor, c, handle) => {
                    this.showMoreMenu!(anchor, c, handle, (actionId) => {
                        void this.handleDispatch({ actionId, userInput: '', ctx: c }, handle);
                    });
                }
                : undefined,
            onShowPlusMenu: this.showPlusMenu,
            onShowModelMenu: this.showModelMenu,
            onStop: () => {
                if (this.activeController !== null) {
                    this.activeController.abort();
                }
            },
            onClose: () => {
                if (this.activeController !== null) {
                    this.activeController.dispose();
                    this.activeController = null;
                }
                if (this.setActiveSurface !== undefined) {
                    try { this.setActiveSurface(null); } catch { /* swallow */ }
                }
                this.activeSurface = null;
                this.activePanel = null;
            },
            setIcon: this.setIconHook,
            renderMarkdown: this.renderMarkdownHook,
            autocompleteFactory: this.autocompleteFactory,
        });
        panel.open();
        this.activePanel = panel;
        // Build per-panel surface (pickers + chip bar) AFTER open() so the
        // chip-bar element exists. Register it via setActiveSurface so the
        // menu callbacks can find the right AttachmentHandler / pickers.
        if (this.buildSurface !== undefined && this.setActiveSurface !== undefined) {
            const root = panel.root;
            const chipBar = panel.chipBar;
            if (root !== null && chipBar !== null) {
                try {
                    this.activeSurface = this.buildSurface(root, chipBar);
                    this.setActiveSurface(this.activeSurface);
                } catch (e) {
                    console.debug('[InlineChatOrchestrator] buildSurface failed:', e);
                }
            }
        }
        // EPIC-33 (2026-06-23): no checkpoint-hydration here. Opening a
        // new inline panel starts a fresh session; old checkpoints from
        // an earlier session must NOT bleed into the new panel.
        // Checkpoints from the SAME session still appear live via
        // appendCheckpointMarker once an inline-edit completes.
        // Re-opened conversations from the sidebar history surface
        // their inline checkpoints via the sidebar's rehydrate path
        // (UiMessage.taskId -> rehydrateCheckpointMarkers).
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
            // Mid-run typing -> queue as a steering message. The
            // user bubble still renders so the typist sees what they
            // pushed; the agent receives it at the next iteration.
            if (this.activeController.isRunning === true) {
                const queued = this.activeController.pushSteering(args.userInput);
                if (queued === true) {
                    handle.appendMessage({ role: 'user', text: args.userInput });
                    handle.setStatus('Steering message queued for next iteration.');
                } else {
                    handle.setStatus('Steering message ignored (empty or no run).', 'error');
                }
                return;
            }
            handle.appendMessage({ role: 'user', text: args.userInput });
            const assistantId = handle.appendMessage({ role: 'assistant', text: '' });
            handle.setStatus('Thinking…');
            handle.setRunning(true);
            try {
                await this.activeController.sendTurn({
                    userInput: args.userInput,
                    handle,
                    assistantBubbleId: assistantId,
                });
            } finally {
                handle.setRunning(false);
            }
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

        // Edit-actions (Rewrite, Translate) collect the stream so we
        // can hand the result to the EditReviewModal once the LLM is
        // done. Display-only actions (Lookup, Find-Items, Summarize)
        // just stream into the bubble.
        // BUGFIX 2026-06-23: Translate is meant to REPLACE the selection
        // in the note, not only render in the chat. Promoted to edit-action
        // so the review-and-apply path runs after the stream.
        const isEditAction = args.actionId === 'rewrite' || args.actionId === 'translate';
        // BUGFIX 2026-06-23: every quick-action's stream is collected so
        // the assistant text reaches the history persistence path. Without
        // this only free-chat turns were saved -- inline panels that
        // ONLY used quick-actions never appeared in the history list.
        let collected = '';
        const callbacks: AgentTaskCallbacks = {
            onText: (chunk) => {
                collected += chunk;
                handle.appendStreamChunk(assistantId, chunk);
            },
            onToolStart: () => {},
            onToolResult: () => {},
            onComplete: () => { handle.setStatus('Done'); },
            onError: (err) => { handle.setStatus(`Error: ${err.message}`, 'error'); },
        };

        try {
            await action.execute(args.ctx, callbacks);
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            handle.setStatus(`Error: ${err.message}`, 'error');
        }
        // Render markdown + wire links once the action's stream has
        // completed (and the appendix chunk -- if any -- has landed).
        await handle.finalizeBubble(assistantId);

        if (isEditAction === true && collected.length > 0) {
            await this.openReviewAndApply(args.ctx, collected, label, handle);
        }

        // Persist this quick-action turn to the ConversationStore so
        // it appears in the history list alongside free-chat turns
        // (and so a later free-chat turn in the same panel extends
        // the same conversation file, not a new one).
        if (this.activeController !== null && collected.length > 0) {
            try {
                await this.activeController.recordQuickAction({
                    actionLabel: label,
                    userText: args.userInput,
                    assistantText: collected,
                });
            } catch (e) {
                console.debug('[InlineChatOrchestrator] recordQuickAction failed:', e);
            }
        }
    }

    /**
     * Edit-action follow-up: open the EditReviewModal, snapshot via
     * checkpointService, write back into the editor selection, and
     * render a checkpoint marker bubble in the panel.
     */
    private async openReviewAndApply(
        ctx: InlineTriggerContext,
        proposedText: string,
        actionLabel: string,
        handle: InlinePanelHandle,
    ): Promise<void> {
        const probe = this.editorProbe;
        if (probe.writeBackToSelection === undefined) {
            handle.setStatus('Editor-Anbindung fehlt — Änderung nicht anwendbar.', 'error');
            return;
        }
        handle.setStatus('Bereit zum Anwenden — bestätige im Diff-Dialog.');

        // FIX-33-DV-01 (2026-06-22): use the explicit selectionFrom/To
        // captured at trigger time. ctx.cursorPos is the caret head and
        // for forward selections points to the END, so the old
        // (cursorPos, cursorPos+length) range wrote BEHIND the selection
        // and silently dropped user edits.
        const selFrom = ctx.selectionFrom ?? ctx.cursorPos;
        const selTo = ctx.selectionTo ?? (ctx.cursorPos + ctx.selectionText.length);

        const result = await applyInlineEdit({
            app: this.plugin.app,
            checkpointService: this.plugin.checkpointService,
            notePath: ctx.notePath,
            selection: {
                from: selFrom,
                to: selTo,
                text: ctx.selectionText,
            },
            proposedText,
            actionLabel: `Inline-AI: ${actionLabel}`,
            // Use the per-panel-session taskId so checkpoints created
            // during this session group under the same Conversation
            // (which is what UiMessage.taskId references for history
            // rehydration). Fall back to the legacy note-hash if the
            // controller is gone (defensive -- should not happen).
            taskId: this.activeController?.getInlineTaskId() ?? inlineTaskId(ctx.notePath),
            toolName: `inline:${actionLabel.toLowerCase()}`,
            openReview: async (entry: EditReviewEntry): Promise<EditReviewDecision | null> => {
                const r = await showEditReviewModal({
                    app: this.plugin.app,
                    entries: [entry],
                    source: `Inline-AI: ${actionLabel}`,
                    title: 'Änderung prüfen',
                });
                if (r.decisions === null) return null;
                return r.decisions[0] ?? null;
            },
            writeBack: async (finalContent: string) => {
                const ok = await probe.writeBackToSelection!({
                    notePath: ctx.notePath,
                    from: selFrom,
                    to: selTo,
                    content: finalContent,
                });
                if (ok === false) throw new Error('No matching active editor');
            },
        });

        if (result.status === 'applied') {
            handle.setStatus('Übernommen.');
            const ts = result.checkpoint?.timestamp ?? '';
            const time = ts.length > 0 ? new Date(ts).toLocaleTimeString() : '';
            const detail = `${ctx.notePath}${time.length > 0 ? ' • ' + time : ''}`;
            handle.appendCheckpointMarker({
                label: `${actionLabel} angewendet`,
                detail,
                onShowDiff: () => {
                    if (result.checkpoint === undefined) return;
                    this.showCheckpointDiff(ctx.notePath, result.checkpoint, ctx.selectionText, result.finalContent ?? '');
                },
                onRestore: () => {
                    if (result.checkpoint === undefined) return;
                    void this.restoreCheckpoint(result.checkpoint);
                },
                onRestoreFromHere: () => {
                    if (result.checkpoint === undefined) return;
                    void this.restoreCheckpointsForward(result.checkpoint);
                },
                onMoreMenu: (anchor) => {
                    const menu = new Menu();
                    menu.addItem((item) => {
                        item.setTitle('Chat ab hier löschen');
                        item.setIcon('trash-2');
                        item.onClick(() => {
                            if (result.checkpoint === undefined) return;
                            void this.restoreCheckpoint(result.checkpoint);
                            // The inline panel is the ephemeral chat
                            // surface; "delete chat from here" maps to
                            // "restore + close panel" so the next open
                            // starts fresh (matches Task 1 contract).
                            if (this.activePanel !== null) this.activePanel.close();
                        });
                    });
                    const rect = anchor.getBoundingClientRect();
                    menu.showAtPosition({ x: rect.left, y: rect.bottom });
                },
            });
        } else if (result.status === 'discarded') {
            handle.setStatus(result.error ?? 'Verworfen.');
        } else if (result.status === 'skipped') {
            handle.setStatus(result.error ?? 'Übersprungen.');
        }
    }

    private showCheckpointDiff(
        notePath: string,
        checkpoint: import('../../checkpoints/GitCheckpointService').CheckpointInfo,
        oldContent: string,
        newContent: string,
    ): void {
        showCheckpointReviewModal({
            app: this.plugin.app,
            entries: [{ path: notePath, before: oldContent, after: newContent }],
            source: `Checkpoint ${new Date(checkpoint.timestamp).toLocaleString()}`,
            title: 'Checkpoint anzeigen',
            onRestore: async () => { await this.restoreCheckpoint(checkpoint); },
        });
    }

    private async restoreCheckpoint(
        checkpoint: import('../../checkpoints/GitCheckpointService').CheckpointInfo,
    ): Promise<void> {
        const svc = this.plugin.checkpointService;
        if (svc === null || svc === undefined) return;
        try {
            await svc.restore(checkpoint);
        } catch (e) {
            console.warn('[inline-checkpoint] restore failed:', e);
        }
    }

    /**
     * "Undo all changes from here": restore the given checkpoint AND
     * every checkpoint that came after it in the same task. Mirrors
     * AgentSidebarView.restoreCheckpointsForward so the inline panel
     * offers the same option as the sidebar. Takes a pre-restore
     * snapshot of the affected files so the multi-step rollback is
     * itself undoable via the next checkpoint marker.
     */
    private async restoreCheckpointsForward(
        startCp: import('../../checkpoints/GitCheckpointService').CheckpointInfo,
    ): Promise<void> {
        const svc = this.plugin.checkpointService;
        if (svc === null || svc === undefined) return;
        try {
            const all = await svc.loadCheckpointsForTask(startCp.taskId);
            const startIdx = all.findIndex((c) => c.commitOid === startCp.commitOid);
            if (startIdx < 0) {
                await this.restoreCheckpoint(startCp);
                return;
            }
            const tail = all.slice(startIdx);
            const affected = new Set<string>();
            for (const cp of tail) {
                for (const f of cp.filesChanged) affected.add(f);
                for (const f of cp.newFiles ?? []) affected.add(f);
            }
            try {
                await svc.snapshot(`restore-${Date.now()}`, [...affected], 'undo_from_here');
            } catch (e) {
                console.debug('[inline-checkpoint] pre-restore snapshot failed (non-fatal):', e);
            }
            for (const cp of tail.slice().reverse()) {
                try { await svc.restore(cp); } catch (e) {
                    console.warn('[inline-checkpoint] restoreCheckpointsForward step failed:', e);
                }
            }
        } catch (e) {
            console.warn('[inline-checkpoint] restoreCheckpointsForward failed:', e);
        }
    }

}
