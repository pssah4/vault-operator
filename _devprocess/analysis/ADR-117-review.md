---
id: ADR-117-review
date: 2026-05-13
trigger: mid-course-design-discovery during /coding for FEAT-24-06
verdict: ADR-117 superseded by ADR-118
---

# ADR-117 Review: Codebase-Reconciliation

## Was ADR-117 annimmt

Zentrale Praemisse: "MCP-Tools werden beim Server-Connect als regulaere
Tools registriert (`ToolRegistry.registerMcpTool`), ihre vollen Schemas
landen bei jedem Call im `tools`-Feld." Loesungsweg: MCP-Tools defaultseitig
als deferred behandeln, per-Server-Katalog in den stabilen System-Prompt-
Block ziehen, on-demand-Aktivierung via `find_tool` / `enable_mcp_tool`.

## Was der Code zeigt

1. **`ToolRegistry.registerMcpTool` ist ein TODO-Stub.**
   [ToolRegistry.ts:318-322](src/core/tools/ToolRegistry.ts#L318-L322):
   ```typescript
   registerMcpTool(serverName, toolName, tool) {
       // TODO: Phase 6 - MCP integration
       this.register(tool);
   }
   ```
   `grep -rn "registerMcpTool" src/` liefert nur die Definition. Kein Caller.
   MCP-Tools werden NICHT in die Tool-Registry geschrieben.

2. **MCP-Bruecke ist ein einziges Built-in.**
   `use_mcp_tool(server_name, tool_name, arguments)` in
   [UseMcpToolTool.ts](src/core/tools/mcp/UseMcpToolTool.ts) ist als
   regulaeres Tool registriert. Sein input_schema ist klein und
   generisch (drei String-/Object-Properties). Alle MCP-Tool-Calls
   laufen ueber dieses eine Tool; die echten MCP-Tool-Namen + Argumente
   sind nur Strings im Tool-Call, kein eigenes Schema.

3. **MCP-Tool-Liste liegt bereits im stabilen Cache-Block.**
   [systemPrompt.ts:194-216](src/core/systemPrompt.ts#L194-L216):
   Section 4 (TOOLS, inkl. MCP-Listung aus `mcpClient.getAllTools()`)
   liegt **vor** Section 8b (Skill Directory) und damit **vor**
   `CACHE_BREAKPOINT_MARKER` (Section 9 ist der erste volatile Block).
   Die heutige Listung
   [prompts/sections/tools.ts:38-60](src/core/prompts/sections/tools.ts#L38-L60)
   rendert pro MCP-Tool eine Zeile `server: tool_name -- description`.

## Folgerung

Das von ADR-117 adressierte Problem existiert in dieser Form nicht:

- Es gibt **kein** verbosen MCP-Schema-Block im `tools`-Feld. Der MCP-
  Anteil im `tools`-Feld ist genau das eine `use_mcp_tool`-Schema (klein).
- Der "per-Server-Katalog im stabilen Block" ist bereits umgesetzt
  (Section 4, vor Cache-Breakpoint -- via FEAT-24-01 / ADR-62-Amendment).

Was wirklich Token kostet, ist nicht das `tools`-Feld, sondern:

- (P1) Die **Tool-Descriptions in der MCP-Listung** in Section 4 koennen
  pro Tool beliebig lang sein (kein Cap). Ein verbose-MCP-Server (z.B.
  Notion mit langen JSON-Schema-Beispielen in der Description) kann den
  stabilen Block deutlich aufblaehen.
- (P2) Der **Built-in-Default-Satz im `tools`-Feld** kann noch geslimmt
  werden (mehr `deferred`-Flags in `toolMetadata.ts`). FEATURE-1600 hat
  die specialised Tools schon erledigt; ein zweiter Pass kann weitere
  selten genutzte Built-ins flaggen. Kleinerer Hebel.

Das von ADR-117 versprochene "Verzeichnis im stabilen Block + Detail
on-demand"-Pattern ist trotzdem anwendbar, aber auf die richtigen Posten:
P1 (Description-Cap + neues `read_mcp_tool(server, tool)` fuer die volle
Beschreibung und das InputSchema-Summary) und P2 (Built-in-Review).

## Entscheidung

ADR-117 -> **Superseded by ADR-118**. ADR-118 dokumentiert die echte
Architektur und liefert den scope, der jetzt machbar ist (P1 + P2).
FEAT-24-06 wird auf den neuen scope umgehaengt; SC werden konkretisiert.

ADR-117 selbst bleibt als historischer Eintrag erhalten und wird nicht
geloescht (Append-only-Konvention).
