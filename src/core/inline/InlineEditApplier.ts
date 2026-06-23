/**
 * InlineEditApplier -- post-LLM apply pipeline for inline-edit actions (EPIC-33).
 *
 * Used by InlineChatOrchestrator after Rewrite (and any future inline edit
 * action) finishes streaming. Steps:
 *
 *   1. Open EditReviewModal with the selection as `before` and the LLM output
 *      as `after`. User can edit the right side and clicks Apply.
 *   2. Before writing, request a Git checkpoint via checkpointService so the
 *      change is undoable from the chat history.
 *   3. Replace the original editor selection with the user-approved final
 *      content (Obsidian editor.replaceRange).
 *   4. Notify the caller with the checkpoint info so the chat panel can
 *      render a "checkpoint" marker bubble and the sidebar can rehydrate.
 *
 * Pure-function design: every Obsidian-side dependency arrives via args so
 * the module is unit-testable without the editor.
 *
 * Related: EPIC-33 Diff-UX-refresh (2026-06-22).
 */

import type { App } from 'obsidian';
import type { CheckpointInfo, GitCheckpointService } from '../checkpoints/GitCheckpointService';
import type { EditReviewEntry, EditReviewDecision } from '../../ui/edit-review/EditReviewPanel';

export interface InlineEditApplyArgs {
    app: App;
    checkpointService: GitCheckpointService | null | undefined;
    notePath: string;
    /** Editor selection range (absolute char offsets). */
    selection: { from: number; to: number; text: string };
    /** Streamed LLM output that becomes the right-side default content. */
    proposedText: string;
    /** Label shown as the header subtitle in the review modal. */
    actionLabel: string;
    /** Stable task-id used to group checkpoints (sidebar-history rehydrate). */
    taskId: string;
    /** Tool-name string attached to the checkpoint (e.g. 'inline:rewrite'). */
    toolName: string;
    /** Open the review UI and resolve with the user decision. */
    openReview: (entry: EditReviewEntry) => Promise<EditReviewDecision | null>;
    /** Write final content back into the editor at the selection range. */
    writeBack: (finalContent: string) => Promise<void>;
}

export interface InlineEditApplyResult {
    status: 'applied' | 'skipped' | 'discarded';
    checkpoint?: CheckpointInfo;
    finalContent?: string;
    error?: string;
}

/**
 * Open the review modal, snapshot the note, write the user-approved content
 * back into the editor selection. Returns the result so the orchestrator can
 * render a checkpoint marker or surface an error.
 */
export async function applyInlineEdit(args: InlineEditApplyArgs): Promise<InlineEditApplyResult> {
    if (args.selection.text.length === 0 || args.proposedText.length === 0) {
        return { status: 'skipped', error: 'Empty selection or empty proposal' };
    }

    const entry: EditReviewEntry = {
        path: args.notePath,
        before: args.selection.text,
        after: args.proposedText,
    };
    const decision = await args.openReview(entry);
    if (decision === null) {
        return { status: 'discarded' };
    }
    if (decision.skipped === true) {
        return { status: 'skipped' };
    }
    if (decision.finalContent === args.selection.text) {
        return { status: 'skipped', error: 'No change after review' };
    }

    let checkpoint: CheckpointInfo | undefined;
    if (args.checkpointService !== null && args.checkpointService !== undefined) {
        try {
            checkpoint = await args.checkpointService.snapshot(args.taskId, [args.notePath], args.toolName);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn('[inline-edit] checkpoint snapshot failed (continuing without):', msg);
        }
    }

    try {
        await args.writeBack(decision.finalContent);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { status: 'discarded', error: `Write failed: ${msg}`, checkpoint };
    }

    return { status: 'applied', checkpoint, finalContent: decision.finalContent };
}

/** Stable inline task-id per note, so multiple inline edits on the same note
 *  group into one taskCheckpoints bucket in the sidebar history rehydrate.
 *  The format is intentionally human-readable so users see meaningful labels.
 *  Sidebar rehydrate splits on the dash. */
export function inlineTaskId(notePath: string): string {
    // Stable hash so the id is filesystem-safe (taskId rejects '/', '\').
    let h = 5381;
    for (let i = 0; i < notePath.length; i += 1) {
        h = ((h * 33) ^ notePath.charCodeAt(i)) >>> 0;
    }
    return `inline-${h.toString(16)}`;
}
