# arc42 — Obsidian Agent Architecture

**Version:** 5.1
**Stand:** 2026-05-04
**Status:** Aktuell — EPIC-18 Token-Kostenreduktion implementiert, EPIC-19 Knowledge Maintenance Phase 1 implementiert, EPIC-20 Graph Intelligence implementiert (v2.4.3), MCP Remote Transport (FEAT-14-03) implementiert, **EPIC-23 Cross-Surface AI Workflow** ausgeliefert (v2.7.0): MCP-Remote-Tools save_to_memory / save_conversation / recall_memory / search_history; Cloudflare-Worker-Relay; Source-Interface-Tagging; Living Documents + Cross-Interface-Threads. **BA-25 Vault-Summary-Pflege** komplett: PLAN-10..14 released, knowledge.db Schema v9 -> v10. Memory v2 Stabilisierungs-Pass (3 IMPs). Drei Security-Audits (AUDIT-014/015/016) abgeschlossen mit Hardening: McpRateLimiter, sanitizeVaultContentForLLM, strictSourceIsolation, content-caps, crypto.randomUUID.

---

## 1. Einführung und Ziele

### 1.1 Aufgabenstellung
Obsidian Agent ist ein Obsidian-Plugin, das einen vollständigen KI-Agenten direkt in den Obsidian-Desktop integriert. Es implementiert die Kilo-Code-Architektur (VS-Code-Extension) für den Obsidian-Kontext: Vault-Operationen ersetzen IDE-Operationen, während die Kernmuster für Tool Governance, Approval, Checkpoints und MCP-Erweiterbarkeit übernommen werden.

### 1.2 Qualitätsziele

| Priorität | Qualitätsziel | Szenario |
|-----------|--------------|---------|
| 1 | **Datensicherheit** | Keine Vault-Datei wird ohne explizite Freigabe durch den Nutzer verändert. |
| 2 | **Erweiterbarkeit** | Neue Tools und MCP-Server können ohne Änderung am Core integriert werden. |
| 3 | **Privacy** | Kein Cloud-Service außer dem konfiguriertem LLM-Provider. Semantic Index läuft lokal. |
| 4 | **Transparenz** | Jede Tool-Ausführung ist im Audit-Log nachvollziehbar und undo-bar. |
| 5 | **Performance** | Plugin-Start < 1s, Semantic Indexing blockiert die UI nicht. |

### 1.3 Stakeholder

| Rolle | Erwartung |
|-------|-----------|
| Obsidian-Nutzer | Agentic AI direkt im Vault, keine Einrichtungshürden |
| Vault-Owner | Kontrolle über jede Änderung, Undo-Möglichkeit |
| Entwickler (Erweiterung) | Klare Extension Points (Tools, MCP, Modes) |

---

## 2. Randbedingungen

### 2.1 Technische Randbedingungen
- **Obsidian Plugin API** — Zugriff auf Vault, MetadataCache, Workspace via `app.*`
- **Electron-Renderer** — TypeScript/Node.js, Hybrid-Sandbox fuer Code-Ausfuehrung: Desktop `child_process.fork()` (OS-Level Prozess-Isolation, ADR-21), Mobile iframe (V8 Origin Isolation)
- **No system git** — `isomorphic-git` für Checkpoints (Pure-JS, keine System-Abhängigkeit)
- **Obsidian Sync kompatibel** — Index-Daten im `.obsidian/`-Verzeichnis für Sync

### 2.2 Organisatorische Randbedingungen
- Apache 2.0 Lizenz
- Kilo Code als Referenzimplementierung (`forked-kilocode/`, gitignored, device-local)
- Private Dokumentation in `_devprocess/` (nur im dev-Branch getrackt, nie publiziert)

---

## 3. Kontextabgrenzung

### 3.1 Fachlicher Kontext

```
                    ┌──────────────────┐
     Nutzer ───────►│  Obsidian Agent  │◄──── Obsidian Vault (Markdown, Canvas, Bases)
                    │  (Plugin)        │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        LLM Provider     MCP Server    Obsidian API
        (Anthropic,      (externe      (vault, metadataCache,
         OpenAI,          Tools)        workspace, settings)
         Custom)
```

### 3.2 Technischer Kontext

| Nachbar | Kanal | Richtung |
|---------|-------|----------|
| LLM-Provider (Anthropic, OpenAI) | HTTPS / SSE | → (Anfrage), ← (Stream) |
| MCP-Server | stdio (subprocess) | ↔ (JSON-RPC) |
| Obsidian Vault | Obsidian Vault API | ↔ (read/write) |
| Obsidian MetadataCache | In-Memory | → (links, tags, frontmatter) |
| isomorphic-git Shadow-Repo | Filesystem | ↔ (checkpoint commits) |
| KnowledgeDB (sql.js WASM) | `~/.obsidian-agent/knowledge.db` | ↔ (vectors, graph, implicit edges) |
| MemoryDB (sql.js WASM) | `{vault}/.obsidian-agent/memory.db` | ↔ (sessions, episodes, recipes, patterns) |
| @huggingface/transformers | In-Process (WASM) | ← (reranking via ms-marco-MiniLM) |
| Sandbox (Desktop) | Node.js IPC via child_process.fork (OS-level process isolation) | ↔ (code execution) |
| Sandbox (Mobile) | postMessage via iframe (V8 origin isolation) | ↔ (code execution) |
| CDN (esm.sh, jsdelivr) | HTTPS (via requestUrl) | ← (npm packages) |
| esbuild-wasm | In-Process (WASM) | ← (TypeScript compilation) |

---

## 4. Lösungsstrategie

### Kernentscheidungen

1. **Central Tool Execution Pipeline** — Alle Tool-Aufrufe (intern + MCP) fließen durch eine zentrale Governance-Schicht. Keine Tool-Ausführung ohne Pipeline.

2. **Fail-Closed Approval** — Fehlt der Approval-Callback, wird eine Aktion abgelehnt. Kein Approval = kein Write.

3. **Shadow Git Repository** — Checkpoints via isomorphic-git im `.obsidian/plugins/obsidian-agent/checkpoints/`-Verzeichnis. Keine externen Abhängigkeiten, Undo ohne System-Git.

4. **Mode-Based Tool Filtering** — Jeder Mode definiert seine Tool-Gruppen. Der Agent sieht nur die für seinen Mode relevanten Tools. Keine globalem Tool-Whitelist nötig.

5. **4-Stufen Retrieval Pipeline (EPIC-15)** — SQLite Knowledge DB (sql.js WASM) + 4-Stufen Suche: Vector Search (Cosine-Similarity) → Graph Expansion (Wikilinks + MOC-Properties) → Implicit Connections (vorberechnete semantische Paare) → Local Reranking (Cross-Encoder via @huggingface/transformers WASM). Keine Cloud-Abhängigkeit. Zwei DBs: knowledge.db (global, Vektoren) + memory.db (vault-lokal, Sessions). [ADR-50](ADR-50-sqlite-knowledge-db.md), [ADR-51](ADR-51-retrieval-pipeline.md), [ADR-52](ADR-52-local-reranker.md)

6. **Sliding Window Repetition Detection** — Erkennt Tool-Loops (gleiche Tool+Input-Kombination >= 3x in letzten 10 Calls) und bricht den Loop ab.

7. **Multi-Provider API (Adapter Pattern)** — Einheitliches `ApiHandler`-Interface fuer Anthropic (nativ) und alle OpenAI-kompatiblen Provider (OpenAI, Ollama, LM Studio, OpenRouter, Azure, Custom, GitHub Copilot, Kilo Gateway). Internes Message-Format ist Anthropic-nativ. GitHub Copilot via OAuth Device Code Flow ([ADR-36](ADR-36-copilot-streaming-strategy.md)-[ADR-39](ADR-39-copilot-content-normalization.md)), Kilo Gateway via Device Auth + OpenAI-kompatible API ([ADR-40](ADR-40-kilo-provider-architecture.md)-[ADR-43](ADR-43-kilo-embedding-gating-strategy.md)). [ADR-11](ADR-11-multi-provider-api.md)

8. **3-Tier Memory Architecture** — Chat History (kurzfristig) -> Session Summaries (mittelfristig, LLM-extrahiert) -> Long-Term Memory (langfristig, Fakten-Promotion). Asynchrone Verarbeitung via persistenter ExtractionQueue. [ADR-13](ADR-13-memory-architecture.md)

9. **VaultDNA Plugin Discovery** — Automatischer Runtime-Scan aller installierten Plugins. Generiert Skill-Files mit Commands und API-Methoden. Agent kann Plugins aktivieren und deren APIs nutzen. [ADR-14](ADR-14-vault-dna-plugin-discovery.md)

10. **Hybrid Search (Semantic + TF-IDF + RRF + Graph + Implicit + Reranking)** — Kombiniert Vektor-Aehnlichkeit (SQLite Cosine) mit TF-IDF-Keyword-Scoring (Stemming + Stop-Word-Filter + Title-Boost). Ergebnis-Fusion via Reciprocal Rank Fusion (k=60). Dann: Local Reranking (Cross-Encoder), Graph Expansion (1-3 Hops via edges-Tabelle), Implicit Connection Discovery (semantisch aehnliche Notes ohne Link). [ADR-15](ADR-15-hybrid-search-rrf.md), [ADR-50](ADR-50-sqlite-knowledge-db.md), [ADR-51](ADR-51-retrieval-pipeline.md)

11. **Agent Skill Mastery (3-Ebenen)** — A) Rich Tool Descriptions mit Examples/When-to-use in ToolMeta [ADR-16](ADR-16-rich-tool-descriptions.md). B) Procedural Recipes: Schritt-fuer-Schritt Rezepte fuer bekannte Tasks, keyword-first Matching, 2000 chars Budget [ADR-17](ADR-17-procedural-recipes.md). C) Episodic Task Memory: Aufzeichnung erfolgreicher Ausfuehrungen ohne extra API-Call, Auto-Promotion zu Rezepten bei 3+ Erfolgen [ADR-18](ADR-18-episodic-task-memory.md).

12. **Chat-Linking (Pipeline Post-Write Hook)** — Nach jeder erfolgreichen Write-Operation auf `.md`-Dateien wird die aktuelle Conversation-ID als `obsidian://obsilo-chat?id={id}` Deep-Link im YAML-Frontmatter gespeichert. Hook sitzt in der Pipeline (konsistent mit Checkpoint, Cache, Audit). Nutzer kann aus jeder Note direkt in den Chat-Kontext zurueckspringen. [ADR-22](ADR-22-chat-linking.md)

13. **Document Parser als wiederverwendbare Tools (Hybrid)** — Parsing-Logik in `DocumentParserRegistry` (Service-Kern), Chat-Attachments rufen Service direkt auf (Performance), Agent nutzt Tool-Wrapper (`read_document`, `extract_document_images`) in ToolRegistry. Neue Formate ohne Architekturaenderung. [ADR-23](ADR-23-document-parser-tools.md)

14. **Leichtgewicht-Parsing (JSZip + Custom OOXML)** — JSZip (~30 KB) als einzige neue Dependency fuer OOXML-Formate (PPTX, XLSX, DOCX). Eigene Parser navigieren ZIP-Struktur + DOMParser fuer XML. PDF via pdfjs-dist (bestehend). JSON/XML/CSV nativ. [ADR-24](ADR-24-parsing-library-selection.md)

15. **On-Demand Bild-Nachlade (Lazy Extraction)** — Beim Parsing nur Bild-Metadaten erfasst, Bilder erst bei Agent-Tool-Aufruf extrahiert. Vision-Gate prueft Model-Capability. System Prompt steuert Agent-Entscheidung. [ADR-25](ADR-25-on-demand-image-strategy.md)

16. **Deterministische Task Extraction (Post-Processing Hook)** — Nach Agent-Completion scannt ein Regex-basierter `TaskExtractor` den Antworttext auf `- [ ]` Items. Gefundene Tasks werden im `TaskSelectionModal` praesentiert. Ausgewaehlte Items werden als eigenstaendige Notes mit 10-Property-Frontmatter-Schema (Kategorie, Status, Zusammenfassung, Eisenhower-Felder, Quelle, Assignee) erstellt. Iconic-Integration und Base-Erstellung sind als Erweiterung geplant (ADR-28), aber noch nicht implementiert. Kein AI-Inferenzaufwand — gesamter Flow deterministisch. [ADR-26](ADR-26-post-processing-hook.md), [ADR-27](ADR-27-task-note-schema.md), [ADR-28](ADR-28-base-plugin-integration.md)

---

## 5. Bausteinsicht

### 5.1 Ebene 1: Übersicht

```
┌──────────────────────────────────────────────────────────────┐
│                  ObsidianAgentPlugin (main.ts)                │
│  Plugin-Lifecycle · Services-Init · Commands · Views         │
└────────────┬───────────────┬───────────────┬─────────────────┘
             │               │               │
      ┌──────▼──────┐ ┌──────▼──────┐ ┌────▼─────────────┐
      │   UI Layer  │ │ Core Engine │ │  Service Layer   │
      │  (sidebar,  │ │ (AgentTask) │ │ (infra + tools)  │
      │   modals)   │ │             │ │ Memory, History   │
      └─────────────┘ └─────────────┘ └──────────────────┘
```

**UI Layer — Komponenten:**

| Komponente | Zuständigkeit |
|------------|--------------|
| `AgentSidebarView` | Chat-UI, Mode-Selector, Streaming, Approval-Cards, Todo-Box, Undo-Bar |
| `AutocompleteHandler` | `/`-Workflows, `@`-Dateien Autocomplete |
| `VaultFilePicker` | Live-Suche und Multi-Select für Datei-Anhänge |
| `ToolPickerPopover` | Session-Overrides für Tools / Skills / Workflows |
| `AttachmentHandler` | Datei-Anhänge als Kontext in der Chat-Eingabe |
| `ApproveEditModal` | Line-by-line Diff-View vor Edit-Approval |
| `HistoryPanel` | Sliding overlay mit gruppierten Gesprächen, Suche, Restore |
| `AgentSettingsTab` | Settings-Router (20 Tabs, inkl. Memory, Language, Log, Shell) |

### 5.2 Ebene 2: Core Engine

```
AgentTask.run()
  │
  ├── buildSystemPromptForMode()  ← systemPrompt.ts (orchestrator)
  │     ├── Modular sections (src/core/prompts/sections/)
  │     │     ├── dateTime, vaultContext, capabilities, objective
  │     │     ├── tools (← toolMetadata.ts single source of truth)
  │     │     ├── toolRules, toolDecisionGuidelines
  │     │     ├── responseFormat, explicitInstructions, securityBoundary
  │     │     └── modeDefinition, customInstructions, skills, rules
  │     ├── ModeService.getToolDefinitions()
  │     ├── RulesLoader (vault + global rules)
  │     ├── SkillsManager (per-mode skills)
  │     ├── WorkflowLoader (slash-commands)
  │     └── MemoryService.buildMemoryContext() (user profile, projects, patterns)
  │
  ├── API call (Anthropic/OpenAI stream)
  │
  ├── Process tool_use blocks
  │     ├── ToolRepetitionDetector.check()
  │     └── ToolExecutionPipeline.executeTool()
  │           ├── 1. IgnoreService.validate()
  │           ├── 2. checkApproval() [fail-closed]
  │           │     └── ApproveEditModal (Diff-View für edit_file)
  │           ├── 3. GitCheckpointService.snapshot()
  │           ├── 4. tool.execute()
  │           ├── 5. OperationLogger.log()
  │           └── 6. stampChatLink() [.md + chatLinking enabled]
  │
  └── Context Condensing (wenn threshold erreicht)
```

### 5.3 Ebene 2: Tool Registry (49 Tools, 7 Gruppen)

```
ToolRegistry
  ├── read group (4):   read_file, read_document, list_files, search_files
  ├── vault group (8):  get_frontmatter, search_by_tag, get_vault_stats,
  │                     get_linked_notes, get_daily_note, open_note,
  │                     semantic_search, query_base
  ├── edit group (15):  write_file, edit_file, append_to_file, create_folder,
  │                     delete_file, move_file, update_frontmatter,
  │                     generate_canvas, create_excalidraw,
  │                     create_base, update_base,
  │                     create_docx, create_pptx, create_xlsx,
  │                     plan_presentation
  ├── web group (2):    web_fetch, web_search
  ├── agent group (12): ask_followup_question, attempt_completion,
  │                     update_todo_list, new_task, switch_mode,
  │                     update_settings, configure_model,
  │                     read_agent_logs, manage_mcp_server,
  │                     manage_skill, evaluate_expression, manage_source
  ├── skill group (6):  execute_command, execute_recipe, call_plugin_api,
  │                     resolve_capability_gap, enable_plugin, render_presentation
  └── mcp group (1):    use_mcp_tool
  + vault_health_check (registriert, nicht in Gruppen -- intern via VaultHealthService getriggert)
  + DynamicToolFactory (runtime-registered custom tools)
```

Hinweis: `ingest_template` wurde entfernt (kein IngestTemplateTool.ts mehr vorhanden). `vault_health_check` (FEAT-19-01, ADR-67) ist registriert aber nicht in den Standard-Tool-Gruppen, da es primaer beim Vault-Open automatisch ausgefuehrt wird.

### 5.4 Ebene 2: Document Parser Pipeline (EPIC-06)

```
DocumentParserRegistry (Service-Kern)
  ├── register(extensions, parser)   -- Extension -> IDocumentParser
  ├── parse(path, data, options?)    -- Dispatcher
  └── canParse(extension)            -- Format-Check

Registrierte Parser:
  ├── PptxParser   (.pptx)  -- JSZip + DOMParser, Folien-Text + Bild-Metadaten
  ├── XlsxParser   (.xlsx)  -- JSZip + DOMParser, Sheet-Tab-Struktur
  ├── DocxParser   (.docx)  -- JSZip + DOMParser, Absaetze + Ueberschriften
  ├── PdfParser    (.pdf)   -- pdfjs-dist v4.4.168 (Refactoring aus SemanticIndexService)
  └── DataFormatParser (.json, .xml, .csv)  -- Native APIs

Aufrufwege:
  1. Chat-Attachment:  AttachmentHandler -> DocumentParserRegistry.parse() (direkt, kein Tool-Overhead)
  2. Agent-initiiert:  Agent -> ReadDocumentTool -> DocumentParserRegistry.parse() (via Tool-Pipeline)
  3. Bild-Nachlade:    Agent -> ExtractDocumentImagesTool -> JSZip (erneutes Oeffnen, Lazy Extraction)
  4. Semantic Index:   SemanticIndexService -> PdfParser.parse() (Refactoring, keine Duplikation)
```

ADR: [ADR-23](ADR-23-document-parser-tools.md), [ADR-24](ADR-24-parsing-library-selection.md), [ADR-25](ADR-25-on-demand-image-strategy.md).

### 5.7 Ebene 2: Task Extraction Pipeline (FEAT-08-01)

```
AgentSidebarView.onComplete()
  │
  └── maybeExtractTasks(accumulatedText)
        │
        ├── TaskExtractor.scan(text)           # Pure: Regex → TaskItem[]
        │     └── Pattern: /^\s*- \[ \]\s+(.+)$/gm
        │
        ├── if items.length === 0 → return
        │
        └── new TaskSelectionModal(items)
              │
              └── onConfirm(selectedItems)
                    │
                    ├── TaskNoteCreator.createNotes(items, settings, sourceNote)
                    │     ├── Frontmatter: 10 Properties (Schema ADR-27, implementiertes Schema)
                    │     ├── Vault.create() pro Note
                    │     └── Fehler: partial success (bereits erstellte Notes bleiben)
```

ADR: [ADR-26](ADR-26-post-processing-hook.md), [ADR-27](ADR-27-task-note-schema.md), [ADR-28](ADR-28-base-plugin-integration.md). Feature-Spec: `FEAT-08-01-task-extraction.md`.

### 5.8 Ebene 2: Office Document Creation (EPIC-10 + EPIC-11)

```
CreateDocxTool / CreateXlsxTool (EPIC-10 -- programmatisch)
  │
  ├── Input: Strukturiertes Schema (Sections/Sheets mit Inhalt, Styling)
  ├── Library: docx (DOCX), ExcelJS (XLSX)
  ├── Output: ArrayBuffer → writeBinaryToVault()
  │     ├── Path-Traversal-Schutz (../, absolute Pfade)
  │     ├── Extension-Validierung (erzwungen)
  │     └── Ordner-Erstellung (automatisch)
  └── Limits: max 100 Sections (DOCX), 20 Sheets (XLSX)

CreatePptxTool (EPIC-11 -- Direct Template Mode, ADR-46)
  │
  ├── Modus 1: Template Mode (source_slide + content mit physischen Shape-Namen)
  │     ├── Input: source_slide (Slide-Nr. aus Slide-Type-Guide) + content (Shape-Name → Wert)
  │     ├── Engine: TemplateEngine.ts (pptx-automizer) — klont Slides, manipuliert Shapes
  │     ├── 10 Content-Typen: string, styled_text, html_text, replace_text, chart, table,
  │     │   image, duotone, position, rotate, hyperlink
  │     ├── Auto-Remove: unbenutzte removable Shapes verschwinden (Fail-Safe)
  │     ├── Auto-Upgrade: Multi-Line Strings → styled_text mit Bullets (Body-Shapes)
  │     └── Output: ArrayBuffer → writeBinaryToVault()
  │
  └── Modus 2: Adhoc Mode (html)
        ├── Input: html-Inhalt pro Slide
        ├── Engine: AdhocSlideBuilder.ts (PptxGenJS)
        └── Output: ArrayBuffer → writeBinaryToVault()

IngestTemplateTool (EPIC-11 -- Template-Ingestion, ADR-46)
  │
  ├── Shape Discovery: pptx-automizer extrahiert alle Shapes + Layouts
  ├── groupByLayoutName(): Gruppiert Slides nach PowerPoint-Layout-Namen
  │     ├── Kein Clustering, keine Fuzzy-Logik — nativer OOXML-Grupierungsschlüssel
  │     ├── Representative Slide: Slide mit meisten nicht-dekorativen Shapes
  │     └── SlideType: id, layout_name, representative_slide, alternate_slides, shapes
  ├── Slide-Type-Guide: Markdown-Format, direkt lesbar durch Agent + LLM
  │     ├── Pro Typ: id, description, REQUIRED/optional-Status, max_chars
  │     └── Shape-Namen = direkte Content-Keys für CreatePptxTool
  ├── Vision-Enrichment (optional, LibreOffice erforderlich):
  │     ├── Rendert representative Slides → PNG
  │     ├── Ein LLM-Call für alle Slide-Types (kein pro-Slide-Call)
  │     └── Ergänzt: visual_description + use_when pro SlideType
  └── Output: catalog.json (.obsilo/themes/{name}/) + Slide-Type-Guide im Tool-Result

RenderPresentationTool (EPIC-11 -- Visuelle QA)
  │
  ├── LibreOffice headless: PPTX → PDF → PNG
  ├── Agent prüft Slides visuell (multimodale Tool-Ergebnisse)
  └── Optionaler Schritt nach create_pptx
```

ADR: [ADR-29](ADR-29-office-tool-input-schema.md), [ADR-30](ADR-30-office-library-selection.md), [ADR-31](ADR-31-binary-write-pattern.md), [ADR-46](ADR-46-direct-template-mode.md). (ADR-32, ADR-33, ADR-34, ADR-35, ADR-44, ADR-45: deprecated, superseded by ADR-46)

Tool-Beschreibungen kommen aus `toolMetadata.ts` (Single Source of Truth fuer Prompt und UI). Feature-Spec: `FEAT-05-06-tool-metadata-registry.md`. ADR: [ADR-08](ADR-08-modular-prompt-sections.md).

### 5.5 Ebene 2: Unified Knowledge Layer (EPIC-15)

```
Zwei-DB-Strategie (ADR-50):

  knowledge.db (global, ~/.obsidian-agent/)        memory.db (vault-lokal)
  ├── vectors (Chunk-Embeddings, Float32 BLOBs)    ├── sessions
  ├── edges (Wikilinks + MOC-Properties)            ├── episodes
  ├── tags (Inline + Frontmatter)                   ├── recipes
  ├── implicit_edges (vorberechnete Paare)          └── patterns
  ├── dismissed_pairs (UI Feedback)
  └── checkpoint (Metadaten)

4-Stufen Retrieval Pipeline (ADR-51):

  SemanticSearchTool.execute()
    │
    ├── [optional] HyDE: LLM generiert hypothetisches Dokument
    │
    ├── Parallel:
    │     ├── Semantic: VectorStore.searchWithContext (Cosine, Adjacent Chunks)
    │     └── Keyword: TF-IDF mit Stemming + Stop-Words + Title-Boost
    │
    ├── RRF Fusion (k=60): score(doc) = SUM(1/(60+rank_i))
    ├── Metadata Filter (folder, tags, since)
    │
    ├── Stufe 4: Local Reranking (Cross-Encoder via transformers.js WASM)
    │             ms-marco-MiniLM-L-6-v2, ~160ms fuer 20 Kandidaten
    │
    ├── results.slice(0, topK)
    │
    ├── Stufe 2: Graph Expansion (GraphStore.getNeighbors, 1-3 Hops BFS)
    │             Wikilinks (body) + MOC-Properties (frontmatter)
    │
    ├── Stufe 3: Implicit Connections (ImplicitConnectionService)
    │             Semantisch aehnliche Notes ohne expliziten Link
    │
    └── Output mit Excerpts + Verbindungskontext

  Background Processes:
    ├── Contextual Enrichment (Two-Pass): Haiku-Prefixes im Hintergrund
    ├── Graph Extraction: metadataCache → edges/tags bei Vault-Events
    └── Implicit Computation: Paarweiser Cosine auf Note-Level-Vektoren

Key Files:
  ├── src/core/knowledge/KnowledgeDB.ts        (SQLite Wrapper, Schema v10 -- BA-25 Bundle, ADR-92)
  ├── src/core/knowledge/MemoryDB.ts           (Zweite DB fuer Memory-Daten)
  ├── src/core/knowledge/VectorStore.ts        (Vector CRUD + Cosine Search)
  ├── src/core/knowledge/GraphStore.ts         (Edge/Tag CRUD + BFS)
  ├── src/core/knowledge/GraphExtractor.ts     (metadataCache → DB)
  ├── src/core/knowledge/ImplicitConnectionService.ts
  ├── src/core/knowledge/RerankerService.ts    (transformers.js Cross-Encoder)
  ├── src/core/semantic/SemanticIndexService.ts (Orchestrierung + Embedding)
  └── src/core/tools/vault/SemanticSearchTool.ts (Search-UI)
```

ADR: [ADR-50](ADR-50-sqlite-knowledge-db.md), [ADR-51](ADR-51-retrieval-pipeline.md), [ADR-52](ADR-52-local-reranker.md).

### 5.9 Ebene 2: Memory Architecture (V1 -- 3-Tier, FEAT-03-04)

```
Tier 1: Chat History (ConversationStore)
  └── Volle Konversationen als JSON im Plugin-Verzeichnis
      Kurzfristig, pro Session

Tier 2: Session Summaries (SessionExtractor)
  └── LLM-generierte Zusammenfassung nach Gespraechsende
      Gespeichert in memory.db (sessions Tabelle)
      Semantisch durchsuchbar (MemoryRetriever)

Tier 3: Long-Term Memory (LongTermExtractor)
  └── Fakten aus Sessions in persistente Dateien promoviert
      user-profile.md, projects.md, patterns.md, soul.md, errors.md
      Langfristig, kumulativ
      (learnings.md entfernt -- Learnings sind Episodes + Recipes)

Agent Skill Mastery (in memory.db):
  ├── episodes Tabelle (TaskEpisode, max 500 FIFO)
  ├── recipes Tabelle (statisch + gelernt)
  └── patterns Tabelle (vor Promotion zu Recipes)

Asynchrone Verarbeitung:
  ExtractionQueue (persistent FIFO, ueberlebt Neustarts)
    ├── SessionExtractor -> LLM call -> memory.db sessions
    └── LongTermExtractor -> LLM call -> update memory .md files
```

V1-ADRs: [ADR-13](ADR-13-memory-architecture.md), [ADR-18 Episodic](ADR-18-episodic-task-memory.md), [ADR-58 Recipe-Promotion](ADR-58-semantic-recipe-promotion.md), [ADR-59 Memory-Decay](ADR-59-memory-decay-prevention.md), [ADR-60 Session-Summary](ADR-60-session-summary-reliability.md). Feature-Spec: `FEAT-03-04-memory-personalization.md` (Subsumed by Memory v2).

### 5.9.1 Memory v2 Architecture (Phase 6 released, EPIC-03 Initiative; Cross-Surface MCP released 2026-05-04 EPIC-23)

Memory v2 ersetzt das 3-Tier-Modell durch ein **Fact-zentrisches Schema mit Persistenz-Service-Pattern**. Die Engine ist UCM-Foundation (separates Repo Q3/Q4 2026, eigene BA `BA-UNIFIED-CHAT-MEMORY-V2.md`).

**Cross-Surface MCP (EPIC-23, released 2026-05-04):** Externe Surfaces (Claude Desktop, ChatGPT, Perplexity) sprechen Memory v2 jetzt ueber den Cloudflare-Worker-Relay an. Fuenf neue MCP-Tools: save_to_memory, save_conversation, recall_memory, search_history und sync_session. Source-Interface-Tagging (ADR-108) markiert jede Conversation mit ihrer Origin-Surface; History-Sidebar-Tabs filtern danach. Living-Document-Semantik (ADR-110) buendelt mehrere Append-Calls in einen Cross-Interface-Thread (Format `thread-YYYY-MM-DD-{6-hex}`). ActiveMcpSessions sliding 30-min Map haelt MCP-Sessions zusammen. Per-Provider Sync-Mode (Auto / Manual) -- Default Auto fuer eigene Surfaces, Manual fuer Drittanbieter mit Privacy-Trade-Off. V1 update_memory ist deprecated; Migration-Helper im Settings-Tab (FEAT-23-05).

```
Engine (@obsilo/memory-engine, FEAT-03-21):
  ├── FactStore (memory.db.facts: kind, importance, is_latest, source_uri, ...)
  ├── EdgeStore (memory.db.fact_edges: update/extend/derive ueber granulare Edge-Types)
  ├── HistoryStore (history.db.history_chunks: Cross-Source-Conversation-Index)
  ├── ContextComposer (KV-Cache-aware, Soft-Topic-Lock, RRF + Reranker)
  ├── FactExtractor + FactIntegrator (Single-Call Tool-Calling, Lazy-Conflict-Resolution)
  ├── InferenceService (Background-Job, Pattern-basierte Derives, FEAT-03-24)
  ├── VaultMemorySourceService (Notes-as-Source, dirty-tracking, FEAT-03-25)
  ├── AgingService (kind-spezifische Halbwertzeiten: 14/90/180 Tage + persistent-preference)
  ├── UnifiedGraphService (ATTACH-CTE oder JS-BFS-Fallback je nach Spike-Ergebnis)
  ├── EmbeddingService (gemeinsam fuer alle Embedding-Operationen)
  ├── MigrationService (Setup-Wechsel zwischen Klassen A/B/C)
  └── AdapterRegistry (LocalKnowledge / McpKnowledge / LocalFile / WebUrl / Cloud)

Drei Setup-Klassen (ADR-80):
  A. Single-Device:    Plugin = Persistenz-Service, DBs Plugin-lokal
  B. Vault-Sync:       Plugin = Service, DBs vault-resident, Single-Writer-Lock per PID
  C. Central-Service:  separater Plugin oder Standalone-Service als Service,
                       Workers (Plugins, Standalone, mobile via OpenClaw) schreiben via RPC

Drei Storage-DBs:
  ├── memory.db (Engine: facts, fact_edges, communication_styles, audit, conversation_threads,
                          known_topics, memory_source_notes, plus Bestand sessions/episodes/recipes)
  ├── history.db (Engine: history_chunks fuer Cross-Source-Search)
  └── knowledge.db (Plugin-bedient: vectors, implicit_edges, ontology, tags -- bleibt FEAT-03-01)

Plugin-MCP-Tool-Routing (ADR-81):
  Externer Client (Claude Desktop, ChatGPT, ...)
    -> Plugin-MCP via Cloudflare-Relay
       Plugin-MCP empfaengt Tool-Call:
         ├── Vault-Tool -> Plugin antwortet selbst (knowledge.db lokal)
         └── Memory-Tool -> Plugin antwortet (Klasse A/B) ODER proxied via HTTPS/JSON-RPC
                            an Persistenz-Service-URL (Klasse C)
```

Alle 12 V2-Features (FEAT-03-14 bis FEAT-03-25) plus 12 ADRs (ADR-76 bis ADR-87) detaillieren das Setup. Phase-0-Spikes (ATTACH+CTE-Performance, FTS5-WASM-Bundle-Size, Single-Call-Token-Profil) sind Pflicht-Vorbedingung vor Implementation.

Differenzierung gegen Konkurrenz (Mem0, Zep, Letta, Supermemory): Lizenz-Souveraenitaet (Apache 2.0 vs Closed-Cloud), MCP-Native (Standard vs proprietaere SDKs), Plugin-Worker-Modell (kein Server-Zwang), Pluggable Persistence (3 Klassen), Obsidian-Vault-Bridge (einzigartig). Konzeptuelle Parity mit Supermemory in Update/Extend/Derive (Edge-Konzept-Layer), Memory-Typen (kind: fact/preference/identity/event), Inference-Pass (Pattern-basiert), Documents-Pipeline (Vault-Note-Source).

### 5.6 Ebene 2: VaultDNA / Plugin Skills

```
VaultDNAScanner (onLayoutReady + 5s Polling)
  │
  ├── Core Plugins (Obsidian Built-ins)
  │     └── Commands sofort verfuegbar
  │
  └── Community Plugins
        ├── API Reflection → Method Discovery
        ├── Command Discovery → Command IDs
        └── Skill-File Generation → .obsidian-agent/plugin-skills/{id}.skill.md

Agent-Nutzung:
  ├── execute_command(command_id)
  ├── enable_plugin(plugin_id, enable)
  ├── resolve_capability_gap(capability, context)
  └── call_plugin_api(plugin_id, method, args)
```

ADR: [ADR-14](ADR-14-vault-dna-plugin-discovery.md). Feature-Spec: `FEAT-02-04-local-skills.md`.

---

## 6. Laufzeitsicht

### 6.1 Normaler Agent-Zyklus

```
Nutzer: "Schreibe eine Zusammenfassung von Kapitel 3"
  │
  ▼
AgentTask.run()
  ├── Iteration 1: LLM antwortet mit tool_use: read_file("kapitel3.md")
  │     ├── ToolRepetitionDetector: ok
  │     ├── Pipeline: validate → kein Approval nötig (read) → execute
  │     └── Result: file content
  │
  ├── Iteration 2: LLM antwortet mit tool_use: write_file("zusammenfassung.md", ...)
  │     ├── ToolRepetitionDetector: ok
  │     ├── Pipeline: validate → Approval-Card im UI
  │     │     User klickt "Approve"
  │     ├── Pipeline: snapshot (checkpoint) → execute → log
  │     └── Result: "File written. <diff_stats added=15 removed=0/>"
  │
  └── Iteration 3: LLM antwortet mit attempt_completion
        └── AgentTask: signalCompletion('completed')
```

### 6.2 Multi-Agent (new_task)

```
Parent AgentTask
  ├── tool_use: new_task("Analysiere alle Dateien in /research/")
  │     └── Spawnt Child AgentTask
  │           ├── Eigene Konversations-History
  │           ├── Eigener ToolRepetitionDetector
  │           ├── Forwards approval callback von Parent
  │           └── Eigener GitCheckpoint-Scope
  └── Erhält Ergebnis des Child als Tool-Result zurück
```

### 6.3 Approval Flow

```
Pipeline.checkApproval(toolCall)
  ├── autoApproval.read = true → approve (read tools)
  ├── autoApproval.vaultChanges = true → approve (write tools)
  ├── onApprovalRequired callback vorhanden?
  │     └── Nein → reject (fail-closed)
  │     └── Ja → zeige Approval-Card in UI
  │           ├── User: "Approve" → proceed
  │           ├── User: "Always Allow" → setze auto-approve, proceed
  │           └── User: "Deny" → return error result
  └── Tool-Result enthält Fehlermeldung bei Ablehnung
```

### 6.4 Memory Extraction Flow

```
Conversation End (>= extractionThreshold messages)
  │
  ├── Build minimal transcript (~8000 chars)
  ├── Enqueue PendingExtraction { type: 'session' }
  │
  └── ExtractionQueue (background, one-at-a-time)
        ├── SessionExtractor
        │     ├── LLM call (memoryModelKey)
        │     ├── Output: sessions/{id}.md (YAML frontmatter + summary)
        │     └── if autoUpdateLongTerm → enqueue { type: 'long-term' }
        │
        └── LongTermExtractor
              ├── LLM call (merges facts into existing files)
              └── Updates: user-profile.md, projects.md, patterns.md
```

### 6.5 Context Condensing Flow

```
AgentTask Iteration N (nach Tool-Result)
  │
  ├── estimateTokenCount(history) > contextWindow * condensingThreshold?
  │     └── Nein → weiter mit naechster Iteration
  │
  └── Ja → condenseHistory()
        ├── onPreCompactionFlush(history) — Facts sichern vor Komprimierung
        ├── Behalte: erste User-Nachricht (Original-Aufgabe)
        ├── Smart Tail: letzte N Nachrichten (bis 10k Tokens, min 2)
        ├── Komprimiere: mittlerer Teil via LLM-Call (mit Tool-Call-Ledger)
        ├── Ersetze History: [erste, Zusammenfassung, ...tail]
        └── Multi-Pass: bis zu 2 Retries wenn immer noch ueber Threshold

Emergency Condensing (Catch-Block, Auto-Retry):
  API-Call schlaegt mit 400 fehl (context_length_exceeded / prompt too long)
  │
  ├── history.length >= 7 && !emergencyRetried?
  │     └── Nein → normaler Fehler
  │
  └── Ja → onPreCompactionFlush + condenseHistory() (Notfall)
        ├── Erfolg → emergencyRetried=true, `continue` (auto-retry, kein User-Eingriff)
        └── Fehlschlag → normaler Fehler-Handler
```

ADR: [ADR-12](ADR-12-context-condensing.md). Context Condensing ist standardmaessig AKTIVIERT (`condensingEnabled: true`).

### 6.6 Semantic Search Pipeline (EPIC-15)

```
semantic_search(query, top_k, folder?, tags?, since?)
  │
  ├── [optional] HyDE: LLM generiert hypothetisches Dokument
  │
  ├── Parallel:
  │     ├── Semantic: VectorStore.searchWithContext (Adjacent Chunks, Multi-per-File)
  │     └── Keyword: TF-IDF + Stemming + Stop-Word-Filter + Title-Boost
  │
  ├── RRF Fusion (k=60): score(doc) = SUM(1/(60+rank_i))
  ├── Metadata Filter (folder, tags, since)
  ├── Local Reranking: Cross-Encoder (transformers.js WASM, ms-marco-MiniLM)
  ├── Top-K Slice
  ├── Graph Expansion: GraphStore.getNeighbors (1-3 Hops, Wikilinks + MOC)
  ├── Implicit Connections: ImplicitConnectionService.getImplicitNeighbors
  └── Suggestion Banner: Sidebar-UI fuer Implicit Connection Vorschlaege
```

ADR: [ADR-15](ADR-15-hybrid-search-rrf.md), [ADR-50](ADR-50-sqlite-knowledge-db.md), [ADR-51](ADR-51-retrieval-pipeline.md), [ADR-52](ADR-52-local-reranker.md).

---

## 7. Verteilungssicht

Obsidian Agent läuft vollständig lokal im Obsidian Electron-Renderer-Prozess. Es gibt keine Server-Komponente. Externe Verbindungen nur zu:
- Konfigurierten LLM-Providern (HTTPS)
- Konfigurierten MCP-Servern (stdio subprocess, lokal)
- Optional: Web-Search-APIs (Brave/Tavily)

```
Nutzer-Gerät:
  Obsidian (Electron)
  └── Plugin-Prozess (Renderer)
        ├── knowledge.db       → ~/.obsidian-agent/knowledge.db (global, Vektoren + Graph)
        ├── memory.db          → {vault}/.obsidian-agent/memory.db (vault-lokal, Sessions + Recipes)
        ├── sql.js WASM        → Plugin-Verzeichnis (sql-wasm-browser.wasm, ~1.5MB)
        ├── transformers.js    → In-Process WASM (Reranker: ms-marco-MiniLM, ~23MB cached)
        ├── isomorphic-git     → .obsidian/plugins/obsidian-agent/checkpoints/
        ├── Audit Logs         → ~/.obsidian-agent/logs/
        ├── Chat History       → ~/.obsidian-agent/history/
        ├── Memory Files (.md) → ~/.obsidian-agent/memory/ (user-profile, patterns, soul, errors)
        ├── Extraction Queue   → ~/.obsidian-agent/pending-extractions.json
        ├── Sandbox (Desktop)  → child_process.fork OS-level isolation
        ├── Sandbox (Mobile)   → iframe V8 origin isolation
        ├── esbuild-wasm       → In-Process TypeScript Compilation (~11MB, on-demand)
        ├── Package Cache      → In-Memory (CDN-Downloads: esm.sh ?bundle, jsdelivr fallback)
        └── MCP subprocesses   → stdio (lokal)
```

---

## 8. Querschnittliche Konzepte

### 8.1 Sicherheits- und Governance-Modell

**Defense in Depth** — vier Schutzschichten:

| Schicht | Mechanismus | Datei |
|---------|-------------|-------|
| 1. Pfad-Validierung | IgnoreService (.obsidian-agentignore, protected) | `src/core/governance/IgnoreService.ts` |
| 2. Approval | Explicit user consent für Write-Ops | `src/core/tool-execution/ToolExecutionPipeline.ts` |
| 3. Checkpoint | Snapshot vor jedem Write (isomorphic-git) | `src/core/checkpoints/GitCheckpointService.ts` |
| 4. Audit | JSONL-Log jeder Operation | `src/core/governance/OperationLogger.ts` |

### 8.2 Fehlerbehandlung

- **Tool-Fehler** → werden als Tool-Result zurückgegeben (nicht als Exception). LLM sieht den Fehler und kann reagieren.
- **Consecutive Mistakes** → nach `consecutiveMistakeLimit` Fehlern bricht AgentTask ab.
- **Tool Repetition** → nach 3× gleiches Tool+Input in 10 Calls → abort mit Fehlermeldung.
- **Pipeline ohne Approval-Callback** → fail-closed, ablehnen.

### 8.3 Context Management

- **System Prompt** wird pro Task einmalig aufgebaut (nicht pro Iteration). Modulare Architektur: 15 Sections als Pure Functions in `src/core/prompts/sections/`, orchestriert von `buildSystemPromptForMode()`. Tool-Beschreibungen kommen aus der zentralen `toolMetadata.ts` (Single Source of Truth fuer Prompt und UI). Feature-Specs: `FEAT-03-12-modular-system-prompt.md`, `FEAT-05-06-tool-metadata-registry.md`. ADR: [ADR-08](ADR-08-modular-prompt-sections.md).
- **Context Condensing** — wenn Kontext-Schätzung den `condensingThreshold` überschreitet: erste + letzte 4 Nachrichten behalten, Rest via LLM-Komprimierung. Standardmaessig aktiviert (`condensingEnabled: true`). Zusaetzlich: Emergency Condensing im Catch-Block bei 400 "context too long" Fehlern.
- **Power Steering** — alle `powerSteeringFrequency` Iterationen wird der Mode-Reminder erneut injiziert.

### 8.4 Chat History & Memory System

Persistentes Memory-System mit drei Säulen: Chat History, Short/Long-Term Memory, Onboarding. Alle Daten liegen im Plugin-Verzeichnis (`.obsidian/plugins/obsidian-agent/`). Feature-Spec: `FEAT-03-04-memory-personalization.md`. ADR: [ADR-07](ADR-07-event-separation.md).

#### Storage Layout

```
~/.obsidian-agent/                       # Global Storage (nicht gesynct)
├── knowledge.db                         # SQLite: Vektoren, Graph, Implicit Edges (EPIC-15)
├── history/                             # Chat History
│   ├── index.json
│   └── {id}.json
├── memory/                              # Long-Term Memory (.md Dateien)
│   ├── user-profile.md
│   ├── projects.md
│   ├── patterns.md
│   ├── soul.md
│   ├── errors.md
│   ├── knowledge.md
│   └── custom-tools.md
├── pending-extractions.json
└── logs/

{vault}/.obsidian-agent/                 # Vault-lokal (gesynct via Vault Sync)
└── memory.db                            # SQLite: Sessions, Episodes, Recipes, Patterns (FEAT-15-05)
```

#### ConversationStore (`src/core/history/ConversationStore.ts`)

```
ConversationStore
  ├── initialize()       → ensure dir, load/create index
  ├── create(mode,model) → new conversation
  ├── save(id,msgs,ui)   → write full conversation
  ├── updateMeta(id,patch) → title, tokens
  ├── load(id)           → full ConversationData
  ├── list()             → in-memory index (no disk I/O)
  └── delete(id) / deleteAll()
```

#### Memory Extraction Pipeline

```
Conversation End (>= extractionThreshold messages)
  │
  ├── 1. Build minimal transcript (~8000 chars)
  ├── 2. Enqueue PendingExtraction { type: 'session' }
  │
  └── ExtractionQueue (background, one-at-a-time)
        ├── SessionExtractor → LLM call (memoryModelKey) → sessions/{id}.md
        │     └── if autoUpdateLongTerm → enqueue { type: 'long-term' }
        └── LongTermExtractor → LLM call → update user-profile/projects/patterns
```

#### Memory Context Injection (System Prompt)

At session start, `MemoryService.buildMemoryContext()` injects:
1. **User Profile** (~200 tokens) — always
2. **Project Memory** (~300 tokens) — always
3. **Pattern Memory** (~200 tokens) — always
4. **Relevant Session Summaries** (~500 tokens) — via `MemoryRetriever` semantic search on first user message

Total budget: ~1200 tokens. Knowledge memory is retrieved on demand via `semantic_search`.

#### Event Separation (ADR-07)

`attempt_completion` result is an internal signal, not user-facing text. `AgentTask` tracks `hasStreamedText` — completion result only rendered as fallback when no text was streamed. System prompt rules ensure attempt_completion is only called after multi-step tool workflows.

#### Chat-Linking (ADR-22)

Automatische Traceability zwischen Chats und Notes. Wenn der Agent eine `.md`-Datei schreibt, wird der aktuelle Chat als Deep-Link im Frontmatter gespeichert:

```yaml
obsilo-chats:
  - obsidian://obsilo-chat?id=2026-03-05-a1b2c3
```

- **Hook:** `ToolExecutionPipeline.stampChatLink()` — nach erfolgreicher Write-Op auf `.md`-Dateien
- **Deep-Link:** `obsidian://obsilo-chat?id={id}` — oeffnet Chat in der Sidebar via Protocol Handler
- **Setting:** `chatLinking` (boolean, default: true)
- **Frontmatter-API:** `app.fileManager.processFrontMatter()` (atomare Updates, Duplikat-safe)

#### Key Files

| File | Purpose |
|------|---------|
| `src/core/history/ConversationStore.ts` | Conversation persistence |
| `src/ui/sidebar/HistoryPanel.ts` | History UI overlay |
| `src/core/memory/MemoryService.ts` | Memory file I/O + context builder |
| `src/core/memory/ExtractionQueue.ts` | Persistent FIFO queue |
| `src/core/memory/SessionExtractor.ts` | LLM-based session summary |
| `src/core/memory/LongTermExtractor.ts` | Promote facts to long-term |
| `src/core/memory/OnboardingService.ts` | First-contact detection |
| `src/core/memory/MemoryRetriever.ts` | Cross-session context retrieval |
| `src/ui/settings/MemoryTab.ts` | Memory settings UI |

### 8.5 Session-Overrides (ToolPickerPopover)

Der `ToolPickerPopover` erlaubt es dem Nutzer, für die aktuelle Session (RAM only, kein Persist) gezielt Tool-Gruppen, Skills und Workflows zu erzwingen — unabhängig von den Mode-Einstellungen. Die drei Override-Maps (`sessionToolOverrides`, `sessionForcedSkills`, `sessionForcedWorkflow`) werden beim nächsten `handleSendMessage()` ausgelesen.

### 8.6 Tool-Parallelisierung

Tools in `PARALLEL_SAFE` werden via `Promise.all()` parallel ausgeführt. Safe: alle Read-Tools (`read_file`, `list_files`, `search_files`, `get_frontmatter`, `get_linked_notes`, `search_by_tag`, `web_fetch`, `web_search`). Write-Tools immer sequenziell.

### 8.7 Einheitliche Fehler-/Ergebnisformatierung

Alle Tools erben von `BaseTool` und nutzen:
- `this.formatSuccess(message)` → `"✓ message"`
- `this.formatError(error)` → `"<error>message</error>"`
- `this.formatContent(content, meta)` → Content mit optionalem Metadaten-Header

### 8.8 Diff-Stats

Write-Tools (`write_file`, `edit_file`) emittieren `<diff_stats added="N" removed="N"/>` im Tool-Result. Die UI parst diesen Tag und rendert das Badge.

### 8.9 Multi-Agent Orchestration

Der Agent kann via `new_task` Tool Sub-Agenten (Child Tasks) spawnen:

- **Depth Guard**: `maxSubtaskDepth` begrenzt die Verschachtelungstiefe (Default: 2)
- **Isolation**: Kind-Task hat eigene History, eigenen ToolRepetitionDetector
- **Shared**: Kind erbt den Approval-Callback des Parents (damit Write-Ops nicht auto-rejected werden)
- **Modes**: Kind kann nur in `agent` oder `ask` Mode laufen
- **Patterns**: Prompt Chaining, Orchestrator-Worker, Evaluator-Optimizer, Routing

### 8.10 Plugin Skills & VaultDNA

VaultDNA ermoeglicht dem Agent die Nutzung aller installierten Obsidian-Plugins:

- **Discovery**: Runtime-Scan via Obsidian API (Core + Community Plugins)
- **Skill-Files**: Automatisch generierte Beschreibungen in `.obsidian-agent/plugin-skills/`
- **Commands**: Agent kann Obsidian-Befehle via `execute_command` ausfuehren
- **Plugin API**: Agent kann Plugin-Methoden via `call_plugin_api` aufrufen (Allowlist-geschuetzt)
- **Recipes**: Vordefinierte Workflows (z.B. Pandoc-Export) via `execute_recipe`
- **Continuous Sync**: 5s-Polling erkennt Plugin-Aenderungen

### 8.11 Onboarding

`OnboardingService` erkennt den ersten Kontakt (kein Memory vorhanden) und fuehrt den Nutzer durch einen 5-Schritt-Dialog:
1. Backup-Import
2. Profil (Name, Sprache, Tonfall)
3. Modell (API-Key oder Gemini Free Tier)
4. Permissions (Preset: Permissive / Balanced / Restrictive)
5. Abschluss

### 8.12 Token-Kostenreduktion (EPIC-18)

Drei-Stufen-Ansatz zur Reduktion des Token-Verbrauchs (634k -> 60k fuer einfache Tasks, 90% Reduktion):

1. **Fast Path Execution (ADR-61)**: Recipe-gesteuertes Batching. `FastPathExecutor.ts` erkennt gelernte Recipes und fuehrt Tool-Sequenzen deterministisch aus (Planner + Execution), ohne iterative LLM-Calls. Fallback auf normale ReAct-Loop bei unbekannten Tasks.

2. **KV-Cache-Optimized Prompt (ADR-62)**: Stabile Prompt-Sections (System Prompt, Tool Definitions, Rules) werden vorne positioniert fuer maximale KV-Cache-Hits. Volatile Sections (DateTime, Active File) stehen am Ende. Provider-agnostisch: Anthropic (explizites Caching), OpenAI/Gemini (implizites Prefix-Caching).

3. **Context Externalization (ADR-63)**: Grosse Tool-Results (>4000 Chars) werden in temporaere Dateien ausgelagert. `ResultExternalizer.ts` schreibt in `.obsidian-agent/context/` und injiziert kompakte Referenzen (`<context_ref path="..." lines="N"/>`) in den Kontext. Agent liest bei Bedarf via `read_file`.

| Komponente | Datei |
|------------|-------|
| `FastPathExecutor` | `src/core/FastPathExecutor.ts` |
| `ResultExternalizer` | `src/core/tool-execution/ResultExternalizer.ts` |
| Prompt-Sections | `src/core/prompts/sections/` |

### 8.13 Knowledge Maintenance (EPIC-19, Phase 1)

Erweitert die passive Knowledge Layer (EPIC-15) um aktive Wissens-Pflege:

1. **VaultHealthService** (`src/core/knowledge/VaultHealthService.ts`): SQL-basierte Lint-Checks beim Vault-Open: verwaiste Notes, fehlende Backlinks, gebrochene Links, schwache Cluster, inkonsistente Tags, Kategorie-Mismatches. Kein LLM-Call fuer den Scan (0 Tokens).

2. **VaultHealthCheckTool** (`src/core/tools/vault/VaultHealthCheckTool.ts`): Agent-Tool fuer programmatischen Zugriff auf Health-Checks. Read-only, registriert aber nicht in Standard-Tool-Gruppen (wird intern getriggert).

3. **VaultHealthRepairModal** (`src/ui/VaultHealthRepairModal.ts`): UI-Modal mit Checkpoint-backed Undo fuer Reparatur-Aktionen. Zeigt Findings gruppiert nach Kategorie, erlaubt selektive Fixes.

4. **OntologyStore** (`src/core/knowledge/OntologyStore.ts`): Taxonomie-Verwaltung in SQLite. Cluster/Entity-Beziehungen, Health-Checks fuer Backlinks, inkrementelles Update.

ADRs: [ADR-65](ADR-65-ontologie-schema.md), [ADR-66](ADR-66-ingest-strategy.md), [ADR-67](ADR-67-lint-architecture.md), [ADR-68](ADR-68-ocr-provider.md).

5. **AssetProvisioner** (`src/core/AssetProvisioner.ts`): Extrahiert eingebettete Runtime-Assets (Worker, Skills, Templates) aus main.js bei BRAT-Installation. Version-Gating ueber .obsilo-assets-version Marker.

6. **CommunityDetectionService** (`src/core/knowledge/CommunityDetectionService.ts`): Louvain Community Detection ueber graphology. Identifiziert Themen-Cluster im Knowledge Graph fuer Ontologie-Validierung.

ADRs: [ADR-69](ADR-69-confidence-storage.md), [ADR-70](ADR-70-community-detection-library.md), [ADR-71](ADR-71-retrieval-integration.md).

### 8.14 MCP Server (EPIC-14)

MCP-Server-Architektur fuer externen Zugriff auf Obsilo-Funktionen:

- **McpBridge** (`src/mcp/McpBridge.ts`): Hauptorchestrator, stdio JSON-RPC plus Streamable-HTTP-konformer Worker-Pfad
- **Vault-Tools (Approval-tiered)**: getContext, searchVault, readNotes, writeVault, executeVaultOp, syncSession
- **Memory-v2 Cross-Surface Tools (EPIC-23)**: save_to_memory, save_conversation, recall_memory, search_history, plus update_memory (deprecated, V1-Migration). Source-Interface-Tagging (ADR-108), Living-Documents (ADR-110), McpRateLimiter (sliding-window 60s, drei Klassen cheap=60/min, medium=30/min, expensive=10/min).
- **3-Tier Approval**: read (auto) / search (auto) / write (User-Approval)
- **Remote Transport (FEAT-14-03)**: Cloudflare Workers + Durable Objects Relay (`CloudflareDeployer.ts`, `RelayClient.ts`). HTTP Long-Polling, Token-in-URL Auth, Auto-Deployment. Worker antwortet Spec-konform Streamable-HTTP (Accept-Negotiation JSON vs SSE, Notification-202, Mcp-Session-Id Echo).
- **Sicherheit (AUDIT-015 / AUDIT-016)**: per-message + transcript caps; sanitizeVaultContentForLLM mit Prompt-Injection-Filter; strictSourceIsolation Setting fuer Cross-Source-ACL; LIKE-wildcard escaping in search_history; crypto.randomUUID statt Math.random fuer ConversationStore-IDs.

ADRs: [ADR-53](ADR-53-mcp-server-architecture.md), [ADR-54](ADR-54-mcp-tool-mapping.md), [ADR-55](ADR-55-remote-relay.md), [ADR-107](ADR-107-mcp-memory-tools-versionierung.md), [ADR-108](ADR-108-source-interface-tagging.md), [ADR-110](ADR-110-living-documents-cross-interface-threads.md).

---

## 9. Architekturentscheidungen

Siehe einzelne ADRs in `_devprocess/architecture/`:

| ADR | Entscheidung |
|-----|-------------|
| [ADR-01](ADR-01-central-tool-execution-pipeline.md) | Zentrale ToolExecutionPipeline für alle Tool-Aufrufe |
| [ADR-02](ADR-02-isomorphic-git-checkpoints.md) | isomorphic-git statt System-Git für Checkpoints |
| ~~[ADR-03](ADR-03-vectra-semantic-index.md)~~ | ~~vectra + Xenova fuer Semantic Index~~ — **Superseded** by ADR-50 |
| [ADR-04](ADR-04-mode-based-tool-filtering.md) | Mode-basierte Tool-Filterung statt globaler Whitelist |
| [ADR-05](ADR-05-fail-closed-approval.md) | Fail-Closed Approval (kein Callback = ablehnen) |
| [ADR-06](ADR-06-sliding-window-repetition.md) | Sliding Window für Tool-Repetition-Erkennung |
| [ADR-07](ADR-07-event-separation.md) | Event Separation — Completion-Signale getrennt von Text-Output |
| [ADR-08](ADR-08-modular-prompt-sections.md) | Modulare Prompt-Sections & zentrale Tool-Metadata-Registry |
| [ADR-09](ADR-09-local-skills.md) | Lokale Plugin-Skills (VaultDNA PAS-1) |
| [ADR-10](ADR-10-permissions-audit.md) | Permissions Audit & Governance-Analyse |
| [ADR-11](ADR-11-multi-provider-api.md) | Multi-Provider API Architecture (Adapter Pattern) |
| [ADR-12](ADR-12-context-condensing.md) | Context Condensing (Keep-First-Last + LLM-Summarize) |
| [ADR-13](ADR-13-memory-architecture.md) | 3-Tier Memory Architecture |
| [ADR-14](ADR-14-vault-dna-plugin-discovery.md) | VaultDNA — Automatische Plugin-Erkennung als Skills |
| [ADR-15](ADR-15-hybrid-search-rrf.md) | Hybrid Search mit Semantic + BM25 + RRF Fusion |
| [ADR-16](ADR-16-rich-tool-descriptions.md) | Rich Tool Descriptions (example, whenToUse, commonMistakes) |
| [ADR-17](ADR-17-procedural-recipes.md) | Procedural Skill Recipes (keyword-first Matching, Budget) |
| [ADR-18](ADR-18-episodic-task-memory.md) | Episodic Task Memory (Aufzeichnung, Auto-Promotion) |
| [ADR-19](ADR-19-electron-safestorage.md) | Electron SafeStorage (OS Keychain fuer API-Keys) |
| [ADR-20](ADR-20-global-storage.md) | Global Storage Architecture (cross-vault Settings) |
| [ADR-21](ADR-21-sandbox-os-isolation.md) | OS-Level Sandbox via child_process.fork() (Hybrid Desktop/Mobile) |
| [ADR-22](ADR-22-chat-linking.md) | Chat-Linking via Pipeline Post-Write Hook (Frontmatter Deep-Links) |
| [ADR-23](ADR-23-document-parser-tools.md) | Document Parser als wiederverwendbare Tools (Service-Kern + Tool-Wrapper) |
| [ADR-24](ADR-24-parsing-library-selection.md) | Parsing-Library-Auswahl: JSZip + Custom OOXML + pdfjs-dist + Native APIs |
| [ADR-25](ADR-25-on-demand-image-strategy.md) | On-Demand Bild-Nachlade via Lazy Extraction + Vision-Gate |
| [ADR-26](ADR-26-post-processing-hook.md) | Direkter Post-Processing Hook in onComplete fuer Task Extraction |
| [ADR-27](ADR-27-task-note-schema.md) | Task-Note Frontmatter Schema (10 Properties, deutsch, Eisenhower-kompatibel) |
| [ADR-28](ADR-28-base-plugin-integration.md) | Eigene Base-YAML-Generierung + Iconic-Detection via direkte Obsidian-API |
| [ADR-29](ADR-29-office-tool-input-schema.md) | Office-Tool Input-Schema (strukturierte Slides/Sections/Sheets statt Freitext) |
| [ADR-30](ADR-30-office-library-selection.md) | Office-Library-Auswahl: docx + ExcelJS (PPTX-Teil superseded by ADR-46) |
| [ADR-31](ADR-31-binary-write-pattern.md) | Binary-Write-Pattern: Shared writeBinaryToVault() mit Path-Traversal-Schutz |
| ~~[ADR-32](ADR-32-template-based-pptx.md)~~ | ~~Template-basierte PPTX-Erzeugung: JSZip + OOXML~~ — **Deprecated**, superseded by ADR-46 |
| ~~[ADR-33](ADR-33-multimodal-template-analyzer.md)~~ | ~~Multimodaler Template-Analyzer: Cloud Run + BYOK~~ — **Deprecated**, nie implementiert, superseded by ADR-46 |
| ~~[ADR-34](ADR-34-visual-design-language-document.md)~~ | ~~Visual Design Language Document als Skill-Format~~ — **Deprecated**, nie implementiert, superseded by ADR-46 |
| ~~[ADR-35](ADR-35-embedding-enhanced-template-analysis.md)~~ | ~~Agent-basierte Template-Analyse~~ — **Deprecated**, superseded by ADR-46 |
| ~~[ADR-44](ADR-44-css-svg-slide-engine.md)~~ | ~~CSS-SVG Slide Engine~~ — **Deprecated**, superseded by ADR-46 |
| ~~[ADR-45](ADR-45-pptx-automizer-pipeline.md)~~ | ~~pptx-automizer Template Pipeline~~ — **Deprecated**, superseded by ADR-46 |
| [ADR-46](ADR-46-direct-template-mode.md) | Direct Template Mode: groupByLayoutName + physische Shape-Namen statt Composition-Abstraktion |
| [ADR-47](ADR-47-schema-constrained-slide-generation.md) | Schema-Constrained Slide Generation: Validierung + Quality Gates |
| [ADR-48](ADR-48-plan-presentation-pipeline.md) | plan_presentation: Interner LLM-Call fuer Source -> Outline -> Content-Transformation |
| [ADR-49](ADR-49-raw-xml-clear-generate.md) | Raw XML Clear-Generate Strategie fuer Shape-Content |
| [ADR-36](ADR-36-copilot-streaming-strategy.md) | Copilot Streaming Strategy (Chat Completions API) |
| [ADR-37](ADR-37-copilot-provider-architecture.md) | Copilot Provider Architecture (VS Code Language Model API) |
| [ADR-38](ADR-38-copilot-token-storage.md) | Copilot Token Storage (VS Code Authentication API) |
| [ADR-39](ADR-39-copilot-content-normalization.md) | Copilot Content Normalization (tool_use -> function_call) |
| [ADR-40](ADR-40-kilo-provider-architecture.md) | Kilo Provider Architecture (Gateway-Mode, lokale Modelle + Cloud-Routing) |
| [ADR-41](ADR-41-kilo-auth-session-architecture.md) | Kilo Auth & Session Architecture (JWT + Refresh Token) |
| [ADR-42](ADR-42-kilo-metadata-discovery.md) | Kilo Metadata Discovery (Model-Catalog vom Gateway) |
| [ADR-43](ADR-43-kilo-embedding-gating-strategy.md) | Kilo Embedding Gating Strategy (Feature-Flags pro Modell) |
| [ADR-50](ADR-50-sqlite-knowledge-db.md) | SQLite Knowledge DB: sql.js WASM, Zwei-DB-Strategie, Schema v5 |
| [ADR-51](ADR-51-retrieval-pipeline.md) | 4-Stufen Retrieval Pipeline: Vector → Graph → Implicit → Reranking |
| [ADR-52](ADR-52-local-reranker.md) | Local Reranker: transformers.js WASM, ms-marco-MiniLM-L-6-v2 |
| [ADR-53](ADR-53-mcp-server-architecture.md) | MCP Server Prozess-Architektur (stdio, McpBridge) |
| [ADR-54](ADR-54-mcp-tool-mapping.md) | MCP Tool-Mapping & System-Prompt-Uebertragung (3-Tier) |
| [ADR-55](ADR-55-remote-relay.md) | Remote MCP Relay via Cloudflare Workers + Durable Objects |
| [ADR-56](ADR-56-ssg-selection.md) | Static Site Generator fuer Website-Dokumentation |
| [ADR-57](ADR-57-information-architecture.md) | Informationsarchitektur & Seitenstruktur |
| [ADR-58](ADR-58-semantic-recipe-promotion.md) | Semantic Recipe Promotion (Intent-basiert statt Sequenz-basiert) |
| [ADR-59](ADR-59-memory-decay-prevention.md) | Memory Decay Prevention (Aktive Qualitaetssicherung) |
| [ADR-60](ADR-60-session-summary-reliability.md) | Session-Summary Zuverlaessigkeit und Observability |
| [ADR-61](ADR-61-fast-path-execution.md) | Fast Path Execution: Recipe-gesteuertes Batching |
| [ADR-62](ADR-62-kv-cache-optimized-prompt.md) | KV-Cache-Optimized Prompt Structure & Provider-Agnostic Caching |
| [ADR-63](ADR-63-context-externalization.md) | Context Externalization: Dateisystem als erweiterter Kontext |
| [ADR-64](ADR-64-gemini-provider.md) | Google Gemini als eigenstaendiger Provider |
| [ADR-65](ADR-65-ontologie-schema.md) | Ontologie-Schema und Befuellung (EPIC-19) |
| [ADR-66](ADR-66-ingest-strategy.md) | Ingest-Strategie: Schema-Erkennung und Entitaets-Zuordnung (EPIC-19) |
| [ADR-67](ADR-67-lint-architecture.md) | Lint-Architektur: Tool, UI und Trigger (EPIC-19) |
| [ADR-68](ADR-68-ocr-provider.md) | OCR-Provider-Auswahl (FEAT-19-05) |
| [ADR-69](ADR-69-confidence-storage.md) | Confidence-Storage und -Propagation (EPIC-19) |
| [ADR-70](ADR-70-community-detection-library.md) | Community-Detection-Library (EPIC-19) |
| [ADR-71](ADR-71-retrieval-integration.md) | Retrieval-Integration mit Confidence/Cluster-Boost (EPIC-19) |
| [ADR-72](ADR-72-configurable-agent-storage-root.md) | Konfigurierbarer Agent-Storage-Root (EPIC-05, FEAT-05-07) |
| [ADR-73](ADR-73-mcp-tool-argument-typesafety.md) | MCP-Tool-Argument Type-Safety (Querschnitt: Review-Bot-Compliance) |
| [ADR-74](ADR-74-dependency-override-strategy.md) | Dependency-Override-Strategie fuer transitive Vulnerabilities (Querschnitt: Security-Maintenance) |
| [ADR-88](ADR-88-chatgpt-oauth-provider-architecture.md) | ChatGPT OAuth Provider Architecture (Service plus Mapper, Node-https-Streaming, verschachteltes Settings-Schema, EPIC-21) |
| [ADR-89](ADR-89-chatgpt-pkce-loopback-flow.md) | ChatGPT PKCE Loopback OAuth Flow (Renderer-Loopback-Server auf 127.0.0.1, Port-Range, EPIC-21) |
| [ADR-90](ADR-90-cost-aware-agent-heuristics.md) | Cost-Aware Agent Heuristics (Token-Budget pro Tool-Loop, EPIC-18) |
| [ADR-91](ADR-91-mcp-pipeline-routing-and-ignore-at-index-build.md) | MCP-Pipeline-Routing und Ignore-at-Index-Build (EPIC-19) |
| [ADR-92](ADR-92-knowledge-db-schema-v10-bundle.md) | knowledge.db Schema v10 Bundle (BA-25 Foundation, 4 neue Tabellen) |
| [ADR-93](ADR-93-source-identitaet-domain-only.md) | Source-Identitaet domain-only fuer Cluster-Stabilitaet (BA-25) |
| [ADR-94](ADR-94-cluster-halbwertszeit-modell.md) | Cluster-Halbwertszeit-Modell fuer Top-Hub-Block-Pflege (BA-25) |
| [ADR-95](ADR-95-frontmatter-write-conflict-detection.md) | Frontmatter Write-Conflict-Detection (BA-25 Phase 4) |
| [ADR-96](ADR-96-moc-marker-konvention.md) | MOC-Marker-Konvention fuer Auto-Hub-Detection (BA-25) |
| [ADR-97](ADR-97-kv-cache-block-lifecycle.md) | KV-Cache-Block-Lifecycle fuer Top-Hub-Block (BA-25) |
| [ADR-98](ADR-98-pre-triage-tool-architektur.md) | Pre-Triage-Tool-Architektur (BA-25 Phase 3) |
| [ADR-99](ADR-99-tension-detection-hybrid.md) | Tension-Detection-Hybrid (BA-25 Lint-Foundation) |
| [ADR-100](ADR-100-dialog-ingest-state-storage.md) | Dialog-Ingest-State-Storage (ingest_session-Tabelle, BA-25) |
| [ADR-101](ADR-101-output-modus-architektur.md) | Output-Modus-Architektur (3 Modi + Folder-Layout + Bibliografie, BA-25) |
| [ADR-102](ADR-102-auto-trigger-detection-mechanik.md) | Auto-Trigger-Detection-Mechanik (vault.on-Listener, BA-25) |
| [ADR-103](ADR-103-source-position-marker-und-pdf-strategie.md) | Source-Position-Marker und PDF-Strategie (BA-25) |
| [ADR-104](ADR-104-web-search-provider-strategie.md) | Web-Search-Provider-Strategie (BYOK obligatorisch, BA-25) |
| [ADR-105](ADR-105-stufe-3-job-runner-token-budget.md) | Stufe-3 Job-Runner und Token-Budget-Enforcement (BA-25 Phase 5) |
| [ADR-106](ADR-106-health-modal-severity-und-cooldown.md) | Health-Modal-Severity und Activity-Trigger-Cooldown (BA-25) |
| [ADR-107](ADR-107-mcp-memory-tools-versionierung.md) | MCP-Memory-Tools Versionierung -- V1 update_memory deprecaten, V2 als save_to_memory (EPIC-23) |
| [ADR-108](ADR-108-source-interface-tagging.md) | Source-Interface-Tagging fuer cross-surface origin tracking (EPIC-23) |
| [ADR-109](ADR-109-vault-zu-memory-bruecke.md) | Vault-zu-Memory-Bruecke via Single-Listener-Pattern (FEAT-03-25, supersedes ADR-87) |
| [ADR-110](ADR-110-living-documents-cross-interface-threads.md) | Living-Document-Semantik plus Cross-Interface-Thread-Klammer (EPIC-23) |

---

## 10. Qualitätsszenarien

| Szenario | Response |
|----------|---------|
| Agent versucht `.env`-Datei zu lesen | IgnoreService blockiert, Tool-Result: `<error>Path not allowed</error>` |
| Nutzer lehnt Write-Op ab | Tool-Result: `<error>User rejected</error>`, LLM kann alternative vorschlagen |
| Agent ruft `edit_file` 3× mit identischem Input | ToolRepetitionDetector: abort mit Fehlermeldung, signalCompletion |
| Vault hat 5000 Dateien, Semantic Index läuft | `setTimeout(0)` nach jeder Batch, UI bleibt responsiv |
| Obsidian wird während Indexing geschlossen | Checkpoint (mtime-basiert) ermöglicht Resume beim nächsten Start |
| MCP-Server nicht erreichbar | McpClient: Timeout, Fehler-Result, kein Plugin-Crash |
| Kontext wird zu lang | Context Condensing: first + last 4 Messages behalten, Rest komprimiert |

---

## 11. Risiken und technische Schulden

### Aktive Risiken

| Risiko | Auswirkung | Mitigation |
|--------|-----------|-----------|
| ~~vectra RAM~~ | ~~Resolved: Ersetzt durch SQLite (ADR-50)~~ | ~~EPIC-15~~ |
| `query_base` nutzt Regex-YAML-Parser | Komplexe Filterausdrücke können falsch geparst werden | Echter YAML-Parser (future) |
| `update_base` erkennt View-Blöcke via Regex | Fragil bei unerwarteter YAML-Formatierung | Vollständiger YAML-Parser (future) |
| Keyword-Suche (TF-IDF) ist ein Live-Scan | Linear mit Vault-Groesse | Vorkompilierter Index (future), aktuell <50ms |
| HyDE verursacht extra LLM-Call | +2-5s Latenz pro Suche | Default: disabled, opt-in |
| Memory-Extraktion basiert auf LLM-Qualitaet | Ungenaue Fakten bei schwachen Modellen | Separate memoryModelKey-Einstellung |
| VaultDNA Reflection kann bei Plugins fehlschlagen | Unvollstaendige Skill-Files | Nutzer kann Skill-Files manuell anpassen |
| MCP stdio spawnt Subprozesse | Sicherheitsrisiko bei boeswilligen Configs | Shell-Metacharacter-Validation |
| ChatGPT-OAuth-Provider nutzt undokumentierte Codex-Endpoints (EPIC-21) | Schema kann sich ohne Vorwarnung aendern, OpenAI koennte Drittanbieter-Nutzung sperren | Schema-Mapper isoliert, Datums-Kommentare, Disclaimer im UI, Endpoint-Drift-Indikator (ADR-88, ADR-89) |
| ChatGPT-OAuth-Loopback nutzt require('http') im Renderer | Plugin-Review-Aufmerksamkeit moeglich | Eslint-disable mit klarer Begruendung, kurze Server-Lifetime, Bind 127.0.0.1, Port-Range 1455 bis 1460 (ADR-89) |

### Technische Schulden

| Bereich | Beschreibung | Status |
|---------|-------------|--------|
| UI Modularisierung | `AgentSidebarView.ts` (~3500 LOC) -- Split in Unterkomponenten | Teilweise (FEAT-09-02: SuggestionBanner, OnboardingFlow extrahiert) |
| Virtual Scrolling | Lange Chat-Historien verursachen UI-Lag | Offen |
| Token-Estimation | ~4 chars/token Schaetzung -- genauer mit js-tiktoken | Niedrige Prio |
| SuggestionService | Dead Code -- nie instanziiert, nie aufgerufen | Offen (Backlog) |

### Security (AUDIT-003 bis AUDIT-006, Stand 2026-04-09)

Risikoprofil: 0 Critical, 1 High (by design), 4 Medium (3 by design), 3 Low, 2 Info.

Alle bekannten Bugs (FIX-01 bis FIX-12) resolved:
- FIX-01 bis FIX-06: Resolved (Details siehe Backlog)
- FIX-07: Reranker ONNX-Runtime -- Fail-Once-Guard implementiert
- FIX-08: ImplicitConnections Race Condition -- isOpen() Guard
- FIX-09: Session-Summaries nicht abrufbar -- DB-Fallback (ADR-60)
- FIX-10: learnedRecipesEnabled -- Force-True in main.ts (UI-Toggle ausstehend)
- FIX-11: ChatLink YAML-Parse-Fehler -- concise geloggt, Note uebersprungen
- FIX-12: Token Overflow -- geloest durch EPIC-18 (ADR-61/062/063)

Security Audits: `_devprocess/analysis/AUDIT-003-obsilo-2026-03-06.md` bis `AUDIT-006-obsilo-2026-04-02.md`

---

## 12. Glossar

| Begriff | Bedeutung |
|---------|-----------|
| **AgentTask** | Eine einzelne Agenten-Session (eine Konversation mit dem LLM) |
| **ToolExecutionPipeline** | Zentrale Governance-Schicht für alle Tool-Ausführungen |
| **Mode** | Agent-Persona mit definiertem Tool-Set, System-Prompt und Modell |
| **Checkpoint** | isomorphic-git-Commit im Shadow-Repo, erstellt vor jedem Write |
| **PARALLEL_SAFE** | Set von Tool-Namen, die parallel via Promise.all ausgeführt werden können |
| **Power Steering** | Periodische Injektion des Mode-Reminders in den Kontext |
| **Context Condensing** | LLM-basierte Komprimierung der Konversationshistorie bei zu vollem Kontext |
| **HyDE** | Hypothetical Document Embeddings — LLM generiert ein hypothetisches Dokument als Embedding-Input |
| **RRF** | Reciprocal Rank Fusion — Zusammenführung von Semantic- und Keyword-Rankings |
| **Shadow-Repo** | Separates isomorphic-git-Repository in `.obsidian/plugins/obsidian-agent/checkpoints/` |
| **Fail-Closed** | Sicherheits-Default: Fehlt die Approval-Callback-Funktion, wird die Aktion abgelehnt |
| **ApproveEditModal** | Modal mit line-by-line Diff-View, das vor `edit_file`-Operationen angezeigt wird |
| **ConversationStore** | Persistiert Konversationen (index.json + per-conversation JSON) im Plugin-Verzeichnis |
| **MemoryService** | Liest/schreibt Memory-Dateien (user-profile, projects, patterns, knowledge) und baut den Memory-Kontext für den System Prompt |
| **ExtractionQueue** | Persistente FIFO-Queue für asynchrone Memory-Extraktion. Überlebt Obsidian-Neustarts |
| **SessionExtractor** | LLM-basierte Session-Zusammenfassung (verwendet memoryModelKey) |
| **LongTermExtractor** | Promoviert Fakten aus Session-Summaries in die Long-Term-Memory-Dateien |
| **MemoryRetriever** | Semantische Suche über Session-Summaries für Cross-Session-Kontext |
| **Event Separation** | Architekturmuster: Completion-Signale (attempt_completion) getrennt von Text-Output. hasStreamedText-Flag steuert Fallback-Rendering (ADR-07) |
| **ToolPickerPopover** | UI-Element für session-lokale Overrides von Tools, Skills und Workflows |
| **Session-Override** | RAM-only Ueberschreibung von Mode-Einstellungen fuer die aktuelle Chat-Session |
| **VaultDNA** | Automatischer Runtime-Scan aller installierten Plugins. Generiert Skill-Files mit Commands und API-Methoden |
| **BM25** | Best Matching 25 — probabilistisches Keyword-Ranking-Verfahren basierend auf TF-IDF |
| **TF-IDF** | Term Frequency - Inverse Document Frequency — Gewichtung der Relevanz eines Terms in einem Dokument relativ zum Gesamtkorpus |
| **Stemming** | Reduktion von Woertern auf ihren Wortstamm (z.B. "analysiert" -> "analys") fuer besseren Recall |
| **Multi-Agent** | Delegation von Teilaufgaben an Kind-Tasks via `new_task`. Eigene History, forwarded Approval |
| **Plugin Skills** | Automatisch aus installierten Plugins generierte Skill-Beschreibungen in `.obsidian-agent/plugin-skills/` |
| **Soul** | Persistente Agent-Persoenlichkeit (Name, Sprache, Werte, Anti-Patterns) in `memory/soul.md` |
| **OnboardingService** | Erkennt ersten Kontakt und fuehrt den Nutzer durch einen 5-Schritt-Setup-Dialog |
| **ExplicitInstructions** | Best-Practice-Anweisungen im System Prompt (z.B. "Vault is sacred", parallele Reads) |
| **SafeStorageService** | Verschluesselt API-Keys via Electron safeStorage (OS Keychain). ADR-19 |
| **GlobalFileService** | Liest/schreibt Dateien im globalen Verzeichnis ~/.obsidian-agent/ fuer cross-vault Persistenz |
| **GlobalSettingsService** | Verwaltet globale Settings (500KB Limit), migriert von vault-lokaler zu globaler Speicherung |
| **SyncBridge** | Bidirektionale Synchronisation von globalen Daten mit Obsidian Sync (via .obsidian/ Mirror) |
| **GlobalMigrationService** | One-time Migration von vault-lokalen zu globalen Settings beim Plugin-Start |
| **FileAdapter** | Interface-Abstraktion fuer Dateizugriff (Obsidian Vault API oder Node.js fs), entkoppelt Services von konkretem Storage |
| **RecipeStore** | Persistiert gelernte Rezepte (Procedural Memory) im Plugin-Verzeichnis |
| **EpisodicExtractor** | Zeichnet erfolgreiche Tool-Sequenzen auf und speichert sie als episodische Erinnerungen |
| **RecipePromotionService** | Promoviert haeufig erfolgreiche Episoden (3+ Erfolge) automatisch zu wiederverwendbaren Rezepten |
| **ISandboxExecutor** | Interface fuer Sandbox-Backends. Desktop: ProcessSandboxExecutor (child_process.fork, OS-Level), Mobile: IframeSandboxExecutor (iframe, V8-Level). ADR-21 |
| **ProcessSandboxExecutor** | Desktop-Sandbox-Backend. Startet eigenstaendigen Node.js-Prozess via child_process.fork() mit ELECTRON_RUN_AS_NODE=1. OS-Level Prozess-Isolation |
| **Chat-Linking** | Automatische Verlinkung von Agent-Chats im YAML-Frontmatter bearbeiteter Notes. Pipeline Post-Write Hook fuegt `obsidian://obsilo-chat?id={id}` Deep-Links ein. ADR-22 |
| **stampChatLink** | Pipeline-Methode die nach erfolgreichen Write-Ops auf .md-Dateien den Chat-Link im Frontmatter einfuegt. Nutzt `processFrontMatter()` fuer atomare Updates |
| **DocumentParserRegistry** | Service-Registry die Dateiendungen auf Parser-Implementierungen mappt. Zentraler Dispatcher fuer alle Dokument-Parsing-Aufrufe (ADR-23) |
| **IDocumentParser** | Interface fuer Document Parser: `parse(data: ArrayBuffer, options?): Promise<ParseResult>`. Jeder Parser (PPTX, XLSX, DOCX, PDF, Datenformate) implementiert dieses Interface |
| **ParseResult** | Ergebnis eines Parser-Aufrufs: strukturierter Text, Bild-Metadaten (Anzahl, Positionen, Dateinamen), Dokument-Metadaten (Seitenanzahl, Sheets, etc.) |
| **ReadDocumentTool** | Tool-Wrapper (`read_document`) ueber den der Agent Dokumente aus dem Vault lesen und parsen kann. Delegiert an DocumentParserRegistry |
| **ExtractDocumentImagesTool** | Tool-Wrapper (`extract_document_images`) fuer On-Demand Bild-Extraktion aus OOXML-Dokumenten. Prueft Vision-Capability des Modells (Vision-Gate). ADR-25 |
| **Lazy Extraction** | Bild-Nachlade-Strategie: Beim initialen Parsing werden nur Metadaten erfasst. Bilder werden erst aus dem OOXML-Archiv extrahiert wenn der Agent das Tool aufruft (ADR-25) |
| **Vision-Gate** | Pruefung ob das aktuelle LLM-Modell Vision (Bildanalyse) unterstuetzt. ExtractDocumentImagesTool liefert erklaerenden Fehler bei Modellen ohne Vision |
| **OOXML** | Office Open XML -- ZIP-basiertes Dateiformat von Microsoft Office (PPTX, XLSX, DOCX). Enthaelt XML-Dateien fuer Inhalte und Media-Ordner fuer Bilder |
| **JSZip** | Leichtgewichtige JavaScript-Library (~30 KB) zum Lesen und Schreiben von ZIP-Archiven. Basis fuer alle OOXML-Parser (ADR-24) |
| **Task Extraction** | Deterministischer Post-Processing Hook: Regex-Scan auf `- [ ]` Items in Agent-Antworten, TaskSelectionModal zur Auswahl, Task-Notes mit strukturiertem Frontmatter. Kein LLM-Call im Flow (ADR-26) |
| **TaskExtractor** | Pure Function die Agent-Antworttext nach `- [ ]` Markdown-Patterns scannt und `TaskItem[]` zurueckgibt. Liegt in `src/core/tasks/` |
| **TaskSelectionModal** | Obsidian Modal mit Checkbox-Liste aller erkannten Tasks. Nutzer waehlt welche Items als Task-Notes erstellt werden |
| **TaskNoteCreator** | Service der ausgewaehlte Tasks als eigenstaendige Notes mit 10-Property-Frontmatter erstellt und die Task-Base (3 Views) generiert |
| **Task-Frontmatter-Schema** | 10 Properties: Kategorie, Zusammenfassung, Status, Dringend, Wichtig, Faelligkeit, Assignee, Quelle, created, Notizen. Implementiertes Schema weicht vom ADR-27-Vorschlag ab (siehe ADR-27 "Implementiertes Schema") |
| **Graceful Degradation** | Pattern fuer optionale Plugin-Integration: Feature funktioniert vollstaendig ohne externe Plugins (Iconic, Bases). Fehlende Plugins fuehren zu reduziertem (aber funktionalem) Feature-Set, nicht zu Fehlern |
| **FastPathExecutor** | Recipe-gesteuertes Batching: Erkennt gelernte Patterns, fuehrt Tool-Sequenzen deterministisch aus ohne iterative LLM-Calls. ADR-61 |
| **ResultExternalizer** | Lagert grosse Tool-Results (>4000 Chars) in temporaere Dateien aus und injiziert kompakte Referenzen in den Kontext. ADR-63 |
| **VaultHealthService** | SQL-basierte Lint-Checks auf dem Knowledge Graph: verwaiste Notes, fehlende Backlinks, gebrochene Links, schwache Cluster, inkonsistente Tags. ADR-67, FEAT-19-01 |
| **OntologyStore** | Taxonomie-Verwaltung in SQLite: Cluster/Entity-Beziehungen, Health-Checks, inkrementelles Update. ADR-65, EPIC-19 |
| **McpBridge** | MCP-Server-Orchestrator: stdio JSON-RPC, 6 Tools (getContext, searchVault, readNotes, writeVault, executeVaultOp, syncSession, updateMemory). ADR-53 |
| **CloudflareDeployer** | Deployt MCP Relay-Worker auf Cloudflare Workers + Durable Objects fuer Remote-Zugriff. ADR-55, FEAT-14-03 |
| **RelayClient** | HTTP Long-Polling Client fuer Remote MCP Transport. Token-in-URL Auth. ADR-55, FEAT-14-03 |
