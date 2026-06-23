---
id: FEAT-33-02
title: Lookup-Action mit Preview-Block
epic: EPIC-33
subtype: user-facing
priority: P0
effort: M
asr-refs: []
adr-refs: []
depends-on: [FEAT-33-01]
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# Feature: Lookup-Action mit Preview-Block

## Feature description

Lookup erklaert einen markierten Begriff oder eine markierte Phrase direkt im Editor. Der Output erscheint als read-only Preview-Block unterhalb der Selection (Notion-Pattern) und bleibt so lange sichtbar, bis der User ihn per Insert-below uebernimmt, kopiert oder verwirft. Die Note selbst wird nicht beruehrt, bis der User explizit Insert-below waehlt. Wenn die Vault-Knowledge-Integration aktiv ist (geliefert ueber FEAT-33-09), erweitert der Block den Erklaerungstext um einen Tooltip mit verlinkten Vault-Quellen.

Das Feature schliesst die Luecke fuer den haeufigsten Inline-Job aus der BA: kurz nachschlagen, was ein Begriff im Lesefluss bedeutet, ohne in den Sidebar zu wechseln. Es hilft Persona P1 (Power-User-Wissensarbeiter) damit, Lese- und Schreibflows mit AI-Recherche zu verbinden, ohne den Editor-Kontext zu verlieren.

## Benefits hypothesis

We believe das Anbieten einer Inline-Lookup-Action mit Preview-Block
delivers Persona P1 eine 5-Sekunden-Erklaerung markierter Begriffe inklusive optionaler Vault-Quellen, ohne Tab- oder Sidebar-Wechsel.
We know we are successful when innerhalb von 90 Tagen post-release mindestens 30 Prozent der weekly-active Inline-User Lookup mindestens einmal pro Woche ausloesen und mindestens 40 Prozent der Lookup-Aufrufe mit Insert-below, Copy oder einer Folge-Aktion enden (kein Discard).

## Jobs to be Done

| Job Type | Job Description | Address in Story |
|---|---|---|
| Functional | Begriff im Text verstehen, ohne Tab oder Sidebar zu wechseln | US-01 |
| Functional | Vault-eigene Definition oder fruehere Erwaehnung als Quelle sehen | US-02 |
| Emotional | "Mein Agent ist im Text verfuegbar, nicht nur im Sidebar" | US-01, US-03 |
| Social | "Mein Plugin kann das, was Notion AI Explain this kann" | US-01 |

## User stories

- **US-01 (Functional, P0):** Als Wissensarbeiter mit markiertem Begriff im Editor moechte ich Lookup ueber das Floating-Menu oder die Command-Palette ausloesen, damit ich eine kurze Erklaerung als Preview-Block unter meiner Selection erhalte, ohne den Cursor zu verlieren.
- **US-02 (Functional, P0):** Als Wissensarbeiter mit aktivierter Vault-Knowledge-Integration moechte ich im Lookup-Block einen Hinweis auf verwandte Vault-Notes sehen, damit ich erkenne, dass meine eigene Wissensbasis den Begriff bereits behandelt, und die Quellen per Klick oeffnen kann.
- **US-03 (Emotional, P1):** Als Wissensarbeiter im Lese-Mode moechte ich Lookup auf einer markierten Stelle ausloesen koennen, ohne den Sidebar oeffnen zu muessen, damit ich im Lesefluss bleibe und das Erlebnis sich wie eine native Editor-Erweiterung anfuehlt.

## Success criteria

| ID | Criterion | Target | Measurement |
|---|---|---|---|
| SC-01 | Lookup startet auf markiertem Text und zeigt eine Erklaerung unterhalb der Selection als read-only Block an | 100 Prozent der Lookup-Aufrufe rendern den Block unter der Selection, kein Schreibzugriff auf die Note vor Insert-below | Manueller Akzeptanztest pro Editor-Mode plus telemetrie-gestuetzte Erfolgsquote in Beta-Phase |
| SC-02 | User kann den Preview-Block uebernehmen, kopieren oder verwerfen | Drei Aktionen verfuegbar (Insert-below, Copy, Discard), jede in einem Klick erreichbar | Manueller Test, Bestaetigung dass Discard die Note unveraendert laesst |
| SC-03 | Erste Tokens der Erklaerung erscheinen schnell genug fuer Lesefluss | Median Time-to-first-token unter 1.5 Sekunden, p95 unter 3 Sekunden | Telemetrie ueber Beta-User, gemessen vom Selection-Trigger bis zum ersten gerenderten Token |
| SC-04 | Lookup-Aufruf auf grosser Selection schuetzt den User vor unbeabsichtigten Kosten | Confirm-Dialog erscheint ab Selection-Laenge oberhalb der konfigurierten Schwelle, Default deutlich grosszuegig fuer normale Begriffe | Akzeptanztest mit kurzer Selection (kein Dialog) und langem Absatz (Dialog erscheint) |
| SC-05 | Vault-Quellen werden angezeigt, wenn die Vault-Knowledge-Integration verfuegbar und aktiv ist | Tooltip oder Sektion im Preview-Block listet relevante Vault-Notes mit Klick zum Oeffnen, fehlt wenn Integration aus | Akzeptanztest mit aktivierter und deaktivierter Integration |

## Technical NFRs

| Category | Target | Notes |
|---|---|---|
| Performance | Time-to-first-token Median unter 1500 ms, p95 unter 3000 ms; Stream rendert kontinuierlich bis EOS | TaskRouter weist Lookup dem Haiku-Tier zu (Cost-Routing), Streaming via Provider-SDK |
| Performance | Confirm-Dialog ab Selection-Laenge groesser 500 Zeichen | Default-Wert konfigurierbar in EPIC-33-Settings, verhindert versehentliche Aufrufe auf ganze Absaetze |
| Security | Lookup darf die markierte Note nicht modifizieren, bevor der User Insert-below klickt | Preview-Block lebt als CodeMirror-Decoration, nicht als persisted Note-Content |
| Bot-Compliance | Kein direct fetch, kein innerHTML, kein direkter element.style-Mutation, kein require ausserhalb Allowlist | Render ueber Obsidian DOM-API (createEl, createDiv, appendText), CSS-Klassen statt Inline-Style |
| Sidebar-Independence | Aktion laeuft mit geschlossenem Chat-Sidebar identisch wie mit offenem | Render-Pfad liegt im Editor, AgentTask wird ohne Sidebar-View instanziiert |
| Internationalization | Plugin-UI bleibt englisch (Action-Label, Buttons, Confirm-Dialog) | siehe feedback_ui_language_and_naming |
| Latency budget | Confirm-Dialog plus Spinner-Setup unter 100 ms ab Trigger | Lookup-Tool-Path darf keine synchrone Vault-Index-Initialisierung vor dem ersten Token blockieren |

## Architecture considerations

### Architecturally Significant Requirements

| ID | Classification | Constraint | Why ASR | Impact | Quality attribute |
|---|---|---|---|---|---|
| ASR-01 | CRITICAL | Lookup muss bei geschlossenem Chat-Sidebar denselben Output-Pfad nutzen wie bei offenem Sidebar | Cross-FEAT-Constraint Sidebar-Independence aus EPIC-33; Hauptrisiko fuer Lese-Mode-Workflow | Erfordert Editor-internen Render-Pfad und sidebar-unabhaengige AgentTask-Instanziierung | Usability, Availability |
| ASR-02 | CRITICAL | Settings-Snapshot (Modell, Skills, Prompts, Provider) wird zum Trigger-Zeitpunkt aus dem Main-Chat-State gelesen und fuer den Lookup-Lauf eingefroren | Cross-FEAT-Constraint Settings-Snapshot; verhindert dass Settings-Aenderungen waehrend Streaming zu inkonsistenten Outputs fuehren | Snapshot-Helper fuer alle Inline-Actions sinnvoll, Architektur fuer Settings-Read-Path | Consistency, Predictability |
| ASR-03 | MODERATE | TaskRouter routet Lookup standardmaessig auf Haiku-Tier | Cost-aware Tier-Routing aus EPIC-33; Lookup soll guenstig bleiben, damit haeufige Aufrufe nicht abschrecken | Tier-Mapping in TaskRouter um Lookup-Intent erweitern, Per-Action-Pin (FEAT-33-10) ueberschreibt | Cost-Efficiency |
| ASR-04 | MODERATE | Preview-Block rendert via CodeMirror-Decoration unterhalb der Selection-Range, ohne den Editor-Inhalt zu mutieren | Notion-Pattern aus RESEARCH-EPIC-33; verhindert dass Undo den Note-Inhalt beruehrt | Erfordert CodeMirror-View-Plugin oder Widget-Decoration, Lifecycle gekoppelt an Editor-View-Lifecycle | Usability, Maintainability |

### Constraints

- Obsidian Editor laeuft in Source-Mode, Live-Preview und Reading-Mode. Lookup muss in allen drei Modi funktionieren (Hypothese H-05 aus BA).
- Preview-Block ist read-only. Insert-below ist die einzige Aktion, die den Note-Inhalt aendert, und nutzt dann den existierenden Editor-Write-Pfad mit Refresh ueber `refreshOpenMarkdownViewsFor` (FIX-01-07-03-Pattern).
- Vault-Knowledge-Integration ist optional und wird erst durch FEAT-33-09 verfuegbar. Bis dahin liefert Lookup nur Modell-Output ohne Quellen-Sektion. Das Feature darf hier nicht von FEAT-33-09 hart abhaengen.
- Bot-Compliance gilt fuer Render und Style. Keine fetch-Calls (provider-SDK oder requestUrl), kein innerHTML, kein require ausser Allowlist.

### Open questions for architect

- Welche CodeMirror-Decoration-Strategie passt am besten zum Preview-Block (Widget-Decoration unter der Selection-Line vs. eigener View-Plugin-Layer)? Spike im Rahmen von H-05 prueft Layout-Stabilitaet bei Live-Preview und Reading-Mode.
- Wie strukturiert sich der Settings-Snapshot, damit FEAT-33-01 (Hotkey-Schicht), FEAT-33-02 (Lookup), FEAT-33-03 (Rewrite) und folgende denselben Snapshot-Helper teilen?
- Wo wandert der Confirm-Dialog-Threshold ein (globales EPIC-33-Setting vs. per-Action-Override via FEAT-33-10)?
- Verhalten bei Reading-Mode: lebt der Preview-Block dort als HTML-Overlay statt CodeMirror-Decoration? Spike-Outcome entscheidet.

## Definition of Done

### Activation Path (mandatory)

- **Type:** UI-element plus command
- **Identifier:** Floating-Menu-Eintrag `Lookup` auf aktiver Selection; Command-Palette `Vault Operator: Lookup selection`
- **Where it lives:** Editor-Inline-Action-Registry (geliefert in FEAT-33-01) plus neuer Lookup-Handler im Inline-Action-Modul; ARCHITECTURE.map-Konzept `InlineActions / Lookup`
- **How a user reaches it:** User markiert Text im Editor (Source-Mode, Live-Preview oder Reading-Mode) und klickt im Floating-Menu auf `Lookup`, oder oeffnet die Command-Palette und waehlt `Vault Operator: Lookup selection`. Optionaler User-konfigurierter Hotkey via Obsidian-Hotkey-Settings.

### Functional checklist

- [ ] Lookup erscheint als Eintrag im Floating-Menu auf aktiver Selection
- [ ] Lookup erscheint in der Command-Palette unter dem Plugin-Prefix
- [ ] Preview-Block rendert unterhalb der Selection und bleibt sichtbar bis User-Aktion
- [ ] Insert-below, Copy und Discard funktionieren wie spezifiziert
- [ ] Discard entfernt den Block und laesst die Note unveraendert
- [ ] Streaming-Output rendert kontinuierlich, kein Block-and-wait-Verhalten
- [ ] Confirm-Dialog ab Selection-Laenge groesser als die konfigurierte Schwelle
- [ ] Lookup laeuft in Source-Mode, Live-Preview und Reading-Mode

### Quality checklist

- [ ] **Sidebar-Independence verifiziert:** Lookup laeuft mit geschlossenem Chat-Sidebar identisch zum offenen Zustand (manueller Test mit beiden Zustaenden, beide grafisch belegt)
- [ ] Settings-Snapshot zum Trigger-Zeitpunkt: Modell und Provider werden aus dem Main-Chat-State gelesen, Aenderung waehrend Streaming aendert den laufenden Lauf nicht
- [ ] TaskRouter routet Lookup auf Haiku-Tier (oder konfiguriertes Per-Action-Pin), Logeintrag bestaetigt Tier
- [ ] Time-to-first-token Median unter 1500 ms in lokaler Messung
- [ ] tsc clean, ESLint clean
- [ ] Obsidian Community Plugin Review-Bot Rules eingehalten (keine fetch, kein innerHTML, kein element.style-Mutation, kein require ausserhalb Allowlist)
- [ ] Build und Deploy nach jedem Implementierungsschritt erfolgreich
- [ ] Tests: Unit-Tests fuer Lookup-Handler, Snapshot-Helper, Confirm-Dialog-Schwelle; Akzeptanztest pro Editor-Mode

### Documentation checklist

- [ ] FEATURE-Spec mit Code-Pointern aktualisiert (How-It-Works-Sektion nach Implementierung)
- [ ] Backlog-Row auf Done gesetzt mit Commit-SHA
- [ ] ARCHITECTURE.map-Eintrag `InlineActions / Lookup` ergaenzt
- [ ] User-facing Doku (docs/) um Inline-Action Lookup mit Screenshot
- [ ] Release-Notes-Eintrag in `docs/releases/v{next}.md`

## Hypothesis validation

Validiert H-05 aus der BA-Analyse (CodeMirror-Selection-API plus Obsidian-Editor-API tragen den Preview-Block-Output-Modus in allen drei Editor-Modi ohne State-Korruption).

- **Validierung Source-Mode:** Akzeptanztest mit markiertem Begriff, Preview-Block erscheint korrekt positioniert, Insert-below schreibt unter der Selection.
- **Validierung Live-Preview:** Akzeptanztest mit markiertem Begriff in gerendertem Block, Preview-Block respektiert Live-Preview-Layout.
- **Validierung Reading-Mode:** Akzeptanztest mit markiertem Begriff im Read-only-Editor, Preview-Block rendert als Overlay oder Layer-Decoration, keine Schreibversuche.

Falsifikationskriterium: Lookup laeuft in einem der drei Modi nicht stabil (Layout-Bruch, Editor-State-Korruption, Cursor-Sprung). In dem Fall wird das Render-Modell vor Welle 1 Release ueberarbeitet.

## Dependencies

- **FEAT-33-01** (Floating-Menu, Hotkey-Schicht, Action-Registry): Lookup registriert sich als Action ueber die in FEAT-33-01 gelieferte Registry und nutzt die Floating-Menu-Slot-API
- **TaskRouter** (`src/services/TaskRouter.ts`): Cost-Routing auf Haiku-Tier
- **AgentTask** (`src/core/AgentTask.ts`): Sidebar-unabhaengige Instanziierung muss bestaetigt sein (Pruefung im Spike H-05)
- **Refresh-Helper** (`src/core/utils/refreshMarkdownView.ts`): nur fuer Insert-below benoetigt, FIX-01-07-03-Pattern
- **Settings-Snapshot-Helper** (neu, gemeinsam fuer Inline-Actions): liefert eingefrorenen Settings-State zum Trigger-Zeitpunkt

## Assumptions

- FEAT-33-01 liefert eine stabile Action-Registry, in die sich Lookup einklinken kann
- CodeMirror-Decoration-API erlaubt Widgets unterhalb einer Selection-Range, ohne den Editor-Inhalt zu mutieren (Spike H-05 bestaetigt vor Implementierung)
- Haiku-Tier-Modelle sind in allen Default-Providern verfuegbar oder die TaskRouter-Fallback-Logik wirkt
- Vault-Knowledge-Integration (FEAT-33-09) liefert ein optionales Modul mit klar abgegrenztem Interface; Lookup pruegt das Feature auf Abwesenheit ohne Crash

## Out of scope

- Vault-Knowledge-Integration-Implementierung (eigenes Feature FEAT-33-09)
- Floating-Menu-Implementierung, Hotkey-Layer und Action-Registry (FEAT-33-01)
- Per-Action-Pin fuer Modell, Skill oder Provider (FEAT-33-10)
- Send-to-Main-Chat-Verhalten (FEAT-33-04)
- Rewrite-Action mit Inline-Diff (FEAT-33-03)
- Persistierung von Lookup-Historie (kein Eintrag in History-DB; lookup-only ist ephemer)
- Multi-Selection oder multi-block Lookup
- Definitions-Glossar im Vault automatisch pflegen

## Code Pointer

- ARCHITECTURE.map concept: `InlineActions / Lookup`
- Erweiterung der Inline-Action-Registry aus FEAT-33-01: neuer Eintrag `lookup` mit Tier-Hint, Render-Adapter und Confirm-Threshold
- Render-Adapter: CodeMirror-Widget-Decoration unter Selection-Range; Read-only-Container mit Buttons `Insert below`, `Copy`, `Discard`
- TaskRouter-Mapping: `lookup` -> Tier `haiku` (Default), Per-Action-Pin via Settings (kommt mit FEAT-33-10)
- Insert-below-Pfad nutzt den existierenden Editor-Write-Pfad plus `refreshOpenMarkdownViewsFor` (`src/core/utils/refreshMarkdownView.ts`)
