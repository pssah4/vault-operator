# Feature: Kilo Embedding Support

> **Feature ID**: FEAT-13-06
> **Epic**: EPIC-13 - Kilo Gateway LLM Provider Integration
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Erweitert den SemanticIndexService um Kilo Gateway als Embedding-Provider. Ziel ist, dass Nutzer ihren Kilo-Zugang auch fuer semantische Suche verwenden koennen, ohne separate OpenAI- oder andere Embedding-Keys zu pflegen.

## Benefits Hypothesis

**Wir glauben dass** Kilo als Embedding-Provider
**Folgende messbare Outcomes liefert:**
- Nutzer koennen Semantik-Suche mit demselben Gateway-Zugang nutzen
- Weniger Provider-Fragmentierung fuer Nutzer mit Kilo-Zugang

**Wir wissen dass wir erfolgreich sind wenn:**
- Ein Vault-Index mit Kilo-Embeddings erstellt werden kann
- Semantische Suche relevante Ergebnisse liefert

## User Stories

### Story 1: Embeddings ueber Kilo nutzen
**Als** Kilo-Nutzer
**moechte ich** Kilo auch fuer Embeddings waehlen
**um** Semantic Search ohne separaten Provider zu verwenden

### Story 2: Semantic Index aufbauen
**Als** Nutzer
**moechte ich** meinen Vault-Index ueber Kilo erzeugen
**um** meinen bestehenden Zugang wiederzuverwenden

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Kilo erscheint als Embedding-Option | Sichtbar im Embeddings-Tab | UI-Review |
| SC-02 | Ein kompletter Index kann erstellt werden | End-to-End erfolgreich | Funktionstest |
| SC-03 | Suchergebnisse bleiben relevant | Vergleichbar mit anderen Embedding-Providern | Qualitaets-Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Batch Embedding**: Nutzung des bestehenden Batch-Pfads wenn Gateway-Endpoint kompatibel ist

### Reliability
- **Technical Spike Required**: Gateway-Embeddings muessen vor finaler Zusage verifiziert werden
- **Feature Gating**: Wenn technisch nicht stabil, isoliert deaktivierbar

### Compatibility
- **Embedding Provider List**: Kilo zur Embedding-Provider-Liste hinzufuegen

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

MODERATE ASR #1: Reuse des bestehenden Embedding-Pfads
- **Warum ASR**: Kilo soll den OpenAI-kompatiblen Embedding-Pfad wiederverwenden statt einen komplett neuen Embedding-Stack einzufuehren
- **Impact**: SemanticIndexService braucht eine saubere Kilo-Branch oder generische Gateway-Konfiguration
- **Quality Attribute**: Maintainability

### Open Questions fuer Architekt
- Welcher konkrete Embedding-Endpoint ist fuer Kilo Gateway zu verwenden?
- Welche Modelle sind fuer Embeddings zugelassen und wie werden sie in der Modellliste unterschieden?

---

## Definition of Done

### Functional
- [ ] Kilo ist als Embedding-Provider verfuegbar
- [ ] Embedding-Requests funktionieren end-to-end
- [ ] Semantic Index laesst sich aufbauen

### Quality
- [ ] Technischer Spike dokumentiert die Gateway-Kompatibilitaet
- [ ] Regressionstest fuer bestehende Embedding-Provider

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)

---

## Dependencies

- **FEAT-13-01**: Auth & Session
- **FEAT-13-03**: Settings UI
- **SemanticIndexService**: Bestehender API-Pfad

## Assumptions

- Kilo Gateway ist fuer Embeddings ausreichend OpenAI-kompatibel

## Out of Scope

- Eigene Kilo-spezifische Embedding-Visualisierung
