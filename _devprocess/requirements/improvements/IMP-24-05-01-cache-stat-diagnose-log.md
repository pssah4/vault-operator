---
id: IMP-24-05-01
feature: FEAT-24-05
epic: EPIC-24
adr-refs: []
plan-refs: []
depends-on: [IMP-18-01-02]
created: 2026-05-12
---

# IMP-24-05-01: Per-API-Call Cache-Stat- und tools-Feld-Diagnose-Log

## Motivation

RESEARCH-36 brauchte fuer die Diagnose ein Per-API-Call-Signal: greift Prompt-Caching? wie gross ist das `tools`-Feld (inkl. MCP-Tool-Schemas)? Diagnose-Vorlaeufer fuer die spaetere Sidebar-Anzeige (FEAT-24-05) und Voraussetzung fuer die richtige Welle-2-Priorisierung von FEAT-24-06.

## Aenderung

- `src/api/logCacheStat.ts` (neu): pro API-Call-Ende eine `[CacheStat:<provider>]`-Zeile mit nonCached-/cacheRead-/cacheCreate-Tokens, Output, totalIn, hitRate, caching-Modus. In allen Providern verdrahtet ausser `chatgpt-oauth` (dort fuehrt das Usage-Handling in einer freien Funktion ohne `this.config`-Zugriff -- ggf. nachziehen).
- `src/core/utils/logInputBreakdown.ts`: zusaetzlich `toolSchemas=<tokens>t/<count>` aus `JSON.stringify(tools).length` -- macht den `tools`-Feld-Umfang sichtbar (dort tauchen MCP-Tool-Schemas auf, ADR-117 / FEAT-24-06). 3 Call-Sites in `AgentTask.ts` angepasst (`tools` statt `tools.length`).

Abgrenzung: deckt nur das Log, NICHT das `cached_tokens`-Wiring in `usage`-Chunk + Kostenrechnung der openai-Familie -- das bleibt IMP-18-01-02.

## Status

Code liegt aktuell uncommitted im Working-Tree (Build + Deploy ist durch). Beim /coding fuer Welle 1 committen oder vorab als `chore(diagnostics)`.
