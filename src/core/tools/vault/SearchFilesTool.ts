import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { safeRegexChecked } from '../../utils/regexSafetyProbe';

const MAX_RESULTS = 50;
/**
 * Absolute wall-clock budget for the synchronous scan (AUDIT 2026-07-14 Codex
 * M-6, defense-in-depth). safeRegex already rejects the known catastrophic
 * shapes; this bounds any future pattern that still slips through and spreads
 * moderate per-line cost across many lines/files, so the renderer main thread
 * cannot be pinned indefinitely. It cannot interrupt a single pathological
 * exec() call -- that is what the safeRegex gate is for.
 */
const SEARCH_DEADLINE_MS = 1500;
/**
 * Max chars echoed for a single match line. ASR transcripts have "lines"
 * that run to ~13k chars, so echoing the whole matched line dumped the
 * file into the result (live incident 2026-07-08: 23 anchor hits =
 * 115,666 chars, externalized + re-read in 50k chunks). A hit is shown
 * as a context window around the match instead.
 */
const MAX_MATCH_LINE_CHARS = 240;
const MATCH_CONTEXT_BEFORE = 80;

/** Show a match line trimmed to a window around the hit; ellipsis marks truncation. */
function clampMatchLine(line: string, matchIndex: number): string {
    const trimmed = line.trim();
    if (trimmed.length <= MAX_MATCH_LINE_CHARS) return trimmed;
    const start = Math.max(0, matchIndex - MATCH_CONTEXT_BEFORE);
    const end = Math.min(line.length, start + MAX_MATCH_LINE_CHARS);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < line.length ? '…' : '';
    return `${prefix}${line.slice(start, end).trim()}${suffix}`;
}

export class SearchFilesTool extends BaseTool<'search_files'> {
    readonly name = 'search_files' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'search_files',
            description:
                'Search for a text pattern across files in the vault. Returns matching lines with file path and line numbers. Use path "/" to search the entire vault.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Directory to search in (relative to vault root, or "/" for entire vault)',
                    },
                    pattern: {
                        type: 'string',
                        description: 'Text or regular expression to search for',
                    },
                    file_pattern: {
                        type: 'string',
                        description: 'Optional file extension filter, e.g. ".md" or ".txt"',
                    },
                },
                required: ['path', 'pattern'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const rawPath = (input.path as string) ?? '/';
        const pattern = (input.pattern as string) ?? '';
        const filePattern = input.file_pattern as string | undefined;

        if (!pattern) {
            callbacks.pushToolResult(this.formatError(new Error('pattern parameter is required')));
            return;
        }

        try {
            // K-2 / S-02 + FIX-01-04-03: ReDoS-safe regex. safeRegexChecked
            // additionally MEASURES the pattern in a terminable worker (dynamic
            // guard) before it runs over the candidate files here, so
            // a catastrophic pattern the static blocklist misses is literalized
            // instead of freezing the renderer main thread.
            const regex = await safeRegexChecked(pattern, 'i');

            const dirPath = rawPath === '/' || rawPath === '' ? '' : rawPath;

            // AUDIT-013 H-1: respect IgnoreService. Notes the user has marked
            // ignored must not appear in search results, ever. The pipeline's
            // path-validation gate only sees the directory parameter; per-file
            // filtering belongs here, in the iteration.
            const ignoreService = this.plugin.ignoreService;

            // Get candidate files
            const files = this.app.vault.getFiles().filter((f) => {
                if (ignoreService.isIgnored(f.path)) return false;
                if (dirPath && !f.path.startsWith(dirPath + '/') && f.path !== dirPath) return false;
                if (filePattern && !f.name.endsWith(filePattern)) return false;
                return true;
            });

            const results: string[] = [];
            let totalMatches = 0;
            const deadline = Date.now() + SEARCH_DEADLINE_MS;
            let deadlineHit = false;

            for (const file of files) {
                if (totalMatches >= MAX_RESULTS) break;
                if (Date.now() > deadline) { deadlineHit = true; break; }

                let content: string;
                try {
                    content = await this.app.vault.cachedRead(file);
                } catch {
                    continue;
                }

                const lines = content.split('\n');
                const fileMatches: string[] = [];

                for (let i = 0; i < lines.length; i++) {
                    // Check the wall-clock budget periodically (cheap: every 512 lines).
                    if ((i & 0x1FF) === 0 && Date.now() > deadline) { deadlineHit = true; break; }
                    // exec (not test) so we know WHERE the hit is and can show a
                    // context window instead of the whole (possibly huge) line.
                    regex.lastIndex = 0;
                    const m = regex.exec(lines[i]);
                    if (m) {
                        fileMatches.push(`  L${i + 1}: ${clampMatchLine(lines[i], m.index)}`);
                        totalMatches++;
                        if (totalMatches >= MAX_RESULTS) break;
                    }
                }

                if (fileMatches.length > 0) {
                    results.push(`${file.path}:\n${fileMatches.join('\n')}`);
                }
                if (deadlineHit) break;
            }

            if (results.length === 0) {
                const deadlineNote = deadlineHit ? ` (search stopped after ${SEARCH_DEADLINE_MS}ms budget; narrow the pattern)` : '';
                callbacks.pushToolResult(`No matches found for "${pattern}" in "${rawPath}".${deadlineNote}`);
                return;
            }

            const limitNote = deadlineHit
                ? ` (stopped after ${SEARCH_DEADLINE_MS}ms budget; results are partial, narrow the pattern)`
                : (totalMatches >= MAX_RESULTS ? ` (showing first ${MAX_RESULTS})` : '');
            const header = `Found ${totalMatches} match(es) for "${pattern}" in "${rawPath || '/'}":${limitNote}`;
            // AUDIT-034 H-7: search hits include raw vault content (the
            // matched lines) which can carry prompt-injection payloads.
            // Wrap the body in the untrusted-content boundary so the
            // system-prompt SECURITY BOUNDARY clause covers it.
            const body = this.formatUntrustedContent(
                'vault-search',
                results.join('\n\n'),
                { pattern, base: rawPath || '/' },
            );
            callbacks.pushToolResult(`${header}\n\n${body}`);
            callbacks.log(`Search "${pattern}" found ${totalMatches} matches across ${results.length} files`);
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('search_files', error);
        }
    }
}
