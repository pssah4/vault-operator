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
    // Try exact match first
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(anchor)) return i;
    }
    // Fallback: case-insensitive, normalized whitespace
    const normalized = anchor.replace(/\s+/g, ' ').toLowerCase();
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].replace(/\s+/g, ' ').toLowerCase().includes(normalized)) return i;
    }
    return -1;
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
