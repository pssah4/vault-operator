/**
 * InlineToSidebarTransferService -- live hand-off of an inline conversation
 * into the Sidebar chat (FEAT-33-12 / US-33-12-05).
 *
 * The button "Send to sidebar chat" in the InlineChatPanel composer calls
 * transfer() once `canTransfer()` returns ok. The service opens the
 * Sidebar leaf, asks AgentSidebarView.importConversation() to take over
 * the live MessageParam[] + UiMessage[], and tells the caller to close
 * the inline panel.
 *
 * Sidebar-busy fallback (FEAT-33-13 placeholder):
 *   - If the Sidebar already has a streaming conversation, the service
 *     refuses with reason 'sidebar-busy'. The caller surfaces an
 *     Obsidian Notice. FEAT-33-13 will replace this fallback by opening
 *     a parallel chat session so the running stream is never interrupted.
 *
 * The inline-chat-controller's isRunning probe MUST be checked by the
 * UI layer BEFORE calling transfer() (the send button is gated on this).
 * transfer() itself does not abort an in-flight inline turn.
 */

import { Notice } from 'obsidian';
import type ObsidianAgentPlugin from '../../../main';
import type { MessageParam } from '../../../api/types';
import type { UiMessage } from '../../history/ConversationStore';

/**
 * Sidebar view-type constant. Duplicated from AgentSidebarView to keep
 * this service node-test friendly -- a value import would drag the full
 * Obsidian-side view module (Modal subclasses, etc.) into the unit-test
 * environment.
 */
const VIEW_TYPE_AGENT_SIDEBAR = 'obsidian-agent-sidebar';

/**
 * Structural type for the sidebar handshake. We use a tiny shape instead
 * of importing AgentSidebarView so the runtime view module stays out of
 * this file's import graph.
 */
interface SidebarHandshake {
    readonly isBusy: boolean;
    importConversation(state: TransferState): Promise<void>;
}

export interface TransferState {
    conversationId: string | null;
    history: MessageParam[];
    uiMessages: UiMessage[];
}

export type CanTransferOutcome =
    | { ok: true }
    | { ok: false; reason: 'inline-busy' | 'sidebar-busy' | 'no-sidebar' };

export interface InlineToSidebarTransferServiceOptions {
    plugin: ObsidianAgentPlugin;
    /** Called when the transfer succeeded and the panel should close. */
    onTransferred?: () => void;
    /** Pluggable Notice factory so tests can capture the message. */
    notify?: (msg: string) => void;
}

export class InlineToSidebarTransferService {
    private readonly plugin: ObsidianAgentPlugin;
    private readonly onTransferred?: () => void;
    private readonly notify: (msg: string) => void;

    constructor(options: InlineToSidebarTransferServiceOptions) {
        this.plugin = options.plugin;
        this.onTransferred = options.onTransferred;
        this.notify = options.notify ?? ((m) => { new Notice(m); });
    }

    /**
     * canTransfer is called BOTH by the inline composer (every render
     * tick, to update the button disabled-state) AND by transfer()
     * before it starts. The probe is fast and pure: just checks the
     * inline-running flag and the sidebar's isBusy getter.
     */
    canTransfer(args: { inlineRunning: boolean }): CanTransferOutcome {
        if (args.inlineRunning === true) return { ok: false, reason: 'inline-busy' };
        const sidebar = this.findSidebarView();
        if (sidebar !== null && sidebar.isBusy === true) {
            return { ok: false, reason: 'sidebar-busy' };
        }
        return { ok: true };
    }

    /**
     * Execute the hand-off:
     *   1. Open the Sidebar leaf (or activate it if hidden).
     *   2. Resolve the AgentSidebarView instance.
     *   3. Re-check inlineRunning + sidebar.isBusy LIVE via snapshotProvider
     *      because activateView() is async; a steering message could have
     *      started a new inline turn between click and resume here.
     *   4. Call importConversation with the FRESH snapshot.
     *   5. Tell the caller to close the inline panel.
     *
     * The initial `args.inlineRunning` is the click-time probe used for
     * the gate notification; snapshotProvider is the LIVE re-check that
     * also returns a fresh state. Without the live re-check a user who
     * clicked while idle and immediately typed a new message would send
     * the OLD snapshot to the sidebar -- a real race observed in the
     * adversarial review.
     */
    async transfer(args: {
        inlineRunning: boolean;
        snapshotProvider: () => { state: TransferState; isRunning: boolean };
    }): Promise<CanTransferOutcome> {
        const initial = this.canTransfer({ inlineRunning: args.inlineRunning });
        if (initial.ok !== true) {
            this.notifyForReason(initial.reason);
            return initial;
        }
        try {
            await this.plugin.activateView();
        } catch (e) {
            console.warn('[InlineToSidebarTransferService] activateView failed:', e);
            return { ok: false, reason: 'no-sidebar' };
        }
        const sidebar = this.findSidebarView();
        if (sidebar === null) {
            this.notify('Sidebar chat is not available.');
            return { ok: false, reason: 'no-sidebar' };
        }
        // Race-fix (AUDIT-FEAT-33-12 #1): re-evaluate AFTER the async
        // activateView resolves. A steering message or a new chat turn
        // started in the gap window MUST cancel the transfer.
        const fresh = args.snapshotProvider();
        if (fresh.isRunning === true) {
            this.notifyForReason('inline-busy');
            return { ok: false, reason: 'inline-busy' };
        }
        if (sidebar.isBusy === true) {
            this.notifyForReason('sidebar-busy');
            return { ok: false, reason: 'sidebar-busy' };
        }
        try {
            await sidebar.importConversation(fresh.state);
        } catch (e) {
            console.warn('[InlineToSidebarTransferService] importConversation failed:', e);
            this.notify('Could not move the conversation to the sidebar. See console for details.');
            return { ok: false, reason: 'no-sidebar' };
        }
        try { this.onTransferred?.(); } catch (e) {
            console.debug('[InlineToSidebarTransferService] onTransferred hook threw:', e);
        }
        return { ok: true };
    }

    private notifyForReason(reason: 'inline-busy' | 'sidebar-busy' | 'no-sidebar'): void {
        if (reason === 'inline-busy') {
            this.notify('Waiting for the current response to finish.');
        } else if (reason === 'sidebar-busy') {
            // FEAT-33-13 placeholder: once parallel sessions exist this
            // case opens a fresh session instead of warning.
            this.notify('Sidebar chat is busy. Wait for it to finish or cancel it to receive the inline chat.');
        } else {
            this.notify('Sidebar chat is not available.');
        }
    }

    private findSidebarView(): SidebarHandshake | null {
        const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
        for (const leaf of leaves) {
            const candidate = leaf.view as unknown as Partial<SidebarHandshake> | undefined;
            if (candidate !== undefined && typeof candidate.importConversation === 'function') {
                return candidate as SidebarHandshake;
            }
        }
        return null;
    }
}
