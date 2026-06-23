/**
 * InlineActionService -- top-level orchestrator fuer Inline-Editor-AI-Actions (FEAT-33-01 TR-1.5).
 *
 * Owns the Resolver, the Registry, and the Floating-Menu instance.
 * Wired into main.ts via `plugin.inlineActionService = new InlineActionService(...)`
 * and a single addCommand entry ("Open inline AI menu"). The Service
 * handles the runtime composition: build TriggerContext from the
 * current editor, list eligible actions, open the menu, dispatch
 * the chosen action.
 *
 * Sidebar-Independence (ADR-138, H-06): the Service constructs
 * AgentTaskRunner per-action with the action's own callbacks. It
 * never touches the chat sidebar. Send-to-Main-Chat (FEAT-33-04) is
 * the only action that surfaces the sidebar -- that opens it
 * explicitly inside its own execute method.
 *
 * Architecture-map concept: inline-trigger-resolver (registry/menu
 * concepts have their own rows). The Service is the public surface
 * the plugin entry-point talks to.
 * Related: ADR-138, ADR-140 (Settings-Snapshot-Lifecycle).
 */

import type { AgentTaskCallbacks } from '../AgentTask';
import type { InlineAction, InlineActionRegistry } from './InlineActionRegistry';
import type { InlineFloatingMenu, MenuPosition } from './InlineFloatingMenu';
import type { InlineSettingsSnapshot, InlineTriggerContext } from './InlineTriggerContext';
import type { InlineTriggerResolver, SelectionTriggerInput } from './InlineTriggerResolver';

/**
 * Editor probe interface. The plugin entry-point implements this on
 * top of `workspace.getActiveViewOfType(MarkdownView)`. The Service
 * stays Obsidian-API-free so unit tests can stub the probe.
 */
export interface EditorSelectionProbe {
    /**
     * Read the current selection from the active editor. Returns null
     * if no editor is focused, no markdown view exists, or no selection
     * input can be derived (e.g. picture-in-picture mode).
     */
    probe(): SelectionTriggerInput | null;
    /**
     * The container element the Floating-Menu attaches to. Typically
     * the editor's content-host so the menu floats above the text.
     */
    getMenuContainer(): HTMLElement | null;
    /**
     * Best-effort screen coordinates for where the menu should appear.
     * Defaults to {x:0,y:0} which is then clamped to the viewport by
     * the menu itself. Callers should return the caret bounding-box
     * top-right when available.
     */
    getMenuPosition(): MenuPosition;
}

export interface InlineActionServiceOptions {
    /** Selection / DOM probe over the active editor. */
    editorProbe: EditorSelectionProbe;
    /** Action registry (already populated by main.ts onload). */
    registry: InlineActionRegistry;
    /** TriggerResolver, configured with a getSettingsSnapshot callback. */
    resolver: InlineTriggerResolver;
    /**
     * Factory returning the Floating-Menu bound to this service's
     * onPick handler. The factory exists so that the Menu can be
     * stubbed in unit tests; the live plugin passes `() => new InlineFloatingMenu(...)`.
     */
    menuFactory: (onPick: (action: InlineAction, ctx: InlineTriggerContext) => void) => InlineFloatingMenu;
    /**
     * Optional master switch -- when the function returns false,
     * triggerMenu() is a no-op. Lets the plugin honour the
     * `inlineActions.enabled` setting at runtime without forcing the
     * Service to read settings directly.
     */
    isEnabled?: () => boolean;
    /**
     * Optional sink for action errors so the plugin can show a notice
     * or log. The Service catches in dispatch() and forwards here.
     */
    onActionError?: (action: InlineAction, error: Error) => void;
    /**
     * Callbacks fed to action.execute(). The plugin can build them
     * action-aware (e.g. inline-diff renderer for Rewrite) or just
     * pass console-logging callbacks for the initial wiring.
     */
    buildActionCallbacks: (action: InlineAction, ctx: InlineTriggerContext) => AgentTaskCallbacks;
}

export class InlineActionService {
    private readonly editorProbe: EditorSelectionProbe;
    private readonly registry: InlineActionRegistry;
    private readonly resolver: InlineTriggerResolver;
    private readonly menuFactory: (onPick: (action: InlineAction, ctx: InlineTriggerContext) => void) => InlineFloatingMenu;
    private readonly isEnabled: () => boolean;
    private readonly onActionError?: (action: InlineAction, error: Error) => void;
    private readonly buildActionCallbacks: (action: InlineAction, ctx: InlineTriggerContext) => AgentTaskCallbacks;

    private menu: InlineFloatingMenu | null = null;

    constructor(options: InlineActionServiceOptions) {
        this.editorProbe = options.editorProbe;
        this.registry = options.registry;
        this.resolver = options.resolver;
        this.menuFactory = options.menuFactory;
        this.isEnabled = options.isEnabled ?? (() => true);
        this.onActionError = options.onActionError;
        this.buildActionCallbacks = options.buildActionCallbacks;
    }

    /** Expose the registry so the plugin can register actions on onload. */
    get actions(): InlineActionRegistry {
        return this.registry;
    }

    /**
     * Main entry point for the hotkey / command-palette callback.
     * Builds the TriggerContext from the active editor and opens the
     * Floating-Menu at the editor's caret. No-op when the service is
     * disabled, when no editor is focused, or when no eligible action
     * exists for the current context.
     */
    triggerMenu(): void {
        if (this.isEnabled() !== true) return;

        const input = this.editorProbe.probe();
        if (input === null) return;

        const ctx = this.resolver.resolveFromSelection(input);
        const container = this.editorProbe.getMenuContainer();
        if (container === null) return;

        const menu = this.ensureMenu();
        // The Floating-Menu re-uses the same container instance per
        // invocation; if the editor was re-mounted we need a fresh menu.
        // For simplicity, we always close+re-open so the container ref
        // is current.
        menu.close();
        menu.open(ctx, this.editorProbe.getMenuPosition());
    }

    /**
     * Programmatic dispatch helper for unit tests and command-palette
     * shortcuts that pre-pick an action ("Vault Operator: Rewrite
     * selection" -> directly dispatch rewrite without opening the menu).
     */
    async dispatch(actionId: string): Promise<void> {
        const action = this.registry.getAction(actionId);
        if (action === undefined) return;
        const input = this.editorProbe.probe();
        if (input === null) return;
        const ctx = this.resolver.resolveFromSelection(input);
        if (action.isEligible(ctx) !== true) return;
        await this.executeAction(action, ctx);
    }

    /** Cleanup hook for plugin onunload. */
    dispose(): void {
        if (this.menu !== null) {
            this.menu.dispose();
            this.menu = null;
        }
    }

    private ensureMenu(): InlineFloatingMenu {
        if (this.menu === null) {
            this.menu = this.menuFactory((action, ctx) => {
                void this.executeAction(action, ctx);
            });
        }
        return this.menu;
    }

    private async executeAction(action: InlineAction, ctx: InlineTriggerContext): Promise<void> {
        try {
            const callbacks = this.buildActionCallbacks(action, ctx);
            await action.execute(ctx, callbacks);
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            if (this.onActionError !== undefined) {
                this.onActionError(action, err);
            } else {
                console.debug('[InlineActionService] action error', action.id, err);
            }
        }
    }

    /** Re-exported for callers that only want the snapshot type. */
    snapshotShape(): InlineSettingsSnapshot {
        // Build an empty snapshot from defaults; useful for tests that
        // do not need real settings.
        return { modelId: '', provider: '', skillIds: [], customPromptIds: [] };
    }
}
