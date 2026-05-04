---
id: FEAT-23-06
title: Memory-Profile-System (4+ Profile, Wiedervorlage)
epic: EPIC-23
priority: P1
date: 2026-05-03
related-bas: BA-26, BA-24
adr-refs: []
plan-refs: []
depends-on: [FEAT-23-01, FEAT-23-02, FEAT-23-04]
---

# FEAT-23-06: Memory-Profile-System (Wiedervorlage)

## Status

**Planned (Wiedervorlage)**. Aktivieren wenn EPIC-23 P0-Live-Use
zeigt, dass Source-Interface-Tagging als Differenzierung nicht
ausreicht.

## Trigger fuer Aktivierung

Mindestens einer der folgenden Live-Use-Befunde nach 2 Wochen
EPIC-23 P0:

- Sebastian filtert oft nach mehr als nur source_interface (z.B.
  "alles was mit EnBW zu tun hat aus allen Tools").
- Recall-Treffer werden zu unscharf, weil verschiedene Lebens-
  bereiche durcheinandergeraten (Coding-Insights tauchen in
  Personal-Recalls auf, etc.).
- Externer MCP-Client hat einen klaren Need fuer Profile-Routing
  (z.B. ChatGPT-Coding-Conversations sollen nie Personal-Memory
  beruehren).
- BA-24 Section 7.1 P0 KPI "min. 4 Profile" wird zur konkreten
  Anforderung fuer UCM-Public-Release.

## Description (Skizze)

Memory-Profile als Routing-Konzept fuer Facts und History-
Conversations. Default-Profile: `default`, `coding`, `personal`,
`quick-capture` (BA-24 Section 7.1 P0). Profile sind ein Tag pro
Fact / pro Conversation, orthogonal zu source_interface.

MCP-Tools werden um optionales `profile`-Argument erweitert
(default 'default'). RecallMemory + SearchHistory erhalten
optionalen Profile-Filter.

## Skizze Success Criteria

- SC-01: 4 Default-Profile + benutzerdefinierte Profile.
- SC-02: Profile-Filter in MCP-Tools aktiv.
- SC-03: UI fuer Profile-Verwaltung im Settings-Tab.
- SC-04: Migrations-Pfad: bestehende Facts ohne Profile gelten als
  'default'.

## Out of Scope

- LLM-basiertes Auto-Profile-Routing (waere weiterer Pfad).
- Per-Profile-Embedding-Centroids fuer schaerfere Topic-Locks.

## Verbindung zu UCM

Profile sind ein zentrales UCM-Konzept. Wenn UCM-Initiative startet,
wird FEAT-23-06 Teil der UCM-Roadmap. Bis dahin bleibt FEAT-23-06
als bewusst geparkt im Backlog mit klarem Trigger.
