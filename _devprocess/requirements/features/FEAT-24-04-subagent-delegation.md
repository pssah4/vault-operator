---
id: FEAT-24-04
title: Subagent-Delegation fuer context-heavy Teilaufgaben (mit Per-Call-Token-Budget)
epic: EPIC-24
priority: P1
date: 2026-05-12
related: RESEARCH-36
adr-refs: [ADR-113]
plan-refs: []
depends-on: []
---

# FEAT-24-04: Subagent-Delegation

## Description

`new_task`/`spawnSubtask` prominent machen (im System-Prompt als empfohlenes Werkzeug fuer explorative/recherchierende Teilaufgaben), Agent-Profile (Recherche/Explore-Profil mit schlankem eigenem System-Prompt + eingeschraenkter Tool-Auswahl, analog Claude Codes `.claude/agents/`), hartes Per-Call-Token-Budget (Cowork-Advisor-Pattern), Prompt-Leitplanke (kein harter Router). Setzt ADR-113 um.

Quelle: RESEARCH-36 Abschnitt 8 Hebel E. Architektur: ADR-113.

## Success Criteria

`[AWAITING RE]` -- Richtwert: eine einfache Frage, die der Agent durch eine Recherche-Teilaufgabe beantwortet, laesst den Hauptkontext nur um die verdichtete Antwort wachsen, nicht um die N Such-/Lese-Zwischenstaende; ein Subtask-Aufruf, der das Per-Call-Budget ueberschreitet, bekommt einen Tool-Error mit Ist-/Soll und der Agent kuerzt.
