/**
 * HallucinationBrake -- detect source-claims that reference unread files.
 *
 * Domain rules (FEATURE-1804 / ADR-090):
 *   - In the YAML frontmatter, fields named Quellen / Sources / Source /
 *     Referenzen / References list the agent's claimed sources. Every
 *     wikilink in such a field that does NOT correspond to a file the
 *     agent has read in the current task is a hallucinated citation.
 *   - In the body, two structural patterns also count as citation claims:
 *       (a) A markdown heading "## Quellen / Sources / References /
 *           Referenzen" followed by a list of [[wikilinks]].
 *       (b) A markdown table column whose header is a citation-like word
 *           ("Gespraechspartner", "Interview", "Quelle", "Source",
 *           "Verfasser", "Author", "Speaker", "Sprecher", "Befragter",
 *           "Zitat") -- wikilinks in that column are flagged.
 *   - In body contexts, only DOCUMENT-shaped wikilinks are flagged.
 *     Person wikilinks like [[Jane Doe]] are legitimate cross-references
 *     even when only the interview-note (not the person-note) was read.
 *
 * Implementation notes:
 *   - Pure linear scan via `parseWikilinks` from `utils/wikilinks.ts`.
 *     Catastrophic-backtracking-free.
 *   - Body scan capped at 4000 lines so a huge note never blocks the
 *     main thread (the historical freeze symptom that triggered this
 *     module's extraction from ToolExecutionPipeline).
 *
 * The pipeline integration (call site in ToolExecutionPipeline) wraps
 * this in try/catch so any future bug here can never block tool execution.
 */

import {
    extractWikilinkTargets,
    looksLikeDocumentReference,
    pathsToBasenames,
    stripWikilinkExtension,
} from '../utils/wikilinks';

const SOURCE_KEYS_RE = /^(?:quellen|sources?|referenzen|references)$/i;
const FRONTMATTER_LINE_LIMIT = 200;
const BODY_LINE_CAP = 4000;
const BODY_HEADING_RE = /^#{1,6}\s+(Quellen|Sources?|Referenzen|References)\b/i;
const CITATION_COL_RE = /\b(Gespr(ä|ae)chspartner|Interview(?:partner|ter)?|Quelle[n]?|Sources?|Verfasser|Author|Speaker|Sprecher|Interviewter|Befragter|Zitat|Citation)\b/i;
const TABLE_SEPARATOR_RE = /^\s*\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/;

type CollectMode = 'all' | 'documents-only';

/**
 * Walk a tool input (write_file / append_to_file / update_frontmatter
 * payload) and return wikilink targets that look like citation claims
 * but reference files NOT in `readFiles`.
 *
 * @param input  The tool's input object. Looks at `content` (markdown body)
 *               and `updates` (object with frontmatter field updates).
 * @param readFiles Set of vault paths read in the current task.
 * @returns Deduplicated list of unread citation targets.
 */
export function scanUnreadSources(
    input: Record<string, unknown>,
    readFiles: Set<string>,
): string[] {
    const candidates: string[] = [];
    const collect = (text: string, mode: CollectMode) => {
        for (const target of extractWikilinkTargets(text)) {
            if (mode === 'all' || looksLikeDocumentReference(target)) {
                candidates.push(target);
            }
        }
    };

    const content = typeof input.content === 'string' ? input.content : '';
    if (content.length > 0) {
        const bodyStartLine = scanFrontmatter(content, collect);
        scanBody(content, bodyStartLine, collect);
    }

    scanUpdatesObject(input.updates, collect);

    if (candidates.length === 0) return [];

    const readBasenames = pathsToBasenames(readFiles);
    const unread = new Set<string>();
    for (const ref of candidates) {
        if (!ref) continue;
        if (!readBasenames.has(stripWikilinkExtension(ref))) {
            unread.add(ref);
        }
    }
    return [...unread];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Walk the YAML frontmatter region. Returns the body's start line (0 if
 * no frontmatter found, otherwise the line after the closing `---`).
 *
 * Within the frontmatter, indented `- "[[...]]"` items under a
 * Quellen/Sources/Source/Referenzen/References key are collected.
 */
function scanFrontmatter(
    content: string,
    collect: (text: string, mode: CollectMode) => void,
): number {
    const lines = content.split('\n', FRONTMATTER_LINE_LIMIT + 2);
    if (lines[0]?.trim() !== '---') return 0;

    let inSourceBlock = false;
    for (let i = 1; i < lines.length && i < FRONTMATTER_LINE_LIMIT + 1; i++) {
        const line = lines[i];
        if (line.trim() === '---') return i + 1;
        const headerMatch = line.match(/^([A-Za-zäöüÄÖÜß]+):/);
        if (headerMatch) {
            inSourceBlock = SOURCE_KEYS_RE.test(headerMatch[1]);
        } else if (inSourceBlock && /^\s+-\s/.test(line)) {
            collect(line, 'all');
        }
    }
    return 0;
}

/**
 * Walk the body after the frontmatter. Detects two structural citation
 * contexts: markdown headings and citation-table columns.
 */
function scanBody(
    content: string,
    bodyStartLine: number,
    collect: (text: string, mode: CollectMode) => void,
): void {
    const bodyLines = content.split('\n').slice(bodyStartLine);
    let inHeadingBlock = false;
    let citationColIdx = -1;
    let inTable = false;

    for (let i = 0; i < bodyLines.length && i < BODY_LINE_CAP; i++) {
        const line = bodyLines[i];

        // Heading: enter or exit citation section
        if (/^#{1,6}\s/.test(line)) {
            inHeadingBlock = BODY_HEADING_RE.test(line);
            inTable = false;
            citationColIdx = -1;
            continue;
        }

        // Inside a citation heading -- collect document-shaped wikilinks
        // from list items. Person wikilinks under "## Quellen" are also
        // citation claims, but matching them against readFiles produces
        // false positives because we read interview-notes, not person-notes.
        if (inHeadingBlock) {
            if (/^\s*-\s/.test(line)) {
                collect(line, 'documents-only');
                continue;
            }
            if (line.trim() === '') continue;
            inHeadingBlock = false;
        }

        // Table row detection
        if (line.includes('|')) {
            const cells = line.split('|').map((c) => c.trim());
            if (!inTable && cells.some((c) => CITATION_COL_RE.test(c))) {
                citationColIdx = cells.findIndex((c) => CITATION_COL_RE.test(c));
                inTable = true;
                continue;
            }
            if (inTable && TABLE_SEPARATOR_RE.test(line)) continue;
            if (inTable && citationColIdx >= 0 && cells[citationColIdx]) {
                collect(cells[citationColIdx], 'documents-only');
            }
        } else if (inTable) {
            inTable = false;
            citationColIdx = -1;
        }
    }
}

/**
 * Walk an `updates` object (used by `update_frontmatter` tool). Collect
 * wikilinks from any field whose key matches the source-keys pattern.
 */
function scanUpdatesObject(
    updates: unknown,
    collect: (text: string, mode: CollectMode) => void,
): void {
    if (!updates || typeof updates !== 'object') return;
    for (const [key, val] of Object.entries(updates as Record<string, unknown>)) {
        if (!SOURCE_KEYS_RE.test(key)) continue;
        if (Array.isArray(val)) {
            for (const v of val) {
                if (typeof v === 'string') collect(v, 'all');
            }
        } else if (typeof val === 'string') {
            collect(val, 'all');
        }
    }
}
