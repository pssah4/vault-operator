/**
 * InlineActionRegistry -- pluggable layer for Inline-Actions (FEAT-33-01 TR-1.3, EPIC-33).
 *
 * Each Inline-Action (Lookup, Rewrite, Send-to-Main-Chat, Translate,
 * Summarize, Skill-Action, Find-Action-Items, ...) registers itself
 * here. The Floating-Menu and Command-Palette read the registry to
 * enumerate eligible actions for the current InlineTriggerContext.
 *
 * Actions filter via isEligible(ctx): some actions only work in
 * Source / Live-Preview (Rewrite, Inline-Chat); others work in
 * Reading-Mode too (Lookup, Send-to-Main, Translate).
 *
 * Architecture-map concept: inline-trigger-resolver (the registry is
 * the data side; the floating menu and hotkey are the surface).
 * Related: ADR-138 (Sidebar-Independence), ADR-141 (Skill-Capability
 * for Skills-as-Actions in FEAT-33-08).
 */

import type { AgentTaskCallbacks } from '../AgentTask';
import type { InlineTriggerContext } from './InlineTriggerContext';

/**
 * Contract every Inline-Action implements.
 */
export interface InlineAction {
    /** Stable identifier (e.g. 'lookup', 'rewrite', 'send-to-main-chat'). */
    id: string;
    /** Display label in the Floating-Menu / Command-Palette. */
    label: string;
    /** Optional one-line description (tooltip / palette subtitle). */
    description?: string;
    /**
     * Filter for the current context. Return false to hide the action
     * from menus (e.g. Rewrite is not eligible in Reading-Mode).
     */
    isEligible(ctx: InlineTriggerContext): boolean;
    /**
     * Run the action with the given context and callbacks. Implementers
     * typically use AgentTaskRunner under the hood; callbacks drive
     * output rendering (preview-block, inline-diff, side-panel, ...).
     */
    execute(ctx: InlineTriggerContext, callbacks: AgentTaskCallbacks): Promise<void>;
}

export class InlineActionRegistry {
    /** Insertion-ordered storage. Map iteration preserves insertion order. */
    private readonly actions = new Map<string, InlineAction>();

    /**
     * Register a new action. Throws if the id is already taken so silent
     * shadowing of an existing action cannot happen at runtime.
     */
    register(action: InlineAction): void {
        if (this.actions.has(action.id)) {
            throw new Error(`[InlineActionRegistry] action id "${action.id}" is already registered`);
        }
        this.actions.set(action.id, action);
    }

    /**
     * Remove an action by id. Idempotent for unknown ids so plugin
     * unload paths can call it without guarding.
     */
    unregister(id: string): void {
        this.actions.delete(id);
    }

    getAction(id: string): InlineAction | undefined {
        return this.actions.get(id);
    }

    /**
     * List actions in insertion order. When a context is provided,
     * only actions whose isEligible(ctx) returns true are included.
     * Without a context, every registered action is returned (useful
     * for settings UIs listing all known actions).
     */
    listActions(ctx?: InlineTriggerContext): InlineAction[] {
        const all = Array.from(this.actions.values());
        if (ctx === undefined) return all;
        return all.filter(action => action.isEligible(ctx));
    }

    /** Remove every action. Used in tests and plugin reload paths. */
    clear(): void {
        this.actions.clear();
    }
}
