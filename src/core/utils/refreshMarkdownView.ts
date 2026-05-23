/**
 * refreshMarkdownView -- FIX-01-07-03 + FIX-01-04-NN.
 *
 * After `vault.modify(file, content)` writes new content to disk, every
 * MarkdownView that has the file open still holds the pre-write content
 * in its CodeMirror buffer. The next user keystroke (or Obsidian
 * auto-save tick) flushes that stale buffer back to disk, silently
 * undoing the write.
 *
 * This helper forces every open leaf that displays the given file to
 * re-bind to it, which pulls the current disk content into the buffer.
 * Side-effect: the cursor position is reset, which is acceptable for an
 * agent-driven write (the buffer the user was editing is no longer the
 * source of truth).
 *
 * Sebastian's 2026-05-23 repro proved this is necessary not only on
 * restore but on every agent edit/write -- otherwise the agent's
 * `edit_file` reports success but the disk content reverts as soon as
 * the editor flushes.
 */

import { MarkdownView, type App, type TFile } from 'obsidian';

export async function refreshOpenMarkdownViewsFor(
    app: App,
    file: TFile,
): Promise<number> {
    let refreshed = 0;
    try {
        const leaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file?.path === file.path) {
                await leaf.openFile(file, { eState: { focus: false } });
                refreshed++;
            }
        }
    } catch (e) {
        console.warn(`[refreshMarkdownView] failed for ${JSON.stringify(file.path)}:`, e);
    }
    return refreshed;
}
