/**
 * NoteSelector -- picks candidate notes per cluster for the FreshnessVerifier.
 *
 * IMP-20-06-01 Wave 2 task W2-T2. Reads `note_freshness` (freshness_class
 * + last_checked_at), `ontology` (entity_path -> cluster), and
 * `dismissed_freshness` (hint_type='verdict' as user override).
 *
 * Selection rules:
 *   - Volatile before evolving before stable.
 *   - Cooldown per class: volatile re-checks weekly, evolving monthly,
 *     stable quarterly. last_checked_at NULL counts as "due".
 *   - dismissed_freshness rows with hint_type='verdict' suppress the
 *     note until the user re-arms it.
 *   - excludePaths (settings) drop notes by literal path prefix.
 *   - Top-N cap per cluster (default 5).
 *
 * The selector is provider-agnostic and takes any sql.js-shaped db.
 */

interface SqlDb {
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
}

export interface NoteSelectorSettings {
    topN: number;
    excludePaths: string[];
    volatileRecheckDays: number;
    evolvingRecheckDays: number;
    stableRecheckDays: number;
}

export interface NoteCandidate {
    path: string;
    freshnessClass: 'volatile' | 'evolving' | 'stable';
    lastCheckedAt: string | null;
}

const FRESHNESS_PRIORITY: Record<NoteCandidate['freshnessClass'], number> = {
    volatile: 0,
    evolving: 1,
    stable: 2,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class NoteSelector {
    constructor(
        private readonly db: SqlDb,
        private readonly settings: NoteSelectorSettings,
    ) {}

    pickCandidates(cluster: string, now: Date): NoteCandidate[] {
        const rows = this.db.exec(
            `SELECT n.path, n.freshness_class, n.last_checked_at
             FROM note_freshness n
             INNER JOIN ontology o ON o.entity_path = n.path
             WHERE o.cluster = ?
               AND NOT EXISTS (
                   SELECT 1 FROM dismissed_freshness d
                   WHERE d.note_path = n.path AND d.hint_type = 'verdict'
               )`,
            [cluster],
        );

        if (!rows.length || !rows[0].values.length) return [];

        const candidates: NoteCandidate[] = [];
        for (const row of rows[0].values) {
            const path = String(row[0]);
            const freshnessClass = String(row[1]) as NoteCandidate['freshnessClass'];
            const lastCheckedAt = (row[2] as string | null) ?? null;

            if (this.isExcludedPath(path)) continue;
            if (!this.isDue(freshnessClass, lastCheckedAt, now)) continue;

            candidates.push({ path, freshnessClass, lastCheckedAt });
        }

        candidates.sort((a, b) => {
            const pa = FRESHNESS_PRIORITY[a.freshnessClass] ?? 99;
            const pb = FRESHNESS_PRIORITY[b.freshnessClass] ?? 99;
            if (pa !== pb) return pa - pb;
            return a.path.localeCompare(b.path);
        });

        return candidates.slice(0, this.settings.topN);
    }

    private isExcludedPath(path: string): boolean {
        return this.settings.excludePaths.some((prefix) => path.startsWith(prefix));
    }

    private isDue(
        freshnessClass: NoteCandidate['freshnessClass'],
        lastCheckedAt: string | null,
        now: Date,
    ): boolean {
        if (!lastCheckedAt) return true;
        const recheckDays = this.recheckDaysFor(freshnessClass);
        const last = new Date(lastCheckedAt).getTime();
        const ageDays = (now.getTime() - last) / MS_PER_DAY;
        return ageDays >= recheckDays;
    }

    private recheckDaysFor(freshnessClass: NoteCandidate['freshnessClass']): number {
        switch (freshnessClass) {
            case 'volatile':
                return this.settings.volatileRecheckDays;
            case 'evolving':
                return this.settings.evolvingRecheckDays;
            case 'stable':
                return this.settings.stableRecheckDays;
            default:
                return this.settings.stableRecheckDays;
        }
    }
}
