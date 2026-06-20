/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
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
    | 'inconsistent_tags'
    | 'category_mismatch'
    | 'god_nodes'
    // BA-25 PLAN-11 Lint-Foundation:
    | 'cluster_freshness'   // FEAT-19-16, ADR-94
    | 'source_concentration'; // FEAT-19-17, ADR-93

export interface HealthFinding {
    check: HealthCheckType;
    severity: 'high' | 'medium' | 'low';
    paths: string[];
    description: string;
    /** Optional: cluster name for ba25-checks. */
    cluster?: string;
    /** Optional: structured payload for UI action buttons (FEAT-19-18, ADR-106). */
    metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// VaultHealthService
// ---------------------------------------------------------------------------

export class VaultHealthService {
    private app: App;
    private knowledgeDB: KnowledgeDB;
    private findings: HealthFinding[] = [];
    private running = false;
    /**
     * FIX-19-01-06: was `private cancelled`. Made public so the modal
     * can defensively reset the flag before driving runRepair. The
     * service's own runChecks resets it at the top, but no fix-method
     * does, so a stuck-true flag from a prior path would silently
     * short-circuit every fix loop on iteration 0.
     */
    cancelled = false;
    /** Incoming-connection threshold above which a note is flagged as god node (FEATURE-2003). */
    godNodeThreshold = 50;
    /** Callback to notify UI of updated findings (e.g. badge refresh). */
    onFindingsUpdated: ((findings: HealthFinding[]) => void) | null = null;

    constructor(app: App, knowledgeDB: KnowledgeDB) {
        this.app = app;
        this.knowledgeDB = knowledgeDB;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Run all health checks (or a subset). Returns findings sorted by severity.
     *
     * FIX-19-01-01: accepts an `options.backlinksProperty` so the
     * `missing_backlinks` check only fires on edges that live under
     * the configured property. Without this filter the SQL flagged
     * every one-sided frontmatter edge regardless of property, which
     * caused the repair to write into the wrong key and the same
     * finding to reappear on the next run.
     */
    async runChecks(
        checks?: HealthCheckType[],
        options?: {
            backlinksProperty?: string;
            /** FIX-19-01-05: drop `with_context` orphan findings entirely. */
            silenceWithContextOrphans?: boolean;
            /** FIX-19-01-05: user-defined path-prefix excludes for the orphan check. */
            orphanExcludePathPrefixes?: string[];
        },
    ): Promise<HealthFinding[]> {
        if (this.running) return this.findings;
        if (!this.knowledgeDB.isOpen()) return [];

        this.running = true;
        this.cancelled = false;
        this.findings = [];

        const backlinksProperty = options?.backlinksProperty;
        const silenceWithContextOrphans = options?.silenceWithContextOrphans ?? false;
        const orphanExcludePathPrefixes = options?.orphanExcludePathPrefixes ?? [];

        try {
            const db = this.getDB();
            const checksToRun = checks ?? [
                'orphans',
                'missing_backlinks',
                'broken_links',
                'weak_clusters',
                'inconsistent_tags',
                'category_mismatch',
                'god_nodes',
                // BA-25 PLAN-11 additive Checks:
                'cluster_freshness',
                'source_concentration',
            ];

            for (const check of checksToRun) {
                if (this.cancelled) break;
                switch (check) {
                    case 'orphans': this.checkOrphans(db, {
                        silenceWithContext: silenceWithContextOrphans,
                        excludePathPrefixes: orphanExcludePathPrefixes,
                    }); break;
                    case 'missing_backlinks': this.checkMissingBacklinks(db, backlinksProperty); break;
                    case 'broken_links': this.checkBrokenLinks(db); break;
                    case 'weak_clusters': this.checkWeakClusters(db); break;
                    case 'inconsistent_tags': this.checkInconsistentTags(db); break;
                    case 'category_mismatch': this.checkCategoryMismatch(db); break;
                    case 'god_nodes': this.checkGodNodes(db); break;
                    case 'cluster_freshness': this.checkClusterFreshness(db); break;
                    case 'source_concentration': this.checkSourceConcentration(db); break;
                }
                // Yield to UI thread between checks
                await new Promise<void>(r => window.setTimeout(r, 0));
            }

            // Filter out dismissed findings
            const dismissed = new Set<string>();
            try {
                const db = this.getDB();
                const rows = db.exec('SELECT check_type, path FROM dismissed_health_findings');
                if (rows.length > 0) {
                    for (const row of rows[0].values) {
                        dismissed.add(`${String(row[0])}:${String(row[1])}`);
                    }
                }
            } catch { /* non-fatal */ }
            if (dismissed.size > 0) {
                this.findings = this.findings.filter(
                    f => !dismissed.has(`${f.check}:${f.paths[0] ?? ''}`),
                );
            }

            // Sort: high -> medium -> low
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

    /** Dismiss a finding so it won't appear in future checks. */
    dismissFinding(checkType: string, path: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.getDB();
        db.run(
            'INSERT OR REPLACE INTO dismissed_health_findings (check_type, path, dismissed_at) VALUES (?, ?, ?)',
            [checkType, path, new Date().toISOString()],
        );
        this.knowledgeDB.markDirty();
        // Remove from cached findings
        this.findings = this.findings.filter(
            f => !(f.check === checkType && f.paths[0] === path),
        );
    }

    /** Clear all dismissed findings. */
    restoreDismissed(): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.getDB();
        db.run('DELETE FROM dismissed_health_findings');
        this.knowledgeDB.markDirty();
    }

    /** Restore a single dismissed finding. */
    restoreDismissedFinding(checkType: string, path: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.getDB();
        db.run('DELETE FROM dismissed_health_findings WHERE check_type = ? AND path = ?', [checkType, path]);
        this.knowledgeDB.markDirty();
    }

    /** Number of dismissed findings. */
    getDismissedCount(): number {
        if (!this.knowledgeDB.isOpen()) return 0;
        const db = this.getDB();
        const result = db.exec('SELECT COUNT(*) FROM dismissed_health_findings');
        return result.length > 0 ? Number(result[0].values[0][0]) : 0;
    }

    /** Get all dismissed findings. */
    getDismissedFindings(): Array<{ checkType: string; path: string; dismissedAt: string }> {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.getDB();
        const result = db.exec('SELECT check_type, path, dismissed_at FROM dismissed_health_findings ORDER BY dismissed_at DESC');
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            checkType: row[0] as string,
            path: row[1] as string,
            dismissedAt: row[2] as string,
        }));
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
                case 'category_mismatch':
                    lines.push(`- Category Mismatch [${severity}]: ${checkFindings.length} notes referenced in wrong property`);
                    break;
                case 'god_nodes':
                    lines.push(`- God Nodes [${severity}]: ${checkFindings.length} notes with too many incoming links`);
                    break;
                // BA-25 PLAN-11 Lint-Foundation
                case 'cluster_freshness':
                    lines.push(`- Cluster Freshness [${severity}]: ${checkFindings.length} cluster(s) ueber Halbwertszeit (Karpathy-Lint)`);
                    for (const cf of checkFindings.slice(0, 3)) {
                        lines.push(`    - ${cf.description}`);
                    }
                    break;
                case 'source_concentration':
                    lines.push(`- Source Concentration [${severity}]: ${checkFindings.length} cluster(s) mit dominanter Source-Domain (Bias-Warnung)`);
                    for (const cf of checkFindings.slice(0, 3)) {
                        lines.push(`    - ${cf.description}`);
                    }
                    break;
            }
        }

        lines.push('');
        lines.push('Use EXISTING entities. In batch: fix autonomously. In interactive: ask first. All reversible via Undo.');
        lines.push('BA-25-Findings (cluster_freshness, source_concentration): nutze Stufe-2-Web-Search via web_search-Tool fuer Update-Recherche oder Anti-Echo-Suche.');

        return lines.join('\n');
    }

    // -----------------------------------------------------------------------
    // Individual checks
    // -----------------------------------------------------------------------

    private checkOrphans(
        db: SqlJsDatabase,
        opts?: { silenceWithContext?: boolean; excludePathPrefixes?: string[] },
    ): void {
        // FIX-19-01-05: build the user-defined excludePathPrefixes
        // into the SQL pre-filter. The hardcoded Templates / Daily
        // Notes / Attachements stay as default excludes; the user
        // setting adds further folder prefixes (e.g. TaskNotes/).
        const userExcludes = opts?.excludePathPrefixes ?? [];
        const userExcludeClauses = userExcludes
            .filter((p) => p.length > 0)
            .map(() => `AND v.path NOT LIKE ?`)
            .join('\n               ');
        const userExcludeParams = userExcludes
            .filter((p) => p.length > 0)
            .map((p) => `${p}%`);

        const result = db.exec(
            `SELECT DISTINCT v.path FROM vectors v
             WHERE v.chunk_index = 0
               AND v.path NOT IN (SELECT DISTINCT target_path FROM edges)
               AND v.path NOT LIKE '%Templates%'
               AND v.path NOT LIKE '%Daily Notes%'
               AND v.path NOT LIKE '%Attachements%'
               ${userExcludeClauses}`,
            userExcludeParams,
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

        // FIX-19-01-04: split the two orphan kinds via metadata so
        // the modal can offer the move-to-folder repair only for
        // truly isolated orphans. with_context notes have outgoing
        // edges and BELONG to a cluster; moving them to Inbox/Orphans/
        // would destroy that context. They surface as findings (so
        // the user can add the missing backlink) but they are not
        // auto-repairable.
        // FIX-19-01-05: respect the silenceWithContextOrphans setting.
        // Users with embedded-Base hub notes get a visual backlink via
        // the Base filter and do not need a Findings entry telling them
        // to add a reciprocal wikilink. Default in the calling settings
        // is silent; users who rely on property-reciprocity flip it off.
        if (withContext.length > 0 && !opts?.silenceWithContext) {
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
                severity: 'medium',
                paths: withContext,
                description: `${withContext.length} note(s) link to existing entities but are not linked back. These notes BELONG to existing clusters -- add backlinks from the target entities, do NOT create new entities.\n\nExamples:\n${details.join('\n')}`,
                metadata: { orphanKind: 'with_context' },
            });
        }

        if (isolated.length > 0) {
            this.findings.push({
                check: 'orphans',
                severity: 'medium',
                paths: isolated,
                description: `${isolated.length} note(s) have no links at all (neither outgoing MOC properties nor incoming links). Use semantic_search to find where they belong before creating new entities.`,
                metadata: { orphanKind: 'isolated' },
            });
        }
    }

    private checkMissingBacklinks(db: SqlJsDatabase, backlinksProperty?: string): void {
        // FIX-19-01-01: scope the missing-backlink predicate to the
        // configured property when available. The reciprocity rule is
        // per-property: an edge under `Notes:` only needs a reverse
        // edge under the same `Notes:` to be considered satisfied;
        // mixing `Notes:` and `Notizen:` between source and target
        // creates a phantom one-sided edge that the old repair path
        // tried to fix by writing yet another property name. Both
        // the outer edge and the searched-for reverse edge are
        // pinned to the configured property.
        const outerProperty = backlinksProperty ? 'AND e1.property_name = ?' : '';
        const innerProperty = backlinksProperty ? 'AND e2.property_name = ?' : '';
        const params: unknown[] = backlinksProperty
            ? [backlinksProperty, backlinksProperty]
            : [];
        const result = db.exec(
            `SELECT e1.source_path, e1.target_path
             FROM edges e1
             WHERE e1.link_type = 'frontmatter'
               ${outerProperty}
               AND NOT EXISTS (
                   SELECT 1 FROM edges e2
                   WHERE e2.source_path = e1.target_path
                     AND e2.target_path = e1.source_path
                     AND e2.link_type = 'frontmatter'
                     ${innerProperty}
               )
             LIMIT 200`,
            params,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        // Group by target
        const missingByTarget = new Map<string, string[]>();
        for (const row of result[0].values) {
            const source = row[0] as string;
            const target = row[1] as string;
            const existing = missingByTarget.get(target) ?? [];
            existing.push(source);
            missingByTarget.set(target, existing);
        }

        // Exclude targets that have a Backlinks-Base file.
        // The Base dynamically shows all notes linking to this entity --
        // if the Base exists, the backlinks are covered regardless of embed status.
        for (const [target] of missingByTarget) {
            const targetBaseName = target.replace(/\.md$/, '').split('/').pop() ?? '';
            const baseFileName = `${targetBaseName}-Backlinks.base`;
            const targetDir = target.includes('/') ? target.split('/').slice(0, -1).join('/') : '';
            const basePath = targetDir ? `${targetDir}/${baseFileName}` : baseFileName;

            if (this.app.vault.getAbstractFileByPath(basePath)) {
                missingByTarget.delete(target);
            }
        }

        // Only structural entities need backlinks (Thema, Konzept, Person, Projekt).
        // Content notes (Quelle, Quellen-Notiz, Notiz, Zettel, etc.) are referenced
        // but don't need to link back -- they are sources, not hubs.
        const structuralCategories = new Set([
            'Thema', 'Konzept', 'Person', 'Projekt',
            'Topic', 'Concept', 'Project',
        ]);
        for (const [target] of missingByTarget) {
            const file = this.app.vault.getAbstractFileByPath(target);
            if (!(file instanceof TFile)) { missingByTarget.delete(target); continue; }
            const cache = this.app.metadataCache.getFileCache(file);
            const category = this.getNoteCategory(cache, 'Kategorie');
            if (category && !structuralCategories.has(category)) {
                missingByTarget.delete(target); // Content note -- no backlink needed
            }
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
        // FIX-19-01-02: the `vectors` table is the embedding index,
        // not the vault filesystem. A note can legitimately exist on
        // disk without ever being embedded (embeddings disabled, the
        // path is excluded from indexing, the note was just created,
        // or it is empty). Using vectors as the "exists" predicate
        // produced false-positive broken-link findings where the
        // modal would render `[[X]]` as a clickable wikilink (Obsidian
        // resolves it because the file exists) while the description
        // claimed the note does not exist.
        //
        // The SQL stays the same (cheap pre-filter to keep the
        // candidate set small), but every candidate is now verified
        // against the vault filesystem and Obsidian's linkpath
        // resolver before it becomes a finding.
        const result = db.exec(
            `SELECT DISTINCT source_path, target_path FROM edges
             WHERE target_path LIKE '%.md'
               AND target_path NOT IN (
                   SELECT DISTINCT path FROM vectors WHERE chunk_index = 0
               )
             LIMIT 200`,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        const pairs = result[0].values.map(row => ({
            source: row[0] as string,
            target: row[1] as string,
        }));

        const byTarget = new Map<string, string[]>();
        for (const p of pairs) {
            // Skip targets that look like external references or non-vault paths.
            if (p.target.includes('://') || p.target.startsWith('http')) continue;

            // Verify against the vault filesystem. A direct path hit
            // confirms the file exists; if the edge stored a wikilink
            // basename rather than the full path, ask Obsidian's
            // linkpath resolver from the source-note's directory.
            if (this.existsInVault(p.target, p.source)) continue;

            const existing = byTarget.get(p.target) ?? [];
            existing.push(p.source);
            byTarget.set(p.target, existing);
        }

        // Cap the surfaced set at 50 to keep the modal readable.
        let surfaced = 0;
        for (const [target, sources] of byTarget) {
            if (surfaced >= 50) break;
            this.findings.push({
                check: 'broken_links',
                severity: 'medium',
                paths: [target, ...sources],
                description: `[[${target}]] is referenced from ${sources.length} note(s) but does not exist in the vault`,
            });
            surfaced++;
        }
    }

    /**
     * FIX-19-01-02: vault-filesystem existence check for the
     * broken-links predicate. Returns true when the target resolves
     * to a real `TFile` either via direct path lookup or via
     * Obsidian's linkpath resolver from the source-note's directory.
     * Both lookups respect Obsidian's case rules and folder layout.
     */
    private existsInVault(targetPath: string, sourcePath: string): boolean {
        const direct = this.app.vault.getAbstractFileByPath(targetPath);
        if (direct instanceof TFile) return true;

        // Try variants the graph extractor might have stored. Some
        // extractors normalize wikilinks to bare basenames before
        // writing to edges; others store full paths.
        const withoutExt = targetPath.replace(/\.md$/, '');
        const direct2 = this.app.vault.getAbstractFileByPath(withoutExt + '.md');
        if (direct2 instanceof TFile) return true;

        // Linkpath resolver respects Obsidian's "shortest path when
        // unambiguous" rule. Resolves `[[Note]]` against any vault
        // file named `Note.md` regardless of folder, with the
        // source-note's directory as the resolution context.
        const resolved = this.app.metadataCache.getFirstLinkpathDest(withoutExt, sourcePath);
        return resolved instanceof TFile;
    }

    /**
     * Check for god nodes: notes with excessive incoming connections.
     * Analogous to "god classes" in software -- overloaded hubs reduce
     * signal-to-noise in the graph. FEATURE-2003, EPIC-020.
     */
    private checkGodNodes(db: SqlJsDatabase): void {
        const threshold = this.godNodeThreshold ?? 50;
        const result = db.exec(
            `SELECT target_path, COUNT(*) AS in_degree
             FROM edges
             GROUP BY target_path
             HAVING COUNT(*) > ?
             ORDER BY in_degree DESC
             LIMIT 20`,
            [threshold],
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        for (const row of result[0].values) {
            const path = row[0] as string;
            const degree = row[1] as number;

            this.findings.push({
                check: 'god_nodes',
                severity: 'medium',
                paths: [path],
                description: `[[${path}]] has ${degree} incoming connections (threshold: ${threshold}) -- consider splitting into sub-topics`,
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

    /**
     * Check for category mismatches: a note with Kategorie "Thema" should only
     * appear in the "Themen" property of other notes, not in "Konzepte" etc.
     */
    private checkCategoryMismatch(db: SqlJsDatabase): void {
        // Map: Kategorie → the property name where it SHOULD be referenced.
        // Only structural entities (Thema, Konzept) have strict mappings.
        // Content notes (Notiz, Zettel, Quelle, Meeting-Notiz, Person, Projekt)
        // can be referenced in any property -- no mismatch possible.
        const strictCategoryToProperty: Record<string, string> = {
            'Thema': 'Themen',
            'Konzept': 'Konzepte',
            'Topic': 'Topics',
            'Concept': 'Concepts',
        };

        // Only check edges where the property_name is a category-specific property
        // (Themen, Konzepte). Other properties (Notizen, Quellen, Personen etc.) are
        // free collections where any note can appear regardless of its category.
        const categoryProperties = new Set(['Themen', 'Konzepte', 'Topics', 'Concepts']);
        const result = db.exec(
            `SELECT DISTINCT target_path, property_name, source_path
             FROM edges
             WHERE link_type = 'frontmatter'
               AND property_name IS NOT NULL
             ORDER BY target_path`,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        // Group by target
        const edgesByTarget = new Map<string, { property: string; source: string }[]>();
        for (const row of result[0].values) {
            const target = row[0] as string;
            const prop = row[1] as string;
            const source = row[2] as string;
            const list = edgesByTarget.get(target) ?? [];
            list.push({ property: prop, source });
            edgesByTarget.set(target, list);
        }

        // Check each target's category against the property it's referenced in
        for (const [targetPath, edges] of edgesByTarget) {
            const file = this.app.vault.getAbstractFileByPath(targetPath);
            if (!(file instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const category = this.getNoteCategory(cache, 'Kategorie');
            if (!category) continue;

            const expectedProperty = strictCategoryToProperty[category];
            if (!expectedProperty) continue; // Not a strict category (Notiz, Person etc.) — skip

            // Find edges where a category-specific property doesn't match.
            // Only Themen/Konzepte properties are checked -- Notizen, Quellen, Personen
            // are free collections where any note can appear regardless of category.
            const mismatched = edges.filter(e =>
                categoryProperties.has(e.property) && e.property !== expectedProperty,
            );
            if (mismatched.length === 0) continue;

            // Group by wrong property
            const byProp = new Map<string, string[]>();
            for (const m of mismatched) {
                const list = byProp.get(m.property) ?? [];
                list.push(m.source);
                byProp.set(m.property, list);
            }

            for (const [wrongProp, sources] of byProp) {
                this.findings.push({
                    check: 'category_mismatch',
                    severity: 'medium',
                    paths: [targetPath, ...sources.slice(0, 5)],
                    description: `[[${targetPath}]] has Kategorie "${category}" but is referenced via "${wrongProp}" (should be "${expectedProperty}") in ${sources.length} note(s)`,
                });
            }
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
    /**
     * Fix missing backlinks using a two-tier strategy:
     *
     * - **Thema/Konzept notes**: Create an embedded Base (.base file) that dynamically
     *   shows all notes linking to this entity. No frontmatter changes needed.
     * - **Other categories (Person, Projekt, etc.)**: Add backlinks to frontmatter,
     *   but only up to MAX_FRONTMATTER_BACKLINKS. If exceeded, create a Base instead.
     *
     * This avoids overloading hub notes with hundreds of frontmatter entries.
     */
    async fixMissingBacklinks(
        backlinksProperty = 'Notizen',
        categoryProperty = 'Kategorie',
    ): Promise<{
        entitiesFixed: number;
        linksAdded: number;
        basesCreated: number;
        // FIX-19-01-06: explicit transparency about why a target produced no
        // mutation. The result screen surfaces these so the user can see WHY
        // "130 entities" produced "0 links" instead of guessing.
        entitiesWithExistingBase: number;
        yamlErrorPaths: string[];
    }> {
        const db = this.getDB();
        let entitiesFixed = 0;
        let linksAdded = 0;
        let basesCreated = 0;
        let entitiesWithExistingBase = 0;
        const yamlErrorPaths: string[] = [];

        const MAX_FRONTMATTER_BACKLINKS = 10;
        const BASE_CATEGORIES = new Set(['Thema', 'Konzept', 'Topic', 'Concept']);

        // Find all one-directional frontmatter edges: A->B exists but B->A does not
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
            return { entitiesFixed: 0, linksAdded: 0, basesCreated: 0, entitiesWithExistingBase: 0, yamlErrorPaths: [] };
        }

        // Group by target entity
        const missingByTarget = new Map<string, { sources: string[]; properties: Set<string> }>();
        for (const row of result[0].values) {
            const target = row[0] as string;
            const source = row[1] as string;
            const prop = row[2] as string;
            const existing = missingByTarget.get(target) ?? { sources: [], properties: new Set() };
            existing.sources.push(source);
            existing.properties.add(prop);
            missingByTarget.set(target, existing);
        }

        for (const [targetPath, { sources, properties }] of missingByTarget) {
            if (this.cancelled) break;

            const file = this.app.vault.getAbstractFileByPath(targetPath);
            if (!(file instanceof TFile)) continue;

            try {
                // Determine category of the target note
                const cache = this.app.metadataCache.getFileCache(file);
                const category = this.getNoteCategory(cache, categoryProperty);
                const useBase = BASE_CATEGORIES.has(category) || sources.length > MAX_FRONTMATTER_BACKLINKS;

                if (useBase) {
                    // Create/update an embedded Base for this entity
                    const created = await this.ensureBacklinksBase(file, properties);
                    if (created) {
                        basesCreated++;
                    } else {
                        // FIX-19-01-06: the Base existed already.
                        // checkMissingBacklinks's base-filter SHOULD drop
                        // this target from future findings; if it does
                        // not, we have a separate detection bug. Track
                        // the count so the result screen is honest about
                        // what really happened.
                        entitiesWithExistingBase++;
                    }
                    // Clear the frontmatter Notizen property -- the Base handles it now
                    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                        const existing = fm[backlinksProperty];
                        if (Array.isArray(existing) && existing.length > 0) {
                            fm[backlinksProperty] = null;
                        }
                    });
                } else {
                    // Add to frontmatter property (small number of backlinks)
                    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                        const existing = fm[backlinksProperty];
                        const currentLinks: string[] = Array.isArray(existing)
                            ? existing.map(String)
                            : (typeof existing === 'string' && existing.trim()) ? [existing] : [];

                        // FIX-19-01-01: strip aliases (`[[Foo|Bar]]`) and
                        // path-segments so a wikilink like `[[Notes/A|A]]`
                        // matches both the bare name `A` and the full
                        // path `Notes/A.md`. The previous dedup only
                        // stripped the brackets, which let the same edge
                        // get written twice as `[[Source]]` next to an
                        // existing `[[Source|Alias]]`.
                        const stripBrackets = (s: string) =>
                            s.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
                        const stripAlias = (s: string) => {
                            const pipe = s.indexOf('|');
                            return pipe >= 0 ? s.slice(0, pipe).trim() : s;
                        };
                        const lastSegment = (s: string) => {
                            const seg = s.split('/').pop() ?? s;
                            return seg.replace(/\.md$/, '');
                        };
                        const normalized = new Set<string>();
                        for (const l of currentLinks) {
                            const bare = stripAlias(stripBrackets(l));
                            normalized.add(bare);
                            normalized.add(lastSegment(bare));
                        }

                        let added = 0;
                        for (const sourcePath of sources) {
                            const sourceNormalized = sourcePath.replace(/\.md$/, '');
                            const sourceLast = lastSegment(sourceNormalized);
                            if (
                                !normalized.has(sourcePath) &&
                                !normalized.has(sourceNormalized) &&
                                !normalized.has(sourceLast)
                            ) {
                                currentLinks.push(`[[${sourceNormalized}]]`);
                                normalized.add(sourceNormalized);
                                normalized.add(sourceLast);
                                added++;
                            }
                        }

                        if (added > 0) {
                            fm[backlinksProperty] = currentLinks;
                            linksAdded += added;
                        }
                    });
                }
                entitiesFixed++;

                if (entitiesFixed % 10 === 0) {
                    await new Promise<void>(r => window.setTimeout(r, 0));
                }
            } catch (e) {
                console.warn(`[VaultHealth] Failed to fix backlinks for ${targetPath}:`, e);
                // FIX-19-01-06: track YAML errors explicitly so the
                // result screen surfaces them. Most "the repair did
                // nothing" reports trace back to user notes with
                // broken frontmatter that processFrontMatter cannot
                // touch.
                const msg = e instanceof Error ? e.message : String(e);
                if (msg.includes('YAMLParseError') || msg.includes('YAML') || msg.includes('Map keys') || msg.includes('seq-item-ind')) {
                    yamlErrorPaths.push(targetPath);
                }
            }
        }

        // FIX-19-01-06: auto-dismiss YAML-broken notes so they do not
        // re-appear as auto-fixable missing_backlinks on every run.
        // The user must fix the YAML manually; until then we should
        // not propose a repair that we know will fail.
        if (yamlErrorPaths.length > 0) {
            let dismissedCount = 0;
            try {
                for (const p of yamlErrorPaths) {
                    db.run(
                        `INSERT OR REPLACE INTO dismissed_health_findings (check_type, path, dismissed_at)
                         VALUES ('missing_backlinks', ?, ?)`,
                        [p, new Date().toISOString()],
                    );
                    dismissedCount++;
                }
                this.knowledgeDB.markDirty();
                console.warn(`[VaultHealth] FIX-19-01-06: auto-dismissed ${dismissedCount} missing_backlinks findings for YAML-broken notes:`, yamlErrorPaths);
            } catch (e) {
                console.warn(`[VaultHealth] FIX-19-01-06: failed to auto-dismiss after ${dismissedCount}/${yamlErrorPaths.length} paths`, e);
            }
        }

        console.warn(`[VaultHealth] fixMissingBacklinks summary: ${entitiesFixed} entities iterated, ${linksAdded} frontmatter links written, ${basesCreated} new bases, ${entitiesWithExistingBase} skipped (Base existed), ${yamlErrorPaths.length} skipped (YAML error)`);
        return { entitiesFixed, linksAdded, basesCreated, entitiesWithExistingBase, yamlErrorPaths };
    }

    /**
     * Clean up invalid backlinks from frontmatter Notizen properties.
     * Removes links that:
     * - Point to non-.md files (PDFs, images, external URLs)
     * - Point to notes that don't exist in the vault
     * - Are duplicates
     *
     * Also clears Notizen property for Thema/Konzept notes (Bases handle those).
     */
    async cleanupInvalidBacklinks(
        backlinksProperty = 'Notizen',
        categoryProperty = 'Kategorie',
    ): Promise<{ notesProcessed: number; linksRemoved: number }> {
        const BASE_CATEGORIES = new Set(['Thema', 'Konzept', 'Topic', 'Concept']);
        let notesProcessed = 0;
        let linksRemoved = 0;

        const allFiles = this.app.vault.getMarkdownFiles();

        for (const file of allFiles) {
            if (this.cancelled) break;

            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) continue;

            const existing = cache.frontmatter[backlinksProperty];
            if (!existing || (Array.isArray(existing) && existing.length === 0)) continue;

            const category = this.getNoteCategory(cache, categoryProperty);

            // For Thema/Konzept: clear the whole property (Base handles it)
            if (BASE_CATEGORIES.has(category)) {
                const items = Array.isArray(existing) ? existing : [existing];
                if (items.length > 0 && items.some((i: unknown) => typeof i === 'string' && i.toString().trim())) {
                    await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                        const old = fm[backlinksProperty];
                        if (Array.isArray(old) && old.length > 0) {
                            linksRemoved += old.length;
                            fm[backlinksProperty] = null;
                        }
                    });
                    notesProcessed++;
                }
                continue;
            }

            // For other categories: remove invalid links, keep valid ones
            const items: string[] = Array.isArray(existing)
                ? existing.map(String)
                : [String(existing)];

            if (items.length === 0) continue;

            const validLinks: string[] = [];
            const seen = new Set<string>();
            let removedFromThis = 0;

            for (const link of items) {
                const cleaned = link.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
                if (!cleaned) { removedFromThis++; continue; }

                // Skip duplicates
                if (seen.has(cleaned)) { removedFromThis++; continue; }
                seen.add(cleaned);

                // Check if the target exists as .md or .canvas in the vault
                const isValidExt = (p: string) => p.endsWith('.md') || p.endsWith('.canvas');
                const targetPath = cleaned.endsWith('.md') ? cleaned : `${cleaned}.md`;
                const resolvedPath = this.app.metadataCache.getFirstLinkpathDest(cleaned, file.path);

                if (resolvedPath && isValidExt(resolvedPath.path)) {
                    validLinks.push(link); // Keep valid .md/.canvas links
                } else if (!resolvedPath) {
                    // Try direct path lookup
                    const directFile = this.app.vault.getAbstractFileByPath(targetPath)
                        ?? this.app.vault.getAbstractFileByPath(`Notes/${targetPath}`)
                        ?? this.app.vault.getAbstractFileByPath(cleaned.endsWith('.canvas') ? cleaned : `${cleaned}.canvas`);
                    if (directFile instanceof TFile && isValidExt(directFile.path)) {
                        validLinks.push(link);
                    } else {
                        removedFromThis++;
                    }
                } else {
                    removedFromThis++; // Non-.md/.canvas target
                }
            }

            if (removedFromThis > 0) {
                await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                    fm[backlinksProperty] = validLinks.length > 0 ? validLinks : null;
                });
                linksRemoved += removedFromThis;
                notesProcessed++;
            }

            if (notesProcessed % 20 === 0) {
                await new Promise<void>(r => window.setTimeout(r, 0));
            }
        }

        console.debug(`[VaultHealth] cleanupInvalidBacklinks: ${notesProcessed} notes, ${linksRemoved} links removed`);
        return { notesProcessed, linksRemoved };
    }

    /**
     * Fix category mismatches: move values from wrong property to correct one.
     * E.g., if "Agentic AI" has Kategorie "Thema" but a note has it in
     * Konzepte: [[Agentic AI]], move it to Themen: [[Agentic AI]].
     */
    async fixCategoryMismatches(): Promise<{ notesFixed: number; valuesMovied: number }> {
        const db = this.getDB();
        let notesFixed = 0;
        let valuesMovied = 0;

        const strictMapping: Record<string, string> = {
            'Thema': 'Themen', 'Konzept': 'Konzepte',
            'Topic': 'Topics', 'Concept': 'Concepts',
        };
        const categoryProperties = new Set(['Themen', 'Konzepte', 'Topics', 'Concepts']);

        const result = db.exec(
            `SELECT DISTINCT target_path, property_name, source_path
             FROM edges
             WHERE link_type = 'frontmatter'
               AND property_name IN ('Themen', 'Konzepte', 'Topics', 'Concepts')
             ORDER BY source_path`,
        );
        if (result.length === 0 || result[0].values.length === 0) {
            return { notesFixed: 0, valuesMovied: 0 };
        }

        // Group by source note -- each source may need multiple property moves
        const fixesBySource = new Map<string, { targetName: string; wrongProp: string; rightProp: string }[]>();

        for (const row of result[0].values) {
            const targetPath = row[0] as string;
            const prop = row[1] as string;
            const sourcePath = row[2] as string;

            const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
            if (!(targetFile instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(targetFile);
            const category = this.getNoteCategory(cache, 'Kategorie');
            if (!category) continue;

            const expectedProp = strictMapping[category];
            if (!expectedProp || !categoryProperties.has(prop)) continue;
            if (prop === expectedProp) continue; // Correct -- no fix needed

            const targetName = targetPath.replace(/\.md$/, '').split('/').pop() ?? '';
            const fixes = fixesBySource.get(sourcePath) ?? [];
            fixes.push({ targetName, wrongProp: prop, rightProp: expectedProp });
            fixesBySource.set(sourcePath, fixes);
        }

        // Apply fixes
        for (const [sourcePath, fixes] of fixesBySource) {
            if (this.cancelled) break;
            const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
            if (!(sourceFile instanceof TFile)) continue;

            try {
                await this.app.fileManager.processFrontMatter(sourceFile, (fm: Record<string, unknown>) => {
                    for (const { targetName, wrongProp, rightProp } of fixes) {
                        const wikilink = `[[${targetName}]]`;

                        // Remove from wrong property
                        const wrongArr = Array.isArray(fm[wrongProp]) ? (fm[wrongProp] as string[]) : [];
                        const filtered = wrongArr.filter(v => {
                            const cleaned = v.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
                            return cleaned !== targetName && !cleaned.endsWith(`/${targetName}`);
                        });
                        fm[wrongProp] = filtered.length > 0 ? filtered : null;

                        // Add to correct property
                        const rightArr = Array.isArray(fm[rightProp]) ? (fm[rightProp] as string[]) : [];
                        const alreadyThere = rightArr.some(v => {
                            const cleaned = v.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
                            return cleaned === targetName || cleaned.endsWith(`/${targetName}`);
                        });
                        if (!alreadyThere) {
                            rightArr.push(wikilink);
                            fm[rightProp] = rightArr;
                        }
                        valuesMovied++;
                    }
                });
                notesFixed++;

                if (notesFixed % 10 === 0) {
                    await new Promise<void>(r => window.setTimeout(r, 0));
                }
            } catch (e) {
                console.warn(`[VaultHealth] Failed to fix category mismatch in ${sourcePath}:`, e);
            }
        }

        console.debug(`[VaultHealth] fixCategoryMismatches: ${notesFixed} notes, ${valuesMovied} values moved`);
        return { notesFixed, valuesMovied: valuesMovied };
    }

    /**
     * IMP-19-01-02: move orphan notes (no incoming, no outgoing edges)
     * into a configured target folder. Folder is created if missing.
     * Idempotent: already-relocated notes are skipped.
     *
     * The caller hands in the list of orphan note paths and the target
     * folder; we keep this method ignorant of the rest of the
     * repair-selection state.
     */
    async moveOrphansToFolder(
        orphanPaths: string[],
        targetFolder: string,
    ): Promise<{ notesMoved: number; notesSkipped: number; notesSkippedWithContext: number }> {
        let notesMoved = 0;
        let notesSkipped = 0;
        let notesSkippedWithContext = 0;

        const folder = targetFolder.replace(/\/+$/, '');
        try {
            const existing = this.app.vault.getAbstractFileByPath(folder);
            if (!existing) {
                await this.app.vault.createFolder(folder);
            }
        } catch (e) {
            console.warn('[VaultHealth] moveOrphansToFolder: createFolder failed', e);
        }

        // FIX-19-01-04: live second-pass guard. Even if the caller
        // accidentally passes a `with_context` orphan path, verify
        // against the DB graph that the note has no outgoing
        // frontmatter edges AND no ontology cluster membership. The
        // user reported notes with `Themen: [[X]]` being moved to
        // Inbox/Orphans/; this guard is the catch-all so no future
        // caller can reproduce that.
        const db = this.getDB();
        const hasContext = (path: string): boolean => {
            try {
                const outgoing = db.exec(
                    `SELECT 1 FROM edges WHERE source_path = ? AND link_type = 'frontmatter' LIMIT 1`,
                    [path],
                );
                if (outgoing.length > 0 && outgoing[0].values.length > 0) return true;
                const clustered = db.exec(
                    `SELECT 1 FROM ontology WHERE entity_path = ? LIMIT 1`,
                    [path],
                );
                if (clustered.length > 0 && clustered[0].values.length > 0) return true;
            } catch {
                // db unavailable; fail open (do not move).
                return true;
            }
            return false;
        };

        for (const path of orphanPaths) {
            if (this.cancelled) break;
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) { notesSkipped++; continue; }

            // Skip notes that already live in the target folder (idempotency).
            if (file.parent && file.parent.path === folder) {
                notesSkipped++;
                continue;
            }

            // Second-pass: confirm the note really has no outgoing context.
            if (hasContext(path)) {
                notesSkippedWithContext++;
                continue;
            }

            const newPath = `${folder}/${file.name}`;
            try {
                await this.app.fileManager.renameFile(file, newPath);
                notesMoved++;
            } catch (e) {
                console.warn(`[VaultHealth] moveOrphansToFolder: rename failed for ${path}`, e);
                notesSkipped++;
            }
            if (notesMoved % 10 === 0) {
                await new Promise<void>(r => window.setTimeout(r, 0));
            }
        }

        console.debug(`[VaultHealth] moveOrphansToFolder: ${notesMoved} moved, ${notesSkipped} skipped, ${notesSkippedWithContext} skipped (has context)`);
        return { notesMoved, notesSkipped, notesSkippedWithContext };
    }

    /**
     * IMP-19-01-02: link semantically similar notes (weak_clusters)
     * by inserting a mutual wikilink under the configured backlinks
     * property in BOTH notes. Mirrors the dedup/alias rules of
     * `fixMissingBacklinks`.
     */
    async linkWeakClusters(
        pairs: Array<{ a: string; b: string }>,
        backlinksProperty: string,
    ): Promise<{ pairsLinked: number; linksAdded: number }> {
        let pairsLinked = 0;
        let linksAdded = 0;

        const stripBrackets = (s: string) =>
            s.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
        const stripAlias = (s: string) => {
            const pipe = s.indexOf('|');
            return pipe >= 0 ? s.slice(0, pipe).trim() : s;
        };
        const lastSegment = (s: string) => {
            const seg = s.split('/').pop() ?? s;
            return seg.replace(/\.md$/, '');
        };

        const insertLink = async (fileA: TFile, otherPath: string): Promise<number> => {
            const otherNormalized = otherPath.replace(/\.md$/, '');
            let added = 0;
            await this.app.fileManager.processFrontMatter(fileA, (fm: Record<string, unknown>) => {
                const existing = fm[backlinksProperty];
                const links: string[] = Array.isArray(existing)
                    ? existing.map(String)
                    : (typeof existing === 'string' && existing.trim()) ? [existing] : [];
                const normalized = new Set<string>();
                for (const l of links) {
                    const bare = stripAlias(stripBrackets(l));
                    normalized.add(bare);
                    normalized.add(lastSegment(bare));
                }
                const otherLast = lastSegment(otherNormalized);
                if (
                    !normalized.has(otherPath) &&
                    !normalized.has(otherNormalized) &&
                    !normalized.has(otherLast)
                ) {
                    links.push(`[[${otherNormalized}]]`);
                    fm[backlinksProperty] = links;
                    added = 1;
                }
            });
            return added;
        };

        for (const { a, b } of pairs) {
            if (this.cancelled) break;
            const fileA = this.app.vault.getAbstractFileByPath(a);
            const fileB = this.app.vault.getAbstractFileByPath(b);
            if (!(fileA instanceof TFile) || !(fileB instanceof TFile)) continue;

            try {
                const addedA = await insertLink(fileA, b);
                const addedB = await insertLink(fileB, a);
                linksAdded += addedA + addedB;
                if (addedA + addedB > 0) pairsLinked++;
            } catch (e) {
                console.warn(`[VaultHealth] linkWeakClusters: pair (${a}, ${b}) failed`, e);
            }
            if (pairsLinked % 10 === 0) {
                await new Promise<void>(r => window.setTimeout(r, 0));
            }
        }

        console.debug(`[VaultHealth] linkWeakClusters: ${pairsLinked} pairs linked, ${linksAdded} links added`);
        return { pairsLinked, linksAdded };
    }

    /** Get the Kategorie value from a note's frontmatter cache. */
    private getNoteCategory(cache: ReturnType<typeof this.app.metadataCache.getFileCache>, categoryProperty: string): string {
        if (!cache?.frontmatter) return '';
        const cat = cache.frontmatter[categoryProperty];
        if (Array.isArray(cat)) return (cat[0] ?? '').toString().trim();
        return (cat ?? '').toString().trim();
    }

    /**
     * Create a .base file for a hub note that dynamically shows all notes
     * linking to it via MOC properties. Embeds the base in the note body
     * if not already embedded.
     */
    private async ensureBacklinksBase(file: TFile, linkProperties: Set<string>): Promise<boolean> {
        const noteName = file.basename;
        const noteDir = file.parent?.path ?? '';
        const basePath = noteDir ? `${noteDir}/${noteName}-Backlinks.base` : `${noteName}-Backlinks.base`;

        // Skip if base already exists
        if (this.app.vault.getAbstractFileByPath(basePath)) {
            // But ensure it's embedded in the note
            await this.ensureBaseEmbed(file, basePath);
            return false;
        }

        // Build filter: match any MOC property that contains this note name
        const filterProps = [...linkProperties];
        const primaryProp = filterProps[0] ?? 'Themen';

        const yaml = [
            'views:',
            '  - type: table',
            `    name: Verlinkte Notizen`,
            '    filters:',
            '      and:',
            `        - ${primaryProp}.containsAny("${noteName}")`,
            '    order:',
            '      - file.name',
            `      - ${primaryProp}`,
            '      - Kategorie',
            '    rowHeight: medium',
            '',
        ].join('\n');

        // Create the base file
        const dir = basePath.includes('/') ? basePath.split('/').slice(0, -1).join('/') : null;
        if (dir) {
            await this.app.vault.createFolder(dir).catch(() => { /* exists */ });
        }
        await this.app.vault.create(basePath, yaml);

        // Embed the base in the note body
        await this.ensureBaseEmbed(file, basePath);

        console.debug(`[VaultHealth] Created backlinks base: ${basePath}`);
        return true;
    }

    /** Ensure a base file is embedded in the note body via ![[...base]]. */
    private async ensureBaseEmbed(file: TFile, basePath: string): Promise<void> {
        const content = await this.app.vault.read(file);
        const embedLink = `![[${basePath.replace(/\.base$/, '').split('/').pop()}-Backlinks.base]]`;
        const baseFileName = basePath.split('/').pop() ?? basePath;
        const embedLinkSimple = `![[${baseFileName}]]`;

        // Check if already embedded (any format)
        if (content.includes(embedLinkSimple) || content.includes(embedLink)) return;

        // Append embed at the end of the note
        const separator = content.endsWith('\n') ? '\n' : '\n\n';
        await this.app.vault.modify(file, content + separator + `## Verlinkte Notizen\n\n${embedLinkSimple}\n`);
    }

    /**
     * Remove edges from/to notes that no longer exist in the vault.
     * This cleans up ghost edges from deleted/trashed notes.
     * Must run inside Obsidian (not external sqlite3) because the DB is in-memory.
     */
    cleanupOrphanedEdges(): { edgesRemoved: number } {
        const db = this.getDB();

        // Get all paths that have vectors (= exist in vault)
        const vectorPaths = new Set<string>();
        const vResult = db.exec('SELECT DISTINCT path FROM vectors WHERE chunk_index = 0');
        if (vResult.length > 0) {
            for (const row of vResult[0].values) {
                vectorPaths.add(row[0] as string);
            }
        }

        // Find and delete edges where source or target is not in vectors
        const edgeResult = db.exec('SELECT DISTINCT source_path FROM edges UNION SELECT DISTINCT target_path FROM edges');
        if (edgeResult.length === 0) return { edgesRemoved: 0 };

        const orphanedPaths = new Set<string>();
        for (const row of edgeResult[0].values) {
            const path = row[0] as string;
            if (!vectorPaths.has(path)) {
                orphanedPaths.add(path);
            }
        }

        let edgesRemoved = 0;
        for (const path of orphanedPaths) {
            const r1 = db.exec('SELECT COUNT(*) FROM edges WHERE source_path = ?', [path]);
            const r2 = db.exec('SELECT COUNT(*) FROM edges WHERE target_path = ?', [path]);
            const count = ((r1[0]?.values[0]?.[0] as number) ?? 0) + ((r2[0]?.values[0]?.[0] as number) ?? 0);
            if (count > 0) {
                db.run('DELETE FROM edges WHERE source_path = ?', [path]);
                db.run('DELETE FROM edges WHERE target_path = ?', [path]);
                edgesRemoved += count;
            }
        }

        if (edgesRemoved > 0) {
            this.knowledgeDB.markDirty();
            console.debug(`[VaultHealth] cleanupOrphanedEdges: ${edgesRemoved} edges from ${orphanedPaths.size} orphaned paths`);
        }

        return { edgesRemoved };
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private getDB(): SqlJsDatabase {
        return this.knowledgeDB.getDB();
    }

    // -----------------------------------------------------------------------
    // BA-25 PLAN-11 Lint-Foundation Checks
    // -----------------------------------------------------------------------

    /**
     * cluster_freshness (FEAT-19-16, ADR-94 + FEAT-19-16 ADR-106 Severity).
     *
     * Pro Cluster: avg-Note-Age aus letzter Modification, Coverage-Drift
     * (Anteil verlinkter Notes ueber Halbwertszeit). Score via
     * FreshnessScorer-Konvention inline berechnet, weil VaultHealthService
     * keine Service-Injection-Pflicht hat (analog zu anderen Checks).
     *
     * Liest cluster_metadata (Halbwertszeit) und ontology (Cluster-Membership).
     * Ohne Cluster-Metadata werden Defaults aus ADR-94 angewendet (180 Tage Tech).
     */
    private checkClusterFreshness(db: SqlJsDatabase): void {
        try {
            // 1. Sammle alle Cluster aus ontology, mit Member-Pfaden.
            const clusterMembersRaw = db.exec(
                `SELECT cluster, entity_path FROM ontology ORDER BY cluster`,
            );
            if (clusterMembersRaw.length === 0) return;

            const membersByCluster = new Map<string, string[]>();
            for (const row of clusterMembersRaw[0].values) {
                const cluster = row[0] as string;
                const path = row[1] as string;
                if (!membersByCluster.has(cluster)) membersByCluster.set(cluster, []);
                membersByCluster.get(cluster)!.push(path);
            }

            // 2. Lookup cluster_metadata (half_life_days). Default 180 Tage Tech-Fallback.
            const metaRaw = db.exec(`SELECT cluster, half_life_days FROM cluster_metadata`);
            const halfLifeByCluster = new Map<string, number>();
            if (metaRaw.length > 0) {
                for (const row of metaRaw[0].values) {
                    halfLifeByCluster.set(row[0] as string, row[1] as number);
                }
            }
            const DEFAULT_HALF_LIFE = 180;

            const now = Date.now();
            const dayMs = 86_400_000;

            for (const [cluster, paths] of membersByCluster.entries()) {
                if (paths.length === 0) continue;

                const halfLife = halfLifeByCluster.get(cluster) ?? DEFAULT_HALF_LIFE;
                if (halfLife <= 0) continue; // Personal-Cluster, statisch

                // mtime aus vectors (latest pro path)
                const placeholders = paths.map(() => '?').join(',');
                const mtimeRaw = db.exec(
                    `SELECT path, MAX(mtime) FROM vectors WHERE path IN (${placeholders}) GROUP BY path`,
                    paths,
                );
                if (mtimeRaw.length === 0 || mtimeRaw[0].values.length === 0) continue;

                let totalAgeDays = 0;
                let staleCount = 0;
                let counted = 0;
                for (const row of mtimeRaw[0].values) {
                    const mtime = row[1] as number;
                    if (!mtime) continue;
                    const ageDays = (now - mtime) / dayMs;
                    totalAgeDays += ageDays;
                    if (ageDays > halfLife) staleCount++;
                    counted++;
                }
                if (counted === 0) continue;

                const avgAge = totalAgeDays / counted;
                const coverageDrift = staleCount / counted;

                // Score (inline, vermeidet Service-Injection in VaultHealthService).
                const w1 = 0.6, w2 = 0.3, w3 = 0.1;
                const ageRatio = Math.min(1, avgAge / halfLife);
                const score = Math.round(100 * (w1 * (1 - ageRatio) + w2 * (1 - coverageDrift) + w3 * 1));

                if (score < 70) {
                    const sev: 'high' | 'medium' | 'low' =
                        score < 30 ? 'high' : score < 50 ? 'medium' : 'low';
                    this.findings.push({
                        check: 'cluster_freshness',
                        severity: sev,
                        paths: [],
                        cluster,
                        description: `Cluster "${cluster}": Freshness-Score ${score}/100 (avg-Age ${Math.round(avgAge)}d, Halbwertszeit ${halfLife}d, ${counted} Notes, ${staleCount} ueber Halbwertszeit)`,
                        metadata: { score, avgAge: Math.round(avgAge), halfLife, totalNotes: counted, staleCount },
                    });
                }
            }
        } catch (err) {
            console.warn('[VaultHealth] cluster_freshness check failed:', err);
        }
    }

    /**
     * source_concentration (FEAT-19-17, ADR-93).
     *
     * Pro Cluster: top-source-domain anteil > 0.7 plus min 5 Notes
     * -> Warning mit Anti-Echo-Vorschlag.
     */
    private checkSourceConcentration(db: SqlJsDatabase): void {
        const THRESHOLD = 0.7;
        const MIN_NOTES = 5;
        try {
            const totalsRaw = db.exec(
                `SELECT cluster, SUM(note_count) FROM cluster_source_stats GROUP BY cluster HAVING SUM(note_count) >= ?`,
                [MIN_NOTES],
            );
            if (totalsRaw.length === 0) return;

            for (const row of totalsRaw[0].values) {
                const cluster = row[0] as string;
                const total = row[1] as number;

                const topRaw = db.exec(
                    `SELECT source_domain, note_count FROM cluster_source_stats WHERE cluster = ? ORDER BY note_count DESC LIMIT 1`,
                    [cluster],
                );
                if (topRaw.length === 0 || topRaw[0].values.length === 0) continue;
                const dominantDomain = topRaw[0].values[0][0] as string;
                const dominantCount = topRaw[0].values[0][1] as number;
                const score = dominantCount / total;
                if (score < THRESHOLD) continue;

                const pct = Math.round(score * 100);
                this.findings.push({
                    check: 'source_concentration',
                    severity: score >= 0.85 ? 'high' : 'medium',
                    paths: [],
                    cluster,
                    description: `Cluster "${cluster}": ${dominantCount} von ${total} Notes (${pct}%) aus ${dominantDomain}. Suche aktiv Gegenpositionen.`,
                    metadata: { dominantDomain, dominantCount, total, concentrationScore: score },
                });
            }
        } catch (err) {
            console.warn('[VaultHealth] source_concentration check failed:', err);
        }
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
