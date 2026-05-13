---
id: FEAT-24-06
title: MCP-Listing-Cap + read_mcp_tool + Built-in deferred-Review
epic: EPIC-24
priority: P1
date: 2026-05-12
updated: 2026-05-13
related: RESEARCH-36
adr-refs: [ADR-118]
historical-adr-refs: [ADR-117]
plan-refs: [PLAN-21]
depends-on: []
---

# FEAT-24-06: MCP-Listing-Cap + read_mcp_tool + Built-in deferred-Review

## Description

Drei additive Aenderungen, die den stabilen System-Prompt-Praefix klein und
cache-vertraeglich halten und das `tools`-Feld weiter slimmen:

1. **MCP-Tool-Description-Cap** in der MCP-Listung (Section 4 des System-Prompts):
   pro Tool max. 200 chars Description, Rest mit Hinweis auf `read_mcp_tool`.
2. **Neues NICHT-deferred Tool `read_mcp_tool(server, name)`** (Gruppe `mcp`):
   liefert die volle Description und ein InputSchema-Summary als Tool-Result.
   Analog zum read_skill-Pattern aus FEAT-24-09 / ADR-116.
3. **Built-in `deferred`-Review**: zweiter Pass in `toolMetadata.ts`, weitere
   selten genutzte Built-ins als `deferred` flaggen. FEATURE-1600-Pattern.

Architektur: ADR-118. ADR-118 supersediert ADR-117 (siehe
[_devprocess/analysis/ADR-117-review.md](../../analysis/ADR-117-review.md))
nach Codebase-Reconciliation im /coding-Pivot 2026-05-13: ADR-117 nahm an,
MCP-Tools landen mit vollen Schemas im `tools`-Feld -- das stimmt nicht, MCP
laeuft ueber das eine `use_mcp_tool`-Built-in, die MCP-Listung liegt schon
im stabilen Praefix (Section 4, vor `CACHE_BREAKPOINT_MARKER` -- via FEAT-24-01).
Der reale Hebel ist die ungekappte Description in der Listung plus ein
weiterer Built-in-deferred-Pass.

Quelle: RESEARCH-36 Abschnitt 8 Hebel B.

## Success Criteria

1. **MCP-Listen-Cap greift**: in `prompts/sections/tools.ts` werden Descriptions
   laenger als 200 chars auf die ersten ~200 chars + Suffix
   `... [full description: read_mcp_tool({ server: "...", name: "..." })]`
   gekappt. Tools mit kuerzeren Descriptions bleiben unveraendert.
2. **`read_mcp_tool(server, name)`** liefert als Tool-Result einen Block mit
   Header `## MCP TOOL: <server>.<name>`, voller Description und einem
   kompakten InputSchema-Summary (property-Namen, Typen, required-Flags;
   keine vollen description/examples-Felder). Validiert Server gegen
   `activeMcpServers`-Whitelist und Tool-Name gegen die Server-Tool-Liste;
   Fehlerfall listet verfuegbare Tools.
3. **`read_mcp_tool` ist im Tool-Schema verfuegbar, wenn die `mcp`-Tool-Gruppe
   aktiv ist** (analog `use_mcp_tool`), Gruppe `mcp`, NICHT in
   `DEFERRED_TOOL_NAMES`. Nicht sichtbar in Modes ohne MCP-Gruppe.
4. **Built-in-deferred-Review**: mindestens die im PLAN-21 bestaetigten
   zusaetzlichen Built-in-Tools tragen `deferred: true` in `toolMetadata.ts`.
   `find_tool` findet sie weiterhin via Keyword.
5. **Bestehende Funktionalitaet unveraendert**: alle Tests vor dem Pivot
   bleiben gruen (Baseline 1424 auf dev). MCP-Tool-Calls ueber `use_mcp_tool`
   funktionieren wie bisher; `find_tool`-Pfad fuer Built-ins unveraendert.
6. **Live-Messlauf `[AWAITING RE]`**: in einer Vault-Session mit verbundenen
   MCP-Servern, deren Tools verbose Descriptions tragen, sinkt der
   `[SystemPrompt]`-Section-Char-Breakdown fuer Section 4 messbar; der
   `[InputBreakdown:main-loop] toolSchemas=...t/<count>` sinkt im Mass des
   Built-in-deferred-Reviews. Funktionsregression: keine; nicht autonom
   pruefbar, bleibt fuer manuelle Abnahme.
