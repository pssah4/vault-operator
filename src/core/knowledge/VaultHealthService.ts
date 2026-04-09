/**
 * VaultHealthService -- Background vault health checks via SQL queries.
 *
 * Runs on vault open (0 token cost -- pure DB queries) and caches findings.
 * Provides data for the health badge in the sidebar header and
 * the vault_health_check tool (agent-callable).
 *
 * ADR-067: Lint Architecture
 * FEATURE-1901: Vault Health Check
 */

import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import type { KnowledgeDB, SqlJsDatabase } from './KnowledgeDB';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HealthCheckType =
    | 'orphans'
    | 'missing_backlinks'
    | 'broken_links'
    | 'weak_clusters'
    | 'inconsistent_tags';

export interface HealthFinding {
    check: HealthCheckType;
    severity: 'high' | 'medium' | 'low';
    paths: string[];
    description: string;
}

// ---------------------------------------------------------------------------
// VaultHealthService
// ---------------------------------------------------------------------------

export class VaultHealthService {
    private app: App;
    private knowledgeDB: KnowledgeDB;
    private findings: HealthFinding[] = [];
    private running = false;
    private cancelled = false;
    /** Callback to notify UI of updated findings (e.g. badge refresh). */
    onFindingsUpdated: ((findings: HealthFinding[]) => void) | null = null;

    constructor(app: App, knowledgeDB: KnowledgeDB) {
        this.app = app;
        this.knowledgeDB = knowledgeDB;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** Run all health checks (or a subset). Returns findings sorted by severity. */
    async runChecks(checks?: HealthCheckType[]): Promise<HealthFinding[]> {
        if (this.running) return this.findings;
        if (!this.knowledgeDB.isOpen()) return [];

        this.running = true;
        this.cancelled = false;
        this.findings = [];

        try {
            const db = this.getDB();
            const checksToRun = checks ?? ['orphans', 'missing_backlinks', 'broken_links', 'weak_clusters', 'inconsistent_tags'];

            for (const check of checksToRun) {
                if (this.cancelled) break;
                switch (check) {
                    case 'orphans': this.checkOrphans(db); break;
                    case 'missing_backlinks': this.checkMissingBacklinks(db); break;
                    case 'broken_links': this.checkBrokenLinks(db); break;
                    case 'weak_clusters': this.checkWeakClusters(db); break;
                    case 'inconsistent_tags': this.checkInconsistentTags(db); break;
                }
                // Yield to UI thread between checks
                await new Promise<void>(r => setTimeout(r, 0));
            }

            // Sort: high → medium → low
            const severityOrder = { high: 0, medium: 1, low: 2 };
            this.findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

            if (this.findings.length > 0) {
                console.debug(`[VaultHealth] ${this.findings.length} findings (${this.findings.filter(f => f.severity === 'high').length} high, ${this.findings.filter(f => f.severity === 'medium').length} medium, ${this.findings.filter(f => f.severity === 'low').length} low)`);
            }

            this.onFindingsUpdated?.(this.findings);
            return this.findings;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('database is closed')) {
                console.debug('[VaultHealth] DB closed during check, aborting gracefully');
            } else {
                console.warn('[VaultHealth] Health check failed:', e);
            }
            return [];
        } finally {
            this.running = false;
        }
    }

    /** Get cached findings from the last run. */
    getFindings(): HealthFinding[] {
        return this.findings;
    }

    /** Total number of findings. */
    getFindingCount(): number {
        return this.findings.length;
    }

    /** Highest severity among findings (for badge color). */
    getMaxSeverity(): 'high' | 'medium' | 'low' | null {
        if (this.findings.length === 0) return null;
        if (this.findings.some(f => f.severity === 'high')) return 'high';
        if (this.findings.some(f => f.severity === 'medium')) return 'medium';
        return 'low';
    }

    /** Whether a check is currently running. */
    get isRunning(): boolean {
        return this.running;
    }

    /** Cancel an in-progress check. */
    cancel(): void {
        this.cancelled = true;
    }

    /**
     * Format findings as ultra-compact summary for the agent.
     * MUST stay under 2000 chars to avoid context externalization (ADR-063).
     */
    formatFindings(findings?: HealthFinding[]): string {
        const f = findings ?? this.findings;
        if (f.length === 0) return 'Vault health check: No issues found.';

        const grouped = new Map<HealthCheckType, HealthFinding[]>();
        for (const finding of f) {
            const existing = grouped.get(finding.check) ?? [];
            existing.push(finding);
            grouped.set(finding.check, existing);
        }

        const lines: string[] = [`Vault Health: ${f.length} finding(s)`];

        for (const [check, checkFindings] of grouped) {
            const totalPaths = checkFindings.reduce((sum, cf) => sum + cf.paths.length, 0);
            const severity = checkFindings[0].severity;

            switch (check) {
                case 'orphans':
                    lines.push(`- Orphans [${severity}]: ${totalPaths} notes without incoming links`);
                    break;
                case 'missing_backlinks':
                    lines.push(`- Missing Backlinks [${severity}]: ${checkFindings.length} entities not linking back`);
                    break;
                case 'broken_links':
                    lines.push(`- Broken Links [${severity}]: ${checkFindings.length} targets don't exist`);
                    break;
                case 'weak_clusters':
                    lines.push(`- Weak Clusters [${severity}]: ${checkFindings.length} similar-but-unlinked pairs`);
                    break;
                case 'inconsistent_tags':
                    lines.push(`- Inconsistent Tags [${severity}]: ${checkFindings.length} spelling variants`);
                    break;
            }
        }

        lines.push('');
        lines.push('Use EXISTING entities. In batch: fix autonomously. In interactive: ask first. All reversible via Undo.');

        return lines.join('\n');
    }

    // -----------------------------------------------------------------------
    // Individual checks
    // -----------------------------------------------------------------------

    private checkOrphans(db: SqlJsDatabase): void {
        const result = db.exec(
            `SELECT DISTINCT v.path FROM vectors v
             WHERE v.chunk_index = 0
               AND v.path NOT IN (SELECT DISTINCT target_path FROM edges)
               AND v.path NOT LIKE '%Templates%'
               AND v.path NOT LIKE '%Daily Notes%'
               AND v.path NOT LIKE '%Attachements%'`,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        const paths = result[0].values.map(row => row[0] as string);
        if (paths.length === 0) return;

        // Enrich orphans with their outgoing MOC links (they link TO entities but nobody links back)
        // This helps the agent understand WHERE these notes belong instead of creating new entities
        const outgoingEdges = db.exec(
            `SELECT source_path, target_path, property_name FROM edges
             WHERE link_type = 'frontmatter'
               AND source_path IN (${paths.map(() => '?').join(',')})`,
            paths,
        );

        const orphanContext = new Map<string, string[]>();
        if (outgoingEdges.length > 0) {
            for (const row of outgoingEdges[0].values) {
                const source = row[0] as string;
                const target = row[1] as string;
                const prop = row[2] as string;
                const existing = orphanContext.get(source) ?? [];
                existing.push(`${prop}: [[${target}]]`);
                orphanContext.set(source, existing);
            }
        }

        // Also check ontology clusters for unlinked orphans
        const orphanClusters = db.exec(
            `SELECT entity_path, cluster, role FROM ontology
             WHERE entity_path IN (${paths.map(() => '?').join(',')})`,
            paths,
        );

        const clusterInfo = new Map<string, string[]>();
        if (orphanClusters.length > 0) {
            for (const row of orphanClusters[0].values) {
                const path = row[0] as string;
                const cluster = row[1] as string;
                const existing = clusterInfo.get(path) ?? [];
                existing.push(cluster);
                clusterInfo.set(path, existing);
            }
        }

        // Split into: orphans with context (easier to fix) vs. truly isolated
        const withContext: string[] = [];
        const isolated: string[] = [];
        for (const p of paths) {
            if (orphanContext.has(p) || clusterInfo.has(p)) {
                withContext.push(p);
            } else {
                isolated.push(p);
            }
        }

        if (withContext.length > 0) {
            const details = withContext.slice(0, 20).map(p => {
                const ctx = orphanContext.get(p);
                const clusters = clusterInfo.get(p);
                let detail = p;
                if (ctx) detail += ` (links to: ${ctx.join(', ')})`;
                if (clusters) detail += ` (clusters: ${clusters.map(c => `[[${c}]]`).join(', ')})`;
                return detail;
            });
            this.findings.push({
                check: 'orphans',
                severity: 'high',
                paths: withContext,
                description: `${withContext.length} note(s) link to existing entities but are not linked back. These notes BELONG to existing clusters -- add backlinks from the target entities, do NOT create new entities.\n\nExamples:\n${details.join('\n')}`,
            });
        }

        if (isolated.length > 0) {
            this.findings.push({
                check: 'orphans',
                severity: 'medium',
                paths: isolated,
                description: `${isolated.length} note(s) have no links at all (neither outgoing MOC properties nor incoming links). Use semantic_search to find where they belong before creating new entities.`,
            });
        }
    }

    private checkMissingBacklinks(db: SqlJsDatabase): void {
        const result = db.exec(
            `SELECT e1.source_path, e1.target_path
             FROM edges e1
             WHERE e1.link_type = 'frontmatter'
               AND NOT EXISTS (
                   SELECT 1 FROM edges e2
                   WHERE e2.source_path = e1.target_path
                     AND e2.target_path = e1.source_path
                     AND e2.link_type = 'frontmatter'
               )
             LIMIT 50`,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        // Group by target (the note that is missing the backlink)
        const missingByTarget = new Map<string, string[]>();
        for (const row of result[0].values) {
            const source = row[0] as string;
            const target = row[1] as string;
            const existing = missingByTarget.get(target) ?? [];
            existing.push(source);
            missingByTarget.set(target, existing);
        }

        for (const [target, sources] of missingByTarget) {
            this.findings.push({
                check: 'missing_backlinks',
                severity: 'high',
                paths: [target, ...sources],
                description: `[[${target}]] is linked from ${sources.length} note(s) via MOC properties but does not link back`,
            });
        }
    }

    private checkBrokenLinks(db: SqlJsDatabase): void {
        // Only consider .md targets as broken links (skip attachments, PDFs, images, external refs)
        const result = db.exec(
            `SELECT DISTINCT source_path, target_path FROM edges
             WHERE target_path LIKE '%.md'
               AND target_path NOT IN (
                   SELECT DISTINCT path FROM vectors WHERE chunk_index = 0
               )
             LIMIT 50`,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        const pairs = result[0].values.map(row => ({
            source: row[0] as string,
            target: row[1] as string,
        }));

        // Group by target (the broken link destination)
        const byTarget = new Map<string, string[]>();
        for (const p of pairs) {
            // Skip targets that look like external references or non-vault paths
            if (p.target.includes('://') || p.target.startsWith('http')) continue;
            const existing = byTarget.get(p.target) ?? [];
            existing.push(p.source);
            byTarget.set(p.target, existing);
        }

        for (const [target, sources] of byTarget) {
            this.findings.push({
                check: 'broken_links',
                severity: 'high',
                paths: [target, ...sources],
                description: `[[${target}]] is referenced from ${sources.length} note(s) but does not exist in the vault`,
            });
        }
    }

    private checkWeakClusters(db: SqlJsDatabase): void {
        const result = db.exec(
            `SELECT ie.source_path, ie.target_path, ie.similarity
             FROM implicit_edges ie
             WHERE ie.similarity > 0.8
               AND NOT EXISTS (
                   SELECT 1 FROM edges e
                   WHERE (e.source_path = ie.source_path AND e.target_path = ie.target_path)
                      OR (e.source_path = ie.target_path AND e.target_path = ie.source_path)
               )
             ORDER BY ie.similarity DESC
             LIMIT 20`,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        for (const row of result[0].values) {
            const source = row[0] as string;
            const target = row[1] as string;
            const similarity = (row[2] as number).toFixed(2);

            this.findings.push({
                check: 'weak_clusters',
                severity: 'medium',
                paths: [source, target],
                description: `[[${source}]] and [[${target}]] are semantically similar (${similarity}) but not linked`,
            });
        }
    }

    private checkInconsistentTags(db: SqlJsDatabase): void {
        const result = db.exec(
            `SELECT t1.tag, t2.tag, COUNT(DISTINCT t1.path) + COUNT(DISTINCT t2.path) as total_uses
             FROM tags t1, tags t2
             WHERE t1.tag < t2.tag
               AND LOWER(t1.tag) = LOWER(t2.tag)
             GROUP BY t1.tag, t2.tag
             HAVING total_uses > 1
             LIMIT 20`,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        for (const row of result[0].values) {
            const tag1 = row[0] as string;
            const tag2 = row[1] as string;

            this.findings.push({
                check: 'inconsistent_tags',
                severity: 'low',
                paths: [],
                description: `Tags "#${tag1}" and "#${tag2}" differ only in capitalization -- consider unifying`,
            });
        }
    }

    // -----------------------------------------------------------------------
    // Batch fix operations (run in code, no LLM calls)
    // -----------------------------------------------------------------------

    /**
     * Fix missing backlinks in batch. For each entity that is referenced via MOC
     * properties but doesn't link back, adds the source notes to the entity's
     * "Notizen" (or equivalent) frontmatter property.
     *
     * Runs entirely in code -- 0 LLM tokens. Uses Obsidian's processFrontMatter
     * which is atomic and preserves existing frontmatter.
     *
     * @returns Number of entities updated and total backlinks added
     */
    async fixMissingBacklinks(backlinksProperty = 'Notizen'): Promise<{ entitiesFixed: number; linksAdded: number }> {
        const db = this.getDB();
        let entitiesFixed = 0;
        let linksAdded = 0;

        // Find all one-directional frontmatter edges: A->B exists but B->A does not
        // Only consider .md files (skip attachments, PDFs, images)
        const result = db.exec(
            `SELECT e1.target_path, e1.source_path, e1.property_name
             FROM edges e1
             WHERE e1.link_type = 'frontmatter'
               AND e1.target_path LIKE '%.md'
               AND e1.source_path LIKE '%.md'
               AND NOT EXISTS (
                   SELECT 1 FROM edges e2
                   WHERE e2.source_path = e1.target_path
                     AND e2.target_path = e1.source_path
                     AND e2.link_type = 'frontmatter'
               )
             ORDER BY e1.target_path`,
        );

        if (result.length === 0 || result[0].values.length === 0) {
            return { entitiesFixed: 0, linksAdded: 0 };
        }

        // Group by target entity
        const missingByTarget = new Map<string, string[]>();
        for (const row of result[0].values) {
            const target = row[0] as string;
            const source = row[1] as string;
            const existing = missingByTarget.get(target) ?? [];
            existing.push(source);
            missingByTarget.set(target, existing);
        }

        // Process each entity
        for (const [targetPath, sourcePaths] of missingByTarget) {
            if (this.cancelled) break;

            const file = this.app.vault.getAbstractFileByPath(targetPath);
            if (!(file instanceof TFile)) continue;

            try {
                await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                    // Get existing backlinks array
                    const existing = fm[backlinksProperty];
                    const currentLinks: string[] = Array.isArray(existing)
                        ? existing.map(String)
                        : (typeof existing === 'string' && existing.trim()) ? [existing] : [];

                    // Normalize existing links for comparison
                    const normalized = new Set(currentLinks.map(l =>
                        l.replace(/^\[\[/, '').replace(/\]\]$/, '').trim(),
                    ));

                    // Add missing backlinks
                    let added = 0;
                    for (const sourcePath of sourcePaths) {
                        const sourceNormalized = sourcePath.replace(/\.md$/, '');
                        if (!normalized.has(sourcePath) && !normalized.has(sourceNormalized)) {
                            currentLinks.push(`[[${sourceNormalized}]]`);
                            added++;
                        }
                    }

                    if (added > 0) {
                        fm[backlinksProperty] = currentLinks;
                        linksAdded += added;
                    }
                });
                entitiesFixed++;

                // Yield every 10 entities to prevent UI freeze
                if (entitiesFixed % 10 === 0) {
                    await new Promise<void>(r => setTimeout(r, 0));
                }
            } catch (e) {
                console.warn(`[VaultHealth] Failed to fix backlinks for ${targetPath}:`, e);
            }
        }

        console.debug(`[VaultHealth] fixMissingBacklinks: ${entitiesFixed} entities, ${linksAdded} links added`);
        return { entitiesFixed, linksAdded };
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private getDB(): SqlJsDatabase {
        return this.knowledgeDB.getDB();
    }
}
