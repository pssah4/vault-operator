/**
 * FreshnessQueryBuilder -- shapes one search query per note for the
 * FreshnessVerifier web pass.
 *
 * IMP-20-06-01 W2-T3. Constraint C-08 binds the output to 400
 * characters maximum; longer titles get trimmed on word boundaries
 * and entities are dropped first if the budget is tight.
 */

export interface FreshnessQueryInput {
    notePath: string;
    title: string;
    cluster: string;
    topEntities: string[];
}

const QUERY_HARD_CAP = 400;

export class FreshnessQueryBuilder {
    build(input: FreshnessQueryInput): string {
        const titleOrSlug = (input.title || pathToSlug(input.notePath)).trim();
        const cluster = input.cluster.trim();

        const baseParts: string[] = [];
        if (titleOrSlug) baseParts.push(titleOrSlug);
        if (cluster) baseParts.push(cluster);
        let base = baseParts.join(' ').replace(/\s+/g, ' ').trim();

        if (!base) return '';

        if (base.length > QUERY_HARD_CAP) {
            base = trimToWordBoundary(base, QUERY_HARD_CAP);
        }

        let result = base;
        for (const entity of input.topEntities) {
            const cleaned = entity.trim();
            if (!cleaned) continue;
            const next = `${result} ${cleaned}`;
            if (next.length > QUERY_HARD_CAP) break;
            result = next;
        }

        return result.trim();
    }
}

function pathToSlug(notePath: string): string {
    if (!notePath) return '';
    const last = notePath.split('/').pop() ?? '';
    return last.replace(/\.[^.]+$/, '');
}

function trimToWordBoundary(s: string, max: number): string {
    if (s.length <= max) return s;
    const slice = s.slice(0, max);
    const lastSpace = slice.lastIndexOf(' ');
    return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
}
