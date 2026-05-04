# Requirements Overview — Obsidian Agent
Scope: Production (Phasen A-F komplett + EPIC-12 bis EPIC-15)
Date: 2026-04-01 (aktualisiert)

## Goal
Local-only, agentic operating layer fuer Obsidian: safe, governed vault operations, multi-provider support, MCP extensibility, semantic search, persistent memory, multi-agent orchestration, and plugin auto-discovery.

## In/Out of Scope
**Implementiert:**
- Sidebar Chat & Mode System (Ask, Agent + Custom Modes)
- Multi-Provider (Anthropic, OpenAI, GitHub Copilot, Kilo Gateway, Ollama, Azure, OpenRouter, LM Studio, Gemini, Custom)
- MCP Client (stdio, SSE, streamable-HTTP)
- Approval-by-default fuer alle Write/Side-Effect Actions
- Local Checkpoints (isomorphic-git) mit Diff & Restore
- Vault Operations (CRUD, Folder Ops, Frontmatter, Daily Notes, Backlinks)
- Canvas Graph Projection (generate_canvas, create_excalidraw)
- Semantic Index (vectra HNSW + Hybrid Search + RRF)
- Operation Logging (JSONL Audit Trail)
- Bases Tools (create_base, update_base, query_base)
- 3-Tier Memory Architecture (Session -> Long-Term -> Soul)
- VaultDNA Plugin Discovery + Plugin API Bridge
- Agent Skill Mastery (Recipes, Episodic Memory, Auto-Promotion)
- Context Condensing & Power Steering
- Multi-Agent (new_task, depth guard, mode restriction)
- i18n (6 Sprachen: DE, EN, ES, JA, ZH-CN, HI)
- Global Storage Architecture (cross-vault Settings)
- SafeStorage (Electron Keychain fuer API-Keys)
- Onboarding-Wizard (5-Schritt Setup)
- Web Tools (web_fetch, web_search via Brave/Tavily)
- Settings/Configure Tools (update_settings, configure_model)
- Tool Repetition Detection
- Notifications (System-Notification bei Task-Abschluss)
- Chat History (ConversationStore, HistoryPanel, restore + continue)
- Autocomplete (/workflows, @files, VaultFilePicker)
- Self-Development Tools (evaluate_expression, manage_skill, manage_source)
- Sandbox OS-Level Isolation (ProcessSandboxExecutor Desktop, IframeSandboxExecutor Mobile-Fallback)
- Agent Log Viewer (read_agent_logs)
- Chat-Linking (Protocol Handler, Auto-Frontmatter-Linking, Semantic Titling, Setting)
- Document Parsing Pipeline (PPTX, XLSX, DOCX, PDF, JSON, XML, CSV)
- File Picker Erweiterung (Office-Formate)
- Task Extraction & Management (TaskExtractor, TaskNoteCreator, TaskSelectionModal)
- Office Document Creation (create_docx, create_pptx, create_xlsx)
- PPTX Template Pipeline (ingest_template, plan_presentation, render_presentation)
- GitHub Copilot Provider (OAuth Device Flow, Chat + Embedding, Dynamic Models)
- Kilo Gateway Provider (Device Auth, Chat + Embedding, Org-Context, Manual Token)
- MCP Server/Connector (McpBridge, 3-Tier Tool Exposure, Claude Desktop Integration)
- Unified Knowledge Layer (SQLite, Vector Store, Graph Extraction, Implicit Connections, Local Reranking)

**Out of Scope:**
- Direct manipulation of Obsidian internal Memory Graph
- Full UI automation (clicking buttons/menus beyond execute_command)
- Cloud backends or sync services (beyond LLM providers)
- Mobile support (desktop-only due to Electron/Node deps)
- ApplyDiffTool / MultiApplyDiffTool (patch-based editing)

## Feature List

### P0 (Core — alle implementiert)
| Feature Ref | Feature Name | Spec |
|---|---|---|
| CORE-01 | Agent Interaction & Modes | `FEAT-01-02-core-interaction.md` |
| CORE-02 | Context Management | `FEAT-03-03-context-management.md` |
| CORE-04 | Custom Instructions, Modes, Rules | `FEAT-02-10-custom-instructions-modes-rules.md` |
| GOV-01 | Permissions & Approval | `FEAT-01-06-permissions-approval.md` |
| GOV-02 | Local Checkpoints & Restore | `FEAT-01-07-checkpoints.md` |
| OPS-01 | Vault Operations (CRUD) | `FEAT-01-03-vault-ops.md` |
| OPS-02 | Controlled Content Editing | `FEAT-01-05-content-editing.md` |
| VIS-01 | Canvas & Bases | `FEAT-03-09-canvas-bases.md` |

### P1 (Extended — alle implementiert)
| Feature Ref | Feature Name | Spec |
|---|---|---|
| EXT-01 | MCP Support | `FEAT-04-01-mcp.md` |
| CORE-03 | Providers & Models | `FEAT-04-03-providers-models.md` |
| KNOW-01 | Semantic Index & Retrieval | `FEAT-03-01-semantic-index.md` |
| FLOW-01 | Workflows & Skills | `FEAT-02-02-workflows.md`, `FEAT-02-03-skills.md` |
| MEM-01 | Memory & Personalization | `FEAT-03-04-memory-personalization.md` |
| MULTI-01 | Multi-Agent (new_task) | `FEAT-03-05-multi-agent.md` |
| SKILL-01 | VaultDNA & Plugin Skills | `FEAT-02-04-local-skills.md` |
| MASTERY-01 | Agent Skill Mastery | `FEAT-04-07-skill-mastery.md` |
| I18N-01 | Localization | `FEAT-04-04-localization.md` |
| STORE-01 | Global Storage | `FEAT-03-10-global-storage.md` |
| SAFE-01 | Safe Storage | `FEAT-03-11-safe-storage.md` |
| SELF-01 | Self-Development & Sandbox | `FEAT-05-01-self-development.md` |
| LOG-01 | Agent Log Viewer | `FEAT-05-03-agent-tools.md` |

## Top Success Criteria
- SC-01 Users explicitly approve 100% of write operations before execution (or auto-approve per category).
- SC-02 Every tool-based modification creates a restore point that can revert the file state.
- SC-03 Agent can use external tools via MCP and internal plugins via VaultDNA.
- SC-04 Retrieval operations find relevant context via hybrid search (semantic + keyword + RRF).
- SC-05 Users can seamlessly switch between providers and configure models per mode.
- SC-06 Memory persists across sessions (user profile, projects, patterns, soul).
- SC-07 Agent can delegate subtasks to child agents (multi-agent orchestration).

## NFR Summary
- **Performance:** Single file write + checkpoint < 2 seconds (perceived). Semantic indexing non-blocking.
- **Availability:** Local-first; zero dependency on external APIs (unless user configures them).
- **Security:** API keys encrypted via OS keychain. No data leaves local machine unless user explicitly configures remote provider/MCP.
- **Scalability:** Indexing supports vaults up to 10k markdown files. Incremental builds with resume support.
- **Internationalization:** Full UI in 6 languages with lazy-load architecture.

## Implementierte Epics

### EPIC-06: Files-to-Chat (Office-Format-Support) — Teilweise implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEAT-06-01 | Document Parsing Pipeline | P0 | `FEAT-06-01-document-parsing-pipeline.md` | Implementiert |
| FEAT-06-02 | File Picker Erweiterung | P0 | `FEAT-06-02-file-picker-extension.md` | Implementiert |
| FEAT-06-03 | Token-Budget-Management | P1 | `FEAT-06-03-token-budget-management.md` | Geplant |
| FEAT-06-04 | On-Demand Bild-Extraktion | P1 | `FEAT-06-04-on-demand-image-extraction.md` | Geplant |
| FEAT-06-05 | Modell-Kompatibilitäts-Check | P1 | `FEAT-06-05-model-compatibility-check.md` | Geplant |

### EPIC-07: Chat-Linking (Provenienz & Nachvollziehbarkeit) — Vollständig implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEAT-07-02 | Protocol Handler (Deep-Links) | P0 | `FEAT-07-02-protocol-handler.md` | Implementiert |
| FEAT-07-03 | Auto-Frontmatter-Linking | P0 | `FEAT-07-03-auto-frontmatter-linking.md` | Implementiert |
| FEAT-07-04 | Semantisches Chat-Titling | P1 | `FEAT-07-04-semantic-chat-titling.md` | Implementiert |
| FEAT-07-05 | Chat-Linking Setting | P2 | `FEAT-07-05-chat-linking-setting.md` | Implementiert |

### EPIC-08: Task Extraction & Management — Implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEAT-08-01 | Task Extraction & Management | P1 | `FEAT-08-01-task-extraction.md` | Implementiert |

### EPIC-10: Office Document Creation — Implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEAT-04-00 | create_pptx Tool | P0 | `FEAT-04-00-create-pptx.md` | Implementiert |
| FEAT-04-01 | create_docx Tool | P0 | `FEAT-04-01-create-docx.md` | Implementiert |
| FEAT-04-02 | create_xlsx Tool | P0 | `FEAT-04-02-create-xlsx.md` | Implementiert |

### EPIC-11: PPTX Template Pipeline — Teilweise implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEAT-11-00 | PPTX Template-Engine | P0 | `FEAT-11-00-template-engine.md` | Implementiert |
| FEAT-11-17 | plan_presentation Tool | P0 | ADR-48 | Implementiert |
| FEAT-11-18 | Catalog-Enrichment (ingest_template) | P0 | ADR-46 | Implementiert |
| FEAT-11-15 | render_presentation (Visual QA) | P0 | -- | Implementiert |
| FEAT-11-05 | Universelle Design-Prinzipien | P0 | `FEAT-11-05-universal-design-principles.md` | Implementiert |
| FEAT-11-01 | Default PPTX Templates | P1 | `FEAT-11-01-default-templates.md` | Geplant |
| FEAT-11-03 | Theme-Extraktion (vereinfacht) | P1 | `FEAT-11-03-theme-extraction-simplified.md` | Geplant |
| FEAT-11-04 | Storyline-Framework-Skills | P1 | Spec ausstehend | Geplant |
| FEAT-11-06 | Design-Memory-Integration | P2 | Spec ausstehend | Geplant |
| FEAT-11-07 | Follow-up Questions | P2 | Spec ausstehend | Geplant |

### EPIC-12: GitHub Copilot LLM Provider — Vollstaendig implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEAT-12-01 | Auth & Token Management | P0 | `FEAT-12-01-copilot-auth-token-management.md` | Implementiert |
| FEAT-12-02 | Chat Completions Provider | P0 | `FEAT-12-02-copilot-chat-completions.md` | Implementiert |
| FEAT-12-03 | Settings UI Integration | P0 | `FEAT-12-03-copilot-settings-ui.md` | Implementiert |
| FEAT-12-04 | Embedding Support | P1 | `FEAT-12-04-copilot-embedding-support.md` | Implementiert |
| FEAT-12-05 | Dynamic Model Listing | P1 | `FEAT-12-05-copilot-dynamic-model-listing.md` | Implementiert |

### EPIC-13: Kilo Gateway LLM Provider — Vollstaendig implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEAT-13-01 | Auth & Session Management | P0 | `FEAT-13-01-kilo-auth-session-management.md` | Implementiert |
| FEAT-13-02 | Gateway Chat Provider | P0 | `FEAT-13-02-kilo-gateway-chat-provider.md` | Implementiert |
| FEAT-13-03 | Settings UI Integration | P0 | `FEAT-13-03-kilo-settings-ui.md` | Implementiert |
| FEAT-13-04 | Dynamic Model Listing | P1 | `FEAT-13-04-kilo-dynamic-model-listing.md` | Implementiert |
| FEAT-13-05 | Organization Context | P1 | `FEAT-13-05-kilo-organization-context.md` | Implementiert |
| FEAT-13-06 | Embedding Support | P1 | `FEAT-13-06-kilo-embedding-support.md` | Implementiert |
| FEAT-13-07 | Manual Token Mode | P1 | `FEAT-13-07-kilo-manual-token-mode.md` | Implementiert |

### EPIC-14: MCP Connector — Teilweise implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEAT-14-00 | MCP Server Core (stdio) | P0 | `FEAT-14-00-mcp-server-core.md` | Implementiert |
| FEAT-14-01 | Tool-Tier-Mapping | P0 | `FEAT-14-01-tool-tier-mapping.md` | Implementiert |
| FEAT-14-02 | MCP Settings UI | P0 | `FEAT-14-02-mcp-settings-ui.md` | Implementiert |
| FEAT-14-03 | Remote Transport (Cloudflare) | P1 | `FEAT-14-03-remote-transport.md` | In Arbeit |
| FEAT-14-04 | Remote Authentication | P1 | `FEAT-14-04-remote-auth.md` | Geplant |
| FEAT-14-05 | MCP Resources | P1 | `FEAT-14-05-mcp-resources.md` | Geplant |
| FEAT-14-06 | MCP Prompts | P1 | `FEAT-14-06-mcp-prompts.md` | Geplant |
| FEAT-14-07 | Plugin Skill Discovery | P2 | `FEAT-14-07-plugin-skill-discovery.md` | Geplant |
| FEAT-14-08 | Remote Approval Pipeline | P2 | `FEAT-14-08-remote-approval.md` | Zurueckgestellt |
| FEAT-14-09 | Connectors Directory | P2 | `FEAT-14-09-connectors-directory.md` | Geplant |
| FEAT-14-10 | Sandbox Exposure via MCP | P1 | `FEAT-14-10-sandbox-exposure.md` | Geplant |
| FEAT-14-11 | Memory Transparency | P1 | `FEAT-14-11-memory-transparency.md` | Implementiert |

### EPIC-15: Unified Knowledge Layer — Vollstaendig implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEAT-15-00 | SQLite Knowledge DB | P0 | `FEAT-15-00-sqlite-knowledge-db.md` | Implementiert |
| FEAT-15-01 | Enhanced Vector Retrieval | P0 | `FEAT-15-01-enhanced-vector-retrieval.md` | Implementiert |
| FEAT-15-02 | Graph Data Extraction | P0 | `FEAT-15-02-graph-extraction-expansion.md` | Implementiert |
| FEAT-15-03 | Implicit Connection Discovery | P1 | `FEAT-15-03-implicit-connections.md` | Implementiert |
| FEAT-15-04 | Local Reranking | P1 | `FEAT-15-04-local-reranking.md` | Implementiert |
| FEAT-15-05 | Knowledge Data Consolidation | P1 | `FEAT-15-05-knowledge-data-consolidation.md` | Implementiert |
| FEAT-15-06 | Implicit Connection UI | P2 | `FEAT-15-06-implicit-connection-ui.md` | Implementiert |
| FEAT-15-08 | Storage Consolidation | P0 | `FEAT-15-08-storage-consolidation.md` | Implementiert |

### Community-Wave 1 (2026-04-17, released als v2.5.0)
> Quelle: BA-13, IMPL-007. Loest 4 Community-Issues, 9+ Bot-Findings, 3 Dependabot-Alerts plus zwei wahrend Beta-Testing entdeckte Regression-Bugs (BUG-017, BUG-018). Kein neues Epic, neue Features sind in die fachlich passenden bestehenden Epics einsortiert.

| Feature Ref | Feature Name | Epic | Priority | Spec | Status |
|---|---|---|---|---|---|
| FEAT-04-09 | OpenAI-kompatible Streaming Tool-Call Robustheit | EPIC-04 | P1 | `FEAT-04-09-openai-streaming-toolcall-robustness.md` | Implementiert (v2.5.0) |
| FEAT-05-07 | Konfigurierbarer Agent-Folder | EPIC-05 | P2 | `FEAT-05-07-configurable-agent-folder.md` | Implementiert (v2.5.0) |
| FEAT-12-06 | Copilot Modern Model Compatibility (max_completion_tokens) | EPIC-12 | P1 | `FEAT-12-06-copilot-modern-model-compatibility.md` | Implementiert (v2.5.0) |
| FEAT-18-03 | Cross-Platform TMP-Pfade fuer Context Externalization | EPIC-18 | P1 | `FEAT-18-03-cross-platform-tmp-paths.md` | Implementiert (v2.5.0) |
| FEAT-18-04 | Cost-Aware Agent Heuristics (Plan-First, Tool-Tiers, Brakes, Telemetry) | EPIC-18 | P0 | `FEAT-18-04-cost-aware-agent-heuristics.md` | Implementiert 2026-04-29 (ADR-90, BUG-032) |

**Waehrend Beta-Testing nachgezogen (BUG-017, BUG-018):**

| Arbeitsstrom | Beschreibung | Status |
|---|---|---|
| BUG-017 | Pre-send history-sanitize (orphan tool_use/tool_result) | Implementiert (v2.5.0) |
| BUG-018 | Plugin-Routing: Excalidraw-Detection, OTHER ENABLED PLUGINS, write_file-Format-Guard | Implementiert (v2.5.0) |
| create_drawio | Neues Built-in Tool fuer Drawio / Diagrams.net Flussdiagramme (.drawio und .drawio.svg) | Implementiert (v2.5.0) |

**Querschnitts-Maintenance (kein Feature, nur ADR + IMPL):** Review-Bot Hardening (ADR-73), Dependency Vulnerability Patches (ADR-74).

## ASR Summary
- ASR-01: isomorphic-git Checkpoints (ADR-02) — Implemented
- ASR-02: Central Tool Execution Pipeline (ADR-01) — Implemented
- ASR-mcp-01: MCP Client Integration — Implemented
- ASR-03: vectra Semantic Index (ADR-03) — Implemented
- ASR-04: 3-Tier Memory (ADR-13) — Implemented
- ASR-05: Global Storage (ADR-20) — Implemented
- ASR-06: Pipeline Post-Write Hook für Chat-Linking (ADR-22) — Implemented

## Resolved Decisions
1. Vector storage: vectra (HNSW, TypeScript-native) — ADR-03
2. PDF handling: pdfjs-dist + pdf-parse for content extraction
3. Command whitelist: execute_command via Obsidian command palette, Plugin API via allowlist
4. API key encryption: Electron safeStorage (ADR-19)
5. Cross-vault settings: GlobalFileService at ~/.obsidian-agent/ (ADR-20)
6. Office libraries: docx + ExcelJS + PptxGenJS — ADR-30
7. Binary write pattern: writeBinaryToVault() mit Path-Traversal-Schutz — ADR-31
8. PPTX template mode: Direct Template Mode (groupByLayoutName) — ADR-46
9. PPTX content planning: plan_presentation interner LLM-Call — ADR-48
10. Copilot provider: Streaming Strategy + Token Storage — ADR-36/ADR-38
11. Kilo Gateway: Provider Architecture + Metadata Discovery — ADR-40/ADR-42
12. Knowledge DB: SQLite mit sql.js WASM — ADR-50
13. Retrieval Pipeline: Two-Pass Background Enrichment — ADR-51
14. Local Reranker: @huggingface/transformers Cross-Encoder — ADR-52
15. MCP Server: stdio Bridge mit 3-Tier Tool Mapping — ADR-53/ADR-54
16. Konfigurierbarer Agent-Storage-Root — ADR-72
17. MCP-Tool-Argument Type-Safety (Helper coerceStringArg) — ADR-73
18. Dependency-Override-Strategie fuer transitive Vulnerabilities — ADR-74
