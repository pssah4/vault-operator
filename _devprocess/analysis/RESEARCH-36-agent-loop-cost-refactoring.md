# RESEARCH-36: Agent-Loop Kosten-Refactoring -- Diagnose, Vergleich (Claude Code / EnBW Cowork) und Hebel

> **Erstellt:** 2026-05-12 (konsolidiert aus zwei Arbeits-Drafts: Kosten-Diagnose + Architektur-Vergleich)
> **Typ:** Codebase-Analyse + Architektur-Vergleich + Quellen-Synthese, Vorbereitung fuer Planung/Refactoring
> **Anlass:** Input-Token-Verbrauch des Obsilo-Agents ist in der Praxis nicht tragbar
> (Beispiel-Session: 6 Turns, ~2,97 Mio Input-Tokens, ~42 EUR).
> **Verwandt:** BA-12 (Token-Kostenreduktion, EPIC-18), ADR-61/062/063, FIX-12, BUG-016
> **Status:** lebt im Backlog (`grep "RESEARCH-36" _devprocess/context/BACKLOG.md`)

---

## 1. Problem (diagnostisch)

EPIC-18 hat fuer den **Fast-Path-Fall** ("Suche X, fasse zusammen") 634k -> 60k Input-Tokens
erreicht. Der Auslöser-Chat (6 Turns dialogischer Notizarbeit, ~2,97 Mio Input-Tokens, ~42 EUR
angezeigt) und ein anschliessender 5-Provider-Messlauf (2026-05-12, mit dem Diagnose-Log
`logCacheStat` + `logInputBreakdown` + `[SystemPrompt]`) zeigen: das Problem ist nicht eins,
sondern drei, und zwei der ursprünglichen Verdachte waren falsch.

### 1.1 Auslöser-Chat (UI-Anzeige, vor der Messung)

| Turn | Aktion | Input (UI) | Output | Kosten (UI) |
|---|---|---:|---:|---:|
| 1 | "RAG-Anbieter?" + 1 Web-Search | 184.655 | 1.148 | 2,66 EUR |
| 2 | "EnBW-Infos integrieren" -- 1 Edit | 507.333 | 2.546 | 7,25 EUR |
| 3 | "was ist nicht implementiert?" | 235.084 | 1.554 | 3,39 EUR |
| 4 | Recherche, 3 web_fetch + 2 search | 882.448 | 2.096 | 12,46 EUR |
| 5 | "Hinweise einarbeiten" -- 2 Edits | 629.231 | 4.114 | 9,06 EUR |
| 6 | "Links einfügen" -- 3 search + 1 Edit | 534.501 | 2.367 | 7,62 EUR |
| **Σ** | | **~2.973.000** | **~13.825** | **~42,44 EUR** |

> **Wichtig:** die "Input"- und "Kosten"-Spalten der UI **überschätzen**. (a) Die UI summiert
> `totalIn` (gecacht + ungecacht) über alle Iterationen eines Turns; (b) die Kostenrechnung der
> openai-Familie-Provider zieht Cache-Reads nicht ab (s. §1.2 Befund D). Reale Kosten lagen je
> nach Provider bei 1/2 bis 1/3 des Angezeigten.

### 1.2 Was der 5-Provider-Messlauf zeigt (jeweils "Was habe ich im Vault zu GitHub?", frischer Chat)

System-Prompt in allen Tests: `[SystemPrompt] 48511 chars (~12128 tokens)`. Top-Sections:
`tools=2810 self-authored-skills=1689 cost-heuristics=1435 mode=1158 memory=1039 objective=962
response-format=806 vault-context=512` (Chars). 35 Tools im `tools`-API-Feld.

| Provider / Modell | Caching-Mechanik | `cacheRead` ab Call 2 | Bewertung |
|---|---|---|---|
| GitHub Copilot / Sonnet 4.6 | auto (GitHub-Proxy) | Call2 96 %, Call3 75 % | ✅ greift gut |
| OpenAI / GPT-5.4 | auto | Call2 99 %, Call3 81 %, Call4 39 % | ✅ greift gut |
| OpenRouter / Gemini 2.5 Pro | auto (durchgereicht) | Call2 93 % | ✅ greift gut |
| Anthropic direkt / Sonnet 4.6 | explizit `cache_control`, **1 Marker auf dem ganzen System-Block** | Call2 **0 %** (Cache neu angelegt: `cacheCreate=21479`), Call3 78 % | ❌ instabiler Präfix → Miss + 25 % Cache-Write-Aufschlag → in der Summe **teurer als ohne Caching** (cacheW=44510 dominierte die Turn-Kosten) |
| EnBW Bedrock / Sonnet 4.6 | **keine** (`cachePoint` wird in `bedrock.ts` nicht injiziert) | **0 % durchgehend** (`cacheCreate=0` *und* `cacheRead=0`) | ❌ Caching faktisch deaktiviert |

**Befunde:**

**A. Caching greift — auf den Auto-Caching-Providern.** Copilot/OpenAI/OpenRouter erreichen
75–99 % Hit-Rate ab dem 2. API-Call ohne unser Zutun. Damit ist die ursprüngliche RESEARCH-These
"Caching greift faktisch nicht" für diese Provider **falsch**. Der stabile Präfix (System 12k +
Tools ~30k + frühe History) wird sauber gecacht.

**B. Auf dem Anthropic-Direkt-Pfad ist unser `cache_control`-Marker an der falschen Stelle.**
`anthropic.ts` setzt **genau einen** Marker auf den **kompletten** System-Prompt-String — der den
volatilen DateTime-Abschnitt, den per-Turn von `ContextComposer` gesetzten Memory-Block, die
per-Message klassifizierten Active Skills, die Recipe-Section und den Vault-Context **enthält**.
Ändert sich irgendetwas davon zwischen zwei API-Calls (im Test: ~1 s zwischen Call 1 und Call 2,
DateTime tickte), ist der gesamte [tools+system]-Cache invalid → Anthropic legt ihn **neu** an
(`cacheCreate`) statt zu lesen. Da Anthropic +25 % auf Cache-Writes aufschlägt, zahlt man den
Write-Aufschlag bei *jeder* Iteration ohne je den Read-Rabatt zu sehen: **Caching macht den
Anthropic-Pfad bei instabilem Präfix teurer als ganz ohne.** Auf Bedrock fehlt der `cachePoint`
ganz. → Das ist der eigentliche RESEARCH-§3-Befund, jetzt belegt.

**C. Der dominante Wachstumstreiber: Tool-Results akkumulieren ungekürzt in der History.**
Im OpenAI-Test las der Agent in *einem* Turn 4 Dateien (`read_file` ist auf **50000 Chars/Datei**
gekappt — zwei der Dateien wurden truncated): `[InputBreakdown] total=~48049t (sys=12128t
hist=35922t über 7 msgs)`, davon Msg #6 = 31487 Tokens (4 tool_results). Diese 31k fahren in jeder
Folge-Iteration **und** jedem Folge-Turn mit, weil es **keine Komprimierung an Turn-Grenzen** gibt.
Hochskaliert über eine lange Session ist das das 138k/181k-Disaster (gemessen in einem 58-Msg-Chat:
`hist=138652t`, davon zwei riesige *User*-Messages #0=78k und #22=25k aus reingepastetem/
@-mentionten Material + ~31k Tool-Results im Rest). Der Cap existiert (50k Chars/Datei) — er ist
nur pro Datei und greift nicht gegen Akkumulation.

**D. Die Kostenanzeige ist provider-inkonsistent und überschätzt.** `anthropic.ts`/`bedrock.ts`
verdrahten `cacheR`/`cacheW` korrekt in den `usage`-Chunk; die openai-Familie (`openai.ts`,
`kilo-gateway.ts`, `github-copilot.ts`) liest `prompt_tokens_details.cached_tokens` gar nicht aus →
`[Cost] cacheR=0` trotz tatsächlich 16–22k Cache-Reads → die Kostenrechnung bucht alles zum vollen
Input-Preis → angezeigte Kosten ~2–3× zu hoch. Das ist der wahre Grund für den "12–14 EUR/Mio
effektive Rate"-Eindruck aus dem Auslöser-Chat (der lief über Copilot "via Sub").

**E. Externalize → sofortiges Re-Read = oft No-Op.** `[Externalize] semantic_search result (… chars)
→ tmp` und unmittelbar danach `[AgentTask] Successfully read file: …semantic_search-1.md (… chars)`
in 4 von 5 Tests — der Externalizer (ADR-63) schiebt den Brocken nur eine Message weiter, statt
ihn loszuwerden. Im Gemini-Test las der Agent die tmp-Datei **nicht** zurück (er kam mit der
kompakten Referenz aus) — d.h. eine reichhaltigere Referenz + ein Prompt-Hinweis ("nur nachlesen
wenn du einen konkreten Abschnitt brauchst") würde helfen. Zusätzlich muss ein Re-Read einer
externalisierten tmp-Datei selbst gekappt werden.

**F. System-Prompt ist schlank (12128 Tokens), Tool-Doppelung ist ein Nicht-Problem.** Die
Tool-Listung im System-Prompt-Text ist nur 2810 Chars (~700 Tokens). Lazy-Loading der
Tool-*Schemas* (`tools`-Feld, ~30k) bleibt ein mittlerer Hebel, aber die in RESEARCH früher
vermutete "Tool-Doppelung" als grosser Posten **entfällt**.

**G. Output ist nicht das Problem.** ~13,8k Output auf 6 Turns. Caveman-Modus / Output-Kürzung wäre
Mikrooptimierung. Der Hebel ist **Input** und **Loop-Architektur**.

**Nebenbefund (kleiner Bug):** `[Externalize] Cleanup failed after retries … EPERM … unlink
'…/.obsilo-vault/tmp/task-…'` in jedem Test — auf dem iCloud-Pfad schlägt das tmp-Cleanup fehl
(non-fatal, Retry beim nächsten Start), tmp-Files bleiben liegen.

### 1.3 Abgrenzung zu EPIC-18

EPIC-18 hat den Fast Path (Recipe-Batching, 8 -> 2 Roundtrips), ADR-62 (Prompt-Reihenfolge),
ADR-63 (Externalization grosser Tool-Results) gebaut. **Lücken die die Messung aufdeckt:**

- Der Fast Path deckt nur das Such-/Zusammenfassungs-Muster ab, nicht dialogisches Editieren,
  Recherche-Turns oder mehrschrittige Tool-Ketten.
- ADR-62 ist nur konzeptionelle Reihenfolge — es gibt keinen echten zweiten Cache-Breakpoint, und
  der eine Marker sitzt nach dem volatilen Content (Befund B).
- ADR-63-Externalization wirkt im FastPathExecutor, nicht im allgemeinen Loop; und der
  Re-Read-No-Op (Befund E) macht sie auch dort teilweise wirkungslos.
- Keine History-Komprimierung an natürlichen Übergängen (nur Notfall-Condensing bei ~70 %
  Kontextfenster oder bei 400-Overflow) → Befund C.
- Tool-Schemas (~35 Tools) liegen ab Iteration 1 vollständig im `tools`-Feld (kein Lazy-Loading) —
  mittlerer Hebel, nicht der grosse.

---

## 2. Vergleich: Claude Code, EnBW Cowork, Obsilo

Drei produktive Agenten, alle mit derselben Loop-Grundform. Zwei davon implementieren den Loop gar
nicht selbst, sondern betten ein SDK ein. Quellen und Belastbarkeit:

- **Claude Code**: `github.com/codeaashu/claude-code` (geleakter TS-Quellcode via npm-`.map`,
  Stand 31.03.2026, ~1.900 Dateien -- als Strukturbeleg, nicht zeilengenau), Anthropics
  oeffentliche Doku, und Kenntnis aus erster Hand (diese Analyse laeuft im Claude-Code-Harness).
- **EnBW Cowork**: lokaler Checkout `~/projects/enbw-cowork` (v0.8.0, Mai 2026) --
  `src/main/claude/*`, `src/ARCHITECTURE.map`, `package.json`, plus das eingebettete SDK unter
  `node_modules/@mariozechner/pi-coding-agent/`.
- **Obsilo**: vollstaendige Code-Sichtung von `src/core/AgentTask.ts`, `systemPrompt.ts`,
  `FastPathExecutor.ts`, `ToolRegistry.ts`, `ToolExecutionPipeline.ts`, `ResultExternalizer.ts`,
  `ContextComposer.ts`, `sanitizeHistoryForApi.ts`, `api/providers/anthropic.ts`.

### 2.1 Claude Code -- die Architektur in Kuerze

- **Hauptloop (`QueryEngine.ts`)**: ReAct-Streaming-Loop, strukturell fast identisch zu Obsilo
  (Claude Code, Cline, Kilo Code, Continue sind zur gleichen Form konvergiert). Messages bauen ->
  Stream konsumieren (Text + tool_use + Thinking) -> Tools ausfuehren (read-only parallel mit
  Concurrency-Limit, schreibende sequenziell) -> tool_result als User-Message anhaengen -> bei
  Kontextfenster-Naehe Compaction -> Loop bis kein tool_use mehr. **Kein fundamentaler Unterschied
  zum Obsilo-Loop. Die Differenz liegt im Drumherum.**
- **Kontext-Management (Kernkompetenz)**: (a) **Auto-Compaction** bei ~92-95 % Kontextfenster --
  dedizierter Summary-Call mit strukturiertem Prompt (urspruengliche Requests, technische Konzepte,
  beruehrte Dateien, Fehler+Fixes, offene Tasks, Arbeitsstand, naechster Schritt), ersetzt die
  Konversation durch die Zusammenfassung + behaelt letzte Messages + liest Schluesseldateien neu;
  (b) **Microcompaction** -- laufend, *vor* dem Voll-Limit: der **Inhalt** alter Tool-Results
  (grosse `Read`-Ergebnisse, lange `Bash`-Outputs) wird aus der History entfernt, das
  tool_use/tool_result-Skelett bleibt; (c) manuelles `/compact [hinweis]` + `PreCompact`-Hook.
- **Tool-Output**: keine Externalization in Dateien. Stattdessen harte Per-Tool-Caps (`Read`: max
  2000 Zeilen default, Zeilen >2000 Zeichen gekappt; `Bash`-Output ~30k Zeichen; `Grep`:
  `head_limit`), Model soll paginieren/eingrenzen. -> Obsilos ADR-63 ist hier **konzeptionell
  ueberlegen** (kein erneuter `read_file`-Round-Trip), nur falsch verdrahtet (nur FastPath).
- **Tool-Schemas liegen NICHT im System-Prompt-Text** -- nur im strukturierten `tools`-API-Feld.
  Der System-Prompt-Text = Verhaltensanweisungen + Environment-Block (cwd, git status, Platform,
  **Datum tagesgranular**, Modell) + CLAUDE.md-Inhalte (Projekt + `~/.claude/CLAUDE.md` + nested +
  `@`-Importe). System-Text + `tools`-Block = ein grosser, sessionweit stabiler Praefix.
- **Prompt-Caching diszipliniert auf Cache-Hit ausgelegt**: bis zu 4 `cache_control`-Breakpoints --
  einer nach dem System+Tools-Block (sessionweit stabil), 1-2 rollende in der Message-History
  (wandern Richtung Ende, einer bleibt weiter hinten). Dokumentiert: in einer 30-Min-Session 1,84
  von 2 Mio Tokens als Cache-Reads, ~81 % Reduktion.
- **Subagents = `Task`-Tool** (erstklassig, vom System-Prompt empfohlen): `Task(description, prompt,
  subagent_type)` spawnt einen frischen Agenten mit eigenem Kontextfenster und eigenem System-Prompt
  (aus `.claude/agents/*.md`: name/description/tools/model), laeuft autonom bis zum Ende, gibt nur
  die finale Text-Message als Tool-Result zurueck. Mehrere parallel. Built-ins: `general-purpose`,
  `Explore`.
- **Hooks** (User-konfigurierbar, Shell-Commands): `PreToolUse` (kann blocken/modifizieren),
  `PostToolUse`, `UserPromptSubmit`, `SessionStart` (Kontext injizieren), `Stop`, `SubagentStop`,
  `PreCompact`, `Notification`. Plus `toolPermission`-Hook gegen den Permission-Modus.
- **Skills -- Progressive Disclosure, model-getrieben**: `SKILL.md` mit YAML-Frontmatter
  (name/description/allowed-tools). Beim Start nur Name+Description je Skill im Kontext (Katalog);
  bei Bedarf ruft der Model das `Skill`-Tool -> voller SKILL.md-Body kommt in den Message-Stream
  -> kann weitere Dateien on demand referenzieren. Kein Klassifikator.
- **Weiteres**: Slash-Commands (`.claude/commands/*.md`, `$ARGUMENTS`, `!`bash``, `@file`);
  CLAUDE.md/Memory (`#` haengt Memory-Zeile an, `/memory` editiert); Cost-Tracker + `/context`/`/cost`.

### 2.2 EnBW Cowork -- die Architektur in Kuerze

- **Cowork baut den Loop nicht selbst**: Electron-Desktop-App, deren Main-Prozess Agent-Konversationen
  ueber das **`@mariozechner/pi-coding-agent`-SDK** (`createAgentSession`) ausfuehrt -- Mario
  Zechners Open-Source-"pi"-Coding-Agent, konzeptionell ein Claude-Code-Verschnitt. Provider-Routing
  ueber `@mariozechner/pi-ai` (Anthropic-SDK, Bedrock, Ollama, OpenAI-kompatibel). Eigenleistung
  von Cowork: `system-prompt-builder.ts`, `prompt-cache-utils.ts` (ADR-19), `tool-adapter.ts`
  (MCP -> SDK-ToolDefinition), `agent-skills-resolver.ts`, `agent-streaming.ts`, Sandbox
  (`@anthropic-ai/sandbox-runtime`, OS-Level), Subagents (`subagent/` + Advisor),
  OTel-Instrumentierung, AG-UI-Protokoll-Emitter, Session-Reuse-Cache.
- **Loop/Tools/Compaction (vom SDK)**: Streaming-ReAct-Loop; Tools = `createBashTool/EditTool/
  ReadTool/WriteTool` + Custom-Tools (inkl. MCP-Bridge). Compaction (SDK-built-in):
  `DEFAULT_COMPACTION_SETTINGS = {enabled:true, reserveTokens:16384, keepRecentTokens:20000}`;
  `shouldCompact` = kompaktiere wenn `contextTokens > contextWindow - reserveTokens` (~16k vor dem
  Limit); beim Kompaktieren behaelt `findCutPoint` ~die letzten 20k Tokens, der Rest geht in einen
  dedizierten `generateSummary`-Call (maxTokens ~0,8 x reserveTokens ~13k); plus Branch- und
  Turn-Prefix-Summaries. Cowork uebergibt `compaction: {enabled:true}` (fuer Ollama mit kleinem
  Fenster proportional skaliert/abgeschaltet). **Kein** Microcompaction einzelner Tool-Results --
  der Schnitt ist rein token-budget-basiert vom Ende her. Tool-Output: harte Per-Tool-Truncation
  (grep -> erste 50 Zeilen, find -> erste 100 Dateien, WebFetch -> auf `maxLength` gekappt; SDK-
  `createReadTool` mit eigenen Limits). Keine Externalization.
- **Prompt-Caching -- dasselbe Mechanismus-Muster wie Obsilo, aber mit Disziplin**:
  `prompt-cache-utils.ts` (ADR-19): `shouldApplyCache(provider)` -> nur `anthropic`/`bedrock`;
  `injectCacheControl(payload)` haengt sich ueber den SDK-Hook `_onPayload` in den ausgehenden
  Request, wandelt `system: string` -> `[{type:'text', text}]` und taggt **den letzten System-Block**
  mit `cache_control: {type:'ephemeral'}`. Also genau ein Breakpoint, auf dem gesamten System-Prompt
  -- exakt das Muster, das Obsilo auch hat. **Aber bei Cowork ist der System-Prompt sessionweit
  stabil**: `DEFAULT_SYSTEM_PROMPT` (oder User-/MDM-Template) mit `{dateStr}`/`{isoDate}`-Substitution
  (**tagesgranular**, nicht pro Call), plus Security-Prompt, `workspace_info`, Sandbox-Policy,
  `skill_runtime_policy`, Citation-Block, Web-Policy, gebuendelte Pfad-Hints, Folder-Prompt-Snapshot
  (zu Session-Beginn eingefroren). Nichts davon aendert sich zwischen Iterationen. Zusaetzlich
  entscheidet ein `systemPromptHash` (sha256 der Inputs) ueber Session-Reuse -- aendert sich der
  Prompt, wird eine neue pi-Session gebaut. Und `extractCacheStats(usage)` -> `cacheHitRate` wird
  getrackt und in der UI gezeigt; `prompt-cache-integration.test.ts`/`prompt-cache-oneshot.test.ts`
  pruefen das aktiv. **Was Cowork NICHT tut**: keinen Breakpoint auf `tools` oder in der
  Message-History -- in langen Sessions wird die wachsende History weiterhin uncached neu gesendet
  (dasselbe Deckenproblem, das auch Obsilo nach dem System-Prompt-Fix noch haette).
- **Subagents mit harten Budgets**: `subagent/` (`createSubagentTool` + `SubagentLimits` +
  `subagent-runner` + `subagent-types`, per `configStore.get('subagentEnabled')` schaltbar) plus
  **Advisor-Subagent** (FEATURE-039, ADR-46/56/57): `consult_advisor`-Tool -- der Haupt-Agent muss
  ein strukturiertes Kontext-Paket schnueren (`problem`, `relevant_context`, `failed_attempts`,
  `constraints`) mit **hartem Budget 3000 Tokens/Call** + Secret-Redaction; bei Ueberschreitung
  Tool-Error mit Ist-/Soll-Zahlen, damit der Agent kuerzt. Ein disziplinierter Bounded-Handoff-
  Pattern, den Obsilos `spawnSubtask` (erbt Parent-Kontext, kein Budget) so nicht hat.
- **Skills/Sandbox/Observability**: Skills via pi-SDK `DefaultResourceLoader` (`additionalSkillPaths`)
  + Coworks `SkillsAdapter` (Filter auf managed skill files), pi-SDK macht Progressive Disclosure
  (Katalog -> SKILL.md on demand) wie Claude Code, plus `skill_runtime_policy`-Block im System-Prompt.
  Sandbox: OS-Level-Isolation, Per-Session-Grants fuer Pfade ausserhalb des Workspace, Web
  standardmaessig deaktiviert (Policy im System-Prompt). Observability: OTel-Instrumentierung
  (`otel-tool-wrapper.ts`) -- jeder Tool-Call als Span, Token/Permission/File/Skill-Events typisiert;
  `retry: {enabled:true, maxRetries:2}`; Session-Reuse-Cache (`MAX_CACHED_SESSIONS`, evict-oldest).

### 2.3 Obsilo -- die relevanten Eckpunkte

(Details: Codebase-Map; hier nur was fuer den Vergleich zaehlt.)

- ReAct-Loop in `AgentTask.ts` (`for iteration < MAX_ITERATIONS=25`, aeusserer Notfall-Retry-Loop),
  Power-Steering, Soft-Limit bei 60 %, `consecutiveMistakeLimit`, `toolErrors`-Map, History-
  Sanitization vor jedem API-Call (BUG-017).
- System-Prompt in `systemPrompt.ts`: 9 "stabile" Sections, gedanklicher Cache-Breakpoint,
  9 "dynamische" Sections inkl. **Memory-Block, Active Skills, Vault Context, DateTime (zuletzt)**.
- Provider (`anthropic.ts`): **genau ein** `cache_control: ephemeral` auf dem **gesamten
  System-Prompt-String** + eins auf der **letzten User-Message**.
- Tool-Info **doppelt**: kompakte Listung im System-Prompt-Text *und* vollstaendige Schemas ueber
  das `tools`-API-Feld. ~90 registrierte Tools.
- Condensing nur bei ~70 % Kontextfenster (oder Notfall bei 400-Overflow); kein laufendes Pruning
  alter Tool-Results.
- Externalization (ADR-63): existiert, aber nur im `FastPathExecutor` aktiv verdrahtet.
- Active Skills: ein **LLM-Klassifikations-Call pro User-Message** waehlt relevante Skills, deren
  Inhalt wird in den **System-Prompt** injiziert.
- `spawnSubtask`/`new_task`-Tool: existiert, Tiefenlimit 2, erbt Mode/Rules/Skills des Parents
  (kein eigener System-Prompt), wird selten genutzt; Web-Recherche laeuft im Hauptkontext.
- Memory v2: `ContextComposer` injiziert pro Turn einen je nach Topic-Lock/Drift **wechselnden**
  Memory-Block in den System-Prompt.
- Keine User-konfigurierbaren Hooks; stattdessen Code-Level-Callbacks (onApprovalRequired,
  onPreCompactionFlush, ...).

### 2.4 Direktvergleich

| Dimension | Claude Code | EnBW Cowork | Obsilo | Delta / Bewertung |
|---|---|---|---|---|
| Loop: selbst gebaut oder SDK? | Claude Agent SDK (embedded) | `@mariozechner/pi-coding-agent` (embedded) | **selbst** (Kilo-Fork) | beide Referenzen *kaufen* den Loop; Obsilo ist der einzige mit Eigenbau |
| Loop-Form (ReAct, Streaming, Tool-Loop) | ja | ja | ja | **gleich** -- kein Refactoring-Bedarf am Loop selbst |
| Parallel-Tool-Ausfuehrung (read-only) | ja | ja (SDK) | ja | gleich |
| Abort/Retry/Rate-Limit | ja | ja (`retry maxRetries:2`) | ja (+ Notfall-Condensing) | gleich/+ Obsilo |
| **Prompt-Caching: stabiler Session-Praefix** | ja, sessionweit stabil, mehrere Breakpoints | **ja** -- 1 Breakpoint, aber System-Prompt sessionweit stabil (Datum tagesgranular, kein per-Turn-Inhalt, Hash gated Session-Reuse), `cacheHitRate` getrackt | **nein** -- **dasselbe 1-Breakpoint-Verfahren wie Cowork**, aber System-Prompt traegt per-Call/per-Turn-Inhalt (DateTime, Memory-Block, Active Skills, Vault Context) -> ~0 Cache-Hit | **groesster Befund** -- Cowork beweist: Mechanik OK, Obsilo fehlt die Disziplin (Abschnitt 3) |
| Tool-Schemas: wo | nur `tools`-API-Feld | nur `tools`-API-Feld (SDK) | doppelt (System-Text + `tools`-Feld) | Obsilo verschwendet Tokens **und** Cache-Stabilitaet |
| Cache-Breakpoint auf `tools` / Message-History | ja (rollend) | **nein** (nur System) | nein | Cowork hat das Decken-Problem langer Sessions weiterhin -- kein Silver Bullet |
| Laufendes Tool-Result-Pruning (Microcompaction) | ja | **nein** | **nein** (erst Voll-Condensing bei 70 %) | nur Claude Code; lohnt fuer Obsilo |
| Voll-Compaction (Summary-Call) | ja, sehr ausgereift | ja (SDK: reserve 16k, keepRecent 20k, threshold-getriggert) | ja (`condenseHistory`, Smart-Tail, Pre-Compaction-Flush) -- aber nur bei 70 % | Obsilos Trigger ist starr/spaet; SDK-Defaults sind die bessere Heuristik |
| Grosse Tool-Outputs | harte Caps + "lies neu" | harte Per-Tool-Caps | **Externalization in tmp-Datei + kompakte Referenz** | Obsilo-Konzept **besser** als beide, aber nur im FastPath verdrahtet -> auf Hauptloop ausrollen |
| Subagents | erstklassiges `Task`-Tool, eigener System-Prompt, parallel | `subagent/`-Tool + **Advisor** mit hartem 3000-Token-Budget/Call + Redaction | `spawnSubtask` vorhanden, erbt Parent-Kontext, **kein Budget**, kaum genutzt | beide Referenzen nutzen Subagents diszipliniert; Obsilo hat die Mechanik, nutzt sie nicht |
| Skills-Laden | model-getrieben, on demand als Tool-Result (cache-neutral) | model-getrieben (pi-SDK Progressive Disclosure) | Klassifikator-Call + Inhalt in den System-Prompt (Extra-Round-Trip + Cache-Poison) | Obsilo ist hier der Ausreisser; SDK-Weg klar guenstiger |
| Hooks (User-konfigurierbar) | ja (8 Events) | nein (Code-Level) | nein (Code-Callbacks) | "nice to have", nicht kostenrelevant |
| Slash-Commands / Workflows | ja | ja (Prompt-Templates) | ja | gleich |
| Memory-Dateien (CLAUDE.md-Stil) | ja, statisch | ja (Folder-Prompt-Snapshot bei Session-Start, statisch) | ja (`memory/`) + zusaetzlich **dynamisches "Memory v2" im System-Prompt** | nur Obsilo injiziert per-Turn -> Cache-Konflikt (Abschnitt 3, offene Frage 2) |
| Verbrauch sichtbar | `/context`, `/cost`, Cost-Tracker | `cacheHitRate` + Token-Usage in UI, OTel-Spans | nur Post-hoc-Log (`acaf53a`) | Obsilo hinkt nach (Hebel I) |
| Observability-Instrumentierung | ja | **ja, OpenTelemetry** (Tool-Spans, Token/Permission/Skill-Events) | nein | Cowork ist hier am weitesten -- Vorbild fuer Hebel I |
| Plan/Implement-Trennung | Plan-Mode (read-only -> `ExitPlanMode`) | nein | kein explizites Aequivalent | bewusst out-of-scope fuer Obsilo (Entscheidung 2026-05-12, s. §4.4) -- Workload triggert es selten |

---

## 3. Der Caching-Befund (gemessen, 2026-05-12)

**Status: belegt** (5-Provider-Messlauf, s. §1.2). Differenziertes Bild:

- **Auto-Caching-Provider (Copilot, OpenAI, OpenRouter): Caching greift, 75–99 % Hit ab Call 2.**
  Hier ist *nichts zu tun* an der Caching-Mechanik selbst — nur die Kostenanzeige stimmt nicht
  (Befund D unten).
- **Anthropic direkt: unser `cache_control`-Marker sitzt falsch.** `anthropic.ts` setzt **einen**
  Marker auf den **kompletten** System-Prompt-String, der den volatilen Tail enthält (DateTime —
  der Code-Kommentar gibt es selbst zu: "DateTime -- MUST be last -- timestamp invalidates cache" —,
  Memory-Block von `ContextComposer`, Active Skills, Recipe-Section, Vault-Context). Ändert sich
  irgendetwas davon zwischen zwei API-Calls (gemessen: ~1 s genügte, DateTime tickte), ist der
  ganze [tools+system]-Cache invalid → `cacheRead=0, cacheCreate=21479` statt Hit. Da Anthropic
  **+25 %** auf Cache-Writes aufschlägt, zahlt man das bei jeder Iteration → in der Summe **teurer
  als ohne Caching** (im Test: cacheW=44510 dominierte die Turn-Kosten, $0,17 von $0,21). Der
  zweite Marker auf der "letzten User-Message" hilft nicht, weil der Präfix bis dahin mit dem
  volatilen System-Prompt beginnt.
- **Bedrock: gar kein Caching.** `bedrock.ts` injiziert keinen `cachePoint` — `cacheRead=0` *und*
  `cacheCreate=0` durchgehend, egal was der `promptCachingEnabled`-Toggle sagt.

**Korrektur:** der "12–14 EUR/Mio effektive Rate"-Eindruck aus dem Auslöser-Chat war ein **Artefakt
der Kostenrechnung** (cacheR nicht abgezogen, Befund D), nicht der API. Caching war auf dem dort
genutzten Pfad (Copilot "via Sub") wahrscheinlich schon immer aktiv.

**Was zu tun ist (Welle 1):**

1. **Anthropic-Pfad: System-Prompt als Array** an die API statt als String:
   `[{text: <stabiler Block>, cache_control}, {text: <volatiler Tail>}]` — der stabile Block
   (Verhalten, Conventions, Tool-Listung, Routing, Objective, Security, Capabilities — alles was
   sich in einer Session nicht ändert) bekommt den Marker, der volatile Tail (DateTime, Memory,
   Active Skills, Recipe, Vault-Context) **keinen**. Dann hält der Cache turnübergreifend.
2. **DateTime auf Tagesgranularität** kappen (oder ganz in die letzte User-Message verschieben) —
   gilt auch für die Auto-Caching-Provider, dort verbessert es die Hit-Rate.
3. **Tool-Schemas (`tools`-Feld) eigener Breakpoint** (Anthropic erlaubt `cache_control` auf dem
   letzten Tool) — ~30k Tokens, lohnt sich.
4. **Memory-Block + Active Skills aus dem gecachten System-Bereich raus** — als Block nach dem
   Breakpoint, oder besser: Active Skills auf den model-getriebenen Skill-Tool-Weg umstellen (spart
   den Klassifikator-Call und macht den Präfix stabiler — vgl. §2 Claude Code / Cowork).
5. **Rollende Breakpoints in der Message-History** (1–2), damit auch der Konversationsteil langer
   Sessions überwiegend Cache-Reads erzeugt.
6. **Bedrock: `cachePoint` injizieren** (analog Coworks `_onPayload`-Pfad bzw. dem AWS-`cachePoint`-
   Format).
7. **`cached_tokens` in `usage`-Chunk + Kostenrechnung verdrahten** (openai-Familie) — Befund D.

> **Beleg, dass Punkt 1–2 funktionieren:** EnBW Cowork (`prompt-cache-utils.ts`) verwendet dieselbe
> 1-Marker-`injectCacheControl`-Mechanik wie Obsilo, erreicht aber echte Hits — weil der
> System-Prompt dort sessionweit stabil ist (Datum tagesgranular, kein per-Turn-Memory-Inject,
> Session-Reuse über `systemPromptHash`). Es ist *nicht* die Mechanik, es ist die Volatilität davor.

> ~~Tool-Doppelung auflösen~~ — gestrichen: die Tool-Listung im System-Prompt-Text ist nur 2810
> Chars (~700 Tokens, Befund F), kein relevanter Posten.

Offen: BUG-016 — Memory + Context-Prefix gehen am konfigurierten Provider vorbei direkt auf
Anthropic; auf dem Bypass-Pfad gilt dieselbe Marker-Problematik wie Punkt 1, plus es schlägt fehl
wenn der Anthropic-Account leer ist (im Messlauf: `[Memory] Extraction paused`,
`[SemanticIndex] Contextual retrieval paused`).

---

## 4. Quellen-Synthese -- State of the Art

Zwei externe Quellen, unabhaengig voneinander, decken sich stark.

### 4.1 Management-Briefing "LLM-Tokenkosten und Optimierung" (Mai 2026), Kap. 12

Kapitel 12 ("Agent-Loop-Architektur") nennt 6 strukturelle Hebel:

| # | Hebel | Kernaussage | Belegte Einsparung |
|---|---|---|---|
| 1 | Task-Dekomposition | Atomare Tasks: 5-30k statt 50-200k Kontext/Iteration, 3-6 statt 8-20 Iterationen | 40-75 % pro komplexer Aufgabe |
| 2 | Subagent-Isolation | Subagent-History bleibt lokal, nur kompaktierte Ergebnisse zurueck | Orchestrator-Kontext stabil statt 15x Wachstum |
| 3 | Lazy-Loading (Skills-Pattern) | Beim Start nur Verzeichnis; Skill-/Tool-Details on demand, danach entladen | 80-90 % auf Instruktions-/Schema-Anteil |
| 4 | Tool-Output-Filterung | Output-Hooks (rtk-Pattern), strukturierte Tool-Responses, Token-Budgets pro Call | 20-40 % Gesamtreduktion (Tool-Output = 30-50 % des Kontexts) |
| 5 | Gesteuertes Compacting | An natuerlichen Uebergaengen statt zufaellig; Constraints in persistente Instruktionen | 40-60 % kumulierter Verbrauch |
| 6 | Autonomie-Governance | Iterations-Caps, Token-Budget pro Task, Steering-Hooks, Exploration-Limits | verhindert Runaway-Loops |

Plus Querschnitt aus Kap. 7: **Provider-Prompt-Caching** -- groesster Einzelhebel, 90 % Rabatt auf
gecachte Tokens (Anthropic/Bedrock/Azure OpenAI), zwingend praefix-stabile Prompt-Struktur.

### 4.2 ToDo Developer Podcast Ep. 163 (Lantin/Thiel) -- 11 Strategien aus der Praxis

Deckungsgleich mit Kap. 12, ergaenzt um konkrete Tool-/UX-Patterns: (1) Verbrauch sichtbar machen
(`/usage`, `/session`; Input vs. Output getrennt); (2) Tasks atomar schneiden; (3) Analyse und
Implementierung trennen (Plan -> reviewen -> Kontext leeren -> mit finalem Plan in die Umsetzung;
verschiedene Modelle pro Phase); (4) relevanten Kontext gezielt mitgeben (@-Mention statt
Exploration; AGENTS.md mit Repo-Baum; "jede Iteration liest den ganzen WhatsApp-Verlauf von vorne");
(5) Terminal-Output filtern (`grep` vorschalten, letzte N Zeilen; rtk-Hook; Screenshots vermeiden);
(6) Kontext komprimieren / Session wechseln (`/compact` an natuerlichen Uebergaengen); (7) Subagents
(spezialisiert, Historie lokal, nur Ergebnisse zurueck); (8) Skills statt aufgeblaehter Instructions
(Verzeichnis-Scan beim Start, Inhalt + MCP-Server on demand); (9) Modellwahl pro Aufgabe -- "groesster
Einzelhebel" (Haiku/Flash fuer Summaries/Extraktion, Sonnet fuer Standard, Opus nur fuer komplexes
Reasoning / finale Plan-Reviews; Extended Thinking bei einfachen Aufgaben aus); (10) Caveman-Modus
(Output-Reduktion; faerbt auf PR-Beschreibungen ab; via Custom Instructions loesbar); (11) Prompt
Caching nutzen (Statisches an den Anfang, Dynamisches ans Ende; gecachte Anthropic-Tokens = 10 % Preis).

### 4.3 Weitere relevante Briefing-Kapitel (13 RAG, 15 Observability, 18 Gegenthese)

- **Kap. 13 RAG-/Retrieval-Optimierung** -- direkt uebertragbar auf Obsilo (`semantic_search`,
  `read_file`, KnowledgeDB): semantisches Chunking (Ø 400-512 Tokens, 25 % Overlap, Satzgrenzen,
  ~60 % weniger Tokens); Top-k von 5 auf 3 + Multi-Stage mit Reranker (~40 % weniger abgerufene
  Tokens); **Rolling-Summary fuer die Konversationshistorie** -- aeltere Runden durch komprimierte
  Zusammenfassung ersetzen, belegt ~75 % weniger Kontext-Tokens in langen Gespraechen (= spezifische
  Form von Hebel D fuer Multi-Turn-Chats, betrifft den Obsilo-Hauptanwendungsfall).
- **Kap. 15 Observability/FinOps** -- "ohne Messung keine Optimierung". Kern-KPIs: Input/Output/
  Reasoning-Tokens pro Request, **Cache-Hit-Rate (Ziel > 50 %, exzellent > 80 %)**, Tokens pro
  erfolgreichem Outcome. Stuetzt Hebel I.
- **Kap. 18 Gegenthese** -- "Token-Optimierung das richtige Problem?". Preisverfall ist real aber
  kein Selbstlaeufer (agentic Workloads treiben Tokens pro Outcome hoch, Subventionen enden);
  groesster Posten ist oft Nicht-Nutzung; richtige Metrik ist Kosten pro eingesparter Arbeitsstunde,
  nicht pro Token. **Fuer Obsilo gilt die Gegenthese nur eingeschraenkt:** der Nutzer bezahlt seine
  API-Kosten selbst, ein Turn fuer 7-12 EUR macht das Plugin fuer Alltags-Knowledge-Work unbenutzbar
  -- hier IST der Token-Verbrauch das Adoptionsproblem. Trotzdem als Leitplanke ernst nehmen: nicht
  blind auf "minimal Tokens" optimieren, sondern auf "Aufgabe wird zuverlaessig zu vertretbaren
  Kosten erledigt". Qualitaetsregression durch zu aggressives Compacting/Routing ist ein realer
  Trade-off (vgl. Memory: feedback_critical_analysis).

### 4.4 Konsolidierte Hebel-Liste (Schnittmenge der Quellen)

A. Prompt-Caching wirklich aktivieren (Praefix-Stabilitaet, Breakpoints, Bypass-Pfade schliessen)
B. Lazy-Loading von Tool-Schemas und Skill-Inhalten
C. Tool-Output-Filterung + harte Output-Budgets pro Tool-Call (besonders web_fetch/web_search/read_file/Edit-Diffs)
D. Gesteuertes Compacting an natuerlichen Uebergaengen
E. Subagent-Isolation als Default fuer Recherche-/Explorationsteilaufgaben (mit Token-Budget/Call)
F. ~~Analyse/Implementierung trennen, Kontext-Reset zwischen Phasen (Plan-Modus)~~ -- **out-of-scope** (Entscheidung Sebastian 2026-05-12): Obsilos Workload (Q&A, Notiz-Edit, leichte Recherche) triggert einen Plan-Modus selten; grosser Hebel fuer Coding-Agenten, kleiner fuer Obsilo. Wiedervorlage falls sich das aendert.
G. Autonomie-Governance: Iterations-Cap, Token-Budget pro Task, Steering-Hook
H. Model Routing: billiges Modell fuer Recherche/Extraktion/Summaries/Condensing, teures fuer finalen Plan-Review
I. Verbrauch sichtbar machen: Per-Turn-Token-/Kosten-Anzeige + Cache-Hit-Rate in der Sidebar (Input/Output getrennt, kumulativ); mittelfristig OTel-Spans wie Cowork
J. Output-Knappheit via System-Prompt-Leitplanke (kein eigenes Tool noetig)
K. Rolling-Summary fuer die Konversationshistorie + Retrieval-Tuning (semantisches Chunking, Top-k senken, Reranker) -- spezifische Auspraegung von D und C fuer den dialogischen Notiz-Anwendungsfall
L. Microcompaction: laufendes Pruning der Inhalte alter Tool-Results (Skelett behalten) -- Claude-Code-Pattern, angepasst an Obsilos Externalization

---

## 5. Diagnose: konkrete Treiber im Obsilo-Loop

Stand Code (`src/core/AgentTask.ts`, `src/core/FastPathExecutor.ts`, `src/core/prompts/sections/*`,
`src/api/providers/anthropic.ts`):

| Treiber | Wo | Befund (gemessen 2026-05-12) | Hebel |
|---|---|---|---|
| **Tool-Results akkumulieren ungekürzt** | `AgentTask.ts` (kein Pruning), `ReadFileTool` (Cap 50000 Chars/Datei), Search-/Semantic-Tools | 4 Reads in 1 Turn = ~31k Tokens in der History; nach dem Turn keine Komprimierung → wächst monoton; 58-Msg-Chat: `hist=138652t`. **Dominanter Wachstumstreiber.** | L, D |
| Riesige User-Messages (Paste / @-Mention) | `AttachmentHandler.truncateTextFileForContext` (Cap 80k Chars *pro Datei*), kein Cap bei direktem Paste | Im 58-Msg-Chat: Msg #0=78169t, Msg #22=24879t — reingepastetes/@-mentiontes Material, fährt für immer mit. | C |
| Anthropic-`cache_control` an falscher Stelle | `anthropic.ts` (1 Marker auf ganzem System-String), `systemPrompt.ts` (DateTime/Memory/ActiveSkills/Recipe im gecachten Bereich) | Gemessen: Call2 `cacheRead=0, cacheCreate=21479` → Miss + 25 % Write-Aufschlag → teurer als ohne Caching. Bedrock: gar kein `cachePoint`. | A |
| Kostenanzeige überschätzt | openai-Familie (`openai.ts`/`kilo-gateway.ts`/`github-copilot.ts`) liest `cached_tokens` nicht aus | `[Cost] cacheR=0` trotz 16–22k Cache-Reads → ~2–3× zu hohe Anzeige. | I (Teil) |
| Externalize → sofortiges Re-Read | `ResultExternalizer` (schliesst `read_file` aus) + Agent liest tmp-Datei zurück | 4 von 5 Tests: Externalizer schreibt tmp + kompakte Ref, Agent liest sofort die ganzen Chars zurück → No-Op. | C, E |
| web_fetch/web_search ungefiltert im Hauptloop | Web-Tools + Externalizer | ADR-63-Externalizer nur im FastPathExecutor verdrahtet. Auslöser-Chat Turn 4: 3 web_fetch + 2 search = 882k Input (UI). | C |
| Edit-Diffs in History | `ReadFileTool` + Edit-Tools | Grosse `old_str`/`new_str` + Erfolgs-Diff bleiben im Volltext in der History. | C, L |
| Kein Compacting an Übergängen | `AgentTask.ts:657-685` — Condensing nur auf text-only-Turn-Ende ab `condensingThreshold` (70 %) oder Notfall bei 400 | Zwischen Turns kein Reset. History wächst monoton bis 70 % Fenster. | D, L, F |
| Explorative Teilaufgaben im Hauptkontext | mehrschrittige Such-/Lese-/Recherche-Sequenzen laufen im Haupt-Loop, nicht in einem Subagent | `spawnSubtask`/`new_task` existiert (lean konfiguriert: `false, 80, 0, maxIterations`), ist aber nicht prominent und hat kein Per-Call-Budget; alle Zwischen-Tool-Results (Web-Pages, Search-Treffer, Multi-File-Reads) landen im Eltern-Kontext statt nur das Ergebnis. (Parallelisierung via `Promise.all` ist orthogonal — Latenz, nicht Kontext.) | E, G |
| Active-Skills-Klassifikator + Inject | `skills.ts` + Klassifikations-Call | Extra LLM-Round-Trip pro User-Message; Inhalt landet im (cache-schädlichen) System-Prompt. | A, B |
| Tool-Schemas ab Iter. 1 voll im `tools`-Feld | `prompts/sections/tools.ts` + `tools`-API-Feld | 35 Tools, ~30k Tokens, jede Iteration. (Tool-Listung im System-Prompt-Text dagegen nur ~700 Tokens — kein Posten.) | B |
| Kein internes Model-Routing für Hilfs-Calls | `plan_presentation`, Recipe-Planner, Condensing nutzen Haupt-Modell | Interne LLM-Calls laufen auf dem konfigurierten (oft teuren) Modell. | H |
| Keine Token-Budget-Bremse pro Task | `maxIterations=25`, `consecutiveMistakeLimit` | Iterations-Cap existiert, aber kein kumulatives Token-/Kosten-Budget mit Pause+Rückfrage. | G |
| Kosten/Cache-Hit-Rate nicht sichtbar | Sidebar | Nutzer sieht nur Post-hoc-`[Cost]`-Log (das auch noch überschätzt). | I |
| tmp-Cleanup `EPERM` auf iCloud | `ResultExternalizer`-Cleanup | Non-fatal, aber tmp-Files bleiben liegen. | (Bug) |

---

## 6. Hebel-Bewertung (Impact x Aufwand)

| Hebel | Impact | Aufwand | Schon teilweise da? | Prioritaet |
|---|---|---|---|---|
| L Microcompaction (Tool-Result-Pruning an Turn-Grenzen) | **sehr hoch** (Tool-Output dominiert das History-Wachstum; gemessen) | mittel (Erweiterung der Condensing-Mechanik) | -- (Claude-Code-Pattern) | **P0** |
| C Tool-Output-Budgets im Haupt-Loop + Re-Read-Cap + grosse User-Messages kappen | hoch (Web-Tools/Paste = Spitzen; gemessen Msg #0=78k) | mittel | Externalizer existiert (FastPath); `read_file`-Cap (50k) und @-Mention-Cap (80k) existieren, greifen aber nicht gegen Akkumulation/Paste | **P0** |
| A Anthropic-/Bedrock-Caching-Fix + `cached_tokens` in Kostenrechnung verdrahten | hoch auf Anthropic/Bedrock (heute teurer als ohne); auf Auto-Caching-Providern n/a | mittel (System-Prompt-Array, DateTime tagesgranular, `tools`-Breakpoint, Bedrock `cachePoint`, openai-cacheR-Wiring) | Auto-Caching greift bereits (Copilot/OpenAI/OpenRouter, gemessen) | **P0** |
| D Gesteuertes Compacting an natürlichen Übergängen | hoch (40-60 %) | mittel-hoch (Trigger-Punkte, Constraints persistent halten) | Condensing-Mechanik existiert, nur Trigger fehlen | **P1** |
| K Rolling-Summary für alte User-Messages/History | hoch (~75 % in langen Chats) | mittel (Ausprägung von D) | Condensing-Mechanik existiert | **P1** |
| E Subagent-Delegation für context-heavy Teilaufgaben (Recherche/Exploration/Multi-Read), mit Per-Call-Budget | mittel-hoch | mittel (`spawnSubtask` da, prominent machen + Profile + Budget + Prompt-Leitplanke nötig) | `spawnSubtask`/`new_task` vorhanden | **P1** |
| I Kosten-/Token-Anzeige in Sidebar + Cache-Hit-Rate | mittel (Verhaltenseffekt; Diagnose-Werkzeug) | niedrig (UI); der Wiring-Teil ist in A | Token-Counts geloggt; Cowork `extractCacheStats` als Vorlage | **P1** |
| B-Teil Active-Skills on-demand | mittel (spart Klassifikator-Roundtrip + Cache-Stabilitaet) | mittel | Plugin-Skills haben Verzeichnis-Konzept | **P1** (ADR-116, FEAT-24-09, Welle 2) |
| B-Teil Lazy-Loading Tool-Schemas (Built-in + **MCP**) | hoch bei verbundenen MCP-Servern (volle MCP-Tool-Schemas heute bei jedem Call, kein Deferral, instabil bei Server-Aenderungen); Built-in-Anteil ~10-20k, FEATURE-1600 deckt die schweren schon | mittel-hoch (MCP-Tools deferred machen + per-Server-Katalog; nutzt FEATURE-1600-Mechanik `find_tool`) | FEATURE-1600 (deferred Built-ins) vorhanden | **P1** (ADR-117, FEAT-24-06, Welle 2) -- hochgestuft 2026-05-12 wegen MCP-Anteil |
| G Token-/Kosten-Budget pro Task + Steering | mittel (Runaway-Schutz, nicht Durchschnitt) | niedrig-mittel | `maxIterations` da | **P2** |
| H Internes Model-Routing für Hilfs-Calls | mittel | mittel (zweites Modell konfigurierbar) | Multi-Provider-Infra da | **P2** |
| F Analyse/Implementierung trennen mit Kontext-Reset (Plan-Modus) | -- | -- | -- | **out-of-scope** (Entscheidung 2026-05-12, s. §4.4) |
| J Output-Knappheit via Prompt | niedrig (Output ist nicht das Problem) | niedrig | -- | **P3** |

---

## 7. Bewertung: verbessern oder neu bauen?

**Verbessern. Kein neuer Agent-Loop noetig. Kein Umstieg auf ein SDK.**

Begruendung:

- Der **Loop-Kern** (Streaming-ReAct, Tool-Dispatch, Parallelitaet, Abort, Retry, Sanitization) ist
  im Wesentlichen das, was Claude Code und Cowork auch tun, und auf vergleichbarem Stand -- teils
  mit mehr Robustheit (Notfall-Condensing, `toolErrors`-Verbatim-Weitergabe, Sanitization an allen
  Send-Sites). Ein Neubau wuerde diese Reife wegwerfen, ohne den Loop-Kern besser zu machen.
- Die Kostenprobleme liegen **ausserhalb** des Loop-Kerns: Caching-Disziplin, Compaction-Trigger,
  Tool-Output-Disziplin, Subagent-Kultur, Skill-Laden, Tool-Doppelung. Das sind allesamt
  **lokalisierte, additive** Aenderungen an klar abgrenzbaren Stellen (`anthropic.ts` +
  Schwester-Provider, `systemPrompt.ts`, `AgentTask.ts` Condensing-Trigger, ADR-63-Verdrahtung,
  Skill-Sektion, ein Recherche-Subtask-Routing).
- Zwei Obsilo-Eigenheiten sind sogar **besser** als Claude Code und sollten bleiben: Externalization
  (ADR-63) statt Truncate-and-reread; Notfall-Condensing bei API-Overflow.
- **EnBW Cowork ist der zweite, unabhaengige Beleg**: Cowork nutzt exakt dasselbe
  1-Breakpoint-Caching wie Obsilo und exakt das Threshold-Compaction-Pattern -- und es funktioniert,
  weil Cowork Disziplin hat (System-Prompt sessionweit stabil, tagesgranulares Datum, kein
  per-Turn-Memory-Inject, Hash gated Session-Reuse, `cacheHitRate` getrackt). Das ist *kein
  Loop-Unterschied*, es ist *Disziplin um den Loop herum*.
- **Auf ein SDK umsteigen (Claude Agent SDK / pi-coding-agent), wie Claude Code und Cowork es tun?
  Nein.** Obsilos eigener Loop traegt ~90 Tools, Memory v2, FastPath, Sandbox, Plugin-API,
  Multi-Provider, i18n -- alles fest verdrahtet. Ein Rip-and-Replace waere ein Mehrmonats-Projekt
  mit hohem Regressionsrisiko und ohne fachlichen Mehrwert. Der Erkenntniswert von Claude Code und
  Cowork ist nicht "nimm ihren Loop", sondern "uebernimm ihre *Disziplinen*": sessionweit stabiler
  gecachter Praefix, Threshold-Compaction mit Recent-Keep, gebudgetete Subagent-Handoffs,
  Progressive-Disclosure-Skills, eingebaute Cache-/Token-Telemetrie.

**Was *nicht* uebernommen werden muss:** das User-konfigurierbare Hook-System (Aufwand >> Nutzen
fuer ein Obsidian-Plugin; die Code-Callbacks decken die internen Faelle ab), das Multi-Agent-
`coordinator`/`Team`-Subsystem von Claude Code (Overkill), und die Slash-Command-Mechanik (Obsilo
hat eine).

---

## 8. Vorgeschlagene Stossrichtung fuer die Planung

Diagnose-Phase abgeschlossen (5-Provider-Messlauf 2026-05-12, Diagnose-Log `logCacheStat` +
`logInputBreakdown` ist eingebaut). Drei Wellen, jede unabhängig deploybar.

### Welle 1 -- "History-Wachstum stoppen + Caching/Anzeige geradeziehen" (P0)

- **L — Microcompaction an Turn-Grenzen:** wenn der Agent fertig ist (finaler Text, kein tool_use
  mehr), die Tool-Results dieses Turns auf Skelette eindampfen ("[read Notes/X.md — 50000 chars;
  ggf. read_file path=…]", "[semantic_search 'X' — 34 Treffer; ggf. tmp/…]"). Der nächste Turn
  startet dann bei ~System (12k) + Skelette + Antwort statt bei 48k+. Erweiterung der vorhandenen
  `condenseHistory`-Mechanik. **Akzeptanz:** 4-Datei-Read-Turn endet bei ~48k, der Folge-Turn
  startet unter ~20k; 10-Turn-Chat bleibt im History-Anteil deutlich unter linearem Wachstum.
- **C — Tool-Output-/User-Message-Caps:** (a) ADR-63-Externalizer im Hauptloop für `web_fetch`,
  `web_search`, grosse `read_file`-Results, grosse Edit-Diffs aktivieren; (b) Re-Read einer
  externalisierten tmp-Datei selbst kappen + die kompakte Referenz reichhaltiger machen +
  Prompt-Hinweis "nur nachlesen wenn du einen konkreten Abschnitt brauchst"; (c) grosse
  reingepastete/@-mentionte User-Message-Inhalte beim Reinkommen kappen + externalisieren (der
  80k-Char-Cap ist pro Datei und greift nicht bei Paste / Multi-Mention). **Akzeptanz:** ein
  Recherche-Turn mit 3 web_fetch bleibt unter ~120k Input; eine User-Message mit angehängtem
  Material überschreitet nie ~20k Tokens.
- **A — Caching-Fix (Anthropic/Bedrock) + Kostenanzeige:** die 7 Punkte aus §3 — System-Prompt als
  Array (stabiler Block mit `cache_control`, volatiler Tail ohne), DateTime tagesgranular,
  `tools`-Breakpoint, Memory/Active-Skills aus dem gecachten Bereich, rollende History-Breakpoints,
  Bedrock `cachePoint` injizieren, `cached_tokens` der openai-Familie in `usage`-Chunk + `[Cost]`
  verdrahten. (Die Auto-Caching-Provider greifen schon — hier nur DateTime-Stabilisierung +
  Kostenanzeige.) **Akzeptanz:** auf Anthropic-direkt `cacheRead` ab Call 2 > 0 statt erneutem
  `cacheCreate`; `[Cost] cacheR` auf allen Providern korrekt; angezeigte Kosten sinken auf den
  realen Wert.

### Welle 2 -- "Loop strukturell verschlanken" (P1)

- **D + K:** Compaction-Trigger an natürlichen Übergängen (vor neuem User-Turn der das Thema
  wechselt; nach erfolgreichem Edit) feiner als nur "Turn-Ende"; Rolling-Summary für alte
  User-Messages und alte Turn-Blöcke. Constraints/Conventions in System-Prompt-Sections halten,
  nicht in komprimierbare History.
- **E — Subagent-Delegation für context-heavy Teilaufgaben.** Kriterium (nicht "Web vs. Vault"):
  delegiere jede Teilaufgabe, die (a) self-contained ist, (b) eine eigene mehrschrittige
  Reasoning-Schleife braucht, (c) sperrige Zwischenstände erzeugt, die der Parent nicht braucht —
  nur das Ergebnis. Passt: "finde alles zu X im Vault" (N Suchen + M Reads → 2k-Zusammenfassung),
  "lies diese 5 Notizen und gib den Kern", Web-Recherche, Codebase-Exploration. Passt nicht: ein
  einzelnes `read_file`/`search_files` (eine Aufrufkette, ein Ergebnis, keine Schleife → Subagent
  wäre nur ein Extra-Roundtrip, vgl. Externalize→Re-Read-No-Op). Umsetzung wie Claude Code: das
  `new_task`-Tool **prominent** machen + Agent-"Profile" (Recherche/Explore-Profil mit schlankem
  eigenem System-Prompt + eingeschränkter Tool-Auswahl, analog `.claude/agents/`) + Prompt-Leitplanke
  ("nutze new_task für explorative/recherchierende Teilaufgaben") — **kein** harter Router. Plus ein
  **hartes Per-Call-Token-Budget** für Subtasks (Coworks Advisor-Pattern: bei Überschreitung
  Tool-Error mit Ist-/Soll, Agent kürzt), damit ein Recherche-Subagent nicht selbst entgleist.
  **Trade-off bewusst halten:** Subagents erhöhen den *Gesamt*-Token-Verbrauch (eigener
  System-Prompt + Tools, ~15x lt. Anthropic) — sie gewinnen nur, wenn die Alternative der
  aufgeblähte Eltern-Kontext mit Fehlschleifen ist. (Microcompaction/Hebel L bleibt unabhängig
  nötig — für die Fälle, wo der Hauptagent legitim selbst Dateien liest und sie danach nicht mehr
  braucht.)
- **I — Sidebar-Anzeige:** Live-Kosten-/Token-Anzeige (Input/Output getrennt, kumulativ,
  Cache-Hit-Rate, Warnschwelle). Cowork `extractCacheStats` als Vorlage.
- **B-Teil Active Skills** (ADR-116, FEAT-24-09): Klassifikator-Inject raus → model-getriebenes
  On-demand-Laden (Skill-Verzeichnis im stabilen System-Prompt, Body als Tool-Result, dann
  Microcompaction). Spart den per-Message-Klassifikator-Roundtrip und macht den System-Prompt
  cache-stabil (ergänzt ADR-62-Amendment).
- **B-Teil Lazy-Loading Tool-Schemas, MCP-Fokus** (ADR-117, FEAT-24-06): MCP-Tool-Schemas
  defaultseitig deferred — per-Server-Katalog im stabilen System-Prompt statt voller Schemas im
  `tools`-Feld; volles Schema on-demand via `find_tool` (nutzt FEATURE-1600-Mechanik); Opt-out
  pro Server. Der MCP-Anteil ist der eigentliche Hebel (heute volle MCP-Schemas bei jedem Call,
  kein Deferral, instabil bei Server-Aenderungen). Built-in-Default-Satz weiter slimmen ist der
  kleinere, separate Teil. Vor /coding: eine `tools`-Feld-Token-Zeile in `logInputBreakdown`, um
  den realen Umfang *mit verbundenen MCP-Servern* zu messen.

### Welle 3 -- "Governance + Routing" (P2)

- **G** (ADR-114, FEAT-24-08): Autonomie-Governance -- kumulatives Token-/Kosten-Budget pro Task mit
  Pause + Rückfrage; Steering-Hook zwischen Iterationen; weiches Exploration-Limit.
- **H** (ADR-115, FEAT-24-07): optionales "Hilfs-Modell" in den Settings (billiges Modell für die
  Agent-internen LLM-Calls: Condensing, Fast-Path-Planner/Presenter, plan_presentation, Recipe-Planner,
  ggf. Skill-Klassifikator -- letzterer entfällt mit ADR-116).
- **F** (Plan-Modus): **out-of-scope** -- Entscheidung 2026-05-12, s. §4.4.
- Kleiner Bug nebenbei: iCloud-tmp-Cleanup `EPERM` robuster machen.
- (Optional, niedrig) ein schlanker Hook-ähnlicher Erweiterungspunkt — nur wenn ein konkreter
  Use Case auftaucht.

---

## 9. Offene Fragen / zu entscheiden

1. ~~Caching-Befund verifizieren zuerst.~~ **Erledigt** (5-Provider-Messlauf 2026-05-12): Auto-Caching
   greift (Copilot/OpenAI/OpenRouter, 75–99 % Hit); Anthropic-Marker sitzt falsch (Miss + Write-
   Aufschlag); Bedrock cached gar nicht; Kostenanzeige der openai-Familie überschätzt. Dominanter
   Treiber ist aber die Tool-Result-Akkumulation in der History, nicht das Caching → Welle-1-
   Reihenfolge entsprechend (L vor A).
2. **Memory v2 vs. Caching-Disziplin.** Der per-Turn wechselnde Memory-Block ist architektonisch
   wertvoll (Topic-Lock, Drift), aber im System-Prompt cache-schaedlich. Option A: nach dem
   Breakpoint als separater System-Block. Option B: als gecachter Inhalt im Message-Stream (eigener
   Breakpoint). Option C: nur die *stabile* Soul/Profile-Schicht in den gecachten System-Block, die
   volatile Fact-Schicht in eine User-Message. Entscheidung mit Memory-v2-Roadmap abstimmen.
3. **Tool-Listung im System-Prompt: ganz raus oder Verzeichnis?** Anthropic-Modelle nutzen das
   `tools`-Feld nativ; die Text-Listung ist vermutlich nur fuer Modelle/Provider relevant, die das
   `tools`-Feld schlecht nutzen. Pro Provider entscheiden?
4. **Microcompaction-/Compaction-Aggressivitaet.** Ab welchem Alter / welcher Groesse wird ein
   Tool-Result geprunt? Threshold-getriggert wie Cowork (16k vor dem Limit, keepRecent 20k) oder
   feiner? Zu aggressiv -> Qualitaetsverlust (vgl. 4.3 Gegenthese). Shadow-Mode / A-B noetig.
5. **Subagent-Delegation: Router oder model-getrieben?** Vorzugsrichtung (s. §8 Hebel E):
   model-getrieben wie Claude Code — `new_task` prominent + Agent-Profile + Prompt-Leitplanke,
   kein harter Router. Offen bleibt: welche Profile (nur "Recherche/Explore", oder auch andere?),
   und ob es zusätzlich eine *weiche* Heuristik gibt ("ab N geplanten Such-/Lese-Calls schlage
   new_task vor"). Kriterium für "wann delegieren" ist self-contained + eigene Reasoning-Schleife +
   sperrige Zwischenstände — nicht die Tool-Familie.
6. **Lazy-Loading: lohnt der Tool-Registry-Refactor?** Abhaengig davon, wie gross der Schema-Anteil
   real ist -- Spike in Welle 2 misst das, bevor wir committen.
7. **Hilfs-Modell-Routing vs. Single-Model-Einfachheit.** Zweites Modell erhoeht Konfig-Komplexitaet;
   nur sinnvoll wenn Hilfs-Calls signifikanten Anteil haben (Condensing laeuft pro langer Session
   mehrfach).
8. **Mobile/Performance:** Externalization schreibt tmp-Dateien -- auf Mobile (BA-23) ok? Vermutlich
   ja (Vault-FS), aber pruefen.
9. **Retrieval-Tuning (Hebel-K-Teil) vs. Knowledge-Layer-Roadmap:** semantisches Chunking / Top-k /
   Reranker beruehren SemanticIndexService + KnowledgeDB (vgl. EPIC-019, Memory v2). Ueberschneidung
   klaeren -- evtl. dort verorten statt im Agent-Loop-EPIC, damit es keine Doppelarbeit gibt.
10. **Eigenes EPIC?** Diese Analyse rechtfertigt ein EPIC "Agent-Loop Effizienz" (Verweis auf
    EPIC-18, das als "Token Cost Reduction" v2.3.1 released ist), analog zur Strukturentscheidung
    bei Community-Wave 1. ADRs absehbar: Caching-Architektur (ersetzt/erweitert ADR-62),
    Externalization-im-Hauptloop (erweitert ADR-63), Microcompaction (neu), Subagent-Recherche-
    Routing + Budget (neu), Skill-On-demand-Laden (neu).
11. **Build vs. Buy.** Klar entschieden: Obsilo behaelt seinen eigenen Loop (Abschnitt 7). Frage nur
    noch, ob einzelne *Bausteine* aus `pi-coding-agent` oder `@anthropic-ai/sdk` (z.B. eine
    Compaction-Utility) als Dependency uebernommen werden -- vermutlich nein, zu eng gekoppelt; eher
    die Patterns nachbauen.

---

## 10. Quellen

- Management-Briefing "LLM-Tokenkosten und Optimierung" (Mai 2026), insb. Kap. 7 (Provider-Prompt-Caching),
  Kap. 11 (Prompt-Optimierung), Kap. 12 (Agent-Loop-Architektur), Kap. 13 (RAG), Kap. 15 (Observability),
  Kap. 18 (Gegenthese). Interne Uebergabe.
- ToDo Developer Podcast Ep. 163 -- Malte Lantin (GitHub) / Robin-Manuel Thiel (JTL): "Die echten
  Kosten von AI Coding". Transkript + 11-Punkte-Zusammenfassung. Interne Uebergabe.
- Auslöser-Chat (6 Turns dialogische Notizarbeit, ~42 EUR UI-Anzeige) + 58-Msg-Chat-Messung
  (`[InputBreakdown] hist=138652t`, Msg #0=78k, #22=25k) -- interne Übergabe.
- 5-Provider-Messlauf 2026-05-12 ("Was habe ich im Vault zu GitHub?", frischer Chat je Provider) --
  Copilot/Sonnet, OpenAI/GPT-5.4, OpenRouter/Gemini-2.5-Pro, Anthropic-direkt/Sonnet, EnBW-Bedrock/Sonnet.
  Diagnose-Logs: `[SystemPrompt]`, `[InputBreakdown:main-loop]` (`src/core/utils/logInputBreakdown.ts`,
  Commit `acaf53a`), `[CacheStat:<provider>]` (`src/api/logCacheStat.ts`, neu, in allen Providern ausser
  chatgpt-oauth verdrahtet), `[Cost]`. Roh-Logs in der Chat-Historie.
- `github.com/codeaashu/claude-code` -- archivierter Claude-Code-Quellcode-Leak (npm `.map`, 31.03.2026).
  Kerndateien `QueryEngine.ts`, `Tool.ts`, `tools/`, `commands/`, `skills/`, `compact/`, `coordinator/`,
  `hooks/`, `extractMemories/`, `cost-tracker.ts`. Plus Anthropic-Doku ([Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks),
  [Subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents),
  [Skills](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills),
  [Slash Commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands),
  [Memory](https://docs.anthropic.com/en/docs/claude-code/memory),
  [Costs/`/context`](https://docs.anthropic.com/en/docs/claude-code/costs)) und Kenntnis aus erster Hand.
- `github.com/EnBWAG/enbw-cowork.enbw-open-cowork` (lokaler Checkout `~/projects/enbw-cowork`, v0.8.0).
  Kerndateien `src/main/claude/agent-runner.ts`, `agent-streaming.ts`, `system-prompt-builder.ts`,
  `prompt-cache-utils.ts` (ADR-19), `subagent/`, `advisor/`, `tool-adapter.ts`; eingebettetes SDK
  `@mariozechner/pi-coding-agent` (+ `pi-ai`), Cache-Mechanik via SDK-`_onPayload`-Hook,
  Compaction-Defaults `reserveTokens:16384/keepRecentTokens:20000`.
- `@mariozechner/pi-coding-agent` / `pi-ai` -- Mario Zechners Open-Source-Coding-Agent-SDK (npm),
  das Cowork einbettet.
- Anthropic: ["How we built our multi-agent research system"](https://www.anthropic.com/engineering/built-multi-agent-research-system)
  -- Agents ~4x, Multi-Agent ~15x Token vs. Chat; 80 % Benchmark-Varianz = Token-Volumen.
- Anthropic: [Prompt Caching docs](https://docs.anthropic.com/de/docs/build-with-claude/prompt-caching)
  -- Claude-Code-intern 1,84/2 Mio Tokens als Cache-Reads, 81 % Reduktion.
- RouteLLM (Berkeley, [arXiv 2406.18665](https://arxiv.org/abs/2406.18665)) -- 95 % Qualitaet bei 26 % Calls ans teure Modell.
- PwC "Don't Break the Cache" ([arXiv 2601.06007](https://arxiv.org/abs/2601.06007)) -- 41-80 % ueber 500 Agent-Sessions.
- AWS Bedrock Intelligent Prompt Routing ([Doku](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-routing.html))
  / [Prompt Caching Doku](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html);
  Azure OpenAI [Prompt Caching Doku](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/prompt-caching).
- LLMLingua (Microsoft Research, [arXiv 2310.05736](https://arxiv.org/abs/2310.05736)) -- Prompt-Komprimierung bis 20x.
- ProjectDiscovery: ["How we cut LLM cost with prompt caching"](https://projectdiscovery.io/blog/how-we-cut-llm-cost-with-prompt-caching)
  -- Cache-Hit-Rate 7 % -> 74 %, 59-70 % Gesamtreduktion.
- Langfuse [Token & Cost Tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking) -- Referenz fuer die Observability-KPIs (Hebel I).

### Interne Bezugsdokumente
- `_devprocess/analysis/BA-12-token-cost-reduction.md` (EPIC-18 BA)
- `_devprocess/architecture/` -- ADR-61 (Fast Path), ADR-62 (KV-Cache-Reihenfolge), ADR-63 (Context Externalization)
- Obsilo-Code: `src/core/AgentTask.ts`, `src/core/FastPathExecutor.ts`, `src/core/prompts/sections/`,
  `src/core/tool-execution/ToolExecutionPipeline.ts`, `src/core/tool-execution/ResultExternalizer.ts`,
  `src/core/memory/ContextComposer.ts`, `src/core/utils/sanitizeHistoryForApi.ts`, `src/api/providers/anthropic.ts`
- BUG-016 (Memory + Context-Prefix bypass -> Anthropic direct) -- relevant fuer Hebel A
