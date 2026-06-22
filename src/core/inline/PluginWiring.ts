/**
 * PluginWiring -- live Obsidian-API adapters for the Inline-Editor-AI layer (EPIC-33).
 *
 * Centralises every adapter that connects the Inline modules to the
 * Obsidian Plugin API so main.ts only needs a single call:
 *
 *   plugin.inlineActionService = wireInlineActions(plugin);
 *
 * Each adapter is small and intentionally defensive. When a probe
 * cannot resolve (no active editor, sidebar leaf missing, ...) it
 * returns null instead of throwing so the InlineActionService can
 * silently no-op.
 *
 * Related: ADR-138 (Sidebar-Independence wiring), PLAN-42 main.ts
 * wiring step.
 */

import { MarkdownView, type App, type WorkspaceLeaf } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { InlineActionRegistry } from './InlineActionRegistry';
import { InlineTriggerResolver } from './InlineTriggerResolver';
import { InlineFloatingMenu } from './InlineFloatingMenu';
import { InlineActionService, type EditorSelectionProbe } from './InlineActionService';
import type { ChatSidebarController } from './actions/SendToMainChatAction';
import { SendToMainChatAction } from './actions/SendToMainChatAction';
import { LookupAction, type VaultRagPipeline } from './actions/LookupAction';
import { RewriteAction } from './actions/RewriteAction';
import { TranslateAction } from './actions/TranslateAction';
import { SummarizeAction } from './actions/SummarizeAction';
import { FindActionItemsAction } from './actions/FindActionItemsAction';
import { InlineChatAction, type NoteWriter } from './chat/InlineChatAction';
import { DefaultVaultRagPipeline, type SemanticIndexProbe } from './lookup/VaultRagPipeline';
import { resolveInlineActionsSettings } from './inlineSettings';
import type { InlineLLMCaller, InlineLLMStreamArgs, InlineLLMStreamCallbacks } from './InlineLLMCaller';
import type { InlineSettingsSnapshot } from './InlineTriggerContext';
import { VIEW_TYPE_AGENT_SIDEBAR } from '../../ui/AgentSidebarView';

/**
 * Live editor probe. Reads MarkdownView -> editor.getSelection() and
 * computes the absolute char offset of the cursor.
 */
function buildEditorProbe(plugin: ObsidianAgentPlugin): EditorSelectionProbe {
    const app: App = plugin.app;
    return {
        probe: () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (view === null) return null;
            const editor = view.editor;
            const selection = editor.getSelection();
            const cursor = editor.getCursor();
            // Convert {line, ch} into absolute char offset.
            const cursorPos = editor.posToOffset(cursor);
            // Determine editor mode: 'source' / 'live-preview' / 'reading'.
            // Obsidian's MarkdownView.getMode() returns 'source' (incl. live-preview)
            // or 'preview'. We map 'preview' -> 'reading'.
            const obsMode = view.getMode();
            const editorMode = obsMode === 'preview'
                ? 'reading'
                // EDITORIAL: differentiate source vs live-preview via state if available.
                : (view.getState() as { source?: boolean } | undefined)?.source === true ? 'source' : 'live-preview';
            const notePath = view.file?.path ?? '';
            return {
                selectionText: selection ?? '',
                editorMode,
                cursorPos,
                notePath,
            };
        },
        getMenuContainer: () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            return view?.contentEl ?? null;
        },
        getMenuPosition: () => {
            // Best-effort: cursor-coords would require querying CodeMirror.
            // For Welle 1 we open near the view's content origin; the
            // floating-menu clamps to viewport so this stays usable.
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            const rect = view?.contentEl.getBoundingClientRect();
            if (rect === undefined) return { x: 100, y: 100 };
            return { x: rect.left + 40, y: rect.top + 40 };
        },
    };
}

function buildChatSidebarController(plugin: ObsidianAgentPlugin): ChatSidebarController {
    return {
        isOpen: () => plugin.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR).length > 0,
        open: async () => {
            await plugin.activateView();
        },
        insertContextChip: async ({ text, notePath }) => {
            // Light-weight wiring: invoke the existing sidebar leaf and
            // ask it to pre-populate its composer with the selection.
            const leaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR)[0] as WorkspaceLeaf | undefined;
            if (leaf === undefined) return;
            // The Sidebar-View does not expose a typed public API for
            // context injection yet. We use a CustomEvent so the
            // sidebar can listen and react without a hard import cycle.
            const evt = new CustomEvent('vault-operator:inline-send-to-chat', {
                detail: { text, notePath },
            });
            plugin.app.workspace.containerEl.dispatchEvent(evt);
        },
    };
}

function buildNoteWriter(plugin: ObsidianAgentPlugin): NoteWriter {
    const app = plugin.app;
    return {
        insertAtCursor: async ({ notePath, cursorPos, text }) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (view === null) return;
            if (view.file?.path !== notePath) return;
            const editor = view.editor;
            const from = editor.offsetToPos(cursorPos);
            editor.replaceRange(text, from, from);
        },
    };
}

/**
 * Builds an InlineLLMCaller backed by the plugin's active provider.
 * Defensive: returns onError when no apiHandler exists.
 */
function buildLLMCaller(plugin: ObsidianAgentPlugin): InlineLLMCaller {
    return {
        stream: async (args: InlineLLMStreamArgs, callbacks: InlineLLMStreamCallbacks): Promise<void> => {
            try {
                const api = plugin.apiHandler;
                if (api === null || api === undefined) {
                    callbacks.onError(new Error('No active provider'));
                    return;
                }
                const messages = [{ role: 'user' as const, content: args.userMessage }];
                for await (const chunk of api.createMessage(args.systemPrompt, messages, [])) {
                    if (chunk.type === 'text' && typeof chunk.text === 'string') {
                        callbacks.onText(chunk.text);
                    }
                }
                callbacks.onComplete();
            } catch (e) {
                const err = e instanceof Error ? e : new Error(String(e));
                callbacks.onError(err);
            }
        },
    };
}

function buildSemanticIndexProbe(_plugin: ObsidianAgentPlugin): SemanticIndexProbe | null {
    // Welle 1: SemanticIndex / VectorStore wiring deferred to a follow-up
    // session. The actual VectorStore.findNoteVectors signature takes a
    // filter object, not (embedding, topN), and SemanticIndexService
    // does not expose a public embedQuery method yet. Without the live
    // probe, LookupAction falls back to LLM-only -- the Vault-RAG
    // pipeline (FEAT-33-09) ships as a probe-ready module that the
    // plugin entry-point can wire up once the public API stabilises.
    return null;
}

function buildSettingsSnapshotProvider(plugin: ObsidianAgentPlugin): () => InlineSettingsSnapshot {
    return () => {
        const settings = plugin.settings;
        const activeKey = settings.activeModelKey;
        const activeModel = settings.activeModels.find(m => m.name === activeKey) ?? settings.activeModels[0];
        return {
            modelId: activeModel?.name ?? '',
            provider: activeModel?.provider ?? settings.defaultProvider ?? 'anthropic',
            skillIds: [],
            customPromptIds: [],
        };
    };
}

export interface InlineWiringResult {
    service: InlineActionService;
    dispose: () => void;
}

/**
 * One-shot wiring entry. Call from main.ts onload AFTER plugin.settings
 * and plugin.apiHandler have been initialised.
 */
export function wireInlineActions(plugin: ObsidianAgentPlugin): InlineWiringResult {
    const registry = new InlineActionRegistry();
    const resolver = new InlineTriggerResolver({
        getSettingsSnapshot: buildSettingsSnapshotProvider(plugin),
    });
    const editorProbe = buildEditorProbe(plugin);
    const sidebarCtl = buildChatSidebarController(plugin);
    const noteWriter = buildNoteWriter(plugin);
    const llmCaller = buildLLMCaller(plugin);
    const semProbe = buildSemanticIndexProbe(plugin);

    // Default action set. Translate / Summarize-length variants are
    // registered as multiple instances so the floating menu lists
    // each one explicitly (matches Notion AI sub-menu shape).
    registry.register(new SendToMainChatAction({ controller: sidebarCtl }));

    const vaultRag: VaultRagPipeline | undefined = semProbe !== null
        ? new DefaultVaultRagPipeline({ probe: semProbe })
        : undefined;
    registry.register(new LookupAction({
        caller: llmCaller,
        vaultRagPipeline: vaultRag,
        getRagSettings: () => {
            const r = resolveInlineActionsSettings(plugin.settings.inlineActions);
            return {
                enabled: r.vaultRagInLookup,
                confidenceThreshold: r.vaultRagConfidenceThreshold,
                showSourcesInTooltip: r.showVaultSourcesInTooltip,
                topN: 5,
            };
        },
    }));
    registry.register(new RewriteAction({ caller: llmCaller }));
    registry.register(new TranslateAction({ caller: llmCaller, targetLanguage: 'English' }));
    registry.register(new TranslateAction({ caller: llmCaller, targetLanguage: 'German' }));
    registry.register(new SummarizeAction({ caller: llmCaller, length: 'short' }));
    registry.register(new SummarizeAction({ caller: llmCaller, length: 'medium' }));
    registry.register(new FindActionItemsAction({ caller: llmCaller }));
    registry.register(new InlineChatAction({ caller: llmCaller, writer: noteWriter }));

    const service = new InlineActionService({
        editorProbe,
        registry,
        resolver,
        menuFactory: (onPick) => new InlineFloatingMenu({
            containerEl: editorProbe.getMenuContainer() ?? plugin.app.workspace.containerEl,
            registry,
            onPick,
        }),
        isEnabled: () => resolveInlineActionsSettings(plugin.settings.inlineActions).enabled,
        buildActionCallbacks: () => ({
            onText: (chunk) => { console.debug('[inline-action] text', chunk); },
            onToolStart: () => {},
            onToolResult: () => {},
            onComplete: () => {},
            onError: (err) => { console.warn('[inline-action] error', err); },
        }),
    });

    return {
        service,
        dispose: () => service.dispose(),
    };
}
