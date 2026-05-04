# Epic: Kilo Gateway LLM Provider Integration

> **Epic ID**: EPIC-13
> **Business Alignment**: _devprocess/analysis/BA-08-kilo-gateway-provider.md
> **Scope**: MVP

## Epic Hypothesis Statement

FUER Obsilo-Nutzer mit bestehendem Kilo-Zugang oder Bedarf an einem zentralen Gateway fuer viele Modelle
DIE ohne separate Provider-Setups auf mehrere frontier Modelle, Organisationsrichtlinien und Gateway-Routing zugreifen moechten
IST DIE Kilo Gateway Integration
EIN neuer Gateway-basierter LLM Provider innerhalb der bestehenden Obsilo Provider-Architektur
DER zentralen Modellzugang, Device Login, Organisationskontext und dynamische Modellverwaltung ueber eine OpenAI-kompatible API bietet
IM GEGENSATZ ZU direkten BYOK-Providern mit jeweils eigener Konfiguration
UNSERE LOESUNG verbindet einen einmaligen Kilo-Login mit dynamischem Modellzugang und optionalem Org-Kontext in einer einheitlichen UX

## Business Outcomes (messbar)

1. **Kilo-Aktivierung**: Kilo-Auth-Erfolgsrate erreicht >95% innerhalb der ersten 2 Wochen nach Launch
2. **Modell-Abdeckung**: 100% der vom Kilo Gateway gelieferten Modelle sind in Obsilo auswaehlbar oder als Fallback manuell nutzbar
3. **Team-Nutzbarkeit**: >90% der Team-/Enterprise-Nutzer schliessen die Organisationsauswahl erfolgreich ab
4. **Null-Regression**: 0 neue Bugs in bestehenden Providern und Embedding-Pfaden nach Einfuehrung

## Leading Indicators (Fruehindikatoren)

- Device-Auth Completion Rate: Anteil gestarteter Auth-Flows die erfolgreich abgeschlossen werden
- Model Discovery Success Rate: Anteil erfolgreicher Modelllisten-Requests
- Organization Context Usage: Anteil der Kilo-Nutzer die einen Org-Kontext aktiv nutzen
- Gateway Session Usage: Anzahl aktiver Chat-Sitzungen ueber Kilo Gateway

## MVP Features

| Feature ID | Name | Priority | Effort | Status |
|------------|------|----------|--------|--------|
| FEAT-13-01 | Kilo Auth & Session Management | P0 | M | Not Started |
| FEAT-13-02 | Kilo Gateway Chat Provider | P0 | M | Not Started |
| FEAT-13-03 | Kilo Settings UI Integration | P0 | M | Not Started |
| FEAT-13-04 | Kilo Dynamic Model Listing | P1 | S | Not Started |
| FEAT-13-05 | Kilo Organization Context | P1 | S | Not Started |
| FEAT-13-06 | Kilo Embedding Support | P1 | S | Not Started |
| FEAT-13-07 | Kilo Manual Token Mode | P1 | S | Not Started |

**Priority Legend:**
- P0-Critical: Ohne geht MVP nicht
- P1-High: Wichtig fuer vollstaendige User Experience
- P2-Medium: Wertsteigernd, aber nicht essentiell

**Effort:** S (1-2 Sprints), M (3-5 Sprints), L (6+ Sprints)

## Explizit Out-of-Scope

- **Kilo Dashboard Management**: Keine Verwaltung von BYOK-Keys, Billing oder Analytics in Obsilo
- **Automatisches Fallback auf andere Provider**: Kein stilles Umschalten bei Kilo-Fehlern
- **Vollautomatische anonyme Free-Model-Nutzung**: separate Produktentscheidung erforderlich
- **Nicht-LLM Kilo Plattformfeatures**: Keine Team-Administration, Notifications oder Plattform-UI in Obsilo
- **Komplette Kilo-Modus-Orchestrierung**: Nur optionale `kilo/auto`-Hints, keine tiefe Kilo-spezifische Workflow-Abbildung

## Dependencies & Risks

### Dependencies
- **OpenAiProvider Pattern** (`src/api/providers/openai.ts`): Gateway ist OpenAI-kompatibel und soll dieses Pattern wiederverwenden oder eng daran anlehnen
- **SafeStorageService** (`src/core/security/SafeStorageService.ts`): Token und Kontexte muessen sicher gespeichert werden
- **ModelConfigModal** (`src/ui/settings/ModelConfigModal.ts`): Kilo-Login, Status und Modellauswahl muessen integriert werden
- **SemanticIndexService** (`src/core/semantic/SemanticIndexService.ts`): Fuer Embedding-Support ist der bestehende API-Pfad zu erweitern

### Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Device-Auth-Flow aendert sich | M | M | Auth-Service kapseln, Endpunkte zentral halten |
| Organisationskontext falsch oder veraltet | M | H | Explizite Auswahl, sichtbarer Status, Reset/Disconnect |
| Embeddings sind nicht voll kompatibel | M | M | Spike vor finaler Freigabe, Feature separat schaltbar |
| Free Models und Auth-Modelle sind fuer User unklar | M | L | Klares UI-Wording und Statushinweise |
| Regression im OpenAI-kompatiblen Pfad | L | H | Kilo-spezifische Konfiguration isolieren, Regressionstests |

## Technical Debt

Keiner geplant -- MVP basiert auf bestehender OpenAI-kompatibler Architektur und fuehrt nur die noetigen Kilo-spezifischen Erweiterungen ein.
