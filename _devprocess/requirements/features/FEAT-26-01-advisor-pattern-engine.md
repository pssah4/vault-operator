---
id: FEAT-26-01
title: Advisor-Pattern Engine
epic: EPIC-26
priority: P0
date: 2026-05-15
related: BA-27, RESEARCH-36
adr-refs: [ADR-115]
plan-refs: []
depends-on: [FEAT-26-02]
---

# FEAT-26-01: Advisor-Pattern Engine

## Description

Der Hauptloop des Agenten läuft per Default auf dem mid-Tier-Modell des aktiven Providers (typisch Sonnet 4.6). Wenn der Agent eine schwierige Synthese, Architektur-Vergleich oder kreative Eskalation benötigt, ruft er auf eigene Initiative das neue Built-In-Tool `consult_flagship` mit einem Pflicht-Schema (problem, relevant_context, failed_attempts, constraints). Das Tool spawnt einen Subagenten auf dem flagship-Tier-Modell mit hartem 3000-Token-Budget, gibt nur Text zurück und kostet einen einzelnen Flagship-Call statt einen Loop-weiten Modell-Wechsel.

Per-Task-Limit ist 3 Advisor-Calls. Bei `consecutiveMistakes >= 2` injiziert das Plugin einen Prompt-Reminder ("you might consider consult_flagship for this problem"), erzwingt aber keinen automatischen Call. Wenn kein flagship-Tier-Slot belegt ist, wird das Tool nicht registriert (No-Op vermieden).

Subtasks aus `new_task` erben das Tier-Pair des Parents. Das research-Profile aus FEAT-24-04 läuft auf fast-Tier (Tier-Override pro Profile).

Quelle: BA-27 Hypothesis Statement + Sektion 7.1 Welle 1. EnBW Cowork `consult-advisor-tool.ts`. QA-Decision 1 + 6 (Issue #319).

## Benefits Hypothesis

Strategie- und Recherche-Chats bestehen zu ~85 % aus reiner Text-Generierung, die ein mid-Tier-Modell qualitativ liefern kann. Die restlichen ~15 % brauchen einen Flagship-Call für einen bestimmten Sub-Step, nicht den ganzen Loop. Wenn der Agent diesen Bedarf selbst erkennt und gezielt eskaliert, sinken die Kosten pro Session um 70-80 % ohne Qualitätsverlust.

## User Stories

- **US-01-01 (P1 Sebastian, JTBD-1):** Als Plugin-Maintainer möchte ich, dass der Agent für Strategie-Diskussionen automatisch auf dem günstigeren Modell läuft, ohne dass ich pro Chat manuell umstellen muss, damit ich Kosten reduziere ohne Qualitätsverlust.
- **US-01-02 (P1 Sebastian, JTBD-2):** Als Plugin-Maintainer möchte ich, dass der Agent bei schwierigen Synthese-Schritten selbst das stärkere Modell eskaliert, damit ich nicht den ganzen Loop teuer fahren muss.
- **US-01-03 (P3 Enterprise, JTBD-6):** Als Enterprise-User möchte ich nachvollziehen können, wann der Agent das stärkere Modell genutzt hat, damit ich Audit-Trails führen kann.

## Success Criteria

1. Strategie-Chats laufen standardmäßig auf einem schlankeren Modell als heute (Hauptloop-Tier ist konfigurierbar, Default mid). Kein User-Eingriff für Routing nötig.
2. Wenn der Agent auf eine schwierige Anfrage stößt, kann er den Eskalations-Pfad selbständig nutzen und erhält eine kompakte Text-Antwort des stärkeren Modells zurück.
3. Pro Task ist die Anzahl der Eskalations-Calls auf maximal 3 begrenzt. Bei Erreichen des Limits erhält der Agent eine Tool-Result-Meldung "advisor budget exhausted for this task" und kann das Tool nicht mehr rufen.
4. Wenn kein stärkeres Modell verfügbar ist (Tier-Slot leer), ist das Eskalations-Tool gar nicht erst sichtbar für den Agenten.
5. Nach 2 aufeinanderfolgenden Fehlern (Tool-Errors, Parse-Errors) erscheint im Prompt ein Hinweis, dass der Agent das Eskalations-Tool nutzen könnte. Der Hinweis ist eine Empfehlung, kein erzwungener Call.
6. Subtasks erben die Tier-Zuordnung des Parents. Das research-Profile aus FEAT-24-04 läuft explizit auf dem schnellsten Tier.
7. Bei explizitem User-Override im Chat (Welle 5, FEAT-26-05) wird das Eskalations-Tool für den Turn deaktiviert. Der Agent bekommt das Tool nicht gezeigt.
8. Das Telemetrie-Log zeigt pro Session: Anzahl Eskalations-Calls, durchschnittliche Token-Größe pro Call, Tool-Antwort-Erfolg.

## Technical NFRs

- **Performance:** Eskalations-Call darf den Loop nicht blockieren, läuft als Subtask-Pattern (analog FEAT-24-04 research-Profile). Max-Tokens für den Subagenten hart auf 3000 gekappt (Tool-Schema-Constraint, nicht nur Konvention).
- **Robustness:** Bei Subtask-Fehler (Auth-Error, Rate-Limit, Build-Error) wird ein klares Tool-Result zurückgegeben (`advisor unreachable: <reason>`), der Hauptloop läuft weiter ohne Crash.
- **Cost-Awareness:** Per-Task-Counter wird in `AgentTask.state` gehalten. Reset pro Task-Start.
- **Cache-Hygiene:** Eskalations-Call darf den Hauptloop-Cache nicht invalidieren (separater API-Handler, separater Cache-Prefix).
- **Tool-Schema:** Pflicht-Felder `problem`, `relevant_context`, `failed_attempts`, `constraints` mit Längen-Limits (z.B. 1500 chars für problem, 500 chars für constraints), damit der Agent gezwungen ist, die Frage zu kondensieren.
- **Audit-Trail:** Eskalations-Calls werden im `[Cost]`-Log und `[CacheStat]`-Log explizit als `model=advisor(<flagship-id>)` markiert.

## ASRs (Architecturally Significant Requirements)

- **ASR-CRIT-01:** Tier-Pair-Resolution zur Task-Startzeit muss deterministisch und cache-freundlich sein. Wechsel des Hauptloop-Modells während einer Task ist nicht erlaubt.
- **ASR-CRIT-02:** Tool-Registration ist dynamisch (`consult_flagship` registriert nur wenn flagship verfügbar). Mode-Tool-Group-Map und SystemPrompt-Tool-Section müssen das berücksichtigen.
- **ASR-MOD-01:** Eskalations-Counter muss pro Task isoliert sein. Subtasks teilen den Counter nicht mit Parent.
- **ASR-MOD-02:** Tool-Schema-Validation muss harte Längen-Limits durchsetzen (provider-seitige JSON-Schema, nicht nur Runtime-Check).

## Definition of Done

- [ ] `consult_flagship`-Tool als BaseTool implementiert, registriert in TOOL_METADATA und TOOL_GROUP_MAP (agent-Gruppe)
- [ ] Tool-Schema mit 4 Pflicht-Feldern und Längen-Limits
- [ ] Hauptloop-Default-Tier auf "mid" umgestellt (neues Setting `defaultMainModelTier`)
- [ ] Per-Task-Limit von 3 Calls implementiert mit klarer Tool-Error-Meldung
- [ ] Prompt-Reminder bei `consecutiveMistakes >= 2`
- [ ] Tool-Registration konditional auf Tier-Slot-Belegung
- [ ] Subtask-Tier-Inheritance + research-Profile-Override
- [ ] Telemetrie-Counter im `[Cost]`-Log
- [ ] Bei expliziter User-Override im Chat: Tool deaktiviert für den Turn
- [ ] Tests: Tool-Schema-Validation, Limit-Erreichung, Tool-Disable bei fehlendem Tier, Reminder-Injection, Subtask-Inheritance
- [ ] Live-Messlauf [AWAITING RE]: Eskalations-Verhalten in einem Strategie-Chat sichtbar

## Validation (Critical Hypothesis H-03)

H-03 sagt: Eskalations-Rate liegt zwischen 5-15 % der Auto-Chats. Validation in Beta-Phase via Telemetrie-Counter. Bei <5 %: Reminder-Schwelle senken oder Prompt-Guidance verschärfen. Bei >20 %: mid-Tier-Wahl prüfen oder Reminder-Schwelle erhöhen.

## Out-of-Scope

- Hard-Forward-Eskalation (Plugin ruft Tool ohne Agent-Zustimmung)
- Cross-Task-Eskalations-Counter (Per-Task ist genug)
- Eskalations-Caching (jeder Call ist eigenständig)
- Custom-Pair-Definition pro Mode (alle Modi nutzen das aktive Pair)
