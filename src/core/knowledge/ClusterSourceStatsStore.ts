/**
 * ClusterSourceStatsStore -- Per-Cluster Source-Domain-Statistik.
 *
 * Backs FEAT-15-11 plus ADR-93 (Source-Identitaet Domain-only fuer MVP).
 * Liefert Concentration- und Diversity-Score-Daten fuer Bias-Awareness
 * (FEAT-19-14 plus FEAT-19-17).
 *
 * Reads from and writes to `cluster_source_stats` (knowledge.db v10,
 * ADR-92).
 */

import type { KnowledgeDB } from './KnowledgeDB';

export interface SourceStatRecord {
    cluster: string;
    sourceDomain: string;
    noteCount: number;
    firstSeenAt: string;
    lastSeenAt: string;
}

export interface ClusterConcentration {
    cluster: string;
    dominantDomain: string;
    concentrationScore: number;
    totalNotes: number;
}

/**
 * Domain aus URL extrahieren, normalisiert (lowercase, strip www.,
 * strip protocol, strip trailing slash). Edge-Cases: leere URLs,
 * Pfade ohne Protokoll, file://-URIs.
 */
export function normalizeDomain(url: string): string {
    if (!url) return '';
    let s = url.trim().toLowerCase();
    // Strip protocol
    s = s.replace(/^[a-z]+:\/\//, '');
    // Strip www.
    s = s.replace(/^www\./, '');
    // Take only host part (everything before first /)
    const slashIdx = s.indexOf('/');
    if (slashIdx >= 0) s = s.substring(0, slashIdx);
    // Strip trailing dot or whitespace
    s = s.replace(/\.+$/, '').trim();
    return s;
}

export class ClusterSourceStatsStore {
    constructor(private readonly knowledgeDB: KnowledgeDB) {}

    /** Increment count fuer (cluster, sourceDomain). first_seen_at bleibt erhalten, last_seen_at aktualisiert. */
    incrementCount(cluster: string, sourceDomain: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO cluster_source_stats (cluster, source_domain, note_count, first_seen_at, last_seen_at)
             VALUES (?, ?, 1, ?, ?)
             ON CONFLICT(cluster, source_domain) DO UPDATE SET
                note_count = note_count + 1,
                last_seen_at = excluded.last_seen_at`,
            [cluster, sourceDomain, now, now],
        );
        this.knowledgeDB.markDirty();
    }

    getStatsForCluster(cluster: string): SourceStatRecord[] {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT cluster, source_domain, note_count, first_seen_at, last_seen_at
             FROM cluster_source_stats
             WHERE cluster = ?
             ORDER BY note_count DESC`,
            [cluster],
        );
        if (!result.length) return [];
        return result[0].values.map((row) => ({
            cluster: row[0] as string,
            sourceDomain: row[1] as string,
            noteCount: row[2] as number,
            firstSeenAt: row[3] as string,
            lastSeenAt: row[4] as string,
        }));
    }

    /** max(count) / sum(count). Liegt zwischen 1/N (perfekt diversifiziert) und 1 (single-source). */
    concentrationScore(cluster: string): number {
        const stats = this.getStatsForCluster(cluster);
        if (stats.length === 0) return 0;
        const total = stats.reduce((sum, s) => sum + s.noteCount, 0);
        if (total === 0) return 0;
        const max = Math.max(...stats.map((s) => s.noteCount));
        return max / total;
    }

    /** Shannon-Entropy ueber Source-Domain-Verteilung. Hoeher = diverser. */
    diversityScore(cluster: string): number {
        const stats = this.getStatsForCluster(cluster);
        if (stats.length === 0) return 0;
        const total = stats.reduce((sum, s) => sum + s.noteCount, 0);
        if (total === 0) return 0;
        let entropy = 0;
        for (const s of stats) {
            const p = s.noteCount / total;
            if (p > 0) entropy -= p * Math.log2(p);
        }
        return entropy;
    }

    /**
     * Cluster mit Concentration-Score > threshold UND mindestens minNotes
     * Notes. Default-Schwellwerte aus ADR-93 (0.7 plus 5 Notes).
     */
    getConcentratedClusters(threshold = 0.7, minNotes = 5): ClusterConcentration[] {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.knowledgeDB.getDB();
        // Aggregate sums per cluster, plus per-cluster top domain
        const result = db.exec(
            `SELECT cluster, SUM(note_count) AS total_notes
             FROM cluster_source_stats
             GROUP BY cluster
             HAVING total_notes >= ?`,
            [minNotes],
        );
        if (!result.length) return [];
        const out: ClusterConcentration[] = [];
        for (const row of result[0].values) {
            const cluster = row[0] as string;
            const total = row[1] as number;
            const stats = this.getStatsForCluster(cluster);
            if (stats.length === 0) continue;
            const top = stats[0]; // sorted by note_count DESC in getStatsForCluster
            const score = top.noteCount / total;
            if (score >= threshold) {
                out.push({
                    cluster,
                    dominantDomain: top.sourceDomain,
                    concentrationScore: score,
                    totalNotes: total,
                });
            }
        }
        return out;
    }
}
