---
id: FEAT-24-06
title: Lazy-Loading von Tool-Schemas -- Built-in (FEATURE-1600 erweitern) + MCP-Tools deferred
epic: EPIC-24
priority: P1
date: 2026-05-12
related: RESEARCH-36
adr-refs: [ADR-117]
plan-refs: []
depends-on: []
---

# FEAT-24-06: Lazy-Loading von Tool-Schemas (Built-in + MCP)

## Description

MCP-Tool-Schemas defaultseitig deferred: per-Server-Katalog (Server -> Tool-Namen + Kurzbeschreibungen) im stabilen System-Prompt statt voller Schemas im `tools`-Feld; volles Schema on-demand via `find_tool`/`enable_mcp_tool` (gleicher `activateDeferredTool`-Pfad wie deferred Built-ins, FEATURE-1600-Pattern auf MCP ausgeweitet); Opt-out pro Server. Built-in-Default-Satz weiter slimmen (mehr `deferred`-Flags) ist der kleinere, separate Teil. Setzt ADR-117 um.

Quelle: RESEARCH-36 Abschnitt 8 Hebel B; MCP-Anteil ist der eigentliche Hebel (volle MCP-Schemas heute bei jedem Call, kein Deferral). Architektur: ADR-117. Vor /coding: `tools`-Feld-Token-Log in `logInputBreakdown` zur Messung des realen Umfangs mit verbundenen MCP-Servern.

## Success Criteria

`[AWAITING RE]` -- Richtwert: mit verbundenen MCP-Servern bleibt das `tools`-Feld im Normalfall klein (nur Built-in-Default-Satz + Katalog); ein konkretes MCP-Tool wird bei Bedarf ueber `find_tool` aktiviert; Opt-out pro Server funktioniert; messbarer Rueckgang von `toolSchemas`-Tokens im `[InputBreakdown]` bei MCP-Setups.
