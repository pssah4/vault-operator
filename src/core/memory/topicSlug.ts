/**
 * Topic slug normalization (FEAT-32-03 PR 3.2 / Audit Finding 17).
 *
 * Memory v2 stores facts with a `topics` array. Without normalization the
 * same topic surfaces as `Plan Mode`, `planMode`, `plan-mode`, ` plan-mode `
 * across different extractors -- search misses the obvious matches because
 * the inverted index is case- and whitespace-sensitive.
 *
 * Rule:
 *   - trim
 *   - lowercase
 *   - collapse internal whitespace into single hyphens
 *
 * Punctuation (including existing hyphens) is preserved so a topic that
 * already arrives normalized survives a round-trip. Unicode (German Umlaute)
 * survives because `toLowerCase` handles them.
 *
 * Pair these helpers with the FactStore.insert path; existing rows are not
 * migrated here -- the MemoryV2UpgradeOrchestrator is the right place for a
 * one-time backfill.
 */

export function normalizeTopicSlug(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

export function normalizeTopics(input: readonly string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of input) {
        const slug = normalizeTopicSlug(t);
        if (!slug) continue;
        if (seen.has(slug)) continue;
        seen.add(slug);
        out.push(slug);
    }
    return out;
}
