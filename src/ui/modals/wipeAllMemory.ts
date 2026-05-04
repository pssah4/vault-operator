/**
 * Right-to-be-forgotten flow shared by MemoryViewerModal (modal footer)
 * and MemoryTab (Settings entry). Two-step confirmation:
 *   1. ConfirmModal listing consequences.
 *   2. PromptModal demanding the user type "DELETE".
 *
 * On confirmation, every Memory v2 + legacy v1 table is wiped and the
 * cached settings (capability hash, token budget) reset so the next
 * plugin onload starts from a clean slate.
 *
 * FEATURE-0319b follow-up.
 */

import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { confirmModal, promptModal } from './PromptModal';

export type WipeOutcome = 'deleted' | 'cancelled' | 'failed' | 'no-db';

export async function confirmAndWipeAllMemory(
    app: App,
    plugin: ObsidianAgentPlugin,
): Promise<WipeOutcome> {
    if (!plugin.memoryDB?.isOpen()) {
        new Notice('Memory database is not open.');
        return 'no-db';
    }

    const ok = await confirmModal(app, {
        title: 'Delete all memory?',
        message:
            'This permanently removes EVERYTHING Obsilo has stored:\n\n' +
            '· All facts you taught it about yourself\n' +
            '· Obsilo\'s entire soul (identity, values, anti-patterns, communication style)\n' +
            '· All session summaries from past conversations\n' +
            '· The audit trail (no recovery, no undo)\n' +
            '· The capability snapshot (will rebuild on next plugin reload)\n\n' +
            'You will keep your conversations themselves and your vault content. ' +
            'Continue?',
        confirmLabel: 'Continue',
        cancelLabel: 'Cancel',
        destructive: true,
    });
    if (!ok) return 'cancelled';

    const typed = await promptModal(app, {
        title: 'Type DELETE to confirm',
        message: 'This action cannot be undone. Type DELETE in capital letters to proceed.',
        placeholder: 'DELETE',
        submitLabel: 'Delete all memory',
    });
    if (typed === null || typed.trim() !== 'DELETE') {
        new Notice('Cancelled. Memory not deleted.');
        return 'cancelled';
    }

    try {
        const memDB = plugin.memoryDB;
        const db = memDB.getDB();
        const tables = [
            'memory_audit', 'fact_edges', 'fact_embeddings', 'facts',
            'communication_styles', 'thread_sessions', 'conversation_threads',
            'known_topics', 'memory_source_notes',
            'sessions', 'episodes', 'recipes', 'patterns',
        ];
        for (const table of tables) {
            try { db.run(`DELETE FROM ${table}`); } catch { /* table may not exist */ }
        }
        await memDB.save().catch(() => undefined);

        plugin.settings.memory.lastCapabilityHash = null;
        plugin.settings.memory.tokenBudgetState = null;
        await plugin.saveSettings();

        new Notice('All memory deleted.');
        return 'deleted';
    } catch (e) {
        console.warn('[wipeAllMemory] failed:', e);
        new Notice('Memory deletion failed. See console for details.');
        return 'failed';
    }
}
