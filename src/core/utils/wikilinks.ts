/**
 * Wikilink Utilities -- consolidated parsing for `[[target]]` syntax.
 *
 * Multiple parts of the codebase need to extract Obsidian-style wikilinks
 * from arbitrary text. Before this module there were FOUR parallel
 * implementations:
 *
 *   src/core/memory/MentionParser.ts       -- regex, memory layer
 *   src/core/knowledge/GraphExtractor.ts   -- regex, knowledge layer
 *   src/core/tools/agent/UpdateTodoListTool.ts -- manual indexOf
 *   src/core/tool-execution/ToolExecutionPipeline.ts -- manual indexOf
 *
 * The two indexOf scanners were written from scratch in this session
 * (FEATURE-1804 / ADR-090) explicitly to avoid catastrophic backtracking
 * after a regex hung Obsidian's main thread on a multiline frontmatter scan.
 *
 * This module is the single linear scanner the new code uses. The two
 * older regex-based implementations remain in place for now -- migrating
 * them is a separate concern and risks regressions in unrelated systems.
 *
 * Design principles:
 *   - Pure linear `indexOf` walking. NO regex. Guaranteed O(n).
 *   - No external imports (engine-public).
 *   - Bounded scan: callers can cap the input slice (recommended for body
 *     scans on large notes).
 *
 * Future work: migrate MentionParser and GraphExtractor to use this.
 */

export interface ParsedWikilink {
    /** The target before any `|alias` or `#heading`, trimmed. */
    target: string;
    /** Optional alias (text after `|`), trimmed. */
    alias?: string;
    /** Optional heading anchor (text after `#`), trimmed. */
    heading?: string;
    /** Byte offset of the opening `[[` in the input. */
    start: number;
    /** Byte offset just past the closing `]]`. */
    end: number;
}

/**
 * Walk a string and yield every well-formed wikilink. Malformed brackets
 * (open without close, or close without open) are silently skipped.
 *
 * Treats `target#heading` and `target|alias` and `target#heading|alias`
 * uniformly.
 */
export function parseWikilinks(text: string): ParsedWikilink[] {
    if (!text || text.length === 0) return [];
    const out: ParsedWikilink[] = [];
    let i = 0;
    while (i < text.length) {
        const open = text.indexOf('[[', i);
        if (open === -1) break;
        const close = text.indexOf(']]', open + 2);
        if (close === -1) break;
        const inner = text.slice(open + 2, close);

        // Reject inner content with newlines -- Obsidian wikilinks are single-line.
        if (inner.includes('\n')) {
            i = open + 2;
            continue;
        }

        const pipe = inner.indexOf('|');
        const headPart = pipe >= 0 ? inner.slice(0, pipe) : inner;
        const aliasPart = pipe >= 0 ? inner.slice(pipe + 1).trim() : undefined;

        const hash = headPart.indexOf('#');
        const target = (hash >= 0 ? headPart.slice(0, hash) : headPart).trim();
        const heading = hash >= 0 ? headPart.slice(hash + 1).trim() : undefined;

        if (target) {
            out.push({
                target,
                alias: aliasPart && aliasPart.length > 0 ? aliasPart : undefined,
                heading: heading && heading.length > 0 ? heading : undefined,
                start: open,
                end: close + 2,
            });
        }
        i = close + 2;
    }
    return out;
}

/**
 * Convenience: just the targets (deduplicated, in original order).
 */
export function extractWikilinkTargets(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const w of parseWikilinks(text)) {
        if (!seen.has(w.target)) {
            seen.add(w.target);
            out.push(w.target);
        }
    }
    return out;
}

/**
 * Build a Set of basenames (filename without extension) from a list of
 * vault paths. Used by readFiles-tracking to compare wikilink targets
 * against actually-read paths.
 *
 *   "Inbox/My Note.md"        -> "My Note"
 *   "Folder/SubFolder/X.md"   -> "X"
 *   "Plain"                   -> "Plain"
 */
export function pathsToBasenames(paths: Iterable<string>): Set<string> {
    const out = new Set<string>();
    for (const p of paths) {
        const filename = p.split('/').pop() ?? p;
        const dot = filename.lastIndexOf('.');
        out.add(dot > 0 ? filename.slice(0, dot) : filename);
    }
    return out;
}

/**
 * Strip a trailing ".md" / ".pdf" / etc. (1-5 char extension) from a
 * wikilink target so it can be compared against `pathsToBasenames` output.
 *
 *   "My Note"     -> "My Note"
 *   "My Note.md"  -> "My Note"
 *   "x.y.docx"    -> "x.y"
 */
export function stripWikilinkExtension(target: string): string {
    const dot = target.lastIndexOf('.');
    if (dot <= 0) return target;
    const ext = target.slice(dot + 1);
    return /^\w{1,5}$/.test(ext) ? target.slice(0, dot) : target;
}

/**
 * Heuristic: does this wikilink target look like a document/note rather
 * than a person? Used by the body-scan branch of the hallucination brake
 * to avoid flagging legitimate cross-references like `[[Magda Krumova]]`.
 *
 * "Document-shape" means the target contains at least one of these
 * domain-significant keywords: Interview, Note(n), Notiz(en), Meeting,
 * Bericht, Report, Use Case, Protokoll, Document, Dokument, Briefing,
 * Memo, Synthese.
 */
export function looksLikeDocumentReference(target: string): boolean {
    return DOCUMENT_REF_RE.test(target);
}

const DOCUMENT_REF_RE = /\b(Interview|Notiz(?:en)?|Note[ns]?|Meeting|Bericht|Report|Use[ -]?Case|Protokoll|Document|Dokument|Briefing|Memo|Synthese)\b/i;
