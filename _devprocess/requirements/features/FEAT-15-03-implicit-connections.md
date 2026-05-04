# Feature: Implicit Connection Discovery

> **Feature ID**: FEAT-15-03
> **Epic**: EPIC-15 - Unified Knowledge Layer
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

Obsilo erkennt implizite Verbindungen zwischen Notes: Paare von Notes die semantisch nah sind (hohe Vektor-Aehnlichkeit) aber keinen direkten Wikilink oder gemeinsames MOC-Thema haben. Diese versteckten Zusammenhaenge werden vorberechnet (Background-Job) und in der Suche als "Implicit connections" angezeigt.

Note-Level-Vektoren werden durch Mittelwertbildung aller Chunk-Vektoren berechnet. Paarweiser Cosine-Similarity-Vergleich mit konfigurierbarem Threshold (default 0.7). Paare mit expliziten Edges (Wikilinks/MOC) werden ausgeschlossen.

## Benefits Hypothesis

**Wir glauben dass** die Erkennung impliziter Verbindungen
**Folgende messbare Outcomes liefert:**
- User entdeckt Zusammenhaenge zwischen Notes die er bisher uebersehen hat
- Suchergebnisse enthalten semantisch verwandte Notes jenseits expliziter Links
- Vault-Vernetzung verbessert sich ueber Zeit (User folgt Vorschlaegen und verlinkt)

**Wir wissen dass wir erfolgreich sind wenn:**
- Mindestens 50% der Vorschlaege vom User als relevant bewertet werden
- Der User neue Wikilinks basierend auf Vorschlaegen erstellt

## User Stories

### Story 1: Versteckte Verbindungen entdecken
**Als** Knowledge Worker
**moechte ich** erfahren welche meiner Notes thematisch zusammenhaengen ohne direkt verlinkt zu sein
**um** Wissensluecken und fehlende Verbindungen in meinem Vault zu schliessen

### Story 2: Suche ueber implizite Verbindungen
**Als** Knowledge Worker
**moechte ich** dass die Suche auch semantisch verwandte Notes findet die keinen direkten Link zum Treffer haben
**um** ein vollstaendigeres Bild eines Themas zu erhalten

### Story 3: Verbindungsvorschlaege
**Als** Knowledge Worker
**moechte ich** aktive Vorschlaege erhalten wenn Obsilo eine potenziell relevante Verbindung erkennt
**um** mein Wissensnetz gezielt erweitern zu koennen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement | Verified |
|----|-----------|--------|-------------|----------|
| SC-01 | Implizite Verbindungen werden erkannt und gespeichert | >0 Verbindungen pro Note | Zaehlung der erkannten Paare | Ja -- computeAll() speichert Paare in implicit_edges |
| SC-02 | Vorschlaege sind relevant | >50% subjektiv relevant | User-Bewertung einer Stichprobe | Ausstehend (manuelle Pruefung) |
| SC-03 | Vorberechnung laeuft im Hintergrund | Keine UI-Blockade | Subjektive Responsiveness | Ja -- async mit Yield alle 1000 Paare |
| SC-04 | Implizite Verbindungen in Suchergebnisse integriert | Mind. 1 impliziter Treffer | Pruefung der Ergebnis-Metadaten | Ja -- "Implicit connections" Section |
| SC-05 | Empfindlichkeit ist einstellbar | Konfigurierbare Schwelle | Settings-Aenderung aendert Anzahl | Ja -- implicitThreshold Slider (0.5-0.9) |

---

## How It Works

### Key Files

| Datei | Verantwortung |
|-------|---------------|
| `src/core/knowledge/ImplicitConnectionService.ts` | computeAll, recomputeForPath, getImplicitNeighbors |
| `src/core/knowledge/VectorStore.ts` | getNoteVectors() -- Mittelwert der Chunk-Vektoren pro Note |
| `src/core/knowledge/KnowledgeDB.ts` | Schema v4 mit implicit_edges Tabelle |
| `src/core/tools/vault/SemanticSearchTool.ts` | Implicit-Lookup nach Graph-Expansion |

### Algorithmus

```
computeAll(threshold=0.7):
  1. getNoteVectors() -> Map<path, avgVector> (Mittelwert aller Chunks)
  2. Lade explizite Edges als Set<"a|b"> (fuer Ausschluss)
  3. Fuer alle Paare (i < j):
     - Cosine-Similarity berechnen
     - Wenn >= threshold UND kein expliziter Link: INSERT
  4. Yield alle 1000 Paare (async, non-blocking)
  5. save() am Ende
```

### Schema (v4)

```sql
CREATE TABLE implicit_edges (
    source_path TEXT NOT NULL,
    target_path TEXT NOT NULL,
    similarity REAL NOT NULL,
    computed_at TEXT NOT NULL,
    UNIQUE(source_path, target_path)
);
```

### Settings

| Setting | Default | Beschreibung |
|---------|---------|--------------|
| `enableImplicitConnections` | `true` | Implicit Connection Discovery ein/aus |
| `implicitThreshold` | `0.7` | Minimum Cosine-Similarity (0.5=loose, 0.9=strict) |

---

## Definition of Done

### Functional
- [x] Implizite Verbindungen werden vorberechnet und in DB gespeichert
- [x] Schwellenwert ist in Settings konfigurierbar (Slider 0.5-0.9)
- [x] Suchergebnisse enthalten implizite Treffer (markiert als "Implicit connections")
- [ ] Aktive Vorschlaege werden dem User angezeigt (FEAT-15-06)

### Quality
- [x] Unit Tests: 9 Tests in ImplicitConnectionService.test.ts
- [x] Background-Computation mit Yield (non-blocking)
- [ ] Noise-Test: Stichprobe von 20 Vorschlaegen, >50% subjektiv relevant

### Documentation
- [x] Feature-Spec aktualisiert (Status: Implemented)
- [x] Settings-Dokumentation (Threshold-Slider)

---

## Dependencies
- **FEAT-15-00**: SQLite Knowledge DB (implicit_edges Tabelle)
- **FEAT-15-01**: Enhanced Vector Retrieval (VectorStore mit Chunk-Vektoren)
- **FEAT-15-02**: Graph Extraction (edges-Tabelle fuer Explicit-Link-Filter)

## Out of Scope
- UI fuer Verbindungsvorschlaege (FEAT-15-06)
- Automatisches Erstellen von Wikilinks basierend auf Vorschlaegen
- Community-Detection (Cluster-Erkennung)
