/**
 * SendToMainChatAction -- send selection to the main chat sidebar (FEAT-33-04, EPIC-33).
 *
 * The only inline-action that deliberately surfaces the Chat-Sidebar.
 * Opens the sidebar if it is closed and inserts the user's selection
 * as a pre-context block into the chat input. No LLM call from this
 * action -- the user picks the prompt manually in the sidebar.
 *
 * Sidebar-Independence reminder (ADR-138): this is the documented
 * exception to the cross-FEAT constraint. All other actions run with
 * the sidebar closed; this one opens it as part of its own contract.
 *
 * Related: FEAT-33-04, ADR-138.
 */

import type { AgentTaskCallbacks } from '../../AgentTask';
import type { InlineAction } from '../InlineActionRegistry';
import type { InlineTriggerContext } from '../InlineTriggerContext';

/**
 * Abstraction over the chat sidebar so the action stays Obsidian-API
 * free. The plugin entry-point provides a concrete implementation.
 */
export interface ChatSidebarController {
    isOpen(): boolean;
    /** Reveal / open the sidebar. */
    open(): Promise<void>;
    /**
     * Inject a selection-as-context block into the active chat input.
     * The plugin can render this as a chip, a quoted block, or simply
     * prefix the input text -- the action does not care.
     */
    insertContextChip(args: { text: string; notePath: string }): Promise<void>;
}

export interface SendToMainChatActionOptions {
    controller: ChatSidebarController;
    /** Override the default id/label if the plugin wants to customize. */
    id?: string;
    label?: string;
}

export class SendToMainChatAction implements InlineAction {
    readonly id: string;
    readonly label: string;
    readonly description: string;

    private readonly controller: ChatSidebarController;

    constructor(options: SendToMainChatActionOptions) {
        this.controller = options.controller;
        this.id = options.id ?? 'send-to-main-chat';
        this.label = options.label ?? 'Send to chat';
        this.description = 'Send the selection to the main chat as context';
    }

    /**
     * Eligible in every editor mode, even when the selection is empty
     * (the user may want to open the chat with the current note path
     * as context but no text excerpt). The plugin can tighten this if
     * needed.
     */
    isEligible(_ctx: InlineTriggerContext): boolean {
        return true;
    }

    async execute(ctx: InlineTriggerContext, callbacks: AgentTaskCallbacks): Promise<void> {
        try {
            if (this.controller.isOpen() !== true) {
                await this.controller.open();
            }
            await this.controller.insertContextChip({
                text: ctx.selectionText,
                notePath: ctx.notePath,
            });
            callbacks.onComplete();
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            callbacks.onError(err);
        }
    }
}
