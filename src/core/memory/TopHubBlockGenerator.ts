/**
 * TopHubBlockGenerator -- selektiver Top-Hub-Block fuer KV-Cache.
 *
 * Backs FEAT-03-26 (KV-Cache-Block) plus ADR-97 (Lifecycle: Regen
 * nur bei Hub-Membership-Change ODER Hub-Note-Re-Summary, max 1x
 * pro 24h).
 *
 * Block-Format: ~3k Token, Top-30 Hubs nach incoming-edges-count,
 * pro Hub: Wikilink + Cluster-Header + 1-Zeiler aus note_summaries.
 *
 * Generator selbst macht keinen LLM-Call: Hub-Liste aus ontology
 * plus Summaries aus note_summaries plus Cluster-Membership.
 *
 * Caching: lastHubsHash plus lastGeneratedAt persistiert (vom Plugin).
 * generateIfNeeded prueft Cooldown plus Hub-Hash, gibt null zurueck
 * wenn kein Re-Generate noetig.
 */

import type { KnowledgeDB } from '../knowledge/KnowledgeDB';
import type { NoteSummaryStore } from '../knowledge/NoteSummaryStore';

export interface HubEntry {
    path: string;
    cluster: string;
    incomingCount: number;
    summary: string | null;
}

export interface TopHubBlockState {
    lastHubsHash: string;
    lastGeneratedAt: string;
}

export interface TopHubBlockResult {
    block: string;
    state: TopHubBlockState;
    hubs: HubEntry[];
}

export interface TopHubBlockGeneratorOptions {
    /** Default 30 Hubs. */
    topN?: number;
    /** Default 24h Cooldown. */
    cooldownMs?: number;
}

export class TopHubBlockGenerator {
    private readonly topN: number;
    private readonly cooldownMs: number;

    constructor(
        private readonly knowledgeDB: KnowledgeDB,
        private readonly noteSummaryStore: NoteSummaryStore,
        options: TopHubBlockGeneratorOptions = {},
    ) {
        this.topN = options.topN ?? 30;
        this.cooldownMs = options.cooldownMs ?? 86_400_000;
    }

    /**
     * Generiert den Block ungeachtet Cooldown. Sammelt Top-N Hub-Notes,
     * gruppiert nach Cluster, rendered Markdown.
     */
    generate(): TopHubBlockResult {
        const hubs = this.collectHubs();
        const block = this.renderBlock(hubs);
        const hash = djb2(hubs.map((h) => h.path).join('|'));
        return {
            block,
            state: {
                lastHubsHash: hash,
                lastGeneratedAt: new Date().toISOString(),
            },
            hubs,
        };
    }

    /**
     * Returns null wenn kein Re-Generate noetig (Hash unveraendert
     * UND Cooldown nicht abgelaufen). Sonst neuer Block.
     */
    generateIfNeeded(prev: TopHubBlockState | null): TopHubBlockResult | null {
        const fresh = this.generate();
        if (!prev) return fresh;
        if (prev.lastHubsHash === fresh.state.lastHubsHash) {
            // Hub-Membership unveraendert -> Cooldown
            const ageMs = Date.now() - new Date(prev.lastGeneratedAt).getTime();
            if (ageMs < this.cooldownMs) return null;
        }
        return fresh;
    }

    private collectHubs(): HubEntry[] {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.knowledgeDB.getDB();
        // Top-N nach incoming-edge-count auf edges-Tabelle
        const result = db.exec(
            `SELECT target_path, COUNT(*) as cnt
             FROM edges
             GROUP BY target_path
             ORDER BY cnt DESC
             LIMIT ?`,
            [this.topN],
        );
        if (!result.length) return [];

        const hubs: HubEntry[] = [];
        for (const row of result[0].values) {
            const path = row[0] as string;
            const incomingCount = row[1] as number;
            const cluster = this.lookupPrimaryCluster(db, path) ?? '';
            const summary = this.noteSummaryStore.get(path)?.summary ?? null;
            hubs.push({ path, cluster, incomingCount, summary });
        }
        return hubs;
    }

    private lookupPrimaryCluster(db: ReturnType<KnowledgeDB['getDB']>, path: string): string | null {
        const r = db.exec(
            `SELECT cluster FROM ontology WHERE entity_path = ? ORDER BY confidence DESC LIMIT 1`,
            [path],
        );
        if (!r.length || !r[0].values.length) return null;
        return r[0].values[0][0] as string;
    }

    private renderBlock(hubs: HubEntry[]): string {
        if (hubs.length === 0) {
            return '## Vault-Karte\n\n(Keine Hub-Notes vorhanden.)\n';
        }
        // Group by cluster
        const byCluster = new Map<string, HubEntry[]>();
        for (const h of hubs) {
            const c = h.cluster || '(unzugeordnet)';
            if (!byCluster.has(c)) byCluster.set(c, []);
            byCluster.get(c)!.push(h);
        }
        const lines: string[] = ['## Vault-Karte (auto-generiert)', ''];
        for (const [cluster, members] of byCluster.entries()) {
            lines.push(`### Cluster: ${cluster} (${members.length} Hubs)`);
            for (const m of members) {
                const summary = m.summary ?? '(keine Summary)';
                const filename = pathToBasename(m.path);
                lines.push(`- [[${filename}]] -- ${summary} (${m.incomingCount} incoming)`);
            }
            lines.push('');
        }
        return lines.join('\n');
    }
}

function pathToBasename(p: string): string {
    const slash = p.lastIndexOf('/');
    const noExt = p.replace(/\.md$/, '');
    return slash >= 0 ? noExt.substring(slash + 1) : noExt;
}

function djb2(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) + s.charCodeAt(i);
        h = h & h;
    }
    return Math.abs(h).toString(16);
}
