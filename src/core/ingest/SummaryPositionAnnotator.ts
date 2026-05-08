/**
 * SummaryPositionAnnotator (FIX-19-28-01 PLAN-15 Step 2) -- rendert
 * Take-Aways im Sense-Making-Body als Bullet-Liste mit inline
 * Source-Position-Marker am Satzende.
 *
 * Marker-Form per ADR-103-Amendment 2026-05-07: dezentes ↗-Symbol als
 * Display-Text, Wikilink dahinter. Drei Position-Kinds:
 *
 * - kind 'page'         -> [[basename.pdf#page=N|↗]]   (PDF page-refs default)
 * - kind 'block-anchor' -> [[basename#^block-N|↗]]     (Markdown block-refs;
 *                          block-N kommt aus BlockIdSetter via blockIdMap)
 * - kind 'url-anchor'   -> [[basename#anchor|↗]]       (HTML section-id)
 *
 * Take-Aways ohne Position werden als reine Bullet-Zeile gerendert.
 * Wenn ein block-anchor im blockIdMap nicht gefunden wird, faellt der
 * Marker weg (zur sicheren Seite -- besser kein Marker als ein toter
 * Link).
 */

export type TakeAwayPosition =
    | { kind: 'page'; page: number }
    | { kind: 'block-anchor'; anchorText: string }
    | { kind: 'url-anchor'; anchor: string };

export interface DeepIngestTakeAway {
    /** Aussage, wie sie im Sense-Making-Body erscheint. */
    text: string;
    /** Optional: Position in der Source. Ohne -> nur Bullet. */
    position?: TakeAwayPosition;
}

export interface AnnotateOpts {
    /** Output-Note-Basename, gegen den verlinkt wird. */
    sourceBasename: string;
    /** File-Extension der Source ('pdf', 'md', etc.). */
    sourceExtension: string;
}

/**
 * Erzeugt einen Sense-Making-Body als Bullet-Liste mit inline
 * Position-Markern. Markdown-konform.
 *
 * @param takeAways Take-Away-Liste (kann Position haben oder nicht).
 * @param opts      Source-Basename + Extension fuer Wikilink-Targets.
 * @param blockIdMap Optional: Map anchorText -> blockId (z.B. "block-7"),
 *                   wie sie BlockIdSetter ausgibt. Pflicht fuer
 *                   block-anchor-Position; ohne Map bleibt der Marker
 *                   bei block-anchor weg.
 */
export function annotateTakeAways(
    takeAways: DeepIngestTakeAway[],
    opts: AnnotateOpts,
    blockIdMap?: Record<string, string>,
): string {
    if (takeAways.length === 0) return '';
    const lines = takeAways.map((t) => renderBullet(t, opts, blockIdMap));
    return lines.join('\n');
}

function renderBullet(
    takeAway: DeepIngestTakeAway,
    opts: AnnotateOpts,
    blockIdMap?: Record<string, string>,
): string {
    const marker = renderMarker(takeAway.position, opts, blockIdMap);
    if (marker) {
        return `- ${takeAway.text} ${marker}`;
    }
    return `- ${takeAway.text}`;
}

function renderMarker(
    position: TakeAwayPosition | undefined,
    opts: AnnotateOpts,
    blockIdMap?: Record<string, string>,
): string {
    if (!position) return '';
    if (position.kind === 'page') {
        const target = opts.sourceExtension === 'pdf'
            ? `${opts.sourceBasename}.pdf#page=${position.page}`
            : `${opts.sourceBasename}#page=${position.page}`;
        return `[[${target}|↗]]`;
    }
    if (position.kind === 'block-anchor') {
        const blockId = blockIdMap?.[position.anchorText];
        if (!blockId) return '';
        return `[[${opts.sourceBasename}#^${blockId}|↗]]`;
    }
    if (position.kind === 'url-anchor') {
        return `[[${opts.sourceBasename}#${position.anchor}|↗]]`;
    }
    return '';
}
