---
id: FEAT-24-07
title: Internes Hilfs-Modell-Routing fuer Agent-interne LLM-Calls
epic: EPIC-24
priority: P2
date: 2026-05-12
related: RESEARCH-36
adr-refs: [ADR-115]
plan-refs: []
depends-on: []
---

# FEAT-24-07: Internes Hilfs-Modell-Routing

## Description

Ein optionaler "Hilfs-Modell"-Slot in den Settings. Ist er gesetzt, laufen die Agent-internen LLM-Calls darauf: Condensing-Zusammenfassung (inkl. Emergency), Fast-Path-Such-/Lese-Planner, Fast-Path-Output-Presenter, `plan_presentation`, Recipe-Planner, ggf. Active-Skills-Klassifikator (entfaellt mit FEAT-24-09). Nicht gesetzt oder nicht erreichbar -> Haupt-Modell (Fallback, Verhalten wie heute). Setzt ADR-115 um.

Quelle: RESEARCH-36 Abschnitt 8 Hebel H. Architektur: ADR-115.

## Success Criteria

`[AWAITING RE]` -- Richtwert: bei gesetztem Hilfs-Modell zeigen die internen Calls (im `[Cost]`-Log sichtbar) das Hilfs-Modell statt des Haupt-Modells; bei leerem Slot oder Fehler unveraendertes Verhalten; keine Qualitaetsregression bei Condensing/Planner.
