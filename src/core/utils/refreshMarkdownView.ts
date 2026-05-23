/**
 * refreshMarkdownView -- FIX-01-07-03 phase 3.
 *
 * After `vault.modify(file, content)` writes new content to disk, every
 * MarkdownView that has the file open still holds the pre-write content
 * in its CodeMirror buffer. The next user keystroke (or Obsidian
 * auto-save tick) flushes that stale buffer back to disk, silently
 * undoing the write.
 *
 * Phase 2 tried `leaf.openFile(file)` -- proved a no-op because Obsidian
 * skips re-binding when `view.file === file`. Phase 3 writes directly
 * into the CodeMirror buffer via `view.editor.setValue(content)`. That
 * forces the DOM to repaint AND keeps the buffer in sync with disk so
 * the next auto-save is a no-op instead of an overwrite.
 *
 * Cursor preservation: we capture the cursor + scroll position before
 * setValue and clamp them into the new content so the user roughly
 * stays where they were. If the agent edit touched the cursor line,
 * the cursor moves to a sane fallback at line 0.
 *
 * Sebastian's 2026-05-23 repro: with phase 2 the disk char count
 * started growing (15348 -> 15984 -> 16049), proving the write
 * persisted -- but the editor view kept the stale buffer because
 * leaf.openFile(sameFile) is a no-op. Phase 3 closes that gap.
 */

import { MarkdownView, type App, type TFile } from 'obsidian';

export async function refreshOpenMarkdownViewsFor(
    app: App,
    file: TFile,
    content?: string,
): Promise<number> {
    let refreshed = 0;
    try {
        const leaves = app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (!(view instanceof MarkdownView)) continue;
            if (view.file?.path !== file.path) continue;

            // Phase 3 fix: write directly into the CodeMirror buffer.
            // `view.editor.setValue` triggers a synchronous DOM repaint AND
            // marks the buffer as in-sync with disk, so the next auto-save
            // becomes a no-op.
            //
            // If we have no content (Phase 3 caller didn't pass it), fall
            // back to a vault.read so we still beat the stale buffer. The
            // call is cheap because the disk read is local.
            try {
                const next = content ?? await app.vault.read(file);
                const editor = view.editor;
                const cursor = editor.getCursor();
                const scroll = editor.getScrollInfo();
                editor.setValue(next);
                // Clamp the cursor into the new content. Lines may have
                // disappeared under the cursor (agent removed them); fall
                // back to line 0 in that case.
                const lineCount = editor.lineCount();
                const clampedLine = Math.min(cursor.line, Math.max(0, lineCount - 1));
                const lineLen = editor.getLine(clampedLine)?.length ?? 0;
                editor.setCursor({
                    line: clampedLine,
                    ch: Math.min(cursor.ch, lineLen),
                });
                if (scroll && typeof scroll.top === 'number') {
                    editor.scrollTo(scroll.left ?? 0, scroll.top);
                }
                refreshed++;
            } catch (innerErr) {
                console.warn(`[refreshMarkdownView] editor.setValue failed for ${JSON.stringify(file.path)}, falling back to leaf.openFile:`, innerErr);
                try {
                    await leaf.openFile(file, { eState: { focus: false } });
                    refreshed++;
                } catch (fallbackErr) {
                    console.warn(`[refreshMarkdownView] fallback openFile also failed for ${JSON.stringify(file.path)}:`, fallbackErr);
                }
            }
        }
    } catch (e) {
        console.warn(`[refreshMarkdownView] failed for ${JSON.stringify(file.path)}:`, e);
    }
    return refreshed;
}
