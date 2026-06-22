/**
 * LookupEdgeAggregator -- collects explicit + implicit connections for the Lookup-Action (EPIC-33).
 *
 * For a set of seed notes (active note + top vault-hit paths) it
 * produces a deduped, ranked list of related notes. Sources:
 *  - Explicit outgoing links (cache.links + cache.embeds)
 *  - Explicit backlinks (metadataCache.getBacklinksForFile)
 *  - Tag co-occurrence (cache.tags + frontmatter.tags overlap)
 *  - Implicit semantic similarity (ImplicitConnectionService)
 *
 * All probes are sync (metadataCache + ImplicitConnectionService both
 * read from in-memory / sql.js caches). Aggregator is async only to
 * give callers room to swap in async probes later (e.g. graph-based).
 *
 * Dedup rule: same targetPath via multiple types -> kept once with the
 * strongest edge first, secondaryTypes carries the others so the
 * renderer can show "[[note]] -- backlink + shares #tag".
 *
 * Audit reference: edgesAudit "edgeDataShape" + ImplicitConnectionService
 * read API (getImplicitNeighbors, getBacklinksForFile).
 */

export type InlineEdgeType =
    | 'backlink'
    | 'outgoing-link'
    | 'tag-cooccurrence'
    | 'implicit-similarity';

export interface InlineEdgeHit {
    /** Vault-relative .md path of the related note. */
    targetPath: string;
    /** 0..1 score (semantics depend on type; explicit edges = 1.0). */
    score: number;
    type: InlineEdgeType;
    /** Short human-readable phrase for the panel renderer. */
    reason: string;
    /** Additional types when the same target surfaces multiple ways. */
    secondaryTypes?: InlineEdgeType[];
}

export interface EdgeProbe {
    /** Outgoing links + embeds from this note. Empty when note missing. */
    getOutgoing(notePath: string): { targetPath: string }[];
    /** Notes pointing AT this note. */
    getBacklinks(notePath: string): { sourcePath: string }[];
    /** Tags on this note (with or without leading #). */
    getTags(notePath: string): string[];
    /**
     * Implicit semantic neighbours from ImplicitConnectionService.
     * Returns [] when the service is not initialised.
     */
    getImplicitNeighbors(notePath: string, limit: number): { path: string; similarity: number }[];
}

export interface LookupEdgeAggregatorOptions {
    probe: EdgeProbe;
}

export interface CollectArgs {
    seedPaths: string[];
    /** The note the user is currently in (drives backlink-direction copy). */
    activeNotePath?: string;
    /** Cap per edge-type per seed. Default 3. */
    maxPerType?: number;
    /** Hard cap on returned edges. Default 8. */
    maxTotal?: number;
    /** Exclude these targets (e.g. paths already cited as vault sources). */
    excludePaths?: string[];
    /** Implicit-similarity per-seed limit forwarded to the probe. Default 5. */
    implicitLimit?: number;
}

const TYPE_PRIORITY: Record<InlineEdgeType, number> = {
    'backlink': 1,
    'outgoing-link': 2,
    'implicit-similarity': 3,
    'tag-cooccurrence': 4,
};

export class LookupEdgeAggregator {
    private readonly probe: EdgeProbe;

    constructor(options: LookupEdgeAggregatorOptions) {
        this.probe = options.probe;
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async preserved for future probe-async support
    async collect(args: CollectArgs): Promise<InlineEdgeHit[]> {
        const maxPerType = args.maxPerType ?? 3;
        const maxTotal = args.maxTotal ?? 8;
        const implicitLimit = args.implicitLimit ?? 5;
        const exclude = new Set(args.excludePaths ?? []);
        const seeds = uniq(args.seedPaths.filter(s => s.length > 0));

        // Tag context: union of tags on the active note + first seed used for tag-cooccurrence ranking.
        const activePath = args.activeNotePath ?? seeds[0] ?? '';
        const activeTags = activePath !== '' ? this.probe.getTags(activePath) : [];
        const activeTagsNorm = new Set(activeTags.map(normalizeTag));

        const rawHits: InlineEdgeHit[] = [];
        for (const seed of seeds) {
            // Backlinks.
            for (const b of safe(() => this.probe.getBacklinks(seed)).slice(0, maxPerType)) {
                if (b.sourcePath === seed) continue;
                rawHits.push({
                    targetPath: b.sourcePath,
                    score: 1.0,
                    type: 'backlink',
                    reason: `Links to [[${stripMd(seed)}]]`,
                });
            }
            // Outgoing.
            for (const o of safe(() => this.probe.getOutgoing(seed)).slice(0, maxPerType)) {
                if (o.targetPath === seed) continue;
                rawHits.push({
                    targetPath: o.targetPath,
                    score: 1.0,
                    type: 'outgoing-link',
                    reason: `[[${stripMd(seed)}]] links to this`,
                });
            }
            // Implicit similarity.
            for (const n of safe(() => this.probe.getImplicitNeighbors(seed, implicitLimit)).slice(0, maxPerType)) {
                if (n.path === seed) continue;
                rawHits.push({
                    targetPath: n.path,
                    score: clamp01(n.similarity),
                    type: 'implicit-similarity',
                    reason: `Semantic similarity ${Math.round(n.similarity * 100)}% (no explicit link)`,
                });
            }
            // Tag co-occurrence: for each tag of seed, find notes that share at least one tag with the active note.
            // Cheap form: emit a tag-cooccurrence hit only when the SEED itself shares a tag with the active note.
            // Stronger cross-note discovery requires a tag-index which is out of scope for v1.
            if (seed !== activePath) {
                const seedTags = safe(() => this.probe.getTags(seed)).map(normalizeTag);
                const shared = seedTags.filter(t => activeTagsNorm.has(t));
                if (shared.length > 0) {
                    const union = new Set([...activeTagsNorm, ...seedTags]);
                    const score = shared.length / Math.max(1, union.size);
                    rawHits.push({
                        targetPath: seed,
                        score: clamp01(score),
                        type: 'tag-cooccurrence',
                        reason: `Shares tag(s) ${shared.map(formatTag).join(', ')}`,
                    });
                }
            }
        }

        // Dedup by targetPath: keep the type with highest priority + score, attach the rest as secondaryTypes.
        const byTarget = new Map<string, InlineEdgeHit>();
        for (const hit of rawHits) {
            if (exclude.has(hit.targetPath)) continue;
            const existing = byTarget.get(hit.targetPath);
            if (existing === undefined) {
                byTarget.set(hit.targetPath, hit);
                continue;
            }
            // Compare type priority (lower = stronger). Same priority -> higher score wins.
            const aPrio = TYPE_PRIORITY[existing.type];
            const bPrio = TYPE_PRIORITY[hit.type];
            if (bPrio < aPrio || (bPrio === aPrio && hit.score > existing.score)) {
                hit.secondaryTypes = uniq([...(existing.secondaryTypes ?? []), existing.type]);
                byTarget.set(hit.targetPath, hit);
            } else if (existing.secondaryTypes === undefined || existing.secondaryTypes.includes(hit.type) === false) {
                existing.secondaryTypes = uniq([...(existing.secondaryTypes ?? []), hit.type]);
            }
        }

        // Rank: type priority asc, score desc.
        const ranked = Array.from(byTarget.values()).sort((a, b) => {
            const p = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
            if (p !== 0) return p;
            return b.score - a.score;
        });

        return ranked.slice(0, maxTotal);
    }
}

function uniq<T>(arr: T[]): T[] {
    const out: T[] = [];
    const seen = new Set<T>();
    for (const x of arr) { if (seen.has(x) === false) { seen.add(x); out.push(x); } }
    return out;
}

function safe<T>(fn: () => T[]): T[] {
    try { const r = fn(); return Array.isArray(r) ? r : []; } catch { return []; }
}

function normalizeTag(tag: string): string {
    return tag.startsWith('#') ? tag.slice(1).toLowerCase() : tag.toLowerCase();
}

function formatTag(tag: string): string {
    return `#${tag}`;
}

function stripMd(p: string): string {
    return p.replace(/\.md$/, '');
}

function clamp01(n: number): number {
    if (Number.isFinite(n) === false) return 0;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}
