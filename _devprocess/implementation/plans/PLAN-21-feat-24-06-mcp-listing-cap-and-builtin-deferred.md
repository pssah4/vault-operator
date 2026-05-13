# PLAN-21: FEAT-24-06 / ADR-118 -- MCP-Listing-Cap + read_mcp_tool + Built-in deferred-Review

> Status: Implemented 2026-05-13
> Branch: `feature/feat-24-06-lazy-loading-tool-schemas` (off `dev`)
> Refs: FEAT-24-06, ADR-118, ADR-117 (superseded), ADR-08, ADR-53, ADR-62, ADR-116, FEATURE-1600, RESEARCH-36 Abschnitt 8 (Hebel B)
> Vorgaenger: PLAN-20 (FEAT-24-09 Active Skills on-demand, released auf `dev`)

---

## 1. Kontext

Nach dem /coding-Pivot 2026-05-13 (ADR-117 supersediert durch ADR-118 nach
Codebase-Reconciliation) liefert FEAT-24-06 die drei Aenderungen, die der
reale Code zulaesst und die FEATURE-1600-/ADR-116-Pattern weiter ausbauen:

1. **MCP-Tool-Description-Cap** in der MCP-Listung (Section 4, im stabilen
   Praefix-Block vor `CACHE_BREAKPOINT_MARKER`). Heute ist die Description
   pro MCP-Tool ungekappt. Ein verbose MCP-Server (lange JSON-Schema-Beispiele
   oder mehrzeilige Erklaerungen in der Description) kann den gecachten Block
   nennenswert aufblaehen. Cap: 200 chars pro Description, Rest mit Suffix
   `... [full description: read_mcp_tool({ server: "X", name: "Y" })]`.
2. **Neues NICHT-deferred Tool `read_mcp_tool(server, name)`** in der
   `mcp`-Tool-Gruppe. Liefert die volle Tool-Description und ein kompaktes
   InputSchema-Summary (nur property-Namen + Typen + required-Flags; keine
   vollen description-/examples-Felder, damit das Tool-Result selbst nicht
   zum neuen Bloat-Posten wird). Validierung: Server in `activeMcpServers`,
   Tool-Name in der Server-Tool-Liste; Fehlerfall listet verfuegbare Tools.
   Analog zu `read_skill` aus FEAT-24-09 / ADR-116.
3. **Zweiter Built-in `deferred`-Pass** in der zentralen Tool-Metadata.
   FEATURE-1600 hat die specialised Tools (Office-Formate, Diagram-Creators,
   Base-Queries, Self-Development, Expression-Eval) bereits gefasst. Der
   zweite Pass identifiziert weitere selten genutzte Built-ins und setzt
   ihren `deferred`-Flag. Konkrete Kandidaten (zu pruefen): `inspect_self`,
   `update_settings`, `manage_mcp_server`. Pro Kandidat eine Begruendung.

Codebase-Anker:
- MCP-Listung: `getToolsSection` in [prompts/sections/tools.ts:38-60](../../../src/core/prompts/sections/tools.ts#L38-L60).
- `use_mcp_tool` registriert in [ToolRegistry.ts:128-130](../../../src/core/tools/ToolRegistry.ts#L128-L130).
  `read_mcp_tool` wird in demselben Block hinzugefuegt -- nur wenn `mcpClient`
  vorhanden, analog zu `use_mcp_tool`.
- `deferred`-Flag: ADR-08 / `TOOL_METADATA` Schema in der zentralen
  Tool-Metadata-Datei. `DEFERRED_TOOL_NAMES` aus derselben Datei wird
  von `FindToolTool` und der Tools-Section gelesen.

---

## 2. Aenderungen

### 2.1 MCP-Tool-Description-Cap (Task 1)

VORHER: `prompts/sections/tools.ts` rendert pro MCP-Tool
```
- ${serverName}: ${tool.name}${tool.description ? ' — ' + tool.description : ''}
```
ohne Laengen-Limit.

NACHHER: kleine Helper-Funktion `capMcpDescription(desc: string, server, name): string`
in derselben Datei. Liefert bei `desc.length <= 200` die Description
unveraendert, sonst `desc.slice(0, 200).trimEnd() + ' ... [full description: read_mcp_tool({ server: "<server>", name: "<name>" })]'`.
Einzelne `description ? ' — ' + capMcpDescription(...) : ''` ersetzt die
heutige Zeile.

Aenderungs-Surface: minimal, eine Datei. Em-Dash im aktuellen Code ist ein
U+2014 (` — `) -- bei der Gelegenheit auf ` -- ` (Doppel-Hyphen) umstellen,
damit die Projekt-Konvention "keine Em-Dashes" auch hier gilt.

### 2.2 ReadMcpToolTool (Task 2)

NEU: `src/core/tools/mcp/ReadMcpToolTool.ts`. BaseTool-Subklasse
`ReadMcpToolTool extends BaseTool<'read_mcp_tool'>`.

- Konstruktor: `(plugin, mcpClient: McpClient)`.
- `getDefinition()`: name `read_mcp_tool`, description nennt Server-Whitelist
  und verweist auf die SKILLS-Verzeichnis-Analogie. Schema:
  ```
  type: object
  properties:
    server: { type: 'string', description: 'MCP server name as listed in the SERVERS section.' }
    name:   { type: 'string', description: 'Tool name on that server (without server prefix).' }
  required: ['server', 'name']
  ```
- `execute({ server, name }, ctx)`:
  1. Inputs trimmen, leere Werte -> `formatError("server and name are required")`.
  2. Whitelist-Check: `activeMcpServers` aus Settings (analog UseMcpToolTool.ts:72-81).
     Server nicht in der Liste -> Fehlermeldung wie bei `use_mcp_tool`.
  3. `mcpClient.getServerTools(server)` (oder vorhandene Methode, bei Bedarf
     neuer kleiner Accessor): liefert `McpToolInfo[]` fuer den Server.
     Server nicht verbunden -> Fehlermeldung mit Liste der verbundenen Server.
  4. `tools.find(t => t.name === name)` -> Tool gefunden -> Result:
     ```
     ## MCP TOOL: <server>.<name>
     follow this tool's contract; call it via use_mcp_tool.

     **Description:** <full description>
     **Input schema summary:**
     - <prop>: <type>[, required]
     - ...
     ```
  5. Tool nicht gefunden -> Fehler mit Liste der verfuegbaren Tools (analog
     read_skill).
  6. InputSchema-Summary-Renderer: kleine private Methode
     `renderInputSchemaSummary(schema)`. Liest `schema.properties` (falls
     vorhanden), iteriert; pro Property: name, `type` als String oder
     `enum`-Liste, `required: true` wenn name in `schema.required`. Liefert
     `undefined` wenn kein parsierbares Schema. Keine vollen Description-Felder
     mitschleifen (= Bloat-Vermeidung).
- Konsistenz mit der Codebase-Style: Pflicht-Imports (`BaseTool`, `ToolDefinition`,
  `ToolExecutionContext`, `McpClient`-Typ). isWriteOperation = false (read-only).

### 2.3 Registry + Metadata + Types (Task 2 cont.)

- `src/core/tools/ToolRegistry.ts`: Import + im `if (mcpClient)`-Block
  hinzufuegen: `this.register(new ReadMcpToolTool(this.plugin, mcpClient));`.
- `src/core/tools/types.ts`: `'read_mcp_tool'` in die `ToolName`-Union an
  der Stelle aufnehmen, wo `'use_mcp_tool'` steht.
- `TOOL_METADATA` (zentrale Tool-Metadata, ADR-08): Eintrag fuer
  `read_mcp_tool`:
  ```
  read_mcp_tool: {
      group: 'mcp', label: 'Read MCP Tool', icon: 'help-circle',
      signature: 'read_mcp_tool(server, name)',
      description: 'Read the full description and input schema summary of a tool on a connected MCP server.',
      whenToUse: 'When the SERVERS section shows a tool whose description is truncated and you need the full text + input schema before calling it via use_mcp_tool.',
      commonMistakes: 'Calling read_mcp_tool on a tool whose short description already covers what you need -- skip this call if the SERVERS line tells you enough. Re-reading the same tool more than once per session -- the result stays in the conversation.',
  }
  ```
  **NICHT** in `DEFERRED_TOOL_NAMES` aufnehmen.

### 2.4 Built-in deferred-Review (Task 3)

Pruefen pro Kandidat:

- **`inspect_self`**: Selbstbeobachtungs-Tool ueber Tool-Listings und Logs.
  Nutzung: selten, eher diagnose-/audit-getrieben. Kandidat fuer deferred.
- **`update_settings`**: Aenderung von Plugin-Settings via Tool. Nutzung:
  punktuell (User aktiviert Web-Tools, aendert Modell). Findbar via Keyword.
  Kandidat fuer deferred.
- **`manage_mcp_server`**: Verwaltung der MCP-Server-Connections. Nutzung:
  selten, hauptsaechlich im Setup. Kandidat fuer deferred.
- **`new_task`**: AGENT-CONTROL-Tool fuer Subtasks. **NICHT deferred** --
  Test-Liste `keeps core read / edit / agent-control tools NOT deferred`
  in `deferredToolLoading.test.ts:38` asserted `new_task` explizit.
- **`attempt_completion`**, **`ask_followup_question`**, **`switch_mode`**:
  Agent-Control, ebenfalls NICHT deferred lassen.
- Andere `read`/`edit`/`vault`-Gruppe-Tools: bleiben sichtbar.

Aktion: in der zentralen Tool-Metadata fuer die drei bestaetigten Kandidaten
`deferred: true` setzen. Pro Kandidat eine 1-Zeilen-Inline-Begruendung im
Code-Kommentar.

`find_tool` Test-Liste in `deferredToolLoading.test.ts` ggf. erweitern, damit
der `find_tool`-Pfad fuer die neuen deferred-Tools weiterhin matched.

### 2.5 Tests (Task 4)

NEU: `src/core/tools/mcp/__tests__/ReadMcpToolTool.test.ts`. Analoge Struktur
zu `ReadSkillTool.test.ts`:

- Setup: Mock-McpClient mit zwei Servern, je 1-2 Tools.
- Test 1: empty inputs -> error "required".
- Test 2: server nicht in `activeMcpServers` -> Fehler mit Hinweis auf das
  Tool-Picker-UI (Wortlaut analog zu UseMcpToolTool).
- Test 3: server nicht verbunden -> Fehler mit Liste verbundener Server.
- Test 4: Tool gefunden -> Result enthaelt `## MCP TOOL: ...`, full description,
  `**Input schema summary:**` mit den richtigen Properties.
- Test 5: Tool nicht gefunden -> Fehler mit Liste verfuegbarer Tools.
- Test 6: input_schema fehlt -> Result enthaelt `(no input schema)` oder
  laesst den Summary-Block weg.

NEU oder erweitert: `src/core/prompts/sections/__tests__/tools.test.ts`:
- Test A: kurze Description (<200 chars) bleibt unveraendert.
- Test B: lange Description (>200 chars) wird gekappt + Suffix `[full description: read_mcp_tool(...)]` erscheint mit korrekt eingesetztem Server/Name.
- Test C: keine Description -> Zeile ist nur `- server: tool_name` (heutiges Verhalten).

ERWEITERT: `src/core/tools/__tests__/deferredToolLoading.test.ts`:
- Assertion `isDeferredTool('read_mcp_tool') === false`.
- Assertion `TOOL_METADATA['read_mcp_tool'].group === 'mcp'`.
- Pro neuem deferred Built-in (inspect_self, update_settings, manage_mcp_server):
  `isDeferredTool(<name>) === true`.
- Die bestehende `'DEFERRED_TOOL_NAMES is reasonably sized'`-Assertion
  (`>10 && <40`) auf neue Groesse pruefen; ggf. die Obergrenze leicht
  anheben falls noetig.

### 2.6 Dokumentation

- `_devprocess/requirements/features/FEAT-24-06-...md`: plan-refs schon
  gesetzt (PLAN-21); nach Abschluss Status in der BACKLOG-Row auf "Done".
- `_devprocess/context/BACKLOG.md`: nach jeder Task-Implementierung die
  Notes-Spalte um den Stand erweitern; Status-Spalte bei vollstaendiger
  Implementierung auf `Done`.
- `_devprocess/architecture/ADR-118-...md`: Status bleibt `Accepted`; keine
  Aenderung im PLAN.

---

## 3. Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|---|---|---|
| `src/core/prompts/sections/tools.ts` | MCP-Description-Cap + Em-Dash -> `--` | niedrig |
| `src/core/tools/mcp/ReadMcpToolTool.ts` | NEU | mittel (neuer Pfad in MCP-Bruecke) |
| `src/core/tools/ToolRegistry.ts` | `ReadMcpToolTool` registrieren | niedrig |
| `src/core/tools/types.ts` | `'read_mcp_tool'` in `ToolName` | niedrig |
| zentrale Tool-Metadata (ADR-08) | `read_mcp_tool` Eintrag + `deferred: true` fuer 3 Kandidaten | niedrig |
| `src/core/prompts/sections/__tests__/tools.test.ts` | NEU oder erweitert | niedrig |
| `src/core/tools/mcp/__tests__/ReadMcpToolTool.test.ts` | NEU | niedrig |
| `src/core/tools/__tests__/deferredToolLoading.test.ts` | +3 deferred-Assertion + 2 read_mcp_tool-Assertion | niedrig |
| `_devprocess/context/BACKLOG.md` | Notes/Status fuer FEAT-24-06 | niedrig |

## 4. Nicht betroffen (Blast-Radius)

- `use_mcp_tool` Tool-Logik. Wird nicht angefasst; nur als Aufrufer-Vorlage
  zitiert.
- `McpClient.callTool` und der gesamte SDK-Pfad zur MCP-Connection.
- `FindToolTool` Ranking-Logik. Der zweite deferred-Pass nutzt bestehende
  Keyword-Suche unveraendert.
- `activateDeferredTool` und der `cacheInvalidated`-Pfad in AgentTask.
- `CACHE_BREAKPOINT_MARKER` und der System-Prompt-Split.
- Skill-Pfad (FEAT-24-09): `read_skill`, `getSkillDirectorySection`,
  `SelfAuthoredSkillLoader` unangetastet.
- ADR-117 inhaltlich (nur Status auf Superseded -- bereits im Pivot-Commit).

## 5. Verifikation

1. **Build:** `npm run build` -- gruen.
2. **Tests:** `npm test` -- Baseline 1424 auf dev. Erwartet: +5 bis +10 neue
   Tests (ReadMcpToolTool + tools.ts Cap + deferred-Assertions).
3. **Typecheck:** `npx tsc -noEmit -skipLibCheck` clean.
4. **Lint:** `npm run lint` 0 errors (vorbestehende warnings unveraendert).
5. **`/consistency-check` mode A:** keine neuen Findings durch FEAT-24-06
   (Baseline 88 nach FEAT-24-09 auf dev).
6. **Funktional (manuell, Live-Messlauf, `[AWAITING RE]` SC-6):**
   - Mit verbundenem MCP-Server, dessen Tool-Description >200 chars enthaelt,
     zeigt das `[SystemPrompt]`-Section-Char-Breakdown fuer Section 4
     messbar weniger als vorher.
   - `read_mcp_tool({ server: "...", name: "..." })` liefert das erwartete
     Result.
   - `find_tool` aktiviert neue deferred Built-ins wie erwartet.

## 6. Plan Coverage Gate

Wird nach Persistierung dieses Plans und vor dem ersten Code-Edit gefuellt.

| SC (FEAT-24-06) | mapped to Task | Status |
|---|---|---|
| SC-1 MCP-Listen-Cap greift | Task 2.1 (`tools.ts` + Test) | mapped |
| SC-2 `read_mcp_tool` liefert Result-Block | Task 2.2 + 2.5 Test 4 | mapped |
| SC-3 `read_mcp_tool` an `mcp`-Gruppe gebunden, NICHT deferred | Task 2.3 + 2.5 (deferredToolLoading-Assertion) | mapped |
| SC-4 Built-in-deferred-Review (mind. 3 Kandidaten) | Task 2.4 | mapped |
| SC-5 Bestehende Funktionalitaet unveraendert | Vollstaendiger Test-Run nach jedem Task | mapped (Test-Baseline-Vergleich) |
| SC-6 Live-Messlauf | Deferred -- nicht autonom pruefbar | Deferred: manuelle Vault-Session, nicht in diesem PLAN |

ADR-118 Decisions:
- ADR-118 D1 (MCP-Description-Cap) -> Task 2.1.
- ADR-118 D2 (`read_mcp_tool` neues NICHT-deferred Tool) -> Task 2.2 + 2.3.
- ADR-118 D3 (Built-in-deferred-Review) -> Task 2.4.
Alle drei mapped.

## 7. Change Log

### 2026-05-13 -- Plan persistiert nach /coding-Pivot (trigger=design)

Aufgesetzt nach Mid-course design discovery: ADR-117 supersediert durch
ADR-118 (siehe Pivot-Commit `e28139f`). Coverage Gate beim Persistieren
erfuellt (alle 6 SC + 3 ADR-118-Decisions mapped).

### 2026-05-13 -- Implementation komplett (trigger=task)

Tasks in einem Sprint ohne Mid-course-Trigger:

- Task 1 (MCP-Description-Cap): `prompts/sections/tools.ts` -- neuer Helper
  `capMcpDescription` (export) + `MCP_DESCRIPTION_CAP = 200`, MCP-Listenrenderer
  ruft den Cap an, und im Header-Block der MCP-Sektion wird `read_mcp_tool`
  als neue Zeile annonciert. Em-Dash ` — ` -> ` -- ` (Projekt-Konvention).
- Task 2 (`ReadMcpToolTool`): neue Datei `src/core/tools/mcp/ReadMcpToolTool.ts`
  (~180 LOC). Validierung gegen `activeMcpServers`-Whitelist + Connection-
  Status + Tool-Existenz; Renderer mit Header, voller Description, kompaktem
  InputSchema-Summary (`renderInputSchemaSummary` + `describeType`-Helfer
  zeigt Properties mit Typ + `required`-Flag, enum-Werte und array-items).
  `types.ts` ToolName-Union erweitert; `TOOL_METADATA.read_mcp_tool` als
  Mcp-Gruppen-Eintrag (NICHT deferred); `ToolRegistry` registriert das Tool
  im `if (mcpClient)`-Block neben `UseMcpToolTool`.
- Task 3 (Built-in deferred-Review): `inspect_self` und `update_settings`
  hatten keine `TOOL_METADATA`-Eintraege -- diese wurden geschrieben (damit
  `find_tool` sie ranken kann) UND beide Tools in `DEFERRED_TOOL_NAMES`
  aufgenommen. `manage_mcp_server` war bereits deferred (kein Aktionspunkt).
- Task 4 (Tests): drei Test-Surfaces:
  - `prompts/sections/__tests__/tools.test.ts` (NEU, 4 Tests): kurze
    Description bleibt, lange Description gekappt mit `read_mcp_tool`-Suffix,
    deterministischer Head-Cut.
  - `tools/mcp/__tests__/ReadMcpToolTool.test.ts` (NEU, 7 Tests):
    leere Inputs, Whitelist, Disconnected-Server, Tool-not-found,
    Happy-Path mit Schema-Summary, fehlendes inputSchema, enum-Properties.
  - `tools/__tests__/deferredToolLoading.test.ts` (erweitert, +4 Tests):
    `read_mcp_tool` NOT deferred + `group === 'mcp'`; `inspect_self` und
    `update_settings` deferred + Metadata vorhanden.

Verifikation:

- `npm test`: **1439 gruen** (+15 vs dev-Baseline 1424). 146 Test-Files.
- `npm run build`: gruen (tsc + esbuild production + Deploy zur Vault).
- `npm run lint`: 0 errors (vorbestehende 663 warnings unveraendert).
- `npx tsc -noEmit -skipLibCheck`: clean.

## 8. Implementation Notes

Per-task commit SHAs werden im phase-end-Commit (`<feat>(code): FEAT-24-06
coding complete`) gebuendelt. Die Implementation lief in einem Sprint, kein
mid-course Trigger erforderlich.

Befunde waehrend Implementation (NICHT geplant, gefunden):

- `manage_mcp_server` war bereits in `DEFERRED_TOOL_NAMES` -- die PLAN-21
  Annahme im Plan war Spekulation. Real wirksam wurde nur `inspect_self`
  und `update_settings`.
- `inspect_self` und `update_settings` hatten **keine** `TOOL_METADATA`-
  Eintraege. Das ist ein eigenes hidden-bug-Pattern (Tool registriert, aber
  in der zentralen Metadata fehlt). Behoben als Teil von Task 3, weil
  `find_tool` ohne Metadata keinen Rank machen kann (FindToolTool.ts:87
  `if (!meta) continue;`).
- Die MCP-Listung in der `tools`-Section nutzte einen Em-Dash (U+2014); bei
  der Cap-Einbindung gegen die Projekt-Konvention auf `--` umgestellt.

Was bewusst NICHT geaendert wurde:
- `ToolRegistry.registerMcpTool` (TODO-Stub): kein Caller, Refactoring
  out-of-scope. Verdient ggf. eine eigene IMP-Row spaeter.
- `UseMcpToolTool.ts` Tool-Logik: unangetastet.
- `McpClient` API: bestehende Methoden `getConnection`, `getConnections`,
  `getAllTools` reichten -- keine neue Method noetig.
