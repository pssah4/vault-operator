# Feature: Dynamic Copilot Model Listing

> **Feature ID**: FEAT-12-05
> **Epic**: EPIC-12 - GitHub Copilot LLM Provider Integration
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Dynamisches Abrufen der verfuegbaren Modelle ueber den Copilot `/models` Endpoint nach erfolgreicher Authentifizierung. Statt hartkodierter Modell-Listen werden die tatsaechlich verfuegbaren Modelle (abhaengig vom Abo-Typ und Modell-Policy des Users) live abgefragt und im Model-Picker angezeigt. Modelle die Policy-Akzeptanz erfordern zeigen einen Hinweis mit Link zu den GitHub Settings.

## Benefits Hypothesis

**Wir glauben dass** dynamisches Modell-Listing
**Folgende messbare Outcomes liefert:**
- Nutzer sehen immer aktuelle Modelle (neue Modelle sofort verfuegbar)
- Nutzer sehen nur Modelle die ihr Abo tatsaechlich erlaubt

**Wir wissen dass wir erfolgreich sind wenn:**
- 100% der vom User freigeschalteten Modelle in der Auswahl erscheinen
- Modelle die Policy-Akzeptanz brauchen zeigen klaren Hinweis

## User Stories

### Story 1: Verfuegbare Modelle durchsuchen
**Als** verbundener Copilot-Nutzer
**moechte ich** eine Liste aller verfuegbaren Modelle sehen
**um** das passende Modell auszuwaehlen

### Story 2: Neues Modell entdecken
**Als** Nutzer
**moechte ich** dass neue Modelle automatisch erscheinen wenn GitHub sie freischaltet
**um** nicht auf ein Plugin-Update warten zu muessen

### Story 3: Modell-Policy-Hinweis
**Als** Nutzer der ein Modell nutzen moechte das Policy-Akzeptanz erfordert
**moechte ich** einen klaren Hinweis mit Link zu GitHub Settings sehen
**um** das Modell freischalten zu koennen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Nach Auth werden verfuegbare Modelle angezeigt | Alle freigeschalteten Modelle sichtbar | Funktions-Test |
| SC-02 | Neue Modelle erscheinen ohne Plugin-Update | Modell nach GitHub-seitiger Freischaltung sichtbar | Zeitversetzt-Test |
| SC-03 | Gesperrte Modelle zeigen Hinweis statt Fehlermeldung | Nutzer versteht was zu tun ist | User-Test |
| SC-04 | Modell-Liste laedt innerhalb akzeptabler Wartezeit | <3 Sekunden | Performance-Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Model Fetch**: <3s fuer `/models` Request
- **Caching**: Modell-Liste fuer Dauer der Session cachen (nicht bei jedem Modal-Open neu laden)

### Reliability
- **Fallback**: Wenn `/models` fehlschlaegt → manuelles Textfeld fuer Model-ID
- **401 Retry**: Token refreshen und einmal retry

### Data
- **Policy Terms Cache**: `Map<modelId, policyTerms>` fuer Fehler-Hinweise bei 400-Responses
- **Model Capabilities**: `capabilities` Feld aus API-Response fuer `supportsTools`/`supportsStreaming` Mapping

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1: Model-Suggest im ModelConfigModal**
- **Warum ASR**: Bestehende Provider nutzen hartkodierte `MODEL_SUGGESTIONS`. Copilot braucht asynchrones Laden. Das Modal muss async-faehing sein.
- **Impact**: ModelConfigModal bekommt async Model-Fetch-Pfad
- **Quality Attribute**: UX, Maintainability

### Constraints
- **Session-Cache**: Modelle nicht persistieren (koennen sich serverseitig aendern)
- **requestUrl**: Auch fuer `/models` Request

### Open Questions fuer Architekt
- Soll die Modell-Liste beim Oeffnen des Modals geladen werden oder erst bei Provider-Wechsel auf github-copilot?
- Wie mit Chat- vs. Embedding-Modellen in der `/models` Response umgehen? Filtern nach Model-Type?
- Soll ein "Refresh Models" Button angeboten werden?

---

## Definition of Done

### Functional
- [ ] `/models` Endpoint wird nach Auth abgefragt
- [ ] Modelle erscheinen als Auswahl im Model-Picker
- [ ] Chat- und Embedding-Modelle korrekt differenziert
- [ ] Policy Terms werden gecached und bei Fehlern angezeigt
- [ ] Fallback: manuelles Textfeld wenn Listing fehlschlaegt
- [ ] Session-Caching (nicht bei jedem Oeffnen neu laden)

### Quality
- [ ] Regressions-Test: bestehende MODEL_SUGGESTIONS unveraendert
- [ ] Review-Bot Compliance

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)

---

## Dependencies

- **FEAT-12-01**: Auth & Token Management (gueltige Tokens fuer `/models` Request)
- **FEAT-12-03**: Settings UI (Model-Picker muss async-Daten anzeigen koennen)

## Assumptions

- `/models` Endpoint gibt strukturierte Daten zurueck (id, name, capabilities, policy)
- Response-Format ist stabil (API-Version-Header als Schutz)
- Chat-Modelle und Embedding-Modelle sind im Response differenzierbar

## Out of Scope

- Persistente Modell-Liste (wird nur session-gecacht)
- Automatische Modell-Empfehlungen basierend auf Task-Typ
- Modell-Vergleichsfunktionalitaet
