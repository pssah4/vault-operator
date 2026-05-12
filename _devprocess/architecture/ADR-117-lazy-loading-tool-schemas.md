---
id: ADR-117
title: Lazy-Loading von Tool-Schemas -- Built-in und MCP
date: 2026-05-12
deciders: Sebastian + Architekt-Agent
related-features: FEAT-24-06
related-adrs: ADR-08 (Modular Prompt Sections & Central Tool Metadata), ADR-11 (Multi-Provider API Architecture), ADR-53 (MCP Server Architecture), ADR-62 (KV-Cache-Optimized Prompt Structure, Amendment 2026-05-12), ADR-116 (Active Skills on-demand)
related-imps: []
---

# ADR-117: Lazy-Loading von Tool-Schemas (Built-in und MCP)

## Status

Proposed (Architecture-Pass 2026-05-12, EPIC-24 Welle 2 -- nach Reconsideration des Spike-Ergebnisses bzgl. MCP). Triggernde ASR: EPIC-24 / FEAT-24-06; RESEARCH-36 Abschnitt 8 (Hebel B).

## Kontext

Bei jedem API-Call wird das vollstaendige `tools`-Feld (Name, ausfuehrliche Beschreibung, JSON-`input_schema` je Tool) an das Modell gesendet. Es besteht aus zwei Teilen:

1. **Built-in-Tools.** Im Default-Modus rund 35 Tools im `tools`-Feld -- code-seitig grob auf 10-20k Tokens geschaetzt. FEATURE-1600 (Deferred Tool Loading) deckt davon schon einen Teil ab: spezialisierte Built-ins (Office-Formate, Base-Queries, Expression-Evaluation) sind *nicht* im Default-`tools`-Feld; das Modell aktiviert sie bei Bedarf ueber das Meta-Tool `find_tool`, das die volle Schema-Definition fuer den Rest der Session injiziert (siehe `activateDeferredTool` im Tool-Execution-Kontext). Der `deferred`-Flag liegt in der zentralen Tool-Metadata (ADR-08).

2. **MCP-Tools.** Sobald ein MCP-Server verbunden ist, werden dessen Tools als regulaere Tools in der Registry registriert (`registerMcpTool`), d.h. ihre vollen Schemas landen genauso im `tools`-Feld -- bei jedem Call. Anders als bei den Built-ins gibt es **kein Lazy-Loading**: der `deferred`-Mechanismus aus FEATURE-1600 greift nur fuer Built-ins. Ein Nutzer mit zwei bis drei MCP-Servern (jeweils oft 10-30 Tools mit teils verbosen Schemas) traegt damit schnell mehrere zehntausend bis hunderttausend Tokens MCP-Tool-Schemas im `tools`-Feld -- bei jedem einzelnen API-Call. Das uebersteigt den Built-in-Anteil potenziell deutlich. Im System-Prompt-Text existiert bereits eine kompakte MCP-Listung (Server -> Tool-Name -> Kurzbeschreibung), aber das `tools`-Feld bekommt die vollen Schemas.

Reconsideration (2026-05-12): in RESEARCH-36 war Hebel B zunaechst auf Welle 4 / niedrige Prio gestuft, weil die ~10-20k Built-in-Tokens nach dem Caching-Fix (ADR-62-Amendment, eigener Cache-Marker aufs `tools`-Feld) grossteils gecacht sind. Der MCP-Anteil aendert die Rechnung: er ist (a) deutlich groesser bei verbundenen Servern, (b) instabiler (Server connect/disconnect, sich aendernde Server-Tool-Listen invalidieren den `tools`-Cache), (c) per Cold-Call und Cache-Write trotzdem teuer. Damit ist Lazy-Loading -- vor allem fuer MCP-Tools -- ein realer Hebel und gehoert in Welle 2, nicht Welle 4.

Triggernde ASR: EPIC-24 / FEAT-24-06; RESEARCH-36 Abschnitt 8 (Hebel B).

## Decision Drivers

- Das `tools`-Feld soll im Normalfall klein bleiben; volle Schemas nur fuer das, was die laufende Aufgabe braucht.
- Das Modell muss seltene/spezialisierte und MCP-Tools weiterhin entdecken und nutzen koennen, ohne dass der Nutzer manuell etwas konfiguriert.
- Vorhandene Mechanik (FEATURE-1600: `deferred`-Flag, `find_tool`, `activateDeferredTool`) wiederverwenden, nicht parallel neu bauen.
- Cache-Vertraeglichkeit: was im `tools`-Feld bleibt, soll sessionweit stabil sein (ergaenzt ADR-62-Amendment).
- Kein Verhaltensbruch fuer Nutzer ohne MCP-Server.

## Considered Options

### Option 1: Status quo -- alle Built-in-Default-Tools plus alle MCP-Tools voll im `tools`-Feld

- Pro: kein Aufwand; das Modell sieht alles sofort.
- Con: bei verbundenen MCP-Servern dominiert der MCP-Schema-Anteil das `tools`-Feld; Cold-Call teuer, Cache instabil bei Server-Aenderungen.

### Option 2: Nur den Built-in-Default-Satz weiter slimmen (mehr `deferred`-Flags), MCP-Tools unangetastet

- Pro: kleiner Schritt, nutzt FEATURE-1600 direkt.
- Con: loest das eigentliche Problem (MCP) nicht; der marginale Built-in-Gewinn (35 -> ~20 Tools) ist klein und nach dem Caching-Fix grossteils gecacht.

### Option 3: FEATURE-1600-Pattern auf MCP-Tools ausweiten -- per-Server-Katalog statt voller Schemas, volles Schema on-demand; plus optional den Built-in-Default-Satz weiter slimmen

MCP-Tools werden defaultseitig **nicht** mit vollem Schema ins `tools`-Feld gelegt. Stattdessen steht im (stabilen) System-Prompt-Bereich ein **per-Server-Katalog** (Server-Name -> Liste der Tool-Namen + je eine Kurzbeschreibung -- erweitert die schon vorhandene kompakte MCP-Listung). Braucht das Modell ein konkretes MCP-Tool, aktiviert es dessen volles Schema ueber das bestehende `find_tool`-Meta-Tool (bzw. eine gleichwertige `enable_mcp_tool(server, name)`-Aktion), das das Schema fuer den Rest der Session ins `tools`-Feld injiziert -- analog zur Aktivierung deferred Built-ins. Optional ein Setting pro Server ("alle Tools dieses Servers immer voll laden") fuer Server, die der Nutzer haeufig und breit nutzt. Zusaetzlich kann der Built-in-Default-Satz weiter geslimmt werden (mehr `deferred`-Flags), aber das ist der kleinere Teil.

- Pro: greift genau dort, wo es weh tut (MCP); nutzt FEATURE-1600-Mechanik (kein neues Konzept); was im `tools`-Feld bleibt, ist klein und stabil; Nutzer ohne MCP merken nichts; Opt-out pro Server moeglich.
- Con: das Modell muss MCP-Tools selbst entdecken (statt sie sofort zu sehen) -- braucht gute Katalog-Beschreibungen und eine Prompt-Leitplanke; ein Round-Trip mehr, wenn ein MCP-Tool zum ersten Mal gebraucht wird (einmalig pro Session und Tool, danach im `tools`-Feld).

## Entscheidung

**Option 3.** Das FEATURE-1600-Lazy-Loading-Pattern wird auf MCP-Tools ausgeweitet:

- **MCP-Tools defaultseitig deferred:** kein volles MCP-Tool-Schema im `tools`-Feld beim Start. Im stabilen System-Prompt-Bereich steht ein per-Server-Katalog (Server-Name + Tool-Namen + Kurzbeschreibungen). Das Modell aktiviert ein konkretes MCP-Tool ueber `find_tool` / `enable_mcp_tool`; das volle Schema wird dann fuer den Rest der Session ins `tools`-Feld gelegt (gleicher Pfad wie `activateDeferredTool` fuer deferred Built-ins).
- **Opt-out pro Server:** ein Setting "Tools dieses MCP-Servers immer voll laden" -- fuer Server, die der Nutzer haeufig und mit vielen verschiedenen Tools nutzt; dann verhalten sich dessen Tools wie heute.
- **Built-in-Default-Satz:** wird (separat, niedrigere Prio) daraufhin durchgesehen, welche weiteren Built-ins als `deferred` markiert werden koennen. Kein Muss fuer Welle 2; kann nachgezogen werden.
- **Cache:** der per-Server-Katalog ist klein und aendert sich nur, wenn Server connecten/disconnecten oder ihre Tool-Liste sich aendert -- er gehoert in den stabilen Block vor dem CACHE-BREAKPOINT (ergaenzt ADR-62-Amendment). On-demand aktivierte Schemas kommen ans Ende des `tools`-Felds; der Marker auf dem `tools`-Feld (ADR-62-Amendment) sitzt davor, sodass der stabile Teil weiter gecacht bleibt.

Eine Prompt-Leitplanke instruiert das Modell, ein MCP-Tool zu aktivieren, sobald die Aufgabe es erfordert (analog zur Skill-Leitplanke aus ADR-116). Self-Authored-Skills, Active-Skills (ADR-116) und MCP-Tools folgen damit demselben "Verzeichnis im stabilen Prompt, Detail on-demand"-Muster.

## Konsequenzen

### Positiv

- Das `tools`-Feld bleibt im Normalfall klein und sessionweit stabil -- vor allem fuer Nutzer mit verbundenen MCP-Servern (heute der groesste, am wenigsten cachebare Posten dort).
- Cold-Call-Kosten pro Konversation sinken um den MCP-Schema-Anteil; der `tools`-Cache wird stabiler (Server-Aenderungen invalidieren nicht mehr den ganzen Schema-Block).
- Nutzt FEATURE-1600-Mechanik (`find_tool`, `activateDeferredTool`, `deferred`-Flag, ADR-08) -- kein neues Konzept; konsistent mit ADR-116 (Active Skills on-demand).
- Opt-out pro Server -- wer ein MCP-Tool-lastiges Setup hat, kann es voll laden lassen.

### Negativ

- Das Modell muss MCP-Tools selbst entdecken; ein schwacher Katalog fuehrt dazu, dass es ein passendes Tool nicht aktiviert. Mitigation: gute Katalog-Beschreibungen (das Material existiert bereits aus der kompakten MCP-Listung im System-Prompt); Prompt-Leitplanke; ggf. eine weiche Heuristik (wenn der User explizit nach einem Tool/Server fragt, das Schema vorab laden).
- Ein zusaetzlicher Round-Trip beim Erstgebrauch eines MCP-Tools pro Session. Akzeptabel: einmalig, danach ist das Schema im `tools`-Feld; in der Praxis nutzt eine Session selten viele verschiedene MCP-Tools.

### Risiken

- Der per-Server-Katalog muss aktuell gehalten werden, wenn ein MCP-Server seine Tool-Liste aendert -- das geschieht selten, sollte aber den Katalog (nicht mehr) invalidieren. Mitigation: der Katalog wird beim Server-Connect/Reconnect neu erzeugt; aendert sich die Tool-Liste, ist eine Cache-Invalidierung des stabilen Blocks akzeptabel (selten).
- Interagiert mit ADR-62-Amendment (Cache-Marker aufs `tools`-Feld) und ADR-116 (Skill-Verzeichnis im stabilen Block) -- die Reihenfolge im stabilen Block (Tool-Listung, Skill-Verzeichnis, MCP-Server-Katalog) muss konsistent definiert sein; Detail fuer den PLAN.
- Falls FEATURE-1600 keinen ADR hat (Stand 2026-05-12: keiner vorhanden), ist diese ADR der erste, der das Lazy-Loading-Konzept dokumentiert -- die FEATURE-1600-Built-in-Mechanik wird hier mitbeschrieben, ihre Spezifikation bleibt FEATURE-1600.

## Related Decisions

- ADR-08: zentrale Tool-Metadata + Modular Prompt Sections -- der `deferred`-Flag und die Tool-Listung leben dort.
- ADR-53: MCP Server Architecture -- die MCP-Tools, deren Schema-Injektion hier lazy wird.
- ADR-62 (Amendment 2026-05-12): der `tools`-Feld-Cache-Marker und der stabile Block, in den der per-Server-Katalog gehoert.
- ADR-116: Active Skills on-demand -- dasselbe "Verzeichnis im stabilen Prompt, Detail als on-demand-geladenes Material"-Muster.

## Implementation Notes (2026-05-12, kann veralten)

MCP-Tools beim Registrieren (`ToolRegistry.registerMcpTool`) als deferred behandeln (nicht ins Default-`tools`-Feld; nur in den Katalog). Den MCP-Katalog in `prompts/sections/tools.ts` aus der heutigen kompakten Listung in den stabilen Block ziehen (Server -> Tool-Namen + Kurzbeschreibungen). `find_tool` / eine `enable_mcp_tool`-Variante so erweitern, dass sie auch MCP-Tool-Schemas aktiviert (gleicher `activateDeferredTool`-Pfad). Setting pro MCP-Server ("immer voll laden"). Built-in-`deferred`-Review in `toolMetadata.ts`. Diagnose: eine `tools`-Feld-Token-Zeile in `logInputBreakdown` (z.B. `JSON.stringify(tools).length/4`) -- vor /coding einbauen, damit der reale `tools`-Feld-Umfang *mit verbundenen MCP-Servern* sichtbar wird; das schaerft auch die finale Prio. Verwandt: FEAT-24-06, FEATURE-1600, RESEARCH-36 Abschnitt 8 (Hebel B), Claude Code (`Skill`-/`Task`-Tools, progressive disclosure), ADR-116.
