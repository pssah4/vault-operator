# Finding: execute_vault_op -- MCP-Tool ohne Handler

> **Gefunden:** 2026-04-02
> **Priorität:** P2 (mittelfristig)
> **Kontext:** Faktencheck für Reddit-Post

---

## Problem

`execute_vault_op` ist als MCP-Tool definiert und wird im System-Prompt referenziert, hat aber **keinen funktionierenden Handler**. Ein Aufruf liefert `Unknown tool: execute_vault_op`.

## Betroffene Stellen

| Datei | Zeile | Was |
|---|---|---|
| `src/mcp/McpBridge.ts` | 80 | Tool-Definition (name, description, inputSchema) |
| `src/mcp/McpBridge.ts` | 383 | Referenz im System-Prompt an Claude |
| `src/mcp/tools/index.ts` | 19-26 | `handlers`-Map -- **execute_vault_op fehlt** |
| `src/mcp/tools/index.ts` | 153 | `buildHumanReadable` case existiert (Logging vorbereitet) |

## Kausale Kette

1. Tool ist in `TOOLS[]` definiert (McpBridge.ts:80) -- Claude sieht es als verfügbar
2. System-Prompt empfiehlt explizit: "Use search_vault, read_notes, write_vault, execute_vault_op" (McpBridge.ts:383)
3. Claude ruft `execute_vault_op` auf
4. `handleToolCall()` sucht in `handlers[tool]` -- kein Eintrag
5. Rückgabe: `{ content: [{ type: 'text', text: 'Unknown tool: execute_vault_op' }], isError: true }`

## Beschriebene Operationen (laut Tool-Definition)

> generate_canvas, update_frontmatter, create_base, search_by_tag, get_daily_note, execute_command, get_linked_notes

Diese Operationen existieren als interne Obsilo-Tools, aber es fehlt die MCP-Brücke, die sie von außen aufrufbar macht.

## Optionen

### A: Handler implementieren
- Neues File `src/mcp/tools/executeVaultOp.ts`
- Router-Pattern: `operation`-Parameter auf interne Tool-Aufrufe mappen
- Governance: gleiche Path-Validation + IgnoreService wie bei `write_vault`
- Vorteil: 7 MCP-Tools, breitere Remote-Fähigkeiten

### B: Tool entfernen
- Aus `TOOLS[]` in McpBridge.ts löschen
- Aus System-Prompt-Referenz entfernen
- `buildHumanReadable` case entfernen
- Vorteil: Kein toter Code, ehrliche 6 Tools

### C: Vorerst deaktivieren, später implementieren
- Aus `TOOLS[]` entfernen (Claude sieht es nicht mehr)
- Definition + Logging-Code als Kommentar oder in eigenem Branch behalten
- Vorteil: Kein Breaking Change für bestehende MCP-Nutzer (Tool war ohnehin defekt)

## Empfehlung

Option A wenn Remote-Nutzer Canvas/Frontmatter/Bases brauchen (wahrscheinlich ja).
Option B wenn MCP schlank bleiben soll.

Nicht im aktuellen Zustand lassen -- Claude wird das Tool aufrufen und Fehler bekommen.
