---
id: FIX-03-23-01
feature: FEAT-03-23
epic: EPIC-03
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-03-23-01: FEAT-03-23 falsch auf Done -- Onboarding-Memory-Step + Coach-Marks fehlen

## Symptom

FEAT-03-23 "Memory-UX, Onboarding und Settings-Migration" ist im
Backlog auf `Done/Released`, das Audit (REFLECTION-2026-05-03) hat
aber gezeigt:

- `OnboardingStep` enum
  ([src/core/memory/OnboardingService.ts](../../../src/core/memory/OnboardingService.ts))
  hat keinen `'memory'`-Schritt -- Hauptdeliverable von SC-02 fehlt.
- Inline Coach-Marks fuer Star-Button + mark_for_memory (SC-03) sind
  nicht implementiert.
- Wizard-Modal-Fallback bei v2.6.x->v2 Migration (SC-02) ist nur als
  silent `MemoryV2UpgradeOrchestrator` da, kein User-Choice-Modal.
- Mapping `autoExtractSessions`/`autoUpdateLongTerm` -> Memory-v2
  Konzepte (SC-01) nicht aufgespuert.
- Fehler-Code-Enum als Engine-Public-Konstanten (SC-04) fehlt.

Backlog-Row und Code-Realitaet driften auseinander.

## Was bekannt ist

- MemoryV2UpgradeOrchestrator macht v1->v2 Migration silent.
- Settings-Tab "Memory" zeigt Migration-Status, aber kein eigenstaendiger
  Onboarding-Step.
- Coach-Marks-Pattern existiert sonst nirgends im Plugin -- Neuland.

## Fix

Korrektur in zwei Schritten:

1. **Sofort**: Backlog-Status zurueck auf `Active/Building` (in
   diesem RE-Pass bereits geschehen).
2. **Implementierung** als separate Coding-Session: SC-02 (Onboarding-
   Step) als naechstes priorisieren, SC-03 (Coach-Marks) und SC-04
   (Fehler-Codes) als P3 vertagen falls UCM-Initiative das eh
   umstrukturiert.

## Regressions-Test

- OnboardingService-Test: nach Hinzufuegen des `'memory'`-Schritts
  bleibt die Default-Reihenfolge stabil.
- Migration-Test: bestehender silent-Pfad funktioniert weiter, der
  neue Choice-Modal ist optional opt-in.

## Definition of Done

- Backlog korrigiert.
- Onboarding `'memory'`-Step implementiert + Test.
- FIX-Row auf Done sobald SC-02 erledigt; SC-03 + SC-04 bleiben offen
  als getrennte IMP-Rows oder werden mit UCM-Initiative geloest.
