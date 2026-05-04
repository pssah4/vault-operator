# ADR-50: SQLite Knowledge DB (sql.js WASM)

**Date:** 2026-03-29 (updated 2026-03-30)
**Deciders:** Sebastian Hanke

## Context

Obsilos semantische Suche nutzt vectra (LocalIndex), das alle Vektoren in einer einzigen JSON-Datei speichert. Bei 5.980 Vektoren mit 4096 Dimensionen erreicht diese 507MB und sprengt V8's String-Limit bei `JSON.stringify()`. Der Index wird bei jedem Neustart komplett neu aufgebaut und scheitert erneut -- eine Endlosschleife.

Zusaetzlich nutzt vectra Node.js `fs` fuer Persistenz, was auf Obsidian Mobile nicht funktioniert. Maschinenlesbare Daten (Sessions, Episodes, Recipes, Patterns) sind als lose Dateien verstreut ohne Cross-Referenz-Moeglichkeit.

**Triggering ASRs:**
- ASR-1 (FEAT-15-00): Cross-Platform Storage -- Desktop + Mobile identisch
- ASR-2 (FEAT-15-00): Crash-Safe Incremental Updates -- keine Korruption nach Crash
- ASR-5 (FEAT-15-00): Extensible DB Schema -- Graph, Sessions, Recipes aufnehmen
- ASR-8 (FEAT-15-05): Lossless Data Migration

## Decision Drivers

- **Skalierung**: 507MB JSON ist nicht tragbar. Loesung muss >100K Vektoren handhaben.
- **Plattform**: Muss in Electron (Desktop) und Mobile WebView (iOS/Android) laufen.
- **Inkrementell**: INSERT/DELETE einzelner Rows statt Full-Rewrite der Datei.
- **Crash-Safety**: Kein korrupter Zustand nach Plugin-Absturz waehrend Update.
- **Review-Bot**: Kein `require()` fuer Native Addons. WASM oder Pure JS.
- **Erweiterbarkeit**: Schema muss Graph-Tabellen, Sessions, Episodes, Recipes aufnehmen.

## Considered Options

### Option 1: sql.js (WASM SQLite) + vault.adapter

SQLite kompiliert zu WebAssembly. Laeuft ueberall wo WASM unterstuetzt wird (Electron, Mobile WebView). Persistenz ueber Obsidians vault.adapter (writeBinary/readBinary) -- plattformuebergreifend.

Vektoren als Float32Array BLOBs (4 Bytes/Float statt ~8 Bytes/Float in JSON). Inkrementelle Updates via SQL INSERT/DELETE. Crash-Safety ueber SQLite Transactions (BEGIN/COMMIT/ROLLBACK).

- Pro: WASM = Electron + Mobile ohne Native Addon
- Pro: Inkrementelle Updates (kein Full-Rewrite)
- Pro: SQLite Transactions = Crash-Safety
- Pro: Erweiterbar (neue Tabellen via ALTER TABLE / Migrations)
- Pro: Bewaeahrt in Obsidian-Oekosystem (andere Plugins nutzen sql.js)
- Pro: Vektoren als BLOBs ~5x kleiner als JSON (98MB vs 507MB)
- Con: ~1.5MB WASM im Plugin-Bundle
- Con: Gesamte DB muss in Memory geladen werden (sql.js Limitierung)
- Con: Persistenz erfordert explizites `db.export()` + `writeBinary()`

### Option 2: Orama 2.x (bereits in package.json)

Pure JavaScript Suchbibliothek mit eingebautem Vektor-Search. Keine neue Dependency noetig.

- Pro: Bereits installiert, 0 neue Dependencies
- Pro: Pure JS, kein WASM noetig
- Pro: Eingebauter Vektor-Search + Full-Text-Search
- Con: Persistenz auch via JSON-Serialisierung -- gleiches Skalierungsproblem wie vectra
- Con: Keine SQL-Queries fuer Cross-Referenzen (Sessions/Episodes)
- Con: Schema nicht erweiterbar fuer Graph-Daten

### Option 3: LanceDB (Columnar Vector DB)

Purpose-built Vector-DB mit Apache Arrow Format. Sehr effizient, designed fuer Millionen Vektoren.

- Pro: Exzellente Performance und Skalierung
- Pro: Columnar Binary Format (100MB statt 507MB)
- Pro: Native ANN-Index (sub-millisecond Search)
- Con: Rust-basiert, braucht Native Binding -- Review-Bot-Risiko
- Con: Electron-Kompatibilitaet nicht garantiert
- Con: Keine SQL-Queries fuer strukturierte Daten (Sessions etc.)
- Con: Overkill fuer ~6K Vektoren

### Option 4: Sharded vectra

vectra behalten, Index in Shards aufteilen (pro Ordner oder pro N Vektoren).

- Pro: Keine neue Dependency
- Pro: Bestehende API bleibt
- Con: Hack, nicht die Ursache behoben (JSON-Serialisierung bleibt)
- Con: Search muss alle Shards durchsuchen und Ergebnisse mergen
- Con: Keine Cross-Referenzen, kein erweitertes Schema
- Con: Kein Mobile-Support (weiterhin fs.promises)

## Decision

**Vorgeschlagene Option:** Option 1 -- sql.js (WASM SQLite) + vault.adapter

**Begruendung:**
sql.js loest alle identifizierten Probleme gleichzeitig: Skalierung (SQLite handles GBs), Plattform (WASM = Desktop + Mobile), Crash-Safety (Transactions), Erweiterbarkeit (SQL Schema), und Review-Bot-Konformitaet (kein Native Addon). Die 1.5MB Bundle-Erhoehung ist akzeptabel. Die In-Memory-Limitierung von sql.js ist fuer <150MB DBs kein Problem.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- 507MB Bug geloest: BLOBs statt JSON, kein `JSON.stringify()` ueber die gesamte DB
- Mobile-ready: vault.adapter funktioniert auf iOS/Android (fuer memory.db)
- Cross-Referenzen moeglich (SQL JOINs)
- Schema versionierbar via Migrations-Tabelle

### Negative
- sql.js laedt gesamte DB in Memory (~150-200MB fuer knowledge.db). Bei sehr grossen Vaults (>10.000 Dateien) koennte das eng werden.
- Persistenz erfordert explizites `db.export()` nach Aenderungen (kein Auto-Flush wie native SQLite)
- vectra-Dependency wird entfernt -- einmalige Neuindexierung noetig
- Bundle-Groesse +1.5MB (WASM)

### Risks
- **Memory-Pressure auf Mobile**: knowledge.db ist nur Desktop (global). memory.db ist klein (<5MB). Kein Risiko.
- **sql.js API-Stabilitaet**: WASM-Build muss bei Obsidian-Updates weiterhin funktionieren. Mitigation: Version pinnen.
- **WASM-Loading in Obsidian**: `fetch()` funktioniert nicht fuer lokale WASM-Dateien in Obsidians app:// Protokoll. Mitigation: WASM via `fs.readFileSync()` laden und als `wasmBinary` uebergeben.

## Implementation Notes

### DB Schema (aktuell: v4)

```sql
-- Schema Version
CREATE TABLE schema_meta (version INTEGER NOT NULL);
INSERT INTO schema_meta VALUES (4);

-- Vektoren (ersetzt vectra)
CREATE TABLE vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB NOT NULL,           -- Float32Array als BLOB
    mtime INTEGER NOT NULL,
    enriched INTEGER NOT NULL DEFAULT 0,  -- v2: Two-Pass Contextual Enrichment (FEAT-15-01)
    UNIQUE(path, chunk_index)
);
CREATE INDEX idx_vectors_path ON vectors(path);

-- Graph: Wikilinks + MOC-Edges
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    link_type TEXT NOT NULL,         -- 'body' | 'frontmatter'
    property_name TEXT,              -- null fuer body, 'Themen'/'Konzepte'/etc. fuer frontmatter
    UNIQUE(source_path, target_path, link_type, property_name)
);
CREATE INDEX idx_edges_source ON edges(source_path);
CREATE INDEX idx_edges_target ON edges(target_path);

-- Graph: Tags
CREATE TABLE tags (
    path TEXT NOT NULL,
    tag TEXT NOT NULL,
    UNIQUE(path, tag)
);
CREATE INDEX idx_tags_tag ON tags(tag);

-- Implizite Verbindungen (vorberechnet)
CREATE TABLE implicit_edges (
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    similarity REAL NOT NULL,
    computed_at TEXT NOT NULL,
    UNIQUE(source_path, target_path)
);

-- Sessions (ersetzt memory/sessions/*.md)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    embedding BLOB,                  -- Float32Array fuer Retrieval
    source TEXT DEFAULT 'human',     -- 'human' | 'mcp' | 'subtask'
    created_at TEXT NOT NULL
);

-- Episodes (ersetzt episodes/*.json)
CREATE TABLE episodes (
    id TEXT PRIMARY KEY,
    user_message TEXT,
    mode TEXT,
    tool_sequence TEXT,              -- JSON array
    tool_ledger TEXT,
    success INTEGER NOT NULL,
    result_summary TEXT,
    created_at TEXT NOT NULL
);

-- Recipes (ersetzt recipes/*.json)
CREATE TABLE recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    trigger_keywords TEXT,           -- pipe-separated
    steps TEXT NOT NULL,             -- JSON array
    source TEXT NOT NULL,            -- 'static' | 'learned'
    schema_version INTEGER NOT NULL,
    success_count INTEGER DEFAULT 0,
    last_used TEXT,
    modes TEXT                       -- JSON array
);

-- Pattern Tracker (ersetzt patterns/*.json)
CREATE TABLE patterns (
    pattern_key TEXT PRIMARY KEY,
    tool_sequence TEXT NOT NULL,     -- JSON array
    episodes TEXT NOT NULL,          -- JSON array
    success_count INTEGER DEFAULT 0
);

-- Checkpoint (ersetzt index-meta.json)
CREATE TABLE checkpoint (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

### Zwei-DB-Strategie (Entscheidung 2026-03-30)

**Kern-Einsicht:** Vektor-Index ist ein abgeleiteter Cache (kann jederzeit aus Vault-Inhalten
neu gebaut werden). Memory-Daten (Sessions, Episodes, Recipes) sind Primaerdaten die
ueber Geraete konsistent sein muessen.

Eine einzige DB fuer beides erzeugt einen Zielkonflikt:
- Index ist gross (~200MB), binaer, pro Gerät verschieden (Embedding-Modell) -> nicht syncen
- Memory ist klein (<5MB), muss auf allen Geraeten verfuegbar sein -> syncen

**Entscheidung: Zwei getrennte Datenbanken.**

| DB | Inhalt | Location | IO | Sync |
|----|--------|----------|----|------|
| `knowledge.db` | Vektoren, Graph, Implicit Edges | `~/.obsidian-agent/knowledge.db` (global) | `fs.promises` | Nein (pro Gerät) |
| `memory.db` | Sessions, Episodes, Recipes, Patterns | `{vault}/.obsidian-agent/memory.db` (local) | `vault.adapter` | Ja (via Vault-Sync) |

**Konsequenzen:**
- Storage-Location ist NICHT user-konfigurierbar -- architektonisch festgelegt
- `semanticStorageLocation` Setting entfaellt
- KnowledgeDB-Klasse unterstuetzt intern weiterhin `global`/`local` (fuer beide DBs)
- knowledge.db: Jedes Geraet baut eigenen Index (Vault-Dateien sind Source of Truth)
- memory.db: Synct natuerlich mit dem Vault (iCloud, Syncthing, etc.)
- FEAT-15-05 muss memory.db als separate Instanz erstellen, nicht in knowledge.db konsolidieren

**Persistenz-Logik:**
- `global` (knowledge.db): `fs.promises.readFile/writeFile` -- nur Desktop
- `local` (memory.db): `vault.adapter.readBinary/writeBinary` -- Desktop + Mobile

**WASM-Loading:**
Obsidians `app://` Protokoll kann keine lokalen WASM-Dateien per `fetch()` laden.
Loesung: WASM-Binary via `fs.readFileSync()` direkt laden und als `wasmBinary` an sql.js uebergeben.

**Commit-Strategie:** Nach jedem Batch von N Inserts (default 20) UND beim Plugin-Unload. Debounced (2s) fuer Event-getriggerte Updates.

### Checkpoint-Modellierung (modifiziert durch Coding Review)

**Bestehender Checkpoint** speichert mtime + chunk-count pro Datei (bis 10.000 Eintraege).
Statt diese in eine separate checkpoint-Tabelle zu packen, nutzen wir die vectors-Tabelle:

- **mtime pro Datei**: Bereits als Spalte in `vectors` vorhanden. Query: `SELECT DISTINCT path, mtime FROM vectors`.
- **Globale Metadaten** (embeddingModel, chunkSize, builtAt, docCount): In `checkpoint` Key-Value-Tabelle.
- **Chunk-Count pro Datei**: `SELECT path, COUNT(*) FROM vectors GROUP BY path`.

Dadurch entfaellt die separate Files-Map im Checkpoint -- die DB IST der Checkpoint.

### Zusaetzlich zu erhalten (aus Coding Review)

- **keywordSearch()**: TF-IDF basierte Keyword-Suche, unabhaengig von vectra. Eigener In-Memory-Index. Bleibt unveraendert.
- **HyDE**: `textForEmbedding` Parameter in search(). Wird 1:1 beibehalten.
- **configure()**: Runtime-Rekonfiguration (excludedFolders, chunkSize). Bleibt.
- **queueAutoUpdate()**: Event-Queue mit Dedup fuer Vault-Events. Unabhaengig von Storage-Backend.

### Cosine-Similarity in JS (nicht in SQL)

```typescript
// Bulk-Load aller Vektoren einmal, dann in-JS Similarity
const rows = db.exec("SELECT id, path, chunk_index, text, vector FROM vectors");
const candidates = rows.map(r => ({
    ...r,
    vec: new Float32Array(r.vector.buffer)
}));

// Cosine Similarity (optimiert fuer Float32Array)
function cosine(a: Float32Array, b: Float32Array): number {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

Begruendung: SQL Custom Functions in sql.js sind langsam (JS->WASM Overhead pro Row). Bulk-Load + JS-Loop ist 10-50x schneller fuer 6K Vektoren.

### Migration

1. Beim ersten Start mit neuem Code: `knowledge.db` existiert nicht
2. Pruefen ob vectra-Dateien existieren (`~/.obsidian-agent/semantic-index/index.json`)
3. Wenn ja: Clean Rebuild (vectra-Daten werden nicht migriert, nur neu indexiert)
4. Sessions/Episodes/Recipes: Bleiben als Dateien bis FEAT-15-05 sie in `memory.db` migriert

## Related Decisions

- ADR-51: Retrieval-Pipeline Architektur
- ADR-52: Reranker Integration

## References

- FEAT-15-00: SQLite Knowledge DB
- FEAT-15-05: Knowledge Data Consolidation
- sql.js: https://sql.js.org/
- BA-09: _devprocess/analysis/BA-09-knowledge-layer.md
