/**
 * OntologyStore -- Cluster-based knowledge ontology on the Knowledge DB.
 *
 * Stores thematic cluster memberships (which notes belong to which concepts/topics)
 * to enable transitive retrieval: "everything about Legitimacy" also finds notes
 * about Human Dignity, Tyrannicide, Social Contract -- via shared clusters.
 *
 * ADR-065: Cluster-based Ontology (flat, multi-membership)
 * FEATURE-1902: Knowledge Ontologie
 */

import type { KnowledgeDB, SqlJsDatabase } from './KnowledgeDB';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type OntologyRole = 'hub' | 'member' | 'bridge';
export type OntologySource = 'moc' | 'implicit' | 'ingest';

export interface OntologyEntry {
    entityPath: string;
    cluster: string;
    role: OntologyRole;
    confidence: number;
    source: OntologySource;
}

export interface ClusterInfo {
    cluster: string;
    memberCount: number;
    hubs: string[];
}

// ---------------------------------------------------------------------------
// OntologyStore
// ---------------------------------------------------------------------------

export class OntologyStore {
    private knowledgeDB: KnowledgeDB;

    constructor(knowledgeDB: KnowledgeDB) {
        this.knowledgeDB = knowledgeDB;
    }

    // -----------------------------------------------------------------------
    // Read operations
    // -----------------------------------------------------------------------

    /**
     * Find all entities that share a cluster with the given entity (transitive lookup).
     * This is the core query for ontology-based retrieval.
     *
     * Example: getRelatedEntities("Concepts/Legitimacy.md")
     *   → finds all notes in the same clusters as Legitimacy
     */
    getRelatedEntities(entityPath: string, maxResults = 20): OntologyEntry[] {
        const db = this.getDB();
        const result = db.exec(
            `SELECT entity_path, cluster, role, confidence, source
             FROM ontology
             WHERE cluster IN (SELECT cluster FROM ontology WHERE entity_path = ?)
               AND entity_path != ?
             ORDER BY confidence DESC
             LIMIT ?`,
            [entityPath, entityPath, maxResults],
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            entityPath: row[0] as string,
            cluster: row[1] as string,
            role: row[2] as OntologyRole,
            confidence: row[3] as number,
            source: row[4] as OntologySource,
        }));
    }

    /** Get all entities in a specific cluster. */
    getClusterMembers(cluster: string): OntologyEntry[] {
        const db = this.getDB();
        const result = db.exec(
            `SELECT entity_path, cluster, role, confidence, source
             FROM ontology WHERE cluster = ?
             ORDER BY role = 'hub' DESC, confidence DESC`,
            [cluster],
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            entityPath: row[0] as string,
            cluster: row[1] as string,
            role: row[2] as OntologyRole,
            confidence: row[3] as number,
            source: row[4] as OntologySource,
        }));
    }

    /** Get overview of all clusters with member counts and hub paths. */
    getAllClusters(): ClusterInfo[] {
        const db = this.getDB();
        const result = db.exec(
            `SELECT cluster, COUNT(*) as cnt,
                    GROUP_CONCAT(CASE WHEN role = 'hub' THEN entity_path END) as hubs
             FROM ontology
             GROUP BY cluster
             ORDER BY cnt DESC`,
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            cluster: row[0] as string,
            memberCount: row[1] as number,
            hubs: (row[2] as string | null)?.split(',').filter(Boolean) ?? [],
        }));
    }

    /** Get all clusters an entity belongs to. */
    getClustersForEntity(entityPath: string): string[] {
        const db = this.getDB();
        const result = db.exec(
            'SELECT cluster FROM ontology WHERE entity_path = ?',
            [entityPath],
        );
        if (result.length === 0) return [];
        return result[0].values.map(row => row[0] as string);
    }

    /** Total number of ontology entries. */
    getEntryCount(): number {
        const db = this.getDB();
        const result = db.exec('SELECT COUNT(*) FROM ontology');
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
    }

    /** Total number of distinct clusters. */
    getClusterCount(): number {
        const db = this.getDB();
        const result = db.exec('SELECT COUNT(DISTINCT cluster) FROM ontology');
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
    }

    // -----------------------------------------------------------------------
    // Write operations
    // -----------------------------------------------------------------------

    /** Add a single ontology entry. */
    addEntry(entry: OntologyEntry): void {
        const db = this.getDB();
        db.run(
            `INSERT OR REPLACE INTO ontology (entity_path, cluster, role, confidence, source, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [entry.entityPath, entry.cluster, entry.role, entry.confidence, entry.source, new Date().toISOString()],
        );
        this.knowledgeDB.markDirty();
    }

    /** Replace all ontology entries for a given entity path. */
    replaceEntriesForPath(entityPath: string, entries: OntologyEntry[]): void {
        const db = this.getDB();
        db.run('DELETE FROM ontology WHERE entity_path = ?', [entityPath]);

        if (entries.length === 0) return;
        const now = new Date().toISOString();
        const stmt = db.prepare(
            'INSERT OR IGNORE INTO ontology (entity_path, cluster, role, confidence, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        );
        for (const e of entries) {
            stmt.run([e.entityPath, e.cluster, e.role, e.confidence, e.source, now]);
        }
        stmt.free();
        this.knowledgeDB.markDirty();
    }

    /** Remove all ontology entries for a path (when note is deleted). */
    removeEntriesForPath(path: string): void {
        const db = this.getDB();
        db.run('DELETE FROM ontology WHERE entity_path = ?', [path]);
        this.knowledgeDB.markDirty();
    }

    // -----------------------------------------------------------------------
    // Bootstrapping & incremental updates
    // -----------------------------------------------------------------------

    /**
     * Bootstrap the ontology from existing MOC-Property edges in the graph.
     *
     * Reads the edges table (link_type='frontmatter', property_name IN mocPropertyNames)
     * and creates cluster entries. Target notes (the MOC entities) become 'hub',
     * source notes become 'member'.
     *
     * Runs without LLM -- pure DB queries. 0 token cost.
     */
    bootstrapFromEdges(mocPropertyNames: string[], categoryProperty = 'Kategorie'): { clusters: number; entries: number } {
        if (mocPropertyNames.length === 0) return { clusters: 0, entries: 0 };

        const db = this.getDB();

        // Clear existing moc-sourced entries (re-bootstrap is idempotent)
        db.run("DELETE FROM ontology WHERE source = 'moc'");

        // Build placeholders for IN clause
        const placeholders = mocPropertyNames.map(() => '?').join(',');

        // Query all frontmatter edges that use MOC properties
        const result = db.exec(
            `SELECT source_path, target_path, property_name
             FROM edges
             WHERE link_type = 'frontmatter'
               AND property_name IN (${placeholders})`,
            mocPropertyNames,
        );

        if (result.length === 0) {
            this.knowledgeDB.markDirty();
            return { clusters: 0, entries: 0 };
        }

        // Determine which notes are structural entities (Thema, Konzept, Person, Projekt)
        // vs. content notes (Quelle, Notiz, Zettel). Only structural entities become hubs.
        // Content notes that are heavily referenced are still just "members", not hubs.
        const hubCategories = new Set(['Thema', 'Konzept', 'Person', 'Projekt',
            'Topic', 'Concept', 'Person', 'Project']); // DE + EN
        const targetPaths = new Set<string>();
        for (const row of result[0].values) {
            targetPaths.add(row[1] as string);
        }

        // Check which targets have a hub-eligible category via their frontmatter edges
        // We use the tags table as proxy: if a note has tag matching a hub category
        // OR we check edges for a "Kategorie" property pointing to a hub category
        const hubEligible = new Set<string>();
        if (targetPaths.size > 0) {
            const targetList = [...targetPaths];
            const targetPlaceholders = targetList.map(() => '?').join(',');

            // Check category via edges (some vaults store Kategorie as frontmatter array)
            const catResult = db.exec(
                `SELECT DISTINCT source_path, target_path FROM edges
                 WHERE link_type = 'frontmatter'
                   AND property_name = ?
                   AND source_path IN (${targetPlaceholders})`,
                [categoryProperty, ...targetList],
            );

            if (catResult.length > 0) {
                for (const row of catResult[0].values) {
                    const notePath = row[0] as string;
                    const category = (row[1] as string).replace(/\.md$/, '').split('/').pop() ?? '';
                    if (hubCategories.has(category)) {
                        hubEligible.add(notePath);
                    }
                }
            }

            // Fallback: if no category edges found, check if path contains hub-like folder names
            if (hubEligible.size === 0) {
                for (const p of targetPaths) {
                    const folder = p.split('/')[0]?.toLowerCase() ?? '';
                    if (folder.includes('thema') || folder.includes('themen') ||
                        folder.includes('konzept') || folder.includes('concept') ||
                        folder.includes('topic') || folder.includes('person') ||
                        folder.includes('projekt') || folder.includes('project')) {
                        hubEligible.add(p);
                    }
                }
            }
        }

        const now = new Date().toISOString();
        const stmt = db.prepare(
            'INSERT OR IGNORE INTO ontology (entity_path, cluster, role, confidence, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        );

        const clusters = new Set<string>();
        let entries = 0;

        for (const row of result[0].values) {
            const sourcePath = row[0] as string;
            const targetPath = row[1] as string;

            // Only .md files can be cluster members
            if (!sourcePath.endsWith('.md') || !targetPath.endsWith('.md')) continue;

            const cluster = targetPath;
            clusters.add(cluster);

            // Target note role: hub only if it has a hub-eligible category, otherwise member
            const role = hubEligible.has(targetPath) ? 'hub' : 'member';
            stmt.run([targetPath, cluster, role, 1.0, 'moc', now]);
            entries++;

            // Source note is always a member of this cluster
            stmt.run([sourcePath, cluster, 'member', 1.0, 'moc', now]);
            entries++;
        }

        stmt.free();
        this.knowledgeDB.markDirty();

        const hubCount = hubEligible.size;
        console.debug(`[OntologyStore] Bootstrap complete: ${clusters.size} clusters (${hubCount} hubs), ${entries} entries`);
        return { clusters: clusters.size, entries };
    }

    /**
     * Incremental update: rebuild ontology entries for a single note path.
     * Called when a note is modified or created.
     */
    updateForPath(path: string, mocPropertyNames: string[]): void {
        if (mocPropertyNames.length === 0) return;

        const db = this.getDB();

        // Remove old moc-sourced entries for this path
        db.run("DELETE FROM ontology WHERE entity_path = ? AND source = 'moc'", [path]);

        // Build placeholders for IN clause
        const placeholders = mocPropertyNames.map(() => '?').join(',');

        // Find outgoing MOC edges from this path
        const outgoing = db.exec(
            `SELECT target_path FROM edges
             WHERE source_path = ?
               AND link_type = 'frontmatter'
               AND property_name IN (${placeholders})`,
            [path, ...mocPropertyNames],
        );

        // Find incoming MOC edges to this path (this path is a cluster hub)
        const incoming = db.exec(
            `SELECT source_path FROM edges
             WHERE target_path = ?
               AND link_type = 'frontmatter'
               AND property_name IN (${placeholders})`,
            [path, ...mocPropertyNames],
        );

        const now = new Date().toISOString();
        const stmt = db.prepare(
            'INSERT OR IGNORE INTO ontology (entity_path, cluster, role, confidence, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        );

        // This note is a member of each target cluster
        if (outgoing.length > 0) {
            for (const row of outgoing[0].values) {
                const targetPath = row[0] as string;
                stmt.run([path, targetPath, 'member', 1.0, 'moc', now]);
            }
        }

        // This note is a hub for its own cluster (if it has incoming edges)
        if (incoming.length > 0 && incoming[0].values.length > 0) {
            stmt.run([path, path, 'hub', 1.0, 'moc', now]);
            // Also ensure all incoming sources are members
            for (const row of incoming[0].values) {
                const sourcePath = row[0] as string;
                stmt.run([sourcePath, path, 'member', 1.0, 'moc', now]);
            }
        }

        stmt.free();
        this.knowledgeDB.markDirty();
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private getDB(): SqlJsDatabase {
        return this.knowledgeDB.getDB();
    }
}
