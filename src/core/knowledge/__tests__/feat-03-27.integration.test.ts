import { describe, it, expect } from 'vitest';
import initSqlJs from 'sql.js';

import { migrateVectorsToDomainsV12ToV13 } from '../KnowledgeDB';

/**
 * FEAT-03-27 Integration: v12 -> v13 Migration plus Orphan-Check.
 *
 * Belegt die SC-01-Erfolgsbedingung aus PLAN-41 ohne manuelle
 * Live-Verifikation: Auf einer frischen v12-Datenbank mit gemischten
 * Layern (Notes / Sessions / Episodes) liefert VaultHealthService
 * .checkOrphans nach der Migration ausschliesslich den echten
 * Note-Orphan und keinen einzigen Pseudo-Orphan aus den Tracing-
 * Domaenen.
 *
 * Setup-Pfad bewusst minimal: Wir bauen das v12-Schema in-memory
 * (vectors OHNE domain-Spalte, schema_meta.version=12), seeden die
 * Daten roh, rufen anschliessend den exportierten Migrations-Helper
 * und fahren danach den realen VaultHealthService gegen einen
 * dieselbe DB nutzenden KnowledgeDB-Shim.
 */

interface SqlDb {
    run(sql: string, params?: unknown[]): unknown;
    exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
    close(): void;
}

const V12_DDL = `
CREATE TABLE schema_meta (version INTEGER NOT NULL);
INSERT INTO schema_meta VALUES (12);

CREATE TABLE vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB NOT NULL,
    mtime INTEGER NOT NULL,
    enriched INTEGER NOT NULL DEFAULT 0,
    embedding_model TEXT NOT NULL DEFAULT 'unknown',
    UNIQUE(path, chunk_index)
);
CREATE INDEX idx_vectors_path ON vectors(path);

CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    link_type TEXT NOT NULL,
    property_name TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    UNIQUE(source_path, target_path, link_type, property_name)
);
CREATE INDEX idx_edges_source ON edges(source_path);
CREATE INDEX idx_edges_target ON edges(target_path);

CREATE TABLE tags (path TEXT NOT NULL, tag TEXT NOT NULL, UNIQUE(path, tag));
CREATE INDEX idx_tags_tag ON tags(tag);

CREATE TABLE implicit_edges (
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    similarity REAL NOT NULL,
    computed_at TEXT NOT NULL,
    UNIQUE(source_path, target_path)
);
CREATE INDEX idx_implicit_source ON implicit_edges(source_path);
CREATE INDEX idx_implicit_target ON implicit_edges(target_path);

CREATE TABLE dismissed_pairs (
    path_a TEXT NOT NULL,
    path_b TEXT NOT NULL,
    dismissed_at TEXT NOT NULL,
    UNIQUE(path_a, path_b)
);

CREATE TABLE ontology (
    entity_path TEXT NOT NULL,
    cluster TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    confidence REAL NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_path, cluster)
);

CREATE TABLE note_freshness (
    path TEXT PRIMARY KEY,
    freshness_class TEXT NOT NULL DEFAULT 'stable',
    temporal_marker_count INTEGER NOT NULL DEFAULT 0,
    classified_at TEXT NOT NULL
);

CREATE TABLE checkpoint (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

async function makeV12Db(): Promise<SqlDb> {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.exec(V12_DDL);
    return db;
}

function insertVectorV12(db: SqlDb, path: string): void {
    // v12-Insert nutzt explizit KEINE domain-Spalte (existiert noch nicht).
    db.run(
        `INSERT INTO vectors (path, chunk_index, text, vector, mtime, enriched)
         VALUES (?, 0, ?, X'00', 1, 0)`,
        [path, 'text-' + path],
    );
}

function insertEdge(db: SqlDb, source: string, target: string): void {
    db.run(
        `INSERT OR IGNORE INTO edges
            (source_path, target_path, link_type, property_name, confidence)
         VALUES (?, ?, 'body', NULL, 1.0)`,
        [source, target],
    );
}

function getSchemaVersion(db: SqlDb): number {
    const r = db.exec('SELECT version FROM schema_meta');
    return r[0].values[0][0] as number;
}

describe('FEAT-03-27 Integration: v13-Migration + checkOrphans Live-Beleg', () => {
    it('nach v13-Migration meldet checkOrphans nur den echten Note-Orphan, keine session:/episode:-Pfade', async () => {
        const db = await makeV12Db();

        // --- Seed: 10 Notes, 50 Sessions, 100 Episodes (alles v12-roh). ---
        for (let i = 0; i < 10; i++) {
            insertVectorV12(db, `Notes/Note${i}.md`);
        }
        for (let i = 1; i <= 50; i++) {
            const id = `s${String(i).padStart(3, '0')}`;
            insertVectorV12(db, `session:${id}`);
        }
        for (let i = 1; i <= 100; i++) {
            const id = `ep-${String(i).padStart(3, '0')}`;
            insertVectorV12(db, `episode:${id}`);
        }

        // 9 von 10 Notes bekommen eine EINGEHENDE Edge von Hub -> kein Orphan.
        // (Orphan-Predicate prueft auf fehlende eingehende Edges.)
        // Note9 bleibt komplett ohne Edges -> echter Orphan.
        for (let i = 0; i < 9; i++) {
            insertEdge(db, `Notes/Hub.md`, `Notes/Note${i}.md`);
        }

        // --- Sanity vor Migration: v12, keine domain-Spalte. ---
        expect(getSchemaVersion(db)).toBe(12);
        const colsBefore = db.exec("PRAGMA table_info('vectors')");
        const colNamesBefore = colsBefore[0].values.map((row) => row[1] as string);
        expect(colNamesBefore).not.toContain('domain');

        // --- Migration ausloesen (gleiche Helper-Funktion wie im Prod-open-Pfad). ---
        migrateVectorsToDomainsV12ToV13(db as unknown as Parameters<typeof migrateVectorsToDomainsV12ToV13>[0]);

        // Bonus: Schema-Version ist jetzt 13.
        expect(getSchemaVersion(db)).toBe(13);

        // Domain-Verteilung nach Backfill pruefen.
        const dist = db.exec(
            "SELECT domain, COUNT(*) FROM vectors GROUP BY domain ORDER BY domain",
        );
        const distMap = new Map<string, number>();
        for (const row of dist[0].values) {
            distMap.set(row[0] as string, row[1] as number);
        }
        expect(distMap.get('note')).toBe(10);
        expect(distMap.get('session')).toBe(50);
        expect(distMap.get('episode')).toBe(100);

        // --- VaultHealthService gegen die migrierte DB fahren. ---
        const shim = {
            getDB: () => db,
            isOpen: () => true,
            markDirty: () => {},
        };

        const { VaultHealthService } = await import('../VaultHealthService');
        const appShim = {
            vault: {
                getMarkdownFiles: () => [],
                getAbstractFileByPath: () => null,
            },
            metadataCache: { getFileCache: () => null },
        };
        const service = new VaultHealthService(appShim as never, shim as never);

        const findings = await service.runChecks(['orphans']);
        const orphanFindings = findings.filter((f) => f.check === 'orphans');
        const orphanPaths = orphanFindings.flatMap((f) => f.paths);

        // Kern-Assert: ausschliesslich der echte Note-Orphan ist drin.
        expect(orphanPaths).toContain('Notes/Note9.md');

        // Pseudo-Orphans aus den Tracing-Domaenen muessen WEG sein.
        for (const path of orphanPaths) {
            expect(path.startsWith('session:')).toBe(false);
            expect(path.startsWith('episode:')).toBe(false);
        }

        // Keine der 9 verlinkten Notes taucht auf.
        for (let i = 0; i < 9; i++) {
            expect(orphanPaths).not.toContain(`Notes/Note${i}.md`);
        }

        db.close();
    });
});
