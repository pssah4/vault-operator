# Requirements Overview — Obsidian Agent
Scope: Production (Phasen A-F komplett + EPIC-012 bis EPIC-015)
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
| CORE-01 | Agent Interaction & Modes | `FEATURE-0102-core-interaction.md` |
| CORE-02 | Context Management | `FEATURE-0303-context-management.md` |
| CORE-04 | Custom Instructions, Modes, Rules | `FEATURE-0210-custom-instructions-modes-rules.md` |
| GOV-01 | Permissions & Approval | `FEATURE-0106-permissions-approval.md` |
| GOV-02 | Local Checkpoints & Restore | `FEATURE-0107-checkpoints.md` |
| OPS-01 | Vault Operations (CRUD) | `FEATURE-0103-vault-ops.md` |
| OPS-02 | Controlled Content Editing | `FEATURE-0105-content-editing.md` |
| VIS-01 | Canvas & Bases | `FEATURE-0309-canvas-bases.md` |

### P1 (Extended — alle implementiert)
| Feature Ref | Feature Name | Spec |
|---|---|---|
| EXT-01 | MCP Support | `FEATURE-0401-mcp.md` |
| CORE-03 | Providers & Models | `FEATURE-0403-providers-models.md` |
| KNOW-01 | Semantic Index & Retrieval | `FEATURE-0301-semantic-index.md` |
| FLOW-01 | Workflows & Skills | `FEATURE-0202-workflows.md`, `FEATURE-0203-skills.md` |
| MEM-01 | Memory & Personalization | `FEATURE-0304-memory-personalization.md` |
| MULTI-01 | Multi-Agent (new_task) | `FEATURE-0305-multi-agent.md` |
| SKILL-01 | VaultDNA & Plugin Skills | `FEATURE-0204-local-skills.md` |
| MASTERY-01 | Agent Skill Mastery | `FEATURE-0407-skill-mastery.md` |
| I18N-01 | Localization | `FEATURE-0404-localization.md` |
| STORE-01 | Global Storage | `FEATURE-0310-global-storage.md` |
| SAFE-01 | Safe Storage | `FEATURE-0311-safe-storage.md` |
| SELF-01 | Self-Development & Sandbox | `FEATURE-0501-self-development.md` |
| LOG-01 | Agent Log Viewer | `FEATURE-0503-agent-tools.md` |

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

### EPIC-006: Files-to-Chat (Office-Format-Support) — Teilweise implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEATURE-0601 | Document Parsing Pipeline | P0 | `FEATURE-0601-document-parsing-pipeline.md` | Implementiert |
| FEATURE-0602 | File Picker Erweiterung | P0 | `FEATURE-0602-file-picker-extension.md` | Implementiert |
| FEATURE-0603 | Token-Budget-Management | P1 | `FEATURE-0603-token-budget-management.md` | Geplant |
| FEATURE-0604 | On-Demand Bild-Extraktion | P1 | `FEATURE-0604-on-demand-image-extraction.md` | Geplant |
| FEATURE-0605 | Modell-Kompatibilitäts-Check | P1 | `FEATURE-0605-model-compatibility-check.md` | Geplant |

### EPIC-007: Chat-Linking (Provenienz & Nachvollziehbarkeit) — Vollständig implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEATURE-0702 | Protocol Handler (Deep-Links) | P0 | `FEATURE-0702-protocol-handler.md` | Implementiert |
| FEATURE-0703 | Auto-Frontmatter-Linking | P0 | `FEATURE-0703-auto-frontmatter-linking.md` | Implementiert |
| FEATURE-0704 | Semantisches Chat-Titling | P1 | `FEATURE-0704-semantic-chat-titling.md` | Implementiert |
| FEATURE-0705 | Chat-Linking Setting | P2 | `FEATURE-0705-chat-linking-setting.md` | Implementiert |

### EPIC-008: Task Extraction & Management — Implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEATURE-0801 | Task Extraction & Management | P1 | `FEATURE-0801-task-extraction.md` | Implementiert |

### EPIC-010: Office Document Creation — Implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEATURE-400 | create_pptx Tool | P0 | `FEATURE-400-create-pptx.md` | Implementiert |
| FEATURE-401 | create_docx Tool | P0 | `FEATURE-401-create-docx.md` | Implementiert |
| FEATURE-402 | create_xlsx Tool | P0 | `FEATURE-402-create-xlsx.md` | Implementiert |

### EPIC-011: PPTX Template Pipeline — Teilweise implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEATURE-1100 | PPTX Template-Engine | P0 | `FEATURE-1100-template-engine.md` | Implementiert |
| FEATURE-1117 | plan_presentation Tool | P0 | ADR-048 | Implementiert |
| FEATURE-1118 | Catalog-Enrichment (ingest_template) | P0 | ADR-046 | Implementiert |
| FEATURE-1115 | render_presentation (Visual QA) | P0 | -- | Implementiert |
| FEATURE-1105 | Universelle Design-Prinzipien | P0 | `FEATURE-1105-universal-design-principles.md` | Implementiert |
| FEATURE-1101 | Default PPTX Templates | P1 | `FEATURE-1101-default-templates.md` | Geplant |
| FEATURE-1103 | Theme-Extraktion (vereinfacht) | P1 | `FEATURE-1103-theme-extraction-simplified.md` | Geplant |
| FEATURE-1104 | Storyline-Framework-Skills | P1 | Spec ausstehend | Geplant |
| FEATURE-1106 | Design-Memory-Integration | P2 | Spec ausstehend | Geplant |
| FEATURE-1107 | Follow-up Questions | P2 | Spec ausstehend | Geplant |

### EPIC-012: GitHub Copilot LLM Provider — Vollstaendig implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEATURE-1201 | Auth & Token Management | P0 | `FEATURE-1201-copilot-auth-token-management.md` | Implementiert |
| FEATURE-1202 | Chat Completions Provider | P0 | `FEATURE-1202-copilot-chat-completions.md` | Implementiert |
| FEATURE-1203 | Settings UI Integration | P0 | `FEATURE-1203-copilot-settings-ui.md` | Implementiert |
| FEATURE-1204 | Embedding Support | P1 | `FEATURE-1204-copilot-embedding-support.md` | Implementiert |
| FEATURE-1205 | Dynamic Model Listing | P1 | `FEATURE-1205-copilot-dynamic-model-listing.md` | Implementiert |

### EPIC-013: Kilo Gateway LLM Provider — Vollstaendig implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEATURE-1301 | Auth & Session Management | P0 | `FEATURE-1301-kilo-auth-session-management.md` | Implementiert |
| FEATURE-1302 | Gateway Chat Provider | P0 | `FEATURE-1302-kilo-gateway-chat-provider.md` | Implementiert |
| FEATURE-1303 | Settings UI Integration | P0 | `FEATURE-1303-kilo-settings-ui.md` | Implementiert |
| FEATURE-1304 | Dynamic Model Listing | P1 | `FEATURE-1304-kilo-dynamic-model-listing.md` | Implementiert |
| FEATURE-1305 | Organization Context | P1 | `FEATURE-1305-kilo-organization-context.md` | Implementiert |
| FEATURE-1306 | Embedding Support | P1 | `FEATURE-1306-kilo-embedding-support.md` | Implementiert |
| FEATURE-1307 | Manual Token Mode | P1 | `FEATURE-1307-kilo-manual-token-mode.md` | Implementiert |

### EPIC-014: MCP Connector — Teilweise implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEATURE-1400 | MCP Server Core (stdio) | P0 | `FEATURE-1400-mcp-server-core.md` | Implementiert |
| FEATURE-1401 | Tool-Tier-Mapping | P0 | `FEATURE-1401-tool-tier-mapping.md` | Implementiert |
| FEATURE-1402 | MCP Settings UI | P0 | `FEATURE-1402-mcp-settings-ui.md` | Implementiert |
| FEATURE-1403 | Remote Transport (Cloudflare) | P1 | `FEATURE-1403-remote-transport.md` | In Arbeit |
| FEATURE-1404 | Remote Authentication | P1 | `FEATURE-1404-remote-auth.md` | Geplant |
| FEATURE-1405 | MCP Resources | P1 | `FEATURE-1405-mcp-resources.md` | Geplant |
| FEATURE-1406 | MCP Prompts | P1 | `FEATURE-1406-mcp-prompts.md` | Geplant |
| FEATURE-1407 | Plugin Skill Discovery | P2 | `FEATURE-1407-plugin-skill-discovery.md` | Geplant |
| FEATURE-1408 | Remote Approval Pipeline | P2 | `FEATURE-1408-remote-approval.md` | Zurueckgestellt |
| FEATURE-1409 | Connectors Directory | P2 | `FEATURE-1409-connectors-directory.md` | Geplant |
| FEATURE-1410 | Sandbox Exposure via MCP | P1 | `FEATURE-1410-sandbox-exposure.md` | Geplant |
| FEATURE-1411 | Memory Transparency | P1 | `FEATURE-1411-memory-transparency.md` | Implementiert |

### EPIC-015: Unified Knowledge Layer — Vollstaendig implementiert
| Feature Ref | Feature Name | Priority | Spec | Status |
|---|---|---|---|---|
| FEATURE-1500 | SQLite Knowledge DB | P0 | `FEATURE-1500-sqlite-knowledge-db.md` | Implementiert |
| FEATURE-1501 | Enhanced Vector Retrieval | P0 | `FEATURE-1501-enhanced-vector-retrieval.md` | Implementiert |
| FEATURE-1502 | Graph Data Extraction | P0 | `FEATURE-1502-graph-extraction-expansion.md` | Implementiert |
| FEATURE-1503 | Implicit Connection Discovery | P1 | `FEATURE-1503-implicit-connections.md` | Implementiert |
| FEATURE-1504 | Local Reranking | P1 | `FEATURE-1504-local-reranking.md` | Implementiert |
| FEATURE-1505 | Knowledge Data Consolidation | P1 | `FEATURE-1505-knowledge-data-consolidation.md` | Implementiert |
| FEATURE-1506 | Implicit Connection UI | P2 | `FEATURE-1506-implicit-connection-ui.md` | Implementiert |
| FEATURE-1508 | Storage Consolidation | P0 | `FEATURE-1508-storage-consolidation.md` | Implementiert |

### Community-Wave 1 (2026-04-17, geplant fuer v2.5.0)
> Quelle: BA-013, IMPL-007. Loest 4 Community-Issues, 9+ Bot-Findings, 3 Dependabot-Alerts. Kein neues Epic, neue Features sind in die fachlich passenden bestehenden Epics einsortiert.

| Feature Ref | Feature Name | Epic | Priority | Spec | Status |
|---|---|---|---|---|---|
| FEATURE-0409 | OpenAI-kompatible Streaming Tool-Call Robustheit | EPIC-004 | P1 | `FEATURE-0409-openai-streaming-toolcall-robustness.md` | Implementiert (v2.5.0) |
| FEATURE-0507 | Konfigurierbarer Agent-Folder | EPIC-005 | P2 | `FEATURE-0507-configurable-agent-folder.md` | Implementiert (v2.5.0) |
| FEATURE-1206 | Copilot Modern Model Compatibility (max_completion_tokens) | EPIC-012 | P1 | `FEATURE-1206-copilot-modern-model-compatibility.md` | Implementiert (v2.5.0) |
| FEATURE-1803 | Cross-Platform TMP-Pfade fuer Context Externalization | EPIC-018 | P1 | `FEATURE-1803-cross-platform-tmp-paths.md` | Implementiert (v2.5.0) |

**Querschnitts-Maintenance (kein Feature, nur ADR + IMPL):** Review-Bot Hardening (ADR-073), Dependency Vulnerability Patches (ADR-074).

## ASR Summary
- ASR-01: isomorphic-git Checkpoints (ADR-002) — Implemented
- ASR-02: Central Tool Execution Pipeline (ADR-001) — Implemented
- ASR-mcp-01: MCP Client Integration — Implemented
- ASR-03: vectra Semantic Index (ADR-003) — Implemented
- ASR-04: 3-Tier Memory (ADR-013) — Implemented
- ASR-05: Global Storage (ADR-020) — Implemented
- ASR-06: Pipeline Post-Write Hook für Chat-Linking (ADR-022) — Implemented

## Resolved Decisions
1. Vector storage: vectra (HNSW, TypeScript-native) — ADR-003
2. PDF handling: pdfjs-dist + pdf-parse for content extraction
3. Command whitelist: execute_command via Obsidian command palette, Plugin API via allowlist
4. API key encryption: Electron safeStorage (ADR-019)
5. Cross-vault settings: GlobalFileService at ~/.obsidian-agent/ (ADR-020)
6. Office libraries: docx + ExcelJS + PptxGenJS — ADR-030
7. Binary write pattern: writeBinaryToVault() mit Path-Traversal-Schutz — ADR-031
8. PPTX template mode: Direct Template Mode (groupByLayoutName) — ADR-046
9. PPTX content planning: plan_presentation interner LLM-Call — ADR-048
10. Copilot provider: Streaming Strategy + Token Storage — ADR-036/ADR-038
11. Kilo Gateway: Provider Architecture + Metadata Discovery — ADR-040/ADR-042
12. Knowledge DB: SQLite mit sql.js WASM — ADR-050
13. Retrieval Pipeline: Two-Pass Background Enrichment — ADR-051
14. Local Reranker: @huggingface/transformers Cross-Encoder — ADR-052
15. MCP Server: stdio Bridge mit 3-Tier Tool Mapping — ADR-053/ADR-054
16. Konfigurierbarer Agent-Storage-Root — ADR-072
17. MCP-Tool-Argument Type-Safety (Helper coerceStringArg) — ADR-073
18. Dependency-Override-Strategie fuer transitive Vulnerabilities — ADR-074
