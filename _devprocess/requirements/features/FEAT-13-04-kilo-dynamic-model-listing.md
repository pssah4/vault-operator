# Feature: Kilo Dynamic Model Listing

> **Feature ID**: FEAT-13-04
> **Epic**: EPIC-13 - Kilo Gateway LLM Provider Integration
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Laedt die verfuegbaren Kilo-Gateway-Modelle dynamisch ueber die dokumentierten Gateway-Endpoints. Die Modellliste wird im Settings-Flow und bei Bedarf im Runtime-Kontext genutzt, damit Nutzer aktuelle Modelle, freie Modelle und virtuelle Modelle wie `kilo/auto` ohne Plugin-Update sehen koennen.

## Benefits Hypothesis

**Wir glauben dass** dynamisches Modell-Listing
**Folgende messbare Outcomes liefert:**
- Nutzer sehen immer die aktuelle Kilo-Modellpalette
- Vault Operator muss nicht fuer jede Modellaktualisierung ausgeliefert werden

**Wir wissen dass wir erfolgreich sind wenn:**
- Alle vom Gateway zurueckgegebenen Modelle in der Auswahl verfuegbar sind
- Neue Modelle ohne Plugin-Update auftauchen

## User Stories

### Story 1: Aktuelle Modelle sehen
**Als** Kilo-Nutzer
**moechte ich** die aktuelle Modellliste sehen
**um** passende Modelle direkt auszuwaehlen

### Story 2: Freie und virtuelle Modelle erkennen
**Als** Nutzer
**moechte ich** auch besondere Modelle wie `:free` oder `kilo/auto` sehen
**um** Gateway-spezifische Vorteile nutzen zu koennen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Aktuelle Modelle werden automatisch angezeigt | 100% der Gateway-Modelle sichtbar | Funktions-Test |
| SC-02 | Neue Modelle erscheinen ohne Plugin-Update | Verfuegbar nach Gateway-Aenderung | Zeitversetzt-Test |
| SC-03 | Modellliste laedt in akzeptabler Wartezeit | <3 Sekunden | Performance-Test |
| SC-04 | Modellliste bleibt bei Fehlern nutzbar | Fallback statt harter Blockade | UX-Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Model Fetch**: <3s fuer `GET /api/gateway/models`
- **Caching**: Session-Cache zur Vermeidung unnötiger Wiederholungsrequests

### Reliability
- **Fallback**: Manuelles Model-ID-Feld wenn Listing fehlschlaegt
- **Optional Grouping**: `models-by-provider` spaeter nutzbar, aber nicht zwingend fuer MVP

### Compatibility
- **Model Shape**: OpenAI-kompatible Modelle mit Gateway-Metadaten
- **Virtual Models**: `kilo/auto` muss als gueltige Auswahl erhalten bleiben

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

MODERATE ASR #1: Asynchrone Modellliste im bestehenden Modal
- **Warum ASR**: Anders als statische Suggestions erfordert Kilo eine Laufzeit-Abfrage
- **Impact**: ModelConfigModal und Model-Suggest muessen asynchrones Laden unterstuetzen
- **Quality Attribute**: UX, Maintainability

### Open Questions fuer Architekt
- Soll `models-by-provider` bereits fuer UI-Gruppierung genutzt werden oder erst spaeter?
- Soll die Liste auch ohne Auth geladen werden, um Free Models frueh sichtbar zu machen?

---

## Definition of Done

### Functional
- [ ] Modellliste wird dynamisch geladen
- [ ] `kilo/auto` und Free-Modelle sind sichtbar
- [ ] Fallback auf manuelle Eingabe bei Fehlern
- [ ] Session-Caching vorhanden

### Quality
- [ ] Keine Regression fuer bestehende statische Provider-Suggestions

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)

---

## Dependencies

- **FEAT-13-03**: Settings UI Integration

## Assumptions

- `GET /api/gateway/models` bleibt stabil und fuer Vault Operator nutzbar

## Out of Scope

- Persistente Modellhistorie
- Intelligente Modell-Empfehlungen
