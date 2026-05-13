---
id: ADR-118
title: MCP-Tool-Listing-Cap, read_mcp_tool, und Built-in deferred-Review
date: 2026-05-13
deciders: Sebastian + Coding-Agent
related-features: FEAT-24-06
related-adrs: ADR-08 (Modular Prompt Sections & Central Tool Metadata), ADR-53 (MCP Server Architecture), ADR-62 (KV-Cache-Optimized Prompt Structure, Amendment 2026-05-12), ADR-116 (Active Skills on-demand)
related-imps: []
supersedes: ADR-117
---

# ADR-118: MCP-Tool-Listing-Cap, read_mcp_tool, und Built-in deferred-Review

## Status

Accepted (Codebase-Reconciliation-Pass 2026-05-13, im /coding fuer FEAT-24-06).
Supersediert ADR-117. Vorgaenger-Review:
[_devprocess/analysis/ADR-117-review.md](../analysis/ADR-117-review.md).

## Kontext

ADR-117 nahm an, dass MCP-Tool-Schemas mit vollen JSON-Definitionen ins
`tools`-Feld jeder API-Anfrage geschrieben werden. Der reale Code zeigt
ein anderes Bild:

1. **MCP-Bruecke ist ein Built-in**, nicht eine Sammlung registrierter Tools.
   `use_mcp_tool(server_name, tool_name, arguments)` ist als regulaeres
   Tool mit einem kleinen, generischen input_schema registriert.
   `ToolRegistry.registerMcpTool` ist ein TODO-Stub und wird von keinem
   echten MCP-Code aufgerufen. Die im `tools`-Feld landenden MCP-Bytes
   sind genau das eine `use_mcp_tool`-Schema.

2. **MCP-Tool-Liste lebt als Text im stabilen Praefix-Block.**
   [systemPrompt.ts Section 4](../../src/core/systemPrompt.ts#L194-L216)
   ruft `getToolsSection(... mcpClient ...)`. Diese Section liegt vor
   `CACHE_BREAKPOINT_MARKER`; sie ist Teil des gecachten Praefix.
   [prompts/sections/tools.ts:38-60](../../src/core/prompts/sections/tools.ts#L38-L60)
   rendert pro MCP-Tool eine Zeile `server: tool_name -- description`.
   Die Description ist ungekappt.

Damit ist das "stabile Verzeichnis"-Ziel aus ADR-117 bereits erreicht
(via FEAT-24-01 / ADR-62-Amendment). Was bleibt, sind zwei reale Posten:

- **(P1) Lange MCP-Tool-Descriptions** koennen den stabilen Praefix
  aufblaehen. Ein MCP-Server mit verbosen Descriptions (z.B. JSON-
  Schema-Beispielen, mehrzeiligen Erklaerungen) traegt heute jede
  Beschreibung ungekappt in den Cache-Block. Bei 3 Servern à 20 Tools
  mit avg. 500 chars pro Description = 30k chars, ~7.5k Tokens; bei
  20+ Tools mit Schema-Examples in der Description schnell zwei- bis
  dreistellige Tausend Tokens.
- **(P2) Built-in-Default-Satz im `tools`-Feld** enthaelt noch
  Tools, die selten genutzt werden, aber nicht deferred sind. FEATURE-1600
  hat die specialised Tools (Office-Formate, Diagram-Creators,
  Base-Queries, Self-Development, Expression-Eval) bereits erledigt;
  ein zweiter Pass kann weitere Kandidaten flaggen. Kleinerer Hebel,
  aber additiv und low-risk.

## Decision Drivers

- Was im stabilen Praefix-Block bleibt, soll klein sein. Was eine
  ausfuehrliche Beschreibung verlangt, kommt on-demand als Tool-Result
  (analog zum read_skill-/Skill-Directory-Pattern aus ADR-116).
- Cache-Vertraeglichkeit: das gecachte MCP-Listing soll sich innerhalb
  einer Session nur aendern, wenn Server connecten/disconnecten oder
  ihre Tool-Liste sich aendert (rare).
- Vorhandene Mechanik wiederverwenden: `find_tool` /
  `activateDeferredTool` fuer Built-ins; das Tool-Result-Header-Pattern
  aus ADR-116 fuer `read_mcp_tool`.
- Kein Verhaltensbruch fuer Nutzer ohne MCP-Server. `read_mcp_tool`
  existiert nur, wenn die `mcp`-Tool-Gruppe aktiv ist (analog zur
  Sichtbarkeit von `use_mcp_tool`).
- Ehrlichkeit ueber den Hebel: ohne Messlauf wissen wir nicht, ob P1
  real teuer ist. Die Decision liefert deshalb (a) einen sicheren
  Description-Cap (kein Down-Side wenn die Descriptions ohnehin kurz
  sind) und (b) den `read_mcp_tool`-Pfad fuer den Fall, dass das Cap
  bei wirklich gebrauchten Descriptions greift.

## Considered Options

### Option 1: Status quo

- Pro: kein Aufwand.
- Con: Praefix-Bloat bei verbose MCP-Servern bleibt unkontrolliert; der
  von ADR-117 versprochene Hebel ist weder dort noch hier geliefert.

### Option 2: Beschreibungen ganz aus der MCP-Listung entfernen, nur Namen

- Pro: maximal kompakt.
- Con: das Modell hat keinen Hinweis mehr, was ein MCP-Tool tut --
  muss vor jedem Erstgebrauch `read_mcp_tool` aufrufen, was den
  Roundtrip-Aufwand verdoppelt. Die heutige Kurzbeschreibung ist im
  Normalfall genug Anhalt.

### Option 3: Description-Cap + read_mcp_tool + Built-in-Review (gewaehlt)

Die MCP-Tool-Listung in Section 4 bekommt pro Tool einen
Description-Cap (Richtwert: 200 chars). Wird eine Description gekappt,
endet die Zeile mit `... [full description: read_mcp_tool({ server, name })]`.
Ein neues, NICHT-deferred Tool `read_mcp_tool(server, tool)` (Gruppe
`mcp`) liefert die volle Description und ein InputSchema-Summary als
Tool-Result. Tools, die unter dem Cap liegen, aendern sich nicht;
das Cap greift nur dort, wo es einen realen Hebel hat.

Zusaetzlich: ein zweiter `deferred`-Pass in `toolMetadata.ts`,
identifiziere weitere Built-in-Kandidaten (low-risk).

- Pro: greift genau dort, wo der Cache-Block real wachsen kann (verbose
  MCP-Servers); `read_mcp_tool` ist Opt-in pro Tool, kein Verhaltens-
  bruch; analog zum Skill-Pattern aus ADR-116 (konsistente Architektur);
  Built-in-Review additiv und reversibel.
- Con: das Modell sieht nicht mehr die volle Description aller MCP-Tools
  im Voraus. Mitigation: 200 chars sind in der Praxis genug
  Anhalt fuer die Wahl; das Header-`read_mcp_tool`-Hint signalisiert
  klar, wo das Detail liegt.

## Decision

**Option 3.** Drei additive Aenderungen, in Reihenfolge ihres Hebels:

1. **MCP-Tool-Description-Cap in [prompts/sections/tools.ts](../../src/core/prompts/sections/tools.ts)**:
   Pro Tool max. 200 chars Description. Kappung mit Suffix
   `... [full description: read_mcp_tool({ server: "X", name: "Y" })]`.
   Tools unter dem Cap bleiben unveraendert.

2. **Neues Tool `read_mcp_tool(server, name)`** als BaseTool in
   `src/core/tools/mcp/`. NICHT in `DEFERRED_TOOL_NAMES`. Gruppe `mcp`
   (existiert sonst nur, wenn die Mode-Konfiguration MCP enthaelt).
   Liefert als Tool-Result einen Block mit:
   - `## MCP TOOL: <server>.<name>` (Header)
   - `**Description:**` (volle Description, ohne Cap)
   - `**Input schema summary:**` (kompaktes JSON-Schema -- nur
     property-Namen, Typen, required-Flags; keine vollen `description`-
     /`examples`-Felder, damit das Tool selbst nicht der naechste
     Bloat-Posten wird)
   Validierung: `server` muss in `activeMcpServers` sein (analog zu
   `use_mcp_tool`), `name` muss in `mcpClient.getServerTools(server)`
   existieren. Fehlerfall: Liste der verfuegbaren Tools des Servers in
   der Fehlermeldung (analog zu read_skill).

3. **Built-in `deferred`-Review** in der zentralen Tool-Metadata
   (ADR-08). Kandidaten-Liste (zu bestaetigen im PLAN):
   - alle Tools die heute nicht-deferred sind, aber nur sehr selten
     gebraucht werden (z.B. `inspect_self`, `update_settings`,
     `manage_mcp_server`, ggf. weitere).
   Pro Kandidat eine Begruendung im Diff. `find_tool` deckt die
   on-demand-Aktivierung; FEATURE-1600-Pattern unveraendert.

Die drei Aenderungen sind unabhaengig: jede greift fuer sich, in der
Reihenfolge des erwarteten Hebels. PLAN-21 schreibt sie als drei Tasks
mit eigener Akzeptanz auf.

### Reihenfolge im stabilen Block (unveraendert)

Section 4 (Tools, inkl. MCP-Listung mit Cap) liegt weiterhin im
gecachten Praefix; `CACHE_BREAKPOINT_MARKER` bleibt unveraendert. Der
neue `read_mcp_tool`-Result-Stream lebt in den Messages (nicht im
Praefix) und unterliegt FEAT-24-02-Microcompaction wie jedes andere
Tool-Result.

## Konsequenzen

### Positiv

- Praefix-Block bleibt klein und cache-stabil, **auch** bei verbose
  MCP-Servers.
- Modell kann jederzeit die volle Description holen, ohne dass der
  Cache invalidiert wird.
- Konsistent zu ADR-116 (Skills): Verzeichnis stabil, Detail on-demand.
- Built-in-Review additiv -- jeder weitere deferred-Flag spart den
  zugehoerigen Tool-Schema-Block im `tools`-Feld.

### Negativ

- Bei sehr kurzen Descriptions (< 200 chars) keine Wirkung; das ist
  korrekt, aber bedeutet: ohne verbose MCP-Servers ist der Hebel nahe
  null. Annahme im Audit-Sinn dokumentiert.
- Ein zusaetzlicher Tool-Call pro MCP-Tool, dessen Description gekappt
  ist. In der Praxis selten (nur das eine Tool, das der User gerade
  braucht).

### Risiken

- **Schwacher Hebel-Beleg**: ohne Live-Messlauf des
  `[InputBreakdown:main-loop] toolSchemas=...t/<count>` mit verbundenen
  MCP-Servern wissen wir nicht, ob P1 real ist. Mitigation: der
  Description-Cap ist null-risiko (keine Funktionsregression, nur eine
  Hinweis-Zeile fuer den Restbetrag), `read_mcp_tool` ist optional.
  Wenn der Messlauf zeigt "kein verbose-MCP-Server -> kein Hebel", ist
  die Aenderung trotzdem harmlos und bereitet kuenftige
  verbose-MCP-Setups vor.
- **Cache-Invalidierung bei Tool-Liste-Aenderung pro Server**: bleibt
  wie heute (rare, akzeptabel). Beim Server-Reconnect wird die
  Listung neu gerendert; das ist by-design und nicht durch ADR-118
  veraendert.
- **`read_mcp_tool` Sichtbarkeit**: muss exakt wie `use_mcp_tool` an die
  `mcp`-Gruppe gebunden sein, damit es nicht in nicht-MCP-Modes
  auftaucht. Im /coding zu pruefen.

## Related Decisions

- ADR-08: zentrale Tool-Metadata + `deferred`-Flag -- Built-in-Review
  arbeitet dort.
- ADR-53: MCP Server Architecture -- definiert `McpClient`,
  `getAllTools`, `callTool`; ADR-118 fuegt einen weiteren
  read-only-Consumer hinzu.
- ADR-62 (Amendment 2026-05-12): der Cache-Marker auf dem `tools`-Feld
  und der stabile Block, in dem die MCP-Listung schon liegt. Keine
  Aenderung an der Marker-Position.
- ADR-116: Active Skills on-demand -- dasselbe Muster, jetzt auch fuer
  MCP-Tool-Details.
- FEATURE-1600: Deferred Tool Loading fuer Built-ins; der zweite
  `deferred`-Pass arbeitet im FEATURE-1600-Pattern weiter.

## Implementation Notes (kann veralten)

- `prompts/sections/tools.ts`: in der MCP-Tool-Schleife einen
  `truncate(description, 200)`-Helfer einbauen. Suffix ist eine
  konstante Vorlage, der `read_mcp_tool`-Call-Hint nennt
  `server`+`name` als Argumente.
- `src/core/tools/mcp/ReadMcpToolTool.ts` (neu) als BaseTool. Konstruktor
  bekommt den `mcpClient`. `getDefinition` definiert ein 2-Property-
  Schema (`server`, `name`). `execute` validiert, holt das `McpToolInfo`
  via `mcpClient.getServerTools(server)` (oder via einer neuen
  `mcpClient.findTool(server, name)`-Methode), rendert das Result.
- `toolMetadata.ts`: Eintrag fuer `read_mcp_tool` (`group: 'mcp'`, NICHT
  deferred). Plus `deferred: true` fuer den im PLAN bestaetigten zweiten
  Pass.
- `ToolRegistry`: `read_mcp_tool` registrieren -- nur, wenn `mcpClient`
  vorhanden (analog `use_mcp_tool`).
- Tests:
  - `tools.ts`-Test: lange Description wird gekappt + Suffix erscheint;
    kurze Description bleibt unveraendert.
  - `ReadMcpToolTool.test.ts`: Happy-Path (Tool gefunden), Server
    nicht in `activeMcpServers` (Fehler), Tool nicht gefunden (Fehler
    mit Liste).
  - `deferredToolLoading.test.ts`: `read_mcp_tool` NOT in
    `DEFERRED_TOOL_NAMES`, `group === 'mcp'`. Plus eine Assertion fuer
    jeden im PLAN bestaetigten neuen `deferred`-Kandidaten.

Diagnose nach Implementation: `[InputBreakdown:main-loop] toolSchemas=...t`
sollte stabil bleiben oder leicht sinken (Built-in-Review-Effekt);
`[SystemPrompt]`-Section-Char-Breakdown fuer Section 4 sollte bei
verbose MCP-Servern messbar sinken. Messlauf bleibt User-Aufgabe; nicht
durch /coding pruefbar.
