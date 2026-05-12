---
id: FEAT-24-02
title: History-Komprimierung -- Microcompaction der Tool-Results an Turn-Grenzen
epic: EPIC-24
priority: P0
date: 2026-05-12
related: RESEARCH-36
adr-refs: [ADR-12]
plan-refs: []
depends-on: []
---

# FEAT-24-02: History-Microcompaction

## Description

Wenn ein Turn abgeschlossen ist (kein `tool_use` mehr), die Tool-Results dieses Turns auf Skelette + Pointer eindampfen, bevor der naechste Turn startet (Volltext raus, `tool_use`/`tool_result`-Skelett + Referenz bleiben). Plus Rolling-Summary alter Turn-Bloecke als zweite Stufe. Stoppt den dominanten Wachstumstreiber (akkumulierende Tool-Results). Setzt ADR-12-Amendment um.

Quelle: RESEARCH-36 Befund C (dominanter Treiber). Architektur: ADR-12 (Amendment 2026-05-12, Microcompaction + Rolling-Summary).

## Success Criteria

`[AWAITING RE]` -- Richtwert: ein 4-Datei-Read-Turn endet bei ~48k Input-Tokens, der unmittelbar folgende Turn startet unter ~20k; ein 10-Turn-Chat bleibt im History-Anteil deutlich unter linearem Wachstum (gemessen via `[InputBreakdown]`); keine messbare Qualitaetsregression (Shadow-Mode / A-B).
