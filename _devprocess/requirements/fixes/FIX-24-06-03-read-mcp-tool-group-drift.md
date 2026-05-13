---
id: FIX-24-06-03
feature: FEAT-24-06
epic: EPIC-24
adr-refs: [ADR-118]
plan-refs: []
audit-refs: []
depends-on: []
created: 2026-05-13
---

# FIX-24-06-03: read_mcp_tool nicht in TOOL_GROUP_MAP -- nicht im Schema, nicht aufrufbar

## Symptom

MESSLAUF Test 2 Teil B (Re-Verify nach FIX-24-06-01/02 Deploy):

```
User: Lade die volle Beschreibung des Tools icons8.search_icons ueber read_mcp_tool.

Agent (versuchte den Call ueber use_mcp_tool zu routen):
{
  "server_name": "icons8",
  "tool_name": "read_mcp_tool",
  "arguments": { "server": "icons8", "name": "search_icons" }
}

icons8 server response: "Unknown tool: read_mcp_tool"

Agent: "Das Tool read_mcp_tool ist leider nicht als aufrufbares Tool
verfügbar — es taucht zwar in der Dokumentation als Hinweis auf, ist
aber kein eigenständiges Tool in meinem aktuellen Toolset."
```

Das Modell sah `read_mcp_tool` im Tools-Section-Prompt-Hint
(`... [full description: read_mcp_tool(...)]`), aber kein
Tool-Schema -- es haelt den Namen daher fuer einen MCP-server-side
Tool und versucht ihn via `use_mcp_tool` zu routen.

## Root cause

`src/core/modes/builtinModes.ts:31`:

```ts
mcp:   ['use_mcp_tool'],
```

Bei FEAT-24-06 /coding (Welle 2) wurde `ReadMcpToolTool` korrekt
registriert (`ToolRegistry.ts:133`), aber der Eintrag in
`TOOL_GROUP_MAP.mcp` fehlt. Folge:
`ModeService.getToolDefinitions(mode)` filtert das Tool aus dem
Schema raus -- der Agent sieht das Schema nie.

Genau dasselbe Drift-Pattern wie BUG-021 / FIX-19-28 (vault_health_check,
ingest_document/deep/triage). Memory dazu existiert
(`feedback_tool_group_drift.md`), wurde aber beim /coding nicht
geprueft.

Hinweis zum Vergleich: `find_tool` und `read_skill` sind aus dem
gleichen Grund nicht im Schema, **werden aber per Hallucination
gerufen** -- ihre Namen sind einfacher und werden im Prompt sehr
prominent erwaehnt. `read_mcp_tool` klingt zu sehr wie ein MCP-server-
side Tool, daher wird der Call falsch geroutet statt halluziniert.
Dauerhafte Loesung: Schema-Eintrag.

## Fix

`src/core/modes/builtinModes.ts:31` -- `read_mcp_tool` der `mcp`-
Gruppe hinzufuegen:

```ts
mcp: ['use_mcp_tool', 'read_mcp_tool'],
```

`src/core/modes/__tests__/builtinModes.coverage.test.ts` -- neuer
Regression-Test:

```ts
it('assigns read_mcp_tool to the mcp group (FIX-24-06-03)', () => {
    expect(TOOL_GROUP_MAP.mcp).toContain('read_mcp_tool');
});
```

Plus `MUST_BE_REACHABLE`-Liste um `read_mcp_tool` erweitert, damit der
allgemeine Coverage-Check ihn pinnt.

## Followup (NICHT in diesem Fix)

`find_tool` und `read_skill` sind im gleichen Zustand
(`INTENTIONALLY_NOT_REACHABLE` im Coverage-Test, klappt nur weil
Modell sie halluziniert). Klappt aktuell -- aber fragil. Wenn ein
Model bei einer neuen Welle weniger gut hallucinated, brechen FEAT-
24-09 Skill-Loading und FEAT-1600 Deferred-Loading. Eigenes
FIX-Item / IMP-Item zu beraten.

## Regression test

Manueller Live-Check (MESSLAUF Test 2 Teil B nach Plugin-Reload):

1. Neuer Chat. Prompt "Lade die volle Beschreibung des Tools
   icons8.search_icons ueber read_mcp_tool."
2. Erwartet: Agent ruft `read_mcp_tool({server:"icons8", name:"search_icons"})`.
3. Antwort-Block enthaelt `## MCP TOOL: icons8.search_icons` +
   `**Description:**` + `**Input schema summary:**`.

## Status

Done 2026-05-13. 1478 Tests gruen (+1 fuer den neuen Coverage-Test).
lint: pre-existing security/detect-object-injection-Warning in
`expandToolGroups`, nicht durch diesen Fix verursacht. tsc clean,
build + deploy gruen.

Live-Verifikation nach Reload ausstehend.
