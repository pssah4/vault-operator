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
import type ObsidianAgentPlugin from '../../../main';
import type { InlineTriggerContext } from '../InlineTriggerContext';
import type { InlinePanelHandle } from './InlineChatPanel';

export interface PanelChatControllerOptions {
    plugin: ObsidianAgentPlugin;
    ctx: InlineTriggerContext;
}

export class PanelChatController {
    private readonly plugin: ObsidianAgentPlugin;
    private readonly ctx: InlineTriggerContext;
    private readonly modeService: ModeService;
    /**
     * In-memory chat history reused across turns (AgentTask mutates
     * in place). Mirrors AgentSidebarView.conversationHistory.
     */
    private readonly history: MessageParam[] = [];
    /** Mid-run user-typed messages, drained at the next iteration. */
    private readonly steeringQueue: string[] = [];
    private abortController: AbortController | null = null;
    private turnCounter = 0;
    private running = false;
    private modeServiceReady: Promise<void> | null = null;

    constructor(options: PanelChatControllerOptions) {
        this.plugin = options.plugin;
        this.ctx = options.ctx;
        // Own ModeService instance per controller. ModeService is
        // plugin-stateless (lazy toolRegistry access) so a fresh
        // instance is safe and the sidebar's instance stays unchanged.
        this.modeService = new ModeService(options.plugin);
    }

    get isRunning(): boolean { return this.running; }
    get isModeReady(): boolean { return this.modeServiceReady !== null; }

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
        const runtime = await buildAgentRuntimeContext(this.plugin, {
            userText: args.userInput,
            mode,
            isFirstMessage,
            activeConversationId: undefined,
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
            });
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

    private buildUserMessage(userInput: string): string | ContentBlock[] {
        const isFirstTurn = this.history.length === 0;
        const sel = this.ctx.selectionText.trim();
        if (isFirstTurn === false || sel.length === 0) {
            return userInput;
        }
        const noteRef = this.ctx.notePath !== '' ? ` (from note: ${this.ctx.notePath})` : '';
        return `<context>Selected text${noteRef}:\n${sel}</context>\n\n${userInput}`;
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
