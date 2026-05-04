# Feature: Knowledge Data Consolidation

> **Feature ID**: FEAT-15-05
> **Epic**: EPIC-15 - Unified Knowledge Layer
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

Alle maschinenlesbaren Wissensdaten werden in die Knowledge DB konsolidiert: Conversation-Sessions, Task-Episodes, Pattern-Tracker und gelernte Recipes. Bisher werden diese als einzelne Dateien gespeichert (Sessions als .md, Episodes/Patterns/Recipes als .json). Die Konsolidierung ermoeglicht Cross-Referenzen ("Welche Sessions nutzten dieses Tool?"), schnelleres Laden beim Start, und konsistente Datenhaltung.

Zusaetzlich wird learnings.md entfernt -- die Inhalte sind redundant mit Recipes (Tool-Sequenzen), patterns.md (Verhaltensregeln), errors.md (Fehler-Fixes) und user-profile.md (Praeferenzen). Der LongTermExtractor wird umgeroutet um Erkenntnisse an die richtige Stelle zu schreiben.

## Benefits Hypothesis

**Wir glauben dass** die Konsolidierung in eine DB
**Folgende messbare Outcomes liefert:**
- Startup-Zeit sinkt (eine DB oeffnen statt dutzende Dateien lesen)
- Cross-Referenzen werden moeglich (z.B. Session mit erfolgreichstem Tool-Einsatz)
- learnings.md Redundanz wird aufgeloest

**Wir wissen dass wir erfolgreich sind wenn:**
- Alle Session-Daten, Episodes, Patterns und Recipes in der DB sind
- learnings.md nicht mehr existiert und der LongTermExtractor korrekt routet
- Bestehende Funktionalitaet (Recipe Matching, Session Retrieval) funktioniert wie bisher

## User Stories

### Story 1: Schnellerer Start
**Als** Knowledge Worker
**moechte ich** dass Obsilo beim Start nicht dutzende Dateien laden muss
**um** schneller arbeitsfaehig zu sein

### Story 2: Lernhistorie verstehen
**Als** Knowledge Worker
**moechte ich** nachvollziehen koennen welche Workflows Obsilo gelernt hat und warum
**um** das Lernverhalten meines Agenten zu verstehen und zu steuern

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Alle maschinenlesbaren Daten sind in einer Datenbank | Sessions, Episodes, Recipes, Patterns | Pruefung: keine losen .json/.md Dateien mehr fuer diese Datentypen |
| SC-02 | Bestehende Funktionen arbeiten identisch | Recipe Matching, Session Retrieval, Episode Recording | Regressionstests aller Konsumenten |
| SC-03 | learnings.md existiert nicht mehr | Datei entfernt | Dateisystem-Check |
| SC-04 | Neue Erkenntnisse landen an der richtigen Stelle | Tool-Sequenzen -> Recipes, Praeferenzen -> user-profile.md | Manueller Test: Session mit Learnings, pruefen wo sie landen |
| SC-05 | Start ist nicht langsamer als vorher | Gleichwertig oder schneller | Zeitmessung Plugin-Load |

---

## Technical NFRs (fuer Architekt)

### Performance
- **DB-Query (Session Retrieval)**: <10ms fuer Top-3 Sessions
- **Recipe-Load**: <5ms fuer alle Recipes (statisch + gelernt)
- **Episode-Insert**: <5ms (fire-and-forget nach Task-Completion)

### Data Model (in Knowledge DB)
- **sessions Tabelle**: id, title, summary, embedding (BLOB), created_at, source
- **episodes Tabelle**: id, user_message, mode, tool_sequence, tool_ledger, success, result_summary, created_at
- **recipes Tabelle**: id, name, description, trigger, steps (JSON), source, schema_version, success_count, last_used
- **patterns Tabelle**: pattern_key, tool_sequence (JSON), episodes (JSON), success_count

### Migration
- Bestehende Session .md Dateien -> sessions Tabelle
- Bestehende Episode .json Dateien -> episodes Tabelle
- Bestehende Recipe .json Dateien -> recipes Tabelle
- Bestehende Pattern .json Dateien -> patterns Tabelle
- Einmalige Migration beim ersten Start nach Update

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1**: Migration bestehender Daten muss verlustfrei sein
- **Warum ASR**: User hat bereits Sessions und Episodes gesammelt
- **Impact**: Migrations-Logik die alte Dateien liest und in DB schreibt
- **Quality Attribute**: Reliability, Data Integrity

**MODERATE ASR #2**: LongTermExtractor Routing muss korrekt sein
- **Warum ASR**: Falsch geroutete Erkenntnisse (z.B. Tool-Sequenz in user-profile.md) verschlechtern die Agent-Qualitaet
- **Impact**: Klassifikationslogik im Extractor: "Ist das eine Tool-Sequenz? -> Recipe Pipeline. Ist das eine Praeferenz? -> user-profile.md."
- **Quality Attribute**: Correctness

### Open Questions fuer Architekt
- Sollen Session-Embeddings im gleichen Vektor-Space wie Vault-Chunks liegen? (Vereinfacht Retrieval)
- Migration: Alte Dateien loeschen nach Migration oder als Backup behalten?
- LongTermExtractor: Routing-Logik im Extractor selbst oder in separatem Classifier?

---

## Definition of Done

### Functional
- [ ] Sessions, Episodes, Recipes, Patterns in Knowledge DB
- [ ] Migration bestehender Dateien beim ersten Start
- [ ] learnings.md entfernt
- [ ] LongTermExtractor routet korrekt (Tool-Sequenzen -> Recipes, Praeferenzen -> user-profile.md, Fehler -> errors.md)
- [ ] RecipeStore, RecipeMatchingService, EpisodicExtractor, RecipePromotionService arbeiten auf DB

### Quality
- [ ] Migrations-Test: Bestehende Daten vollstaendig in DB
- [ ] Regression: Recipe Matching funktioniert identisch
- [ ] Regression: Session Retrieval funktioniert identisch

### Documentation
- [ ] Feature-Spec aktualisiert

---

## Dependencies
- **FEAT-15-00**: SQLite Knowledge DB (DB-Infrastruktur)

## Assumptions
- Bestehende Session/Episode/Recipe-Dateien haben konsistentes Format
- LongTermExtractor kann zwischen Kategorien unterscheiden (Tool-Sequenz vs. Praeferenz vs. Fehler)

## Out of Scope
- Aenderung der menschenlesbaren .md Memory-Dateien (user-profile, patterns, soul, projects, errors bleiben als .md)
- UI fuer Daten-Exploration in der Knowledge DB
