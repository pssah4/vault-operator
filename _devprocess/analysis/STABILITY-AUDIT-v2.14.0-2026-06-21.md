# Stabilitaets-Audit Vault Operator v2.14.0

*Stand: 2026-06-21*
*Methode: 14 parallele Subsystem-Reviewer + adversariale Verifikation aller P0/P1-Findings (Workflow `stability-audit`, 40 Agenten, 0 widerlegte Findings)*

## Executive Summary

Vault Operator v2.14.0 ist im Kern stabil und gut getestet, mit konsistent verdrahteten Hot-Pfaden (Agent-Loop, Provider-Layer, Checkpoints, Sandbox-Isolation, Security-Gates). Es gibt jedoch fuenf bestaetigte P0-Findings, die das aktuelle Release als auslieferungsfaehig in Frage stellen: der MCP-Wire leakt weiterhin soul.md + User-Memory in jedes erste tool/call-Resultat (Issue #46 nicht real geschlossen, Fix-Branch unmerged), PDF-Parsing ist im gesamten Ingest-Pfad gebrochen (5 Call-Sites uebergeben das plugin-Argument nicht), `ingest_template` ist als Pflichtschritt im System-Prompt verankert aber existiert nicht im Code, und die `plan_presentation` -> `create_pptx` Pipeline ist gebrochen (Schema-Mismatch, leere Folien). Zusaetzlich verstaerken sich mehrere TOOL_GROUP_MAP-Drift-Wellen (acht bis zehn registrierte Tools sind aus dem LLM-Schema gefiltert, darunter `find_tool`, `read_skill`, `anti_echo_search`, Memory-Source-Tools) zum strukturellen Problem. Empfehlung: vor weiteren Feature-Releases einen Hotfix v2.14.9 schneiden, der den MCP-Fix-Branch merged, die PDF-Pipeline repariert und den TOOL_GROUP_MAP-Drift mit einem CI-Guard strukturell schliesst.

## Top-Prioritaet Bugs (P0/P1 bestaetigt)

| Prio | Bereich | Titel | Location | Symptom | Empfohlener Fix |
|------|---------|-------|----------|---------|-----------------|
| P0 | MCP | FIX-23-09-01/02/03 unmerged trotz Backlog=Done | [src/mcp/tools/index.ts:286](src/mcp/tools/index.ts#L286) | soul.md + Memory leaken in jedes erste tool/call-Resultat | `fix/mcp-injection-FIX-23-09-01` nach dev mergen, Hotfix v2.14.9 |
| P0 | Ingest | PDF-Parsing global gebrochen | [src/core/document-parsers/parseDocument.ts:25](src/core/document-parsers/parseDocument.ts#L25) | Placeholder-Text statt PDF-Inhalt in Ingest, Mirror, SemanticIndex | `plugin` Pflicht-Parameter machen, 5 Call-Sites fixen |
| P0 | Office | `plan_presentation` -> `create_pptx` Schema-Mismatch | [src/core/tools/vault/CreatePptxTool.ts:106](src/core/tools/vault/CreatePptxTool.ts#L106) | Leere Folien trotz erfolgreichem Plan | DeckPlan auf flat title/body/bullets mappen (Option B) |
| P0 | Office | `ingest_template` ist Pflichtschritt aber existiert nicht | [src/_generated/bundled-skills.ts:27](src/_generated/bundled-skills.ts#L27) | Corporate-Template-Workflow tot, Agent ruft ins Leere | Tool wiederbeleben ODER alle Verweise entfernen |
| P0 | Vault Health | Stufe2 SQL `AVG(MAX())` crash | [src/core/health/Stufe2ActivityTrigger.ts:151](src/core/health/Stufe2ActivityTrigger.ts#L151) | Stufe2-Hint feuert nie, FEAT-19-19 komplett tot | `AVG(MAX(mtime))` -> `AVG(mtime)`, try/catch in maybeHint |
| P1 | Vault Health | FreshnessFrontmatterPatcher nicht verdrahtet | [src/main.ts:1469-1518](src/main.ts#L1469) | UI-Toggle ohne Wirkung | Patcher in Orchestrator wiring, Schreibpfad gegated mit `writeFrontmatter` |
| P1 | Vault Health | Stufe3-Job an falscher Flag (autoTrigger.enabled) | [src/main.ts:1610-1621](src/main.ts#L1610) | Stuendlich statt wochentlich, falsches Opt-in | Dediziertes `stufe3.enabled` Setting + `lastRunIso`-Persistenz |
| P1 | Vault Health | Stufe3 strongSignal-Threshold = 2 statt 3 unabhaengig | [src/main.ts:1584](src/main.ts#L1584) | False-positive Notifications | Domain-Grouping + Threshold 3 (eTLD+1) |
| P1 | Vault Health | Stufe2-Klick triggert keine Pipeline | [src/main.ts:1659-1666](src/main.ts#L1659) | Zweite Notice statt Web-Search | `AntiEchoSearchTool` ueber `ToolExecutionPipeline` ausloesen (IMP-19-19-01) |
| P1 | Vault Tools | `VaultHealthCheckTool` umgeht Approval+Checkpoint | [src/core/tools/vault/VaultHealthCheckTool.ts:20](src/core/tools/vault/VaultHealthCheckTool.ts#L20) | Frontmatter-Massaenderungen ohne Snapshot | `isWriteOperation=true` + interner Multi-File-Snapshot |
| P1 | Vault Tools | `anti_echo_search` nicht im LLM-Schema | [src/core/modes/builtinModes.ts:38](src/core/modes/builtinModes.ts#L38) | UI-Button leerlauft | In `web`-Gruppe von TOOL_GROUP_MAP aufnehmen |
| P1 | Provider | ChatGPT-OAuth droppt image-Bloecke | [src/api/providers/chatgpt-oauth.ts:384-410](src/api/providers/chatgpt-oauth.ts#L384) | Vision broken bei @-mention Bildern | Image-Handler analog FIX-04-03-09 nachziehen |
| P1 | Memory | TOOL_GROUP_MAP-Drift: mark/unmark/list_memory_source_notes | [src/core/modes/builtinModes.ts:36](src/core/modes/builtinModes.ts#L36) | Tools unsichtbar im LLM-Schema | In `vault`-Gruppe aufnehmen analog `list_pinned_conversations` |
| P1 | Memory | SemanticSearchTool umgeht IgnoreService | [src/core/tools/vault/SemanticSearchTool.ts:79-412](src/core/tools/vault/SemanticSearchTool.ts#L79) | Ignorierte Notes leaken in semantic_search | Vier `isIgnored`-Filter analog `searchVault.ts` einbauen |
| P1 | Skills | 8 Tools fehlen in TOOL_GROUP_MAP (BUG-021-Pattern) | [src/core/modes/builtinModes.ts:26-42](src/core/modes/builtinModes.ts#L26) | `find_tool`, `read_skill`, `probe_plugin`, `run_skill_script` u.a. nur via Halluzination | Tools in passende Gruppen + Coverage-Test als Inclusion-Guard |
| P1 | Office | TOOL_GROUPS-Drift bei Office-Tools | [src/core/tool-execution/ToolExecutionPipeline.ts:84-155](src/core/tool-execution/ToolExecutionPipeline.ts#L84) | pptx/docx/xlsx fallen in `note-edit`-Default | `vault-change`-Eintraege ergaenzen |
| P1 | Sandbox | IframeSandboxExecutor `vaultList` ohne await | [src/core/sandbox/IframeSandboxExecutor.ts:248](src/core/sandbox/IframeSandboxExecutor.ts#L248) | Mobile-Sandbox liefert un-cloneable Promise | `await` ergaenzen |
| P1 | Sandbox | Iframe-Sandbox ohne `vault.mkdir` | [src/core/sandbox/sandboxHtml.ts:40-46](src/core/sandbox/sandboxHtml.ts#L40) | Skill-creator schlaegt auf Mobile fehl | mkdir-Proxy + Bridge-Routing analog Desktop |
| P1 | Ingest | Tension-Detection hart auf `undefined` gepinnt | [src/core/tools/vault/IngestDeepTool.ts:225](src/core/tools/vault/IngestDeepTool.ts#L225) | FEAT-19-13 Released-Status irrefuehrend | Detector verdrahten oder Status zurueckziehen (IMP-19-13-01) |
| P1 | Routing | ModelDiscoveryService ohne Pricing/Capability-Daten | [src/main.ts:681](src/main.ts#L681) | OpenRouter-Pricing-Pfad ist toter Code | `fetchProviderModels` erweitern, RawDiscoveredModel durchreichen |
| P1 | UI | Settings-Deeplink `'agent'` ist tot-String | [src/main.ts:2330](src/main.ts#L2330), [src/main.ts:3652](src/main.ts#L3652) | Leere Settings-Seite nach Migration | Auf `'agent-behaviour'` korrigieren, Cast entfernen |
| P1 | UI | ModesTab/NewModeModal ohne ModeService | [src/ui/AgentSettingsTab.ts:236](src/ui/AgentSettingsTab.ts#L236) | Global-Modes unsichtbar, stiller Reload | ModeService auf Plugin-Level exponieren |
| P1 | UI | OnboardingFlow schreibt in totes `activeModels[]` | [src/ui/sidebar/OnboardingFlow.ts:153-184](src/ui/sidebar/OnboardingFlow.ts#L153) | Setup-Klick speichert ins Nichts | Auf `providerConfigs[]` umstellen, Setup-Button auf Provider-Tab routen |

## Was nachweislich funktioniert

**Vault Health & Knowledge Freshness:** Kern-Lint-Pipeline (`VaultHealthService.runChecks`, fixMissingBacklinks, moveOrphansToFolder), Modal-Repair-Flow (Sticky/Tabs/Refresh nach FIX-19-01-01..09), FreshnessVerifier Mid->Frontier-Routing mit ZDR-Fail-Closed, FreshnessOrchestrator Authorization-Gate.

**Agent Loop & Tool Pipeline:** AgentTask Constructor-Wiring (alle 14 Felder), `consecutiveMistakeLimit` Circuit-Breaker, Microcompaction + Rolling Summary, ToolExecutionPipeline mit HARD_OUTPUT_CAP=60k, FastPath Two-Stage Execution, Subagent Profile-Spawn, Steering-Hook (FEAT-24-08 Mechanic B), Helper-API-Routing, ToolRepetitionDetector + Episode-Recording, Stigmergy-Adapter mit binarem Outcome-Grading, Truncation-Recovery.

**Vault Tools:** EditFile mit fuzzy-match + large-rewrite-steering (FIX-01-05), GitCheckpointService new-file-Snapshot + Restore (FIX-01-07-01), Editor-Cache-Refresh (FIX-01-07-03), `writeBinaryToVault` + `extractZip` mit Path-Traversal-Guards, `search_files` mit ReDoS-safe regex + IgnoreService.

**Provider/API:** `resolveOutputBudget` mit Context-Window-Clamp + Thinking-on-top, ThinkingBlock-Passback fuer DeepSeek (FIX-04-03-07), `truncatedToolInputError` Single-Source-of-Truth, Tool-Call-Flush shared helper, Bedrock CachePoint (ADR-111), Reasoning-Effort GA-Routing (v2.14.0), Provider URL SSRF-Guard (AUDIT-037), `/v1/models` Filter gegen Pollution.

**Memory/Knowledge/Semantic:** KnowledgeDB atomic write + integrity_check + Recovery (FIX-12), Schema-Migration v8->v12 idempotent, RerankerService mit Backoff (Retrieval Wave 1), ExtractionQueue Park-Items + AbortController, SingleCallExtractor delta-window, MemoryRetriever DB-Fallback (FIX-09), HistoryIndexer mit AbortSignal, BUG-016 permanente Provider-Fehler-Latch.

**MCP:** Local HTTP-Server mit Token-Auth + CORS-Lockdown (AUDIT-006), Path-Validation, RateLimiter sliding-window, Cross-Interface Living-Document save_conversation, ADR-118 MCP-Listing-Cap, trust-tag wrapping fuer Vault-Content, RelayClient redaction + diagnostic outage-notice, `execute_vault_op` Pipeline-Anbindung.

**Skills/Modes/Mastery:** StigmergyAdapter (EPIC-32), `precedenceResolver` + `stigmergyEmitGate`, RecipePromotionService 3-Gates, CompositionStackService mit Cycle-Detection, InvokeMcpServerTool Whitelist-Guard, SkillFrontmatterValidator, SkillSnapshotService + WriteInterceptor, BuiltinSkillMaterializer.

**Office:** CreateDocxTool und CreateXlsxTool sauber via BundleLoader + writeBinaryToVault, PptxGenJS-basierte from-scratch Slide-Erzeugung, TemplateCatalogLoader isoliert konsistent.

**Self-Development & Sandbox:** ProcessSandboxExecutor (Desktop OS-Isolation), SandboxBridge mit Pfad-Validierung + Rate-Limits + Circuit-Breaker, TOFU Integrity + Version Pinning, Worker Defense-in-Depth mit AstValidator, RunSkillScriptCache LRU, `manage_source` Hand-Off statt Self-Overwrite.

**Checkpoints/Backup/Persistence:** GitCheckpointService snapshot/restore mit Path-Traversal-Guards (AUDIT-030), KnowledgeDB Atomic-Write + Integrity-Recovery, WriterLock fuer obsidian-sync, Daily-SnapshotJob mit 7-Tage-Retention, Auto-Daily-Backup mit BackupSecretFilter (AUDIT-EPIC-29 H-1), Folder-Konsolidierung (FEAT-29-01), iCloud-Stall-Fix Mobile (FIX-28-00-03).

**Ingest:** DocxParser/PptxParser/XlsxParser/CsvParser, BlockIdSetter idempotent, SummaryPositionAnnotator (ADR-103), IngestTriageLogStore mit sanitizeSourceUri, AutoTriggerObserver Rate-Limit, checkPositionMarkers + findDeadPageRefs, OutputModeGenerator In-Place-Modify.

**Routing & Cost-Reduction:** FastPathExecutor, MicroCompactor mit PRUNED_MARKER-Guard, ResultExternalizer Re-Read-Cap, Cache-Praefix-Stabilisierung, TaskRouter Regex-Klassifikator, Tier-Resolution Cascade, Externalizer-disable im FastPath Stage 2, Consult-Flagship Schema-Filter, OpenAI Non-Chat Modality Cleanup.

**UI/Settings/Onboarding:** `isActiveOnboardingFlow` Helper, Provider-only Settings UI (FEAT-26-03), FirstRunWizardModal, ModelConfigModal Auto-MaxTokens, Chat-Model-Dropdown, DiffReviewModal Escape-Guard, EPIC-26 Migration + Crypto-Walker.

**Security & Governance:** `safeFs` Pfad-Allowlist, spawn-Allowlist mit Shell-Metachar-Reject, `providerCredentialCrypto` (AUDIT-027 H-1), fail-closed Approval-Gate (ADR-05), Permissions-Tool-Group-Wiring (ADR-10), ChatGPT OAuth PKCE Loopback, HallucinationBrake (ADR-090), OperationLogger mit Param-Sanitization, ConsoleRingBuffer, alle Audits AUDIT-027/028/029/032/033/034 GREEN. Keine echten Bugs in diesem Bereich gefunden.

## Gaps: Claims vs Realitaet

| Feature | Claimed | Actual | Severity |
|---------|---------|--------|----------|
| FIX-23-09-01/02/03 | Done in BACKLOG | Branch unmerged, MCP-Wire leakt weiter | high |
| FEAT-19-29 PDF Markdown-Mirror | Released | Schreibt Placeholder statt PDF-Text | high |
| FEAT-19-19 Stufe-2 Activity-Trigger | Released | SQL-Crash + Klick triggert keine Pipeline | high |
| FEAT-19-20 Stufe-3 Periodischer Job | Released | Stuendlich statt wochentlich, falsche Flag | high |
| FEAT-19-22 Aktiver Dialog-Ingest | Released | Naiver 5-Absaetze-Picker, kein Multi-Turn | high |
| IMP-20-06-01 Frontmatter-Allowlist-Patcher | Released | Wiring fehlt, Toggle ohne Wirkung | high |
| FEAT-11-17 plan_presentation Pipeline | Released | Schema-Mismatch, leere PPTX | high |
| FEAT-11-08/18 ingest_template | Released | Tool existiert nicht im Code | high |
| FEAT-26-03 "Open Settings"-Deeplink | Funktional | Oeffnet leeren Tab via tot-String | high |
| FEAT-29-03 probe_plugin | Released, in Prompt | TOOL_GROUP_MAP-Drift, nicht aufrufbar | high |
| FEAT-29-06 run_skill_script | Released | TOOL_GROUP_MAP-Drift | high |
| FEAT-24-09 read_skill (always-available) | ADR-116 Released | TOOL_GROUP_MAP-Drift | high |
| FEATURE-1600 find_tool Discovery | Released | TOOL_GROUP_MAP-Drift, nur via Halluzination | high |
| FEAT-03-25 Memory-Source-Tools | Released | TOOL_GROUP_MAP-Drift | high |
| FEAT-19-14 anti_echo_search | Released, in UI | TOOL_GROUP_MAP-Drift | high |
| AUDIT-013 H-2 Ignore-Filter | Closed | Nur MCP-Boundary, Agent-Pfad ungeschuetzt | medium |
| FEAT-26-02 Pricing/Capability-Fallback | Released | fetchProviderModels droppt alle Daten | high |
| FEAT-26-04 EPIC-26 Migration | Done | OnboardingFlow/MemoryTab/FirstRunWizard nicht migriert | medium |
| FEAT-19-13 Tension-Detection | Released | Im Tool hart auf undefined | medium |
| FEAT-05-02 Sandbox Rollback-UI | Released | sandboxMode-Toggle ohne UI | medium |
| FEAT-29-06 Code-Modules Removal SC-02/03 | Released | Legacy custom_*-Tools laufen weiter | medium |
| FEAT-11-00 PPTX Template-Engine | Released | pptx-automizer komplett entfernt | medium |
| FIX-15-00-01 Multi-File-Atomic-Commit | Released | Klasse implementiert, keine Caller | medium |
| FIX-04-03-09 Image-Blocks | Released | chatgpt-oauth uebersehen | medium |
| ADR-100 IngestSessionStore | Accepted/Released | Dead Code, 0 Caller | medium |
| FEAT-19-26 MOC-Page-Update | Released | Nur Root-Folder, ignoriert Unterordner | medium |
| ADR-10 Permissions-Audit Tabelle | Released | 4 Generationen hinter Code-Stand | medium |
| FEAT-32-02 provenance-Field | Released | Nur ID-Praefix, kein Feld auf Recipe | low |
| FIX-04-03-06 Bedrock hard-limit | Active/Building | Code+Tests live, nur Backlog stale | low |
| OpenRouter Prompt Cache fuer Claude | Deferred | Verschenkt 90% Cost-Discount | low |
| GitCheckpointService cleanup() | Doku verspricht GC | No-op, Shadow-Repo waechst unbounded | low |

## Detail-Findings pro Bereich

### Vault Health & Knowledge Freshness
Kern-Lint-Pipeline und Modal-Repair-Flow sind stabil. Die Stufe2/3 + Freshness-Verifier-Schichten haben mehrere harte Code-vs-Spec-Diskrepanzen: Stufe2-SQL-Crash, Stufe3-Gate an falscher Flag, FreshnessFrontmatterPatcher unwired, strongSignal-Threshold falsch, Stufe2-Klick triggert keine Pipeline. Zusaetzlich umgehen zwei Modal-Refresh-Pfade die FIX-19-01-Optionen (P2). dryRun-Flag im Stufe3JobOptions ist Tot-Konfiguration (P3).

### Agent Loop & Tool Pipeline
Loop ist im Kern stabil. Drei verbleibende Findings: FastPath erzeugt zwei aufeinanderfolgende user-Messages (P2, verletzt Anthropic-Alternation-Contract), `resultCache` invalidation per Substring-Match ist fragile (P3), `find_tool`/`read_skill`/`run_skill_script` fehlen in TOOL_GROUP_MAP (P2, dieselbe Drift-Wurzel wie in anderen Bereichen).

### Vault Tools
`VaultHealthCheckTool` umgeht Approval+Checkpoint (P1, Top-Priority). Acht weitere Tools mit TOOL_GROUP_MAP-Drift (anti_echo_search P1, sieben weitere P2). Path-Traversal-Guards fehlen in WriteFile/AppendToFile/MoveFile (P3, kein akuter Bug). Fehlerbehandlungs-Konvention in `execute()` inkonsistent (P3).

### Provider / API Layer
Im Kern stabil. ChatGPT-OAuth Vision-Bug (P1, gleiche Klasse wie FIX-04-03-09). BACKLOG-Stale: FIX-04-03-06 (P2). Azure-Branch ist No-Op-Ternary (P2). Kilo-Gateway ohne `thinkingEnabled`-Support (P2). OpenRouter+Claude Cache-Control nicht passthrough'd (P3).

### Memory / Knowledge / Semantic
Schema-Migration, atomic-write, integrity-check stabil. Drei strukturelle Findings: TOOL_GROUP_MAP-Drift fuer Memory-Source-Tools (P1), SemanticSearchTool ignoriert IgnoreService (P1), `embedding_model`-Spalte in `vectors` toter Code (P3), `queueAutoUpdate` ignoriert `isBuilding` (P3, Race-Window real aber selten).

### MCP Connector & Tools
P0 ist der unmerged Fix-Branch (Issue #46). Sekundaer: RelayClient kennt nur hardcoded protocolVersion (P2), `mcpClient.connectAll` als floating-Promise (P3). `McpBridge.ts` ist mit 826 LOC zu fett (Refactoring-Empfehlung).

### Skills, Modes & Mastery
EPIC-29 und EPIC-32 solide. Hauptproblem ist die TOOL_GROUP_MAP-Drift (P1, 8 Tools). Sekundaer: `CapabilityGapResolver` zeigt auf Legacy-Pfad (P2), `SkillSnapshotService` korrumpiert Binaerassets (P2), `SkillRegistry.setSkillsDir()` nie aufgerufen (P3), `InvokeMcpServerTool` ohne Stigmergy-Emit (P3), `provenance`-Feld nicht persistiert (P3).

### Office Document Creation
DOCX/XLSX sauber. PPTX in Krise: zwei P0-Findings (plan_presentation-Pipeline broken, ingest_template existiert nicht), ein P1 (session-flag ungenutzt), ein P1 (TOOL_GROUPS-Drift). Mehrere als Released markierte Features verweisen auf entfernten Code (FEAT-11-00/08/12-15/18). `render_presentation` ebenfalls nicht registriert (P2). Zero Tests fuer Create*Tool-Trio + PlanPresentationTool.

### Self-Development & Sandbox
Defense-in-Depth solide. Mobile-Iframe-Sandbox hat zwei P1: `vault.list` ohne await, `vault.mkdir` fehlt komplett. ProcessSandboxExecutor `respawnCount`-Recovery-Loop (P3), EsbuildWasmManager re-verifiziert Cache nicht (P3), `hasReturn`-Heuristik mit False-Positives (P3). FEAT-29-06 SC-02/03 (custom_*-Removal) ist nur halb implementiert.

### Checkpoints, Backup & Persistence
Sehr robust. Keine P0/P1. Drei P3: GitCheckpointService.cleanup() ist No-op (Repo waechst), Stale `.pre-restore`-Datei wird nicht aufgeraeumt, MemoryDB-Atomic-Write nicht verifiziert. `MultiFileAtomicCommit` ist implementiert aber ohne Caller (medium-Refactor).

### Ingest & Document Parsers
P0 (PDF) ueberragt alles. DOCX/PPTX/XLSX/CSV/JSON/XML sauber. P1-Stack: Tension-Detection deaktiviert, Stufe3-Gate falsch, Multi-Turn-Ingest stub, IngestSessionStore dead code, MOC-Page-Pfad hardcoded. Status-Drift zwischen FEAT-Marker und Code-Realitaet ist die hartnaeckigste Klasse.

### Routing, Context & Cost-Reduction
FastPath, MicroCompactor, ResultExternalizer, KV-Cache-Splitting alle stabil. P1: ModelDiscoveryService bekommt keine Pricing-Daten. P2: TaskRouter.classifyWithFallback toter Code, find_tool/read_skill/probe_plugin nur via Halluzination, weitere TOOL_GROUP_MAP-Drift.

### UI / Settings / Onboarding
EPIC-26 stabil. Drei P1: Tot-String `'agent'` in zwei Migration-Deeplinks, ModesTab ohne ModeService, OnboardingFlow schreibt in totes `activeModels[]`. Mehrere P2: MemoryTab Atomiser leer, FirstRunWizard Privacy-Banner falsch, drei Delete-Buttons ohne Confirm (verletzt explizite Sebastian-Regel).

### Security, Governance & Quality Gates
Keine echten Bugs. Saubere Audit-Linie. Nur Doku-Drift (ADR-10) und Dead-Fields (AutoApprovalConfig). FEAT-24-08 Autonomie-Governance ist transparent als Deferred dokumentiert (Mechanic A+C offen). Refactoring-Empfehlungen sind allesamt low-priority Wartbarkeit.

## Refactoring-Empfehlungen (priorisiert)

| Priority | Title | Effort | Files | Rationale |
|----------|-------|--------|-------|-----------|
| high | TOOL_GROUP_MAP-Drift strukturell schliessen | S | builtinModes.coverage.test.ts, toolMetadataConsistency.test.ts | Drift-Pattern in 5+ Wellen wiederholt, manuelle Whitelist scheitert systematisch |
| high | ADR-48 PPTX-Pipeline schliessen oder zurueckziehen | L | PlanPresentationTool, CreatePptxTool, TemplateCatalog, bundled-skills | Halber Zustand kostet Tokens und produziert fehlschlagende Workflows |
| high | TOOL_GROUPS Office-Tools im ToolExecutionPipeline.ts haerten | S | ToolExecutionPipeline.ts | Auto-Approval-Semantik gebrochen, gleicher Pattern wie TOOL_GROUP_MAP |
| high | parseDocument-Signatur: plugin Pflicht oder PdfParser entkoppeln | M | parseDocument.ts + 5 Call-Sites | Compiler erzwingt korrekte Uebergabe statt latenter Drift |
| high | Stufe3-Gating + Run-Periodizitaet entkoppeln | M | main.ts, settings.ts, Stufe3PeriodicJob.ts | Eigene Settings-Property + lastRunIso-Persistenz |
| high | ModeService an Plugin exponieren | M | main.ts, AgentSettingsTab.ts, AgentSidebarView.ts, ModesTab.ts | Beendet das ms=undefined-Hack-Pattern fuer Settings/Modals |
| high | MultiFileAtomicCommit anschliessen oder entfernen | M | persistence/, knowledge/, _devprocess/ | Implementiert, kein Caller, Spec verspricht Funktion |
| high | Zentrale TabId-Allowlist + Validator | S | AgentSettingsTab.ts, main.ts, UpdateSettingsTool.ts | Verhindert tot-String-Bugs strukturell |
| high | runChecks() konsistent mit Options | S | VaultHealthService.ts, VaultHealthRepairModal.ts | Klasse von FIX-19-01-05/08 |
| medium | Stufe2/3 + Orchestrator als Service-Klassen | M | main.ts | 200+ Zeilen Lambda-Wiring, schwer testbar |
| medium | maybeHint + Provider-Hooks mit Top-Level try/catch | S | Stufe2ActivityTrigger.ts | Versteckt P0-Bugs durch unhandled rejection |
| medium | OnboardingFlow + MemoryTab + FirstRunWizard auf providerConfigs[] | M | OnboardingFlow.ts, MemoryTab.ts, FirstRunWizardModal.ts | 6 Stellen lesen tote Daten |
| medium | Confirm-Modal fuer Delete-Buttons | S | ModelsTab.ts, ChatHistoryModal.ts, ModesTab.ts | Verletzt Sebastian-Regel "destructive actions need confirmation" |
| medium | convertMessages fuer OpenAI-shape Provider zusammenfuehren | M | openai.ts, github-copilot.ts, kilo-gateway.ts, chatgpt-oauth.ts | Klasse von FIX-04-03-09 wiederholt sich |
| medium | OpenRouter pricing/capability durchreichen | M | testModelConnection.ts, main.ts, ModelDiscoveryService.ts | FEAT-26-02 OpenRouter-Pfad live machen |
| medium | Shadow-Repo Prune-Strategie | M | GitCheckpointService.ts, main.ts | Unbounded growth, gc() ist No-op |
| medium | Status-Wahrheit FEAT-19-13/22 | S | BACKLOG.md, IngestDeepTool.ts | Released-Status irrefuehrend |
| medium | SkillSnapshotService binary-aware | M | SkillSnapshotService.ts | Binaerassets korrumpiert |
| medium | TaskRouter.classifyWithFallback entfernen oder verkabeln | S | TaskRouter.ts, AgentTask.ts, Tests | Doku und Code muessen uebereinstimmen |
| medium | Always-on Meta-Tools in cachedTools injizieren | S | AgentTask.ts | Beendet INTENTIONALLY_NOT_REACHABLE-Workaround |
| medium | Test-Coverage IgnoreService + OperationLogger + ConsoleRingBuffer | M | governance/, observability/ | Zentrale Komponenten ohne Tests |
| medium | DynamicToolLoader/Factory entfernen | M | tools/dynamic/, SelfAuthoredSkillLoader.ts | FEAT-29-06 SC-02/03 vervollstaendigen |
| low | Diverse Cleanup-Items | S | various | Dead-Code, Doku-Drift, Test-Erweiterungen |

## Widerlegte Findings

Keine widerlegten Findings. Adversariale Verifikation hat alle 24 zur Pruefung vorgelegten Bugs bestaetigt (P0/P1 und ausgewaehlte P2). Die Pattern-Wiederholung (TOOL_GROUP_MAP-Drift, Released-Status ohne vollstaendige Implementation, halb-migrierte UI-Pfade) ist konsistent und unabhaengig in verschiedenen Bereichen reproduzierbar.

## Empfehlungs-Roadmap

1. **Hotfix v2.14.9 (P0-Welle, Tag 1-3):**
   - `fix/mcp-injection-FIX-23-09-01` nach dev mergen, dev->main, Hotfix-Release schneiden. Issue #46 ist auf released-Versionen aktuell reproduzierbar.
   - PDF-Parsing: `parseDocument`-Signatur auf `plugin: ObsidianAgentPlugin` (required) aendern, 5 Call-Sites compiler-erzwungen fixen, Regression-Test mit nicht-trivialem PDF.
   - Stufe2-SQL-Fix `AVG(MAX())` -> `AVG()` plus try/catch in maybeHint.
   - Entscheidung treffen: `ingest_template` reaktivieren oder retiren, dann Suchlauf bis 0 Treffer.
   - `plan_presentation` -> `create_pptx` Schema reparieren (Option B: flat title/body/bullets im Plan-Output) + Silent-Failure-Guard.

2. **P1-Welle (Woche 1-2):**
   - TOOL_GROUP_MAP-Drift komplett aufloesen: alle 10 identifizierten Tools in passende Gruppen einsortieren, Coverage-Test als Inclusion-Guard umbauen.
   - VaultHealthCheckTool `isWriteOperation=true` + Multi-File-Snapshot.
   - Stufe3-Job dediziertes Settings-Flag + lastRunIso-Persistenz.
   - FreshnessFrontmatterPatcher wiring im Orchestrator.
   - ChatGPT-OAuth Image-Bloecke nachziehen (Sweep-Test fuer alle 4 OpenAI-shape Provider).
   - SemanticSearchTool IgnoreService-Filter an vier Stellen.
   - Iframe-Sandbox: `await` fuer vaultList, `vault.mkdir` proxy + bridge-routing.
   - Settings-Deeplinks: tot-String `'agent'` korrigieren, Cast entfernen, TabId-Validator einbauen.
   - ModeService auf Plugin-Level exponieren.
   - OnboardingFlow auf providerConfigs[] migrieren, Setup-Button auf Provider-Tab routen.

3. **High-Refactor (Woche 2-3):**
   - ADR-48 PPTX-Pipeline Entscheidung treffen (Option A: pptx-automizer reaktivieren, Option B: From-Scratch zementieren + Released-Features bereinigen).
   - MultiFileAtomicCommit entweder verkabeln (KnowledgeDB + MemoryDB Cross-DB-Koordination) oder als unused entfernen.
   - Status-Wahrheit herstellen: FEAT-19-13/19-22/29-06 SC-02/03 entweder fertig implementieren oder Released-Status zurueckziehen.

4. **Medium-Refactor (Woche 3-4):**
   - convertMessages-Logik fuer OpenAI-shape Provider zusammenfuehren.
   - ModelDiscoveryService Pricing/Capability-Daten durchreichen.
   - OnboardingFlow/MemoryTab/FirstRunWizard vollstaendig auf providerConfigs[] migrieren.
   - Confirm-Modal fuer alle drei Delete-Button-Stellen.
   - Stufe2/3/Orchestrator als Service-Klassen extrahieren.

5. **Low-Priority Cleanup (laufend):**
   - GitCheckpointService.cleanup() echtes Pruning oder retiren.
   - ADR-10 Doku-Update.
   - Test-Coverage fuer IgnoreService, OperationLogger, ConsoleRingBuffer.
   - Dead-Field-Cleanup in AutoApprovalConfig.
   - Legacy "Files:"-Linie in Commit-Message entfernen.

Empfehlung als Gesamtbewertung: v2.14.0 darf in der aktuellen Form NICHT als stabil-released gefuehrt werden, solange Issue #46 (MCP-Wire) reproduzierbar ist und PDF-Parsing in der Praxis silent broken laeuft. Hotfix v2.14.9 als naechster Schritt ist die einzige verantwortbare Reaktion.

---

## Live-Verifikation 2026-06-21 (nach v2.14.9 + v2.14.10)

Console-Reload nach Deploy von v2.14.10 zeigt:

### Bestaetigte Hotfixes

| Hotfix | Live-Befund | Status |
|---|---|---|
| FIX-23-09-01..03 (MCP-Bridge) | `[McpBridge] MCP Server listening on http://127.0.0.1:27182` + `[RelayClient] Connected to relay`. Kein systemContext-Auto-Inject-Log. | bestaetigt |
| FIX-06-01-01 (PDF-Pipeline) | `[SemanticIndex] 39 documents (indexPdfs=true)` + `Build complete: 808/808 files, 0 skipped`. Kein Placeholder-Embed mehr. | bestaetigt |
| YAML-Frontmatter-Fix (11 Notes) | Kein YAMLParseError-Spam mehr in `[TaskNotes][taskmanager-parse-frontmatter-fallback]`. Nur ein einzelner unverwandter DependencyCache-Warning. | bestaetigt |
| Reranker ONNX-Device-Fix (v2.14.0) | `[Reranker] Loaded ONNX WASM from vault asset (12 MB)` + `Model loaded in 577ms`. | live verifiziert |
| ImplicitConnections isOpen-Guard | `[ImplicitConnections] DB closed during computation, aborting gracefully`. | live verifiziert |
| Stigmergy-Daemon (EPIC-32) | `connected to daemon ... registered 74 tools, 0 skills, 0 mcp, 2 subagents`. | live verifiziert |
| VaultDNA-Plugin-Scan | `Scanned 51 plugins (49 with skills)`, 108 Methods aus tasknotes, 30 aus dataview, 6 aus omnisearch. | live verifiziert |
| Memory-Aging | `Aging sweep: 115/695 facts updated (identity=5, fact=96, event=4, preference=10)`. | live verifiziert |
| KnowledgeDB / Vector / Graph | `Loaded 15164 vectors into cache`, `Extracted 3144 edges, 2460 unique tags from 811 files`. | live verifiziert |

### Neue Live-Findings (Audit-Erweiterung)

| Prio | Bereich | Titel | Beleg | Empfehlung |
|---|---|---|---|---|
| P3 | Vault-Daten | `Attachements/Ressourcenübersicht.xlsx` ist korrupt | `[SemanticIndex] Skipping corrupted document Attachements/Ressourcenübersicht.xlsx: Can't find end of central directory` | User: File neu exportieren. Optional: VaultHealth-Check fuer corrupted-Office-Files anbieten. |
| P2 | Init-Lifecycle | Doppelte API-Handler-Initialisierung beim Plugin-Start | Zwei `[Plugin] API handler initialized: ... (bedrock)`-Zeilen in einem Reload, getrennt durch `[SnapshotJob]`-Lauf | Init-Order in `main.ts` so refactorieren, dass API-Handler nur einmal initialisiert wird. Risiko bei Bedrock-Auth-Refresh. |
| P3 | Cosmetic | `net::ERR_CONNECTION_REFUSED`-Logs fuer ollama/custom ohne konfigurierten Endpoint | `[ModelDiscoveryService] ollama-main unreachable ... custom-main unreachable` | Bei `enabled=false` oder leerer URL: `console.debug` statt `console.warn`. |
| ? | Vault-Health | 1 high finding nach Reload | `[VaultHealth] 20 findings (1 high, 8 medium, 11 low)` | Aufklaeren welches Finding das ist; eventuell weitere broken YAMLs jenseits der 11 gefixten. |
| FYI | TaskNotes | DependencyCache-Race in fremdem Plugin | `[TaskNotes] DependencyCache: isFileUsedAsProject called before indexes built, building now...` | Fremdes Plugin, nicht unsere Verantwortung. Reporten ggf. an pivanov/tasknotes. |

### Audit-Empfehlungen, die sich durch Live-Daten relativieren

| Audit-P0/P1 | Live-Status | Konsequenz |
|---|---|---|
| FEAT-19-19 Stufe-2 SQL `AVG(MAX())`-Crash | Beim Plugin-Reload **nicht ausgeloest** (Stufe2 triggert auf Activity, nicht onload). Audit-Befund bleibt valide, aber Bug ist latent und nur unter Activity-Trigger reproduzierbar. | Reproduktion nach laenger laufender Activity-Session noetig, dann gezielt fixen. |
| FEAT-19-29 PDF Markdown-Mirror | Audit-Empfehlung Reindex-IMP gilt: bestehende PDF-Embeddings im SemanticIndex sind potenziell mit Placeholder kontaminiert, neue PDF-Inserts ab v2.14.10 sind sauber. | IMP-06-01-01 anlegen (Reindex-UI + Hint-Modal). |
| FEAT-19-22 Aktiver Dialog-Ingest naiver Picker | Live nicht beobachtet (kein Dialog-Ingest im Reload-Log). | Tiefere Sub-Audit-Welle noetig. |

---

## Anhang: Audit-Metriken

- **Domains gepruft:** 14
- **Bugs gesamt:** 73
- **P0 bestaetigt:** 5 (davon 2 in Hotfix v2.14.9+10 geschlossen)
- **P1 bestaetigt:** 20
- **Bugs widerlegt:** 0
- **Refactoring-Empfehlungen:** 61
- **Claim-vs-Realitaet-Gaps:** 75
- **Live-Verifikation:** 9 Komponenten bestaetigt, 3-5 neue Findings (zwei P2/P3, drei FYI)
- **Audit-Methode:** Workflow `stability-audit`, 40 Agenten parallel + adversariale Verifikation (Run-ID wf_52072472-70c)
