/**
 * ClusterMetadataStore -- Per-Cluster Halbwertszeit + Hot-Cluster + Cooldown.
 *
 * Backs FEAT-15-12 (Halbwertszeit) und ADR-94 (statische Default-Liste,
 * pro Cluster ueberschreibbar) plus ADR-106 (last_hint_at-Cooldown).
 *
 * Reads from and writes to `cluster_metadata` (knowledge.db v10, ADR-92).
 */

import type { KnowledgeDB } from './KnowledgeDB';

export interface ClusterMetadataRecord {
    cluster: string;
    halfLifeDays: number;
    customWeights: Record<string, number> | null;
    lastExternalCheck: string | null;
    lastHintAt: string | null;
    hotCluster: boolean;
}

export type ClusterCategory = 'tech' | 'wissenschaft' | 'politik' | 'geschichte' | 'personal';

/**
 * ADR-94: statische Default-Halbwertszeit pro Cluster-Kategorie.
 * Tech 6 Monate, Wissenschaft 12 Monate, Politik 1 Monat, Geschichte
 * 24 Monate, Personal nie (statisch). User kann pro Cluster
 * ueberschreiben.
 */
export const HALF_LIFE_DEFAULTS: Record<ClusterCategory, number> = {
    tech: 180,
    wissenschaft: 365,
    politik: 30,
    geschichte: 730,
    personal: 0,
};

/** Heuristische Cluster-Name-zu-Kategorie-Erkennung (ADR-94). */
const CATEGORY_KEYWORDS: Record<ClusterCategory, string[]> = {
    tech: ['tech', 'software', 'ai', 'code', 'programming', 'dev', 'engineering'],
    wissenschaft: ['wissenschaft', 'science', 'research', 'forschung', 'paper', 'studie'],
    politik: ['politik', 'politics', 'news', 'wirtschaft', 'economy', 'aktuell'],
    geschichte: ['geschichte', 'history', 'philosophie', 'philosophy', 'antike'],
    personal: ['personal', 'self', 'reflection', 'journal', 'tagebuch', 'persoenlich'],
};

export function detectCategory(clusterName: string): { category: ClusterCategory; halfLifeDays: number } {
    const name = clusterName.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[ClusterCategory, string[]]>) {
        if (keywords.some((kw) => name.includes(kw))) {
            return { category, halfLifeDays: HALF_LIFE_DEFAULTS[category] };
        }
    }
    // Fallback: Tech-Default (180d)
    return { category: 'tech', halfLifeDays: HALF_LIFE_DEFAULTS.tech };
}

export class ClusterMetadataStore {
    constructor(private readonly knowledgeDB: KnowledgeDB) {}

    /**
     * Upsert mit Default-Halbwertszeit aus detectCategory wenn nicht
     * uebergeben. hotCluster default false.
     */
    upsert(cluster: string, halfLifeDays?: number, hotCluster?: boolean): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        const effectiveHalfLife = halfLifeDays ?? detectCategory(cluster).halfLifeDays;
        const effectiveHot = hotCluster ? 1 : 0;
        db.run(
            `INSERT INTO cluster_metadata (cluster, half_life_days, hot_cluster)
             VALUES (?, ?, ?)
             ON CONFLICT(cluster) DO UPDATE SET
                half_life_days = excluded.half_life_days,
                hot_cluster = excluded.hot_cluster`,
            [cluster, effectiveHalfLife, effectiveHot],
        );
        this.knowledgeDB.markDirty();
    }

    get(cluster: string): ClusterMetadataRecord | null {
        if (!this.knowledgeDB.isOpen()) return null;
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT cluster, half_life_days, custom_weights, last_external_check, last_hint_at, hot_cluster
             FROM cluster_metadata WHERE cluster = ?`,
            [cluster],
        );
        if (!result.length || !result[0].values.length) return null;
        return rowToRecord(result[0].values[0]);
    }

    getAll(): ClusterMetadataRecord[] {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT cluster, half_life_days, custom_weights, last_external_check, last_hint_at, hot_cluster
             FROM cluster_metadata ORDER BY cluster`,
        );
        if (!result.length) return [];
        return result[0].values.map(rowToRecord);
    }

    getHotClusters(): ClusterMetadataRecord[] {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT cluster, half_life_days, custom_weights, last_external_check, last_hint_at, hot_cluster
             FROM cluster_metadata WHERE hot_cluster = 1 ORDER BY cluster`,
        );
        if (!result.length) return [];
        return result[0].values.map(rowToRecord);
    }

    setLastExternalCheck(cluster: string, timestamp: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        db.run(
            `UPDATE cluster_metadata SET last_external_check = ? WHERE cluster = ?`,
            [timestamp, cluster],
        );
        this.knowledgeDB.markDirty();
    }

    setLastHintAt(cluster: string, timestamp: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        db.run(
            `UPDATE cluster_metadata SET last_hint_at = ? WHERE cluster = ?`,
            [timestamp, cluster],
        );
        this.knowledgeDB.markDirty();
    }

    setHotCluster(cluster: string, hot: boolean): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        db.run(
            `UPDATE cluster_metadata SET hot_cluster = ? WHERE cluster = ?`,
            [hot ? 1 : 0, cluster],
        );
        this.knowledgeDB.markDirty();
    }
}

function rowToRecord(row: unknown[]): ClusterMetadataRecord {
    let customWeights: Record<string, number> | null = null;
    const rawWeights = row[2] as string | null;
    if (rawWeights) {
        try {
            customWeights = JSON.parse(rawWeights) as Record<string, number>;
        } catch {
            customWeights = null;
        }
    }
    return {
        cluster: row[0] as string,
        halfLifeDays: row[1] as number,
        customWeights,
        lastExternalCheck: (row[3] as string | null) ?? null,
        lastHintAt: (row[4] as string | null) ?? null,
        hotCluster: (row[5] as number) === 1,
    };
}
