---
id: FEAT-24-05
title: Sichtbarkeit -- Sidebar-Kosten-/Token-/Cache-Hit-Anzeige
epic: EPIC-24
priority: P1
date: 2026-05-12
related: RESEARCH-36
adr-refs: []
plan-refs: []
depends-on: []
---

# FEAT-24-05: Sidebar-Kosten-/Token-Anzeige

## Description

Live-Anzeige in der Sidebar: Input-/Output-Tokens getrennt, kumulativ pro Task, Cache-Hit-Rate (`cache_read_input_tokens / input_tokens`), Warnschwelle. Cowork `extractCacheStats` als Vorlage. Mittelfristig: OpenTelemetry-Spans pro Tool-Call (Cowork-Stil). Der Diagnose-Vorlaeufer ist IMP-24-05-01 (`logCacheStat.ts` + `tools`-Feld-Token in `logInputBreakdown`).

Quelle: RESEARCH-36 Abschnitt 8 Hebel I. Reine UI/Telemetrie, kein eigener ADR.

## Success Criteria

`[AWAITING RE]` -- Richtwert: waehrend eines laufenden Tasks zeigt die Sidebar In/Out-Tokens, kumulierte Kosten und Cache-Hit-Rate; bei Annaeherung an die Warnschwelle ein sichtbares Signal.
