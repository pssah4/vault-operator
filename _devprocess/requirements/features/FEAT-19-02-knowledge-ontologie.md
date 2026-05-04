# Feature: Knowledge Ontologie

> **Feature ID**: FEAT-19-02
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Eine neue Tabelle in der KnowledgeDB die Themen-Cluster, Konzept-Hierarchien und
Entitaets-Beziehungen speichert. Ermoeglicht transitives Retrieval: "Alles zu
Legitimitaet" findet auch Notes ueber Menschenwuerde, Tyrannenmord und
Gesellschaftsvertrag -- ueber verwandte Konzepte hinweg.

Heute kann der Agent nur paarweise Aehnlichkeit erkennen (Cosine-Similarity).
Die Ontologie gibt ihm ein strukturelles Verstaendnis davon, wie Themen und
Konzepte zusammenhaengen.

## Benefits Hypothesis

**Wir glauben dass** eine Ontologie-Schicht das Retrieval von ~60% auf >90%
Vollstaendigkeit steigert bei thematischen Abfragen.

**Folgende messbare Outcomes liefert:**
- "Alles zu Thema X" findet >90% der relevanten Notes (transitiv)
- Agent braucht weniger semantic_search Calls fuer vollstaendige Ergebnisse

**Wir wissen dass wir erfolgreich sind wenn:**
- Transitive Suche findet mindestens 30% mehr Notes als reine Semantic Search
- Ontologie deckt >80% der Vault-Themen ab

## User Stories

### Story 1: Transitives Retrieval
**Als** Wissensarbeiter
**moechte ich** bei "Zeig mir alles zu Thema X" auch Notes finden die verwandte Konzepte behandeln
**um** beim Denken keine relevanten Verbindungen zu uebersehen

### Story 2: Canvas/Base aus Ontologie
**Als** Wissensarbeiter
**moechte ich** mir eine thematische Arbeitsflaehe generieren lassen koennen
**um** wie Luhmann relevante Zettel auf meinen Schreibtisch zu legen und neu zu verbinden

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Thematische Suche findet verwandte Konzepte | >30% mehr Treffer als ohne Ontologie | A/B Vergleich |
| SC-02 | Ontologie wird automatisch gepflegt | Aktualisierung bei jedem Ingest | Log-Analyse |
| SC-03 | Kein spuerbarer Overhead bei der Suche | Zusaetzliche Latenz <500ms | Zeitmessung |
| SC-04 | Agent kann Arbeitsflaechengenerierung nutzen | Canvas/Base zeigt alle relevanten Notes | Manueller Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Query-Latenz**: <100ms fuer transitive Lookup (SQL-Query, kein LLM)
- **Update-Latenz**: <500ms pro Ingest (inkrementelles Update)
- **Speicher**: <10MB fuer 1000 Notes

### Scalability
- **Vault-Groesse**: Funktioniert mit 5000+ Notes
- **Cluster-Anzahl**: Unbegrezt, aber Top-N fuer Retrieval

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Ontologie-Schema
- **Warum ASR**: Das DB-Schema bestimmt welche Beziehungstypen darstellbar sind und wie effizient Traversals laufen
- **Impact**: SQL-Tabellen-Design in KnowledgeDB
- **Quality Attribute**: Performance, Flexibility

**CRITICAL ASR #2**: Ontologie-Befuellung
- **Warum ASR**: Soll die Ontologie rein aus bestehenden Vault-Daten (MOC-Properties, Tags, ImplicitEdges) abgeleitet werden oder braucht sie LLM-Unterstuetzung?
- **Impact**: Token-Kosten, Genauigkeit, Bootstrapping bei neuem Vault
- **Quality Attribute**: Correctness, Cost-Efficiency

### Vorgeschlagenes Schema

```sql
CREATE TABLE ontology (
    entity_path TEXT NOT NULL,     -- Note-Pfad (z.B. "Konzepte/Legitimität.md")
    cluster TEXT NOT NULL,         -- Themen-Cluster (z.B. "Politische Philosophie")
    parent_path TEXT,              -- Uebergeordnete Entitaet (hierarchisch)
    relation TEXT,                 -- Art der Beziehung (z.B. "is-part-of", "related-to")
    confidence REAL DEFAULT 1.0,   -- Wie sicher ist die Zuordnung (0.0-1.0)
    updated_at TEXT NOT NULL
);
```

### Open Questions fuer Architekt
- Kann die Ontologie initial aus bestehenden MOC-Properties + ImplicitEdges bootstrapped werden (ohne LLM)?
- Soll die Ontologie hierarchisch (Parent-Child) oder flach (Cluster-Zugehoerigkeit) sein?
- Wie interagiert die Ontologie mit dem bestehenden Graph Expansion (FEAT-15-02)?

---

## Definition of Done

### Functional
- [ ] Ontologie-Tabelle in KnowledgeDB erstellt
- [ ] Befuellung aus bestehenden MOC-Properties und Vault-Struktur
- [ ] Inkrementelle Updates bei Ingest (FEAT-19-00)
- [ ] Transitives Retrieval via semantic_search erweiterbar
- [ ] Canvas/Base-Generierung nutzt Ontologie-Daten

### Quality
- [ ] Query-Latenz <100ms
- [ ] Funktioniert mit leerer Ontologie (graceful degradation)

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] ADR fuer Schema-Entscheidung

---

## Dependencies
- **EPIC-15**: KnowledgeDB, GraphStore, ImplicitConnections als Datenquelle
- **FEAT-19-00 (Ingest)**: Befuellt die Ontologie bei jedem Ingest

## Out of Scope
- Manuelle Ontologie-Bearbeitung durch User
- Ontologie-Visualisierung (Canvas/Base reicht)
- Cross-Vault-Ontologie
