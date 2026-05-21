/**
 * ResultExternalizer — ADR-063: Context Externalization
 *
 * Writes large tool results to temp files and returns compact references.
 * Integrated into ToolExecutionPipeline AFTER tool execution, BEFORE
 * returning the result to the conversation history.
 *
 * Design principles (Manus Context Engineering):
 * - Append-only: references are written once, never modified
 * - Recoverable: full content stays in temp file, agent can read_file to reload
 * - Deterministic: file paths use taskId + toolName + iteration (no timestamps)
 * - Unified: same pattern for all tools, logic lives in pipeline not tools
 */

import type { FileAdapter } from '../storage/types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Results larger than this (in chars) are externalized to a temp file. */
const EXTERNALIZE_THRESHOLD = 2000;

/**
 * FIX-24-03-01: when the agent re-reads a tmp file the externalizer itself
 * produced, keep at most this many characters of the head in the conversation.
 * The full text already lives in that file and was summarized when it was first
 * produced — a verbatim re-read would just shovel the bulk one message forward.
 */
const RE_READ_CAP_CHARS = 2000;

/** Tools that should NEVER be externalized (original file exists in vault). */
const SKIP_EXTERNALIZATION = new Set([
    'write_file', 'edit_file', 'append_to_file', 'create_folder',
    'delete_file', 'move_file', 'update_frontmatter',
    'generate_canvas', 'create_base', 'update_base',
    'create_docx', 'create_pptx', 'create_xlsx',
    'ask_followup_question', 'attempt_completion', 'switch_agent',
    'update_todo_list', 'update_settings', 'configure_model',
    'manage_source', 'manage_mcp_server',
    'enable_plugin', 'new_task', 'evaluate_expression',
    'open_note', 'get_daily_note',
    // Memory v2 retrieval (FEATURE-0317/0320): output is already curated
    // (top-K hits with clickable links / citations) and must reach the
    // agent verbatim. Externalizing forces a follow-up read_file that
    // gets re-externalized and the model never sees the actual hits.
    'search_history', 'recall_memory',
    // ADR-063 (revised 2026-04-29): read_file/read_document return content
    // the agent explicitly requested. Replacing it with a 400-char preview
    // forces a follow-up "re-read" that hits the cache and returns the same
    // preview, sending the agent into a search/sub-agent loop. The original
    // ADR design excluded these tools; the implementation note that flipped
    // the decision caused a 5+ minute regression on summarization tasks.
    // MAX_CONTENT_CHARS in ReadFileTool already caps oversized files.
    'read_file', 'read_document',
]);

// ---------------------------------------------------------------------------
// Reference formatters (tool-specific compact summaries)
// ---------------------------------------------------------------------------

function formatSearchFilesRef(content: string, path: string): string {
    // Extract match count and top results
    const matchLine = content.match(/Found (\d+) match/);
    const count = matchLine ? matchLine[1] : '?';
    // Extract file paths from results (lines starting with the vault path)
    const fileMatches = content.match(/^[^\n]*\.md:/gm) ?? [];
    const topFiles = [...new Set(fileMatches.map(m => m.replace(/:$/, '')))]
        .slice(0, 5)
        .map(f => `  - ${f}`)
        .join('\n');
    return `[search_files] Found ${count} matches.\nTop files:\n${topFiles}\n\nFull results saved to: ${path}\nUse read_file("${path}") to see all matches with context.`;
}

function formatSemanticSearchRef(content: string, path: string): string {
    // Extract result count and top entries
    const lines = content.split('\n').filter(l => l.trim());
    const resultLines = lines.filter(l => l.match(/^\d+\.|^-\s/));
    const count = resultLines.length || '?';
    const top3 = resultLines.slice(0, 3).join('\n');
    return `[semantic_search] ${count} results.\nTop 3:\n${top3}\n\nFull results saved to: ${path}\nUse read_file("${path}") to see all results with excerpts.`;
}

function formatReadFileRef(content: string, path: string, toolInput: Record<string, unknown>): string {
    const filePath = (toolInput.path as string) ?? 'unknown';
    // Extract headings for navigation (richer reference — ADR-63 amendment).
    const headings = content.match(/^#{1,4}\s+.+$/gm) ?? [];
    const headingList = headings.slice(0, 16).map(h => `  ${h}`).join('\n');
    const preview = content.slice(0, 800).replace(/\n+/g, ' ').trim();
    return `[read_file] Content of ${filePath} (${content.length} chars).\nHeadings:\n${headingList || '  (no headings)'}\nPreview: ${preview}…\n\nFull content saved to: ${path}\nUse read_file("${path}") ONLY if you need a section that is not visible in the headings/preview above.`;
}

/** Pull the most informative leading lines (skip empties and bare markers) for a richer web/default preview. */
function topLines(content: string, n: number): string {
    return content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .slice(0, n)
        .join('\n');
}

function formatWebRef(content: string, path: string, toolName: string): string {
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const headings = (content.match(/^#{1,3}\s+.+$/gm) ?? []).slice(0, 12).map(h => `  ${h}`).join('\n');
    const preview = content.slice(0, 1200).replace(/\n+/g, ' ').trim();
    return `[${toolName}] ${content.length} chars fetched.${title ? `\nTitle: ${title}` : ''}${headings ? `\nHeadings:\n${headings}` : ''}\nPreview: ${preview}…\n\nFull content saved to: ${path}\nUse read_file("${path}") ONLY if the preview/headings above don't cover what you need.`;
}

function formatDefaultRef(content: string, path: string, toolName: string): string {
    const head = topLines(content, 12);
    return `[${toolName}] Result (${content.length} chars).\nFirst lines:\n${head}\n\nFull result saved to: ${path}\nUse read_file("${path}") ONLY if you need detail beyond the lines above.`;
}

/** FIX-24-03-01: capped echo of a re-read of a tmp file the externalizer produced. */
function formatReReadCap(content: string, path: string): string {
    const headings = content.match(/^#{1,4}\s+.+$/gm) ?? [];
    const headingList = headings.slice(0, 16).map(h => `  ${h}`).join('\n');
    const head = content.slice(0, RE_READ_CAP_CHARS).replace(/\n+/g, ' ').trim();
    return `[re-read of ${path} — capped to ${RE_READ_CAP_CHARS} chars; the file has ${content.length} chars]\nHeadings:\n${headingList || '  (no headings)'}\nHead: ${head}…\n\nThis content was already summarized in the reference when it was first produced. Do not re-read the whole file again — if you need a specific section that is not above, search the file or quote the exact heading you need.`;
}

// ---------------------------------------------------------------------------
// ResultExternalizer
// ---------------------------------------------------------------------------

/** Default root for externalised tmp results. Lives inside the vault as a
 *  hidden folder so Obsidian's index ignores it and read_file() can resolve
 *  the same relative path the agent receives in tool-result references. */
export const DEFAULT_TMP_ROOT = '.obsidian-agent/tmp';

export class ResultExternalizer {
    private fs: FileAdapter;
    private taskId: string;
    private tmpDir: string;
    private iteration = 0;
    private callCounter = 0;
    private _disabled = false;
    private _dirCreated = false;

    /**
     * @param fs FileAdapter that the agent's read_file tool can also see. Pass
     *           a VaultDataFileAdapter (vault.adapter wrapper) so the file
     *           lands inside the vault. Passing GlobalFileService writes
     *           outside the vault and breaks the read-back path (BUG-014).
     * @param taskId Stable per-task identifier used in the tmp directory name.
     * @param tmpRoot Optional override for the tmp root (default
     *                `.obsidian-agent/tmp`, vault-relative).
     */
    constructor(fs: FileAdapter, taskId: string, tmpRoot: string = DEFAULT_TMP_ROOT) {
        this.fs = fs;
        this.taskId = taskId;
        this.tmpDir = `${tmpRoot}/${taskId}`;
    }

    /** Disable externalization (used by Fast Path — ADR-061). */
    disable(): void { this._disabled = true; }

    /** Re-enable externalization. */
    enable(): void { this._disabled = false; }

    /** Increment iteration counter (call once per agent loop iteration). */
    nextIteration(): void { this.iteration++; }

    /**
     * Check if a tool result should be externalized, and if so, write it
     * to a temp file and return a compact reference. Otherwise return null.
     */
    /** True when `p` points at a tmp file this externalizer produced. */
    isExternalizedPath(p: unknown): boolean {
        if (typeof p !== 'string' || !p) return false;
        const norm = p.replace(/^\.?\/+/, '');
        return norm === this.tmpDir || norm.startsWith(this.tmpDir + '/');
    }

    async maybeExternalize(
        toolName: string,
        toolInput: Record<string, unknown>,
        content: string,
        isError: boolean,
    ): Promise<string | null> {
        // Never externalize errors, disabled state, or small results
        if (this._disabled) return null;
        if (isError) return null;
        if (content.length <= EXTERNALIZE_THRESHOLD) return null;

        // FIX-24-03-01: a re-read of a tmp file the externalizer itself produced
        // must not put the full text back into history — return a capped echo
        // instead. read_file/read_document are otherwise in SKIP_EXTERNALIZATION,
        // so this special case has to come BEFORE that check.
        if ((toolName === 'read_file' || toolName === 'read_document')
            && this.isExternalizedPath(toolInput?.path)) {
            return formatReReadCap(content, String(toolInput.path));
        }

        if (SKIP_EXTERNALIZATION.has(toolName)) return null;

        try {
            // E-4: Skip redundant exists check after first mkdir
            if (!this._dirCreated) {
                const dirExists = await this.fs.exists(this.tmpDir);
                if (!dirExists) await this.fs.mkdir(this.tmpDir);
                this._dirCreated = true;
            }

            // Write full content to temp file (deterministic name using global call counter)
            this.callCounter++;
            // S-3: Sanitize toolName to prevent path traversal (MCP tools may have special chars)
            const safeName = toolName.replace(/[^a-zA-Z0-9_-]/g, '_');
            const fileName = `${safeName}-${this.callCounter}.md`;
            const filePath = `${this.tmpDir}/${fileName}`;
            await this.fs.write(filePath, content);

            // Generate tool-specific compact reference
            const ref = this.formatReference(toolName, content, filePath, toolInput);

            console.debug(`[Externalize] ${toolName} result (${content.length} chars) → ${filePath}`);
            return ref;
        } catch (e) {
            // Non-fatal: if externalization fails, return null and let the full content through
            console.warn(`[Externalize] Failed for ${toolName} (non-fatal):`, e);
            return null;
        }
    }

    /**
     * Clean up all temp files for this task. BUG-023 / FIX-24-03-02
     * (macOS iCloud): the file provider occasionally holds a transient lock
     * on the directory and rejects `unlink` with EPERM. Retry a few times
     * with back-off; if the lock persists the orphan sweeper on the next
     * plugin start (`cleanupOrphaned`) finishes the job. Never fatal.
     */
    async cleanup(): Promise<void> {
        try {
            if (!(await this.fs.exists(this.tmpDir))) return;
            const listing = await this.fs.list(this.tmpDir);
            for (const file of listing.files) {
                await removeWithRetry(this.fs, file);
            }
            await removeWithRetry(this.fs, this.tmpDir);
            console.debug(`[Externalize] Cleaned up ${this.tmpDir}`);
        } catch (e) {
            console.warn(
                '[Externalize] Cleanup failed after retries (non-fatal, will retry on next plugin start):',
                e,
            );
        }
    }

    /**
     * Static: clean up orphaned tmp directories (crash recovery on plugin start).
     * @param fs Same FileAdapter type used by the runtime instance.
     * @param tmpRoot Same root the runtime uses (default `.obsidian-agent/tmp`).
     */
    static async cleanupOrphaned(fs: FileAdapter, tmpRoot: string = DEFAULT_TMP_ROOT): Promise<void> {
        try {
            const exists = await fs.exists(tmpRoot);
            if (!exists) return;
            const listing = await fs.list(tmpRoot);
            const ONE_HOUR = 60 * 60 * 1000;
            for (const dir of listing.folders ?? []) {
                try {
                    const stat = await fs.stat(dir);
                    if (stat && Date.now() - stat.mtime > ONE_HOUR) {
                        const files = await fs.list(dir);
                        for (const f of files.files) await removeWithRetry(fs, f);
                        await removeWithRetry(fs, dir);
                        console.debug(`[Externalize] Removed orphaned ${dir}`);
                    }
                } catch { /* skip */ }
            }
        } catch { /* non-fatal */ }
    }

    private formatReference(toolName: string, content: string, path: string, input: Record<string, unknown>): string {
        return formatReferenceDispatch(toolName, content, path, input);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * BUG-023: remove with retry + back-off so transient EPERM locks from macOS
 * iCloud file providers don't leak tmp directories. Three attempts over
 * ~700ms is enough to clear the vast majority of locks; anything stuck
 * longer gets swept up by `cleanupOrphaned` on the next plugin start.
 */
async function removeWithRetry(fs: FileAdapter, path: string): Promise<void> {
    const delays = [0, 150, 500];
    let lastError: unknown = null;
    for (const delay of delays) {
        if (delay > 0) await new Promise((r) => window.setTimeout(r, delay));
        try {
            await fs.remove(path);
            return;
        } catch (e) {
            lastError = e;
            if (!isTransientFsError(e)) throw e;
        }
    }
    throw lastError;
}

function isTransientFsError(e: unknown): boolean {
    const code = (e as { code?: unknown })?.code;
    return code === 'EPERM' || code === 'EBUSY' || code === 'ETXTBSY';
}

function formatReferenceDispatch(toolName: string, content: string, path: string, input: Record<string, unknown>): string {
    switch (toolName) {
        case 'search_files': return formatSearchFilesRef(content, path);
        case 'semantic_search': return formatSemanticSearchRef(content, path);
        case 'read_file':
        case 'read_document': return formatReadFileRef(content, path, input);
        case 'web_search': return formatWebRef(content, path, toolName);
        case 'web_fetch': return formatWebRef(content, path, toolName);
        default: return formatDefaultRef(content, path, toolName);
    }
}
