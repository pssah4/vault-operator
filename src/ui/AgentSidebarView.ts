/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
import { ItemView, WorkspaceLeaf, setIcon, Menu, MarkdownRenderer, MarkdownView, Notice, TFile } from 'obsidian';
import type ObsidianAgentPlugin from '../main';
import { AgentTask } from '../core/AgentTask';
import { ModeService } from '../core/modes/ModeService';
import type { MessageParam, ContentBlock } from '../api/types';
import { getModelKey, getFirstEnabledModelKey, modelToLLMProvider } from '../types/settings';
import type { CustomModel } from '../types/settings';
import { buildApiHandler, buildApiHandlerForModel } from '../api/index';
import { ToolPickerPopover } from './sidebar/ToolPickerPopover';
import { McpServerPopover } from './sidebar/McpServerPopover';
import { ChatModelPickerPopover } from './sidebar/ChatModelPickerPopover';
import { resolveOverrideModel } from './sidebar/chatModelDropdown';
import {
    DEFAULT_THINKING_OVERRIDE,
    isExplicitThinkingOverride,
    resolveEffectiveThinkingEnabled,
    type ThinkingOverride,
} from './sidebar/thinkingOverride';
import {
    DEFAULT_EFFORT_OVERRIDE,
    resolveEffectiveEffort,
    thinkingSwitchIsOn,
    type EffortOverride,
} from './sidebar/effortOverride';
import { getModelEffortLevels, type EffortLevel } from '../types/model-registry';
import { providerConfigToCustomModel, resolveActiveProvider } from '../core/routing/tierResolution';
import { TOOL_METADATA } from '../core/tools/toolMetadata';
import { AttachmentHandler } from './sidebar/AttachmentHandler';
import type { AttachmentItem } from './sidebar/AttachmentHandler';
import { AutocompleteHandler } from './sidebar/AutocompleteHandler';
import { VaultFilePicker } from './sidebar/VaultFilePicker';
import { CommandPicker, type CommandPickerItem } from './sidebar/CommandPicker';
import { resolveObsidianDraggedFiles } from './sidebar/dragManagerBridge';
import { HistoryPanel } from './sidebar/HistoryPanel';
import type { UiMessage } from '../core/history/ConversationStore';
import { MemoryRetriever } from '../core/memory/MemoryRetriever';
import { OnboardingService } from '../core/memory/OnboardingService';
import { isActiveOnboardingFlow } from '../core/onboarding-status';
import { ContextTracker } from '../core/context/ContextTracker';
import { TaskMonitor } from './sidebar/TaskMonitor';
import { ContextDisplay } from './sidebar/ContextDisplay';
import { CondensationFeedback } from './sidebar/CondensationFeedback';
import { SuggestionBanner } from './sidebar/SuggestionBanner';
import { OnboardingFlow } from './sidebar/OnboardingFlow';
import { scan as scanTasks } from '../core/tasks/TaskExtractor';
import { TaskNoteCreator } from '../core/tasks/TaskNoteCreator';
import { TaskNotesAdapter } from '../core/tasks/TaskNotesAdapter';
import { TaskSelectionModal } from './TaskSelectionModal';
import { t } from '../i18n';

export const VIEW_TYPE_AGENT_SIDEBAR = 'obsidian-agent-sidebar';

/**
 * Agent Sidebar View
 *
 * Matches Kilo Code's UI/UX patterns:
 * - Clean header with title + New Chat button
 * - Scrollable messages area with Markdown rendering
 * - Chat input with integrated toolbar (mode, settings, send/stop)
 * - Persistent conversation history across messages
 * - Cancel running requests
 */
export class AgentSidebarView extends ItemView {
    plugin: ObsidianAgentPlugin;
    private modeService!: ModeService;
    private chatContainer: HTMLElement | null = null;
    private inputArea: HTMLElement | null = null;
    private textarea: HTMLTextAreaElement | null = null;
    // Note: modeButton was removed in FEAT-26-05; chat-header has no mode UI anymore.
    private modelButton: HTMLButtonElement | null = null;
    /**
     * EPIC-26 / FEAT-26-05: per-turn chat-header override.
     * null  -> Auto (advisor pattern, tier-resolved main loop)
     * string -> explicit model id on the active provider (advisor off for this turn)
     * Reset to null when the active provider changes.
     */
    private chatModelOverride: string | null = null;
    /**
     * Per-conversation extended-thinking override (issue #44).
     * 'follow' -> use the active model's own thinkingEnabled (default, no change)
     * 'on'/'off' -> force thinking on/off for this conversation only.
     * Lives alongside chatModelOverride; reset to 'follow' on a fresh chat.
     */
    private chatThinkingOverride: ThinkingOverride = DEFAULT_THINKING_OVERRIDE;
    /**
     * Per-conversation reasoning-effort override.
     * 'auto' -> send no effort field (default, byte-identical to today).
     * A native level -> request that effort level. Threaded on every
     * model-resolution path the thinking override uses (chat-pin, mode,
     * default-active), so it works in auto mode too. Applied to the main-loop
     * model only; router tier-swaps to the budget helper or frontier do not
     * carry it, the same accepted limitation as the thinking override.
     * Lives alongside chatModelOverride; reset to 'auto' on a fresh chat.
     */
    private chatEffortOverride: EffortOverride = DEFAULT_EFFORT_OVERRIDE;
    /** EPIC-26 / FEAT-26-05: searchable popover for picking the chat-header model. */
    private chatModelPicker: ChatModelPickerPopover | null = null;
    private sendButton: HTMLElement | null = null;
    private stopButton: HTMLElement | null = null;
    private contextBadgeContainer: HTMLElement | null = null;

    // Feature 1: Persistent conversation history (survives across messages)
    private conversationHistory: MessageParam[] = [];
    // Chat History: active conversation tracking + UI messages for persistence
    private activeConversationId: string | null = null;
    private uiMessages: UiMessage[] = [];
    private historyPanel: HistoryPanel | null = null;

    // Feature 3: AbortController for cancelling in-flight requests
    private currentAbortController: AbortController | null = null;

    // FEAT-24-08 / ADR-114 Steering-Hook: user-typed mid-run messages
    // queue up while a task is running and get drained by AgentTask at the
    // start of the next iteration via consumeSteeringMessages. The bubbleEl
    // reference lets the sidebar flip the UI from "queued" to
    // "delivered at iteration N" the moment AgentTask consumes the entry.
    private steeringQueue: Array<{ text: string; bubbleEl: HTMLElement }> = [];

    // Context: tracks whether user dismissed the auto-injected file for this turn
    private userDismissedContext = false;
    // Last user message text — used by "Regenerate" action
    private lastUserMessage = '';
    // Last known active MarkdownView — tracked because clicking sidebar loses getActiveViewOfType
    private lastMarkdownView: MarkdownView | null = null;
    // Hidden message flag — when true, skip user bubble rendering but still send to LLM
    private nextMessageHidden = false;
    // Onboarding key-setup state machine (chat-based flow, no LLM needed)
    private onboarding: OnboardingFlow | null = null;

    // Health badge (FEATURE-1901)
    private healthBadge: HTMLElement | null = null;
    // Browser-style chat navigation: linear stack of conversation IDs the user
    // visited via arrow nav. navIndex = position in the stack; entries beyond
    // the index are the forward history (truncated when a fresh chat is loaded
    // from outside the back/forward path). null sentinel = "new/empty chat".
    private navStack: Array<string | null> = [];
    private navIndex = -1;
    private navBackBtn: HTMLButtonElement | null = null;
    private navForwardBtn: HTMLButtonElement | null = null;
    // Tool picker (pocket-knife button)
    private toolPickerButton: HTMLElement | null = null;
    // Web search toggle button (globe icon)
    private webToggleButton: HTMLElement | null = null;
    /** Manages tool/skill/workflow picker */
    private toolPicker!: ToolPickerPopover;
    /** Manages MCP server picker (opened from the "+" menu) */
    private mcpPicker!: McpServerPopover;
    /** Manages pending attachments and chip bar UI */
    private attachments!: AttachmentHandler;
    /** Manages / and @ autocomplete dropdown */
    private autocomplete!: AutocompleteHandler;
    /** Vault file picker popover (@ button) */
    private vaultFilePicker!: VaultFilePicker;
    /** Context tracking for condensing */
    private contextTracker: ContextTracker | null = null;
    /** Context window visualization */
    private contextDisplay: ContextDisplay | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: ObsidianAgentPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.modeService = new ModeService(plugin);
        this.toolPicker = new ToolPickerPopover(plugin, this.modeService);
        this.mcpPicker = new McpServerPopover(plugin);
        this.vaultFilePicker = new VaultFilePicker(
            this.app,
            async (files) => { for (const f of files) await this.attachments.addVaultFile(f); },
        );
    }

    getViewType(): string {
        return VIEW_TYPE_AGENT_SIDEBAR;
    }

    getDisplayText(): string {
        return t('ui.sidebar.title');
    }

    getIcon(): string {
        return 'square-slash';
    }

    async onOpen(): Promise<void> {
        // BUG-026 (2026-04-19): wait for plugin.doLoad() to finish before
        // reading settings / mode service. Obsidian instantiates this view
        // the moment registerView runs (layout restore), which during a BRAT
        // hot reload is before settings exist. Without this guard the view
        // threw "Cannot read properties of undefined (reading 'currentMode')"
        // and the whole sidebar stayed broken.
        const readiness = (this.plugin as unknown as { readyPromise?: Promise<void> }).readyPromise;
        if (readiness) {
            try { await readiness; } catch { /* doLoad errors are surfaced elsewhere; keep rendering */ }
        }

        // Initialize ModeService — loads global modes from ~/.obsidian-agent/modes.json
        await this.modeService.initialize();

        const container = this.containerEl.children[1];
        if (!(container != null && container.instanceOf(HTMLElement))) return;
        container.empty();
        container.addClass('obsidian-agent-sidebar');

        // Initialize context tracker with current model's context window
        try {
            const currentModeSlug = this.modeService.getActiveMode().slug;
            const modeModelKey = this.resolveEnabledModelKey(currentModeSlug);
            const resolvedModel = this.plugin.settings.activeModels.find((m) => getModelKey(m) === modeModelKey);

            if (resolvedModel) {
                const apiHandler = buildApiHandlerForModel(resolvedModel);
                const model = apiHandler.getModel();
                const contextWindow = model?.info?.contextWindow ?? 200_000;
                const maxTokens = resolvedModel?.maxTokens;
                this.contextTracker = new ContextTracker(contextWindow, maxTokens);
            } else {
                // Fallback if no model is configured
                this.contextTracker = new ContextTracker(200_000, 8192);
            }
        } catch (e) {
            console.debug('[AgentSidebarView] Failed to initialize context tracker:', e);
            this.contextTracker = new ContextTracker(200_000, 8192);
        }

        this.buildHeader(container);
        this.buildChatContainer(container);
        this.buildSuggestionBanner(container);
        this.buildChatInput(container);
        this.buildAiDisclaimer(container);

        // Feature 4: Update context badge when user switches files; reset dismiss on new file
        // Also track last active MarkdownView so "Insert at cursor" works from sidebar
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                this.userDismissedContext = false;
                this.updateContextBadge();
                if (leaf?.view instanceof MarkdownView) {
                    this.lastMarkdownView = leaf.view;
                }
            })
        );
        this.registerEvent(
            this.app.workspace.on('file-open', () => {
                this.userDismissedContext = false;
                this.updateContextBadge();
            })
        );

        this.showWelcomeMessage();
    }

    onClose(): Promise<void> {
        this.currentAbortController?.abort();
        // Guard every call: onClose may run before onOpen completed if plugin init failed upstream
        try { this.saveCurrentConversation(); } catch { /* non-fatal */ }
        try { this.enqueueMemoryExtraction(); } catch { /* non-fatal */ }
        this.attachments?.clear();
        return Promise.resolve();
    }

    private buildHeader(container: HTMLElement): void {
        const header = container.createDiv('agent-header');

        const titleRow = header.createDiv('agent-title');
        titleRow.createSpan({
            cls: 'agent-title-wordmark',
            text: '/ Vault Operator',
        });

        const headerRight = header.createDiv('agent-header-right');

        // FEATURE-1901 / BUG-025 (2026-04-19): vault-health indicator moved from
        // next-to-title to left-of-settings in the header-right group, and the
        // severity dot replaced with a `stethoscope` lucide icon. Hidden unless
        // at least one finding exists. Colour comes from the severity-* class
        // via styles.css.
        this.healthBadge = headerRight.createEl('button', {
            cls: 'header-button health-badge',
            attr: { 'aria-label': t('ui.sidebar.vaultHealth') },
        });
        setIcon(this.healthBadge.createSpan('toolbar-icon'), 'stethoscope');
        this.healthBadge.classList.add('agent-u-hidden');
        this.healthBadge.addEventListener('click', () => {
            this.openHealthModal();
        });
        // Sync from the plugin in case the health check already ran before the
        // view mounted (common after a BRAT hot-reload or leaf rebuild).
        this.syncHealthBadge();

        // Settings button — moved here from toolbar
        const settingsBtn = headerRight.createEl('button', {
            cls: 'header-button',
            attr: { 'aria-label': t('ui.sidebar.settings') },
        });
        setIcon(settingsBtn.createSpan('toolbar-icon'), 'settings');
        settingsBtn.addEventListener('click', () => {
            this.app.setting?.open();
            // Navigate to plugin tab after modal is rendered (200ms is robust for most machines)
            window.setTimeout(() => this.app.setting?.openTabById(this.plugin.manifest.id), 200);
        });

        // History button — opens conversation history panel
        const historyBtn = headerRight.createEl('button', {
            cls: 'header-button',
            attr: { 'aria-label': t('ui.sidebar.chatHistory') },
        });
        setIcon(historyBtn.createSpan('toolbar-icon'), 'history');
        historyBtn.addEventListener('click', () => {
            this.ensureHistoryPanel();
            this.historyPanel?.toggle();
        });

        // FEATURE-0318: Save-to-memory is exposed via the chat input "..." menu
        // (Save conversation to memory) and via the per-row star in the
        // history panel. The header had a duplicate star toggle that confused
        // the visual language of "filled = in memory" -- removed.

        // New Chat button — clears conversation history
        const newChatBtn = headerRight.createEl('button', {
            cls: 'header-button',
            attr: { 'aria-label': t('ui.sidebar.newChat') },
        });
        setIcon(newChatBtn.createSpan('toolbar-icon'), 'message-square-plus');
        newChatBtn.addEventListener('click', () => this.clearConversation());

        // Browser-style back/forward through recently opened chats. Sit on
        // the far right of the header so the arrow cluster doesn't compete
        // with the primary controls. Triangles (chevron-left/right) read
        // better than full arrows in the narrow sidebar.
        this.navBackBtn = headerRight.createEl('button', {
            cls: 'header-button header-button--nav',
            attr: { 'aria-label': 'Previous chat' },
        });
        setIcon(this.navBackBtn.createSpan('toolbar-icon'), 'chevron-left');
        this.navBackBtn.addEventListener('click', () => { void this.navBack(); });

        this.navForwardBtn = headerRight.createEl('button', {
            cls: 'header-button header-button--nav',
            attr: { 'aria-label': 'Next chat' },
        });
        setIcon(this.navForwardBtn.createSpan('toolbar-icon'), 'chevron-right');
        this.navForwardBtn.addEventListener('click', () => { void this.navForward(); });

        this.updateNavButtons();
    }

    private buildChatContainer(container: HTMLElement): void {
        // Chat container is wrapped in a relative parent so the history panel can overlay it
        const chatWrapper = container.createDiv('chat-wrapper');

        this.chatContainer = chatWrapper.createDiv('chat-messages');

        // History panel (absolute overlay inside the wrapper)
        const store = this.plugin.conversationStore;
        if (store) {
            this.historyPanel = new HistoryPanel(
                store,
                (id) => { void this.loadConversation(id); },
                (id) => { void this.deleteConversation(id); },
                (convId, title) => { void this.stampChatLinkToActiveFile(convId, title); },
                this.activeConversationId,
                (id, title) => this.saveHistoryConversationToMemory(id, title),
                (id, title) => this.removeHistoryConversationFromMemory(id, title),
                (id) => this.plugin.countMemoryFactsForConversation(id) > 0,
                (id, currentTitle) => this.renameHistoryConversation(id, currentTitle),
                (id, title) => this.confirmPendingConversation(id, title),
            );
            this.historyPanel.mount(chatWrapper);
        }
    }

    /**
     * Lazy-initialize the history panel. Needed because onOpen() may run before
     * doLoad() finishes (Obsidian restores the sidebar layout synchronously),
     * so conversationStore can be null when buildChatContainer() first runs.
     */
    private ensureHistoryPanel(): void {
        if (this.historyPanel) return;
        const store = this.plugin.conversationStore;
        const chatWrapper = this.chatContainer?.parentElement;
        if (!store || !chatWrapper) return;
        this.historyPanel = new HistoryPanel(
            store,
            (id) => { void this.loadConversation(id); },
            (id) => { void this.deleteConversation(id); },
            (convId, title) => { void this.stampChatLinkToActiveFile(convId, title); },
            this.activeConversationId,
            (id, title) => this.saveHistoryConversationToMemory(id, title),
            (id, title) => this.removeHistoryConversationFromMemory(id, title),
            (id) => this.plugin.countMemoryFactsForConversation(id) > 0,
            (id, currentTitle) => this.renameHistoryConversation(id, currentTitle),
        );
        this.historyPanel.mount(chatWrapper);
    }

    private suggestionBanner: SuggestionBanner | null = null;

    /** Mount the suggestion banner (delegates to SuggestionBanner module). */
    private buildSuggestionBanner(container: HTMLElement): void {
        this.suggestionBanner = new SuggestionBanner(this.plugin, this.app);
        this.suggestionBanner.mount(container, (fn) => this.register(fn));
    }

    private buildAiDisclaimer(container: HTMLElement): void {
        const disclaimer = container.createDiv({ cls: 'chat-ai-disclaimer' });
        disclaimer.setText('Vault Operator is AI and can make mistakes. Please double-check responses.');
    }

    private buildChatInput(container: HTMLElement): void {
        this.inputArea = container.createDiv('chat-input-container');
        const inputWrapper = this.inputArea.createDiv('chat-input-wrapper');

        // Context chips at the top of the input wrapper (like Kilo Code)
        this.contextBadgeContainer = inputWrapper.createDiv('chat-context-chips');
        this.updateContextBadge();

        // Attachment chip bar (below context chips, above textarea)
        const chipBar = inputWrapper.createDiv('chat-attachment-chips');
        this.attachments = new AttachmentHandler(this.app.vault, chipBar, this.plugin);

        this.textarea = inputWrapper.createEl('textarea', {
            cls: 'chat-textarea',
            attr: { placeholder: t('ui.sidebar.placeholder'), rows: '3' },
        });

        // Initialize autocomplete handler after textarea is created
        this.autocomplete = new AutocompleteHandler(
            this.plugin,
            this.app,
            () => this.textarea,
            () => this.inputArea,
            (file) => this.attachments.addVaultFile(file),
        );

        this.textarea.addEventListener('input', () => {
            this.autoResizeTextarea();
            void this.autocomplete.handleInput();
            // FEAT-24-08 Steering: toggle Stop -> Send when user starts typing
            // mid-run (and back to Stop when textarea is cleared).
            this.refreshRunStateButtons();
        });

        this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            // Autocomplete navigation takes priority
            if (this.autocomplete.handleKeyDown(e)) return;

            if (e.key === 'Enter') {
                const sendWithEnter = this.plugin.settings.sendWithEnter ?? true;
                if (sendWithEnter && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    void this.handleSendMessage();
                } else if (!sendWithEnter && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void this.handleSendMessage();
                }
            }
        });

        // Paste handler — capture images pasted from clipboard (e.g. screenshots)
        this.textarea.addEventListener('paste', (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
                if (item.kind === 'file') {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) void this.attachments.processFile(file);
                }
            }
        });

        // Drag-and-drop handler on the input wrapper. BUG-019: stopPropagation
        // is required on both events so the workspace doesn't steal the drop
        // and open the file in a new tab. The drop payload is resolved in
        // priority order: external OS files, Obsidian's internal drag manager,
        // finally a plain-text path fallback for older Obsidian builds.
        inputWrapper.addEventListener('dragover', (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            inputWrapper.addClass('drag-over');
        });
        inputWrapper.addEventListener('dragleave', () => inputWrapper.removeClass('drag-over'));
        inputWrapper.addEventListener('drop', (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            inputWrapper.removeClass('drag-over');

            // OS file drop (external drag from Finder/Explorer/GNOME-Files)
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                for (const file of Array.from(files)) void this.attachments.processFile(file);
                return;
            }

            // BUG-019: Obsidian's internal drag populates app.dragManager.draggable
            // instead of dataTransfer.files. This is undocumented but stable across
            // Obsidian 1.4+ and widely used by community plugins. Guarded by a
            // null-check so a future API change silently falls through to the
            // text/plain path.
            const draggedFiles = resolveObsidianDraggedFiles(this.app);
            if (draggedFiles.length > 0) {
                for (const file of draggedFiles) void this.attachments.addVaultFile(file);
                return;
            }

            // Last-resort fallback: plain-text vault-relative path.
            const textData = e.dataTransfer?.getData('text/plain');
            if (textData) {
                const vaultFile = this.app.vault.getAbstractFileByPath(textData);
                if (vaultFile instanceof TFile) {
                    void this.attachments.addVaultFile(vaultFile);
                }
            }
        });

        const toolbar = inputWrapper.createDiv('chat-toolbar');
        const toolbarLeft = toolbar.createDiv('chat-toolbar-left');
        const toolbarRight = toolbar.createDiv('chat-toolbar-right');

        // EPIC-26 / FEAT-26-05: Mode switcher removed from the chat header.
        // 2026-05-18: the Agent/Mode-Button in the chat header is gone
        // (FEAT-26-05). Agent management lives in Settings -> Agents.
        // The mode backend stays functional: `currentMode` setting,
        // ModeService, `switch_agent` tool are unchanged.

        // Model button (left, after mode)
        this.modelButton = toolbarLeft.createEl('button', {
            cls: 'toolbar-button model-button',
            attr: { 'aria-label': t('ui.sidebar.selectModel') },
        });
        this.updateModelButton();
        this.modelButton.addEventListener('click', (e) => this.showModelMenu(e));

        // "+" button — context menu for adding files/notes (FEATURE-1907)
        const plusBtn = toolbarLeft.createEl('button', {
            cls: 'toolbar-button toolbar-ghost plus-button',
            attr: { 'aria-label': t('ui.sidebar.addContext') },
        });
        setIcon(plusBtn.createSpan('toolbar-icon'), 'plus');
        plusBtn.addEventListener('click', (e) => {
            this.showPlusMenu(e, plusBtn);
        });

        // "..." button — tools, skills, web search (FEATURE-1907)
        const ellipsisBtn = toolbarLeft.createEl('button', {
            cls: 'toolbar-button toolbar-ghost ellipsis-button',
            attr: { 'aria-label': t('ui.sidebar.moreOptions') },
        });
        setIcon(ellipsisBtn.createSpan('toolbar-icon'), 'ellipsis');
        ellipsisBtn.addEventListener('click', (e) => {
            const menu = new Menu();
            // Tools & Skills — opens existing ToolPicker
            menu.addItem(item => item
                .setTitle(t('ui.sidebar.selectTools'))
                .setIcon('pocket-knife')
                .onClick(() => this.toolPicker.show(e, ellipsisBtn, this.containerEl)));
            // Web search toggle
            const webEnabled = this.plugin.settings.webTools?.enabled ?? false;
            menu.addItem(item => item
                .setTitle(webEnabled ? t('ui.sidebar.webSearchOn') : t('ui.sidebar.webSearchOff'))
                .setIcon('globe')
                .onClick(() => { void this.toggleWebSearch(); }));
            // Save to memory (FEATURE-0318 manual trigger -- bypasses throttle + auto toggle)
            menu.addItem(item => item
                .setTitle(t('ui.sidebar.saveToMemory'))
                .setIcon('star')
                .onClick(() => { void this.handleSaveToMemory(); }));
            menu.addSeparator();
            // Original options menu items
            this.addOptionsMenuItems(menu);
            menu.showAtMouseEvent(e);
        });

        // Keep references for backward compat (hidden, managed via "..." menu now)
        this.toolPickerButton = ellipsisBtn;
        this.webToggleButton = ellipsisBtn;

        // Feature 3: Stop button (hidden by default, shown when task is running)
        this.stopButton = toolbarRight.createEl('button', {
            cls: 'toolbar-button stop-button',
            attr: { 'aria-label': t('ui.sidebar.stop') },
        });
        setIcon(this.stopButton.createSpan('toolbar-icon'), 'square');
        this.stopButton.classList.add('agent-u-hidden');
        this.stopButton.addEventListener('click', () => this.handleStop());

        // Send button
        this.sendButton = toolbarRight.createEl('button', {
            cls: 'toolbar-button send-button',
            attr: { 'aria-label': t('ui.sidebar.send') },
        });
        setIcon(this.sendButton.createSpan('toolbar-icon'), 'send-horizontal');
        this.sendButton.addEventListener('click', () => { void this.handleSendMessage(); });
    }

    /**
     * `+` menu (FEATURE-2207 / 2208): attachments, skills, prompts, workflows.
     * Picking a skill/prompt/workflow prefixes the textarea with the right
     * trigger and focuses the input so the user can add free text.
     */
    private showPlusMenu(e: MouseEvent, anchor: HTMLElement): void {
        const menu = new Menu();
        menu.addItem(item => item
            .setTitle(t('ui.sidebar.attachFile'))
            .setIcon('paperclip')
            .onClick(() => this.attachments.openFilePicker()));
        menu.addItem(item => item
            .setTitle(t('ui.sidebar.addVaultFile'))
            .setIcon('at-sign')
            .onClick(() => this.vaultFilePicker.show(anchor, this.containerEl)));
        menu.addSeparator();
        menu.addItem(item => item
            .setTitle('Insert skill...')
            .setIcon('sparkles')
            .onClick(() => this.openCommandPicker('skills', anchor)));
        menu.addItem(item => item
            .setTitle('Insert prompt...')
            .setIcon('message-square-quote')
            .onClick(() => this.openCommandPicker('prompts', anchor)));
        menu.addItem(item => item
            .setTitle('Insert workflow...')
            .setIcon('workflow')
            .onClick(() => this.openCommandPicker('workflows', anchor)));
        menu.addSeparator();
        menu.addItem(item => item
            .setTitle(t('ui.sidebar.selectMcpServers'))
            .setIcon('plug-2')
            .onClick(() => this.mcpPicker.show(e, anchor, this.containerEl)));
        menu.showAtMouseEvent(e);
    }

    private async openCommandPicker(
        category: 'skills' | 'prompts' | 'workflows',
        anchor: HTMLElement,
    ): Promise<void> {
        const items = await this.collectCommandItems(category);
        const title = category === 'skills'
            ? 'Search skills...'
            : category === 'prompts'
                ? 'Search prompts...'
                : 'Search workflows...';
        const empty = category === 'skills'
            ? 'No skills installed. Import one via Settings -> Skills.'
            : category === 'prompts'
                ? 'No custom prompts configured yet.'
                : 'No workflows available in this vault.';
        const picker = new CommandPicker(items, title, empty);
        picker.show(anchor, this.containerEl);
    }

    private async collectCommandItems(
        category: 'skills' | 'prompts' | 'workflows',
    ): Promise<CommandPickerItem[]> {
        if (category === 'skills') {
            const skills = this.plugin.selfAuthoredSkillLoader?.getAllSkills() ?? [];
            return skills.map((skill) => {
                const slug = AutocompleteHandler.slugifySkillName(skill.name);
                return {
                    label: skill.name,
                    sub: `/${slug}`,
                    tag: 'Skill',
                    icon: 'sparkles',
                    searchable: skill.description,
                    onSelect: () => this.insertPrefixedCommand('/', slug),
                };
            });
        }

        if (category === 'prompts') {
            const activeMode = this.plugin.settings.currentMode;
            const prompts = (this.plugin.settings.customPrompts ?? []).filter(
                (p) => p.enabled !== false && (!p.mode || p.mode === activeMode),
            );
            return prompts.map((prompt) => ({
                label: prompt.name,
                sub: `#${prompt.slug}`,
                tag: 'Prompt',
                icon: 'message-square-quote',
                searchable: prompt.content,
                onSelect: () => this.insertPrefixedCommand('#', prompt.slug),
            }));
        }

        const workflowLoader = this.plugin.workflowLoader;
        if (!workflowLoader) return [];
        const workflows = await workflowLoader.discoverWorkflows();
        const toggles = this.plugin.settings.workflowToggles ?? {};
        return workflows
            .filter((w) => toggles[w.path] !== false)
            .map((wf) => ({
                label: wf.displayName,
                sub: `\u00a7${wf.slug}`,
                tag: 'Workflow',
                icon: 'workflow',
                onSelect: () => this.insertPrefixedCommand('\u00a7', wf.slug),
            }));
    }

    private insertPrefixedCommand(prefix: string, slug: string): void {
        if (!this.inputArea) return;
        const textarea = this.inputArea.querySelector('textarea');
        if (!(textarea instanceof HTMLTextAreaElement)) return;
        const existing = textarea.value;
        const leadsWithPrefix = /^[/#\u00a7]/.test(existing);
        const body = leadsWithPrefix ? existing.split(/\s+/).slice(1).join(' ') : existing;
        textarea.value = `${prefix}${slug}${body ? ' ' + body : ' '}`;
        textarea.focus();
        const pos = textarea.value.length;
        textarea.setSelectionRange(pos, pos);
    }

    private updateContextBadge(): void {
        if (!this.contextBadgeContainer) return;
        this.contextBadgeContainer.empty();

        if (!this.plugin.settings.autoAddActiveFileContext) return;

        const activeFile = this.userDismissedContext ? null : this.app.workspace.getActiveFile();
        if (activeFile) {
            const chip = this.contextBadgeContainer.createDiv('chat-context-chip');
            chip.title = activeFile.path;
            setIcon(chip.createSpan('context-chip-icon'), 'file-text');
            chip.createSpan('context-chip-label').setText(activeFile.basename);
            const removeBtn = chip.createSpan('context-chip-remove');
            setIcon(removeBtn, 'x');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.userDismissedContext = true;
                this.updateContextBadge();
            });
        }
    }

    /** Resolve a model key for a mode, skipping disabled models: mode override → global → first enabled */
    private resolveEnabledModelKey(modeSlug: string): string {
        const models = this.plugin.settings.activeModels;

        // Check mode override — skip if model is disabled
        const modeOverrideKey = this.plugin.settings.modeModelKeys?.[modeSlug];
        if (modeOverrideKey) {
            const m = models.find((m) => getModelKey(m) === modeOverrideKey);
            if (m?.enabled) return modeOverrideKey;
        }

        // Check global default — skip if model is disabled
        const globalKey = this.plugin.settings.activeModelKey;
        if (globalKey) {
            const m = models.find((m) => getModelKey(m) === globalKey);
            if (m?.enabled) return globalKey;
        }

        // Fallback: first enabled model
        return getFirstEnabledModelKey(models);
    }

    /** Returns the effective model key for the current mode (mode override → global fallback) */
    private getEffectiveModelKey(): string {
        return this.resolveEnabledModelKey(this.plugin.settings.currentMode);
    }

    private updateModelButton(): void {
        if (!this.modelButton) return;
        this.modelButton.empty();
        // EPIC-26 / FEAT-26-05: when a provider is active, the button
        // shows either "Auto" (default) or the explicit override id.
        const activeProvider = resolveActiveProvider(this.plugin.settings);
        let label: string;
        let title: string;
        if (activeProvider) {
            if (this.chatModelOverride === null) {
                label = t('ui.sidebar.modelAuto');
                title = t('ui.sidebar.modelAutoTitle');
            } else {
                const m = resolveOverrideModel(activeProvider, this.chatModelOverride);
                // Chat-header is narrow -- keep the label short:
                // displayName when available, otherwise the bare model name
                // (normalized to strip vendor/region/version prefixes so e.g.
                // "anthropic/claude-opus-4-6" or "eu.anthropic.claude-opus-4-6-v1"
                // collapses to "claude-opus-4-6"). Full id stays in the tooltip.
                const shortName = m?.displayName
                    ?? this.shortenModelId(this.chatModelOverride);
                label = shortName;
                title = t('ui.sidebar.modelOverrideTitle', { label: this.chatModelOverride });
            }
        } else {
            // Legacy / pre-migration path: read the flat activeModels[] selection.
            const effectiveKey = this.getEffectiveModelKey();
            const model = this.plugin.settings.activeModels.find((m) => getModelKey(m) === effectiveKey);
            label = model ? (model.displayName ?? model.name) : t('ui.sidebar.noModel');
            const hasModeOverride = !!this.plugin.settings.modeModelKeys?.[this.plugin.settings.currentMode];
            title = hasModeOverride ? t('ui.sidebar.modeOverride', { label }) : label;
        }
        this.modelButton.createSpan('model-label').setText(label);
        // Mirror the picker's binary thinking switch on the chat header so the
        // two never disagree. The footer always shows on/off via the same
        // predicate as the switch: 'follow' (the byte-identical default) and
        // 'on' read as On, only explicit 'off' reads as Off. (Previously the
        // badge rendered only for explicit overrides, so the default showed
        // nothing in the footer while the switch already read On.) The "forced"
        // tooltip wording stays reserved for an explicit deviation.
        const thinkingOn = thinkingSwitchIsOn(this.chatThinkingOverride);
        const badge = this.modelButton.createSpan('model-thinking-badge');
        badge.classList.toggle('is-off', !thinkingOn);
        badge.setText(thinkingOn
            ? t('ui.sidebar.thinkingBadgeOn')
            : t('ui.sidebar.thinkingBadgeOff'));
        if (isExplicitThinkingOverride(this.chatThinkingOverride)) {
            title = thinkingOn
                ? t('ui.sidebar.thinkingOverrideTitleOn', { label: title })
                : t('ui.sidebar.thinkingOverrideTitleOff', { label: title });
        }
        setIcon(this.modelButton.createSpan('mode-chevron'), 'chevron-down');
        this.modelButton.title = title;
        // Use the effective key for context-tracker logic below.
        const effectiveKey = this.getEffectiveModelKey();
        const model = this.plugin.settings.activeModels.find((m) => getModelKey(m) === effectiveKey);

        // Update context tracker when model changes
        if (this.contextTracker && model) {
            try {
                const apiHandler = buildApiHandlerForModel(model);
                const modelInfo = apiHandler?.getModel().info;
                if (modelInfo?.contextWindow) {
                    this.contextTracker.updateContextWindow(
                        modelInfo.contextWindow,
                        model.maxTokens
                    );
                }
            } catch (e) {
                console.debug('[AgentSidebarView] Failed to update context window for model change:', e);
            }
        }
    }

    private showModelMenu(event: MouseEvent): void {
        // EPIC-26 / FEAT-26-05: when a provider is active, show Auto + the
        // provider's discovered models. Otherwise (pre-migration / fresh
        // install) fall back to the legacy flat model list.
        const activeProvider = resolveActiveProvider(this.plugin.settings);
        if (activeProvider) {
            this.showProviderModelMenu(event, activeProvider);
            return;
        }

        const enabled = this.plugin.settings.activeModels.filter((m) => m.enabled);
        const menu = new Menu();
        const modeSlug = this.plugin.settings.currentMode;
        const modeOverrideKey = this.plugin.settings.modeModelKeys?.[modeSlug] ?? '';
        const globalKey = this.plugin.settings.activeModelKey;
        const effectiveKey = modeOverrideKey || globalKey;

        if (enabled.length === 0) {
            menu.addItem((item) =>
                item.setTitle(t('ui.sidebar.noModelsEnabled')).setIcon('settings').onClick(() => {
                    this.app.setting?.open();
                    window.setTimeout(() => this.app.setting?.openTabById(this.plugin.manifest.id), 50);
                }),
            );
        } else {
            // Option to clear mode override (use global default)
            if (modeOverrideKey) {
                const globalModel = this.plugin.settings.activeModels.find((m) => getModelKey(m) === globalKey);
                const globalLabel = globalModel ? (globalModel.displayName ?? globalModel.name) : t('ui.sidebar.globalDefault');
                menu.addItem((item) =>
                    item
                        .setTitle(t('ui.sidebar.useGlobalDefault', { label: globalLabel }))
                        .setIcon('rotate-ccw')
                        .onClick(async () => {
                            if (this.plugin.settings.modeModelKeys) {
                                delete this.plugin.settings.modeModelKeys[modeSlug];
                            }
                            await this.plugin.saveSettings();
                            this.updateModelButton();
                        }),
                );
                menu.addSeparator();
            }

            enabled.forEach((model) => {
                const key = getModelKey(model);
                menu.addItem((item) =>
                    item
                        .setTitle(model.displayName ?? model.name)
                        .setChecked(effectiveKey === key)
                        .onClick(async () => {
                            // Set as mode-specific override (not global default)
                            if (!this.plugin.settings.modeModelKeys) this.plugin.settings.modeModelKeys = {};
                            this.plugin.settings.modeModelKeys[modeSlug] = key;
                            await this.plugin.saveSettings();
                            this.updateModelButton();
                        }),
                );
            });
        }

        menu.showAtMouseEvent(event);
    }

    /**
     * EPIC-26 / FEAT-26-05: short-label helper for the chat-header model
     * button. Strips OpenRouter vendor prefix ("anthropic/...") and
     * Bedrock region + vendor + version wrappers so the button stays
     * narrow. Display name is preferred upstream of this helper; this
     * runs as a last-resort fallback.
     */
    private shortenModelId(id: string): string {
        let s = id;
        if (s.includes('/')) s = s.split('/').pop() ?? s;
        const m = s.match(/(?:^|\.)(?:anthropic|amazon|meta|mistral|cohere|ai21|stability|deepseek|writer|qwen)\.(.+)$/i);
        if (m) s = m[1];
        s = s.replace(/-v\d+(?::\d+)?$/i, '').replace(/:\d+$/, '');
        return s;
    }

    /**
     * EPIC-26 / FEAT-26-05: searchable popover when a provider is active.
     * Bedrock and OpenRouter routinely list 50+ models -- a plain Menu
     * was not scrollable enough; ChatModelPickerPopover adds a filter
     * input matching the ToolPicker pattern.
     */
    private showProviderModelMenu(event: MouseEvent, provider: import('../types/settings').ProviderConfig): void {
        if (!this.modelButton) return;
        if (!this.chatModelPicker) this.chatModelPicker = new ChatModelPickerPopover();
        if (this.chatModelPicker.isOpen()) {
            this.chatModelPicker.close();
            return;
        }
        this.chatModelPicker.show(event, this.modelButton, this.containerEl, provider, {
            getCurrent: () => this.chatModelOverride,
            onSelect: (overrideId) => {
                this.chatModelOverride = overrideId;
                // Effort is a pin-only control. Unpinning (back to Auto) clears
                // any chosen effort so Auto mode falls back to the model's own
                // vendor default; a stale level must not leak onto the router.
                if (overrideId === null) {
                    this.chatEffortOverride = DEFAULT_EFFORT_OVERRIDE;
                }
                this.updateModelButton();
            },
            getThinking: () => this.chatThinkingOverride,
            onThinkingChange: (override) => {
                this.chatThinkingOverride = override;
                this.updateModelButton();
            },
            getEffort: () => this.chatEffortOverride,
            onEffortChange: (override) => {
                this.chatEffortOverride = override;
                this.updateModelButton();
            },
            getEffortLevels: () => this.resolveEffortLevelsForPinnedModel(provider),
        });
    }

    /**
     * Native effort levels for the PINNED chat-header model, or [] when nothing
     * is pinned. Effort is a pin-only control: in Auto mode the tier router
     * already picks the model for the task, so no effort dial is offered and the
     * model keeps its own vendor default (the provider layer sends no effort
     * field). The empty array hides the effort slider, which is how Auto mode and
     * effort-incapable models (Gemini, local) both end up with no control.
     */
    private resolveEffortLevelsForPinnedModel(
        provider: import('../types/settings').ProviderConfig,
    ): EffortLevel[] {
        if (!this.chatModelOverride) return [];
        const m = resolveOverrideModel(provider, this.chatModelOverride);
        if (!m) return [];
        return getModelEffortLevels(m.id, provider.type);
    }

    /**
     * 2026-05-18: legacy mode-button + popover removed (FEAT-26-05).
     * Tool-Picker stays in the chat toolbar; with "Ask" gone there is
     * no mode that hides it, so we always show.
     */
    private updateToolPickerButton(): void {
        if (!this.toolPickerButton) return;
        this.toolPickerButton.classList.remove('agent-u-hidden');
        this.updateWebToggleButton();
    }

    /**
     * Manual memory save (FEATURE-0318): always available, bypasses both
     * autoExtractSessions and the message-count threshold. Calls the same
     * Single-Call pipeline the auto-path uses, just with bypassThrottle=true.
     */
    private async handleSaveToMemory(): Promise<void> {
        const mem = this.plugin.settings.memory;
        if (!mem.enabled) {
            new Notice(t('notice.memoryDisabled'));
            return;
        }
        const queue = this.plugin.extractionQueue;
        const snapshot = this.snapshotForMemory();
        if (!queue || !snapshot) {
            new Notice(t('notice.memoryNoActiveConversation'));
            return;
        }
        try {
            await queue.enqueueImmediate(snapshot);
            new Notice(t('notice.memorySaveQueued'));
            void this.pollMemoryStarUntilReady(snapshot.conversationId);
        } catch (e) {
            console.warn('[Memory] Manual save failed:', e);
            new Notice(t('notice.memorySaveFailed'));
        }
    }

    /**
     * After enqueueImmediate, the LLM extraction runs in the background
     * and only THEN do facts land in the DB. Poll for up to 90s so the
     * history panel star eventually reflects the saved state without
     * the user having to reopen the panel.
     */
    private async pollMemoryStarUntilReady(conversationId: string): Promise<void> {
        const startedAt = Date.now();
        const TIMEOUT_MS = 90_000;
        const INTERVAL_MS = 2_000;
        while (Date.now() - startedAt < TIMEOUT_MS) {
            await new Promise(resolve => window.setTimeout(resolve, INTERVAL_MS));
            if (this.plugin.countMemoryFactsForConversation(conversationId) > 0) {
                this.historyPanel?.refresh();
                return;
            }
        }
        this.historyPanel?.refresh();
    }

    /**
     * Save a HISTORY conversation (not the currently active one) to memory.
     * Loads the persisted UiMessages from ConversationStore and enqueues
     * them with bypassThrottle=true. Used by the Star button in HistoryPanel.
     */
    /** Rename a history conversation via prompt modal. */
    private async renameHistoryConversation(id: string, currentTitle: string): Promise<void> {
        const store = this.plugin.conversationStore;
        if (!store) return;
        const { promptModal } = await import('./modals/PromptModal');
        const next = await promptModal(this.app, {
            title: t('ui.history.renameTitle'),
            message: t('ui.history.renameMessage'),
            placeholder: currentTitle,
            defaultValue: currentTitle,
            submitLabel: t('ui.history.renameSubmit'),
        });
        if (next === null) return;
        const trimmed = next.trim();
        if (!trimmed || trimmed === currentTitle) return;
        await store.updateMeta(id, { title: trimmed });
    }

    /** Un-pin: deprecate all facts that came from this conversation. */
    private async removeHistoryConversationFromMemory(id: string, title: string): Promise<void> {
        const mem = this.plugin.settings.memory;
        if (!mem.enabled) {
            new Notice(t('notice.memoryDisabled'));
            return;
        }
        try {
            const removed = await this.plugin.unpinMemoryFactsForConversation(id);
            new Notice(t('notice.memoryRemoved', { count: removed, title }));
        } catch (e) {
            console.warn('[Memory] Remove failed:', e);
            new Notice(t('notice.memorySaveFailed'));
        }
    }

    private async saveHistoryConversationToMemory(id: string, title: string): Promise<void> {
        const mem = this.plugin.settings.memory;
        if (!mem.enabled) {
            new Notice(t('notice.memoryDisabled'));
            return;
        }
        const queue = this.plugin.extractionQueue;
        const store = this.plugin.conversationStore;
        if (!queue || !store) {
            new Notice(t('notice.memoryNoActiveConversation'));
            return;
        }
        try {
            const data = await store.load(id);
            if (!data || data.uiMessages.length === 0) {
                new Notice(t('notice.memoryNoActiveConversation'));
                return;
            }
            const messages = data.uiMessages.map((m) => ({ role: m.role, text: m.text }));
            await queue.enqueueImmediate({
                conversationId: id,
                messages,
                title,
                queuedAt: new Date().toISOString(),
            });
            new Notice(t('notice.memorySaveQueued'));
            void this.pollMemoryStarUntilReady(id);
        } catch (e) {
            console.warn('[Memory] Save history conversation failed:', e);
            new Notice(t('notice.memorySaveFailed'));
        }
    }

    /**
     * BA-26 / FEAT-23-04: confirm a pending external conversation.
     * Flips syncState 'pending' -> 'confirmed' and enqueues the
     * conversation for memory extraction with shared thresholds.
     */
    private async confirmPendingConversation(id: string, title: string): Promise<void> {
        const store = this.plugin.conversationStore;
        const queue = this.plugin.extractionQueue;
        if (!store) {
            new Notice(t('notice.memoryNoActiveConversation'));
            return;
        }
        try {
            const flipped = await store.confirm(id);
            if (!flipped) {
                new Notice('Conversation already confirmed.');
                return;
            }
            // Trigger memory extraction (auto-sync would have done this on save).
            if (this.plugin.settings.memory.enabled && queue) {
                const data = await store.load(id);
                if (data && data.uiMessages.length > 0) {
                    const messages = data.uiMessages.map((m) => ({ role: m.role, text: m.text }));
                    await queue.enqueueImmediate({
                        conversationId: id,
                        messages,
                        title,
                        queuedAt: new Date().toISOString(),
                    });
                }
            }
            new Notice(`Confirmed: ${title}`);
        } catch (e) {
            console.warn('[Memory] Confirm pending failed:', e);
            new Notice(t('notice.memorySaveFailed'));
        }
    }

    private async toggleWebSearch(): Promise<void> {
        const isEnabled = this.plugin.settings.webTools?.enabled ?? false;
        const newState = !isEnabled;
        if (!this.plugin.settings.webTools) {
            this.plugin.settings.webTools = { enabled: false, provider: 'none', braveApiKey: '', tavilyApiKey: '' };
        }
        this.plugin.settings.webTools.enabled = newState;
        await this.plugin.saveSettings();
        this.updateWebToggleButton();

        // Check for missing provider/API key and show notice
        if (newState) {
            const provider = this.plugin.settings.webTools.provider;
            if (!provider || provider === 'none') {
                new Notice(t('notice.webSearchEnabled'));
            }
        }
    }

    private updateWebToggleButton(): void {
        if (!this.webToggleButton) return;
        // Only show when the active mode supports web tools
        const mode = this.modeService.getMode(this.plugin.settings.currentMode);
        const modeHasWeb = mode?.toolGroups?.includes('web') ?? false;
        this.webToggleButton.classList.toggle('agent-u-hidden', !modeHasWeb);
        // Visual state: active (highlighted) or inactive (ghost)
        const isEnabled = this.plugin.settings.webTools?.enabled ?? false;
        this.webToggleButton.classList.toggle('web-toggle-active', isEnabled);
    }

    // 2026-05-18: showModeMenu + getModeIcon removed (dead since the
    // chat-header Mode-button was retired in FEAT-26-05). Agent-switching
    // now lives entirely in Settings -> Agents. getModeDisplayName stays
    // because the mode-switched Notice still uses it.

    private getModeDisplayName(modeSlug: string): string {
        return this.modeService.getMode(modeSlug)?.name ?? modeSlug;
    }

    // ---------------------------------------------------------------------------

    /**
     * Build the skills section for the system prompt.
     * Combines keyword-matched skills with any forced skills from the tool picker.
     */
    /**
     * Build a compact vault-structure snapshot injected into every user message.
     * Gives the model immediate orientation (top-level folders, note count, recent files)
     * so it doesn't need to call list_files or get_vault_stats just to orient itself.
     * Mirrors the <environment_details> pattern used by Kilo Code and Craft Agents.
     */
    private buildVaultContext(): string {
        try {
            const root = this.app.vault.getRoot();
            const folders: string[] = [];
            const rootFiles: string[] = [];

            for (const child of root.children) {
                if ('children' in child) {
                    // It's a folder — skip hidden/system dirs
                    const name = child.name;
                    if (!name.startsWith('.')) folders.push(name);
                } else {
                    rootFiles.push(child.name);
                }
            }

            const allMd = this.app.vault.getMarkdownFiles();
            const noteCount = allMd.length;

            // 5 most recently modified notes (path only)
            const recent = [...allMd]
                .sort((a, b) => b.stat.mtime - a.stat.mtime)
                .slice(0, 5)
                .map((f) => f.path);

            const lines: string[] = ['<vault_context>'];
            lines.push(`Notes: ${noteCount}`);
            if (folders.length > 0) lines.push(`Top-level folders: ${folders.join(', ')}`);
            if (rootFiles.length > 0) lines.push(`Root files: ${rootFiles.join(', ')}`);
            if (recent.length > 0) lines.push(`Recently modified: ${recent.join(', ')}`);
            lines.push('</vault_context>');
            return lines.join('\n');
        } catch {
            return '';
        }
    }

    /**
     * Build the SKILLS directory for the stable system-prompt prefix
     * (FEAT-24-09 / ADR-116). Lists every installed skill (name + description,
     * plus inventory lines for self-authored skills) -- the LLM picks a skill
     * itself based on the directory and loads its body via the read_skill
     * tool. Replaces the previous classifier-driven body injection.
     *
     * Honours the manual skill toggles so the directory matches what the
     * user actually exposes.
     */
    private async buildSkillDirectory(): Promise<string | undefined> {
        const skillsManager = this.plugin.skillsManager;
        const selfLoader = this.plugin.selfAuthoredSkillLoader;

        const toggles = this.plugin.settings.manualSkillToggles ?? {};
        const userSkills = skillsManager ? await skillsManager.discoverSkills() : [];
        const filteredUserSkills = Object.keys(toggles).length > 0
            ? userSkills.filter(s => toggles[s.path] !== false)
            : userSkills;

        const selfAuthoredBlock = selfLoader?.getMetadataSummary() ?? '';
        const selfAuthoredNames = new Set(
            (selfLoader?.getAllSkills() ?? []).map(s => s.name),
        );

        const userLines = filteredUserSkills
            .filter(s => !selfAuthoredNames.has(s.name))
            .map(s => `- ${s.name}: ${s.description}`);

        const blocks = [selfAuthoredBlock, userLines.join('\n')].filter(Boolean);
        if (blocks.length === 0) return undefined;

        const directory = blocks.join('\n');
        console.debug(`[buildSkillDirectory] ${selfAuthoredNames.size} self-authored + ${userLines.length} user skill(s)`);
        return directory;
    }

    private autoResizeTextarea(): void {
        if (!this.textarea) return;
        this.textarea.setCssProps({ '--agent-textarea-h': 'auto' });
        this.textarea.setCssProps({ '--agent-textarea-h': Math.min(this.textarea.scrollHeight, 15 * 24) + 'px' });
    }

    /**
     * Show the onboarding welcome message (first activation only).
     * Chat-based flow: scripted assistant bubbles + buttons, no LLM needed.
     * User pastes API key in the normal chat textarea.
     */
    /** Show the welcome message (delegates to OnboardingFlow module). */
    private showWelcomeMessage(): void {
        if (!this.chatContainer) return;
        const ob = this.plugin.settings.onboarding;

        // Phase 2.3: if the FirstRun wizard is still owed to the user
        // (not completed, not dismissed, not yet shown three times),
        // open the wizard instead of the legacy in-chat provider-picker.
        const shown = ob?.firstRunModalShownCount ?? 0;
        const wizardPending = ob && !ob.modalCompleted && !ob.dontShowFirstRunAgain && shown < 3;
        if (wizardPending) {
            void this.openFirstRunWizard();
            return;
        }

        // Memory + Soul chat: auto-start once after the modal has been
        // completed, never again. `startedAt` is set the first time
        // startOnboardingChat runs, so a subsequent sidebar restore
        // does not re-trigger the conversation.
        if (ob?.modalCompleted && !ob.completed && !ob.startedAt) {
            this.startOnboardingChat();
            return;
        }

        // Fallback for users who reset their onboarding state and have
        // already dismissed the wizard. OnboardingFlow.showWelcomeMessage
        // self-guards against re-running, so this is safe to call.
        this.onboarding = new OnboardingFlow(this.plugin, this.app);
        this.onboarding.showWelcomeMessage(this.chatContainer, this, this.getOnboardingCallbacks());
    }

    private async openFirstRunWizard(): Promise<void> {
        try {
            const ob = this.plugin.settings.onboarding;
            ob.firstRunModalShownCount = (ob.firstRunModalShownCount ?? 0) + 1;
            await this.plugin.saveSettings();
            const { FirstRunWizardModal } = await import('./modals/FirstRunWizardModal');
            new FirstRunWizardModal(this.app, this.plugin).open();
        } catch (e) {
            console.error('[Plugin] Failed to open FirstRunWizardModal:', e);
        }
    }

    /** Show setup message when no model is configured (delegates to OnboardingFlow). */
    private showNoModelSetupMessage(): void {
        if (!this.chatContainer) return;
        if (!this.onboarding) this.onboarding = new OnboardingFlow(this.plugin, this.app);
        this.onboarding.showNoModelSetupMessage(this.chatContainer, this, this.getOnboardingCallbacks());
    }

    /** Build callbacks for OnboardingFlow to communicate back to the View. */
    private getOnboardingCallbacks() {
        return {
            addAssistantMessage: (md: string) => this.addAssistantMessage(md),
            addUserMessage: (text: string) => this.addUserMessage(text),
            updateModelButton: () => this.updateModelButton(),
            startOnboardingChat: () => this.startOnboardingChat(),
            openSettings: () => {
                this.app.setting?.open?.();
                window.setTimeout(() => this.app.setting?.openTabById?.(this.plugin.manifest.id), 200);
            },
        };
    }

    /**
     * Start the LLM-driven onboarding conversation.
     * Sends a hidden trigger message; the onboarding system prompt guides the LLM.
     * Called from the welcome card, settings buttons, or programmatically.
     */
    startOnboardingChat(): void {
        this.onboarding?.reset();
        // Mark as started (prevents re-trigger on reload)
        this.plugin.settings.onboarding.startedAt = new Date().toISOString();
        void this.plugin.saveSettings();
        // Clear welcome card, send hidden trigger
        if (this.chatContainer) this.chatContainer.empty();
        this.sendProgrammaticMessage(t('onboarding.trigger'), true);
    }

    /**
     * Programmatically send a message as if the user typed it.
     * Used by Settings buttons (e.g. "Start setup") to trigger agent actions.
     * When hidden=true, the user bubble is not rendered (the agent speaks first).
     */
    sendProgrammaticMessage(text: string, hidden = false): void {
        if (!this.textarea) return;
        this.nextMessageHidden = hidden;
        this.textarea.value = text;
        void this.handleSendMessage();
    }

    /** Open the vault health repair modal with discuss callback. */
    private openHealthModal(): void {
        const findings = this.plugin.vaultHealthService?.getFindings() ?? [];
        if (findings.length === 0) return;
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic import for modal
        const { VaultHealthRepairModal } = require('./modals/VaultHealthRepairModal') as typeof import('./modals/VaultHealthRepairModal');
        new VaultHealthRepairModal(this.plugin, findings, (prompt) => {
            this.clearConversation();
            this.sendProgrammaticMessage(prompt, false);
        }).open();
    }

    /** Update the health-pulse icon. Called from main.ts after health check. */
    updateHealthBadge(findingCount: number, maxSeverity: 'high' | 'medium' | 'low' | null): void {
        if (!this.healthBadge) return;
        if (findingCount === 0 || !maxSeverity) {
            this.healthBadge.classList.add('agent-u-hidden');
            return;
        }
        this.healthBadge.classList.remove('agent-u-hidden');
        // Rebuild the className deterministically: keep the base classes, add
        // one severity marker. Avoid clobbering by using classList operations.
        this.healthBadge.classList.remove('severity-high', 'severity-medium', 'severity-low');
        this.healthBadge.classList.add(`severity-${maxSeverity}`);
        this.healthBadge.setAttribute(
            'aria-label',
            `${t('ui.sidebar.vaultHealth')} (${findingCount})`,
        );
    }

    /**
     * Pull the current findings from the plugin and update the badge. Used
     * when the view mounts after the health check already ran (BRAT hot
     * reload, leaf rebuild, etc.).
     */
    private syncHealthBadge(): void {
        const svc = this.plugin.vaultHealthService;
        if (!svc) return;
        const findings = svc.getFindings();
        if (findings.length === 0) {
            this.updateHealthBadge(0, null);
            return;
        }
        const hasHigh = findings.some((f) => f.severity === 'high');
        const hasMedium = findings.some((f) => f.severity === 'medium');
        const severity = hasHigh ? 'high' : (hasMedium ? 'medium' : 'low');
        this.updateHealthBadge(findings.length, severity);
    }

    /** Send vault health findings to the chat. Batch mode for many findings, interactive for few. */
    private sendHealthFindings(): void {
        const healthService = this.plugin.vaultHealthService;
        if (!healthService || healthService.getFindingCount() === 0) return;

        const count = healthService.getFindingCount();
        const BATCH_THRESHOLD = 10;

        if (count >= BATCH_THRESHOLD) {
            this.sendProgrammaticMessage(
                `Vault health: ${count} findings. Run vault_health_check, then work through ` +
                `findings autonomously in batches. Follow the vault-health-batch skill. ` +
                `Ask me only for real decisions, not for each fix.`,
            );
        } else {
            this.sendProgrammaticMessage(
                `Vault health: ${count} findings. Run vault_health_check and suggest fixes.`,
            );
        }
    }

    /**
     * Feature 1+3: Handle sending a message with persistent history and cancellation
     */
    private async handleSendMessage(): Promise<void> {
        if (!this.textarea) return;

        const text = this.textarea.value.trim();
        if (!text && this.attachments.pending.length === 0) return;

        // FEAT-24-08 / ADR-114 Steering-Hook: if a task is already running,
        // queue the text as a mid-run steering message instead of trying to
        // start a new turn. Attachments are not supported in steering mode
        // (corrections are short text-only nudges); they stay queued for the
        // next real turn.
        if (this.currentAbortController) {
            if (!text) return;
            // Render the steering bubble in "pending" state and keep a
            // reference so consumeSteeringMessages can flip it to
            // "delivered at iteration N" when AgentTask actually drains it.
            const bubbleEl = this.addSteeringMessage(text);
            this.steeringQueue.push({ text, bubbleEl });
            this.uiMessages.push({ role: 'user', text, ts: new Date().toISOString() });
            this.textarea.value = '';
            this.autoResizeTextarea();
            this.refreshRunStateButtons();
            return;
        }

        const isHidden = this.nextMessageHidden;
        this.nextMessageHidden = false;

        // Onboarding key interception: treat input as API key when waiting
        if (this.onboarding?.isAwaitingKey) {
            this.textarea.value = '';
            this.autoResizeTextarea();
            const consumed = await this.onboarding.handleKeyInput(text, this.getOnboardingCallbacks());
            if (consumed) return;
        }

        this.lastUserMessage = text;

        // Create a new conversation on first message (if history enabled)
        if (!this.activeConversationId && this.plugin.conversationStore) {
            const mode = this.modeService.getActiveMode().slug;
            const modelKey = this.resolveEnabledModelKey(mode);
            const model = this.plugin.settings.activeModels.find((m) => getModelKey(m) === modelKey);
            this.activeConversationId = await this.plugin.conversationStore.create(
                mode,
                model?.displayName ?? model?.name ?? modelKey,
            );
            // If the nav stack top is the "fresh-chat" sentinel (null), upgrade
            // it to this just-created conversation id. That keeps back/forward
            // consistent: visiting a fresh chat counts as one stack entry,
            // not two ("empty" plus its concrete id).
            if (
                this.navStack.length > 0
                && this.navIndex === this.navStack.length - 1
                && this.navStack[this.navIndex] === null
            ) {
                this.navStack[this.navIndex] = this.activeConversationId;
                this.updateNavButtons();
            }
        }

        // Track user UI message for history persistence (skip for hidden messages)
        if (!isHidden) {
            this.uiMessages.push({ role: 'user', text, ts: new Date().toISOString() });

        }

        // Snapshot attachments, clear the chip bar, render user bubble with previews
        const attachments = [...this.attachments.pending];
        this.attachments.clear();
        if (!isHidden) {
            const activeFileForBubble = (this.plugin.settings.autoAddActiveFileContext && !this.userDismissedContext)
                ? this.app.workspace.getActiveFile()
                : null;
            this.addUserMessage(text, attachments, activeFileForBubble);
        }
        this.textarea.value = '';
        this.autoResizeTextarea();

        // Feature 4: Inject active file context into the message sent to LLM
        // Only if setting is on and user hasn't dismissed the context for this turn
        const activeFile = (this.plugin.settings.autoAddActiveFileContext && !this.userDismissedContext)
            ? this.app.workspace.getActiveFile()
            : null;
        const vaultCtx = this.buildVaultContext();
        const textWithContext = text
            + (activeFile ? `\n\n<context>\nActive file in editor: ${activeFile.path}\n</context>` : '')
            + (vaultCtx ? `\n\n${vaultCtx}` : '');

        // Prefix commands (FEATURE-2207 decision 2026-04-19):
        //   '/skill-slug'    -> activate a self-authored skill
        //   '#prompt-slug'   -> inject a custom prompt template
        //   '\u00a7workflow-slug' -> run a workflow
        //
        // Resolved BEFORE the attachment-block build so the expanded
        // skill/prompt/workflow body ends up inside the text-block when
        // the user dropped a PDF/image into the chat. Previous order
        // ran the expansion only on the string branch -- with
        // attachments the slash command stayed literal "/ingest-deep"
        // and the agent fell back to invoke_skill, which fails for
        // Chat-attachments and let the parent improvise the workflow.
        let expandedText: string | null = null;
        if (/^[/#\u00a7]/.test(text)) {
            const prefix = text[0];
            const spaceIdx = text.indexOf(' ');
            const slug = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
            const rest = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();
            const activeFileTail = activeFile
                ? `\n\n<context>\nActive file in editor: ${activeFile.path}\n</context>`
                : '';

            if (prefix === '/') {
                const skillLoader = this.plugin.selfAuthoredSkillLoader;
                const matchedSkill = skillLoader?.getAllSkills().find(
                    (s) => AutocompleteHandler.slugifySkillName(s.name) === slug,
                );
                if (matchedSkill) {
                    const parts = [
                        `<explicit_instructions skill="${matchedSkill.name}">`,
                        matchedSkill.body,
                        '</explicit_instructions>',
                    ];
                    if (rest) parts.push('', rest);
                    expandedText = parts.join('\n') + activeFileTail;
                }
            } else if (prefix === '#') {
                const prompt = (this.plugin.settings.customPrompts ?? []).find(
                    (p) => p.slug === slug && p.enabled !== false,
                );
                if (prompt) {
                    const activeFileName = activeFile?.name;
                    const { resolvePromptContent } = await import('../core/context/SupportPrompts');
                    const resolved = resolvePromptContent(prompt.content, {
                        userInput: rest,
                        activeFile: activeFileName,
                    });
                    expandedText = resolved + activeFileTail;
                }
            } else if (prefix === '\u00a7') {
                // Workflows expect a leading '/' in the existing loader API so we
                // re-shape the command for backward compat before dispatch.
                const workflowLoader = this.plugin.workflowLoader;
                if (workflowLoader) {
                    const reshaped = `/${slug}${rest ? ' ' + rest : ''}`;
                    const workflowText = await workflowLoader.processSlashCommand(
                        reshaped,
                        this.plugin.settings.workflowToggles ?? {},
                    );
                    if (workflowText !== reshaped) {
                        expandedText = workflowText + activeFileTail;
                    }
                }
            }
        }

        const finalUserText = expandedText ?? textWithContext;

        // Build ContentBlock[] when there are attachments, plain string otherwise
        let messageToSend: string | ContentBlock[];
        if (attachments.length > 0) {
            const blocks: ContentBlock[] = [];
            // Images first (Anthropic convention)
            for (const att of attachments) {
                if (att.block.type === 'image') blocks.push(att.block);
            }
            // User text (with slash command already expanded if applicable)
            blocks.push({ type: 'text', text: finalUserText });
            // Text file blocks after
            for (const att of attachments) {
                if (att.block.type === 'text') blocks.push(att.block);
            }
            messageToSend = blocks;
        } else {
            messageToSend = finalUserText;
        }

        // EPIC-26 / FEAT-26-05: per-turn override -- when the chat-header
        // dropdown has an explicit model picked, build a fresh api handler
        // for it. Falls through to the legacy mode-model resolution when
        // override is null (Auto).
        // Issue #44: a per-conversation thinking override may also force
        // thinking on/off. When it does, a fresh handler is built even for
        // the default-active model so the override takes effect.
        const activeProvider = resolveActiveProvider(this.plugin.settings);
        // The effort control is pin-only and only revealed while thinking is On,
        // so a contradictory Thinking=Off + Effort pair can no longer be
        // expressed and no coherence collapse is needed: the thinking override
        // passes through untouched. The thinking resolution itself is unchanged.
        const effectiveThinkingOverride = this.chatThinkingOverride;
        const thinkingIsExplicit = isExplicitThinkingOverride(effectiveThinkingOverride);
        // Apply the per-conversation thinking override to a model before it is
        // built. In 'follow' mode the model's own value is kept unchanged.
        const applyThinkingOverride = (model: CustomModel): CustomModel => {
            if (!thinkingIsExplicit) return model;
            return {
                ...model,
                thinkingEnabled: resolveEffectiveThinkingEnabled(
                    effectiveThinkingOverride,
                    model.thinkingEnabled,
                ),
            };
        };
        // Apply the per-conversation effort override. Effort is a PIN-ONLY
        // control, so this only runs on the chat-pin path below (the mode and
        // default-active paths do not call it): in Auto mode no effort is sent
        // and the model keeps its own vendor default. 'auto' leaves the model
        // unchanged. It is also gated on the thinking switch being On, since an
        // effort level is meaningless with thinking off and the UI hides the
        // control there; this keeps a stale level from being sent. The provider
        // layer only emits a level valid for the model family, so a mismatch is
        // dropped there rather than here.
        const applyEffortOverride = (model: CustomModel): CustomModel => {
            if (!thinkingSwitchIsOn(this.chatThinkingOverride)) return model;
            const effort = resolveEffectiveEffort(this.chatEffortOverride);
            if (effort === undefined) return model;
            return { ...model, reasoningEffort: effort };
        };
        let resolvedApiHandler = this.plugin.apiHandler;
        // modelOverrideActive means the user pinned a specific model via the
        // chat dropdown: it suppresses TaskRouter and the lean cost-heuristics
        // (#44). handlerResolved is the separate "a handler was already built"
        // signal so the default-active thinking rebuild below does not clobber
        // a mode-specific handler. A mode model is NOT a manual override, so it
        // sets handlerResolved only, keeping its pre-#44 routing behavior.
        let modelOverrideActive = false;
        let handlerResolved = false;
        if (activeProvider && this.chatModelOverride) {
            const m = resolveOverrideModel(activeProvider, this.chatModelOverride);
            if (m) {
                try {
                    // A pinned model suppresses the tier router, so both the
                    // thinking and effort overrides apply to exactly the model
                    // the turn runs on.
                    const cm = applyEffortOverride(
                        applyThinkingOverride(
                            providerConfigToCustomModel(activeProvider, m.id, m),
                        ),
                    );
                    resolvedApiHandler = buildApiHandlerForModel(cm);
                    modelOverrideActive = true;
                    handlerResolved = true;
                } catch {
                    resolvedApiHandler = this.plugin.apiHandler;
                }
            }
        }

        // Legacy mode-specific model resolution (only when no chat override).
        const currentModeSlug = this.modeService.getActiveMode().slug;
        const modeModelKey = this.resolveEnabledModelKey(currentModeSlug);
        const resolvedModel = this.plugin.settings.activeModels.find((m) => getModelKey(m) === modeModelKey);

        if (!handlerResolved && resolvedModel && modeModelKey !== this.plugin.settings.activeModelKey) {
            // Mode has a different model, so build a fresh handler for it.
            // Effort is pin-only, so a mode model carries only the thinking
            // override; its own effort/default is left untouched.
            try {
                resolvedApiHandler = buildApiHandler(
                    modelToLLMProvider(applyThinkingOverride(resolvedModel)),
                );
                handlerResolved = true;
            } catch {
                resolvedApiHandler = this.plugin.apiHandler;
            }
        }

        // Issue #44: default-active model path. When neither a chat-model
        // override nor a mode-specific model rebuilt the handler, but the user
        // forced thinking for this conversation, rebuild from the same default
        // model main.ts uses so the thinking override applies. Effort is NOT
        // threaded here: it is pin-only, so in Auto mode the default model keeps
        // its own vendor effort default.
        if (!handlerResolved && thinkingIsExplicit) {
            const defaultTier = this.plugin.settings.defaultMainModelTier ?? 'mid';
            const defaultModel = this.plugin.getTierModel(defaultTier) ?? this.plugin.getActiveModel();
            if (defaultModel) {
                try {
                    resolvedApiHandler = buildApiHandler(
                        modelToLLMProvider(applyThinkingOverride(defaultModel)),
                    );
                } catch {
                    resolvedApiHandler = this.plugin.apiHandler;
                }
            }
        }

        if (!resolvedApiHandler) {
            const activeKey = this.plugin.settings.activeModelKey;
            const activeModel = this.plugin.settings.activeModels.find((m) => getModelKey(m) === activeKey);

            if (activeModel?.provider === 'ollama') {
                this.addAssistantMessage(
                    t('ui.error.ollamaNotRunning', { model: activeModel.displayName ?? activeModel.name }),
                );
            } else {
                // No model or no API key — show setup guidance
                this.showNoModelSetupMessage();
            }
            return;
        }

        // Feature 3: Create AbortController, show stop button
        this.currentAbortController = new AbortController();
        // FEAT-24-08 Steering: clear any stale entries before a new task
        // starts so leftover mid-run messages from a previous run cannot
        // leak into a fresh conversation. Any pending bubbles that never
        // got drained (e.g. typed during the very last iteration before
        // attempt_completion fired) are flipped to "discarded" so the user
        // can see they were not applied.
        for (const entry of this.steeringQueue) {
            this.markSteeringDiscarded(entry.bubbleEl);
        }
        this.steeringQueue = [];
        this.setRunningState(true);

        // Prepare streaming message elements (thinking → tools → response text → footer)
        // `let` so onQuestion can create fresh elements for each onboarding turn.
        let { messageEl, thinkingEl, toolsEl, contentEl, footerEl } = this.createStreamingMessageEl();
        let accumulatedText = '';       // text accumulated during/after tool phase
        let accumulatedToolContent = '';  // content written by file-writing tools (for task extraction)
        let accumulatedThinking = '';   // full thinking text for collapse/expand
        let hasTools = false;           // have any tools been called in this task?
        let isThinking = false;         // thinking is currently active
        let activityActionCount = 0;    // number of completed tool calls (for activity badge)

        // Streaming text container: during Q&A streaming we append raw text chunks
        // directly into this element (O(1) per chunk, zero re-parses).
        // On completion a single MarkdownRenderer.render() replaces it with the
        // formatted result.  This gives instant first-character display and avoids
        // the previous 80 ms delay before the user saw anything.
        let streamingPara: HTMLElement | null = null;

        // rAF-throttled scroll: collapses many per-chunk scrollTo() calls into one
        // paint-cycle scroll, eliminating repeated forced reflows.
        let scrollPending = false;
        const scheduleScroll = () => {
            if (scrollPending) return;
            scrollPending = true;
            window.requestAnimationFrame(() => { scrollPending = false; this.chatContainer?.scrollTo({ top: this.chatContainer.scrollHeight }); });
        };

        // Debounced tool group label updates: batches rapid DOM updates during
        // parallel tool execution to reduce flicker and reflows.
        let groupUpdatePending = false;
        const pendingGroupUpdates = new Set<{ nameEl: HTMLElement; name: string; count: number }>();
        const scheduleGroupUpdate = (group: { nameEl: HTMLElement; name: string; count: number }) => {
            pendingGroupUpdates.add(group);
            if (groupUpdatePending) return;
            groupUpdatePending = true;
            window.requestAnimationFrame(() => {
                groupUpdatePending = false;
                for (const g of pendingGroupUpdates) {
                    g.nameEl.setText(this.formatGroupedLabel(g.name, g.count));
                }
                pendingGroupUpdates.clear();
            });
        };

        // Map for O(1) tool-element lookup in onToolResult.
        // For groupable tools the values are item divs; for others they are details elements.
        const toolElsByName = new Map<string, HTMLElement[]>();

        // ── Agent steps block ─────────────────────────────────────────────────
        // All tool calls are wrapped in a single collapsible block with a thin
        // left border instead of individual boxes. Collapsed by default; the
        // summary line shows a live-updating action count + final status.
        let stepsBlockEl: HTMLDetailsElement | null = null;
        let stepsBodyEl: HTMLElement | null = null;
        let stepsSummaryIconEl: HTMLElement | null = null;
        let stepsSummaryLabelEl: HTMLElement | null = null;
        let stepsTotal = 0;
        let stepsCompleted = 0;
        let stepsHasError = false;

        const ensureStepsBlock = () => {
            if (stepsBlockEl) return;
            stepsBlockEl = toolsEl.createEl('details', { cls: 'agent-steps-block' });
            const summaryEl = stepsBlockEl.createEl('summary', { cls: 'agent-steps-summary' });
            stepsSummaryIconEl = summaryEl.createSpan('steps-icon');
            setIcon(stepsSummaryIconEl, 'loader');
            stepsSummaryLabelEl = summaryEl.createSpan('steps-label');
            stepsSummaryLabelEl.setText(t('ui.sidebar.working'));
            stepsBodyEl = stepsBlockEl.createDiv('agent-steps-body');
        };

        const updateStepsSummary = (allDone: boolean) => {
            if (!stepsSummaryLabelEl || !stepsSummaryIconEl) return;
            const n = stepsTotal;
            const label = n === 1 ? t('ui.sidebar.actionSingular') : t('ui.sidebar.actionPlural', { count: n });
            if (allDone) {
                stepsSummaryLabelEl.setText(label);
                setIcon(stepsSummaryIconEl, stepsHasError ? 'x' : 'check');
                stepsSummaryIconEl.removeClass('steps-icon-spinning');
            } else {
                stepsSummaryLabelEl.setText(label);
            }
        };

        // Tools that are safe to group visually — consecutive same-type calls collapse into one row.
        // Write tools are intentionally excluded so each destructive action stays visible individually.
        const GROUPABLE_TOOLS = new Set([
            'read_file', 'list_files', 'search_files', 'get_frontmatter',
            'get_linked_notes', 'search_by_tag', 'get_vault_stats', 'get_daily_note',
            'web_fetch', 'web_search', 'semantic_search',
        ]);

        // Active tool group — tracks the open <details> container for consecutive same-type tools.
        let activeToolGroup: {
            name: string;
            detailsEl: HTMLDetailsElement;
            nameEl: HTMLElement;
            statusEl: HTMLElement;
            bodyEl: HTMLElement;
            count: number;
        } | null = null;
        // Remove the "Working…" loading indicator and any "Analyzing…" row on first real content
        let loadingRemoved = false;
        const removeLoading = () => {
            if (!loadingRemoved) {
                loadingRemoved = true;
                contentEl.querySelector('.message-loading')?.remove();
                contentEl.classList.remove('has-loading');
            }
            // Also remove any "analyzing" row between iterations (lives inside stepsBodyEl)
            (stepsBodyEl ?? toolsEl).querySelector('.tool-computing-row')?.remove();
            if (stepsSummaryLabelEl && stepsTotal > 0) {
                const n = stepsTotal;
                stepsSummaryLabelEl.setText(n === 1 ? t('ui.sidebar.actionSingular') : t('ui.sidebar.actionPlural', { count: n }));
            }
        };

        const taskId = `task-${Date.now()}`;
        let taskWriteCount = 0;
        let hasRenderedCheckpoints = false;
        let lastTodoItems: import('../core/tools/agent/UpdateTodoListTool').TodoItem[] = [];

        // Initialize context tracker for this conversation turn (only if not exists)
        const model = resolvedApiHandler.getModel();
        const contextWindow = model?.info?.contextWindow ?? 200_000;
        const maxTokens = resolvedModel?.maxTokens;

        if (!this.contextTracker) {
            this.contextTracker = new ContextTracker(contextWindow, maxTokens);
        } else {
            // Update existing tracker with current model's context window
            this.contextTracker.updateContextWindow(contextWindow, maxTokens);
        }

        // Pass full (un-truncated) document texts to IngestDocumentTool and ReadDocumentTool
        // and synchronize the tool state every send pass (also with []), so attachments
        // from a prior turn cannot leak into a new turn that has none. ADR-112 / FIX-19-28-05.
        try {
            const docTexts = this.attachments.consumeFullDocTexts();
            for (const toolName of ['ingest_document', 'read_document'] as const) {
                const tool = this.plugin.toolRegistry.getTool(toolName);
                if (tool && typeof (tool as unknown as Record<string, unknown>).setAttachmentTexts === 'function') {
                    (tool as unknown as { setAttachmentTexts(t: string[]): void }).setAttachmentTexts(docTexts);
                }
            }
        } catch { /* non-critical -- tools will fall back to source_path */ }

        // ADR-090 / FEATURE-1804: cost display + telemetry persistence run
        // through TaskMonitor instead of being inlined into the callback hash.
        const taskMonitor = new TaskMonitor({
            plugin: this.plugin,
            app: this.app,
            apiHandler: resolvedApiHandler,
            footerEl,
            getEffectiveModelKey: () => this.getEffectiveModelKey(),
            promptPreview: typeof messageToSend === 'string' ? messageToSend.slice(0, 200) : '<multimodal>',
            mode: this.plugin.settings.currentMode,
            contextTracker: this.contextTracker ?? undefined,
        });

        const task = new AgentTask(
            resolvedApiHandler,
            this.plugin.toolRegistry,
            {
                onIterationStart: (iteration) => {
                    // Show the steps block immediately so the user can expand it from the start.
                    ensureStepsBlock();
                    if (iteration > 0) {
                        // Between iterations — add "Analyzing…" row inside stepsBodyEl (visible when expanded)
                        // and update the summary label so collapsed users also see the state.
                        (stepsBodyEl ?? toolsEl).querySelector('.tool-computing-row')?.remove();
                        const row = (stepsBodyEl ?? toolsEl).createDiv('tool-computing-row');
                        setIcon(row.createSpan('tool-computing-icon'), 'loader');
                        row.createSpan('tool-computing-text').setText(t('ui.sidebar.analyzing'));
                        if (stepsSummaryLabelEl) stepsSummaryLabelEl.setText(t('ui.sidebar.analyzingShort'));
                        scheduleScroll();
                    }
                },
                onThinking: (chunk) => {
                    removeLoading();
                    accumulatedThinking += chunk;
                    if (!isThinking) {
                        // First thinking chunk — build the collapsible section
                        isThinking = true;
                        thinkingEl.classList.remove('agent-u-hidden');
                        thinkingEl.empty();
                        const header = thinkingEl.createDiv('thinking-header');
                        setIcon(header.createSpan('thinking-spinner'), 'loader');
                        header.createSpan('thinking-label').setText(t('ui.sidebar.reasoning'));
                        thinkingEl.createDiv('thinking-content');
                        header.addEventListener('click', () => {
                            const body = thinkingEl.querySelector<HTMLElement>('.thinking-content');
                            if (body) body.classList.toggle('agent-u-hidden');
                        });
                    }
                    const body = thinkingEl.querySelector<HTMLElement>('.thinking-content');
                    if (body) body.setText(accumulatedThinking);
                    scheduleScroll();
                },
                onText: (chunk) => {
                    removeLoading();
                    // When text starts after thinking, collapse the thinking section
                    if (isThinking) {
                        isThinking = false;
                        const header = thinkingEl.querySelector('.thinking-header');
                        const spinner = thinkingEl.querySelector('.thinking-spinner');
                        const label = thinkingEl.querySelector('.thinking-label');
                        if (spinner != null && spinner.instanceOf(HTMLElement)) setIcon(spinner, 'chevron-right');
                        if (label != null && label.instanceOf(HTMLElement)) label.setText(t('ui.sidebar.reasoningCollapsed'));
                        const body = thinkingEl.querySelector<HTMLElement>('.thinking-content');
                        if (body) body.classList.add('agent-u-hidden');
                        if (header != null && header.instanceOf(HTMLElement)) header.addEventListener('click', () => {
                            if (body) body.classList.toggle('agent-u-hidden');
                        }, { once: true });
                    }
                    accumulatedText += chunk;
                    if (!hasTools) {
                        // Q&A streaming: append raw text directly — O(1), no re-parse.
                        // On first chunk, clear the loading state and create the container.
                        // On completion, the container is replaced by a full Markdown render.
                        if (!streamingPara) {
                            contentEl.empty();
                            streamingPara = contentEl.createEl('p', { cls: 'streaming-para' });
                        }
                        streamingPara.insertAdjacentText('beforeend', chunk);
                        scheduleScroll();
                    }
                    // Agentic mode: text is buffered and rendered once in onComplete.
                },
                onToolStart: (name, input) => {
                    removeLoading();
                    if (!hasTools) {
                        hasTools = true;
                        if (name !== 'attempt_completion') {
                            // Hide + clear the streaming UI — text will be re-rendered as
                            // Markdown in onQuestion/onComplete. Hide first to avoid the
                            // flash of raw streaming text disappearing.
                            contentEl.classList.add('agent-u-visibility-hidden');
                            contentEl.empty();
                            streamingPara = null;
                        }
                    }

                    // Ensure the outer steps block exists and track this tool call
                    ensureStepsBlock();
                    stepsTotal++;
                    updateStepsSummary(false);

                    const brief = this.getToolBriefParam(input);
                    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    // Tool calls render into the steps block body, not directly into toolsEl
                    const renderTarget = stepsBodyEl!;

                    if (GROUPABLE_TOOLS.has(name)) {
                        // ── Grouped tool ──────────────────────────────────────────────
                        // Break existing group when a different tool type arrives
                        if (activeToolGroup && activeToolGroup.name !== name) {
                            activeToolGroup = null;
                        }

                        if (!activeToolGroup) {
                            // Create new group container inside the steps block
                            const details = renderTarget.createEl('details', { cls: 'tool-call-details' });
                            const summary = details.createEl('summary', { cls: 'tool-call-summary' });
                            setIcon(summary.createSpan('tool-icon'), this.getToolIcon(name));
                            const nameEl = summary.createSpan('tool-name');
                            nameEl.setText(this.formatGroupedLabel(name, 1));
                            summary.createSpan('tool-time').setText(time);
                            const statusEl = summary.createSpan({ cls: 'tool-status tool-running' });
                            const bodyEl = details.createDiv('tool-group-body');
                            activeToolGroup = { name, detailsEl: details, nameEl, statusEl, bodyEl, count: 1 };
                        } else {
                            // Group already exists — update count and reset status
                            activeToolGroup.count++;
                            scheduleGroupUpdate(activeToolGroup);
                            activeToolGroup.statusEl.removeClass('tool-done', 'tool-error');
                            activeToolGroup.statusEl.addClass('tool-running');
                            activeToolGroup.statusEl.setText('');
                        }

                        // Add compact item row to group body
                        const itemEl = activeToolGroup.bodyEl.createDiv('tool-group-item');
                        setIcon(itemEl.createSpan('tool-item-icon'), 'loader');
                        itemEl.createSpan('tool-item-brief').setText(brief || '...');

                        const queue = toolElsByName.get(name) ?? [];
                        queue.push(itemEl);
                        toolElsByName.set(name, queue);

                    } else {
                        // ── Standalone tool ───────────────────────────────────────────
                        // Any non-groupable tool breaks the active group
                        activeToolGroup = null;

                        const details = renderTarget.createEl('details', { cls: 'tool-call-details' });
                        const summary = details.createEl('summary', { cls: 'tool-call-summary' });
                        setIcon(summary.createSpan('tool-icon'), this.getToolIcon(name));
                        summary.createSpan('tool-name').setText(this.formatToolLabel(name));
                        if (brief) summary.createSpan('tool-brief-param').setText(brief);
                        summary.createSpan('tool-time').setText(time);
                        summary.createSpan('tool-status tool-running');

                        if (name !== 'attempt_completion') {
                            const inputEl = details.createDiv('tool-call-input');
                            inputEl.createEl('pre').setText(JSON.stringify(input, null, 2));
                            details.createDiv('tool-call-output');
                            details.open = true;
                        }

                        const pendingEls = toolElsByName.get(name) ?? [];
                        pendingEls.push(details);
                        toolElsByName.set(name, pendingEls);
                    }

                    const writeOps = ['write_file', 'edit_file', 'append_to_file', 'create_folder', 'delete_file', 'move_file'];
                    if (writeOps.includes(name)) taskWriteCount++;

                    // Collect content from file-writing tools for task extraction (ADR-026)
                    const taskRelevantOps = ['write_file', 'append_to_file', 'edit_file'];
                    if (taskRelevantOps.includes(name) && input) {
                        if (typeof input['content'] === 'string') {
                            accumulatedToolContent += '\n' + input['content'];
                        }
                        if (typeof input['new_str'] === 'string') {
                            accumulatedToolContent += '\n' + input['new_str'];
                        }
                    }

                    scheduleScroll();
                },
                onToolResult: (name, content, isError) => {
                    const queue = toolElsByName.get(name);
                    const el = queue?.shift() ?? null;
                    if (!el) return;

                    if (el.classList.contains('tool-group-item')) {
                        // ── Grouped item result ───────────────────────────────────────
                        const iconEl = el.querySelector<HTMLElement>('.tool-item-icon');
                        if (iconEl) {
                            iconEl.empty();
                            setIcon(iconEl, isError ? 'x' : 'check');
                        }
                        el.classList.add(isError ? 'item-error' : 'item-done');

                        // When all items in the group are settled, update the group header
                        const bodyEl = el.parentElement;
                        const detailsEl = bodyEl?.parentElement;
                        if (bodyEl && detailsEl != null && detailsEl.instanceOf(HTMLDetailsElement)) {
                            const stillRunning = bodyEl.querySelectorAll(
                                '.tool-group-item:not(.item-done):not(.item-error)'
                            ).length;
                            if (stillRunning === 0) {
                                const groupStatus = detailsEl.querySelector<HTMLElement>('.tool-status');
                                if (groupStatus) {
                                    groupStatus.removeClass('tool-running');
                                    const anyError = bodyEl.querySelectorAll('.item-error').length > 0;
                                    groupStatus.addClass(anyError ? 'tool-error' : 'tool-done');
                                    groupStatus.setText(anyError ? '✗' : '✓');
                                }
                                // Keep group open so the user can see which files were processed.
                                // Only collapse on error so the user can inspect failures.
                                if (isError) detailsEl.open = false;
                            }
                        }

                    } else if (el != null && el.instanceOf(HTMLDetailsElement)) {
                        // ── Standalone tool result ────────────────────────────────────
                        const details = el;

                        // Parse and strip <diff_stats added="X" removed="Y"/> tag
                        let displayContent = content;
                        const diffMatch = content.match(/<diff_stats added="(\d+)" removed="(\d+)"\/>/);
                        if (diffMatch && !isError) {
                            const diffAdded = parseInt(diffMatch[1], 10);
                            const diffRemoved = parseInt(diffMatch[2], 10);
                            displayContent = content.replace(/\n?<diff_stats[^/]*\/>/g, '');
                            if (diffAdded > 0 || diffRemoved > 0) {
                                const summary = details.querySelector('summary');
                                if (summary) {
                                    const badge = summary.createSpan('tool-diff-badge');
                                    const parts: string[] = [];
                                    if (diffAdded > 0) parts.push(`+${diffAdded}`);
                                    if (diffRemoved > 0) parts.push(`-${diffRemoved}`);
                                    badge.setText(parts.join(' / '));
                                }
                            }
                        }

                        const statusEl = details.querySelector('.tool-status');
                        if (statusEl) {
                            statusEl.removeClass('tool-running');
                            statusEl.addClass(isError ? 'tool-error' : 'tool-done');
                            statusEl.setText(isError ? '✗' : '✓');
                        }
                        const outputEl = details.querySelector('.tool-call-output');
                        if (outputEl && displayContent) {
                            const truncated = displayContent.length > 2000
                                ? displayContent.slice(0, 2000) + '\n…(truncated)'
                                : displayContent;
                            // FIX-19-31-02: clear any <pre> left by onToolProgress so the
                            // final result replaces the live-preview instead of being appended.
                            outputEl.empty();
                            outputEl.createEl('pre').setText(truncated);
                        }
                        details.open = isError;
                    }
                    // Track step completion and update outer block summary
                    stepsCompleted++;
                    if (isError) stepsHasError = true;
                    updateStepsSummary(stepsCompleted === stepsTotal);

                    // Update activity badge in plan box (only if a plan is active).
                    // Use closest('.assistant-message') so the lookup works both before
                    // and after the DOM-move (toolsEl.parentElement changes on move).
                    activityActionCount++;
                    const actBadge = toolsEl.closest('.assistant-message')?.querySelector<HTMLElement>('.todo-activity-badge') ?? null;
                    if (actBadge) actBadge.setText(t('ui.sidebar.activityCount', { count: activityActionCount }));
                    if (isError) {
                        const actDetails = toolsEl.closest<HTMLDetailsElement>('.todo-activity-log');
                        if (actDetails) actDetails.open = true;
                    }
                },
                onToolProgress: (name, content) => {
                    // Update the live output area of the currently-running standalone tool.
                    const queue = toolElsByName.get(name);
                    const el = queue?.[0] ?? null; // peek without consuming
                    if (!el || el.classList.contains('tool-group-item')) return;
                    const outputEl = el.querySelector<HTMLElement>('.tool-call-output');
                    if (!outputEl) return;
                    outputEl.empty();
                    outputEl.createEl('pre').setText(content);
                },
                onUsage: (inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens) => {
                    // ADR-090 / FEATURE-1804: see TaskMonitor.onUsage
                    taskMonitor.onUsage(inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);
                },
                onTodoUpdate: (items) => {
                    lastTodoItems = items;
                    this.renderTodoBox(toolsEl, items);
                },
                onContextCondensed: (prevTokens?: number, newTokens?: number) => {
                    // Show condensation feedback with token reduction
                    if (footerEl && prevTokens !== undefined && newTokens !== undefined) {
                        const feedback = new CondensationFeedback();
                        feedback.show(footerEl, {
                            prevTokens,
                            newTokens,
                        });
                        footerEl.classList.remove('agent-u-hidden');
                    } else if (footerEl) {
                        // Fallback: show simple badge if token counts not available
                        const badge = footerEl.createSpan('context-condensed-badge');
                        badge.setText(t('ui.sidebar.contextCondensed'));
                        footerEl.classList.remove('agent-u-hidden');
                    }

                    // Update context tracker with new token count after condensing
                    if (this.contextTracker && newTokens !== undefined) {
                        this.contextTracker.setTotalTokens(newTokens);
                        if (this.contextDisplay) {
                            const usage = this.contextTracker.getContextUsage();
                            const color = this.contextTracker.getContextColor();
                            this.contextDisplay.update(usage, color);
                        }
                    }
                },
                // FEAT-24-08 / ADR-114 Steering-Hook: drain the queue and
                // hand mid-run steering messages to AgentTask. Called by
                // AgentTask once per iteration. Order preserved. Each
                // drained bubble is flipped to "delivered at iteration N"
                // so the user can see exactly when their correction landed
                // in the conversation history.
                consumeSteeringMessages: (iteration: number) => {
                    if (this.steeringQueue.length === 0) return [];
                    const drained = this.steeringQueue;
                    this.steeringQueue = [];
                    const texts: string[] = [];
                    for (const entry of drained) {
                        texts.push(entry.text);
                        this.markSteeringDelivered(entry.bubbleEl, iteration);
                    }
                    return texts;
                },
                onModeSwitch: (newModeSlug) => {
                    // Explicitly sync settings before refreshing the button.
                    // ModeService.switchMode() sets this synchronously; we
                    // still update settings here as a safety net.
                    this.plugin.settings.currentMode = newModeSlug;
                    new Notice(t('notice.modeSwitched', { mode: this.getModeDisplayName(newModeSlug) }));
                    // Auto-index on mode switch if configured
                    if (this.plugin.settings.semanticAutoIndex === 'mode-switch' && this.plugin.semanticIndex) {
                        this.plugin.semanticIndex.buildIndex().catch((e) =>
                            console.warn('[AgentSidebarView] Auto-index on mode switch failed:', e)
                        );
                    }
                },
                onCheckpoint: (checkpoint) => {
                    this.renderCheckpointMarker(toolsEl, checkpoint);
                    hasRenderedCheckpoints = true;
                    scheduleScroll();
                },
                onQuestion: (question, options, resolve, allowMultiple) => {
                    // Render any accumulated text before the question card.
                    // This is critical for multi-turn flows like onboarding where
                    // onComplete only fires at the very end — the greeting text
                    // would otherwise stay invisible until the entire task finishes.
                    if (accumulatedText.trim()) {
                        // Hide during re-render to avoid flash of raw → markdown transition
                        contentEl.classList.add('agent-u-visibility-hidden');
                        contentEl.empty();
                        void MarkdownRenderer.render(this.app, accumulatedText, contentEl, '', this);
                        window.requestAnimationFrame(() => { contentEl.classList.remove('agent-u-visibility-hidden'); });
                    }
                    // Wrap resolve: after the user answers, show their answer as a
                    // chat bubble and create a fresh message element for the next
                    // agent response. This turns multi-turn flows (onboarding) into
                    // a real back-and-forth conversation in the UI.
                    const wrappedResolve = (answer: string) => {
                        // Finalize current assistant message
                        messageEl.removeClass('message-streaming');
                        if (accumulatedText) {
                            this.uiMessages.push({
                                role: 'assistant',
                                text: accumulatedText,
                                ts: new Date().toISOString(),
                                toolStepsHtml: stepsBlockEl?.outerHTML,
                                taskId,
                                reasoningText: accumulatedThinking || undefined,
                            });
                        }
                        // Render user answer as a regular chat message
                        this.addUserMessage(answer);
                        this.uiMessages.push({ role: 'user', text: answer, ts: new Date().toISOString() });
                        // Create fresh assistant message element for the next response
                        ({ messageEl, thinkingEl, toolsEl, contentEl, footerEl } = this.createStreamingMessageEl());
                        // Reset per-turn state
                        accumulatedText = '';
                        accumulatedThinking = '';
                        accumulatedToolContent = '';
                        hasTools = false;
                        streamingPara = null;
                        stepsBlockEl = null;
                        stepsBodyEl = null;
                        stepsSummaryIconEl = null;
                        stepsSummaryLabelEl = null;
                        stepsTotal = 0;
                        stepsCompleted = 0;
                        stepsHasError = false;
                        loadingRemoved = false;
                        activeToolGroup = null;
                        // Scroll and continue agent loop
                        scheduleScroll();
                        resolve(answer);
                    };
                    this.showQuestionCard(question, options, wrappedResolve, allowMultiple);
                },
                onApprovalRequired: async (toolName, input) => {
                    return this.showApprovalCard(toolName, input);
                },
                onAttemptCompletion: () => {
                    // Auto-complete any unfinished todo items — agent often skips
                    // a final update_todo_list call before attempt_completion
                    if (lastTodoItems.length > 0) {
                        const allDone = lastTodoItems.map((i) => ({ ...i, status: 'done' as const }));
                        this.renderTodoBox(toolsEl, allDone);
                    }
                    scheduleScroll();
                },
                onEpisodeData: (data) => {
                    // Episodic memory: record task outcome (ADR-018 + FEAT-32-02 / ADR-133).
                    // FEAT-32-02 PR 2.2: payload now includes success, mistakesEncountered,
                    // attemptCompletionFired, fastPathFired, stigmergy. Fires for ALL exit
                    // paths (success, iteration-cap, abort, error). Fire-and-forget.
                    if (this.plugin.episodicExtractor && this.plugin.settings.mastery.enabled) {
                        const resultSummary = data.success
                            ? accumulatedText.slice(0, 300)
                            : (data.attemptCompletionFired ? 'partial' : 'incomplete');
                        const episode = {
                            userMessage: text,
                            mode: activeMode.slug,
                            toolSequence: data.toolSequence,
                            toolLedger: data.toolLedger,
                            success: data.success,
                            resultSummary,
                            stigmergy: data.stigmergy,
                        };
                        this.plugin.episodicExtractor.recordEpisode(episode).then((ep) => {
                            if (ep && this.plugin.recipePromotionService) {
                                // FEAT-32-02 PR 2.4 / ADR-132: hand the
                                // Stigmergy decision snapshot to the promotion
                                // service so Gate 1 (recipe-wins) and Gate 2
                                // (sequence shortcut) can fire. Daemon-down
                                // -> data.stigmergy is undefined and the
                                // service falls through to Gate 3 ADR-058.
                                this.plugin.recipePromotionService.checkForPromotion(ep, data.stigmergy).catch((e) =>
                                    console.warn('[Mastery] Promotion check failed:', e)
                                );
                            }
                        }).catch((e) => console.warn('[Mastery] Episode recording failed:', e));
                    }
                },
                onComplete: () => {
                    // Always clear the loading spinner — covers cases where no text was streamed.
                    removeLoading();
                    // Auto-complete todos on natural task end (mirrors onAttemptCompletion)
                    if (lastTodoItems.length > 0) {
                        const allDone = lastTodoItems.map((i) => ({ ...i, status: 'done' as const }));
                        this.renderTodoBox(toolsEl, allDone);
                    }
                    // Finalize the steps block: remove any trailing "Analyzing…" row,
                    // ensure the summary shows the final count + status icon, and
                    // remove open state from individual tool-call details so the block
                    // is tidy when the user expands it.
                    if (stepsBlockEl) {
                        if (stepsTotal === 0) {
                            // No tools were called — remove the empty block so it doesn't clutter the UI.
                            stepsBlockEl.remove();
                            stepsBlockEl = null;
                        } else {
                            stepsBodyEl?.querySelector('.tool-computing-row')?.remove();
                            updateStepsSummary(true);
                            // Collapse individual tool <details> that were left open during streaming
                            stepsBodyEl?.querySelectorAll('details.tool-call-details').forEach((d) => {
                                if (d != null && d.instanceOf(HTMLDetailsElement)) d.open = false;
                            });
                        }
                    }

                    // Replace the raw streaming text with the properly formatted Markdown.
                    // This fires exactly once — giving us instant streaming + clean final output.
                    streamingPara = null;
                    // Parse [sources] and [followups] blocks before rendering
                    let renderText = accumulatedText;
                    let parsedSources: { num: number; note: string; context: string }[] = [];
                    let parsedFollowups: string[] = [];
                    let followupHeading = '';
                    if (accumulatedText) {
                        const srcParsed = this.parseSources(accumulatedText);
                        renderText = srcParsed.cleanText;
                        parsedSources = srcParsed.sources;
                        const fuParsed = this.parseFollowups(renderText);
                        renderText = fuParsed.cleanText;
                        followupHeading = fuParsed.heading;
                        parsedFollowups = fuParsed.followups;
                    }
                    if (renderText) {
                        contentEl.empty();
                        void MarkdownRenderer.render(this.app, renderText, contentEl, '', this);
                        contentEl.classList.remove('agent-u-visibility-hidden');
                    } else if (hasTools) {
                        // Tools ran but the model returned no text — show a neutral placeholder
                        // so the user doesn't stare at an empty message bubble.
                        contentEl.empty();
                        contentEl.createEl('p', { cls: 'message-empty-response', text: t('ui.sidebar.emptyResponse') });
                    }
                    // Show timestamp in footer even without token usage
                    if (footerEl.classList.contains('agent-u-hidden')) {
                        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        footerEl.setText(time);
                        footerEl.classList.remove('agent-u-hidden');
                    }
                    // Make internal links in the response clickable
                    this.wireInternalLinks(contentEl);
                    // Convert inline [N] to clickable citation badges
                    this.wireCitationBadges(contentEl, parsedSources);
                    // Add response action bar (with sources indicator)
                    this.addResponseActions(messageEl, accumulatedText, parsedSources);
                    // Render follow-up suggestions (parsed from [followups] block)
                    if (parsedFollowups.length > 0) {
                        const followupList = messageEl.createDiv('followup-list');
                        if (followupHeading) {
                            followupList.createEl('div', { cls: 'followup-heading', text: followupHeading });
                        }
                        for (const raw of parsedFollowups) {
                            // Clean [[wikilinks]] → display name only (no folder prefix)
                            const displayText = raw.replace(/\[\[([^\]]+)\]\]/g, (_m, link: string) => {
                                const name = link.contains('|') ? link.split('|').pop()! : link;
                                return name.contains('/') ? name.split('/').pop()! : name;
                            });
                            const itemRow = followupList.createDiv('followup-item-row');
                            // Main button: send immediately (existing behavior)
                            const item = itemRow.createEl('button', { cls: 'followup-item', text: displayText });
                            item.addEventListener('click', () => {
                                if (this.textarea) {
                                    this.textarea.value = displayText;
                                    void this.handleSendMessage();
                                }
                            });
                            // "+" button: append text to textarea without sending (inside item, right-aligned, hover-only)
                            const appendBtn = item.createEl('span', { cls: 'followup-append-btn', text: '+' });
                            appendBtn.setAttribute('aria-label', 'Add to input');
                            appendBtn.addEventListener('click', (ev) => {
                                ev.stopPropagation();
                                ev.preventDefault();
                                if (this.textarea) {
                                    const sep = this.textarea.value.trim() ? '\n' : '';
                                    this.textarea.value = this.textarea.value + sep + displayText;
                                    this.textarea.focus();
                                    this.textarea.dispatchEvent(new Event('input'));
                                }
                            });
                        }
                    }
                    messageEl.removeClass('message-streaming');
                    this.currentAbortController = null;
                    this.setRunningState(false);
                    scheduleScroll();
                    if (taskWriteCount > 0 && (this.plugin.settings.enableCheckpoints ?? true) && !hasRenderedCheckpoints) {
                        this.showUndoBar(taskId, taskWriteCount);
                    }
                    // Post-task review: show all changes for review/undo
                    if (taskWriteCount > 0 && (this.plugin.settings.enableCheckpoints ?? true)) {
                        void this.showPostTaskReview(taskId);
                    }
                    // Notify when sidebar is not the active (focused) view
                    if (this.app.workspace.getMostRecentLeaf()?.view !== this) {
                        new Notice(t('notice.taskComplete'), 3000);
                    }
                    // Track assistant UI message for history persistence,
                    // including a snapshot of the collapsed steps block so
                    // tool actions remain inspectable after a chat reload.
                    if (accumulatedText) {
                        this.uiMessages.push({
                            role: 'assistant',
                            text: accumulatedText,
                            ts: new Date().toISOString(),
                            toolStepsHtml: stepsBlockEl?.outerHTML,
                            taskId,
                            reasoningText: accumulatedThinking || undefined,
                        });
                    }
                    // Auto-save conversation to ConversationStore
                    this.saveCurrentConversation();

                    // Task Extraction Post-Processing (ADR-026, FEATURE-100)
                    const taskScanText = (accumulatedText + accumulatedToolContent).trim();
                    if (this.plugin.settings.taskExtraction?.enabled && taskScanText) {
                        void this.maybeExtractTasks(taskScanText);
                    }

                    // Auto-title: set fallback title for immediate history display (ADR-022)
                    // Semantic titling happens later in finalizeConversation() on conversation end.
                    if (this.activeConversationId && this.uiMessages.length <= 2 && this.plugin.conversationStore) {
                        const firstUserMsg = this.uiMessages.find((m) => m.role === 'user');
                        if (firstUserMsg) {
                            const fallback = firstUserMsg.text.slice(0, 60).replace(/\n/g, ' ').trim() || t('ui.sidebar.newConversation');
                            void this.plugin.conversationStore.updateMeta(this.activeConversationId, { title: fallback }).catch(() => {});
                            this.historyPanel?.refresh();
                        }
                    }
                },
                // Feature 5: Error display inside steps dialog
                onError: (error) => {
                    // Clean up spinner and computing row
                    removeLoading();

                    // Show error inside the steps block (not as a separate red banner)
                    ensureStepsBlock();
                    const errorRow = (stepsBodyEl ?? toolsEl).createDiv('tool-step-row tool-step-error');
                    const iconEl = errorRow.createSpan('tool-step-icon');
                    setIcon(iconEl, 'x-circle');
                    const textEl = errorRow.createDiv('tool-step-text');
                    textEl.createDiv('error-title').setText(this.getErrorTitle(error));
                    textEl.createDiv('error-detail').setText(error.message);

                    // Update steps summary to error state
                    stepsHasError = true;
                    updateStepsSummary(true);
                    if (stepsBlockEl) stepsBlockEl.open = true;

                    // Clean up streaming/running state
                    messageEl.removeClass('message-streaming');
                    this.currentAbortController = null;
                    this.setRunningState(false);
                },
                onTaskTelemetry: (data) => {
                    // ADR-090 / FEATURE-1804: see TaskMonitor.onTaskTelemetry
                    taskMonitor.onTaskTelemetry(data);
                },
            },
            this.modeService,
            this.plugin.settings.advancedApi.consecutiveMistakeLimit,
            this.plugin.settings.advancedApi.rateLimitMs,
            this.plugin.settings.advancedApi.condensingEnabled ?? false,
            this.plugin.settings.advancedApi.condensingThreshold ?? 80,
            this.plugin.settings.advancedApi.powerSteeringFrequency ?? 0,
            this.plugin.settings.advancedApi.maxIterations ?? 25,
            0,  // depth: root task starts at 0
            this.plugin.settings.advancedApi.maxSubtaskDepth ?? 2,
            this.plugin.settings.advancedApi.microcompactionEnabled ?? true,
            this.plugin.settings.advancedApi.rollingSummaryThreshold ?? 50,
            modelOverrideActive,
        );

        // Load enabled rules for this task (Sprint 3.2)
        const rulesLoader = this.plugin.rulesLoader;
        const rulesContent = rulesLoader
            ? await rulesLoader.loadEnabledRules(this.plugin.settings.rulesToggles ?? {})
            : undefined;

        // Feature 1: Pass the shared history — it accumulates across messages
        // Feature 4: Pass messageToSend (with active file context) instead of raw text
        const activeMode = this.modeService.getActiveMode();

        // FEAT-24-09 / ADR-116: build the stable SKILLS directory for the
        // cached system-prompt prefix. The model loads a skill body on demand
        // via the read_skill tool -- no per-message LLM classifier any more.
        // Skip only during the active first-time onboarding wizard, not for
        // users who abandoned it but use the plugin productively (FIX-24-09-01).
        const isOnboarding = isActiveOnboardingFlow(this.plugin.settings);
        let skillDirectorySection: string | undefined;
        if (!isOnboarding) {
            skillDirectorySection = await this.buildSkillDirectory();
        }

        // Apply forced workflow from tool picker (when message doesn't start with slash command)
        const forcedWorkflowSlug = this.plugin.settings.forcedWorkflow?.[activeMode.slug] ?? '';
        if (typeof messageToSend === 'string' && !text.startsWith('/') && forcedWorkflowSlug) {
            const workflowLoader = this.plugin.workflowLoader;
            if (workflowLoader) {
                const processedText = await workflowLoader.processSlashCommand(
                    `/${forcedWorkflowSlug} ${text}`,
                    this.plugin.settings.workflowToggles ?? {},
                );
                if (processedText !== `/${forcedWorkflowSlug} ${text}`) {
                    messageToSend = processedText + (activeFile
                        ? `\n\n<context>\nActive file in editor: ${activeFile.path}\n</context>`
                        : '');
                }
            }
        }

        // Build plugin skills section from VaultDNA (PAS-1) — skip during onboarding
        const pluginSkillsSection = isOnboarding ? undefined
            : this.plugin.skillRegistry?.getPluginSkillsPromptSection();

        // 2026-05-18: per-mode MCP allow-list removed. The chat-header pocket
        // knife now toggles activeMcpServers globally instead. The systemprompt
        // tool-section honours activeMcpServers as the source of truth via
        // McpBridge, so passing undefined here means "no per-agent restriction".
        const allowedMcpServers: string[] | undefined = undefined;

        // Memory v2 is the only path. The legacy v1 MD-file pipeline was
        // removed once the upgrade orchestrator landed -- existing users
        // are taken through the upgrade modal on first load, fresh users
        // start on v2 from minute one. ContextComposer renders an empty
        // block until the user has facts; no fallback to v1.
        let memoryContext: string | undefined;
        const isFirstMessage = this.conversationHistory.length === 0;

        if (
            this.plugin.settings.memory.enabled
            && this.plugin.memoryDB?.isOpen()
            && this.plugin.embeddingService?.isReady()
        ) {
            try {
                const { TopicInference } = await import('../core/memory/TopicInference');
                const { UserProfileView } = await import('../core/memory/UserProfileView');
                const { ContextComposer } = await import('../core/memory/ContextComposer');
                const inference = new TopicInference(this.plugin.memoryDB);
                const profileView = new UserProfileView(this.plugin.memoryDB);
                const composer = new ContextComposer(
                    this.plugin.memoryDB, inference, profileView, this.plugin.driftBus,
                );
                let userEmbedding: Float32Array | null = null;
                if (text.trim()) {
                    const vectors = await this.plugin.embeddingService.embed([text]);
                    userEmbedding = vectors[0] ?? null;
                }
                // FEAT-03-26 (BA-25): Top-Hub-Block (Vault-Karte) optional
                // im stabilen Prompt-Prefix. Default off, Setting-gated.
                const topHubBlock = this.plugin.settings.vaultIngest?.topHubBlock?.enabled
                    ? this.plugin.topHubBlockMarkdown
                    : undefined;
                const composed = composer.compose({
                    sessionId: this.activeConversationId ?? 'transient',
                    userMessageEmbedding: userEmbedding,
                    topHubBlockMarkdown: topHubBlock,
                });
                // FEATURE-0319b: prepend the cache-stable Soul block from
                // the agent-self profile (profile_id='_obsilo'). Two
                // separate calls per /architecture decision A so the
                // blocks stay independently cache-stable and ContextRanker
                // remains profile-naive.
                const { SoulView } = await import('../core/memory/SoulView');
                const soulMarkdown = new SoulView(this.plugin.memoryDB).renderMarkdown();
                const parts: string[] = [];
                if (soulMarkdown) parts.push(soulMarkdown);
                if (composed.markdown) parts.push(composed.markdown);
                if (parts.length > 0) memoryContext = parts.join('\n\n');
            } catch (e) {
                console.warn('[Memory] ContextComposer failed:', e);
            }
        }

        // Session retrieval + onboarding: independent of v1/v2 memory engine.
        // Session summaries live in the same memory.db.sessions table either
        // way; onboarding prompts are still surfaced through MemoryService
        // until OnboardingService gets re-homed onto the v2 stores
        // (FEATURE-0323).
        if (this.plugin.settings.memory.enabled && this.plugin.memoryService) {
            try {
                const parts: string[] = memoryContext ? [memoryContext] : [];

                // Onboarding: inject step-specific setup instructions when setup is incomplete
                const onboarding = new OnboardingService(this.plugin.memoryService, this.plugin);
                const onboardingPrompt = onboarding.getOnboardingPrompt();
                if (onboardingPrompt) parts.unshift(onboardingPrompt);

                // Session retrieval — only on first message, using raw user text
                // (not userMessageText which includes <context> and <vault_context> blocks).
                // Skipped entirely when no sessions exist to avoid a wasted embedding API call.
                if (isFirstMessage && text.trim()) {
                    const stats = await this.plugin.memoryService.getStats();
                    if (stats.sessionCount > 0) {
                        const retriever = new MemoryRetriever(
                            this.plugin.globalFs,
                            this.plugin.memoryService,
                            () => this.plugin.semanticIndex,
                            this.plugin.memoryDB,
                        );
                        const sessionContext = await retriever.retrieveSessionContext(text);
                        if (sessionContext) parts.push(sessionContext);
                    }
                }

                if (parts.length > 0) memoryContext = parts.join('\n\n');
            } catch (e) {
                console.warn('[Memory] Session retrieval failed:', e);
            }
        }

        // Recipe matching (ADR-017) — find procedural recipes before starting the task
        let recipesSection: string | undefined;
        // FEAT-32-01 PR 1.3 / ADR-131: capture the matches so we can pass
        // them into AgentTask.run via `recipeMatches`. Without this the
        // FastPath gate inside AgentTask would re-run `match()` and could
        // diverge from the Sidebar's `recipesSection` source.
        let recipeMatchesForRun: import('../core/mastery/RecipeMatchingService').RecipeMatchResult[] | undefined;
        if (this.plugin.settings.mastery.enabled && this.plugin.recipeMatchingService) {
            try {
                const matches = this.plugin.recipeMatchingService.match(text, activeMode.slug);
                console.debug(`[Mastery] Recipe matching: ${matches.length} match(es) for mode "${activeMode.slug}"`, matches.map(m => `${m.recipe.id} (${m.score.toFixed(2)})`));
                recipeMatchesForRun = matches;
                if (matches.length > 0) {
                    recipesSection = this.plugin.recipeMatchingService.buildPromptSection(matches);
                    console.debug(`[Mastery] Recipe section injected (${recipesSection.length} chars)`);
                }
            } catch (e) {
                console.warn('[Mastery] Recipe matching failed (non-fatal):', e);
            }
        } else {
            console.debug(`[Mastery] Skipped: enabled=${this.plugin.settings.mastery.enabled}, service=${!!this.plugin.recipeMatchingService}`);
        }

        await task.run({
            userMessage: messageToSend,
            taskId,
            initialMode: activeMode,
            history: this.conversationHistory,
            abortSignal: this.currentAbortController.signal,
            globalCustomInstructions: this.plugin.settings.globalCustomInstructions || undefined,
            includeTime: this.plugin.settings.includeCurrentTimeInContext ?? false,
            rulesContent: rulesContent || undefined,
            // FEAT-24-09 / ADR-116: SKILLS directory for the cached prefix.
            skillDirectorySection: skillDirectorySection || undefined,
            mcpClient: this.plugin.mcpClient,
            allowedMcpServers,
            memoryContext,
            pluginSkillsSection: pluginSkillsSection || undefined,
            recipesSection,
            // FEAT-32-01 PR 1.3 / ADR-131: hand the SAME matches to AgentTask
            // so the FastPath gate sees what `recipesSection` was built from.
            recipeMatches: recipeMatchesForRun,
            configDir: this.app.vault.configDir,
            conversationId: this.activeConversationId ?? undefined,
        });
    }

    /**
     * Trigger manual context condensing
     */
    private triggerManualCondensing(): void {
        if (!this.contextTracker) {
            new Notice('Context tracker not initialized');
            return;
        }

        const usage = this.contextTracker.getContextUsage();
        const percentage = usage.maxTokens > 0 ? (usage.tokensUsed / usage.maxTokens) * 100 : 0;

        if (percentage < 60) {
            new Notice('Context usage is below 60%. Condensing not needed yet.');
            return;
        }

        new Notice('Manual context condensing is not yet fully implemented. Please use automatic condensing.');
        // TODO: Implement manual condensing trigger
        // This requires either:
        // 1. Storing reference to current AgentTask
        // 2. Implementing condensing via separate API call
        // 3. Using event system to trigger condensing
        //
        // For now, automatic condensing at 65% threshold is active.
    }

    /**
     * Feature 3: Cancel the running request
     */
    private handleStop(): void {
        this.currentAbortController?.abort();
        this.currentAbortController = null;
        // FEAT-24-08 Steering: pending bubbles never reached the agent --
        // flip them to "discarded" so the user knows the correction was
        // never applied.
        for (const entry of this.steeringQueue) {
            this.markSteeringDiscarded(entry.bubbleEl);
        }
        this.steeringQueue = [];
        this.setRunningState(false);
    }

    /**
     * Toggle between send and stop button states.
     *
     * FEAT-24-08 / ADR-114 Steering-Hook: when a task is running and the
     * textarea has content, show Send (Claude-Code-style: typing morphs
     * Stop -> Send so Enter sends a steering message instead of stopping).
     * Empty textarea while running keeps Stop visible.
     * Textarea stays enabled so the user can type mid-run.
     */
    private setRunningState(running: boolean): void {
        if (this.modelButton) this.modelButton.disabled = running;
        // Textarea is no longer disabled when running -- needed for steering.
        if (this.textarea) this.textarea.disabled = false;
        this.refreshRunStateButtons();
    }

    /**
     * Pick the correct primary action button (Send vs Stop) based on running
     * state + textarea content. Called on running-state changes and on every
     * textarea input event.
     */
    private refreshRunStateButtons(): void {
        const running = this.currentAbortController !== null;
        const hasText = (this.textarea?.value.trim().length ?? 0) > 0;
        // Show Send when: not running OR running-with-text (steering mode).
        // Show Stop when: running AND empty textarea.
        const showSend = !running || hasText;
        if (this.sendButton) this.sendButton.classList.toggle('agent-u-hidden', !showSend);
        if (this.stopButton) this.stopButton.classList.toggle('agent-u-hidden', showSend);
    }

    /**
     * Clear conversation history and chat UI (New Chat)
     */
    private clearConversation(opts: { skipNavPush?: boolean } = {}): void {
        // Save current conversation before clearing (if there is one)
        this.saveCurrentConversation();
        // Enqueue memory extraction (fire-and-forget, threshold-gated)
        this.enqueueMemoryExtraction();
        // Finalize outgoing conversation: semantic title + frontmatter links (ADR-022)
        // Capture messages before clearing -- finalizeConversation runs async
        if (this.activeConversationId) {
            const msgs = [...this.uiMessages];
            void this.finalizeConversation(this.activeConversationId, msgs);
        }
        this.activeConversationId = null;
        this.uiMessages = [];
        this.conversationHistory = [];
        this.userDismissedContext = false;
        // Reset the per-conversation chat-header overrides so a pinned model,
        // forced thinking, or a chosen effort level does not leak into the next
        // conversation. The state-field comments claim a fresh-chat reset; this
        // is where that reset actually happens.
        this.chatModelOverride = null;
        this.chatThinkingOverride = DEFAULT_THINKING_OVERRIDE;
        this.chatEffortOverride = DEFAULT_EFFORT_OVERRIDE;
        this.updateModelButton();
        // ADR-048: Reset session flags when starting a new conversation
        this.plugin.sessionFlags.clear();
        this.onboarding?.reset();
        this.attachments.clear();
        // Conversation reset drops any pending fullDocTexts too (FIX-19-28-05 audit).
        void this.attachments.consumeFullDocTexts();
        if (this.chatContainer) {
            this.chatContainer.empty();
        }
        this.showWelcomeMessage();
        this.updateContextBadge();
        this.historyPanel?.setActiveId(null);

        if (!opts.skipNavPush) {
            this.pushNav(null);
        } else {
            this.updateNavButtons();
        }
    }

    /** Save the current conversation to ConversationStore (non-blocking). */
    private saveCurrentConversation(): void {
        const store = this.plugin.conversationStore;
        if (!store || !this.activeConversationId || this.uiMessages.length === 0) return;
        const convId = this.activeConversationId;
        const messagesSnapshot = [...this.uiMessages];
        store.save(convId, this.conversationHistory, this.uiMessages).then(() => {
            // FEATURE-0320 Phase 6: re-index history_chunks after every save.
            void this.plugin.historyIndexer?.onConversationSaved(convId, messagesSnapshot);
        }).catch((e) => console.warn('[History] Save failed:', e));
    }

    /**
     * Post-processing hook: scan agent response for `- [ ]` items and show selection modal.
     * ADR-026: Fire-and-forget (void-prefixed), does not block onComplete.
     */
    private maybeExtractTasks(text: string): void {
        try {
            const items = scanTasks(text);
            if (items.length === 0) return;

            const sourceNote = this.app.workspace.getActiveFile()?.basename ?? '';
            const settings = this.plugin.settings.taskExtraction;

            const taskNotesActive = this.isTaskNotesActive();
            const useTaskNotes = taskNotesActive && (settings.preferTaskNotesPlugin ?? true);

            // Show recommendation if TaskNotes is not active and hint not dismissed
            if (!taskNotesActive && !(settings.taskNotesHintDismissed ?? false)) {
                this.showTaskNotesRecommendation();
            }

            new TaskSelectionModal(
                this.app,
                items,
                useTaskNotes,
                async (selected) => {
                    try {
                        const creator = useTaskNotes
                            ? new TaskNotesAdapter(this.app)
                            : new TaskNoteCreator(this.app);
                        const created = await creator.createNotes(selected, settings, sourceNote);
                        if (created.length > 0) {
                            const format = useTaskNotes ? t('notice.taskNotesCreatedFormatSuffix') : '';
                            new Notice(t('notice.taskNotesCreated', { count: created.length, format }));
                        }
                    } catch (err) {
                        console.warn('[TaskExtraction] Failed to create task notes:', err);
                        new Notice(t('notice.taskNotesError'));
                    }
                },
            ).open();
        } catch (err) {
            console.error('[TaskExtraction] Scan failed:', err);
            new Notice(t('notice.taskExtractionError', { error: err instanceof Error ? err.message : String(err) }));
        }
    }

    /** Checks whether the TaskNotes community plugin is currently enabled */
    private isTaskNotesActive(): boolean {
        const plugins = (this.app as unknown as { plugins?: { enabledPlugins?: Set<string> } }).plugins;
        return plugins?.enabledPlugins?.has('tasknotes') ?? false;
    }

    /** Shows a non-blocking recommendation notice for the TaskNotes plugin */
    private showTaskNotesRecommendation(): void {
        const plugins = (this.app as unknown as { plugins?: { manifests?: Record<string, unknown> } }).plugins;
        const isInstalled = !!plugins?.manifests?.['tasknotes'];

        const message = isInstalled
            ? 'Das Community Plugin "TaskNotes" ist installiert aber nicht aktiv. Aktiviere es fuer erweiterte Task-Verwaltung (Kanban, Kalender, Recurring Tasks).'
            : 'Tipp: Das Community Plugin "TaskNotes" bietet erweiterte Task-Verwaltung mit Kanban, Kalender und Recurring Tasks. Installierbar ueber Einstellungen > Community Plugins.';

        const fragment = createFragment((frag) => {
            frag.createSpan({ text: message });
            const dismissLink = frag.createEl('a', {
                text: 'Nicht mehr anzeigen',
                cls: 'agent-u-task-hint-dismiss',
            });
            dismissLink.addClass('agent-u-task-hint-dismiss-link');
            dismissLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.plugin.settings.taskExtraction = {
                    ...this.plugin.settings.taskExtraction,
                    taskNotesHintDismissed: true,
                };
                void this.plugin.saveSettings();
                notice.hide();
            });
        });
        const notice = new Notice(fragment, 12000);
    }

    /** Enqueue memory extraction if the conversation meets the threshold. Fire-and-forget. */
    private enqueueMemoryExtraction(): void {
        const mem = this.plugin.settings.memory;
        const queue = this.plugin.extractionQueue;
        if (!mem.enabled || !mem.autoExtractSessions || !queue) return;
        if (!this.activeConversationId) return;

        // Pinned conversations (already have facts in memory) get a
        // lower threshold of 1 -- the user explicitly opted into memory
        // for them, every new message is potentially relevant. Fresh
        // conversations still wait for the configured threshold so
        // smalltalk doesn't trigger an extraction.
        const isPinned = this.plugin.countMemoryFactsForConversation(this.activeConversationId) > 0;
        const threshold = isPinned ? 1 : mem.extractionThreshold;
        if (this.uiMessages.length < threshold) return;

        const snapshot = this.snapshotForMemory();
        if (!snapshot) return;
        queue.enqueue(snapshot).catch((e) => console.warn('[Memory] Enqueue failed:', e));
    }

    /**
     * Public snapshot of the active conversation in the shape ExtractionQueue
     * needs. Returns null when nothing is queueable. Used by the manual paths
     * (Star button, mark_for_memory tool) which always run regardless of the
     * autoExtractSessions toggle and the message-threshold.
     */
    snapshotForMemory(): { conversationId: string; messages: Array<{ role: 'user' | 'assistant'; text: string }>; title: string; queuedAt: string } | null {
        if (!this.activeConversationId || this.uiMessages.length === 0) return null;
        const messages = this.uiMessages.map((m) => ({ role: m.role, text: m.text }));
        const title = this.uiMessages.find((m) => m.role === 'user')?.text.slice(0, 60).replace(/\n/g, ' ').trim()
            || t('ui.sidebar.conversation');
        return {
            conversationId: this.activeConversationId,
            messages,
            title,
            queuedAt: new Date().toISOString(),
        };
    }

    /**
     * Finalize a conversation on end (clear/switch/unload): generate semantic title,
     * stamp frontmatter links, clean up pending paths. (ADR-022)
     * Fire-and-forget caller — errors are caught internally.
     */
    /** Stamp a chat link into the currently active file's frontmatter. */
    private async stampChatLinkToActiveFile(conversationId: string, title: string): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof TFile) || file.extension !== 'md') {
            new Notice(t('ui.history.noActiveNote'));
            return;
        }
        const uri = `obsidian://vault-operator-chat?id=${encodeURIComponent(conversationId)}`;
        const link = `[${title}](${uri})`;
        try {
            await this.app.fileManager.processFrontMatter(file, (fm) => {
                const links: string[] = fm['Chats'] ?? [];
                if (links.some((l: string) => l.includes(conversationId))) {
                    new Notice(t('ui.history.linkAlreadyExists'));
                    return;
                }
                links.push(link);
                fm['Chats'] = links;
            });
            new Notice(t('ui.history.linkAdded'));
        } catch (e) {
            console.warn('[ChatLink] Failed to stamp active file:', e);
            new Notice(t('ui.history.linkAddFailed'));
        }
    }

    /**
     * Finalize a conversation: generate semantic title, stamp frontmatter links.
     * Messages are passed in because this.uiMessages may already be cleared when this runs.
     */
    private async finalizeConversation(
        conversationId: string,
        messages: Array<{ role: string; text: string }>,
    ): Promise<void> {
        const settings = this.plugin.settings;
        const store = this.plugin.conversationStore;
        if (!store) return;

        // 1. Semantic titling (always, if model resolvable)
        // FEAT-24-08 Welle A: resolver falls back to active-provider
        // fast-tier when no explicit key is set, so titling stays alive
        // after the EPIC-26 migration to provider-only config.
        const model = this.plugin.getTitlingModel();

        if (model) {
            const userMsg = messages.find((m) => m.role === 'user')?.text ?? '';
            const assistantMsg = messages.find((m) => m.role === 'assistant')?.text ?? '';

            if (userMsg) {
                try {
                    const api = buildApiHandlerForModel(model);
                    const stream = api.createMessage(
                        'Create a short title (maximum 5-8 words) for this conversation. '
                        + 'The title must capture the essence, not summarize. '
                        + 'Output ONLY the title. No quotes, no prefix, no explanation. '
                        + 'Same language as the user.',
                        [{ role: 'user', content: `User: ${userMsg.slice(0, 300)}\nAssistant: ${assistantMsg.slice(0, 300)}` }],
                        [],
                    );
                    let title = '';
                    for await (const chunk of stream) {
                        if (chunk.type === 'text') title += chunk.text;
                    }
                    title = title.trim().replace(/^["']|["']$/g, '').replace(/\n.*/s, '');
                    if (title.length > 60) title = title.slice(0, 57) + '...';
                    if (title) {
                        console.debug(`[ChatLink] Semantic title: "${title}"`);
                        await store.updateMeta(conversationId, { title });
                    }
                } catch (e) {
                    console.warn('[ChatLink] Semantic title generation failed (non-fatal):', e);
                }
            }
        }

        // 2. Stamp frontmatter links with final title
        if (settings.chatLinking?.enabled) {
            await this.plugin.flushPendingChatLinks(conversationId);
            this.plugin.clearPendingChatLinks(conversationId);
        }

        this.historyPanel?.refresh();
    }

    /** Public entry point for deep-link protocol handler (ADR-022, FEATURE-300). */
    loadConversationById(id: string): Promise<void> {
        return this.loadConversation(id);
    }

    /**
     * Push the next conversation onto the nav stack and truncate forward
     * history -- standard browser semantics. Called from loadConversation
     * for "fresh" navigations (deep-links, history-panel clicks); skipped
     * when the navigation itself comes from the back/forward arrows.
     */
    private pushNav(id: string | null): void {
        // Drop any "forward" entries beyond the current cursor.
        if (this.navIndex < this.navStack.length - 1) {
            this.navStack = this.navStack.slice(0, this.navIndex + 1);
        }
        // Don't stack consecutive duplicates (e.g. re-loading the same chat).
        const top = this.navStack[this.navStack.length - 1];
        if (top !== id) {
            this.navStack.push(id);
            this.navIndex = this.navStack.length - 1;
        }
        // Soft cap at 50 entries so a long session doesn't grow unbounded.
        if (this.navStack.length > 50) {
            const overflow = this.navStack.length - 50;
            this.navStack = this.navStack.slice(overflow);
            this.navIndex = Math.max(0, this.navIndex - overflow);
        }
        this.updateNavButtons();
    }

    private async navBack(): Promise<void> {
        if (this.navIndex <= 0) return;
        this.navIndex -= 1;
        const target = this.navStack[this.navIndex];
        await this.loadConversation(target ?? null, { skipNavPush: true });
    }

    private async navForward(): Promise<void> {
        if (this.navIndex >= this.navStack.length - 1) return;
        this.navIndex += 1;
        const target = this.navStack[this.navIndex];
        await this.loadConversation(target ?? null, { skipNavPush: true });
    }

    private updateNavButtons(): void {
        if (this.navBackBtn) {
            const canBack = this.navIndex > 0;
            this.navBackBtn.disabled = !canBack;
            this.navBackBtn.classList.toggle('agent-u-hidden', this.navStack.length < 2);
        }
        if (this.navForwardBtn) {
            const canForward = this.navIndex < this.navStack.length - 1;
            this.navForwardBtn.disabled = !canForward;
            this.navForwardBtn.classList.toggle('agent-u-hidden', this.navStack.length < 2);
        }
    }

    /** Load a conversation from history and restore it in the chat panel. */
    private async loadConversation(
        id: string | null,
        opts: { skipNavPush?: boolean } = {},
    ): Promise<void> {
        if (id === null) {
            // Back-arrow target was an "empty chat" sentinel -- clear without
            // re-pushing it onto the stack. clearConversation reads navStack
            // state via the same skipNavPush flag.
            this.clearConversation({ skipNavPush: true });
            return;
        }
        const store = this.plugin.conversationStore;
        if (!store) return;

        const data = await store.load(id);
        if (!data) {
            new Notice(t('notice.loadConversationFailed'));
            return;
        }

        // Save current conversation before switching
        this.saveCurrentConversation();
        // Finalize outgoing conversation: semantic title + frontmatter links (ADR-022)
        // Capture messages before switching -- finalizeConversation runs async
        if (this.activeConversationId) {
            const msgs = [...this.uiMessages];
            void this.finalizeConversation(this.activeConversationId, msgs);
        }

        // Reset state
        this.conversationHistory = data.messages;
        this.uiMessages = data.uiMessages;
        this.activeConversationId = id;
        this.userDismissedContext = false;
        this.attachments.clear();
        // Conversation switch drops any pending fullDocTexts too (FIX-19-28-05 audit).
        void this.attachments.consumeFullDocTexts();

        // Re-render chat. Collect (uiMessage, DOM) pairs so the checkpoint
        // rehydrate step below can attach live markers per assistant turn.
        const assistantPairs: { msg: UiMessage; el: HTMLElement }[] = [];
        if (this.chatContainer) {
            this.chatContainer.empty();
            for (const msg of data.uiMessages) {
                if (msg.role === 'user') {
                    this.addUserMessage(msg.text);
                } else {
                    const el = this.renderMarkdownMessage(msg.text, 'assistant', msg.toolStepsHtml, msg.reasoningText);
                    if (el) assistantPairs.push({ msg, el });
                }
            }
        }
        this.historyPanel?.setActiveId(id);
        this.updateContextBadge();

        // FIX-01-07-02: rebuild checkpoint markers inline at the assistant
        // message they belong to. The shadow repo holds the snapshots across
        // plugin reloads, but the in-memory taskCheckpoints map starts empty
        // and the rehydrated toolStepsHtml only carries dead marker spans
        // (the live event listeners are gone). For every assistant message
        // with a persisted taskId we strip the stale markers and render new
        // live ones via renderCheckpointMarker.
        void this.rehydrateCheckpointMarkers(assistantPairs);

        if (!opts.skipNavPush) {
            this.pushNav(id);
        } else {
            this.updateNavButtons();
        }
    }

    /** Delete a conversation from history. */
    private async deleteConversation(id: string): Promise<void> {
        const store = this.plugin.conversationStore;
        if (!store) return;
        // Cascade: remove derived memory artefacts (facts, session summary,
        // thread-delta) before the conversation file itself is gone, so the
        // user expectation "delete the chat = delete its memory" holds.
        await this.plugin.deleteMemoryForConversationCascade(id).catch((e) =>
            console.warn('[Memory] cascade delete failed (non-fatal):', e),
        );
        await store.delete(id);
        // If the deleted conversation is the active one, clear the chat
        if (this.activeConversationId === id) {
            this.activeConversationId = null;
            this.uiMessages = [];
            this.conversationHistory = [];
            this.plugin.sessionFlags.clear(); // ADR-048
            if (this.chatContainer) {
                this.chatContainer.empty();
            }
            this.showWelcomeMessage();
        }
        this.historyPanel?.refresh();
    }

    /**
     * Create the streaming message container.
     * Structure: thinkingEl → toolsEl → contentEl → footerEl
     */
    private createStreamingMessageEl(): {
        messageEl: HTMLElement;
        thinkingEl: HTMLElement;
        toolsEl: HTMLElement;
        contentEl: HTMLElement;
        footerEl: HTMLElement;
    } {
        if (!this.chatContainer) throw new Error('Chat container not initialized');
        const messageEl = this.chatContainer.createDiv('message assistant-message message-streaming');
        // Reasoning/thinking section (hidden until thinking chunks arrive)
        const thinkingEl = messageEl.createDiv('thinking-block');
        thinkingEl.classList.add('agent-u-hidden');
        // Tool calls area (populated by onToolStart)
        const toolsEl = messageEl.createDiv('message-tools');
        // Text response (streamed directly for Q&A, rendered on complete for agentic)
        const contentEl = messageEl.createDiv('message-content');
        // v2.10.4: also flag the content element so CSS can suppress the
        // streaming-cursor ::after without using :has(.message-loading)
        // (review-bot warns about :has() invalidation cost).
        contentEl.classList.add('has-loading');
        // Show a loading indicator immediately so the user sees something right away
        const loadingEl = contentEl.createDiv('message-loading');
        setIcon(loadingEl.createSpan('message-loading-icon'), 'loader');
        loadingEl.createSpan('message-loading-text').setText(t('ui.sidebar.working'));
        // Token usage + timestamp footer
        const footerEl = messageEl.createDiv('message-footer');
        footerEl.classList.add('agent-u-hidden');
        this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight });
        return { messageEl, thinkingEl, toolsEl, contentEl, footerEl };
    }

    /**
     * Feature 5: Map API error to a friendly title
     */
    private getErrorTitle(error: Error): string {
        const msg = error.message.toLowerCase();
        const status = (error as Error & { status?: number; statusCode?: number }).status ?? (error as Error & { statusCode?: number }).statusCode;
        if (status === 401 || msg.includes('api key') || msg.includes('authentication')) {
            return t('ui.error.invalidKey');
        }
        if (status === 404 || msg.includes('not found')) {
            return t('ui.error.modelNotFound');
        }
        if (status === 429 || msg.includes('rate limit')) {
            return t('ui.error.rateLimit');
        }
        if (status === 529 || msg.includes('overload')) {
            return t('ui.error.overloaded');
        }
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')) {
            return t('ui.error.network');
        }
        return t('ui.error.generic');
    }

    /**
     * Feature 2: Render markdown into a new assistant message (for static messages)
     */
    private renderMarkdownMessage(
        markdown: string,
        role: 'assistant' | 'user',
        toolStepsHtml?: string,
        reasoningText?: string,
    ): HTMLElement | null {
        if (!this.chatContainer) return null;
        const msgEl = this.chatContainer.createDiv(`message ${role}-message`);
        // FIX-04-03-07: re-inject captured reasoning text as a collapsed
        // "Reasoning..." bubble (same class names + behavior as the live
        // stream block so the existing CSS applies). Above tool steps and
        // markdown content -- mirrors the order the model produced.
        if (role === 'assistant' && reasoningText && reasoningText.length > 0) {
            const thinkingEl = msgEl.createDiv('thinking-block');
            const header = thinkingEl.createDiv('thinking-header');
            setIcon(header.createSpan('thinking-spinner'), 'chevron-right');
            header.createSpan('thinking-label').setText(t('ui.sidebar.reasoningCollapsed'));
            const body = thinkingEl.createDiv('thinking-content');
            body.classList.add('agent-u-hidden');
            body.setText(reasoningText);
            header.addEventListener('click', () => {
                body.classList.toggle('agent-u-hidden');
            });
        }
        // Re-inject the collapsed agent steps block above the markdown so
        // the user can still expand "what did the agent do?" after a chat
        // reload. Parsed via DOMParser to avoid innerHTML and keep the
        // review-bot rules clean.
        if (role === 'assistant' && toolStepsHtml) {
            const toolsEl = msgEl.createDiv('message-tools');
            try {
                const parsed = new DOMParser().parseFromString(toolStepsHtml, 'text/html');
                const root = parsed.body.firstElementChild;
                if (root) {
                    // Imported nodes are detached from the parsed document;
                    // appending them moves the (already-styled) <details>
                    // tree into the live message element.
                    toolsEl.appendChild(activeDocument.importNode(root, true));
                    // Always start collapsed on rehydration so the chat
                    // doesn't visually explode when an old turn is reopened.
                    toolsEl.querySelectorAll('details').forEach((d) => {
                        if (d != null && d.instanceOf(HTMLDetailsElement)) d.open = false;
                    });
                }
            } catch (e) {
                console.warn('[AgentSidebar] Failed to rehydrate tool steps block:', e);
            }
        }
        const contentEl = msgEl.createDiv('message-content');
        void MarkdownRenderer.render(this.app, markdown, contentEl, '', this);
        // Restore action buttons for history messages
        if (role === 'assistant') {
            this.addResponseActions(msgEl, markdown);
        } else {
            this.addUserMessageActions(msgEl, markdown);
        }
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        return msgEl;
    }

    /**
     * FEAT-24-08 / ADR-114 Steering-Hook: render a mid-run user correction
     * as a distinct bubble. Three lifecycle states tracked via CSS classes:
     *
     *   - `steering-pending`    queued, waiting for next iteration
     *   - `steering-delivered`  picked up by AgentTask at iteration N
     *   - `steering-discarded`  task ended (Stop or completion) before drain
     *
     * Returns the bubble element so the queue can update its state later.
     */
    private addSteeringMessage(text: string): HTMLElement {
        const msgEl = this.chatContainer!.createDiv('message user-message chat-message-steering steering-pending');
        // Marker row above the content: small arrow icon + "Steering" label
        const markerRow = msgEl.createDiv('steering-marker');
        setIcon(markerRow.createSpan('steering-marker-icon'), 'corner-down-right');
        markerRow.createSpan('steering-marker-label').setText(t('ui.sidebar.steeringLabel'));
        // Bubble content
        msgEl.createDiv('message-content').setText(text);
        // Status footer (pending now, will be replaced on delivery / discard)
        const footer = msgEl.createDiv('steering-footer');
        setIcon(footer.createSpan('steering-footer-icon'), 'clock');
        footer.createSpan('steering-footer-text').setText(t('ui.sidebar.steeringQueued'));
        this.chatContainer!.scrollTop = this.chatContainer!.scrollHeight;
        return msgEl;
    }

    /**
     * Flip a steering bubble to "delivered" state once AgentTask has
     * consumed it. Updates icon (clock -> check) and footer label
     * ("queued" -> "delivered at iteration N").
     */
    private markSteeringDelivered(bubbleEl: HTMLElement, iteration: number): void {
        bubbleEl.classList.remove('steering-pending');
        bubbleEl.classList.add('steering-delivered');
        const footer = bubbleEl.querySelector<HTMLElement>('.steering-footer');
        if (!footer) return;
        footer.empty();
        setIcon(footer.createSpan('steering-footer-icon'), 'check');
        footer.createSpan('steering-footer-text').setText(
            t('ui.sidebar.steeringDelivered', { iteration: String(iteration) }),
        );
    }

    /**
     * Flip a steering bubble to "discarded" state when the task ended
     * (Stop or natural completion) before the queue entry was drained.
     * Updates icon (clock -> x) and footer label ("queued" -> "not delivered").
     */
    private markSteeringDiscarded(bubbleEl: HTMLElement): void {
        bubbleEl.classList.remove('steering-pending');
        bubbleEl.classList.add('steering-discarded');
        const footer = bubbleEl.querySelector<HTMLElement>('.steering-footer');
        if (!footer) return;
        footer.empty();
        setIcon(footer.createSpan('steering-footer-icon'), 'x');
        footer.createSpan('steering-footer-text').setText(t('ui.sidebar.steeringDiscarded'));
    }

    private addUserMessage(text: string, attachments: AttachmentItem[] = [], activeFile?: TFile | null): void {
        if (!this.chatContainer) return;
        const msgEl = this.chatContainer.createDiv('message user-message');
        // Render attachment previews above the text bubble
        const hasAttachments = attachments.length > 0 || !!activeFile;
        if (hasAttachments) {
            const previewRow = msgEl.createDiv('message-attachment-previews');
            // "Current" chip for the auto-injected active file
            if (activeFile) {
                const chip = previewRow.createDiv('message-attachment-chip');
                setIcon(chip.createSpan('attachment-chip-icon'), 'file-text');
                chip.createSpan('attachment-chip-name').setText(activeFile.basename);
                chip.createSpan('attachment-current-badge').setText(t('ui.sidebar.currentFile'));
            }
            for (const att of attachments) {
                const chip = previewRow.createDiv('message-attachment-chip');
                if (att.objectUrl) {
                    const img = chip.createEl('img', { cls: 'attachment-chip-thumb' });
                    img.src = att.objectUrl;
                    img.alt = att.name;
                } else {
                    setIcon(chip.createSpan('attachment-chip-icon'), 'file-text');
                    chip.createSpan('attachment-chip-name').setText(att.name);
                }
            }
        }
        if (text) {
            msgEl.createDiv('message-content').setText(text);
        }
        // Action bar: copy + edit/resend
        this.addUserMessageActions(msgEl, text);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    /** Add copy and edit+resend action buttons below a user message bubble. */
    private addUserMessageActions(msgEl: HTMLElement, text: string): void {
        const bar = msgEl.createDiv('user-message-actions');
        const makeBtn = (icon: string, tooltip: string, onClick: () => void) => {
            const btn = bar.createEl('button', { cls: 'message-action-btn', attr: { 'aria-label': tooltip } });
            setIcon(btn, icon);
            btn.title = tooltip;
            btn.addEventListener('click', onClick);
        };

        // Copy message text
        makeBtn('copy', t('ui.sidebar.copy'), () => {
            void navigator.clipboard.writeText(text);
            new Notice(t('notice.copied'));
        });

        // Edit and resend: put text back in textarea, remove this message + all following
        makeBtn('pencil', t('ui.sidebar.editResend'), () => {
            if (!this.textarea || !this.chatContainer) return;
            this.textarea.value = text;
            this.autoResizeTextarea();
            this.textarea.focus();
            // Remove this message and everything after it
            const allMessages = Array.from(this.chatContainer.querySelectorAll('.message'));
            const idx = allMessages.indexOf(msgEl);
            if (idx >= 0) {
                for (let i = allMessages.length - 1; i >= idx; i--) {
                    allMessages[i].remove();
                }
            }
            // Also trim uiMessages and conversationHistory to match
            const userMsgIndices: number[] = [];
            this.uiMessages.forEach((m, i) => { if (m.role === 'user') userMsgIndices.push(i); });
            // Count which user message this is in the DOM
            const userBubblesBefore = allMessages.slice(0, idx).filter(el => el.classList.contains('user-message')).length;
            const uiIdx = userMsgIndices[userBubblesBefore];
            if (uiIdx !== undefined) {
                this.uiMessages.splice(uiIdx);
            }
            if (this.conversationHistory.length > 0) {
                let userCount = 0;
                for (let i = 0; i < this.conversationHistory.length; i++) {
                    if (this.conversationHistory[i].role === 'user') {
                        if (userCount === userBubblesBefore) {
                            this.conversationHistory.splice(i);
                            break;
                        }
                        userCount++;
                    }
                }
            }
        });
    }

    private addAssistantMessage(markdown: string): void {
        this.renderMarkdownMessage(markdown, 'assistant');
    }

    private switchMode(modeSlug: string): void {
        void this.modeService.switchMode(modeSlug); // saves settings
        this.updateModelButton(); // model may differ per agent
    }



    // ── Ellipsis options menu ─────────────────────────────────────────────────

    /** Add options menu items to an existing menu (used by both ellipsis and standalone). */
    private addOptionsMenuItems(menu: Menu): void {
        const settings = this.plugin.settings;

        // Refresh Index (current file)
        menu.addItem((item) => {
            item.setTitle(t('ui.menu.refreshIndex'));
            item.setIcon('refresh-cw');
            item.onClick(async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) { new Notice(t('notice.noActiveFile')); return; }
                if (!this.plugin.semanticIndex) { new Notice(t('notice.semanticDisabled')); return; }
                await this.plugin.semanticIndex.updateFile(activeFile.path);
                new Notice(t('notice.indexRefreshed'));
            });
        });

        // Force Reindex Vault
        menu.addItem((item) => {
            item.setTitle(t('ui.menu.forceReindex'));
            item.setIcon('database');
            item.onClick(() => {
                if (!this.plugin.semanticIndex) { new Notice(t('notice.semanticDisabled')); return; }
                if (this.plugin.semanticIndex.building) { new Notice(t('notice.indexingInProgress')); return; }
                new Notice(t('notice.reindexingVault'));
                this.plugin.semanticIndex.buildIndex(undefined, true).then(() =>
                    new Notice(t('notice.vaultIndexRebuilt'))
                ).catch((e: Error) => new Notice(t('notice.reindexFailed', { error: e.message })));
            });
        });

        // Vault Health Check
        menu.addItem((item) => {
            item.setTitle('Vault health check');
            item.setIcon('stethoscope');
            item.onClick(async () => {
                if (!this.plugin.vaultHealthService) {
                    new Notice('Vault health service not available. Enable semantic index first.');
                    return;
                }
                new Notice('Running vault health check...');
                await this.plugin.vaultHealthService.runChecks();
                const findings = this.plugin.vaultHealthService.getFindings();
                if (findings.length === 0) {
                    new Notice('No issues found. Vault is healthy.');
                    return;
                }
                this.openHealthModal();
            });
        });

        // Cancel Indexing (only shown while building)
        if (this.plugin.semanticIndex?.building) {
            menu.addItem((item) => {
                item.setTitle(t('ui.menu.cancelIndexing'));
                item.setIcon('x-circle');
                item.onClick(() => {
                    this.plugin.semanticIndex?.cancelBuild();
                    new Notice(t('notice.indexingCancelled'));
                });
            });
        }

        menu.addSeparator();

        // Add Open Note in Context (toggle)
        menu.addItem((item) => {
            const enabled = settings.autoAddActiveFileContext;
            item.setTitle(t('ui.menu.addOpenNote'));
            item.setIcon(enabled ? 'check' : 'file-text');
            item.setChecked(enabled);
            item.onClick(async () => {
                settings.autoAddActiveFileContext = !enabled;
                await this.plugin.saveSettings();
                this.updateContextBadge();
            });
        });

        // Auto-accept Edits (toggle)
        menu.addItem((item) => {
            const enabled = settings.autoApproval.noteEdits && settings.autoApproval.vaultChanges;
            item.setTitle(t('ui.menu.autoAcceptEdits'));
            item.setIcon(enabled ? 'check' : 'pencil');
            item.setChecked(enabled);
            item.onClick(async () => {
                const newVal = !enabled;
                settings.autoApproval.noteEdits = newVal;
                settings.autoApproval.vaultChanges = newVal;
                await this.plugin.saveSettings();
                new Notice(t('notice.autoAcceptEdits', { value: newVal ? 'on' : 'off' }));
            });
        });

    }

    /** Show the options menu (standalone, for backward compat). */
    private showOptionsMenu(e: MouseEvent): void {
        const menu = new Menu();
        this.addOptionsMenuItems(menu);
        menu.showAtMouseEvent(e);
    }


    // -------------------------------------------------------------------------
    // Tool display helpers (Kilo Code style)
    // -------------------------------------------------------------------------

    private getToolIcon(toolName: string): string {
        return TOOL_METADATA[toolName]?.icon ?? 'terminal';
    }

    private formatToolLabel(toolName: string): string {
        return TOOL_METADATA[toolName]?.label ?? toolName;
    }

    private getToolBriefParam(input: Record<string, unknown>): string {
        return (input?.path ?? input?.url ?? input?.query ?? input?.question ?? '') as string;
    }

    /**
     * Label for grouped tool calls — shows singular or plural form with count.
     * Used when consecutive same-type groupable tool calls are collapsed into one row.
     */
    private formatGroupedLabel(name: string, count: number): string {
        const labels: Record<string, [string, string]> = {
            read_file:        [t('ui.toolActivity.readFile'),       t('ui.toolActivity.readFiles')],
            list_files:       [t('ui.toolActivity.listFiles'),      t('ui.toolActivity.listFiles')],
            search_files:     [t('ui.toolActivity.searching'),      t('ui.toolActivity.searching')],
            get_frontmatter:  [t('ui.toolActivity.readingMetadata'),t('ui.toolActivity.readingMetadata')],
            get_linked_notes: [t('ui.toolActivity.findingLinks'),   t('ui.toolActivity.findingLinks')],
            search_by_tag:    [t('ui.toolActivity.searchingByTag'), t('ui.toolActivity.searchingByTag')],
            get_vault_stats:  [t('ui.toolActivity.vaultOverview'),  t('ui.toolActivity.vaultOverview')],
            get_daily_note:   [t('ui.toolActivity.readingDailyNote'),t('ui.toolActivity.readingDailyNotes')],
            web_fetch:        [t('ui.toolActivity.fetchingPage'),   t('ui.toolActivity.fetchingPages')],
            web_search:       [t('ui.toolActivity.searchingWeb'),   t('ui.toolActivity.searchingWeb')],
            semantic_search:  [t('ui.toolActivity.semanticSearch'), t('ui.toolActivity.semanticSearches')],
        };
        const [singular, plural] = labels[name] ?? [name, name];
        return count === 1 ? singular : `${plural} (${count})`;
    }

    // -------------------------------------------------------------------------
    // Response action bar + link wiring
    // -------------------------------------------------------------------------

    /**
     * Make internal [[wikilinks]] and note links in the rendered markdown clickable.
     * MarkdownRenderer handles most links, but we intercept to ensure sidebar context.
     *
     * Special-case obsidian://obsilo-chat?id=X URLs (used by recall_memory and
     * search_history outputs): route through the plugin's deep-link handler
     * directly. Without this they'd fall through to openLinkText() and the
     * ":" in the protocol scheme triggers a createFolder error.
     */
    private wireInternalLinks(contentEl: HTMLElement): void {
        contentEl.querySelectorAll('a').forEach((anchor) => {
            const href = anchor.getAttribute('href') ?? '';
            if (href.startsWith('obsidian://vault-operator-chat') || href.startsWith('obsidian://obsilo-chat')) {
                anchor.addEventListener('click', (e) => {
                    e.preventDefault();
                    const match = /[?&]id=([^&]+)/.exec(href);
                    if (match) {
                        const id = decodeURIComponent(match[1]);
                        void this.plugin.openChatById(id);
                    }
                });
                return;
            }
            // Internal links: [[Note]] renders as data-href or href without http
            if (!href.startsWith('http') && !href.startsWith('mailto')) {
                anchor.addEventListener('click', (e) => {
                    e.preventDefault();
                    const linkText = anchor.getAttribute('data-href') ?? href;
                    void this.app.workspace.openLinkText(linkText, '', false);
                });
            }
        });
    }

    // -------------------------------------------------------------------------
    // Perplexity-style inline citations
    // -------------------------------------------------------------------------

    /**
     * Parse and extract [sources]...[/sources] block from the model's response.
     * Returns cleaned text (without the block) and an array of parsed sources.
     */
    private parseSources(text: string): { cleanText: string; sources: { num: number; note: string; context: string }[] } {
        const match = text.match(/\[sources\]\s*\n?([\s\S]*?)\[\/sources\]/);
        if (!match) return { cleanText: text, sources: [] };

        const cleanText = text.replace(/\[sources\]\s*\n?[\s\S]*?\[\/sources\]/, '').trimEnd();
        const sources: { num: number; note: string; context: string }[] = [];

        for (const line of match[1].split('\n')) {
            const lineMatch = line.trim().match(/^(\d+)\.\s+(.+?)(?:\s+[—-]+\s+(.+))?$/);
            if (lineMatch) {
                sources.push({
                    num: parseInt(lineMatch[1]),
                    note: lineMatch[2].trim(),
                    context: lineMatch[3]?.trim() ?? '',
                });
            }
        }

        return { cleanText, sources };
    }

    /**
     * Parse and extract [followups]...[/followups] block from the model's response.
     * Returns cleaned text and an array of follow-up action strings.
     */
    private parseFollowups(text: string): { cleanText: string; heading: string; followups: string[] } {
        const match = text.match(/\[followups(?:\s+heading="([^"]*)")?\]\s*\n?([\s\S]*?)\[\/followups\]/);
        if (!match) return { cleanText: text, heading: '', followups: [] };

        const cleanText = text.replace(/\[followups(?:\s+heading="[^"]*")?\]\s*\n?[\s\S]*?\[\/followups\]/, '').trimEnd();
        const heading = match[1] || '';
        const followups = match[2].split('\n')
            .map(line => line.replace(/^[-*]\s*/, '').trim())
            .filter(line => line.length > 0);

        return { cleanText, heading, followups };
    }

    /**
     * Convert inline [N] references in rendered HTML to clickable citation badges.
     * Only converts numbers that match a parsed source.
     */
    private wireCitationBadges(contentEl: HTMLElement, sources: { num: number; note: string; context: string }[]): void {
        if (sources.length === 0) return;

        const sourceNums = new Set(sources.map(s => s.num));
        const walker = activeDocument.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
        const replacements: { node: Text; text: string }[] = [];

        while (walker.nextNode()) {
            const textNode = walker.currentNode as Text;
            // Skip text inside code blocks
            if (textNode.parentElement?.closest('code, pre')) continue;
            const text = textNode.textContent ?? '';
            if (/\[\d+\]/.test(text)) {
                replacements.push({ node: textNode, text });
            }
        }

        for (const { node, text } of replacements) {
            const fragment = activeDocument.createDocumentFragment();
            let lastIndex = 0;
            let replaced = false;

            for (const m of text.matchAll(/\[(\d+)\]/g)) {
                const num = parseInt(m[1]);
                if (!sourceNums.has(num)) continue;
                const matchIndex = m.index ?? 0;

                const source = sources.find(s => s.num === num);
                if (!source) continue;

                // Text before this match
                if (matchIndex > lastIndex) {
                    fragment.appendChild(activeDocument.createTextNode(text.slice(lastIndex, matchIndex)));
                }

                // Citation badge
                const badge = activeDocument.createElement('span');
                badge.className = 'source-badge';
                badge.textContent = String(num);
                badge.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showSourcePopup(badge, source);
                });
                fragment.appendChild(badge);

                lastIndex = matchIndex + m[0].length;
                replaced = true;
            }

            if (replaced) {
                // Remaining text after last match
                if (lastIndex < text.length) {
                    fragment.appendChild(activeDocument.createTextNode(text.slice(lastIndex)));
                }
                node.parentNode?.replaceChild(fragment, node);
            }
        }
    }

    /**
     * Clamp a fixed-position popup to the visible viewport.
     * Call after appending to activeDocument.body so dimensions are known.
     */
    private clampPopupToViewport(popup: HTMLElement): void {
        window.requestAnimationFrame(() => {
            const r = popup.getBoundingClientRect();
            const pad = 8;
            if (r.right > window.innerWidth) {
                popup.setCssProps({ '--popup-left': `${window.innerWidth - r.width - pad}px` });
            }
            if (r.left < 0) {
                popup.setCssProps({ '--popup-left': `${pad}px` });
            }
            if (r.bottom > window.innerHeight) {
                popup.setCssProps({ '--popup-top': `${window.innerHeight - r.height - pad}px`, '--popup-bottom': '' });
            }
            if (r.top < 0) {
                popup.setCssProps({ '--popup-top': `${pad}px`, '--popup-bottom': '' });
            }
        });
    }

    /**
     * Attach a click-outside close handler to a popup.
     */
    private attachPopupCloseHandler(popup: HTMLElement, anchor: HTMLElement): void {
        const close = (e: MouseEvent) => {
            if (!popup.contains(e.target as Node) && e.target !== anchor) {
                popup.remove();
                activeDocument.removeEventListener('click', close);
            }
        };
        window.setTimeout(() => activeDocument.addEventListener('click', close), 10);
    }

    /**
     * Show a popup card for a single source (badge click).
     */
    private showSourcePopup(anchor: HTMLElement, source: { num: number; note: string; context: string }): void {
        activeDocument.querySelectorAll('.source-popup').forEach(el => el.remove());

        const popup = activeDocument.createElement('div');
        popup.className = 'source-popup';

        const titleEl = activeDocument.createElement('div');
        titleEl.className = 'source-popup-title';
        const noteName = source.note.replace(/^\[\[|\]\]$/g, '');
        titleEl.textContent = noteName;
        titleEl.addEventListener('click', () => {
            void this.app.workspace.openLinkText(noteName, '', false);
            popup.remove();
        });
        popup.appendChild(titleEl);

        if (source.context) {
            const ctxEl = activeDocument.createElement('div');
            ctxEl.className = 'source-popup-context';
            ctxEl.textContent = source.context;
            popup.appendChild(ctxEl);
        }

        const rect = anchor.getBoundingClientRect();
        popup.setCssProps({ '--popup-top': `${rect.bottom + 4}px`, '--popup-left': `${Math.max(4, rect.left - 40)}px` });

        activeDocument.body.appendChild(popup);
        this.clampPopupToViewport(popup);
        this.attachPopupCloseHandler(popup, anchor);
    }

    /**
     * Show a panel listing all sources (sources indicator click).
     */
    private showSourcesPanel(anchor: HTMLElement, sources: { num: number; note: string; context: string }[]): void {
        activeDocument.querySelectorAll('.source-popup').forEach(el => el.remove());

        const popup = activeDocument.createElement('div');
        popup.className = 'source-popup sources-panel';

        for (const source of sources) {
            const row = activeDocument.createElement('div');
            row.className = 'source-panel-row';

            const numEl = activeDocument.createElement('span');
            numEl.className = 'source-badge';
            numEl.textContent = String(source.num);
            row.appendChild(numEl);

            const titleEl = activeDocument.createElement('span');
            titleEl.className = 'source-panel-title';
            const noteName = source.note.replace(/^\[\[|\]\]$/g, '');
            titleEl.textContent = noteName;
            titleEl.addEventListener('click', () => {
                void this.app.workspace.openLinkText(noteName, '', false);
                popup.remove();
            });
            row.appendChild(titleEl);

            if (source.context) {
                const ctxEl = activeDocument.createElement('div');
                ctxEl.className = 'source-panel-context';
                ctxEl.textContent = source.context;
                row.appendChild(ctxEl);
            }

            popup.appendChild(row);
        }

        const rect = anchor.getBoundingClientRect();
        popup.setCssProps({ '--popup-bottom': `${window.innerHeight - rect.top + 4}px`, '--popup-left': `${rect.left}px` });

        activeDocument.body.appendChild(popup);
        this.clampPopupToViewport(popup);
        this.attachPopupCloseHandler(popup, anchor);
    }

    /**
     * Add the response action icon bar below a completed assistant message.
     */
    private addResponseActions(messageEl: HTMLElement, responseText: string, sources?: { num: number; note: string; context: string }[]): void {
        const bar = messageEl.createDiv('message-actions');

        // Sources indicator (left-aligned, before action buttons)
        if (sources && sources.length > 0) {
            const indicator = bar.createEl('span', { cls: 'sources-indicator' });
            const iconEl = indicator.createSpan('sources-indicator-icon');
            setIcon(iconEl, 'book-open');
            indicator.createSpan({ text: t('ui.sidebar.sources', { count: sources.length }) });
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showSourcesPanel(indicator, sources);
            });
        }

        const makeBtn = (icon: string, tooltip: string, onClick: () => void) => {
            const btn = bar.createEl('button', { cls: 'message-action-btn', attr: { 'aria-label': tooltip } });
            setIcon(btn, icon);
            btn.title = tooltip;
            btn.addEventListener('click', onClick);
        };

        // Insert at cursor in active note
        // iterateAllLeaves with instanceof is the most reliable way to find a markdown editor
        // because getActiveViewOfType returns null when the sidebar has focus
        makeBtn('text-cursor-input', t('ui.sidebar.insertAtCursor'), () => {
            let view: MarkdownView | null =
                this.app.workspace.getActiveViewOfType(MarkdownView) ?? this.lastMarkdownView;
            if (!view) {
                this.app.workspace.iterateAllLeaves((leaf) => {
                    if (!view && leaf.view instanceof MarkdownView) {
                        view = leaf.view;
                    }
                });
            }
            if (view?.editor) {
                view.editor.replaceSelection(responseText);
                new Notice(t('notice.insertedAtCursor'));
            } else {
                new Notice(t('notice.noOpenNote'));
            }
        });

        // Create new note from response — open in a new leaf (not in sidebar)
        makeBtn('file-plus', t('ui.sidebar.createNote'), () => {
            void (async () => {
                const now = new Date();
                // Colons are forbidden in filenames on macOS/Windows — use dashes for HH-MM
                const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
                const fileName = `Agent response ${ts}.md`;
                try {
                    const file = await this.app.vault.create(fileName, responseText);
                    // getLeaf(true) always creates a new leaf in the main content area
                    const leaf = this.app.workspace.getLeaf(true);
                    await leaf.openFile(file);
                } catch (e) {
                    new Notice(t('notice.createNoteFailed', { error: (e as Error).message }));
                }
            })();
        });

        // Synthesis note: Agent summarizes the chat and creates a connected note
        if (this.plugin.settings.enableSynthesisButton !== false) {
            makeBtn('notebook-pen', t('ui.sidebar.synthesisZettel'), () => {
                this.sendProgrammaticMessage(
                    'Erstelle eine Synthese-Note aus diesem Chat. ' +
                    'Fasse die wichtigsten Erkenntnisse, Entscheidungen und Ergebnisse zusammen. ' +
                    'Erstelle die Note mit vollstaendigem Frontmatter (Zusammenfassung, Themen, Konzepte, Tags, Kategorie: Zettel) ' +
                    'und vernetze sie mit bestehenden Notes im Vault. ' +
                    'Speichere die Note in Inbox/. Oeffne die Note nach dem Erstellen.',
                    true, // hidden: user bubble not shown
                );
            });
        }

        // Copy to clipboard
        makeBtn('copy', t('ui.sidebar.copyResponse'), () => {
            void navigator.clipboard.writeText(responseText).then(() => {
                new Notice(t('notice.copiedToClipboard'));
            });
        });

        // Regenerate
        makeBtn('refresh-cw', t('ui.sidebar.regenerate'), () => {
            // Remove this message and re-run
            messageEl.remove();
            // Remove last two history entries (assistant + tool_results if any)
            // and re-send the last user message
            if (this.lastUserMessage) {
                if (this.textarea) this.textarea.value = this.lastUserMessage;
                void this.handleSendMessage();
            }
        });

        // Delete message
        makeBtn('trash-2', t('ui.sidebar.deleteResponse'), () => {
            messageEl.remove();
        });
    }

    // -------------------------------------------------------------------------
    // Completion, Question, Approval cards
    // -------------------------------------------------------------------------

    /**
     * Render (or update) the Plan box for a streaming message.
     *
     * First call: creates the plan box BEFORE toolsEl in the message, then
     * DOM-moves toolsEl (with any already-rendered tool calls) into a collapsed
     * <details> inside the plan box — making tool calls hidden by default.
     *
     * Subsequent calls: updates the todo items list and badge in place.
     */
    private renderTodoBox(
        toolsEl: HTMLElement,
        items: import('../core/tools/agent/UpdateTodoListTool').TodoItem[],
    ): void {
        const messageEl = toolsEl.closest<HTMLElement>('.assistant-message');
        if (!messageEl) return;

        let planBoxEl = messageEl.querySelector<HTMLElement>(':scope > .agent-todo-box');
        let planListEl: HTMLElement;

        if (!planBoxEl) {
            // First call — build the plan box and move toolsEl into it
            planBoxEl = activeDocument.createElement('div');
            planBoxEl.className = 'agent-todo-box';
            // Insert before toolsEl (direct child of messageEl on first call)
            messageEl.insertBefore(planBoxEl, toolsEl);

            const header = planBoxEl.createDiv('todo-box-header');
            setIcon(header.createSpan('todo-box-icon'), 'list-checks');
            header.createSpan('todo-box-title').setText(t('ui.sidebar.plan'));
            header.createSpan('todo-activity-badge');

            planListEl = planBoxEl.createDiv('todo-box-list');

            const activityDetails = planBoxEl.createEl('details', { cls: 'todo-activity-log' });
            activityDetails.createEl('summary', { cls: 'todo-activity-summary', text: t('ui.sidebar.activity') });
            // DOM-move: relocate toolsEl (with any already-rendered tool calls) into collapsed details
            activityDetails.appendChild(toolsEl);
        } else {
            planListEl = planBoxEl.querySelector<HTMLElement>('.todo-box-list')!;
            planBoxEl.querySelector<HTMLElement>('.todo-activity-badge');
        }

        // Update the todo items list
        planListEl.empty();
        for (const item of items) {
            const row = planListEl.createDiv('todo-item');
            const icon = row.createSpan('todo-item-icon');
            if (item.status === 'done') {
                setIcon(icon, 'check-circle-2');
                row.addClass('todo-done');
            } else if (item.status === 'in_progress') {
                setIcon(icon, 'loader-2');
                row.addClass('todo-in-progress');
            } else {
                setIcon(icon, 'circle');
                row.addClass('todo-pending');
            }
            row.createSpan('todo-item-text').setText(item.text);
        }

        this.chatContainer?.scrollTo({ top: this.chatContainer.scrollHeight });
    }

    private showQuestionCard(
        question: string,
        options: string[] | undefined,
        resolve: (answer: string) => void,
        allowMultiple = false,
    ): void {
        if (!this.chatContainer) { resolve(''); return; }

        const card = this.chatContainer.createDiv('followup-list');
        card.createDiv('followup-heading').setText(question);
        const cleanup = () => card.remove();

        if (options && options.length > 0) {
            if (allowMultiple) {
                // Multi-select mode: checkboxes + confirm button
                const selected = new Set<string>();
                const optionEls: HTMLElement[] = [];
                options.forEach((opt) => {
                    const item = card.createEl('button', { cls: 'followup-item followup-item-multi', text: opt });
                    optionEls.push(item);
                    item.addEventListener('click', () => {
                        if (selected.has(opt)) {
                            selected.delete(opt);
                            item.removeClass('followup-item-selected');
                        } else {
                            selected.add(opt);
                            item.addClass('followup-item-selected');
                        }
                    });
                });
                const confirmBtn = card.createEl('button', {
                    cls: 'followup-confirm-btn',
                    text: t('ui.question.confirm'),
                });
                confirmBtn.addEventListener('click', () => {
                    if (selected.size === 0) return;
                    cleanup();
                    resolve([...selected].join(', '));
                });
            } else {
                // Single-select mode: click to answer
                options.forEach((opt) => {
                    const item = card.createEl('button', { cls: 'followup-item', text: opt });
                    item.addEventListener('click', () => { cleanup(); resolve(opt); });
                });
            }
        }

        const inputRow = card.createDiv('question-input-row');
        const input = inputRow.createEl('input', {
            cls: 'question-input',
            attr: { type: 'text', placeholder: t('ui.question.placeholder') },
        });
        const submitBtn = inputRow.createEl('button', { cls: 'question-submit-btn', text: t('ui.question.answer') });
        const submit = () => {
            const val = input.value.trim();
            if (!val) return;
            cleanup();
            resolve(val);
        };
        submitBtn.addEventListener('click', submit);
        input.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') submit(); });
        this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight });
    }

    /**
     * Build a human-readable explanation for a tool call.
     * Returns { text, target? } where text is the explanation sentence
     * and target is the highlighted value (path, URL, query etc.).
     */
    private buildHumanReadableExplanation(
        toolName: string,
        input: Record<string, unknown>,
    ): { text: string; target?: string } {
        const str = (key: string): string => { const v = input[key]; return typeof v === 'string' ? v : ''; };

        switch (toolName) {
            case 'write_file':
                return { text: t('ui.approval.explain.writeFile'), target: str('path') };
            case 'edit_file':
                return { text: t('ui.approval.explain.editFile'), target: str('path') };
            case 'append_to_file':
                return { text: t('ui.approval.explain.appendFile'), target: str('path') };
            case 'update_frontmatter':
                return { text: t('ui.approval.explain.frontmatter'), target: str('path') };
            case 'delete_file':
                return { text: t('ui.approval.explain.deleteFile'), target: str('path') };
            case 'move_file': {
                const from = str('source');
                const to = str('destination');
                return { text: t('ui.approval.explain.moveFile'), target: to ? `${from} ${t('ui.approval.explain.moveFileTo')} ${to}` : from };
            }
            case 'create_folder':
                return { text: t('ui.approval.explain.createFolder'), target: str('path') };
            case 'generate_canvas':
                return { text: t('ui.approval.explain.canvas'), target: str('output_path') };
            case 'create_excalidraw':
                return { text: t('ui.approval.explain.excalidraw'), target: str('output_path') };
            case 'evaluate_expression':
                return { text: t('ui.approval.explain.sandbox') };
            case 'web_fetch':
                return { text: t('ui.approval.explain.webFetch'), target: str('url') };
            case 'web_search':
                return { text: t('ui.approval.explain.webSearch'), target: str('query') };
            case 'new_task':
                return { text: t('ui.approval.explain.newTask') };
            case 'use_mcp_tool': {
                const server = str('server_name');
                const tool = str('tool_name');
                return { text: t('ui.approval.explain.mcpTool'), target: tool ? `${tool} (${server})` : server };
            }
            case 'call_plugin_api':
                return { text: t('ui.approval.explain.pluginApi'), target: str('plugin_id') };
            case 'execute_command':
                return { text: t('ui.approval.explain.command'), target: str('command_id') };
            case 'execute_recipe':
                return { text: t('ui.approval.explain.recipe'), target: str('recipe_id') };
            case 'switch_agent':
                return { text: t('ui.approval.explain.switchMode') };
            case 'manage_source':
                return { text: t('ui.approval.explain.selfModify') };
            default:
                return { text: t('ui.approval.explain.fallback'), target: this.formatToolLabel(toolName) };
        }
    }

    /**
     * Truncate a string to maxLen characters, appending "..." if truncated.
     */
    private truncateForApproval(value: string, maxLen: number): string {
        if (value.length <= maxLen) return value;
        return value.slice(0, maxLen) + '...';
    }

    /**
     * Format the raw tool input as a readable string for the details section.
     */
    private formatInputForDetails(input: Record<string, unknown>): string {
        const MAX_VALUE_LEN = 500;
        const lines: string[] = [];
        for (const [key, value] of Object.entries(input)) {
            const strVal = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
            lines.push(`${key}: ${this.truncateForApproval(strVal, MAX_VALUE_LEN)}`);
        }
        return lines.join('\n');
    }

    private async showApprovalCard(
        toolName: string,
        input: Record<string, unknown>,
    ): Promise<import('../core/tool-execution/ToolExecutionPipeline').ApprovalResult> {
        // All tools use the same inline approval card during execution.
        // Approvals are always rendered in chatContainer (not toolsEl) to ensure visibility
        // even when .agent-steps-block is collapsed.
        // Post-task DiffReviewModal is shown in onComplete for collected review.
        return new Promise((resolve) => {
            if (!this.chatContainer) { resolve({ decision: 'approved' }); return; }

            const group = this.getToolGroup(toolName);
            const groupLabels: Record<string, string> = {
                'note-edit': t('ui.approval.noteEdits'), 'vault-change': t('ui.approval.vaultChanges'),
                web: t('ui.approval.web'), mcp: t('ui.approval.mcp'), read: t('ui.approval.read'),
                mode: t('ui.approval.modeSwitching'), subtask: t('ui.approval.subAgents'),
                skill: t('ui.approval.pluginSkills'),
                'plugin-api': t('ui.approval.pluginApi'), recipe: t('ui.approval.recipes'),
                sandbox: t('ui.approval.sandbox'),
            };

            // Always render in chatContainer (like Question-Cards)
            const row = this.chatContainer.createDiv('tool-approval-row');
            const iconSpan = row.createSpan('tool-approval-icon');
            setIcon(iconSpan, 'shield-alert');
            row.createSpan('tool-approval-text').setText(
                t('ui.approval.notEnabled', { tool: this.formatToolLabel(toolName), group: groupLabels[group] ?? group })
            );

            // Human-readable explanation
            const { text: explanationText, target } = this.buildHumanReadableExplanation(toolName, input);
            const explanationEl = row.createDiv('tool-approval-explanation');
            explanationEl.createSpan().setText(explanationText);
            if (target) {
                explanationEl.createSpan('tool-approval-target').setText(target);
            }

            // For sandbox: show code preview (first 3 lines)
            if (toolName === 'evaluate_expression' && typeof input['expression'] === 'string') {
                const expr = input['expression'];
                const previewLines = expr.split('\n').slice(0, 3);
                const preview = previewLines.join('\n') + (expr.split('\n').length > 3 ? '\n...' : '');
                const codePreview = row.createDiv('tool-approval-code-preview');
                codePreview.createEl('code').setText(preview);
            }

            // Collapsible details for power users
            const detailsToggle = row.createEl('span', {
                cls: 'tool-approval-details-toggle',
                text: t('ui.approval.explain.showDetails'),
            });
            const detailsContainer = row.createDiv('tool-approval-details');
            detailsContainer.createEl('pre', { cls: 'tool-approval-details-content' })
                .setText(this.formatInputForDetails(input));

            detailsToggle.addEventListener('click', () => {
                const isVisible = detailsContainer.hasClass('is-visible');
                if (isVisible) {
                    detailsContainer.removeClass('is-visible');
                    detailsToggle.setText(t('ui.approval.explain.showDetails'));
                } else {
                    detailsContainer.addClass('is-visible');
                    detailsToggle.setText(t('ui.approval.explain.hideDetails'));
                }
            });

            // Shai Hulud Mitigation: warn when writing to configDir (plugins/themes/settings)
            const inputPath = typeof input['path'] === 'string' ? input['path'] : '';
            const cfgDir = this.plugin.app.vault.configDir;
            if (inputPath && (inputPath.startsWith(`${cfgDir}/`) || inputPath === cfgDir)) {
                const warning = row.createDiv('tool-approval-config-warning');
                const warnIcon = warning.createSpan('tool-approval-warning-icon');
                setIcon(warnIcon, 'alert-triangle');
                warning.createSpan('tool-approval-warning-text').setText(
                    t('ui.approval.configDirWarning', { path: inputPath })
                );
            }

            const actions = row.createDiv('tool-approval-actions');
            const allowBtn = actions.createEl('button', { cls: 'tool-approval-btn approval-allow-once', text: t('ui.approval.allowOnce') });
            const enableBtn = actions.createEl('button', { cls: 'tool-approval-btn approval-enable', text: t('ui.approval.enableInSettings') });
            const denyBtn = actions.createEl('button', { cls: 'tool-approval-btn approval-deny-small', text: '✕' });

            const cleanup = () => row.remove();

            allowBtn.addEventListener('click', () => { cleanup(); resolve({ decision: 'approved' }); });
            denyBtn.addEventListener('click', () => { cleanup(); resolve({ decision: 'rejected' }); });
            enableBtn.addEventListener('click', () => {
                void (async () => {
                    this.plugin.settings.autoApproval.enabled = true;
                    const permKey = this.groupToPermKey(group);
                    if (permKey) (this.plugin.settings.autoApproval as unknown as Record<string, boolean>)[permKey] = true;
                    await this.plugin.saveSettings();
                    cleanup();
                    resolve({ decision: 'approved' });
                })();
            });

            this.chatContainer?.scrollTo({ top: this.chatContainer.scrollHeight });
        });
    }

    private getToolGroup(toolName: string): 'note-edit' | 'vault-change' | 'web' | 'mcp' | 'read' | 'mode' | 'subtask' | 'skill' | 'plugin-api' | 'recipe' | 'sandbox' {
        const readTools = ['read_file', 'list_files', 'search_files', 'get_frontmatter', 'get_linked_notes', 'get_vault_stats', 'search_by_tag', 'get_daily_note', 'query_base', 'semantic_search'];
        const vaultChangeTools = ['create_folder', 'delete_file', 'move_file', 'generate_canvas', 'create_base', 'update_base'];
        const skillTools = ['execute_command', 'enable_plugin', 'resolve_capability_gap'];
        if (toolName === 'evaluate_expression') return 'sandbox';
        if (['web_fetch', 'web_search'].includes(toolName)) return 'web';
        if (toolName === 'use_mcp_tool') return 'mcp';
        if (readTools.includes(toolName)) return 'read';
        if (vaultChangeTools.includes(toolName)) return 'vault-change';
        if (skillTools.includes(toolName)) return 'skill';
        if (toolName === 'call_plugin_api') return 'plugin-api';
        if (toolName === 'execute_recipe') return 'recipe';
        if (toolName === 'switch_agent') return 'mode';
        if (toolName === 'new_task') return 'subtask';
        return 'note-edit'; // write_file, edit_file, append_to_file, update_frontmatter
    }

    /** Map a tool group to the corresponding permission key in autoApproval config */
    private groupToPermKey(group: string): string | null {
        const map: Record<string, string> = {
            'note-edit': 'noteEdits',
            'vault-change': 'vaultChanges',
            web: 'web',
            mcp: 'mcp',
            mode: 'mode',
            subtask: 'subtasks',
            skill: 'skills',
            'plugin-api': 'pluginApiWrite', // "Enable" sets the broader write permission
            recipe: 'recipes',
            sandbox: 'sandbox',
        };
        return map[group] ?? null;
    }

    // -------------------------------------------------------------------------
    // Checkpoint markers (Kilo Code pattern: CheckpointSaved.tsx)
    // -------------------------------------------------------------------------

    private renderCheckpointMarker(
        container: HTMLElement,
        checkpoint: import('../core/checkpoints/GitCheckpointService').CheckpointInfo,
    ): void {
        const marker = container.createDiv('checkpoint-marker');

        const iconEl = marker.createSpan('checkpoint-icon');
        setIcon(iconEl, 'git-commit-vertical');

        const label = marker.createSpan('checkpoint-label');
        const files = checkpoint.filesChanged.map((f) => f.split('/').pop()).join(', ');
        const newFileNames = checkpoint.newFiles?.map((f) => f.split('/').pop()).join(', ');
        const allFiles = [files, newFileNames].filter(Boolean).join(', ');
        const time = new Date(checkpoint.timestamp).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
        });
        label.setText(t('ui.checkpoint.label', { files: allFiles, time }));

        // Action buttons -- always visible, ghost-style, Lucide icons + Obsidian
        // tooltip via aria-label. Pattern adapted from Kilo Code's CheckpointMenu
        // (forked-kilocode/webview-ui/src/components/chat/checkpoints/CheckpointMenu.tsx):
        // three primary icon buttons inline, plus a "more" overflow with the
        // less common option (delete chat from here).
        const actions = marker.createDiv('checkpoint-actions');

        const diffBtn = this.makeCheckpointActionBtn(actions, 'file-diff', t('ui.checkpoint.action.diff'));
        diffBtn.addEventListener('click', () => {
            void this.showCheckpointDiff(checkpoint);
        });

        const undoThisBtn = this.makeCheckpointActionBtn(actions, 'undo-2', t('ui.checkpoint.undoThis'));
        undoThisBtn.addEventListener('click', () => {
            void this.restoreCheckpoint(checkpoint, marker, actions, false);
        });

        const undoFromHereBtn = this.makeCheckpointActionBtn(actions, 'rotate-ccw', t('ui.checkpoint.undoFromHere'));
        undoFromHereBtn.addEventListener('click', () => {
            void this.restoreCheckpointsForward(checkpoint, marker, actions);
        });

        const moreBtn = this.makeCheckpointActionBtn(actions, 'more-vertical', t('ui.checkpoint.action.more'));
        moreBtn.addEventListener('click', (ev) => {
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle(t('ui.checkpoint.deleteFromHere'));
                item.setIcon('trash-2');
                item.onClick(() => {
                    void this.restoreCheckpoint(checkpoint, marker, actions, true);
                });
            });
            menu.showAtMouseEvent(ev);
        });
    }

    /**
     * Make a ghost icon button for the checkpoint marker action row. The
     * button has no border by default; styling lives on `.checkpoint-action-btn`.
     * The aria-label is what Obsidian renders as the tooltip on hover.
     */
    private makeCheckpointActionBtn(parent: HTMLElement, icon: string, tooltip: string): HTMLButtonElement {
        const btn = parent.createEl('button', { cls: 'checkpoint-action-btn' });
        btn.setAttribute('aria-label', tooltip);
        setIcon(btn, icon);
        return btn;
    }

    /**
     * "Undo all changes from here": restore the given checkpoint AND every
     * checkpoint that came after it in the same task. Equivalent to walking
     * the task's snapshot history forward from this point and rolling each
     * write back. Files are restored in reverse-chronological order so the
     * oldest (= pre-CP) content wins when multiple checkpoints touch the
     * same path.
     *
     * Takes a pre-restore snapshot of the union of affected files first so
     * the multi-step rollback can itself be undone via the next checkpoint
     * marker.
     */
    private async restoreCheckpointsForward(
        startCp: import('../core/checkpoints/GitCheckpointService').CheckpointInfo,
        marker: HTMLElement,
        optionsEl: HTMLElement,
    ): Promise<void> {
        optionsEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
        optionsEl.empty();
        optionsEl.setText(t('ui.checkpoint.restoring'));

        const service = this.plugin.checkpointService;
        if (!service) {
            optionsEl.setText(t('ui.checkpoint.error'));
            return;
        }

        try {
            const all = await service.loadCheckpointsForTask(startCp.taskId);
            const startIdx = all.findIndex((c) => c.commitOid === startCp.commitOid);
            if (startIdx < 0) {
                // Fall back to single-CP restore if we somehow can't locate the start
                console.warn('[Checkpoint] undoFromHere: start oid not in task list, falling back to single restore');
                await this.restoreCheckpoint(startCp, marker, optionsEl, false);
                return;
            }
            const tail = all.slice(startIdx);

            // Pre-restore snapshot: union of every file the multi-step rollback
            // will touch. Lets the user undo the undo via the next checkpoint
            // marker in the chat (the per-tool pipeline snapshot only covers
            // toolCall.input.path, which is irrelevant for a UI-triggered batch).
            const affected = new Set<string>();
            for (const cp of tail) {
                for (const f of cp.filesChanged) affected.add(f);
                for (const f of cp.newFiles ?? []) affected.add(f);
            }
            try {
                await service.snapshot(`restore-${Date.now()}`, [...affected], 'undo_from_here');
            } catch (e) {
                console.warn('[Checkpoint] Pre-restore snapshot failed (non-fatal):', e);
            }

            // Reverse chronological so older content overwrites newer for the
            // same path (later CPs hold the in-between state, the start CP
            // holds the original pre-task content for its files).
            const allRestored: string[] = [];
            const allErrors: string[] = [];
            for (const cp of [...tail].reverse()) {
                const result = await service.restore(cp);
                allRestored.push(...result.restored);
                allErrors.push(...result.errors);
            }

            optionsEl.remove();
            const successEl = marker.createSpan('checkpoint-restored');
            const unique = new Set(allRestored).size;
            successEl.setText(t('ui.checkpoint.restored', { count: unique }));

            if (unique > 0) {
                const restoredFiles = [...new Set(allRestored)].join(', ');
                this.conversationHistory.push({
                    role: 'user',
                    content: `[System] Multi-checkpoint undo: ${tail.length} checkpoint(s) rolled back from ${startCp.commitOid.slice(0, 8)} forward. Files: ${restoredFiles}. ${allErrors.length} error(s). Vault state changed.`,
                });
                this.saveCurrentConversation();
            }
        } catch (e) {
            console.error('[Checkpoint] undoFromHere failed:', e);
            optionsEl.setText(t('ui.checkpoint.failed'));
        }
    }

    /**
     * Execute a checkpoint restore with either "keep chat" or "delete chat from here".
     */
    private async restoreCheckpoint(
        checkpoint: import('../core/checkpoints/GitCheckpointService').CheckpointInfo,
        marker: HTMLElement,
        optionsEl: HTMLElement,
        deleteChatFromHere: boolean,
    ): Promise<void> {
        optionsEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
        optionsEl.empty();
        optionsEl.setText(t('ui.checkpoint.restoring'));

        try {
            console.debug('[Checkpoint] Restoring:', JSON.stringify(checkpoint, null, 2));
            const result = await this.plugin.checkpointService?.restore(checkpoint);
            console.debug('[Checkpoint] Result:', JSON.stringify(result, null, 2));
            if (!result || result.restored.length === 0) {
                optionsEl.setText(result?.errors?.length ? t('ui.checkpoint.error') : t('ui.checkpoint.nothingToRestore'));
                return;
            }

            optionsEl.remove();
            const successEl = marker.createSpan('checkpoint-restored');
            successEl.setText(t('ui.checkpoint.restored', { count: result.restored.length }));

            if (deleteChatFromHere) {
                this.deleteChatFromCheckpoint(marker);
            } else {
                const restoredFiles = result.restored.join(', ');
                const deletedNote = checkpoint.newFiles?.length
                    ? ` Deleted: ${checkpoint.newFiles.join(', ')}.`
                    : '';
                this.conversationHistory.push({
                    role: 'user',
                    content: `[System] Checkpoint restored. Files: ${restoredFiles}.${deletedNote} Vault state changed.`,
                });
            }

            this.saveCurrentConversation();
        } catch (e) {
            console.error('[Checkpoint] Restore failed:', e);
            optionsEl.setText(t('ui.checkpoint.failed'));
        }
    }

    /**
     * Remove the assistant message containing this checkpoint and all subsequent
     * messages from the DOM, uiMessages, and conversationHistory.
     */
    private deleteChatFromCheckpoint(marker: HTMLElement): void {
        if (!this.chatContainer) return;

        const assistantMsg = marker.closest('.assistant-message') ?? marker.closest('.message');
        if (!assistantMsg) return;

        const allMessages = Array.from(this.chatContainer.querySelectorAll('.message'));
        const idx = allMessages.indexOf(assistantMsg);
        if (idx < 0) return;

        // Count assistant bubbles before this one (for array truncation)
        const assistantBubblesBefore = allMessages
            .slice(0, idx)
            .filter((el) => el.classList.contains('assistant-message')).length;

        // Remove messages from DOM (this one + all after)
        for (let i = allMessages.length - 1; i >= idx; i--) {
            allMessages[i].remove();
        }

        // Truncate uiMessages at the corresponding assistant index
        const assistantIndices: number[] = [];
        this.uiMessages.forEach((m, i) => { if (m.role === 'assistant') assistantIndices.push(i); });
        const uiIdx = assistantIndices[assistantBubblesBefore];
        if (uiIdx !== undefined) {
            this.uiMessages.splice(uiIdx);
        }

        // Truncate conversationHistory at the corresponding assistant position
        let assistantCount = 0;
        for (let i = 0; i < this.conversationHistory.length; i++) {
            if (this.conversationHistory[i].role === 'assistant') {
                if (assistantCount === assistantBubblesBefore) {
                    this.conversationHistory.splice(i);
                    break;
                }
                assistantCount++;
            }
        }

        this.saveCurrentConversation();
    }

    /**
     * Open DiffReviewModal in checkpoint mode for a single checkpoint.
     * Shows the diff between snapshot (pre-write) and current vault state.
     */
    private async showCheckpointDiff(
        checkpoint: import('../core/checkpoints/GitCheckpointService').CheckpointInfo,
    ): Promise<void> {
        const service = this.plugin.checkpointService;
        if (!service) return;

        const { DiffReviewModal } = await import('./DiffReviewModal');
        const entries: import('./DiffReviewModal').FileDiffEntry[] = [];

        for (const filePath of checkpoint.filesChanged) {
            const before = await service.getSnapshotContent(checkpoint, filePath);
            if (before === null) continue;

            let after = '';
            try {
                const file = this.app.vault.getFileByPath(filePath);
                if (file) after = await this.app.vault.read(file);
            } catch { /* file deleted */ }

            entries.push({ filePath, oldContent: before, newContent: after });
        }

        if (entries.length === 0) return;

        new DiffReviewModal(
            this.app,
            entries,
            {
                mode: 'checkpoint',
                checkpointInfo: checkpoint,
                onRestore: async () => {
                    const result = await service.restore(checkpoint);
                    if (result && result.restored.length > 0) {
                        const restoredFiles = result.restored.join(', ');
                        const deletedNote = checkpoint.newFiles?.length
                            ? ` Deleted: ${checkpoint.newFiles.join(', ')}.`
                            : '';
                        this.conversationHistory.push({
                            role: 'user',
                            content: `[System] Checkpoint restored. Files: ${restoredFiles}.${deletedNote} Vault state changed.`,
                        });
                    }
                },
            },
        ).open();
    }

    // -------------------------------------------------------------------------
    // Checkpoint markers: rehydrate undo bars after chat history reload
    // -------------------------------------------------------------------------

    /**
     * FIX-01-07-02: after loadConversation rebuilds the chat DOM, rehydrate
     * the per-checkpoint markers inline at the assistant message they belong
     * to. The shadow repo still holds the snapshots across plugin reloads,
     * but the in-memory taskCheckpoints map starts empty AND the dead marker
     * spans in toolStepsHtml have no event listeners.
     *
     * For each unique taskId we:
     *   1. service.loadCheckpointsForTask(taskId) -- rebuilds the in-memory map
     *      from the shadow repo via git log.
     *   2. Pick the LAST assistant message of that task as the anchor. (Most
     *      tasks emit one assistant bubble; askQuestion pauses produce more,
     *      and the trailing bubble is the user's natural exit point.)
     *   3. Strip any stale .checkpoint-marker nodes that the toolStepsHtml
     *      snapshot brought in dead, then render fresh markers via
     *      renderCheckpointMarker so the buttons work again.
     *
     * Older conversations stored before taskId was persisted on UiMessages
     * have m.taskId === undefined and are skipped (no marker, no error).
     */
    private async rehydrateCheckpointMarkers(
        pairs: { msg: UiMessage; el: HTMLElement }[],
    ): Promise<void> {
        if (!(this.plugin.settings.enableCheckpoints ?? true)) return;
        const service = this.plugin.checkpointService;
        if (!service) return;

        // Last DOM anchor per taskId (later messages overwrite earlier ones).
        const anchorByTaskId = new Map<string, HTMLElement>();
        for (const { msg, el } of pairs) {
            if (msg.taskId) anchorByTaskId.set(msg.taskId, el);
        }

        for (const [taskId, messageEl] of anchorByTaskId) {
            try {
                const list = await service.loadCheckpointsForTask(taskId);
                if (list.length === 0) continue;

                // Drop stale markers from the rehydrated toolStepsHtml so we
                // don't render the same checkpoint twice (once dead, once live).
                messageEl.querySelectorAll('.checkpoint-marker').forEach((el) => el.remove());

                const toolsEl = messageEl.querySelector<HTMLElement>('.message-tools') ?? messageEl;
                for (const cp of list) {
                    this.renderCheckpointMarker(toolsEl, cp);
                }
            } catch (e) {
                console.warn('[Checkpoints] rehydrate failed for', taskId, e);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Post-task review: show all changes for review/undo after agent finishes
    // -------------------------------------------------------------------------

    private async showPostTaskReview(taskId: string): Promise<void> {
        const service = this.plugin.checkpointService;
        if (!service) return;

        const checkpoints = service.getCheckpointsForTask(taskId);
        if (checkpoints.length === 0) return;

        // Collect the earliest checkpoint content per file (pre-task state)
        const fileOldContent = new Map<string, string>();
        for (const cp of checkpoints) {
            for (const filePath of cp.filesChanged) {
                if (!fileOldContent.has(filePath)) {
                    const content = await service.getSnapshotContent(cp, filePath);
                    if (content !== null) {
                        fileOldContent.set(filePath, content);
                    }
                }
            }
        }

        // Build entries: old = earliest checkpoint, new = current vault
        const { DiffReviewModal } = await import('./DiffReviewModal');
        const entries: import('./DiffReviewModal').FileDiffEntry[] = [];

        for (const [filePath, oldContent] of fileOldContent) {
            let newContent = '';
            try {
                const file = this.app.vault.getFileByPath(filePath);
                if (file) newContent = await this.app.vault.read(file);
            } catch { /* file may have been deleted */ }

            // Skip files that haven't actually changed
            if (oldContent === newContent) continue;

            entries.push({ filePath, oldContent, newContent });
        }

        // Also handle newly created files (no checkpoint snapshot — oldContent is empty)
        const newFiles = new Set<string>();
        for (const cp of checkpoints) {
            if (cp.newFiles) {
                for (const f of cp.newFiles) newFiles.add(f);
            }
        }
        for (const filePath of newFiles) {
            let newContent = '';
            try {
                const file = this.app.vault.getFileByPath(filePath);
                if (file) newContent = await this.app.vault.read(file);
            } catch { continue; }
            if (newContent) {
                entries.push({ filePath, oldContent: '', newContent });
            }
        }

        if (entries.length === 0) return;

        new DiffReviewModal(
            this.app,
            entries,
            { mode: 'review' },
            (decisions) => {
                void (async () => {
                    // Apply user decisions: write back reverted/edited content
                    for (const d of decisions) {
                        if (!d.hasChanges) continue;
                        try {
                            const file = this.app.vault.getFileByPath(d.filePath);
                            if (file instanceof TFile) {
                                await this.app.vault.modify(file, d.finalContent);
                            } else {
                                await this.app.vault.adapter.write(d.filePath, d.finalContent);
                            }
                        } catch (e) {
                            console.error(`[PostTaskReview] Failed to apply decision for ${d.filePath}:`, e);
                        }
                    }
                    if (decisions.length > 0) {
                        const files = decisions.map((d) => d.filePath).join(', ');
                        this.conversationHistory.push({
                            role: 'user',
                            content: `[System] Post-task review: User reverted changes in ${decisions.length} file(s): ${files}. Vault state changed.`,
                        });
                    }
                })();
            },
        ).open();
    }

    // -------------------------------------------------------------------------
    // Undo bar (fallback when no checkpoint markers rendered)
    // -------------------------------------------------------------------------

    private showUndoBar(taskId: string, writeCount: number): void {
        if (!this.chatContainer) return;
        const bar = this.chatContainer.createDiv('undo-bar');
        bar.createSpan('undo-label').setText(
            t('ui.undo.modified', { count: writeCount })
        );
        const undoBtn = bar.createEl('button', { cls: 'undo-btn', text: t('ui.undo.undoAll') });
        undoBtn.addEventListener('click', () => {
            void (async () => {
                undoBtn.disabled = true;
                undoBtn.setText(t('ui.undo.restoring'));
                console.debug(`[Undo] Attempting restore for taskId=${taskId} hasService=${!!this.plugin.checkpointService}`);
                try {
                    const result = await this.plugin.checkpointService?.restoreLatestForTask(taskId);
                    console.debug('[Undo] Restore result:', result);
                    bar.empty();
                    if (result && result.restored.length > 0) {
                        bar.createSpan('undo-success').setText(
                            t('ui.undo.restored', { count: result.restored.length })
                        );
                    } else {
                        bar.createSpan('undo-error').setText(t('ui.undo.noCheckpoint'));
                    }
                } catch {
                    bar.empty();
                    bar.createSpan('undo-error').setText(t('ui.undo.restoreFailed'));
                }
            })();
        });
        this.chatContainer.scrollTo({ top: this.chatContainer.scrollHeight });
    }

    /**
     * Format token count for display (e.g., 1500 → 1.5k, 1500000 → 1.5M)
     */
    private formatTokens(num: number): string {
        if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
        if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k';
        return num.toString();
    }
}


/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
