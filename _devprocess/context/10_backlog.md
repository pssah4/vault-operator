# Obsilo Agent -- Vollstaendiges Backlog

Stand: 2026-04-17
Branch: `dev` / `main`
Status: **v2.5.2 released** (FEATURE-0508 agent-folder change handling: live retarget + migration)

---

## Implementierungshistorie

### Phase A: Core Foundation & Parallel Tools

- Vault CRUD: `read_file`, `write_file`, `list_files`, `search_files`, `create_folder`, `delete_file`, `move_file`
- Content Editing: `edit_file`, `append_to_file` (diff-basiert)
- Control Flow: `ask_followup_question`, `attempt_completion`, `switch_mode`
- Sidebar Chat UI mit Message-Rendering
- Approval System (Fail-Closed, per-Category Auto-Approve, DiffReviewModal)
- Checkpoints (isomorphic-git Shadow-Repo, Diff, Restore, Undo-Bar)
- Operation Logging (JSONL Audit Trail mit PII-Scrubbing)
- Parallel Tool Execution (Promise.all fuer read-safe Tools)
- Diff-Stats Badge (+N/-N auf Write-Ops)
- Log-Viewer in Settings

### Phase B: Rules, Workflows, Skills & Autocomplete

- Rules System (`.obsidian-agent/rules/` mit Toggle-UI)
- Workflows/Slash-Commands (`/slug` Invocation)
- Skills & VaultDNA (Plugin API Bridge, Skill Discovery)
- Autocomplete (`/` Workflows, `@` File-Mentions, VaultFilePicker)
- Support Prompts (Custom Prompt Templates)
- Chat History (ConversationStore + HistoryPanel UI)
- Mode System (2 Built-In Modes + Custom Mode Editor)
- Per-Mode Tool Filtering + API Config

### Phase C: Context, Memory, Semantic Index & Multi-Agent

- Semantic Index (vectra HNSW, Hybrid Keyword + Semantic, HyDE, Heading-Aware Chunking)
- Keyword Search Upgrade (Stemming + TF-IDF + Word Boundaries)
- Context Management (Active File Awareness, Pinned Context, @-Mentions)
- 3-Tier Memory (Session -> Long-Term -> Soul, Async Extraction via ExtractionQueue)
- Chat History Restore + Continue
- Multi-Agent (`new_task`, Depth Guard maxSubtaskDepth=2, Mode-Aware Subtask Propagation)
- Context Condensing (LLM-Summarization bei 70% Token-Threshold, Smart Tail, Multi-Pass, Emergency Auto-Retry)
- Canvas Tools (`generate_canvas`, `create_excalidraw`)
- Bases Tools (`create_base`, `update_base`, `query_base`)
- Global Storage (~/.obsidian-agent/, SyncBridge, GlobalMigrationService)
- Safe Storage (Electron safeStorage, OS Keychain)
- Tool Repetition Detection (Sliding Window, Fuzzy Dedup)
- Power Steering (Periodic Mode Reminder)

### Phase D: MCP, Web, Localization & Security

- MCP Client (SSE, streamable-HTTP), `use_mcp_tool`, `manage_mcp_server`
- Web Tools (`web_fetch`, `web_search` via Brave/Tavily)
- i18n (locale switching UI entfernt, nur noch EN als Runtime-Sprache; de.ts geloescht)
- Onboarding Wizard (Conversational Onboarding via OnboardingService)
- Notifications (Task-Completion Toast)
- VaultDNA Plugin Discovery
- Agent Skill Mastery (Rich Descriptions, Procedural Recipes, Auto-Promotion, Episodic Learning)
- Multi-Provider API (Anthropic, OpenAI, Ollama, LM Studio, OpenRouter, Azure, Custom)

### Phase E: Self-Development, Sandbox & Tools

- Self-Development Framework komplett:
  - Stufe 1: Skills als Markdown (ManageSkillTool, SelfAuthoredSkillLoader)
  - Stufe 2: Dynamic Modules (iframe Sandbox, EsbuildWasmManager, DynamicToolFactory, EvaluateExpressionTool)
  - Stufe 3: Core Self-Modification (EmbeddedSourceManager, PluginBuilder, PluginReloader, ManageSourceTool)
  - Stufe 5: Proactive Self-Improvement (SuggestionService, LongTermExtractor, Pre-Compaction Flush)
- Sandbox OS-Level Isolation (ISandboxExecutor, ProcessSandboxExecutor, IframeSandboxExecutor, sandbox-worker)
- Console Observability (ConsoleRingBuffer, ReadAgentLogsTool)
- Settings Tools (UpdateSettingsTool, ConfigureModelTool)
- Plugin API (CallPluginApiTool, EnablePluginTool, pluginApiAllowlist)
- ExecuteCommandTool, ResolveCapabilityGapTool, ExecuteRecipeTool

### Phase F: Chat-Linking, Document Parsing & Office Creation

- Chat-Linking (semantisches Chat-Titling, Auto-Frontmatter-Linking, Protocol Handler, chatLinking Setting)
- Document Parsing Pipeline (ReadDocumentTool, parseDocument fuer PPTX/XLSX/DOCX/PDF/JSON/XML/CSV)
- File Picker Erweiterung (VaultFilePicker fuer Office-Formate)
- Task Extraction (TaskExtractor, TaskNoteCreator, TaskSelectionModal)
- Office Document Creation (create_docx, create_pptx, create_xlsx)
- PPTX Template Pipeline (plan_presentation -- ADR-046/047/048/049; render_presentation entfernt)

### EPIC-012: GitHub Copilot LLM Provider

- Auth & Token Management (OAuth Device Code Flow, 3-stufige Token-Kette, Auto-Refresh)
- Chat Completions Provider (Streaming, Tool Calling, Copilot-spezifische Headers)
- Settings UI Integration (Connect/Disconnect, Status-Anzeige, Custom Client ID)
- Embedding Support (Copilot als Embedding-Provider fuer SemanticIndexService)
- Dynamic Model Listing (Live-Abfrage verfuegbarer Modelle via /models Endpoint)

### EPIC-013: Kilo Gateway LLM Provider

- Auth & Session Management (Device Authorization Flow, Token-Speicherung, Logout)
- Gateway Chat Provider (OpenAI-kompatible API, Streaming, Tool Calling)
- Settings UI Integration (Login-Flow, Status, Org-Kontext, Token-Modus)
- Dynamic Model Listing (Modelle abhaengig von Org-Policy und Abo)
- Organization Context (Org-Auswahl und -Wechsel)
- Embedding Support (Kilo als Embedding-Provider)
- Manual Token Mode (Direkteingabe statt Device Auth)

### EPIC-014: MCP Connector

- MCP Server Core (stdio via McpBridge, mcp-server-worker, 6 Tools)
- Tool-Tier-Mapping (3-Tier-System: read/search/write mit Approval-Gates)
- MCP Settings UI (McpTab: Server-Status, Claude Desktop Auto-Config)
- Sidebar Refactoring (SuggestionBanner + OnboardingFlow aus AgentSidebarView extrahiert)
- Remote Transport (FEATURE-1403: CloudflareDeployer, RelayClient, HTTP Long-Polling, Token-in-URL Auth)
- Memory Transparency (FEATURE-1411: updateMemory MCP-Tool)

### EPIC-015: Unified Knowledge Layer

- SQLite Knowledge DB (KnowledgeDB.ts, sql.js WASM, Chunk/Graph-Tabellen)
- Enhanced Vector Retrieval (VectorStore.ts, Background-Enrichment, Two-Pass)
- Graph Data Extraction (GraphExtractor.ts, GraphStore.ts, Wikilinks/Tags/Properties)
- Implicit Connection Discovery (ImplicitConnectionService.ts, semantische Nah-aber-nicht-verlinkt Erkennung)
- Local Reranking (RerankerService.ts, @huggingface/transformers Cross-Encoder)
- Knowledge Data Consolidation (MemoryDB.ts, Sessions/Episodes/Patterns/Recipes in SQLite)
- Implicit Connection UI (Vorschlags-Anzeige fuer unverlinkte Verbindungen)
- Storage Consolidation (Zwei-DB-Strategie: KnowledgeDB + MemoryDB, Legacy-Cleanup)

### EPIC-018: Token-Kostenreduktion

- Fast Path Execution (ADR-061: FastPathExecutor.ts, Recipe-gesteuertes Batching, deterministische Tool-Ausfuehrung)
- KV-Cache-Optimized Prompt (ADR-062: Stabile Sections vorne, volatile hinten, Provider-agnostisch)
- Context Externalization (ADR-063: ResultExternalizer.ts, grosse Tool-Results in temp-Dateien)
- Ergebnis: 634k -> 60k Tokens fuer einfache Tasks (90% Reduktion), GitHub Copilot funktioniert wieder

### EPIC-019: Knowledge Maintenance -- Phase 1 (teilweise)

- Vault Health Check (FEATURE-1901: VaultHealthCheckTool, VaultHealthService, VaultHealthRepairModal mit Checkpoint-backed Undo)
- Ontologie (FEATURE-1902, teilweise: OntologyStore.ts in SQLite, Cluster/Entity-Beziehungen)
- OCR Integration (FEATURE-1905: OCR-Fallback fuer gescannte PDFs via text-extractor Plugin)
- Memory-Verbesserungen (ADR-058/059/060: Semantic Recipe Promotion, Memory Decay Prevention, Session Summary Reliability)

### EPIC-020: Graph Intelligence (v2.4.3, 2026-04-12)

- Confidence Scoring (FEATURE-2001: confidence REAL in edges-Tabelle, GraphNeighbor.confidence)
- Community Detection (FEATURE-2002: CommunityDetectionService, graphology Louvain, OntologyStore-Integration)
- God-Node Analysis (FEATURE-2003: VaultHealthService.checkGodNodes, Degree-Metriken)
- Retrieval Quality (FEATURE-2004: Confidence-weighted Graph-Expansion in SemanticSearchTool)
- Batch Ingest (FEATURE-2005: knowledge-batch-ingest Skill)
- Knowledge Freshness (FEATURE-2006: Freshness-Klassifikation in SemanticIndexService)

ADRs: ADR-069 (Confidence Storage), ADR-070 (Community Detection Library), ADR-071 (Retrieval Integration)

---

## Aktueller Feature-Status

### Vollstaendig implementiert (49 Tools)

| Feature | Spec | Key Files |
|---------|------|-----------|
| Agent Core Loop | FEATURE-0101-agent-core.md | `src/core/AgentTask.ts` |
| Core Interaction & Modes | FEATURE-0102-core-interaction.md | `src/ui/AgentSidebarView.ts` |
| Context Management | FEATURE-0303-context-management.md | `src/core/systemPrompt.ts` |
| Providers & Models | FEATURE-0403-providers-models.md | `src/api/` |
| Custom Instructions/Modes/Rules | FEATURE-0210-custom-instructions-modes-rules.md | `src/core/modes/ModeService.ts` |
| Permissions & Approval | FEATURE-0106-permissions-approval.md | `src/core/governance/IgnoreService.ts` |
| Checkpoints | FEATURE-0107-checkpoints.md | `src/core/checkpoints/GitCheckpointService.ts` |
| Operation Logging | FEATURE-0108-operation-logging.md | `src/core/governance/OperationLogger.ts` |
| Vault Operations (CRUD) | FEATURE-0103-vault-ops.md | `src/core/tools/vault/` |
| Content Editing | FEATURE-0105-content-editing.md | `src/core/tools/vault/EditFileTool.ts` |
| Canvas & Bases | FEATURE-0309-canvas-bases.md | `src/core/tools/vault/` |
| Semantic Index | FEATURE-0301-semantic-index.md | `src/core/semantic/SemanticIndexService.ts` |
| Keyword Search Upgrade | FEATURE-0302-keyword-search-upgrade.md | `src/core/semantic/SemanticIndexService.ts` |
| MCP Support | FEATURE-0401-mcp.md | `src/core/mcp/McpClient.ts` |
| Web Tools | FEATURE-0402-web-tools.md | `src/core/tools/web/` |
| Workflows & Skills | FEATURE-0202-workflows.md, FEATURE-0203-skills.md | `src/core/context/WorkflowLoader.ts` |
| Local Skills | FEATURE-0204-local-skills.md | `src/core/skills/SkillRegistry.ts` |
| Memory & Personalization | FEATURE-0304-memory-personalization.md | `src/core/memory/MemoryService.ts` |
| Multi-Agent | FEATURE-0305-multi-agent.md | `src/core/tools/agent/NewTaskTool.ts` |
| VaultDNA & Plugin Skills | FEATURE-0205-vault-dna.md | `src/core/skills/CorePluginLibrary.ts` |
| i18n | FEATURE-0404-localization.md | `src/i18n/` |
| Global Storage | FEATURE-0310-global-storage.md | `src/core/storage/GlobalFileService.ts` |
| Safe Storage | FEATURE-0311-safe-storage.md | `src/core/security/SafeStorageService.ts` |
| Parallel Tool Execution | FEATURE-0110-parallel-tools.md | `src/core/AgentTask.ts` |
| Diff Stats | FEATURE-0111-diff-stats.md | `src/core/tool-execution/ToolExecutionPipeline.ts` |
| Context Condensing | FEATURE-0306-context-condensing.md | `src/core/AgentTask.ts` |
| Power Steering | FEATURE-0307-power-steering.md | `src/core/AgentTask.ts` |
| Tool Repetition Detection | FEATURE-0308-tool-repetition-detection.md | `src/core/tool-execution/ToolRepetitionDetector.ts` |
| Chat History | FEATURE-0208-chat-history.md | `src/core/history/ConversationStore.ts` |
| Autocomplete | FEATURE-0206-autocomplete.md | `src/ui/sidebar/AutocompleteHandler.ts` |
| Notifications | FEATURE-0406-notifications.md | `src/ui/AgentSidebarView.ts` |
| Modular System Prompt | FEATURE-0312-modular-system-prompt.md | `src/core/systemPrompt.ts`, `src/core/prompts/sections/` |
| Tool Execution Pipeline | FEATURE-0109-tool-execution-pipeline.md | `src/core/tool-execution/ToolExecutionPipeline.ts` |
| Tool Metadata Registry | FEATURE-0506-tool-metadata-registry.md | `src/core/tools/toolMetadata.ts` |
| Rules | FEATURE-0201-rules.md | `src/core/context/RulesLoader.ts` |
| Custom Prompts | FEATURE-0207-custom-prompts.md | `src/core/context/SupportPrompts.ts` |
| Modes | FEATURE-0209-modes.md | `src/core/modes/ModeService.ts` |
| Agent Tools (17) | FEATURE-0503-agent-tools.md | `src/core/tools/agent/` |
| Vault Tools (24) | FEATURE-0104-vault-tools.md | `src/core/tools/vault/` |
| Settings Tools | FEATURE-0504-settings-tools.md | `src/core/tools/agent/UpdateSettingsTool.ts` |
| Plugin API | FEATURE-0505-plugin-api.md | `src/core/tools/agent/CallPluginApiTool.ts` |
| Code Import Models | FEATURE-0313-code-import-models.md | `src/ui/settings/CodeImportModal.ts` |
| Attachments & Clipboard | FEATURE-0112-attachments-clipboard-images.md | `src/ui/sidebar/AttachmentHandler.ts` |
| Self-Development (alle Stufen) | FEATURE-0501-self-development.md | `src/core/self-development/`, `src/core/sandbox/` |
| Sandbox OS-Level Isolation | FEATURE-0502-sandbox-os-isolation.md | `src/core/sandbox/ProcessSandboxExecutor.ts` |
| Agent Skill Mastery | FEATURE-0407-skill-mastery.md | `src/core/mastery/` |
| Onboarding | FEATURE-0405-onboarding.md | `src/core/memory/OnboardingService.ts` |
| Chat-Linking | FEATURE-0701-chat-linking.md | `src/core/tool-execution/ToolExecutionPipeline.ts` |
| Protocol Handler | FEATURE-0702-protocol-handler.md | `src/main.ts` |
| Auto-Frontmatter-Linking | FEATURE-0703-auto-frontmatter-linking.md | `src/core/tool-execution/ToolExecutionPipeline.ts` |
| Semantic Chat-Titling | FEATURE-0704-semantic-chat-titling.md | `src/ui/AgentSidebarView.ts` |
| Chat-Linking Setting | FEATURE-0705-chat-linking-setting.md | `src/types/settings.ts` |
| Document Parsing Pipeline | FEATURE-0601-document-parsing-pipeline.md | `src/core/document-parsers/` |
| File Picker Erweiterung | FEATURE-0602-file-picker-extension.md | `src/ui/sidebar/VaultFilePicker.ts` |
| Task Extraction & Management | FEATURE-0801-task-extraction.md | `src/core/tasks/` |
| PPTX Template-Engine | FEATURE-1100-template-engine.md | `src/core/office/pptx/TemplateEngine.ts` |
| plan_presentation Tool | -- (ADR-048) | `src/core/tools/vault/PlanPresentationTool.ts` |
| ~~render_presentation Tool~~ | ~~FEATURE-1115~~ | ~~`src/core/tools/vault/RenderPresentationTool.ts`~~ -- Entfernt (LibreOffice-Abhaengigkeit nicht tragbar fuer Community Plugin) |
| Basis-Praesentationsregeln | FEATURE-1105-universal-design-principles.md | Presentation-Design Skill (ADR-047) |
| Copilot Auth & Token Management | FEATURE-1201-copilot-auth-token-management.md | `src/core/security/GitHubCopilotAuthService.ts` |
| Copilot Chat Completions | FEATURE-1202-copilot-chat-completions.md | `src/api/providers/github-copilot.ts` |
| Copilot Settings UI | FEATURE-1203-copilot-settings-ui.md | `src/ui/settings/ModelsTab.ts` |
| Copilot Embedding Support | FEATURE-1204-copilot-embedding-support.md | `src/api/providers/github-copilot.ts` |
| Copilot Dynamic Model Listing | FEATURE-1205-copilot-dynamic-model-listing.md | `src/api/providers/github-copilot.ts` |
| Kilo Auth & Session | FEATURE-1301-kilo-auth-session-management.md | `src/core/security/KiloAuthService.ts` |
| Kilo Gateway Chat Provider | FEATURE-1302-kilo-gateway-chat-provider.md | `src/api/providers/kilo-gateway.ts` |
| Kilo Settings UI | FEATURE-1303-kilo-settings-ui.md | `src/ui/settings/ModelsTab.ts` |
| Kilo Dynamic Model Listing | FEATURE-1304-kilo-dynamic-model-listing.md | `src/core/providers/KiloMetadataService.ts` |
| Kilo Organization Context | FEATURE-1305-kilo-organization-context.md | `src/core/security/KiloAuthService.ts` |
| Kilo Embedding Support | FEATURE-1306-kilo-embedding-support.md | `src/api/providers/kilo-gateway.ts` |
| Kilo Manual Token Mode | FEATURE-1307-kilo-manual-token-mode.md | `src/core/security/KiloAuthService.ts` |
| MCP Server Core | FEATURE-1400-mcp-server-core.md | `src/mcp/McpBridge.ts` |
| Tool-Tier-Mapping | FEATURE-1401-tool-tier-mapping.md | `src/mcp/tools/index.ts` |
| MCP Settings UI | FEATURE-1402-mcp-settings-ui.md | `src/ui/settings/McpTab.ts` |
| Sidebar Refactoring (Phase 1) | FEATURE-0902-sidebar-refactoring.md | `src/ui/sidebar/SuggestionBanner.ts`, `OnboardingFlow.ts` |
| SQLite Knowledge DB | FEATURE-1500-sqlite-knowledge-db.md | `src/core/knowledge/KnowledgeDB.ts` |
| Enhanced Vector Retrieval | FEATURE-1501-enhanced-vector-retrieval.md | `src/core/knowledge/VectorStore.ts` |
| Graph Data Extraction | FEATURE-1502-graph-extraction-expansion.md | `src/core/knowledge/GraphExtractor.ts`, `GraphStore.ts` |
| Implicit Connection Discovery | FEATURE-1503-implicit-connections.md | `src/core/knowledge/ImplicitConnectionService.ts` |
| Local Reranking | FEATURE-1504-local-reranking.md | `src/core/knowledge/RerankerService.ts` |
| Knowledge Data Consolidation | FEATURE-1505-knowledge-data-consolidation.md | `src/core/knowledge/MemoryDB.ts` |
| Implicit Connection UI | FEATURE-1506-implicit-connection-ui.md | `src/core/knowledge/ImplicitConnectionService.ts` |
| Storage Consolidation | FEATURE-1508-storage-consolidation.md | `src/core/knowledge/` |
| Remote Transport (MCP) | FEATURE-1403-remote-transport.md | `src/mcp/CloudflareDeployer.ts`, `RelayClient.ts` |
| Memory Transparency (MCP) | FEATURE-1411-memory-transparency.md | `src/mcp/tools/updateMemory.ts` |
| Fast Path Execution | FEATURE-1800-fast-path-execution.md | `src/core/FastPathExecutor.ts` |
| KV-Cache Prompt Caching | FEATURE-1801-prompt-caching.md | `src/core/prompts/sections/` |
| Context Externalization | FEATURE-1802-context-externalization.md | `src/core/tool-execution/ResultExternalizer.ts` |
| Vault Health Check | FEATURE-1901-vault-health-check.md | `src/core/knowledge/VaultHealthService.ts`, `VaultHealthCheckTool.ts` |
| OCR Integration | FEATURE-1905-ocr-integration.md | `src/core/document-parsers/PdfParser.ts` |

### Geplant (nicht implementiert)

**EPIC-016: Claude Code Pattern Adoption**

Quelle: Analyse des geleakten Claude Code Quellcodes (DonutShinobu/claude-code-fork, ~1900 TS-Dateien, 512k LoC).
Ziel: Patterns uebernehmen die fuer Wissensarbeit in Obsilo Mehrwert bringen.

| Feature | Spec | Prioritaet | Aufwand | Status |
|---------|------|------------|---------|--------|
| Deferred Tool Loading | FEATURE-1600-deferred-tool-loading.md | P1-High | Mittel | Geplant |
| Memory Side-Query | FEATURE-1601-memory-side-query.md | P1-High | Mittel | Geplant |
| Conditional Skills | FEATURE-1602-conditional-skills.md | P2-Medium | Mittel | Geplant |
| Parallel SubTasks (Fan-Out) | FEATURE-1603-parallel-subtasks.md | P2-Medium | Mittel | Geplant |
| Task-Typisierung | FEATURE-1604-task-typing.md | P3-Low | Niedrig | Geplant |

Verworfene Kandidaten:
- **Spezialisierte Agents** -- Analyse ergab: Skills decken das ab, Agent-Spezialisierung loest Coding-Probleme (phasengetrennte Toolsets, objektives Verify via Tests) die bei Wissensarbeit nicht existieren. Automatischer Wechsel waere einziger Mehrwert, rechtfertigt Aufwand nicht.
- **Full Coordinator Mode** -- Reduziert auf FEATURE-1603 (Parallel SubTasks). Vollstaendiger Coordinator (900-Zeilen System-Prompt, SendMessage/TaskStop Tools, Coordinator als reiner Denker ohne eigene Tools) widerspricht der Natur von Wissensarbeit wo Lesen+Schreiben im selben Fluss passiert. Stattdessen: leichtgewichtiger Fan-Out als Erweiterung des bestehenden new_task-Systems.

Feature-Details:

**FEATURE-1600: Deferred Tool Loading** (groesster ROI)
Claude Code Pattern: ToolSearchTool -- nur Tool-Namen im System-Prompt, Schema wird bei Bedarf geladen.
Obsilo-Adaption: Kern-Tools (read_file, edit_file, search, semantic_search) immer laden, spezialisierte Tools (create_pptx, create_docx, generate_canvas, ingest_template, plan_presentation, create_base, evaluate_expression) deferred. Neues Meta-Tool `find_tool` fuer On-Demand-Schema-Injection.
Geschaetzter Token-Gewinn: ~30-40% weniger System-Prompt pro API-Call.

**FEATURE-1601: Memory Side-Query**
Claude Code Pattern: findRelevantMemories.ts -- scannt Memory-Frontmatter, Sonnet waehlt bis zu 5 relevante Memories per Side-Query.
Obsilo-Adaption: Frontmatter-Schema fuer Memory-Dateien (name, description, type), Side-Query ueber guenstiges Model (Haiku/gpt-4o-mini) bei jedem Turn. Nur relevante Memories laden statt alles. Ergaenzt bestehendes 3-Tier-Memory.
Voraussetzung: Memory-Dateien brauchen strukturiertes Frontmatter (Migration bestehender Dateien).

**FEATURE-1602: Conditional Skills**
Claude Code Pattern: loadSkillsDir.ts -- Skills mit `paths` Frontmatter werden erst aktiviert wenn passende Files beruehrt werden.
Obsilo-Adaption: Skills mit `triggers`-Frontmatter (z.B. `triggers: ["*.pptx", "*.docx"]`) werden erst in den System-Prompt geladen wenn der Agent passende Dateien liest/schreibt. Reduziert Prompt-Rauschen. Kombiniert gut mit FEATURE-1600.

**FEATURE-1603: Parallel SubTasks (Fan-Out)**
Inkrementelle Erweiterung des bestehenden `new_task`-Systems (NewTaskTool.ts, AgentTask.ts:239-295).
Aktueller Zustand: new_task ist synchron/blockierend (await childTask.run()), read-Tools laufen bereits parallel via Promise.all (PARALLEL_SAFE Set in AgentTask.ts). Dieses Feature hebt Parallelitaet auf SubTask-Ebene.

Phase 1: new_task um `parallel: true` Parameter erweitern. Wenn der Agent mehrere new_task-Calls mit `parallel: true` im selben Turn macht, sammelt AgentTask diese und fuehrt sie via Promise.all gleichzeitig aus statt sequenziell. Nur read-only SubTasks (mode: "ask") duerfen parallel laufen, write-SubTasks (mode: "agent") bleiben sequenziell. Kein neuer Coordinator-Prompt, keine async Notifications -- reine Execution-Optimierung.

Phase 2 (nur wenn Phase 1 sich bewaehrt): Async SubTasks mit Callback-Notification. SubTask laeuft im Hintergrund, Haupt-Agent arbeitet weiter, Ergebnis wird als injizierte System-Nachricht zurueckgemeldet. Erfordert Aenderung am AgentTask-Loop (aktuell wartet der Loop auf jedes tool_result bevor er weitergeht).

Nicht portiert: Coordinator als reiner Denker ohne eigene Tools (widerspricht Wissensarbeit), SendMessage/TaskStop als separate Tools (zu viel Komplexitaet), 900-Zeilen coding-spezifischer Coordinator-Prompt.

Use Case: Fan-Out-Recherche ("Vergleiche Vault-Notizen, Meeting-Notes und Web-Quellen zu Thema X" -- 3 parallele read-SubTasks, danach Synthese + Dokument-Erstellung durch Haupt-Agent).

**FEATURE-1604: Task-Typisierung**
Claude Code Pattern: Task.ts -- 7 Task-Typen mit Prefix-IDs und Terminal-Status-Guards.
Obsilo-Adaption: SubTask-Typen (research, implementation, verification) mit Status-Lifecycle. Verhindert Nachrichten an beendete Tasks, ermoeglicht bessere UI-Darstellung. Housekeeping das andere Features (1603) einfacher macht.

**EPIC-011: Office Document Quality -- verbleibende Features**

| Feature | Spec | Prioritaet |
|---------|------|------------|
| Default PPTX Templates | FEATURE-1101-default-templates.md | P1-High |
| Theme-Extraktion (vereinfacht) | FEATURE-1103-theme-extraction-simplified.md | P1-High |
| Storyline-Framework-Skills | FEATURE-1104 (Spec ausstehend) | P1-High |
| Design-Memory-Integration | FEATURE-1106 (Spec ausstehend) | P2-Medium |
| Follow-up Questions | FEATURE-1107 (Spec ausstehend) | P2-Medium |

**EPIC-014: MCP Connector -- verbleibende Features**

| Feature | Spec | Prioritaet | Status |
|---------|------|------------|--------|
| Remote Transport (Cloudflare Relay) | FEATURE-1403-remote-transport.md | P1-High | Implementiert |
| Remote Authentication | FEATURE-1404-remote-auth.md | P1-High | Geplant |
| MCP Resources | FEATURE-1405-mcp-resources.md | P1-High | Geplant |
| MCP Prompts | FEATURE-1406-mcp-prompts.md | P1-High | Geplant |
| Plugin Skill Discovery | FEATURE-1407-plugin-skill-discovery.md | P2-Medium | Geplant |
| Remote Approval Pipeline | FEATURE-1408-remote-approval.md | P2-Medium | Zurueckgestellt (Approval in Claude) |
| Connectors Directory | FEATURE-1409-connectors-directory.md | P2-Medium | Geplant |
| Sandbox Exposure via MCP | FEATURE-1410-sandbox-exposure.md | P1-High | Geplant |
| Memory Transparency | FEATURE-1411-memory-transparency.md | P1-High | Implementiert |

**Sonstige geplante Features**

| Feature | Spec | Prioritaet |
|---------|------|------------|
| Token Budget Management | FEATURE-0603-token-budget-management.md | P1-High |
| On-Demand Image Extraction | FEATURE-0604-on-demand-image-extraction.md | P1-High |
| Model Compatibility Check | FEATURE-0605-model-compatibility-check.md | P2-Medium |
| Obsilo Gateway | FEATURE-0901-obsilo-gateway.md | Nach Stabilisierung (Monetarisierung) |

---

## Offene Punkte

### Bekannte Bugs (aus Codebase-Analyse)

| ID | Prio | Beschreibung | Datei | Status |
|----|------|-------------|-------|--------|
| FIX-01 | P0 | Tool JSON-Parse Error wird verschluckt statt propagiert | `src/api/providers/*.ts` | Resolved -- Error als tool_error/text-chunk propagiert |
| FIX-02 | P0 | EditFileTool.tryNormalizedMatch() Inkonsistenz (trim vs normalize) | `src/core/tools/vault/EditFileTool.ts` | Resolved -- konsistente normalize()-Funktion |
| FIX-03 | P0 | Checkpoint-Snapshot Race Condition bei concurrent Writes | `src/core/checkpoints/GitCheckpointService.ts` | Resolved -- serielle Commits, in-memory Map |
| FIX-04 | P1 | Tool-Picker Event-Listener Memory Leak | `src/ui/sidebar/ToolPickerPopover.ts` | Resolved -- close() entfernt alle Listener |
| FIX-05 | P1 | SearchFilesTool Regex lastIndex Bug (global Flag) | `src/core/tools/vault/SearchFilesTool.ts` | Resolved -- safeRegex() ohne global Flag |
| FIX-06 | P2 | Consecutive-Mistake-Counter Reset bei Mode-Switch fehlt | `src/core/AgentTask.ts` | Resolved -- consecutiveMistakes + repetitionDetector Reset |
| FIX-07 | P2 | Reranker ONNX-Runtime Fehler beim Model-Load in Electron | `src/core/knowledge/RerankerService.ts` | Resolved -- Fail-Once-Guard (_failed Flag, kein Retry nach erstem Fehlschlag) |
| FIX-08 | P2 | ImplicitConnections "Statement closed" Race Condition beim Startup | `src/core/knowledge/ImplicitConnectionService.ts` | Resolved -- isOpen() Guard vor computeAll() |
| FIX-09 | P1 | Session-Summaries nicht abrufbar (Summaries in DB, aber MemoryRetriever las nur .md-Dateien) | `src/core/memory/MemoryRetriever.ts`, `src/core/memory/MemoryService.ts` | Resolved -- ADR-060: MemoryRetriever liest jetzt aus DB, getStats() zaehlt DB-Sessions |
| FIX-10 | P2 | learnedRecipesEnabled hat keinen UI-Toggle in Settings (nur in settings.json aenderbar) | `src/ui/settings/` | Teilweise -- Force-True in main.ts, UI-Toggle ausstehend |
| FIX-11 | P1 | ChatLink stampt ungueltiges Frontmatter in erstellte Notizen (YAMLParseError: Nested mappings in compact mappings) | `src/main.ts` (flushPendingChatLinks) | Resolved -- YAML-Fehler werden concise geloggt, Note wird uebersprungen |
| FIX-12 | P0 | Token Overflow: Standard-Task (suche+zusammenfasse) sprengt 168k-Limit bei GitHub Copilot Sonnet 4.6 (183k Tokens) | System Prompt + Tool Defs + Tool Results | Resolved -- EPIC-018: Section-Reordering (ADR-062), Context Externalization (ADR-063), Fast Path (ADR-061). Ergebnis: 60k statt 634k fuer einfache Tasks, 257k statt >800k fuer komplexe Tasks |
| FIX-13 | P1 | Graph-Daten werden nach Vault-Health-Repair nicht neu extrahiert | `src/ui/modals/VaultHealthRepairModal.ts` | Resolved -- re-extract vor re-check |
| FIX-14 | P1 | vault-health-batch Skill triggert bei falschen Eingaben | Skills | Resolved -- Trigger-Pattern eingeschraenkt |
| FIX-15 | P1 | Badge-Count im Vault-Health-Modal zaehlt nicht-reparierbare Findings mit | `src/main.ts`, `src/ui/modals/VaultHealthRepairModal.ts` | Resolved -- nur reparierbare Findings |
| FIX-16 | P0 | GitHub Release enthaelt nur main.js/manifest/styles -- WASM-Binaries, Worker, Skills, Templates fehlen. BRAT-User haben kein sql-wasm.wasm -> KnowledgeDB ENOENT | `.github/workflows/release.yml`, `src/core/knowledge/KnowledgeDB.ts` | Resolved -- release.yml erweitert + CDN-Fallback via requestUrl in loadWasmBinary() (Issue #24/#27) |
| FIX-17 | P1 | migrateToParentDir nutzt `await import('fs')` -- schlaegt in Obsidians Electron-Kontext fehl ("Failed to resolve module specifier 'fs'") | `src/main.ts:1355` | Resolved -- require() statt dynamic import (Issue #27) |
| FIX-18 | P1 | KnowledgeDB-Fehler kaskadiert: wenn open() fehlschlaegt, wirft SemanticIndex/VectorStore/MemoryDB 10+ unkontrollierte Errors statt graceful degradation | `src/core/knowledge/KnowledgeDB.ts`, `src/main.ts` | Resolved -- isOpen()-Guard nach open(), null-out + skip downstream services (Issue #27) |
| FIX-19 | P0 | BRAT-Installation fehlen alle Runtime-Assets (Workers, Skills, Templates). Features crashen oder sind nicht verfuegbar. "Works on my machine" weil lokal vault-deploy alles kopiert | `esbuild.config.mjs`, `src/core/AssetProvisioner.ts`, `src/main.ts` | Resolved -- Build-Time Embedding (generateEmbeddedAssets) + Runtime Extraction (AssetProvisioner) mit Version-Gating. 87KB in 14.7MB main.js (+0.6%). BRAT-Testscript: scripts/test-brat-install.sh (Issue #24/#27) |

### Security Findings (abgeglichen mit AUDIT-003 vom 2026-03-06)

Referenz: `_devprocess/analysis/security/AUDIT-003-obsilo-2026-03-06.md`

| ID (AUDIT-003) | Severity | Finding | Status |
|-----------------|----------|---------|--------|
| H-1 | High | Prompt Injection bei permissive Auto-Approval (CWE-77) | By Design -- UI-Warning implementiert (`PermissionsTab.ts:196-212`), Checkpoint-Rollback vorhanden |
| M-1 | Medium | npm-Packages in Sandbox ohne Integritaetspruefung (CWE-494) | Confirmed -- SandboxBridge mitigiert. Known-Good-Hashes mittelfristig |
| M-2 | Medium | Vault-Inhalte (PII) an Cloud-LLMs (CWE-200) | By Design -- Ollama/LM Studio als lokale Alternative, .obsidian-agentignore |
| M-3 | Medium | manage_source Excessive Agency (CWE-269) | By Design -- IMMER manuell genehmigt (self-modify Klassifikation) |
| M-4 | Medium | DNS-Rebinding-Restrisiko in SSRF-Schutz (CWE-918) | Improved -- Zweiphasige Validierung, TOCTOU dokumentiert |
| L-1 | Low | PostMessage targetOrigin '*' in IframeSandboxExecutor (CWE-345) | Known Limitation -- event.source-Pruefung vorhanden |
| L-2 | Low | SelfAuthoredSkillLoader new RegExp() (CWE-1333) | Low Risk -- nur hardcoded Literals als field-Parameter |
| L-3 | Low | MCP-Verbindungen ohne Mutual TLS (CWE-295) | Confirmed -- lokale MCP-Server |

**Ehemalige Findings (aus Scan 2026-03-01, nicht mehr in AUDIT-003):**

| ID (alt) | Finding | Status |
|----------|---------|--------|
| H-1 (alt) | `new Function()` in EsbuildWasmManager (CWE-94) | Resolved -- ProcessSandboxExecutor + SHA-256 |
| H-2 (alt) | PostMessage Origin-Validierung | Resolved -- event.source-Pruefung (jetzt L-1) |
| H-3 (alt) | iframe Sandbox in Electron | Resolved -- ProcessSandboxExecutor auf Desktop |
| M-1 (alt) | User-controlled Regex ReDoS in SearchFilesTool | Resolved -- safeRegex() |
| M-2 (alt) | IgnoreService Glob-to-Regex ReDoS | Resolved -- Length Guard |
| M-4 (alt) | Plugin API Allowlist Bypass (dynamic require) | Resolved -- kein require(), Property-Lookup + Allowlist |
| M-5 (alt) | Path Traversal in GlobalFileService | Resolved -- resolvePath() mit Prefix-Check |

### Memory & Self-Learning Verbesserungen (2026-04-03, ADR-058/059/060)

| Komponente | Aenderung | ADR | Status |
|------------|-----------|-----|--------|
| RecipePromotionService | Komplett umgeschrieben: Embedding-basiertes Intent-Matching statt exakte Tool-Sequenzen | ADR-058 | Implemented |
| RecipeMatchingService | Description-Keyword-Fallback als Phase 2 wenn Trigger-Matching < 3 Ergebnisse | ADR-058 | Implemented |
| LongTermExtractor | Budget-Constraint (800 chars/Datei) im Prompt, Recency-Header [YYYY-MM] | ADR-059 | Implemented |
| MemoryRetriever | DB-Fallback fuer Session-Summaries (statt nur .md-Dateien) | ADR-060 | Implemented |
| MemoryService | getStats() zaehlt Sessions aus DB, MAX_CHARS_PER_FILE exportiert | ADR-060 | Implemented |
| RerankerService | Fail-Once-Guard (_failed Flag) | FIX-07 | Implemented |
| ImplicitConnectionService | isOpen() Guard vor computeAll() | FIX-08 | Implemented |
| main.ts (ChatLink) | YAML-Parse-Fehler concise geloggt, Note uebersprungen | FIX-11 | Implemented |
| main.ts (learnedRecipes) | Force-True statt nullish-coalescing Default | FIX-10 | Implemented |
| SuggestionService | Dead Code -- nie instanziiert, nie aufgerufen | -- | Offen (Backlog) |

### Technische Schulden

| Bereich | Beschreibung | Aufwand | Status |
|---------|-------------|---------|--------|
| UI Modularisierung | `AgentSidebarView.ts` -- Phase 1 erledigt (SuggestionBanner, OnboardingFlow extrahiert), weitere Splits ausstehend | 4-6h | Teilweise (FEATURE-0902) |
| Virtual Scrolling | Lange Chat-Historien verursachen UI-Lag | 4h | Offen |
| Token-Estimation | Grobe ~4 chars/token Schaetzung -- genauer mit js-tiktoken | 2h | Niedrige Prio (funktioniert konsistent) |
| ~~Semantic Index Trigger~~ | ~~Kein Auto-Index bei Vault-Aenderungen~~ | -- | Resolved -- `main.ts:348-363` (vault events + debounce) |
| ~~Error-Format~~ | ~~`<tool_error>` Tags nicht standardisiert~~ | -- | Resolved -- Tools nutzen einheitlich `is_error` Flag |
| ~~i18n Knowledge Layer~~ | ~~Hardcoded EN-Strings in EmbeddingsTab.ts~~ | -- | Resolved -- alle Strings durch t() ersetzt, DE-Übersetzungen hinzugefuegt |
| ~~PDF-Toggle UX~~ | ~~Toggle-Text missverstaendlich~~ | -- | Resolved -- positiv umformuliert ("Only image-only PDFs without extractable text are skipped") |

---

## Community-Wave 1 (v2.5.0, released 2026-04-17)

Quelle: BA-013, IMPL-007. 4 Community-Issues + 3 Dependabot-Alerts + zwei wahrend Beta-Testing entdeckte Regressionen (BUG-017, BUG-018).

### Features (in bestehende Epics eingeordnet)

| Feature ID | Epic | Kurzbeschreibung | Status |
|------------|------|------------------|--------|
| FEATURE-0409 | EPIC-004 | OpenAI-kompatible Streaming Tool-Call Robustheit (post-loop flush fuer OpenRouter gpt-oss-120b + aehnliche) | Implemented v2.5.0 |
| FEATURE-0507 | EPIC-005 | Konfigurierbarer Agent-Folder (Default `.obsidian-agent`) | Implemented v2.5.0 |
| FEATURE-1206 | EPIC-012 | Copilot `max_completion_tokens` fuer neue Modelle (gpt-5, o4-mini) | Implemented v2.5.0 |
| FEATURE-1803 | EPIC-018 | Cross-Platform TMP-Pfade (VaultDataFileAdapter, tmp jetzt vault-resident) | Implemented v2.5.0 |

### ADRs

| ADR | Thema | Status |
|-----|-------|--------|
| ADR-072 | Konfigurierbarer Agent-Storage-Root | Accepted |
| ADR-073 | MCP-Tool-Argument Type-Safety | Superseded (Disables waren schon gefixt) |
| ADR-074 | Dependency-Override-Strategie (transitive Vulnerabilities) | Accepted |

### Bugs resolved

| Bug | Beschreibung | Resolution |
|-----|--------------|------------|
| BUG-013 | OpenRouter Tool-Calls verschluckt bei `finish_reason="stop"` | Post-loop flush in OpenAI + Copilot Provider |
| BUG-014 | TMP-Files nicht lesbar (Windows + generell) | VaultDataFileAdapter, tmp unter `<agent-folder>/tmp/` |
| BUG-015 | Copilot 400 bei `max_tokens` | `max_completion_tokens` fuer alle Modelle |
| BUG-017 | Anthropic 400 "tool_use ids were found without tool_result" | `sanitizeHistoryForApi` Helper, applied an allen 3 createMessage-Stellen |
| BUG-018 | Agent nutzt built-in `create_excalidraw` / halluziniert Drawio-Format | `CreateExcalidrawTool` detect Plugin + redirect, neues `CreateDrawioTool` built-in, write_file Format-Guard fuer .drawio/.drawio.svg/.excalidraw/.canvas/.pptx/.docx/.xlsx, OTHER ENABLED PLUGINS Sektion im System-Prompt |

### Neu hinzugefuegte Tools

| Tool | Scope | Datei |
|------|-------|-------|
| `create_drawio` | Draw.io / diagrams.net Flussdiagramme als `.drawio` oder `.drawio.svg` mit Boxen, Rauten, Ellipsen, Pfeilen, Labels. SVG-Variante rendert direkt in Obsidian und oeffnet editierbar im Plugin. | `src/core/tools/vault/CreateDrawioTool.ts` |

### Security

- protobufjs ueber 7.5.5 (Critical RCE) via `npm overrides`
- hono ueber 4.12.14 (XSS) via `npm overrides`
- dompurify ueber 3.4.0 (FORBID_TAGS bypass) via `npm overrides`

### Offen fuer Wave 2

- ~~**BUG-016**~~ -- Resolved in Wave-2 Arbeit (session-disable auf permanent provider errors statt retry-spam). Befund war: kein Anthropic-Hardcoding, sondern User hatte Anthropic-Modell konfiguriert ohne Credits. Fix ist defensive error handling.
- **Excalidraw-Arrows-Extension** -- `CreateExcalidrawTool` kann aktuell nur rectangles + text. Pfeile brauchen Bezier-Bindings (~300 LOC).
- **Hard Tool-Filter** -- built-in Tools komplett aus dem Schema entfernen, wenn ein Plugin-Aequivalent aktiv ist. Robuster als die Description-Redirect-Heuristik in FEATURE-0507/BUG-018.

## Community-Wave 2 (released als v2.5.1)

| Arbeitsstrom | Status |
|---|---|
| BUG-016 defensive error handling (Memory + Context-Prefix) | Released v2.5.1 (tests: 16/16) |
| Hard Tool-Filter (BUG-018 Wave 2) | Released v2.5.1 (tests: 5/5, `filterShadowedBuiltins` in AgentTask `rebuildPromptCache`) |
| Excalidraw-Arrows-Extension | Released v2.5.1 (tests: 5/5 format, arrows + endpoint bindings, drop-unknown-refs) |
| FEATURE-1600 Deferred Tool Loading | Released v2.5.1 (tests: 14/14, 24 deferred tools hidden by default, `find_tool` activates on demand) |
| Agent-Folder Native Picker (Issue #26 UI) | Released v2.5.1 (Finder/Explorer via electron dialog, vault-relative + absolute support with partial cross-vault semantics) |
| FEATURE-0508 Agent-Folder Change Handling | Released v2.5.2 (P0 notice on save, P1 live retarget of SkillRegistry + VaultDNAScanner without reload, P2 migrate-data button with preview + defensive copy). Tests: 9/9. |

---

## Naechste Prioritaeten

### Kurzfristig (aktiv)

1. **EPIC-019 Knowledge Maintenance** -- Phase 2 groesstenteils erledigt. Offen bleiben FEATURE-1903 (Template-Onboarding einmalig) und FEATURE-1907 (Chat UI Polish). FEATURE-1900 + 1904 + 1906 waren bereits implementiert, nur Backlog-Stand war veraltet.
2. **MCP Remote Auth (FEATURE-1404)** -- Eigener Feature-Branch, nicht Wave 2. Heute: Bearer-Token-Auth (McpBridge + Cloudflare-Relay-Worker). Spec fordert OAuth 2.1 + PKCE (Authorization-Endpoint, PKCE-Challenges, Refresh-Tokens, Client-Registration, Settings-UI) -- ~500-1000 LOC plus Security-Review. Zu gross fuer inkrementelle Wave-Arbeit.
3. ~~**Gemini Provider (ADR-064)**~~ -- Already implemented in the main codebase: `ProviderType 'gemini'`, built-in models, UI labels/colors, model fetching, ModelConfigModal wiring, model-registry entries. Nothing left to do. Flagged in Wave 2 review 2026-04-17.
4. **Wave-2 Triage** -- BUG-016, Excalidraw-Arrows, Hard Tool-Filter (siehe oben)

### Kurzfristig (danach)

1. ~~**Deferred Tool Loading (FEATURE-1600)**~~ -- Implemented in Wave 2. 24 specialised tools hidden from the default prompt, activated on demand via the new `find_tool` meta-tool. Live token impact TBD after sustained use.
2. **Memory Side-Query (FEATURE-1601)** -- macht Memory skalierbar, relevante Memories per Side-Query
3. **Default PPTX Templates (FEATURE-1101)** -- professionelle Vorlagen als Plugin-Assets
4. **Token Budget Management (FEATURE-0603)** -- limitiert Kontext-Ueberladung
5. **On-Demand Image Extraction (FEATURE-0604)** -- komplettiert Document Parsing
6. **MCP Resources/Prompts (FEATURE-1405/1406)** -- erweiterte MCP-Funktionalitaet

### Mittelfristig (4-8 Wochen)

1. **Conditional Skills (FEATURE-1602)** -- kombiniert mit Deferred Loading fuer minimalen Prompt
2. **Parallel SubTasks Phase 1 (FEATURE-1603)** -- read-only Fan-Out via Promise.all
3. MCP Connector verbleibende Features (1407-1411)
4. Storyline-Framework-Skills (FEATURE-1104) -- SCQA, Pyramid etc.
5. Design-Memory-Integration (FEATURE-1106) -- Template-Praeferenz persistent
6. UI Refactoring Phase 2 (SidebarView weitere Splits)
7. Virtual Scrolling fuer lange Chats
8. npm-Package Integrity (Known-Good-Hashes fuer Sandbox-CDN-Pakete)
9. **Task-Typisierung (FEATURE-1604)** -- Housekeeping fuer bessere SubTask-Infra

### Langfristig

1. **Parallel SubTasks Phase 2 (FEATURE-1603)** -- Async SubTasks mit Notification (nur wenn Phase 1 sich bewaehrt)
2. Obsilo Gateway MVP (Monetarisierung)
3. Token-Estimation mit js-tiktoken
