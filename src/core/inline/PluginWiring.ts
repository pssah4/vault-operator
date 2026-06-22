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

import { Component, MarkdownRenderer, MarkdownView, Menu, setIcon, type App, type WorkspaceLeaf } from 'obsidian';
import { getModelKey } from '../../types/settings';
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
// InlineChatAction + NoteWriter retired per EPIC-33 audit (wd39z8ehx) --
// the panel is now the only conversation surface, free-chat drives a real
// AgentTaskRunner loop in PanelChatController. No more fence writes to notes.
import { DefaultVaultRagPipeline, type SemanticIndexProbe } from './lookup/VaultRagPipeline';
import { EmbeddingCache } from './lookup/EmbeddingCache';
import { LookupEdgeAggregator } from './lookup/LookupEdgeAggregator';
import { InlineWebLookup } from './lookup/InlineWebLookup';
import { resolveInlineActionsSettings } from './inlineSettings';
import type { InlineLLMCaller, InlineLLMStreamArgs, InlineLLMStreamCallbacks } from './InlineLLMCaller';
import type { InlineSettingsSnapshot } from './InlineTriggerContext';
import { VIEW_TYPE_AGENT_SIDEBAR } from '../../ui/AgentSidebarView';
// SelectionWatcher: per user feedback (2026-06-22) NOT used in the default
// wiring -- auto-open-on-selection was blocking normal copy/read flows.
// The module stays available for callers that explicitly want it.
// import { SelectionWatcher } from './SelectionWatcher';
import { InlineSkillFilter, type SkillCapabilityProbe, type SkillEntry } from './skills/InlineSkillFilter';
import { InlineSkillAction } from './skills/InlineSkillAction';
import { inlineDiffExtension } from './diff/CodeMirrorDiffAdapter';
import { InlineChatOrchestrator, type EditorChatProbe } from './chat/InlineChatOrchestrator';

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
            // FIX-33-DV-01 (2026-06-22): editor.getCursor() returns the HEAD,
            // which for a forward selection is the END. The InlineEditApplier
            // writeBackToSelection needs the actual selection range, not
            // head+length. Read getCursor('from')/('to') explicitly.
            const fromPos = editor.getCursor('from');
            const toPos = editor.getCursor('to');
            const selectionFrom = editor.posToOffset(fromPos);
            const selectionTo = editor.posToOffset(toPos);
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
                selectionFrom,
                selectionTo,
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

function buildSemanticIndexProbe(plugin: ObsidianAgentPlugin): SemanticIndexProbe | null {
    // Live wiring over SemanticIndexService.embedTexts + VectorStore.searchUniqueFiles.
    // Returns null when either dependency is not initialised so LookupAction
    // falls back to LLM-only.
    interface SiHost {
        semanticIndex?: { embedTexts?: (texts: string[]) => Promise<Float32Array[]> } | null;
        vectorStore?: {
            searchUniqueFiles?: (q: Float32Array, topK: number, pathPrefix?: string) => Array<{ path: string; text: string; score: number }>;
        } | null;
    }
    const host = plugin as unknown as SiHost;
    const semantic = host.semanticIndex;
    const vectorStore = host.vectorStore;
    if (semantic === undefined || semantic === null) return null;
    if (vectorStore === undefined || vectorStore === null) return null;
    return {
        embedText: async (text: string) => {
            const fn = semantic.embedTexts;
            if (typeof fn !== 'function') return [];
            try {
                const [vec] = await fn.call(semantic, [text]);
                if (vec instanceof Float32Array) return Array.from(vec);
                return [];
            } catch (e) {
                console.debug('[inline-rag] embedText failed (LLM-only fallback):', e);
                return [];
            }
        },
        queryNoteVectors: async ({ embedding, topN }) => {
            const fn = vectorStore.searchUniqueFiles;
            if (typeof fn !== 'function' || embedding.length === 0) return [];
            try {
                const query = new Float32Array(embedding);
                const raw = fn.call(vectorStore, query, topN) as Array<{ path: string; text?: string; score?: number }>;
                return raw.map((r) => ({
                    notePath: r.path,
                    excerpt: r.text?.slice(0, 200),
                    cosineSimilarity: typeof r.score === 'number' ? r.score : 0,
                }));
            } catch (e) {
                console.debug('[inline-rag] queryNoteVectors failed (LLM-only fallback):', e);
                return [];
            }
        },
        // Multi-chunk probe (EPIC-33 Lookup-Enhancement). Bypasses
        // searchUniqueFiles (which dedupes per file) and reads the raw
        // chunk list directly so the pipeline can group + tier multiple
        // chunks per file with FULL chunk text (no 200-char slice).
        queryNoteChunks: async ({ embedding, topK }) => {
            const fnRaw = (vectorStore as { search?: (q: Float32Array, k: number) => Array<{ path: string; text?: string; score?: number; chunkIndex?: number }> }).search;
            if (typeof fnRaw !== 'function' || embedding.length === 0) return [];
            try {
                const query = new Float32Array(embedding);
                const raw = fnRaw.call(vectorStore, query, topK) as Array<{ path: string; text?: string; score?: number; chunkIndex?: number }>;
                return raw
                    .filter((r: { path: string }) => typeof r.path === 'string' && r.path.length > 0)
                    .map((r: { path: string; text?: string; score?: number; chunkIndex?: number }, idx: number) => ({
                        notePath: r.path,
                        chunkIndex: typeof r.chunkIndex === 'number' ? r.chunkIndex : idx,
                        text: typeof r.text === 'string' ? r.text : '',
                        cosineSimilarity: typeof r.score === 'number' ? r.score : 0,
                    }));
            } catch (e) {
                console.debug('[inline-rag] queryNoteChunks failed:', e);
                return [];
            }
        },
    };
}

/**
 * Wire internal-link click handlers on a freshly-rendered markdown
 * container so wikilinks navigate via workspace.openLinkText instead
 * of falling through as inert anchors. Mirrors the Sidebar pattern
 * (AgentSidebarView.wireInternalLinks).
 *
 * Special-case obsidian://vault-operator-chat?id=X URLs (chat-deep-
 * links from recall_memory / search_history) so the click routes
 * through plugin.openChatById -- otherwise the ":" in the protocol
 * scheme triggers a createFolder error in openLinkText.
 */
function wireInternalLinks(plugin: ObsidianAgentPlugin, containerEl: HTMLElement): void {
    containerEl.querySelectorAll('a').forEach((anchor) => {
        const href = anchor.getAttribute('href') ?? '';
        if (href.startsWith('obsidian://vault-operator-chat') || href.startsWith('obsidian://obsilo-chat')) {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const match = /[?&]id=([^&]+)/.exec(href);
                if (match) {
                    const id = decodeURIComponent(match[1]);
                    const opener = (plugin as unknown as { openChatById?: (id: string) => Promise<void> }).openChatById;
                    if (typeof opener === 'function') void opener.call(plugin, id);
                }
            });
            return;
        }
        if (href.length === 0) return;
        if (href.startsWith('http') === true || href.startsWith('mailto') === true) return;
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const linkText = anchor.getAttribute('data-href') ?? href;
            void plugin.app.workspace.openLinkText(linkText, '', false);
        });
    });
}

/**
 * Edge probe over Obsidian metadataCache + ImplicitConnectionService.
 * All four methods are sync per Obsidian-API; the EdgeProbe interface
 * uses sync signatures.
 */
function buildEdgeProbe(plugin: ObsidianAgentPlugin): import('./lookup/LookupEdgeAggregator').EdgeProbe {
    const app = plugin.app;
    const resolveFile = (path: string): import('obsidian').TFile | null => {
        const f = app.vault.getAbstractFileByPath(path);
        return f instanceof (require('obsidian').TFile) ? f as import('obsidian').TFile : null;
    };
    return {
        getOutgoing: (notePath) => {
            const file = resolveFile(notePath);
            if (file === null) return [];
            const cache = app.metadataCache.getFileCache(file);
            if (cache === null || cache === undefined) return [];
            const out: { targetPath: string }[] = [];
            const linkRefs = [...(cache.links ?? []), ...(cache.embeds ?? [])];
            for (const lc of linkRefs) {
                const resolved = app.metadataCache.getFirstLinkpathDest(lc.link, notePath);
                if (resolved !== null) {
                    out.push({ targetPath: resolved.path });
                }
            }
            return out;
        },
        getBacklinks: (notePath) => {
            const file = resolveFile(notePath);
            if (file === null) return [];
            const api = (app.metadataCache as unknown as { getBacklinksForFile?: (f: import('obsidian').TFile) => { data: Record<string, unknown[]> } }).getBacklinksForFile;
            if (typeof api !== 'function') return [];
            try {
                const bl = api.call(app.metadataCache, file);
                if (bl === undefined || bl === null) return [];
                return Object.keys(bl.data).map(sourcePath => ({ sourcePath }));
            } catch (e) {
                console.debug('[inline-edges] getBacklinks failed:', e);
                return [];
            }
        },
        getTags: (notePath) => {
            const file = resolveFile(notePath);
            if (file === null) return [];
            const cache = app.metadataCache.getFileCache(file);
            if (cache === null || cache === undefined) return [];
            const out: string[] = [];
            for (const t of cache.tags ?? []) {
                if (typeof t.tag === 'string') out.push(t.tag);
            }
            const fmTags = cache.frontmatter?.tags;
            if (Array.isArray(fmTags)) {
                for (const t of fmTags) if (typeof t === 'string') out.push(t);
            } else if (typeof fmTags === 'string') {
                out.push(fmTags);
            }
            return out;
        },
        getImplicitNeighbors: (notePath, limit) => {
            const svc = (plugin as unknown as { implicitConnectionService?: { getImplicitNeighbors?: (p: string, l: number) => { path: string; similarity: number }[] } }).implicitConnectionService;
            if (svc === undefined || svc === null) return [];
            const fn = svc.getImplicitNeighbors;
            if (typeof fn !== 'function') return [];
            try {
                return fn.call(svc, notePath, limit);
            } catch (e) {
                console.debug('[inline-edges] getImplicitNeighbors failed:', e);
                return [];
            }
        },
    };
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

/**
 * Build a SkillCapabilityProbe over the active SelfAuthoredSkillLoader.
 * The probe reads skill name + description from the loader and the
 * inline-capability mapping from settings (FEAT-33-08 ADR-141).
 * Returns an empty list when the loader is missing -- safe default.
 */
function buildSkillProbe(plugin: ObsidianAgentPlugin): SkillCapabilityProbe {
    interface LoaderHost {
        selfAuthoredSkillLoader?: { getAllSkills?: () => Array<{ name: string; description?: string }> } | null;
    }
    const host = plugin as unknown as LoaderHost;
    return {
        listSkills: (): SkillEntry[] => {
            const loader = host.selfAuthoredSkillLoader;
            if (loader === undefined || loader === null || typeof loader.getAllSkills !== 'function') return [];
            const skills = loader.getAllSkills();
            const caps = plugin.settings.inlineActions?.skillCapabilities ?? {};
            return skills.map((s): SkillEntry => ({
                id: s.name,
                label: s.name,
                description: s.description,
                capability: caps[s.name],
            }));
        },
    };
}

/**
 * Build action-aware callbacks for the legacy InlineActionService
 * trigger path (kept for /coding test wiring + command-palette dispatch
 * shortcuts that bypass the chat panel). The hot path goes through
 * InlineChatOrchestrator.openReviewAndApply which owns the new
 * EditReviewModal flow (EPIC-33 Diff-UX-refresh 2026-06-22). This
 * legacy factory keeps a no-op surface so action.execute() does not
 * crash when no panel handle is present.
 */
function buildActionAwareCallbacks(
    _plugin: ObsidianAgentPlugin,
    actionId: string,
    _ctx: import('./InlineTriggerContext').InlineTriggerContext,
): import('../AgentTask').AgentTaskCallbacks {
    return {
        onText: () => {},
        onToolStart: () => {},
        onToolResult: () => {},
        onComplete: () => {},
        onError: (err) => {
            console.warn(`[inline-action ${actionId}] error:`, err);
        },
    };
}

export interface InlineWiringResult {
    service: InlineActionService;
    orchestrator: InlineChatOrchestrator;
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
    const llmCaller = buildLLMCaller(plugin);
    const semProbe = buildSemanticIndexProbe(plugin);

    // Default action set. Translate / Summarize-length variants are
    // registered as multiple instances so the floating menu lists
    // each one explicitly (matches Notion AI sub-menu shape).
    registry.register(new SendToMainChatAction({ controller: sidebarCtl }));

    // EPIC-33 Lookup-Enhancement: per-panel-session embedding cache,
    // multi-chunk RAG with tier-based scoring, edge-aggregator over
    // metadataCache + ImplicitConnectionService, web-fallback via
    // WebSearchProvider (respects settings.webTools privacy gates).
    const embeddingCache = new EmbeddingCache({ capacity: 16 });
    const vaultRag: VaultRagPipeline | undefined = semProbe !== null
        ? new DefaultVaultRagPipeline({ probe: semProbe, embeddingCache })
        : undefined;
    const edgeAggregator = new LookupEdgeAggregator({ probe: buildEdgeProbe(plugin) });
    const webLookup = new InlineWebLookup({
        getWebSettings: () => {
            const w = plugin.settings.webTools;
            return {
                enabled: w?.enabled === true,
                provider: (w?.provider ?? 'none') as 'brave' | 'tavily' | 'none',
                braveApiKey: w?.braveApiKey ?? '',
                tavilyApiKey: w?.tavilyApiKey ?? '',
            };
        },
    });
    registry.register(new LookupAction({
        caller: llmCaller,
        vaultRagPipeline: vaultRag,
        edgeAggregator,
        webLookup,
        getRagSettings: () => {
            const r = resolveInlineActionsSettings(plugin.settings.inlineActions);
            return {
                enabled: r.vaultRagInLookup,
                confidenceThreshold: r.vaultRagConfidenceThreshold,
                showSourcesInTooltip: r.showVaultSourcesInTooltip,
                topN: 5,
                webFallbackEnabled: true,
            };
        },
    }));
    registry.register(new RewriteAction({ caller: llmCaller }));
    registry.register(new TranslateAction({ caller: llmCaller, targetLanguage: 'English' }));
    registry.register(new TranslateAction({ caller: llmCaller, targetLanguage: 'German' }));
    registry.register(new SummarizeAction({ caller: llmCaller, length: 'short' }));
    registry.register(new SummarizeAction({ caller: llmCaller, length: 'medium' }));
    registry.register(new FindActionItemsAction({ caller: llmCaller }));
    // free-chat / inline-chat: handled by PanelChatController (not the registry).

    // FEAT-33-08: Skills marked as inline-eligible via settings appear
    // in the floating menu. The user opts a skill in via the Settings
    // tab (skillCapabilities mapping). No-op when the loader is not yet
    // initialised or no skill has been opted in.
    const skillProbe = buildSkillProbe(plugin);
    const skillFilter = new InlineSkillFilter({
        probe: skillProbe,
        topN: resolveInlineActionsSettings(plugin.settings.inlineActions).skillsTopN,
    });
    const skillInvoker = async (skill: SkillEntry, _ctx: import('./InlineTriggerContext').InlineTriggerContext, cbs: import('../AgentTask').AgentTaskCallbacks): Promise<void> => {
        // Skill invocation through the existing invoke_skill tool is
        // deferred: the Skill-Engine needs a typed entry-point that
        // does not exist yet on the loader. For now, emit a stub
        // notice so the user sees the skill was triggered.
        cbs.onText(`[skill: ${skill.label}] invocation deferred -- wire SkillEngine.runSkill() to enable.`);
        cbs.onComplete();
    };
    // Register each currently-eligible skill at wire time. The list is
    // captured once; users adding skills later need to reload the plugin.
    for (const entry of skillProbe.listSkills()) {
        if (entry.capability?.eligible !== true) continue;
        registry.register(new InlineSkillAction({ entry, invoker: skillInvoker }));
    }

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
        buildActionCallbacks: (action, ctx) => buildActionAwareCallbacks(plugin, action.id, ctx),
    });

    // FEAT-33-03: register CodeMirror Diff-Decoration-Extension so
    // Rewrite-Action streams land as inline diff with Accept/Reject.
    try {
        plugin.registerEditorExtension(inlineDiffExtension());
    } catch (e) {
        console.debug('[inline-actions] inline-diff-extension registration failed (non-fatal):', e);
    }

    // EPIC-33 UX-refresh: trigger opens the InlineChatPanel directly.
    // The legacy InlineActionService.triggerMenu remains available via
    // wiring.service but is no longer the default surface -- panel
    // chat replaces the floating-menu + Notice-toast flow.
    const chatProbe: EditorChatProbe = {
        probe: () => editorProbe.probe(),
        getPanelContainer: () => editorProbe.getMenuContainer(),
        getPanelPosition: () => editorProbe.getMenuPosition(),
        writeBackToSelection: async ({ notePath, from, to, content }) => {
            const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (view === null) return false;
            if (view.file?.path !== notePath) return false;
            const editor = view.editor;
            try {
                const fromPos = editor.offsetToPos(from);
                const toPos = editor.offsetToPos(to);
                editor.replaceRange(content, fromPos, toPos);
                return true;
            } catch (e) {
                console.warn('[inline-wiring] writeBackToSelection failed:', e);
                return false;
            }
        },
    };
    const orchestrator = new InlineChatOrchestrator({
        plugin,
        editorProbe: chatProbe,
        registry,
        resolver,
        isEnabled: () => resolveInlineActionsSettings(plugin.settings.inlineActions).enabled,
        setIcon: (el, name) => setIcon(el, name),
        // Markdown rendering bridge: replaces the plain-text bubble with
        // rendered Obsidian markdown once the stream completes. Wikilinks
        // are wired through app.workspace.openLinkText so they navigate
        // to the target note in the active leaf instead of falling through
        // as inert anchors. Same pattern as AgentSidebarView.wireInternalLinks.
        renderMarkdown: async (containerEl, markdown) => {
            const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';
            const component = new Component();
            try {
                await MarkdownRenderer.render(plugin.app, markdown, containerEl, sourcePath, component);
                wireInternalLinks(plugin, containerEl);
            } finally {
                component.unload();
            }
        },
        showMoreMenu: (anchor, _ctx, _handle, dispatch) => {
            // Obsidian Menu with the secondary actions. Lookup is on
            // the toolbar (magnifier) so it does NOT appear here again.
            const menu = new Menu();
            menu.addItem(item => item
                .setTitle('Rewrite')
                .setIcon('pencil')
                .onClick(() => dispatch('rewrite')));
            menu.addItem(item => item
                .setTitle('Translate to English')
                .setIcon('languages')
                .onClick(() => dispatch('translate')));
            menu.addItem(item => item
                .setTitle('Summarize (medium)')
                .setIcon('file-text')
                .onClick(() => dispatch('summarize')));
            menu.addItem(item => item
                .setTitle('Find action items')
                .setIcon('check-square')
                .onClick(() => dispatch('find-action-items')));
            menu.addSeparator();
            menu.addItem(item => item
                .setTitle('Send selection to main chat')
                .setIcon('arrow-up-right')
                .onClick(() => dispatch('send-to-main')));
            menu.showAtMouseEvent({
                clientX: anchor.getBoundingClientRect().left,
                clientY: anchor.getBoundingClientRect().bottom,
            } as MouseEvent);
        },
        showPlusMenu: (anchor, _ctx, handle) => {
            // Mirrors AgentSidebarView.showPlusMenu (sidebar:636-664):
            // attach file, add vault file (@-link), insert skill /slug,
            // insert prompt #slug, insert workflow §slug. Picker
            // pop-ups are skipped here -- on-click prepends the prefix
            // form to the composer so the AgentTask slash-expansion
            // logic picks it up at send time (PanelChatController.sendTurn).
            const menu = new Menu();
            menu.addItem(item => item
                .setTitle('Attach file (Sidebar)')
                .setIcon('paperclip')
                .setDisabled(true)
                .onClick(() => { /* placeholder -- attachments live in sidebar surface for now */ }));
            menu.addSeparator();
            // Insert skill: list all enabled self-authored skills.
            const skills = (plugin as unknown as { selfAuthoredSkillLoader?: { getAllSkills: () => Array<{ name: string; description: string }> } }).selfAuthoredSkillLoader?.getAllSkills() ?? [];
            if (skills.length > 0) {
                const skillSub = new Menu();
                skills.forEach((s: { name: string; description: string }) => {
                    const slug = s.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                    skillSub.addItem(item => item
                        .setTitle(s.name)
                        .setIcon('sparkles')
                        .onClick(() => handle.insertIntoComposer(`/${slug}`, 'prepend')));
                });
                menu.addItem(item => item
                    .setTitle('Insert skill...')
                    .setIcon('sparkles')
                    .onClick((evt) => skillSub.showAtMouseEvent(evt as unknown as MouseEvent)));
            } else {
                menu.addItem(item => item.setTitle('No skills installed').setIcon('sparkles').setDisabled(true));
            }
            // Insert prompt: list custom prompts for the active mode.
            const activeMode = plugin.settings.currentMode;
            const prompts = (plugin.settings.customPrompts ?? []).filter((p: { enabled?: boolean; mode?: string }) =>
                p.enabled !== false && (p.mode === undefined || p.mode === activeMode || p.mode === '')
            );
            if (prompts.length > 0) {
                const promptSub = new Menu();
                prompts.forEach((p: { name: string; slug: string }) => {
                    promptSub.addItem(item => item
                        .setTitle(p.name)
                        .setIcon('message-square-quote')
                        .onClick(() => handle.insertIntoComposer(`#${p.slug}`, 'prepend')));
                });
                menu.addItem(item => item
                    .setTitle('Insert prompt...')
                    .setIcon('message-square-quote')
                    .onClick((evt) => promptSub.showAtMouseEvent(evt as unknown as MouseEvent)));
            } else {
                menu.addItem(item => item.setTitle('No prompts configured').setIcon('message-square-quote').setDisabled(true));
            }
            // Insert workflow: synchronously not available (loader is async); show stub.
            menu.addItem(item => item
                .setTitle('Insert workflow... (Sidebar)')
                .setIcon('workflow')
                .setDisabled(true));
            menu.showAtMouseEvent({
                clientX: anchor.getBoundingClientRect().left,
                clientY: anchor.getBoundingClientRect().bottom,
            } as MouseEvent);
        },
        showModelMenu: (anchor, _ctx, handle) => {
            // Mirrors AgentSidebarView.showModelMenu (sidebar:862-924):
            // list enabled activeModels, mark the current pick with a
            // check, write through to plugin.settings.activeModelKey,
            // refresh the model-button label.
            const enabled = plugin.settings.activeModels.filter(m => m.enabled !== false);
            const menu = new Menu();
            if (enabled.length === 0) {
                menu.addItem(item => item
                    .setTitle('No models enabled -- open Settings')
                    .setIcon('settings')
                    .onClick(() => {
                        plugin.app.setting?.open();
                    }));
            } else {
                const currentKey = plugin.settings.activeModelKey;
                enabled.forEach(model => {
                    const key = getModelKey(model);
                    const label = model.displayName ?? model.name;
                    menu.addItem(item => item
                        .setTitle(label)
                        .setChecked(currentKey === key)
                        .onClick(async () => {
                            plugin.settings.activeModelKey = key;
                            await plugin.saveSettings();
                            handle.setModelLabel(label, label);
                        }));
                });
            }
            menu.showAtMouseEvent({
                clientX: anchor.getBoundingClientRect().left,
                clientY: anchor.getBoundingClientRect().bottom,
            } as MouseEvent);
        },
        getInitialModelLabel: () => {
            const key = plugin.settings.activeModelKey;
            const model = plugin.settings.activeModels.find(m => getModelKey(m) === key);
            if (model !== undefined) {
                const label = model.displayName ?? model.name;
                return { label, tooltip: label };
            }
            return { label: 'Auto', tooltip: 'No model selected -- click to pick' };
        },
        // EPIC-33: sidebar AutocompleteHandler instantiated per panel
        // -- powers '/' (skills), '#' (prompts), '§' (workflows), '@'
        // (vault-file mentions). addVaultFile is a no-op in the panel:
        // attachments are sidebar-only, but '@'-mentions still render
        // as inline text references which the agent resolves via tools.
        autocompleteFactory: (textarea, inputArea) => {
            const { AutocompleteHandler } = require('../../ui/sidebar/AutocompleteHandler') as typeof import('../../ui/sidebar/AutocompleteHandler');
            return new AutocompleteHandler(
                plugin,
                plugin.app,
                () => textarea,
                () => inputArea,
                async (_file) => { /* panel has no attachment handler; mentions stay inline */ },
            );
        },
    });

    // Auto-Open-on-Selection per User-Feedback abgeschafft: nimmt die
    // Moeglichkeit fuer normale Markier-Aktionen weg (Kopieren, Lesen).
    // Trigger laeuft ab jetzt ausschliesslich ueber Hotkey (Cmd+Shift+I,
    // default in main.ts addCommand) oder Rechtsklick-Editor-Menu.
    skillFilter; // suppress unused warning (kept available for Settings UI consumers)

    return {
        service,
        orchestrator,
        dispose: () => {
            orchestrator.dispose();
            service.dispose();
        },
    };
}
