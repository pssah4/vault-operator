# ADR-65: Ontologie-Schema und Befuellung

**Date:** 2026-04-08
**Deciders:** Sebastian Hanke

## Context

EPIC-19 (Knowledge Maintenance) benoetigt transitives Retrieval: "Alles zu Legitimitaet" soll auch Notes ueber Menschenwuerde, Tyrannenmord und Gesellschaftsvertrag finden -- ueber verwandte Konzepte hinweg. Heute kann der Agent nur paarweise Aehnlichkeit erkennen (Cosine-Similarity via ImplicitConnections) und direkte Graph-Nachbarn traversieren (GraphStore BFS).

Es fehlt ein strukturelles Verstaendnis davon, wie Themen und Konzepte zusammenhaengen. Die Ontologie soll diese Luecke schliessen -- als neue Tabelle in der bestehenden KnowledgeDB (ADR-50).

**Triggering ASRs:**
- ASR-5 (FEAT-19-02): Ontologie-Schema -- DB-Design fuer transitive Traversals
- ASR-6 (FEAT-19-02): Ontologie-Befuellung -- aus Vault-Daten vs. LLM-unterstuetzt
- Quality Attribute: Performance, Correctness, Cost-Efficiency

## Decision Drivers

- **Transitive Traversals**: Muss Pfade ueber 2-3 Ebenen in <100ms finden (SQL-Query, kein LLM)
- **Automatische Befuellung**: Soll sich aus bestehenden Vault-Daten aufbauen, nicht manuell gepflegt werden
- **Token-Kosten**: Befuellung darf keine permanenten LLM-Kosten erzeugen
- **Konsistenz mit EPIC-15**: Muss in die bestehende KnowledgeDB passen (sql.js WASM, ADR-50)
- **Inkrementelle Updates**: Muss bei jedem Ingest (FEAT-19-00) effizient aktualisierbar sein

## Considered Options

### Option 1: Hierarchische Ontologie (Parent-Child Baum)

Eine Tabelle mit expliziten Parent-Child-Beziehungen die einen Themen-Baum aufspannen.

```sql
CREATE TABLE ontology (
    entity_path TEXT NOT NULL,
    parent_path TEXT,
    relation TEXT NOT NULL,      -- 'is-child-of', 'is-part-of'
    depth INTEGER DEFAULT 0,
    confidence REAL DEFAULT 1.0,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_path, parent_path)
);
```

Traversal via rekursiver CTE: `WITH RECURSIVE tree AS (...)`.

- Pro: Saubere Hierarchie, intuitive Navigation (Thema → Konzepte → Sub-Konzepte)
- Pro: Rekursive CTEs in SQLite performant fuer moderate Tiefe (<10 Ebenen)
- Pro: Passt zum User-Schema: Themen haben Children-Property in den Templates
- Con: Erzwingt Baumstruktur -- Konzepte die zu mehreren Themen gehoeren brauchen Mehrfach-Eintraege
- Con: Schwer automatisch zu befuellen: Wer entscheidet was Parent und was Child ist?
- Con: Fragil bei Umstrukturierung (Parent loeschen = Subtree verwaist)

### Option 2: Cluster-basierte Ontologie (flache Gruppierung)

Jede Entitaet gehoert zu einem oder mehreren Clustern. Kein Baum, sondern Mengen-Zugehoerigkeit.

```sql
CREATE TABLE ontology (
    entity_path TEXT NOT NULL,
    cluster TEXT NOT NULL,
    role TEXT DEFAULT 'member',  -- 'hub', 'member', 'bridge'
    confidence REAL DEFAULT 1.0,
    source TEXT NOT NULL,        -- 'moc', 'implicit', 'ingest'
    updated_at TEXT NOT NULL,
    UNIQUE(entity_path, cluster)
);
CREATE INDEX idx_ontology_cluster ON ontology(cluster);
CREATE INDEX idx_ontology_entity ON ontology(entity_path);
```

Traversal: `SELECT entity_path FROM ontology WHERE cluster IN (SELECT cluster FROM ontology WHERE entity_path = ?)`.

- Pro: Multi-Zugehoerigkeit natuerlich (Kant gehoert zu "Philosophie" UND "Aufklaerung")
- Pro: Einfach automatisch befuellbar: MOC-Properties = Cluster, ImplicitEdges = Cluster-Kandidaten
- Pro: Robust bei Aenderungen (Cluster loeschen betrifft nur Zugehoerigkeit, nicht Struktur)
- Pro: `role` erlaubt Hub-Erkennung (Themen-Notes = 'hub', normale Notes = 'member')
- Con: Keine Hierarchie -- "Philosophie" und "Epistemologie" sind gleichrangig
- Con: Cluster-Namen muessen konsistent sein (Synonyme erkennen)

### Option 3: Hybrid (Cluster + optionale Hierarchie)

Cluster-Tabelle wie Option 2, plus eine separate `cluster_hierarchy` Tabelle.

```sql
CREATE TABLE ontology (
    entity_path TEXT NOT NULL,
    cluster TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    confidence REAL DEFAULT 1.0,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(entity_path, cluster)
);

CREATE TABLE cluster_relations (
    parent_cluster TEXT NOT NULL,
    child_cluster TEXT NOT NULL,
    relation TEXT DEFAULT 'contains',
    UNIQUE(parent_cluster, child_cluster)
);
```

- Pro: Flexibel -- Cluster fuer flache Suche, Hierarchie fuer tiefe Traversals
- Pro: Hierarchie ist optional und kann spaeter ergaenzt werden
- Pro: Cluster-Relations koennen aus Thema-Templates abgeleitet werden (Parents/Children Properties)
- Con: Zwei Tabellen statt einer -- mehr Komplexitaet
- Con: Konsistenz zwischen beiden Tabellen muss gewahrt werden

## Decision

**Vorgeschlagene Option:** Option 2 -- Cluster-basierte Ontologie

**Begruendung:**

1. **Automatische Befuellung ist der Kern**: Die Ontologie muss sich ohne manuellen Aufwand aufbauen. Cluster-Zugehoerigkeit laesst sich direkt aus bestehenden Daten ableiten:
   - MOC-Properties (Themen, Konzepte) → `source: 'moc'`
   - Kategorie-Properties → Cluster nach Typ
   - ImplicitEdges (>0.8 Similarity) → `source: 'implicit'`
   - Ingest-Zuordnungen → `source: 'ingest'`

2. **Multi-Zugehoerigkeit passt zum Zettelkasten**: Ein Zettel ueber "Kants Legitimitaetsbegriff" gehoert zu "Philosophie", "Politische Theorie" und "Kant" gleichzeitig. Eine Baumstruktur erzwingt eine primaere Zuordnung.

3. **Hierarchie ist nicht noetig fuer transitives Retrieval**: `WHERE cluster IN (SELECT cluster FROM ontology WHERE entity_path = ?)` findet alle thematisch verwandten Notes in einem Query. Hierarchie wuerde nur die Navigations-Reihenfolge aendern, nicht die Vollstaendigkeit.

4. **Spaeter erweiterbar**: Wenn Hierarchie noetig wird, kann `cluster_relations` als zweite Tabelle ergaenzt werden (Option 3) ohne die Ontologie-Tabelle zu aendern.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Befuellungs-Strategie

### Bootstrapping (einmalig, kein LLM)

```
1. MOC-Properties auslesen (GraphStore edges WHERE link_type = 'frontmatter')
   → Jede MOC-Property-Zuordnung wird ein Cluster-Eintrag
   → Beispiel: Note X hat "Themen: [[KI]]" → ontology(X, "KI", 'member', 1.0, 'moc')

2. Kategorie-Properties auslesen
   → Notes mit Kategorie "Thema" oder "Konzept" werden Cluster-Hubs
   → ontology(Thema-Note, Thema-Name, 'hub', 1.0, 'moc')

3. ImplicitEdges als Cluster-Hinweis (optional)
   → Paare mit Similarity >0.8 die noch keinem gemeinsamen Cluster angehoeren
   → Agent schlaegt Cluster-Zuordnung vor (beim naechsten Lint)
```

### Inkrementell (bei jedem Ingest, minimal LLM)

```
1. Ingest-Skill ordnet Note Entitaeten zu (FEAT-19-00)
2. Zuordnungen werden als ontology-Eintraege gespeichert (source: 'ingest')
3. Wenn neue Entitaet erstellt wird → neuer Cluster-Hub
```

### Token-Kosten: 0 fuer Bootstrapping, minimal fuer Ingest

## Consequences

### Positive
- Transitives Retrieval funktioniert sofort nach Bootstrapping
- Kein LLM-Call fuer Ontologie-Queries (reine SQL)
- Inkrementelle Updates sind billig (ein INSERT pro Zuordnung)
- Multi-Zugehoerigkeit spiegelt die Realitaet vernetzten Wissens

### Negative
- Cluster-Namen sind String-basiert -- Synonyme muessen erkannt werden
- Keine natuerliche Hierarchie -- "Philosophie enthält Epistemologie" nicht darstellbar (nur "beide sind verwandt")
- Qualitaet haengt von der Qualitaet der MOC-Properties ab

### Risks
- **Cluster-Fragmentierung**: Zu viele kleine Cluster statt weniger grosser Hubs. Mitigation: Lint-Check (FEAT-19-01) erkennt Cluster mit <3 Mitgliedern und schlaegt Merge vor.
- **Synonyme**: "KI", "Kuenstliche Intelligenz", "AI" als separate Cluster. Mitigation: Lint-Check erkennt aehnliche Cluster-Namen und schlaegt Vereinheitlichung vor.

## Implementation Notes

- Neue Tabelle in KnowledgeDB.initSchema() (Schema-Version erhoehen)
- Bootstrapping als einmaliger Schritt in SemanticIndexService (nach Index-Build)
- Query-Funktion in KnowledgeDB: `getClusterMembers(entityPath)` und `getRelatedEntities(entityPath)`
- Integration in SemanticSearchTool: Nach Graph Expansion + Implicit Connections als zusaetzliche Stufe

## Related Decisions

- ADR-50: SQLite Knowledge DB (Basis-Schema)
- ADR-51: 4-Stufen Retrieval Pipeline (Ontologie als Erweiterung)
- FEAT-15-02: Graph Extraction & Expansion (Datenquelle fuer Bootstrapping)
- FEAT-15-03: Implicit Connection Discovery (Datenquelle fuer Cluster-Hinweise)
