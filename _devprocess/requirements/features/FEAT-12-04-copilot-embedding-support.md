# Feature: Copilot Embedding Support

> **Feature ID**: FEAT-12-04
> **Epic**: EPIC-12 - GitHub Copilot LLM Provider Integration
> **Priority**: P1-High
> **Effort Estimate**: S
> **Backlog row:** `_devprocess/context/BACKLOG.md` -> FEAT-12-04
> (Status: Won't fix. Copilot API liefert keinen `/embeddings`-Endpoint;
> github-copilot ist im Code aktiv aus EMBEDDING_PROVIDERS ausgeschlossen.)
> **Code pointer:** ARCHITECTURE.map concept `embeddings-tab`,
> Setting `EMBEDDING_PROVIDERS`.

## Feature Description

GitHub Copilot wurde als potenzieller Embedding-Provider fuer den
SemanticIndexService geprueft. Ergebnis: die GitHub-Copilot-API
exponiert keinen `/embeddings`-Endpoint. Eine produktive Anbindung ist
nicht moeglich. Das Feature ist aktiv ausgeschlossen, der Code
dokumentiert die Entscheidung als Kommentar an der Ausschluss-Liste.

Eine Wiedereroeffnung ist moeglich, sobald Microsoft / GitHub einen
offiziellen Embedding-Endpoint freigibt.

## Original Feature Description (historisch)

GitHub Copilot als Embedding-Provider fuer den SemanticIndexService verfuegbar machen. Copilot bietet Zugang zu Embedding-Modellen (z.B. text-embedding-3-small) ueber die gleiche API. Nutzer koennen nach erfolgreicher Auth Copilot-Embedding-Modelle im Embeddings-Tab konfigurieren, ohne separaten OpenAI API Key.

## Benefits Hypothesis

**Wir glauben dass** Copilot als Embedding-Provider
**Folgende messbare Outcomes liefert:**
- Nutzer koennen Semantic Search nutzen ohne separaten API Key
- Niedrigere Einstiegshuerde fuer Semantic Index Feature

**Wir wissen dass wir erfolgreich sind wenn:**
- Embedding-Generierung ueber Copilot erfolgreich funktioniert
- Kein Qualitaetsverlust gegenueber direktem OpenAI Embedding-Zugang

## User Stories

### Story 1: Embedding-Modell ueber Copilot konfigurieren
**Als** verbundener Copilot-Nutzer
**moechte ich** ein Embedding-Modell ueber meinen Copilot-Zugang konfigurieren
**um** Semantic Search ohne separaten API Key zu nutzen

### Story 2: Semantic Index mit Copilot bauen
**Als** Nutzer mit Copilot-Embedding
**moechte ich** meinen Vault-Index ueber Copilot-Embeddings erstellen
**um** semantische Suche in meinem Vault zu ermoeglichen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Copilot erscheint als Embedding-Provider-Option | Im Embeddings-Tab sichtbar | UI-Review |
| SC-02 | Vault-Index laesst sich ueber Copilot-Embeddings erstellen | Vollstaendiger Index-Build ohne Fehler | Funktions-Test |
| SC-03 | Semantische Suche liefert relevante Ergebnisse | Vergleichbar mit direktem Embedding-Zugang | Qualitaets-Test |
| SC-04 | Bestehende Embedding-Provider unveraendert | Keine Regression | Regressions-Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Batch Embedding**: Copilot `/embeddings` Endpoint mit Batch-Support (mehrere Texte pro Request)
- **Throughput**: Mindestens 50 Embeddings/Minute (Copilot Rate Limits beachten)

### Compatibility
- **EMBEDDING_PROVIDERS**: `github-copilot` zur Liste hinzufuegen
- **EMBEDDING_SUGGESTIONS**: Dynamisch oder statisch: `text-embedding-3-small`, `text-embedding-3-large`
- **SemanticIndexService**: Nutzt `CustomModel` → `requestUrl`-basierte Embedding-Calls

### Security
- **Token-Integration**: Embedding-Requests nutzen den gleichen Copilot Token wie Chat Completions

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1: Embedding-Request-Routing**
- **Warum ASR**: SemanticIndexService nutzt aktuell OpenAI SDK fuer Embeddings. Copilot erfordert requestUrl mit Custom Headers.
- **Impact**: Embedding-Request-Layer muss Copilot-spezifischen Pfad unterstuetzen
- **Quality Attribute**: Modularity

### Open Questions fuer Architekt
- Unterstuetzt Copilot API den `/embeddings` Endpoint ueberhaupt? (Muss verifiziert werden im Spike)
- Gleiche Dimensions wie direkter OpenAI-Zugang? (Vermutlich ja, gleiche Modelle)
- Rate Limits fuer Embedding-Requests ueber Copilot?

---

## Definition of Done

### Functional
- [ ] `github-copilot` in `EMBEDDING_PROVIDERS` Liste
- [ ] Embedding-Modell ueber Copilot konfigurierbar im Embeddings-Tab
- [ ] Embedding-Generierung funktioniert (Vault-Index Build)
- [ ] Semantische Suche mit Copilot-Embeddings liefert Ergebnisse

### Quality
- [ ] Regressions-Test: bestehende Embedding-Provider unveraendert
- [ ] Review-Bot Compliance

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)

---

## Dependencies

- **FEAT-12-01**: Auth & Token Management (Copilot-Token fuer Embedding-Requests)
- **FEAT-12-03**: Settings UI (Provider im Embeddings-Tab sichtbar)
- **SemanticIndexService**: Bestehend, muss Copilot-Pfad unterstuetzen

## Assumptions

- Copilot API bietet einen `/embeddings` Endpoint (analog zu OpenAI)
- Embedding-Modelle erscheinen im `/models` Listing
- Dimensions sind identisch mit direktem OpenAI-Zugang

## Out of Scope

- Eigene Embedding-Modelle die nur ueber Copilot verfuegbar sind
- Batch-Optimierung ueber Copilot-spezifische Limits hinaus
