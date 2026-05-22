/**
 * BlockIdSetter -- deterministische Block-ID-Vergabe in Source-Notes.
 *
 * Backs FEAT-19-28 (Source-Position-Marker, ADR-103).
 *
 * Pattern: System-generated `^block-N` (sequentiell, ab block-1).
 * Idempotent: vorhandene `^block-N`-IDs werden nicht ueberschrieben.
 *
 * Block-ID landet am Ende eines Absatzes (oder nach einem markierten
 * Anker-Text). Output ist Markdown-konform fuer Obsidian Wikilink
 * `[[file#^block-N]]`.
 */

const BLOCK_ID_PATTERN = /\s\^block-\d+\s*$/;
const ANY_BLOCK_ID = /\s\^[\w-]+\s*$/;

export interface BlockIdMarkResult {
    /** Source content mit Block-IDs am Ende der Anker-Bloecke. */
    content: string;
    /** Map: anchor-text -> block-id (zB "block-3"). */
    anchorToBlockId: Record<string, string>;
}

/**
 * Setzt Block-IDs in einer Source-Note. Bestehende `^block-N`-IDs werden
 * gezaehlt und respektiert, neue beginnen bei der naechsten freien Nummer.
 *
 * @param content Source-Note Markdown
 * @param anchorTexts Liste von Text-Snippets, die als Anchor markiert werden sollen.
 *                    Der Setter sucht das erste Vorkommen pro Anchor und
 *                    appended `^block-N` an dessen Absatz-Ende.
 */
export function markBlockIds(content: string, anchorTexts: string[]): BlockIdMarkResult {
    const lines = content.split('\n');
    let nextId = findNextFreeBlockId(content);
    const anchorToBlockId: Record<string, string> = {};

    for (const anchor of anchorTexts) {
        const trimmed = anchor.trim();
        if (!trimmed) continue;
        const lineIdx = findAnchorLine(lines, trimmed);
        if (lineIdx < 0) continue;
        const blockEnd = findBlockEnd(lines, lineIdx);
        // Wenn bereits eine Block-ID am Ende: respektieren, nicht ueberschreiben
        const existingMatch = lines[blockEnd].match(ANY_BLOCK_ID);
        if (existingMatch) {
            const idMatch = existingMatch[0].match(/\^([\w-]+)/);
            if (idMatch) {
                anchorToBlockId[trimmed] = idMatch[1];
            }
            continue;
        }
        const blockId = `block-${nextId++}`;
        lines[blockEnd] = `${lines[blockEnd]} ^${blockId}`;
        anchorToBlockId[trimmed] = blockId;
    }

    return {
        content: lines.join('\n'),
        anchorToBlockId,
    };
}

function findNextFreeBlockId(content: string): number {
    let max = 0;
    const re = /\^block-(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > max) max = n;
    }
    return max + 1;
}

function findAnchorLine(lines: string[], anchor: string): number {
    // Try exact match first.
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(anchor)) return i;
    }
    // Pass 2: case-insensitive, normalised whitespace.
    const normalizedWs = anchor.replace(/\s+/g, ' ').toLowerCase();
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].replace(/\s+/g, ' ').toLowerCase().includes(normalizedWs)) return i;
    }
    // Pass 3: aggressive normalisation -- strip punctuation, collapse
    // whitespace, lowercase. Lets the agent pass a take-away phrase that
    // matches the source line even if quotes / commas / dashes differ.
    // Requires the anchor to be a meaningful phrase (>= 4 tokens) so we
    // don't false-match short keywords against random lines.
    const aggressive = aggressiveNormalize(anchor);
    if (aggressive.split(' ').filter(Boolean).length >= 4) {
        for (let i = 0; i < lines.length; i++) {
            if (aggressiveNormalize(lines[i]).includes(aggressive)) return i;
        }
    }
    // Pass 4: longest-substring match -- score each line by how much of
    // the anchor's normalised tokens appear contiguously. The line with
    // the highest contiguous overlap wins, provided the overlap covers
    // at least half of the anchor tokens. Cheap and tolerant enough to
    // handle minor wording differences (e.g. the source has an extra
    // filler word) without resorting to semantic search.
    const anchorTokens = aggressive.split(' ').filter(Boolean);
    if (anchorTokens.length >= 5) {
        let bestIdx = -1;
        let bestScore = 0;
        for (let i = 0; i < lines.length; i++) {
            const lineNorm = aggressiveNormalize(lines[i]);
            if (!lineNorm) continue;
            const score = longestContiguousOverlap(anchorTokens, lineNorm.split(' ').filter(Boolean));
            if (score > bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }
        if (bestScore >= Math.ceil(anchorTokens.length / 2)) return bestIdx;
    }
    return -1;
}

function aggressiveNormalize(s: string): string {
    return s
        .toLowerCase()
        // Collapse common quote / dash / punctuation variants to plain ascii.
        .replace(/[‐-―]/g, '-')
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[“”„‟]/g, '"')
        // Strip everything that is not a letter, digit, or space.
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function longestContiguousOverlap(a: string[], b: string[]): number {
    // O(n*m) LCS-substring over token arrays. Returns the length of the
    // longest run of tokens that appear in both `a` and `b` in order.
    if (a.length === 0 || b.length === 0) return 0;
    let best = 0;
    const dp: number[] = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
        let prev = 0;
        for (let j = 1; j <= b.length; j++) {
            const temp = dp[j];
            if (a[i - 1] === b[j - 1]) {
                dp[j] = prev + 1;
                if (dp[j] > best) best = dp[j];
            } else {
                dp[j] = 0;
            }
            prev = temp;
        }
    }
    return best;
}

function findBlockEnd(lines: string[], startIdx: number): number {
    // Block ends at next blank line or end of file
    for (let i = startIdx + 1; i < lines.length; i++) {
        if (lines[i].trim() === '') return i - 1;
    }
    return lines.length - 1;
}

/** Pruefe ob eine Block-ID-Form in einer Zeile ist (fuer Tests). */
export function hasBlockId(line: string): boolean {
    return BLOCK_ID_PATTERN.test(line);
}
