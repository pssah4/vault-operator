# Feature: Deferred Tool Loading

> **Feature ID**: FEAT-16-00
> **Epic**: EPIC-16 (Claude Code Pattern Adoption)
> **Priority**: P1
> **Effort Estimate**: M
> **Note**: Implementiert in Wave 2 (commit pending)
> **Quelle**: EPIC-16 Backlog, Claude Code `ToolSearchTool`-Pattern

## Feature Description

System-Prompt enthaelt heute vollstaendige Schemas aller registrierten Tools.
Bei 48 aktiven Tools (inkl. MCP) sind das ~30-40% des Prompt-Volumens, auch
wenn im konkreten Turn nur `read_file` + `edit_file` gebraucht werden.

Claude Code loest das via `ToolSearchTool`: nur Kern-Tool-Namen + Kurzbeschreibungen
stehen im Prompt, vollstaendige Schemas werden via Meta-Tool `ToolSearch` on-demand
nachgeladen.

Vault Operator-Adaption: **Kern-Tools** (Reading, Editing, Agent-Control) sind immer
im Schema. **Spezialisierte Tools** (Office-Creation, Excalidraw, Drawio, Canvas,
Base-Tools, Semantic-Search, Plan-Presentation, Ingest-Template, Evaluate-Expression)
werden als `deferred` markiert. Neues Meta-Tool `find_tool(query)` findet passende
Tools per Name/Description-Match und aktiviert ihre vollen Schemas fuer den Rest
der Session.

## User Stories

### Story 1: Schlanker Start-Prompt
**Als** Vault Operator-User mit grosser Modell-Latenz
**moechte ich** dass der erste API-Call nicht unnoetig gross ist wenn ich nur
schnell eine Datei lesen will
**um** Kosten und Latenz zu senken.

### Story 2: Spezialisierte Tools weiter verfuegbar
**Als** User der ein PPTX erstellen will
**moechte ich** dass der Agent das trotzdem kann, auch wenn create_pptx
nicht im initialen Schema ist
**um** kein Feature zu verlieren.

### Story 3: Transparenter Discovery
**Als** User
**moechte ich** dass der Agent mir sagt was er aktiviert hat
**um** nachvollziehen zu koennen wie er die Aufgabe angeht.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | System-Prompt ohne deferred tools ist ca. 30-40% kleiner | >=25% | Vergleich Token-Count bei rebuildPromptCache vor/nach |
| SC-02 | `find_tool("pptx")` aktiviert create_pptx + plan_presentation | 100% | Unit-Test |
| SC-03 | Aktivierte Tools bleiben fuer den Rest der Session im Schema | 100% | AgentTask-Integrationstest |
| SC-04 | Regressionstest: alle bestehenden Tool-Calls funktionieren wie vorher | Kein Regress | 343/343 Tests plus neue |
| SC-05 | Hard Tool-Filter (BUG-018) greift weiter: deferred + plugin-shadowed kombinieren sauber | Kein Regress | Unit-Test |

## Out of Scope

- Vollautomatische Tool-Suche per Embedding (heute: simple Text-Match).
- Deferred MCP Tools (bleiben wie heute, haben ihre eigene Auto-Discovery).
- Conditional Skills (FEAT-16-02) — separates Feature.
- Dynamische Laufzeit-Deferrierung (z.B. "entferne Tool nach N-Minuten nicht-Nutzung").

## Architektur

### Kern-Tools (immer im Schema)

| Gruppe | Tools |
|---|---|
| read | read_file, read_document, list_files, search_files |
| vault | semantic_search (semantic_search bleibt eigentlich drin weil Kern-Tool fuer Knowledge-Work) |
| edit | write_file, edit_file, append_to_file, update_frontmatter, create_folder, delete_file, move_file |
| agent | ask_followup_question, attempt_completion, switch_mode, update_todo_list, new_task, update_settings, configure_model |
| skill | execute_command, call_plugin_api, enable_plugin, execute_recipe |
| web | web_fetch, web_search |
| meta (neu) | **find_tool** |

### Deferred Tools (on-demand via find_tool)

| Gruppe | Tools |
|---|---|
| vault | generate_canvas, create_excalidraw, create_drawio, create_base, update_base, query_base |
| vault | create_pptx, create_docx, create_xlsx, plan_presentation |
| vault | get_linked_notes, open_note, get_daily_note, vault_health_check |
| agent | evaluate_expression, manage_skill, manage_source, manage_mcp_server, read_agent_logs |

### Meta-Tool `find_tool`

Input:
```typescript
{ query: string }  // e.g. "pptx", "diagram", "canvas", "base"
```

Behaviour:
1. Textsuche ueber TOOL_METADATA (name + label + description) mit einfachem
   Keyword-Match (lowercase, substring).
2. Gibt top-3 Matches mit Namen + Description zurueck.
3. Aktiviert die gefundenen Tools: `this.activatedDeferredTools.add(name)`
   pro Match, dann `invalidateToolCache()`.
4. Result-Format: "Activated N tools: X, Y, Z. They are now available
   in this session. See their schemas in the next turn."

### State im AgentTask

```typescript
// bisher:
let cachedTools: ToolDefinition[] = [];

// neu:
const activatedDeferredTools: Set<string> = new Set();
// wird beim rebuildPromptCache dazu-gemerged
```

`rebuildPromptCache` erweitert:
```typescript
cachedTools = modeService.getToolDefinitions(activeMode, { includeDeferred: false });
// dann: injiziere aktivierte deferred tools
for (const name of activatedDeferredTools) {
    const tool = toolRegistry.getTool(name);
    if (tool) cachedTools.push(tool.getDefinition());
}
cachedTools = filterShadowedBuiltins(cachedTools, enabledPluginIds);
```

### ToolRegistry

Neue Methode `getToolDefinitions({ includeDeferred?: boolean })`:
- `includeDeferred === true`: alle Tools (heute-Verhalten, fuer Tests + Settings-UI)
- `includeDeferred === false` (default in AgentTask): nur nicht-deferred Tools

Deferred-Status kommt aus TOOL_METADATA[name].deferred.

## Verifikation

1. Build: `npm run build` passiert.
2. Unit-Tests:
   - find_tool mit "pptx" aktiviert create_pptx + plan_presentation
   - find_tool mit unbekanntem Term gibt hilfreichen Fehler
   - getToolDefinitions({ includeDeferred: false }) hat ~30% weniger Tools
   - Aktivierte Tools bleiben in cachedTools nach rebuild
3. Integrationstest (manuell):
   - Fresh Chat, frage "Erstelle ein PPTX" -> Agent ruft find_tool, dann create_pptx.
   - Fresh Chat, frage "Liste mir die Top-Level-Ordner" -> Agent ruft read_file/list_files direkt, kein find_tool-Roundtrip.
