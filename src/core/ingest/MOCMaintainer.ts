/**
 * MOCMaintainer -- aktive Pflege von MOC-Files mit Marker-Konvention.
 *
 * Backs FEAT-19-11 (Aktive MOC-File-Pflege) und FEAT-19-26 (Dialog-
 * getriebener MOC-Page-Update). ADR-96 HTML-Comment-Marker.
 *
 * Marker-Konvention:
 *   <!-- obsilo:auto-start id="moc-header" generated-at="2026-..." sha="..." -->
 *   ... auto-generierter Inhalt ...
 *   <!-- obsilo:auto-end -->
 *
 * SHA-Detection schuetzt vor User-Modifikation: wenn der Block-Body
 * nicht zur SHA in generated-at passt, hat User editiert -> Skip.
 */

const START_RE = /<!--\s*obsilo:auto-start\s+(.*?)\s*-->/;
const END_RE = /<!--\s*obsilo:auto-end\s*-->/;
// Capture id attribute and optional sha
const ID_ATTR_RE = /id\s*=\s*"([^"]+)"/;
const SHA_ATTR_RE = /sha\s*=\s*"([^"]+)"/;

export interface AutoBlock {
    /** start position (line index of the start-marker). */
    startLine: number;
    /** end position (line index of the end-marker). */
    endLine: number;
    /** Block-Inhalt zwischen den Markern (ohne Marker-Zeilen). */
    body: string;
    id: string;
    /** sha-Attribut aus dem Marker (wenn vorhanden). */
    storedSha: string | null;
}

export interface MOCMarkerOptions {
    /** Default 'moc-header': Block-ID-Default. */
    blockId?: string;
    /** Default 'after-frontmatter': position fuer Inject neuer Bloecke. */
    position?: 'top' | 'after-frontmatter' | 'bottom';
}

export interface MOCWriteResult {
    written: boolean;
    skippedReason?: 'user-modified' | 'no-change' | 'error';
    newContent?: string;
}

/**
 * Findet den Auto-Block einer bestimmten ID in einem MOC-Markdown-Content.
 * Returns null wenn nicht vorhanden.
 */
export function findAutoBlock(content: string, blockId = 'moc-header'): AutoBlock | null {
    const lines = content.split('\n');
    let startLine = -1;
    let storedId = '';
    let storedSha: string | null = null;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(START_RE);
        if (m) {
            const attrs = m[1] ?? '';
            const idMatch = attrs.match(ID_ATTR_RE);
            const id = idMatch ? idMatch[1] : 'moc-header';
            if (id === blockId) {
                startLine = i;
                storedId = id;
                const shaMatch = attrs.match(SHA_ATTR_RE);
                storedSha = shaMatch ? shaMatch[1] : null;
                break;
            }
        }
    }
    if (startLine < 0) return null;

    let endLine = -1;
    for (let i = startLine + 1; i < lines.length; i++) {
        if (END_RE.test(lines[i])) {
            endLine = i;
            break;
        }
    }
    if (endLine < 0) return null;

    const body = lines.slice(startLine + 1, endLine).join('\n');
    return { startLine, endLine, body, id: storedId, storedSha };
}

/**
 * Schreibt oder ersetzt einen Auto-Block. Wenn der bestehende Block
 * eine SHA hat und der Body nicht mehr dazu passt: Skip mit
 * skippedReason='user-modified' (ADR-96 Risk-Mitigation).
 */
export function replaceOrInsertAutoBlock(
    content: string,
    newBody: string,
    options: MOCMarkerOptions = {},
): MOCWriteResult {
    const blockId = options.blockId ?? 'moc-header';
    const existing = findAutoBlock(content, blockId);

    if (existing) {
        if (existing.storedSha) {
            const currentSha = sha256(existing.body);
            if (currentSha !== existing.storedSha) {
                // User hat im Block editiert. Skip.
                return { written: false, skippedReason: 'user-modified' };
            }
        }
        if (existing.body.trim() === newBody.trim()) {
            return { written: false, skippedReason: 'no-change' };
        }
        const lines = content.split('\n');
        const newSha = sha256(newBody);
        const newStart = `<!-- obsilo:auto-start id="${blockId}" generated-at="${new Date().toISOString()}" sha="${newSha}" -->`;
        const newEnd = `<!-- obsilo:auto-end -->`;
        const before = lines.slice(0, existing.startLine);
        const after = lines.slice(existing.endLine + 1);
        const newLines = [...before, newStart, ...newBody.split('\n'), newEnd, ...after];
        return { written: true, newContent: newLines.join('\n') };
    }

    // Insert new block
    const position = options.position ?? 'after-frontmatter';
    const newSha = sha256(newBody);
    const newStart = `<!-- obsilo:auto-start id="${blockId}" generated-at="${new Date().toISOString()}" sha="${newSha}" -->`;
    const newEnd = `<!-- obsilo:auto-end -->`;
    const block = `${newStart}\n${newBody}\n${newEnd}\n`;

    if (position === 'top') {
        return { written: true, newContent: block + '\n' + content };
    }
    if (position === 'bottom') {
        return { written: true, newContent: content + '\n\n' + block };
    }
    // after-frontmatter
    const fmEnd = findFrontmatterEnd(content);
    if (fmEnd < 0) {
        // No frontmatter, fall back to top
        return { written: true, newContent: block + '\n' + content };
    }
    const lines = content.split('\n');
    const before = lines.slice(0, fmEnd + 1);
    const after = lines.slice(fmEnd + 1);
    return { written: true, newContent: [...before, '', block, ...after].join('\n') };
}

function findFrontmatterEnd(content: string): number {
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') return -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') return i;
    }
    return -1;
}

/** Simple djb2-style "hash" for sha-attribute. Stable, deterministic, kollisions-beschraenkt. */
function sha256(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) + s.charCodeAt(i);
        h = h & h; // 32-bit
    }
    return Math.abs(h).toString(16);
}
