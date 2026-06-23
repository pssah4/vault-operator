/**
 * PanelChatController -- Sidebar-style chat session driver for the InlineChatPanel (EPIC-33).
 *
 * Drives the SAME agent loop the Sidebar uses, just from the inline
 * panel surface. Per user spec: "es ist der SELBE LOOP, nur aus einer
 * anderen Stelle / UI angesprochen."
 *
 * Parity bundle (wired through buildAgentRuntimeContext):
 *   - rulesContent, skillDirectorySection, pluginSkillsSection,
 *     memoryContext (Memory v2 ContextComposer + SoulView + sessions
 *     + onboarding prompt), recipesSection + recipeMatches.
 *   - configDir, globalCustomInstructions, includeTime, mcpClient.
 *   - Per-panel ModeService instance so per-mode role-definitions,
 *     mode-specific tool sets, and switch_mode all work identically.
 *   - Steering: live steeringQueue drained at every iteration start
 *     so mid-run user typing reaches the model.
 *   - AbortSignal for the panel's stop button.
 *
 * The selection is prepended to the FIRST user turn as a `<context>`
 * block so the model knows what the user is referring to. Follow-up
 * turns send raw user input.
 *
 * Related: AgentRuntimeContext (shared engine), composerExpansion
 *          (shared slash/prompt/workflow expansion),
 *          AgentSidebarView.handleSendMessage (the original loop).
 */

import type { MessageParam, ContentBlock } from '../../../api/types';
import type { AgentTaskCallbacks } from '../../AgentTask';
import { AgentTaskRunner } from '../../agent/AgentTaskRunner';
import { ModeService } from '../../modes/ModeService';
import { buildAgentRuntimeContext } from '../../agent/AgentRuntimeContext';
import type { ConversationStore, UiMessage } from '../../history/ConversationStore';
import { getModelKey } from '../../../types/settings';
import { Notice } from 'obsidian';
import type ObsidianAgentPlugin from '../../../main';
import type { InlineTriggerContext } from '../InlineTriggerContext';
import type { InlinePanelHandle } from './InlineChatPanel';

/**
 * Hard cap on inline-chat turns per ADR-143 ("maximal 20 Turns").
 * Reached when the conversation has accumulated 20 user/assistant pairs
 * inside one panel session. Beyond that the panel emits a Notice and
 * refuses further turns so the inline-chat block in the note stays
 * readable and token-cost stays bounded. Audit ref: AUDIT-EPIC-33 M-04.
 */
export const INLINE_TURN_CAP = 20;

export interface PanelChatControllerOptions {
    plugin: ObsidianAgentPlugin;
    ctx: InlineTriggerContext;
    /**
     * Optional access to the panel's AttachmentHandler -- when set, the
     * controller pulls pending attachments at send time and clears them
     * after dispatch (sidebar pattern).
     */
    getAttachments?: () => { pending: Array<{ block: ContentBlock }>; clear: () => void } | null;
}

export class PanelChatController {
    private readonly plugin: ObsidianAgentPlugin;
    private readonly ctx: InlineTriggerContext;
    private readonly modeService: ModeService;
    private readonly getAttachments?: () => { pending: Array<{ block: ContentBlock }>; clear: () => void } | null;
    /**
     * In-memory chat history reused across turns (AgentTask mutates
     * in place). Mirrors AgentSidebarView.conversationHistory.
     */
    private readonly history: MessageParam[] = [];
    /** UI-message log (mirrors AgentSidebarView.uiMessages). */
    private readonly uiMessages: UiMessage[] = [];
    /** ConversationStore id assigned on first turn -- panel chats appear in main history. */
    private activeConversationId: string | null = null;
    /** Mid-run user-typed messages, drained at the next iteration. */
    private readonly steeringQueue: string[] = [];
    private abortController: AbortController | null = null;
    private turnCounter = 0;
    private running = false;
    private modeServiceReady: Promise<void> | null = null;
    /**
     * Session-scoped taskId for checkpoints created during this panel
     * lifetime. Generated upfront so the very first inline-edit can
     * stamp its checkpoint before the conversation row exists. When the
     * conversation row is later created (first turn / recordQuickAction)
     * the id is rewritten to `inline-<conversationId>` so a re-opened
     * conversation in the sidebar history rehydrates exactly the
     * checkpoints created during that session.
     */
    private sessionTaskId: string;

    constructor(options: PanelChatControllerOptions) {
        this.plugin = options.plugin;
        this.ctx = options.ctx;
        // Own ModeService instance per controller. ModeService is
        // plugin-stateless (lazy toolRegistry access) so a fresh
        // instance is safe and the sidebar's instance stays unchanged.
        this.modeService = new ModeService(options.plugin);
        this.getAttachments = options.getAttachments;
        this.sessionTaskId = `inline-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16)}`;
    }

    /**
     * Stable task id for every checkpoint snapshotted during this
     * panel session. Used by InlineChatOrchestrator when calling
     * checkpointService.snapshot, and stamped onto the persisted
     * assistant UiMessage so the sidebar's history-rehydrate path can
     * surface the same checkpoints when the conversation is reopened.
     */
    getInlineTaskId(): string {
        return this.sessionTaskId;
    }

    get isRunning(): boolean { return this.running; }
    get isModeReady(): boolean { return this.modeServiceReady !== null; }

    /**
     * Returns true when the conversation has reached the per-block
     * turn cap. The orchestrator queries this before dispatching a new
     * quick-action or sendTurn so the user sees a single explanatory
     * Notice instead of a silently failing call.
     */
    isAtTurnCap(): boolean {
        const turns = Math.floor(this.uiMessages.length / 2);
        return turns >= INLINE_TURN_CAP;
    }

    /**
     * Drop a steering message onto the queue. AgentTask drains via
     * the consumeSteeringMessages callback at every iteration start.
     * Returns false if no turn is currently running -- caller should
     * either treat the input as a normal send or queue it for later.
     */
    pushSteering(text: string): boolean {
        if (this.running !== true) return false;
        const trimmed = text.trim();
        if (trimmed.length === 0) return false;
        this.steeringQueue.push(trimmed);
        return true;
    }

    async sendTurn(args: {
        userInput: string;
        handle: InlinePanelHandle;
        assistantBubbleId: string;
    }): Promise<void> {
        if (this.running === true) {
            args.handle.setStatus('Already running -- wait for the current turn to finish.', 'error');
            return;
        }
        if (this.isAtTurnCap() === true) {
            args.handle.setStatus(`Inline chat reached ${INLINE_TURN_CAP}-turn cap. Open the sidebar to continue this thread.`, 'error');
            new Notice(`Inline chat reached ${INLINE_TURN_CAP}-turn cap.`);
            return;
        }
        this.running = true;
        this.abortController = new AbortController();
        this.turnCounter += 1;

        // Lazy ModeService init (idempotent).
        if (this.modeServiceReady === null) {
            this.modeServiceReady = this.modeService.initialize();
        }
        await this.modeServiceReady;

        // Slash/prompt/workflow expansion (shared with sidebar).
        const expansionMod = await import('./composerExpansion');
        const activeFile = this.plugin.app.workspace.getActiveFile?.();
        const expanded = await expansionMod.expandComposerPrefix(this.plugin, {
            text: args.userInput,
            activeFilePath: activeFile?.path,
            activeFileName: activeFile?.name,
        });
        const effectiveInput = expanded ?? args.userInput;

        const userMessage = this.buildUserMessage(effectiveInput);
        const callbacks = this.buildCallbacks(args.handle, args.assistantBubbleId);

        if (this.plugin.apiHandler === null) {
            args.handle.setStatus('No API handler configured. Open Settings and set up a provider.', 'error');
            this.running = false;
            this.abortController = null;
            return;
        }

        // Build runtime context (shared engine -- identical to sidebar).
        const mode = this.modeService.getActiveMode();
        const isFirstMessage = this.history.length === 0;
        // EPIC-33 history-parity: create a ConversationStore entry on the
        // first turn so the inline panel chat appears in Vault Operator's
        // main history list alongside sidebar chats. The conversation id
        // is reused across all subsequent turns of this panel session.
        // BUGFIX 2026-06-22: ConversationStore is declared `null` (not
        // undefined) on the plugin -- the earlier undefined-only check
        // dispatched into the null path and create() crashed silently,
        // so the activeConversationId stayed null and save() bailed.
        // EPIC-33 history-parity: direct typed access (no cast).
        const convStore: ConversationStore | null = (this.plugin as { conversationStore?: ConversationStore | null }).conversationStore ?? null;
        if (this.activeConversationId === null) {
            if (convStore === null) {
                console.warn('[PanelChatController] plugin.conversationStore is null -- chat will NOT persist. Likely plugin not fully loaded.');
                new Notice('Inline chat: history store not ready, this chat will not be saved.');
            } else {
                try {
                    const modelKey = this.plugin.settings.activeModelKey;
                    const model = this.plugin.settings.activeModels.find(m => getModelKey(m) === modelKey);
                    const modelDisplay = model?.displayName ?? model?.name ?? modelKey ?? 'inline-chat';
                    this.activeConversationId = await convStore.create(mode.slug, modelDisplay);
                    this.sessionTaskId = `inline-${this.activeConversationId}`;
                    console.debug(`[PanelChatController] conversation created: ${this.activeConversationId} (mode=${mode.slug}, model=${modelDisplay})`);
                } catch (e) {
                    console.error('[PanelChatController] conversationStore.create FAILED:', e);
                    new Notice(`Inline chat: history create failed -- ${e instanceof Error ? e.message : String(e)}`);
                }
            }
        }
        // Track UI message (parallel to history so the store can rehydrate).
        this.uiMessages.push({ role: 'user', text: args.userInput, ts: new Date().toISOString() });

        const runtime = await buildAgentRuntimeContext(this.plugin, {
            userText: args.userInput,
            mode,
            isFirstMessage,
            activeConversationId: this.activeConversationId ?? undefined,
        });

        try {
            const runner = new AgentTaskRunner({
                api: this.plugin.apiHandler,
                toolRegistry: this.plugin.toolRegistry,
                callbacks,
                modeService: this.modeService,
                consecutiveMistakeLimit: this.plugin.settings.advancedApi?.consecutiveMistakeLimit ?? 0,
                rateLimitMs: this.plugin.settings.advancedApi?.rateLimitMs ?? 0,
                condensingEnabled: this.plugin.settings.advancedApi?.condensingEnabled ?? true,
                condensingThreshold: this.plugin.settings.advancedApi?.condensingThreshold ?? 80,
                powerSteeringFrequency: this.plugin.settings.advancedApi?.powerSteeringFrequency ?? 0,
                maxIterations: this.plugin.settings.advancedApi?.maxIterations ?? 25,
                maxSubtaskDepth: this.plugin.settings.advancedApi?.maxSubtaskDepth ?? 2,
                microcompactionEnabled: this.plugin.settings.advancedApi?.microcompactionEnabled ?? true,
                rollingSummaryThreshold: this.plugin.settings.advancedApi?.rollingSummaryThreshold ?? 50,
            });

            await runner.execute({
                userMessage,
                taskId: `inline-panel-${Date.now()}-${this.turnCounter}`,
                initialMode: mode,
                history: this.history,
                abortSignal: this.abortController.signal,
                globalCustomInstructions: this.plugin.settings.globalCustomInstructions || undefined,
                includeTime: this.plugin.settings.includeCurrentTimeInContext ?? false,
                rulesContent: runtime.rulesContent,
                skillDirectorySection: runtime.skillDirectorySection,
                mcpClient: (this.plugin as unknown as { mcpClient?: import('../../mcp/McpClient').McpClient }).mcpClient,
                allowedMcpServers: runtime.allowedMcpServers,
                memoryContext: runtime.memoryContext,
                pluginSkillsSection: runtime.pluginSkillsSection,
                recipesSection: runtime.recipesSection,
                recipeMatches: runtime.recipeMatches,
                configDir: this.plugin.app.vault.configDir,
                conversationId: this.activeConversationId ?? undefined,
            });
            // Persist the turn (assistant message taken from history tail).
            const tail = this.history[this.history.length - 1];
            if (tail !== undefined && tail.role === 'assistant') {
                const tailText = typeof tail.content === 'string'
                    ? tail.content
                    : Array.isArray(tail.content)
                        ? tail.content.map(c => (c as { type?: string; text?: string }).type === 'text' ? (c as { text?: string }).text ?? '' : '').join('')
                        : '';
                this.uiMessages.push({
                    role: 'assistant',
                    text: tailText,
                    ts: new Date().toISOString(),
                    taskId: this.sessionTaskId,
                });
            }
            await this.persistConversation(convStore);
            // Fire a workspace event so an open Sidebar / HistoryPanel
            // refreshes its conversation list immediately (the user
            // would otherwise have to close + reopen to see the new
            // inline-chat entry).
            try {
                const evt = new CustomEvent('vault-operator:conversation-list-changed', {
                    detail: { id: this.activeConversationId, source: 'inline-panel' },
                });
                this.plugin.app.workspace.containerEl.dispatchEvent(evt);
            } catch (e) {
                console.debug('[PanelChatController] dispatch refresh event failed:', e);
            }
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            args.handle.setStatus(`Error: ${err.message}`, 'error');
        } finally {
            this.running = false;
            this.abortController = null;
        }
    }

    /** Abort an in-flight turn (Stop button click, panel close, Esc). */
    abort(): void {
        if (this.abortController !== null) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.steeringQueue.length = 0;
        this.running = false;
    }

    dispose(): void { this.abort(); }

    /**
     * Persist a quick-action turn (Lookup / Translate / Summarize /
     * Rewrite / Find-Action-Items) to the same ConversationStore the
     * free-chat path uses. Quick-actions bypass the AgentTaskRunner
     * loop (they run via a single InlineLLMCaller stream in the
     * orchestrator), so they would otherwise never reach the history
     * list. This entry-point gives them parity: same store entry,
     * same history index, same conversation-id continuity across
     * subsequent free-chat turns within the panel session.
     */
    async recordQuickAction(args: {
        actionLabel: string;
        userText: string;
        assistantText: string;
    }): Promise<void> {
        if (this.isAtTurnCap() === true) {
            console.debug(`[PanelChatController] quick-action dropped: ${INLINE_TURN_CAP}-turn cap reached`);
            new Notice(`Inline chat reached ${INLINE_TURN_CAP}-turn cap; quick-action not recorded.`);
            return;
        }
        const convStore: ConversationStore | null = (this.plugin as { conversationStore?: ConversationStore | null }).conversationStore ?? null;
        if (convStore === null) {
            console.warn('[PanelChatController] recordQuickAction: no conversationStore');
            return;
        }
        const mode = this.modeService.getActiveMode();
        if (this.activeConversationId === null) {
            try {
                const modelKey = this.plugin.settings.activeModelKey;
                const model = this.plugin.settings.activeModels.find(m => getModelKey(m) === modelKey);
                const modelDisplay = model?.displayName ?? model?.name ?? modelKey ?? 'inline-chat';
                this.activeConversationId = await convStore.create(mode.slug, modelDisplay);
                this.sessionTaskId = `inline-${this.activeConversationId}`;
                console.debug(`[PanelChatController] quick-action conversation created: ${this.activeConversationId}`);
            } catch (e) {
                console.error('[PanelChatController] recordQuickAction create FAILED:', e);
                new Notice(`Inline chat: history create failed -- ${e instanceof Error ? e.message : String(e)}`);
                return;
            }
        }
        // Append-only: each quick-action becomes one user + one
        // assistant message pair in the same conversation. The user
        // bubble carries the action label + the selection so the
        // history reader sees WHAT was asked, not just the answer.
        const sel = this.ctx.selectionText.trim();
        const userBody = sel.length > 0
            ? `[${args.actionLabel}] ${args.userText.trim().length > 0 ? args.userText + '\n\n' : ''}Selection:\n${sel}`
            : `[${args.actionLabel}] ${args.userText}`;
        const ts = new Date().toISOString();
        this.uiMessages.push({ role: 'user', text: userBody, ts });
        this.uiMessages.push({ role: 'assistant', text: args.assistantText, ts, taskId: this.sessionTaskId });
        // Mirror into MessageParam[] so the LLM history is consistent
        // when the user follows up via the sidebar. Simple text-only
        // blocks -- no tool_use round-trips for quick-actions.
        this.history.push({ role: 'user', content: userBody });
        this.history.push({ role: 'assistant', content: args.assistantText });
        await this.persistConversation(convStore);
        try {
            const evt = new CustomEvent('vault-operator:conversation-list-changed', {
                detail: { id: this.activeConversationId, source: 'inline-panel-quick' },
            });
            this.plugin.app.workspace.containerEl.dispatchEvent(evt);
        } catch (e) {
            console.debug('[PanelChatController] dispatch quick-action refresh event failed:', e);
        }
    }

    private async persistConversation(
        convStore: ConversationStore | null,
    ): Promise<void> {
        if (convStore === null) {
            console.warn('[PanelChatController] persistConversation: no store');
            return;
        }
        if (this.activeConversationId === null) {
            console.warn('[PanelChatController] persistConversation: no activeConversationId');
            return;
        }
        if (this.uiMessages.length === 0) {
            console.warn('[PanelChatController] persistConversation: no uiMessages');
            return;
        }
        try {
            const snapshot = [...this.uiMessages];
            await convStore.save(this.activeConversationId, this.history, this.uiMessages);
            console.debug(`[PanelChatController] saved conversation ${this.activeConversationId} (${this.uiMessages.length} ui-msgs, ${this.history.length} history)`);
            const indexer = (this.plugin as unknown as { historyIndexer?: { onConversationSaved: (id: string, msgs: UiMessage[]) => Promise<void> | void } }).historyIndexer;
            if (indexer !== undefined) {
                void indexer.onConversationSaved(this.activeConversationId, snapshot);
            }
        } catch (e) {
            console.error('[PanelChatController] persistConversation FAILED:', e);
            new Notice(`Inline chat save failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private buildUserMessage(userInput: string): string | ContentBlock[] {
        const isFirstTurn = this.history.length === 0;
        const sel = this.ctx.selectionText.trim();
        const noteRef = this.ctx.notePath !== '' ? ` (from note: ${this.ctx.notePath})` : '';
        const baseText = (isFirstTurn === true && sel.length > 0)
            ? `<context>Selected text${noteRef}:\n${sel}</context>\n\n${userInput}`
            : userInput;

        const attHandler = this.getAttachments?.();
        const pending = attHandler?.pending ?? [];
        if (pending.length === 0) return baseText;

        // Sidebar pattern: images first, text + then text-file attachments.
        const blocks: ContentBlock[] = [];
        for (const a of pending) { if (a.block.type === 'image') blocks.push(a.block); }
        blocks.push({ type: 'text', text: baseText });
        for (const a of pending) { if (a.block.type === 'text') blocks.push(a.block); }
        // Clear pending so the next turn starts fresh.
        try { attHandler!.clear(); } catch { /* swallow */ }
        return blocks;
    }

    private buildCallbacks(handle: InlinePanelHandle, assistantBubbleId: string): AgentTaskCallbacks {
        return {
            onIterationStart: () => {},
            onText: (chunk) => handle.appendStreamChunk(assistantBubbleId, chunk),
            onThinking: () => {},
            onToolStart: (name) => { handle.setStatus(`Calling ${name}...`); },
            onToolResult: () => {},
            onComplete: () => { handle.setStatus('Done'); },
            onAttemptCompletion: () => {},
            onError: (err) => { handle.setStatus(`Error: ${err.message}`, 'error'); },
            // Drain queued steering messages so AgentTask appends them
            // as user-role messages at the start of the next iteration.
            consumeSteeringMessages: (_iteration) => {
                if (this.steeringQueue.length === 0) return [];
                const drained = this.steeringQueue.slice();
                this.steeringQueue.length = 0;
                return drained;
            },
        };
    }
}
