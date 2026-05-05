# Changelog

All notable changes to Obsilo Agent are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.7.1] -- 2026-05-05

### Fixed

- **FIX-14-03-01 (P1).** Relay poll interval raised from 2 s to 10 s. Cloudflare
  Workers Free Plan caps requests at 100k/day per account; the 2 s polling
  alone produced 43.200 requests/day per open Obsidian instance, independent of
  actual MCP usage. With BRAT hot reloads and multi-device setups the cap was
  hit even on idle days, surfacing as HTTP 429 + worker code 1027 (quota
  exhausted). Poll interval and reconnect delays moved into named constants in
  `src/mcp/RelayClient.ts` so the cost story is explicit. (FEAT-14-03,
  EPIC-14, ADR-55.)
- **FIX-14-03-02 (P2).** Relay `pollLoop` bare `catch {}` hid HTTP status,
  body, and stack. Replaced with a `describeRequestError` helper that builds a
  one-line diagnostic and a `redactToken` helper that strips the relay token
  before logging. After 3 consecutive failures a single Notice surfaces the
  outage without devtools. AUDIT-005 H-2 / H-3 still hold: every logged string
  runs through token redaction. (FEAT-14-03, EPIC-14, ADR-55, AUDIT-005.)

### Compliance

- **Review-bot pass on PR #11394.** 29 findings flagged on the public mirror
  commit `c17f37d` cleared. Mix of TypeScript hygiene rules and the
  `obsidianmd/ui/sentence-case*` family.
  - Stringification (`@typescript-eslint/no-base-to-string`): type guards
    instead of `String(unknown)` in `AutoTriggerObserver.matchesValue`,
    `SemanticIndexService` tag lookup, and `validateNewTaskInput` (4 fields).
  - Unbound method: `DeepIngestPipeline` wraps `TensionDetector.markerWorthy`
    in an arrow function so `this` stays bound.
  - Floating promise: `updateMemory` legacy telemetry call prefixed with
    `void`.
  - Redundant union: `string | unknown` -> `unknown` in `executeVaultOp`
    (`string` is already a subtype).
  - `obsidianmd/no-static-styles-assignment` disable in `main.ts` line 927
    replaced by a new `.agent-u-cursor-pointer` utility CSS class.
  - Sentence case (29 strings): `Obsilo` brand removed from settings, error
    and onboarding copy ("the agent" instead). ChatGPT account block reworded
    to avoid `ChatGPT` / `OS` / `Plus` / `Pro` tokens. Eleven BA-25 commands
    and notices in `main.ts` translated from German to English. `MOC` replaced
    with `map-of-content` / `hub` in vault settings.
- **Plugin store submission ready.** Local ESLint with bot-style rules
  reports 0 errors on the entire codebase.

---

## [2.7.0] -- 2026-05-04

### Added

- **Cross-Surface AI Workflow (EPIC-23, BA-26).** Externe Surfaces wie
  Claude Desktop, ChatGPT und Perplexity koennen Obsilos Memory- und
  History-Layer ueber MCP ansprechen. Neue Remote-MCP-Tools:
  - `save_to_memory` -- Fact-Persistierung mit Source-Tagging
  - `save_conversation` -- Konversation als Living Document
  - `recall_memory` -- Cross-Source Memory-Retrieval
  - `search_history` -- Cross-Source History-Suche
  - V1 `update_memory` deprecated, Migration-Helper im Settings-Tab
- **Source-Interface-Tagging (ADR-108, FEAT-23-04).** Jede Conversation
  traegt eine Origin-Surface (claude / chatgpt / perplexity / obsilo /
  other / unknown). History-Sidebar hat Source-Tabs zum Filtern. Per
  Provider konfigurierbarer Sync-Mode (Auto / Manual) gegen
  Privacy-Trade-Off.
- **Living Documents + Cross-Interface-Threads (ADR-110, FIX-23-01-01..05).**
  Mehrere `save_conversation`-Calls werden in einen Thread mit ID
  `thread-YYYY-MM-DD-{6-hex}` gebuendelt. Living-Documents append-only.
- **Vault-zu-Memory-Bruecke (FEAT-03-25, ADR-109).** Vault-Notizen lassen
  sich als Memory-Source markieren. FrontmatterIndexer beobachtet
  Aenderungen und triggert SingleCallProcessor. Hooks
  `addNoteAsMemorySource` / `removeNoteAsMemorySource`.
- **Karpathy-Wiki-Pattern fuer Vault-Summary-Pflege (BA-25).**
  Vollstaendige Implementation in fuenf Phasen:
  - Phase 1 Foundation: knowledge.db Schema v9 -> v10 Bundle (4 neue
    Tabellen), Auto-Summary-Pipeline
  - Phase 2 Lint-Foundation: Tension-Detection (Hybrid)
  - Phase 3 Ingest-Foundation: Pre-Triage-Tool, Auto-Trigger-Detection
  - Phase 4 Power-User Backend: Frontmatter-Conflict-Detection
  - Phase 5 Erweiterte Schichten: Stufe-3 Job-Runner mit
    Token-Budget-Enforcement, Top-Hub-Block mit
    KV-Cache-Block-Lifecycle
- **Memory v2 Stabilisierungs-Pass (Track 3).** Drei IMPs:
  - IMP-03-17-01 recall_memory cosine NaN-Guard
  - IMP-03-18-01 AgingService daily-scheduler
  - IMP-03-18-02 DriftBus throttle-bypass
- **21 neue Architekturentscheidungen.** ADR-90 bis ADR-110, alle
  Accepted und in arc42 Section 9 verlinkt. Schwerpunkte:
  Cost-Aware Heuristics, KnowledgeDB v10, Source-Identitaet,
  Cluster-Halbwertszeit, Frontmatter-Conflicts, MOC-Marker, KV-Cache,
  Pre-Triage, Tension-Detection, Output-Modus, Web-Search, Stufe-3
  Runner, MCP-Memory-Versionierung, Source-Interface-Tagging,
  Vault-zu-Memory-Bruecke (supersedes ADR-87), Living-Documents.

### Changed

- **arc42 v5.1 (2026-05-04).** Section 1 Status um EPIC-23, BA-25,
  AUDIT-014/015/016 erweitert. Section 5.5 Schema-Version von v5 auf
  v10. Section 5.9.1 Memory v2 von "in Vorbereitung" auf "Cross-Surface
  MCP released". Section 8.14 MCP-Tools-Block aktualisiert. Section 9
  ADR-Tabelle um 21 neue Eintraege ergaenzt.
- **`/coding`, `/testing`, `/security-audit` Skills.** Pre-Commit
  Backlog-First Sync-Chain, Wayfinder-Maintenance, Plan-Coverage-Gate
  binding (siehe `.claude/skills/`).

### Fixed

- **FIX-22-07-01 (P0).** Sidebar view crash beim BRAT-Hot-Reload, weil
  `onOpen()` lief bevor `doLoad()` die Settings geladen hatte.
  `plugin.readyPromise` synchron in `onload()` erstellt, View `await`s
  vor jedem Settings-Zugriff.
- **FIX-04-09-01 (P1).** OpenAI-Provider-Streaming verschluckte
  Tool-Calls, wenn `finish_reason === "stop"` (statt `"tool_calls"`)
  nach gefuellten `delta.tool_calls` kam. Post-Loop-Flush fuer den
  Accumulator addiert. Gleicher Fix auf github-copilot, kilo-gateway,
  chatgpt-oauth uebertragen.
- **FIX-05-02-02 (P1).** SandboxBridge-Circuit-Breaker blieb nach 20
  Fehlschlaegen permanent offen und blockierte selbst triviale
  `evaluate_expression`-Aufrufe. `CIRCUIT_COOLDOWN_MS = 30_000` plus
  `lastErrorAt` Timestamp; Auto-Reset nach Cooldown-Ablauf.
- **FIX-15-00-01 (P1).** KnowledgeDB-Korruption durch nicht-atomare
  Writes plus Cloud-Sync. Atomic-Write (tmp -> rename), Multi-File-
  Coordination via Journal, integrity_check + Auto-Recovery beim Open,
  Lock-File gegen parallele Plugin-Instanzen, Daily-Snapshots mit
  7-Tage-Retention (PLAN-003).
- **FIX-18-03-02 (P1).** `read_file` konnte externalisierte Tool-Results
  unter `.obsidian-agent/tmp/task-*/` nicht oeffnen. Externalizer
  schreibt jetzt unter `{vault}/.obsidian-agent/tmp/...` (vault-
  resident, von vault.adapter aufloesbar, weiterhin
  Obsidian-Index-ignoriert).
- **FIX-18-04-01 (P1).** Streaming-Tool-Error in vier Providern
  (github-copilot, openai, kilo-gateway, chatgpt-oauth) emittierten
  einen `text`-Chunk statt `tool_error`. AgentTask-Mistake-Counter
  griff nicht, der Loop lief endlos. Alle vier auf `tool_error`-Chunk
  umgestellt. EditFileTool-Error-Message gibt Tool-Routing-Hint bei
  grossen `new_str`.
- **FIX-01-12-01 (P1).** Drag-and-drop aus dem Obsidian-File-Explorer
  oeffnete einen neuen Tab statt die Datei an den Chat zu attachen.
  `app.dragManager.draggable` plus `stopPropagation` im drop-Handler.
- **FIX-03-26-02.** Top-Hub-Block-Toggle (und andere Settings-Sub-Toggles)
  reagierten nach Privacy-Acknowledge nicht. `loadSettings()` nutzte
  shallow `Object.assign` statt deep-merge -- neue Sub-Keys wurden
  durch persistierte Eltern-Objekte ueberschrieben. `deepMergeSettings`
  Helper rekursiv fuer Sub-Objekte.
- **FIX-03-23-01.** Onboarding-Memory-Step (BA-25 SC-02) fehlte im
  OnboardingService. Hauptdeliverable nachgereicht.
- **FIX-23-04-01 (Pass 1-7).** Perplexity-MCP-Streamable-HTTP-Compliance:
  Accept-Header-Negotiation (JSON vs SSE), Mcp-Session-Id Echo,
  body-pre-parse plus default content-type, notification 202 mit
  leerem Body und ohne Content-Type, protocolVersion-Echo,
  Living-Document Append-Logik relax.
- **FIX-23-01-01..05.** Living Documents + Cross-Interface-Threads:
  Thread-Pill UI, sync_session source_interface tagging,
  Auto-Tracking-Doppel-Suppression, ensureSession lazy,
  save_conversation per-message-cap (AUDIT-015 H-1).
- **FIX-03-18-01 (P2).** SingleCallProcessor budget-exhausted Test-Setup
  benutzte UTC-Date-Key, TokenBudgetGuard intern Local-Date-Key.
  Around-Midnight-UTC mismatched -> snapshot fiel auf Zero-Bucket
  zurueck, blockReason() = null, Mock throw. Day-Key gepinnt via
  `today` seam.

### Security

- **AUDIT-014 (BA-25 Pre-Release).** Medium-Risk, alle 4 Findings
  resolved. URL-Sanitizer in IngestTriageLogStore, Rate-Limit fuer
  AutoTriggerObserver, Settings-UI Privacy-Hinweis fuer Top-Hub-Block,
  Stufe3PeriodicJob state-Persistierung in DB.
- **AUDIT-015 (EPIC-23 Pre-Release).** 1 H + 3 M Findings, alle resolved
  und 50 neue Eval-Tests:
  - H-1 save_conversation per-message + per-call cap
  - M-1 McpRateLimiter (sliding-window, 3 Klassen)
  - M-2 sanitizeVaultContentForLLM gegen Prompt-Injection
  - M-3 strictSourceIsolation Setting fuer recall_memory + search_history
- **AUDIT-016 (Full-Codebase, periodic).** 0 C / 1 H / 4 M / 5 L / 3 I,
  9/10 Findings resolved, 1 deferred (IMP-23-04-05 relay /poll
  Partitionierung):
  - H-1 sync_session Cap-Vererbung von save_conversation
  - M-1 write_vault content-cap (4 MB / 16 MB)
  - M-2 search_history LIKE-wildcard escape
  - M-3 get_context strictSourceIsolation gating
  - M-4 ConversationStore.generateId crypto.randomUUID
  - L-1 ActiveMcpSessions ohne djb2-Hash
  - L-2 cosine NaN-Guard (`Number.isFinite(sim)`)
  - L-3 OutputModeGenerator instanceof TFolder statt cast
  - L-5 validateVaultRelativePath Helper (3 Tools deduped)

---

## [2.6.0] -- 2026-04-26

Wave-4 Community-Feedback Release. Detailliert im git-Log
(`ae7d041 chore: release v2.6.0`) und unter
[obsilo Releases](https://github.com/pssah4/obsilo/releases).

Highlights:
- BUG-019..022 fixes (drag-and-drop, OpenAI tool-call flush, BUG-020
  read_file tmp, BUG-021 find_tool multi-word)
- BUG-023..025 (vault-health icon stethoscope)
- BUG-026 BRAT hot-reload sidebar crash (initial fix, vor FIX-22-07-01)
- BUG-027 sandbox circuit auto-reset, BUG-028 trailing-slash paths
- AUDIT-012 Pre-Release Audit GREEN

---

## [2.5.1] -- 2026-04-21

Wave 2 Community-Feedback. Hard tool-filter, create_excalidraw arrows,
session-disable on permanent provider errors.

---

## [2.5.0] -- 2026-04-17

Wave 1 Community-Feedback (BA-013 + IMPL-007). FIX-Bundle:
FEATURE-0409 (Tool-Call Flush, BUG-013), FEATURE-1206 (Copilot
max_completion_tokens), FEATURE-1803 (Cross-Platform TMP),
FEATURE-0507 (konfigurierbarer Agent-Folder, ADR-072), neue Tools
(create_drawio), MCP Type-Safety, npm overrides fuer transitive
Vulnerabilities.

---

Older releases see git tags `v2.4.x` and earlier.
