# Feature: Graph Data Extraction & Expansion

> **Feature ID**: FEAT-15-02
> **Epic**: EPIC-15 - Unified Knowledge Layer
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Obsilos existierender Graph (Wikilinks, Tags, MOC-Properties) wird in die Knowledge DB extrahiert und fuer die Suche nutzbar gemacht. Bei jedem Suchtreffer folgt das System automatisch 1-3 Hops ueber Wikilinks und MOC-Verbindungen (Themen, Konzepte, Personen, Notizen, Meeting-Notes, Quellen) um verwandte Notes als erweiterten Kontext einzubeziehen. Die Ergebnisse werden mit Verbindungskontext angereichert ("via [[Kuenstliche Intelligenz]] (Themen)").

Ersetzt das vorherige Regex-basierte Wikilink-Parsing in SemanticSearchTool durch systematische DB-Queries auf die edges-Tabelle (BFS).

## Benefits Hypothesis

**Wir glauben dass** die Nutzung des Obsidian-Graphs fuer Retrieval
**Folgende messbare Outcomes liefert:**
- Suchergebnisse enthalten strukturell verbundene Notes (1-3 Hops)
- Der User versteht warum ein Ergebnis relevant ist (Verbindungskontext)
- Antworten beruecksichtigen die MOC-Vernetzung des Vaults

**Wir wissen dass wir erfolgreich sind wenn:**
- Eine Suche nach "Agent-Architekturen" auch verlinkte Notes zu "EAM" und "Infrastructure Map" findet
- Der Verbindungspfad im Ergebnis sichtbar ist

## User Stories

### Story 1: Vernetzte Suche
**Als** Knowledge Worker
**moechte ich** dass die Suche meinen Wikilinks und MOC-Verbindungen folgt
**um** alle zusammenhaengenden Informationen zu einem Thema zu finden, nicht nur einzelne Treffer

### Story 2: Verbindungskontext
**Als** Knowledge Worker
**moechte ich** sehen ueber welchen Pfad ein Ergebnis gefunden wurde
**um** die Relevanz besser einschaetzen zu koennen

### Story 3: MOC-bewusste Suche
**Als** Knowledge Worker mit MOC-Frontmatter (Themen, Konzepte, Personen)
**moechte ich** dass meine Frontmatter-Vernetzung fuer die Suche genutzt wird
**um** thematische Cluster automatisch zu erfassen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement | Verified |
|----|-----------|--------|-------------|----------|
| SC-01 | Suchergebnisse enthalten strukturell verbundene Notes | Mindestens 2 zusaetzliche Notes via Graph | Vergleich: Suche mit/ohne Graph-Expansion | Ja -- GraphStore.getNeighbors() liefert BFS-Ergebnisse |
| SC-02 | Verbindungspfad ist im Ergebnis sichtbar | Jedes Graph-erweiterte Ergebnis zeigt den Pfad | Pruefung der Ergebnis-Metadaten | Ja -- "via [[Note]] (PropertyName)" |
| SC-03 | MOC-Properties werden fuer Expansion genutzt | Themen/Konzepte/Personen als Verbindungskanten | Test: Note mit Thema X findet andere Notes mit Thema X | Ja -- Frontmatter-Edges mit link_type='frontmatter' |
| SC-04 | Graph-Expansion verlangsamt die Suche nicht spuerbar | Unter 1 Sekunde Gesamtzeit | Zeitmessung mit/ohne Graph-Expansion | Ja -- DB-Lookup <10ms |
| SC-05 | Property-Namen sind konfigurierbar | DE und EN unterstuetzt | Konfiguration umschalten und testen | Ja -- mocPropertyNames Setting |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Graph-Extraktion (Full Vault)**: 695 Dateien via metadataCache (keine File-I/O), <10s
- **Graph-Extraktion (Incremental)**: Einzelne Datei <1ms (metadataCache-Lookup)
- **Graph-Expansion Query**: 1-3 Hops via BFS auf edges-Tabelle, <10ms
- **Vault-Event-Handling**: Direkt im Event-Handler (kein Debounce noetig, <1ms pro Datei)

### Scalability
- **Kanten**: Bis 50.000 Wikilinks + MOC-Edges
- **Hops**: Konfigurierbar 1-3 (default 1)

---

## How It Works

### Key Files

| Datei | Verantwortung |
|-------|---------------|
| `src/core/knowledge/GraphStore.ts` | CRUD auf edges/tags Tabellen, BFS getNeighbors() |
| `src/core/knowledge/GraphExtractor.ts` | metadataCache -> edges/tags (Full + Incremental) |
| `src/core/knowledge/KnowledgeDB.ts` | Schema v3 mit edges + tags Tabellen |
| `src/core/tools/vault/SemanticSearchTool.ts` | Graph-Expansion nach RRF-Fusion |
| `src/ui/settings/EmbeddingsTab.ts` | Graph-Settings UI (Toggle, Hops, MOC-Properties) |

### Schema (v3)

```sql
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    link_type TEXT NOT NULL,         -- 'body' | 'frontmatter'
    property_name TEXT,              -- null fuer body, 'Themen'/'Konzepte'/etc. fuer frontmatter
    UNIQUE(source_path, target_path, link_type, property_name)
);

CREATE TABLE tags (
    path TEXT NOT NULL,
    tag TEXT NOT NULL,
    UNIQUE(path, tag)
);
```

### Graph-Extraction Flow

```
Plugin-Start (onLayoutReady):
  GraphExtractor.extractAll(vault)
    -> Fuer jede .md Datei:
       1. metadataCache.getFileCache(file).links -> Body-Wikilinks -> edges(body)
       2. cache.frontmatter?.[propName] -> Wikilink-Regex -> edges(frontmatter, propName)
       3. cache.frontmatter?.tags + cache.tags -> tags-Tabelle
    -> Console: "[GraphExtractor] Extracted X edges, Y tags from Z files"

Vault-Event (modify/create):
  GraphExtractor.extractFile(file) -> Atomic DELETE + INSERT

Vault-Event (delete):
  GraphExtractor.removeFile(path) -> DELETE edges + tags
```

### Search-Integration Flow

```
semantic_search(query)
  -> Hybrid: Semantic + Keyword via RRF Fusion -> Top-K Ergebnisse
  -> Graph Expansion (wenn enabled):
     Fuer jeden Top-K Treffer:
       GraphStore.getNeighbors(path, hops, 5)
       -> BFS auf edges-Tabelle (bidirektional)
       -> Fuer jeden Neighbor: getChunksByPath() -> Excerpt laden
       -> Ergebnis: "via [[Note]] (PropertyName)"
     Max 5 Graph-Ergebnisse
  -> Output: Top-K + "Graph context (N-hop expansion)" Section
```

### Settings

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `enableGraphExpansion` | `true` | Graph-Expansion ein/aus |
| `graphExpansionHops` | `1` | Hop-Tiefe (1-3) |
| `mocPropertyNames` | `['Themen', 'Konzepte', 'Personen', 'Notizen', 'Meeting-Notes', 'Quellen']` | Frontmatter-Properties als MOC-Edges |

---

## Architecture Considerations

### Entscheidungen

| Frage | Entscheidung |
|-------|-------------|
| Tags als Kanten oder Attribut? | Eigene `tags`-Tabelle (kein Kantentyp) |
| Broken Links? | Ueberspringen (`getFirstLinkpathDest()` returned null) |
| metadataCache vs. eigener Parser? | metadataCache (bewaehrtes Pattern, 5+ Tools) |
| BFS oder gewichtet? | BFS ohne Gewichtung (MVP), alle Kantentypen gleich |
| Max Hops? | 3 (konfigurierbar, Default 1) |

### ASRs

**CRITICAL ASR #1**: Graph-Daten muessen bei Vault-Aenderungen inkrementell aktualisiert werden
- **Loesung**: Vault-Events (modify/create/delete/rename) -> `extractFile()` / `removeFile()`, direkt im Event-Handler (<1ms)

**MODERATE ASR #2**: MOC-Property-Namen muessen konfigurierbar sein
- **Loesung**: `mocPropertyNames` Setting, zur Laufzeit aenderbar via `setMocProperties()`

---

## Definition of Done

### Functional
- [x] Body-Wikilinks ([[Note Name]] im Fliesstext) werden extrahiert und in DB gespeichert
- [x] Frontmatter-MOC-Properties (Themen, Konzepte, Personen, Notizen, Meeting-Notes, Quellen) werden extrahiert
- [x] Beide Kantentypen (body, frontmatter) sind unterscheidbar in der DB
- [x] Tags werden extrahiert und in DB gespeichert
- [x] Suchtreffer werden um 1-3 Hops erweitert
- [x] Verbindungspfad ist in Ergebnissen sichtbar ("via [[Note]] (PropertyName)")
- [x] Property-Namen sind in Settings konfigurierbar

### Quality
- [x] Unit Tests fuer Graph-Extraktion (17 Tests in GraphStore.test.ts)
- [x] Inkrementelle Updates via Vault-Events (modify/create/delete/rename)
- [x] Graph-Expansion <10ms (DB-Lookup)

### Documentation
- [x] Feature-Spec aktualisiert (Status: Implemented)
- [x] Settings-Dokumentation fuer MOC-Property-Konfiguration

---

## Dependencies
- **FEAT-15-00**: SQLite Knowledge DB (Graph-Tabellen in derselben DB)

## Assumptions
- Obsidian metadataCache ist zuverlaessig fuer Frontmatter-Extraktion
- MOC-Properties nutzen konsistent Wikilink-Syntax im YAML

## Out of Scope
- Implizite Verbindungen (FEAT-15-03) -- Graph Expansion nutzt nur explizite Links
- Gewichtung von Kanten-Typen (alle Kanten gleich behandelt in MVP)
