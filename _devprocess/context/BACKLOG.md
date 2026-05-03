# Backlog Obsilo

> Single source of truth fuer Status und Beziehungs-Graph aller V-Model-Artefakte.
> Status-Felder leben hier, nicht in den Artefakt-Frontmattern.
> Pflegende Skills: /business-analysis, /requirements-engineering,
> /architecture, /coding, /testing, /security-audit, /release,
> /consistency-check.

Last update: 2026-05-03 by /coding (PLAN-10 BA-25 Phase 1 Foundation: Schema v10 + 4 Stores + 32 Tests)

---

## Dashboard

| Status      | Count | | Phase      | Count | | Type         | Count |
|-------------|-------|-|------------|-------|-|--------------|-------|
| Planned     |    43 | Released   |   259 | Epic         |    22 |
| Active      |     7 | Building   |    96 | Feature      |   195 |
| Done        |   185 | Planned    |     0 | Fix          |    24 |
| Wont Fix    |     1 |            |        | Improvement  |     0 |
| Superseded  |     2 |            |        | ADR          |   106 |
| Deprecated  |     1 |            |        | Plan         |     7 |
| Accepted    |    88 |            |        |              |        |
| Proposed    |    16 |            |        |              |        |

Total artifacts: 354

---

## Vocabulary

**Status:** Planned, Active, Review, Done, Waiting, Deferred, Wont Fix,
Superseded, Deprecated, Accepted, Proposed, Draft, Open.

**Phase:** Released, Building, Planned, Candidates.

**Type:** Epic, Feature, Fix, Improvement, ADR, Plan.

**Refs:** Comma-separated artifact IDs forming the relation graph.

**Source:** BA, RE, REV, SEC, USER, BUG, ARCH, CONSISTENCY-CHECK.

**ID schemas:**
- `EPIC-{nn}` (2-digit epic)
- `FEAT-{ee}-{ff}` (2-digit epic + 2-digit feature)
- `FIX-{ee}-{ff}-{nn}` (Feature + 2-digit fix number)
- `IMP-{ee}-{ff}-{nn}` (analog)
- `PLAN-{nn}` (global)
- `ADR-{nn}` (global)

Bei Ueberschreiten von `99` wird die jeweilige Klasse auf 3-stellig erweitert.

---

## Active Epics

### EPIC-01: Core Foundation

Source: `_devprocess/requirements/epics/EPIC-01-core-foundation.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-01-01 | Feature | Agent Core Loop | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-02 | Feature | Core Agent Interaction & Modes | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-03 | Feature | Vault Operations (Full CRUD) | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-04 | Feature | Vault Tools (Read, Write, Intelligence) | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-05 | Feature | Controlled Content Editing | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-06 | Feature | Permissions & Approval | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-07 | Feature | Checkpoints (Undo / Restore) | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-08 | Feature | Operation Logging & Audit Trail | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-09 | Feature | Tool Execution Pipeline | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-10 | Feature | Parallel Tool Execution | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-11 | Feature | Diff Stats Badge | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FEAT-01-12 | Feature | Attachments, Clipboard, and Images | Done | Released | EPIC-01 | BA |  |  | 2026-04-30 |  |
| FIX-01-01-01 | Fix | Anthropic API rejects history with orphaned tool_use blocks | Done | Released | FEAT-01-01, EPIC-01 | BUG |  |  | 2026-04-30 | P0 |
| FIX-01-12-01 | Fix | Drag-and-drop from Obsidian file explorer opens tab instead of attaching | Open | Building | FEAT-01-12, EPIC-01 | BUG |  |  | 2026-04-30 | P1 |

### EPIC-02: Rules, Workflows & Intelligence

Source: `_devprocess/requirements/epics/EPIC-02-rules-workflows-intelligence.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-02-01 | Feature | Rules | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FEAT-02-02 | Feature | Workflows & Slash Commands | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FEAT-02-03 | Feature | Skills | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FEAT-02-04 | Feature | PAS-1 – Local Skills | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FEAT-02-05 | Feature | VaultDNA — Automatic Plugin Discovery | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FEAT-02-06 | Feature | Autocomplete | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FEAT-02-07 | Feature | Custom Prompts (Slash Command Templates) | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FEAT-02-08 | Feature | Chat History | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FEAT-02-09 | Feature | Modes | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FEAT-02-10 | Feature | Custom Instructions, Custom Modes, and Rules | Done | Released | EPIC-02 | BA |  |  | 2026-04-30 |  |
| FIX-02-04-01 | Fix | Agent nutzt built-in `create_excalidraw` statt Excalidraw-Plugin (Plugin-Routing | Done | Released | FEAT-02-04, EPIC-02 | BUG |  |  | 2026-04-30 | P0 |

### EPIC-03: Context, Memory & Scaling

Source: `_devprocess/requirements/epics/EPIC-03-context-memory-scaling.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-03-01 | Feature | Semantic Search & Index | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-02 | Feature | Keyword Search Upgrade — Stemming + TF-IDF + Word Boundaries | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-03 | Feature | Context Management (Active Files & Tabs) | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-04 | Feature | Memory, Chat History & Personalization | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-05 | Feature | Multi-Agent (new_task) | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-06 | Feature | Context Condensing & Power Steering | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-07 | Feature | Power Steering | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-08 | Feature | Tool Repetition Detection | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-09 | Feature | Canvas & Bases Tools | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-10 | Feature | Global Storage Architecture | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-11 | Feature | Safe Storage (Encrypted API Keys) | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-12 | Feature | Modular System Prompt Architecture | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-13 | Feature | Import Models from Code Snippet | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-14 | Feature | Knowledge-DB-Haertung | Done | Released | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-15 | Feature | Memory-Engine-Foundation | Planned | Building | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-16 | Feature | Memory-Migration und Vault-RRF-Quick-Win | Planned | Building | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-17 | Feature | Dynamic Context Composition | Planned | Building | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-18 | Feature | Single-Call Update Pipeline und Combined Note-Index-Pass | Planned | Building | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FIX-03-18-01 | Fix | SingleCallProcessor budget-exhausted Test-Setup-Bug (nextMockApi) | Open | Building | FEAT-03-18, EPIC-03, PLAN-07 | BUG | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P2 |
| FEAT-03-19 | Feature | Living Document UX | Planned | Building | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-20 | Feature | History Search ueber alle Konversationen | Planned | Building | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-21 | Feature | Engine-Extract zu @obsilo/memory-engine | Planned | Building | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-22 | Feature | Privacy und Forget-Right | Planned | Building | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-23 | Feature | Memory-UX, Onboarding und Settings-Migration | Done | Released | EPIC-03 | BA |  |  | 2026-05-03 |  |
| FEAT-03-24 | Feature | Inference-Pass fuer Derives | Planned | Building | EPIC-03 | BA |  |  | 2026-04-30 |  |
| FEAT-03-25 | Feature | Vault-Note-zu-Fact-Extraction | Done | Released | EPIC-03, BA-25, ADR-109 | BA |  |  | 2026-05-03 |  |
| FEAT-03-26 | Feature | Selektiver Top-Hub-Block im KV-Cache | Done | Released | EPIC-03, BA-25, ADR-97 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P2 |
| IMP-03-17-01 | Improvement | recall_memory queryFacts auf Cosine ueber fact_embeddings | Done | Released | FEAT-03-17, EPIC-03 | REV |  |  | 2026-05-03 | P2 |
| IMP-03-18-01 | Improvement | AgingService Daily-Scheduler (setInterval, nicht nur onload) | Done | Released | FEAT-03-18, EPIC-03 | REV |  |  | 2026-05-03 | P2 |
| IMP-03-18-02 | Improvement | DriftEventBus Subscriber in ExtractionQueue (Throttle-Bypass) | Done | Released | FEAT-03-18, EPIC-03 | REV |  |  | 2026-05-03 | P2 |
| FIX-03-23-01 | Fix | FEAT-03-23 falsch auf Done markiert -- Onboarding-Memory-Step + Coach-Marks fehlen | Done | Released | FEAT-03-23, EPIC-03 | REV |  |  | 2026-05-03 | P2 |
| FIX-03-25-01 | Fix | FEAT-03-25 falsch auf Done markiert -- VaultMemorySourceService fehlt komplett | Done | Released | FEAT-03-25, EPIC-03, ADR-109 | REV |  |  | 2026-05-03 | P2 |
| FIX-03-06-01 | Fix | Session-Summary .md-Dateien werden nicht geschrieben | Done | Released | FEAT-03-06, EPIC-03 | BUG |  |  | 2026-04-30 | P1 |
| FIX-03-06-02 | Fix | Memory-Extractor und Context-Prefix-Generator retry-spammen bei permanenten Prov | Done | Released | FEAT-03-06, EPIC-03 | BUG |  |  | 2026-04-30 | P2 |
| FIX-03-14-01 | Fix | - WriterLock nicht verdrahtet | Done | Released | FEAT-03-14, EPIC-03 | BUG |  |  | 2026-04-30 | P2 |
| FIX-03-14-02 | Fix | - iCloud-Vault Rename nicht cascadiert | Done | Released | FEAT-03-14, EPIC-03 | BUG |  |  | 2026-04-30 | P2 |

### EPIC-04: Providers, Web & Localization

Source: `_devprocess/requirements/epics/EPIC-04-providers-web-localization.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-04-00 | Feature | create_pptx Tool | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-01 | Feature | create_docx Tool | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-01 | Feature | MCP Client & Tools | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-02 | Feature | create_xlsx Tool | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-02 | Feature | Web Tools | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-03 | Feature | Providers & Models | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-04 | Feature | Agent Prompt & Skill Update | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-04 | Feature | Localization (i18n) | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-05 | Feature | Conversational Onboarding & Settings-Skill | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-06 | Feature | Notifications | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-07 | Feature | Agent Skill Mastery | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-08 | Feature | Ollama Provider Management | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FEAT-04-09 | Feature | OpenAI-kompatible Streaming Tool-Call Robustheit | Done | Released | EPIC-04 | BA |  |  | 2026-04-30 |  |
| FIX-04-09-01 | Fix | OpenAI Provider verschluckt Tool-Calls bei finish_reason="stop" | Open | Building | FEAT-04-09, EPIC-04 | BUG |  |  | 2026-04-30 | P1 |

### EPIC-05: Self-Development & Sandbox

Source: `_devprocess/requirements/epics/EPIC-05-self-development-sandbox.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-05-01 | Feature | Spezifikation: Agent Self-Development (Meta-Agent) | Done | Released | EPIC-05 | BA |  |  | 2026-04-30 |  |
| FEAT-05-02 | Feature | Spezifikation: Sandbox OS-Level Process Isolation | Done | Released | EPIC-05 | BA |  |  | 2026-04-30 |  |
| FEAT-05-03 | Feature | Agent Control Tools | Done | Released | EPIC-05 | BA |  |  | 2026-04-30 |  |
| FEAT-05-04 | Feature | Agent Self-Configuration Tools | Done | Released | EPIC-05 | BA |  |  | 2026-04-30 |  |
| FEAT-05-05 | Feature | Plugin API Bridge & Recipe System | Done | Released | EPIC-05 | BA |  |  | 2026-04-30 |  |
| FEAT-05-06 | Feature | Tool Metadata Registry | Done | Released | EPIC-05 | BA |  |  | 2026-04-30 |  |
| FEAT-05-07 | Feature | Konfigurierbarer Agent-Folder | Done | Released | EPIC-05 | BA |  |  | 2026-04-30 |  |
| FEAT-05-08 | Feature | Agent Folder Change Handling (P0/P1/P2) | Done | Released | EPIC-05 | BA |  |  | 2026-04-30 |  |
| FIX-05-02-01 | Fix | Sandbox esbuild integrity hashes stale + vaultList('/') throws | Done | Released | FEAT-05-02, EPIC-05 | BUG |  |  | 2026-04-30 | P1 |
| FIX-05-02-02 | Fix | SandboxBridge circuit-breaker stays open, permanently blocks evaluate_expression | Open | Building | FEAT-05-02, EPIC-05 | BUG |  |  | 2026-04-30 | P1 |
| FIX-05-02-03 | Fix | SandboxBridge vault paths with trailing slash return null | Done | Released | FEAT-05-02, EPIC-05 | BUG |  |  | 2026-04-30 | P1 |

### EPIC-06: Files-to-Chat (Office-Format-Support)

Source: `_devprocess/requirements/epics/EPIC-06-files-to-chat.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-06-01 | Feature | Document Parsing Pipeline | Done | Released | EPIC-06 | BA |  |  | 2026-04-30 |  |
| FEAT-06-02 | Feature | File Picker Erweiterung | Done | Released | EPIC-06 | BA |  |  | 2026-04-30 |  |
| FEAT-06-03 | Feature | Token-Budget-Management | Done | Released | EPIC-06 | BA |  |  | 2026-04-30 |  |
| FEAT-06-04 | Feature | On-Demand Bild-Extraktion | Planned | Building | EPIC-06 | BA |  |  | 2026-04-30 |  |
| FEAT-06-05 | Feature | Modell-Kompatibilitäts-Check | Done | Released | EPIC-06 | BA |  |  | 2026-04-30 |  |

### EPIC-07: Chat-Linking (Provenienz & Nachvollziehbarkeit)

Source: `_devprocess/requirements/epics/EPIC-07-chat-linking.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-07-01 | Feature | Chat-Linking | Done | Released | EPIC-07 | BA |  |  | 2026-04-30 |  |
| FEAT-07-02 | Feature | Protocol Handler (Deep-Links) | Done | Released | EPIC-07 | BA |  |  | 2026-04-30 |  |
| FEAT-07-03 | Feature | Auto-Frontmatter-Linking | Done | Released | EPIC-07 | BA |  |  | 2026-04-30 |  |
| FEAT-07-04 | Feature | Semantisches Chat-Titling | Done | Released | EPIC-07 | BA |  |  | 2026-04-30 |  |
| FEAT-07-05 | Feature | Chat-Linking Setting | Done | Released | EPIC-07 | BA |  |  | 2026-04-30 |  |
| FIX-07-03-01 | Fix | ChatLink stampt ungueltiges Frontmatter (YAMLParseError) | Done | Released | FEAT-07-03, EPIC-07 | BUG |  |  | 2026-04-30 | P1 |

### EPIC-08: Task Management

Source: `_devprocess/requirements/epics/EPIC-08-task-management.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-08-01 | Feature | Task Extraction & Management | Done | Released | EPIC-08 | BA |  |  | 2026-04-30 |  |

### EPIC-09: Monetarisierung

Source: `_devprocess/requirements/epics/EPIC-09-monetarisierung.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-09-01 | Feature | Obsilo Gateway | Planned | Candidates | EPIC-09 | BA |  |  | 2026-04-30 |  |
| FEAT-09-02 | Feature | AgentSidebarView Refactoring | Done | Released | EPIC-09 | BA |  |  | 2026-04-30 |  |

### EPIC-10: Office Document Creation

Source: `_devprocess/requirements/epics/EPIC-10-office-document-creation.md`
Phase: Released | Status: Done

(Container epic. Office creation tools `create_pptx`, `create_docx`,
`create_xlsx` track under EPIC-11 features and FEAT-04-00 to FEAT-04-02.
No standalone EPIC-10 feature rows.)

### EPIC-11: Office Document Quality -- Template Design Intelligence

Source: `_devprocess/requirements/epics/EPIC-11-office-document-quality.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-11-00 | Feature | PPTX Template-Engine (JSZip + OOXML) | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-01 | Feature | Default PPTX Templates | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-02 | Feature | Pre-Creation Dialog & Template-Upload | Planned | Building | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-03 | Feature | Theme-Extraktion (vereinfacht) | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-05 | Feature | Universelle Design-Prinzipien (Skill-Erweiterung) | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-08 | Feature | In-Plugin Template-Analyzer (Spatial Analysis + Skill-Generierung) | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-10 | Feature | Shape-Name-Matching (Strategy S0) | Deprecated | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-11 | Feature | Visual Design Language Document (Skill-Format) | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-12 | Feature | Multimodaler Template-Analyzer (Cloud Run Backend) | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-13 | Feature | Template-Analyzer Web-Frontend (obsilo.ai) | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-14 | Feature | Template Gallery (Community) | Planned | Candidates | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-15 | Feature | Visual Intelligence | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-16 | Feature | Schema-Constrained Slide Generation | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-17 | Feature | plan_presentation Tool | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |
| FEAT-11-18 | Feature | Catalog-Enrichment (special_role, group_id, vollstaendige Beispiele) | Done | Released | EPIC-11 | BA |  |  | 2026-04-30 |  |

### EPIC-12: GitHub Copilot LLM Provider Integration

Source: `_devprocess/requirements/epics/EPIC-12-github-copilot-provider.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-12-01 | Feature | GitHub Copilot Auth & Token Management | Done | Released | EPIC-12 | BA |  |  | 2026-04-30 |  |
| FEAT-12-02 | Feature | Copilot Chat Completions Provider | Done | Released | EPIC-12 | BA |  |  | 2026-04-30 |  |
| FEAT-12-03 | Feature | Copilot Settings UI Integration | Done | Released | EPIC-12 | BA |  |  | 2026-04-30 |  |
| FEAT-12-04 | Feature | Copilot Embedding Support | Wont Fix | Candidates | EPIC-12 | BA |  |  | 2026-04-30 |  |
| FEAT-12-05 | Feature | Dynamic Copilot Model Listing | Done | Released | EPIC-12 | BA |  |  | 2026-04-30 |  |
| FEAT-12-06 | Feature | GitHub Copilot Modern Model Compatibility (max_completion_tokens) | Done | Released | EPIC-12 | BA |  |  | 2026-04-30 |  |
| FIX-12-06-01 | Fix | GitHub Copilot Provider lehnt max_tokens fuer neuere Modelle ab | Done | Released | FEAT-12-06, EPIC-12 | BUG |  |  | 2026-04-30 | P1 |

### EPIC-13: Kilo Gateway LLM Provider Integration

Source: `_devprocess/requirements/epics/EPIC-13-kilo-gateway-provider.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-13-01 | Feature | Kilo Auth & Session Management | Done | Released | EPIC-13 | BA |  |  | 2026-04-30 |  |
| FEAT-13-02 | Feature | Kilo Gateway Chat Provider | Done | Released | EPIC-13 | BA |  |  | 2026-04-30 |  |
| FEAT-13-03 | Feature | Kilo Settings UI Integration | Done | Released | EPIC-13 | BA |  |  | 2026-04-30 |  |
| FEAT-13-04 | Feature | Kilo Dynamic Model Listing | Done | Released | EPIC-13 | BA |  |  | 2026-04-30 |  |
| FEAT-13-05 | Feature | Kilo Organization Context | Done | Released | EPIC-13 | BA |  |  | 2026-04-30 |  |
| FEAT-13-06 | Feature | Kilo Embedding Support | Done | Released | EPIC-13 | BA |  |  | 2026-04-30 |  |
| FEAT-13-07 | Feature | Kilo Manual Token Mode | Done | Released | EPIC-13 | BA |  |  | 2026-04-30 |  |

### EPIC-14: MCP Connector

Source: `_devprocess/requirements/epics/EPIC-14-mcp-connector.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-14-00 | Feature | MCP Server Core (stdio) | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-01 | Feature | Tool-Tier-Mapping | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-02 | Feature | MCP Server Settings UI | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-03 | Feature | Remote Transport (Cloudflare Relay) | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-04 | Feature | Remote Authentication | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-05 | Feature | MCP Resources | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-06 | Feature | MCP Prompts (System-Prompt-Ersatz) | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-07 | Feature | Plugin Skill Discovery | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-08 | Feature | Remote Approval Pipeline | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-09 | Feature | Connectors Directory Submission | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-10 | Feature | Sandbox Exposure via MCP | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |
| FEAT-14-11 | Feature | Memory Transparency (Agent vs. Human) | Done | Released | EPIC-14 | BA |  |  | 2026-04-30 |  |

### EPIC-15: Unified Knowledge Layer

Source: `_devprocess/requirements/epics/EPIC-15-knowledge-layer.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-15-00 | Feature | SQLite Knowledge DB | Done | Released | EPIC-15 | BA |  |  | 2026-04-30 |  |
| FEAT-15-01 | Feature | Enhanced Vector Retrieval | Done | Released | EPIC-15 | BA |  |  | 2026-04-30 |  |
| FEAT-15-02 | Feature | Graph Data Extraction & Expansion | Done | Released | EPIC-15 | BA |  |  | 2026-04-30 |  |
| FEAT-15-03 | Feature | Implicit Connection Discovery | Done | Released | EPIC-15 | BA |  |  | 2026-04-30 |  |
| FEAT-15-04 | Feature | Local Reranking | Done | Released | EPIC-15 | BA |  |  | 2026-04-30 |  |
| FEAT-15-05 | Feature | Knowledge Data Consolidation | Done | Released | EPIC-15 | BA |  |  | 2026-04-30 |  |
| FEAT-15-06 | Feature | Implicit Connection UI | Done | Released | EPIC-15 | BA |  |  | 2026-04-30 |  |
| FEAT-15-08 | Feature | Storage Consolidation | Done | Released | EPIC-15 | BA |  |  | 2026-04-30 |  |
| FEAT-15-09 | Feature | Note-Summary Storage (note_summaries-Tabelle + Indexing-Hook) | Done | Released | EPIC-15, BA-25, ADR-92 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-15-10 | Feature | Frontmatter-Property Mirror (frontmatter_properties + SQL-Taxonomie-Lookup) | Done | Released | EPIC-15, BA-25, ADR-92 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-15-11 | Feature | Cluster-Source-Stats fuer Source-Diversity-Tracking | Done | Released | EPIC-15, BA-25, ADR-92, ADR-93 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-15-12 | Feature | Cluster-Metadata mit Halbwertszeit-Konfiguration | Done | Released | EPIC-15, BA-25, ADR-92, ADR-94 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FIX-15-00-01 | Fix | KnowledgeDB Korruption durch nicht-atomare Writes + Cloud Sync | Open | Building | FEAT-15-00, EPIC-15 | BUG |  |  | 2026-04-30 | P1 |
| FIX-15-03-01 | Fix | ImplicitConnections "Statement closed" Race Condition | Done | Released | FEAT-15-03, EPIC-15 | BUG |  |  | 2026-04-30 | P2 |
| FIX-15-04-01 | Fix | Reranker ONNX-Runtime Fehler in Electron | Done | Released | FEAT-15-04, EPIC-15 | BUG |  |  | 2026-04-30 | P2 |

### EPIC-16: Claude Code Pattern Adoption

Source: `_devprocess/requirements/epics/EPIC-16-claude-code-pattern-adoption.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-16-00 | Feature | Deferred Tool Loading | Done | Released | EPIC-16 | BA |  |  | 2026-04-30 |  |

### EPIC-17: Website-Dokumentation & Roadmap

Source: `_devprocess/requirements/epics/EPIC-17-website-documentation.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-17-00 | Feature | SSG-Migration & Grundgeruest | Done | Released | EPIC-17 | BA |  |  | 2026-04-30 |  |
| FEAT-17-01 | Feature | User Guide -- Informationsarchitektur & Content | Done | Released | EPIC-17 | BA |  |  | 2026-04-30 |  |
| FEAT-17-02 | Feature | Obsilo Doku-Skill | Done | Released | EPIC-17 | BA |  |  | 2026-04-30 |  |
| FEAT-17-03 | Feature | Developer Docs -- Update & Erweiterung | Done | Released | EPIC-17 | BA |  |  | 2026-04-30 |  |
| FEAT-17-04 | Feature | Homepage -- Roadmap & Versions-Log | Done | Released | EPIC-17 | BA |  |  | 2026-04-30 |  |
| FEAT-17-05 | Feature | Homepage -- Hero & Messaging Update | Done | Released | EPIC-17 | BA |  |  | 2026-04-30 |  |
| FEAT-17-06 | Feature | Design-Ueberarbeitung (Best-in-Class) | Done | Released | EPIC-17 | BA |  |  | 2026-04-30 |  |
| FEAT-17-07 | Feature | DE Uebersetzung | Done | Released | EPIC-17 | BA |  |  | 2026-04-30 |  |

### EPIC-18: Token-Kostenreduktion

Source: `_devprocess/requirements/epics/EPIC-18-token-cost-reduction.md`
Phase: Released | Status: Done

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-18-00 | Feature | Fast Path Execution | Done | Released | EPIC-18 | BA |  |  | 2026-04-30 |  |
| FEAT-18-01 | Feature | Prompt Caching (Provider-agnostisch) | Done | Released | EPIC-18 | BA |  |  | 2026-04-30 |  |
| FEAT-18-02 | Feature | Context Externalization (Dateisystem als Kontext) | Done | Released | EPIC-18 | BA |  |  | 2026-04-30 |  |
| FEAT-18-03 | Feature | Cross-Platform TMP-Pfade fuer Context Externalization | Done | Released | EPIC-18 | BA |  |  | 2026-04-30 |  |
| FEAT-18-04 | Feature | Cost-Aware Agent Heuristics | Done | Released | EPIC-18 | BA |  |  | 2026-04-30 |  |
| FIX-18-03-01 | Fix | TMP-Files nicht lesbar auf Windows (Pfad-Trennzeichen) | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  | 2026-04-30 | P1 |
| FIX-18-03-02 | Fix | read_file cannot open externalised tool results under tmp/ | Open | Building | FEAT-18-03, EPIC-18 | BUG |  |  | 2026-04-30 | P1 |
| FIX-18-03-03 | Fix | Externalise cleanup fails with EPERM on iCloud-synced vaults | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  | 2026-04-30 | P2 |
| FIX-18-03-04 | Fix | FastPath planner JSON parse fails -- recipe aborts mid-task | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  | 2026-04-30 | P2 |
| FIX-18-04-01 | Fix | Streaming Tool-Error verschluckt + edit_file-Schleife bei grossen Diffs | Open | Building | FEAT-18-04, EPIC-18 | BUG |  |  | 2026-04-30 | P1 |

### EPIC-19: Knowledge Maintenance

Source: `_devprocess/requirements/epics/EPIC-19-knowledge-maintenance.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-19-00 | Feature | Knowledge Ingest Skill | Done | Released | EPIC-19 | BA |  |  | 2026-04-30 |  |
| FEAT-19-01 | Feature | Vault Health Check (Lint) | Done | Released | EPIC-19 | BA |  |  | 2026-04-30 |  |
| FEAT-19-02 | Feature | Knowledge Ontologie | Done | Released | EPIC-19 | BA |  |  | 2026-04-30 |  |
| FEAT-19-03 | Feature | Template-Onboarding | Done | Released | EPIC-19 | BA |  |  | 2026-04-30 |  |
| FEAT-19-04 | Feature | Synthese → Zettel | Done | Released | EPIC-19 | BA |  |  | 2026-04-30 |  |
| FEAT-19-05 | Feature | OCR-Integration | Done | Released | EPIC-19 | BA |  |  | 2026-04-30 |  |
| FEAT-19-06 | Feature | Attachment-Batch-Umbenennung | Done | Released | EPIC-19 | BA |  |  | 2026-04-30 |  |
| FEAT-19-07 | Feature | Chat UI Polish | Done | Released | EPIC-19 | BA |  |  | 2026-04-30 |  |
| FEAT-19-08 | Feature | Konfigurierbarer Standard-Prompt fuer Note-Summary-Generierung | Done | Released | EPIC-19, BA-25 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-09 | Feature | Auto-Summary-Generierung beim Indexing | Done | Released | EPIC-19, BA-25, ADR-95 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-10 | Feature | Frontmatter-Write Toggle plus Backfill-Job mit Progress-UI | Done | Released | EPIC-19, BA-25, ADR-95 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P1 |
| FEAT-19-11 | Feature | Aktive MOC-File-Pflege mit Marker-Konvention | Done | Released | EPIC-19, BA-25, ADR-96 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P2 |
| FEAT-19-12 | Feature | Pre-Triage-Tool mit 10s-Triage-Karte | Done | Released | EPIC-19, BA-25, ADR-98 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FIX-19-12-02 | Fix | URL-Sanitizer in IngestTriageLogStore (Query-Params strippen) | Done | Released | FEAT-19-12, EPIC-19, AUDIT-014 | SEC | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P3 |
| FIX-19-27-01 | Fix | Rate-Limit fuer AutoTriggerObserver gegen vault.on-Storm | Done | Released | FEAT-19-27, EPIC-19, AUDIT-014 | SEC | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P3 |
| FIX-03-26-01 | Fix | Settings-UI-Hinweis fuer Top-Hub-Block Privacy-Trade-Off | Done | Released | FEAT-03-26, EPIC-03, AUDIT-014 | SEC | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P2 |
| IMP-19-20-01 | Improvement | Stufe3PeriodicJob state-Persistierung in DB | Done | Released | FEAT-19-20, EPIC-19, AUDIT-014 | SEC | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P3 |
| FEAT-19-13 | Feature | Tension-Detection beim Deep-Ingest | Done | Released | EPIC-19, BA-25, ADR-99 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P1 |
| FEAT-19-14 | Feature | Concentration-Warning UI plus Anti-Echo-Vorschlag | Done | Released | EPIC-19, BA-25, ADR-93, ADR-104 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P1 |
| FEAT-19-15 | Feature | Inbox-Workflow fuer Batch-Triage | Done | Released | EPIC-19, BA-25 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P2 |
| FEAT-19-16 | Feature | Stufe-1 Composite-Freshness-Score als VaultHealth-Check | Done | Released | EPIC-19, BA-25, ADR-94 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-17 | Feature | Source-Diversity-Check als Bias-Lint-Kategorie | Done | Released | EPIC-19, BA-25, ADR-93 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-18 | Feature | Health-Modal-Erweiterung mit kontext-spezifischen Action-Buttons | Done | Released | EPIC-19, BA-25, ADR-106 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-19 | Feature | Stufe-2 Activity-Trigger plus Web-Search-Update-Pass | Done | Released | EPIC-19, BA-25, ADR-104, ADR-106 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P1 |
| FEAT-19-20 | Feature | Stufe-3 Periodischer Job plus Token-Budget-Cap plus Notifications | Done | Released | EPIC-19, BA-25, ADR-104, ADR-105 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P2 |
| FEAT-19-21 | Feature | Hot-Cluster-Konfiguration in Settings | Done | Released | EPIC-19, BA-25, ADR-105 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P1 |
| FEAT-19-22 | Feature | Aktiver Dialog-Ingest-Modus (Modus A) | Done | Released | EPIC-19, BA-25, ADR-100 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-23 | Feature | Auto-Ingest-Modus (Modus B) | Done | Released | EPIC-19, BA-25 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P1 |
| FEAT-19-24 | Feature | Output-Modus-Auswahl (Source-only / Summary / Multi-Zettel) | Done | Released | EPIC-19, BA-25, ADR-101 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-25 | Feature | Source-Folder vs Wissens-Folder Konfiguration | Done | Released | EPIC-19, BA-25, ADR-101 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-26 | Feature | Dialog-getriebener MOC-Page-Update beim Ingest | Done | Released | EPIC-19, BA-25, ADR-96 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P1 |
| FEAT-19-27 | Feature | Konfigurierbarer Auto-Trigger via Frontmatter-Property | Done | Released | EPIC-19, BA-25, ADR-102 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-28 | Feature | Source-Position-Marker (Block-Refs MD, Page-Refs PDF, Anchor URL) | Done | Released | EPIC-19, BA-25, ADR-103 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P0 |
| FEAT-19-29 | Feature | PDF-Strategie (Page-Refs Default vs Markdown-Mirror opt-in) | Done | Released | EPIC-19, BA-25, ADR-103 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P1 |
| FEAT-19-30 | Feature | Bibliographische Summary-Note mit Base-Block fuer Multi-Zettel-Modus | Done | Released | EPIC-19, BA-25, ADR-101 | BA | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | P1 |
| FIX-19-01-01 | Fix | vault_health_check and ingest_document missing from builtin mode tool groups | Done | Released | FEAT-19-01, EPIC-19 | BUG |  |  | 2026-04-30 | P2 |
| FIX-19-01-02 | Fix | Vault-health badge disappeared + redesign to heart-pulse icon | Done | Released | FEAT-19-01, EPIC-19 | BUG |  |  | 2026-04-30 | P1 |

### EPIC-20: Graph Intelligence

Source: `_devprocess/requirements/epics/EPIC-20-graph-intelligence.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-20-01 | Feature | Confidence Scoring | Done | Released | EPIC-20 | BA |  |  | 2026-04-30 |  |
| FEAT-20-02 | Feature | Community Detection (Louvain) | Done | Released | EPIC-20 | BA |  |  | 2026-04-30 |  |
| FEAT-20-03 | Feature | God-Node Analysis | Done | Released | EPIC-20 | BA |  |  | 2026-04-30 |  |
| FEAT-20-04 | Feature | Retrieval Quality Improvements | Done | Released | EPIC-20 | BA |  |  | 2026-04-30 |  |
| FEAT-20-05 | Feature | Batch Ingest | Done | Released | EPIC-20 | BA |  |  | 2026-04-30 |  |
| FEAT-20-06 | Feature | Knowledge Freshness | Done | Released | EPIC-20 | BA |  |  | 2026-04-30 |  |

### EPIC-21: ChatGPT OAuth Provider

Source: `_devprocess/requirements/epics/EPIC-21-chatgpt-oauth-provider.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-21-01 | Feature | ChatGPT OAuth Lifecycle (PKCE, Loopback, Refresh) | Done | Released | EPIC-21 | BA |  |  | 2026-04-30 |  |
| FEAT-21-02 | Feature | Codex Responses-API Handler | Done | Released | EPIC-21 | BA |  |  | 2026-04-30 |  |
| FEAT-21-03 | Feature | Settings-UI mit "Mit ChatGPT anmelden" | Done | Released | EPIC-21 | BA |  |  | 2026-04-30 |  |

### EPIC-22: Skill-Package Ecosystem (Anthropic-kompatibel)

Source: `_devprocess/requirements/epics/EPIC-22-skill-package-ecosystem.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-22-01 | Feature | Skill-Folder-Struktur (SKILL.md + Subfolders) | Done | Released | EPIC-22 | BA |  |  | 2026-04-30 |  |
| FEAT-22-02 | Feature | Universal Skill-Import (.md / Folder / .skill-Zip) | Done | Released | EPIC-22 | BA |  |  | 2026-04-30 |  |
| FEAT-22-03 | Feature | Scripts-im-Skill (Sandbox-Aufruf) | Planned | Building | EPIC-22 | BA |  |  | 2026-04-30 |  |
| FEAT-22-04 | Feature | Coordinator-Skill (Multi-Rolle in einem Ordner) | Planned | Building | EPIC-22 | BA |  |  | 2026-04-30 |  |
| FEAT-22-05 | Feature | Slash Skill Autocomplete | Done | Released | EPIC-22 | BA |  |  | 2026-04-30 |  |
| FEAT-22-06 | Feature | Inline @-Reference | Done | Released | EPIC-22 | BA |  |  | 2026-04-30 |  |
| FEAT-22-07 | Feature | Prefix Split + `+` Menu Integration | Done | Released | EPIC-22 | BA |  |  | 2026-04-30 |  |
| FIX-22-07-01 | Fix | Sidebar view crashes during BRAT hot-reload (opens before doLoad) | Open | Building | FEAT-22-07, EPIC-22 | BUG |  |  | 2026-04-30 | P0 |

### EPIC-23: Cross-Surface AI Workflow

Source: `_devprocess/requirements/epics/EPIC-23-cross-surface-ai-workflow.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| FEAT-23-01 | Feature | save_to_memory + save_conversation MCP-Tools | Done | Released | EPIC-23, BA-26, ADR-107 | BA |  |  | 2026-05-03 | P0 |
| FEAT-23-02 | Feature | recall_memory + search_history MCP-Tools | Done | Released | EPIC-23, BA-26, ADR-107, IMP-03-17-01 | BA |  |  | 2026-05-03 | P0 |
| FEAT-23-03 | Feature | History-Sidebar Source-Tabs + Read-Only-View | Done | Released | EPIC-23, BA-26, FEAT-23-04 | BA |  |  | 2026-05-03 | P0 |
| FEAT-23-04 | Feature | Source-Interface-Tagging + Settings Cross-Surface-Sync | Done | Released | EPIC-23, BA-26, ADR-108 | BA |  |  | 2026-05-03 | P0 |
| FEAT-23-05 | Feature | update_memory V1-Deprecation + Migrations-Helper | Done | Released | EPIC-23, BA-26, ADR-107, FEAT-23-01 | BA |  |  | 2026-05-03 | P0 |
| FEAT-23-06 | Feature | Memory-Profile-System (Wiedervorlage nach 2 Wochen Live-Use) | Planned | Candidates | EPIC-23, BA-26, BA-24, FEAT-23-01, FEAT-23-02, FEAT-23-04 | BA |  |  | 2026-05-03 | P1 |
| FIX-23-04-01 | Fix | Perplexity MCP-Connect schlaegt mit "Unexpected content type" fehl | Done | Released | FEAT-23-04, EPIC-23, ADR-108 | BUG |  |  | 2026-05-03 | P1 |
| FIX-23-01-01 | Fix | save_conversation Living-Document-Semantik + Cross-Interface-Thread-Klammer | Done | Released | FEAT-23-01, EPIC-23, BA-24, ADR-110 | REV |  |  | 2026-05-03 | P0 |
| FIX-23-01-02 | Fix | sync_session ohne source_interface -> Conversation landet im 'unknown'/'obsilo'-Tab statt Provider-Tab | Done | Released | FEAT-23-01, FEAT-23-03, EPIC-23 | BUG |  |  | 2026-05-03 | P1 |
| FIX-23-01-03 | Fix | Auto-Session-Tracking erzeugt Duplikat-Eintrag im Unknown-Tab bei EPIC-23 Tools | Done | Released | FEAT-23-01, FEAT-23-03, EPIC-23 | BUG |  |  | 2026-05-03 | P1 |
| FIX-23-01-04 | Fix | ensureSession erzeugt leere ConversationStore-Row bei jedem MCP-Call -> lazy machen | Done | Released | FEAT-23-01, EPIC-23, FIX-23-01-03 | BUG |  |  | 2026-05-03 | P1 |
| FIX-23-01-05 | Fix | save_conversation per-message-size-cap (DoS-Vektor, AUDIT-015 H-1) | Done | Released | FEAT-23-01, EPIC-23, AUDIT-015 | SEC |  |  | 2026-05-03 | H |
| IMP-23-01-01 | Improvement | Eval-Coverage Pass: MCP-Tool-Handlers + Vault-Tools + FrontmatterIndexer-Bridge (50 neue Tests) | Done | Released | EPIC-23, FEAT-03-25, AUDIT-015 | REV |  |  | 2026-05-03 | P2 |
| FIX-23-04-02 | Fix | MCP Rate-Limiter (sliding window, AUDIT-015 M-1) | Done | Released | EPIC-23, AUDIT-015 | SEC |  |  | 2026-05-03 | M |
| FIX-23-04-03 | Fix | sanitizeVaultContentForLLM gegen Prompt-Injection im memorySourceHook (AUDIT-015 M-2) | Done | Released | FEAT-03-25, EPIC-23, AUDIT-015 | SEC |  |  | 2026-05-03 | M |
| FIX-23-04-04 | Fix | strictSourceIsolation Setting fuer recall_memory + search_history (AUDIT-015 M-3) | Done | Released | FEAT-23-02, FEAT-23-04, EPIC-23, AUDIT-015 | SEC |  |  | 2026-05-03 | M |
| FIX-23-04-05 | Fix | sync_session per-message-cap + transcript-length-limit (AUDIT-016 H-1) | Done | Released | EPIC-23, AUDIT-016 | SEC |  |  | 2026-05-03 | H |
| FIX-23-04-06 | Fix | write_vault content-length cap (AUDIT-016 M-1) | Done | Released | AUDIT-016 | SEC |  |  | 2026-05-03 | M |
| FIX-23-04-07 | Fix | search_history LIKE-wildcard escape (AUDIT-016 M-2) | Done | Released | FEAT-23-02, AUDIT-016 | SEC |  |  | 2026-05-03 | M |
| FIX-23-04-08 | Fix | get_context strictSourceIsolation gating (AUDIT-016 M-3) | Done | Released | EPIC-23, AUDIT-016 | SEC |  |  | 2026-05-03 | M |
| FIX-23-04-09 | Fix | ConversationStore.generateId crypto.randomUUID (AUDIT-016 M-4) | Done | Released | EPIC-23, AUDIT-016 | SEC |  |  | 2026-05-03 | M |
| FIX-23-04-10 | Fix | ActiveMcpSessions ohne Hash + cosine NaN-Guard + OutputModeGenerator instanceof + validateVaultPath-Helper (AUDIT-016 L-1/L-2/L-3/L-5) | Done | Released | AUDIT-016 | SEC |  |  | 2026-05-03 | L |
| IMP-23-04-05 | Improvement | relay /poll partitioniert pro Plugin-Session (AUDIT-016 L-4, deferred) | Planned | Building | EPIC-23, AUDIT-016 | SEC |  |  | 2026-05-03 | L |
| ADR-110 | ADR | Living-Document-Semantik + Cross-Interface-Thread-Klammer fuer Cross-Surface MCP | Accepted | Released | FIX-23-01-01, BA-24, FEAT-23-01, FEAT-03-18 | ARCH |  |  | 2026-05-03 |  |

## Cross-cutting Items (no Epic)

ADRs and PLANs that span multiple epics.

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|----|------|-------|--------|-------|------|--------|--------|-------|-------------|-------|
| ADR-01 | ADR | Zentrale ToolExecutionPipeline für alle Tool-Aufrufe | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-02 | ADR | isomorphic-git für Checkpoints (Shadow Repository) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-03 | ADR | vectra + Xenova Transformers für lokalen Semantic Index | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-04 | ADR | Mode-basierte Tool-Filterung via Tool-Gruppen | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-05 | ADR | Fail-Closed Approval (kein Callback = Ablehnung) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-06 | ADR | Sliding Window für Tool-Repetition-Erkennung | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-07 | ADR | Event Separation — Completion Signals vs. Text Output | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-08 | ADR | Modular Prompt Sections & Central Tool Metadata | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-09 | ADR | PAS-1 – Local Skills | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-10 | ADR | Permissions Audit — Auto-Approval Wiring | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-11 | ADR | Multi-Provider API Architecture (Adapter Pattern) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-12 | ADR | Context Condensing Strategy (Keep-First-Last) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-13 | ADR | 3-Tier Memory Architecture (Chat -> Session -> Long-Term) | Superseded | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-14 | ADR | VaultDNA — Automatische Plugin-Erkennung als Skills | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-15 | ADR | Hybrid Search mit Semantic + BM25 + RRF Fusion | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-16 | ADR | Rich Tool Descriptions in ToolMeta | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-17 | ADR | Procedural Skill Recipes | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-18 | ADR | Episodic Task Memory | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-19 | ADR | Electron safeStorage fuer API-Key-Verschluesselung | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-20 | ADR | Global Storage Architecture mit Sync Bridge | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-21 | ADR | OS-Level Sandbox via child_process.fork() | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-22 | ADR | Chat-Linking via Pipeline Post-Write Hook | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-23 | ADR | Document Parser als wiederverwendbare Tools | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-24 | ADR | Parsing-Library-Auswahl fuer Office-Formate | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-25 | ADR | On-Demand Bild-Nachlade-Strategie | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-26 | ADR | Post-Processing Hook fuer Task Extraction | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-27 | ADR | Task-Note Frontmatter Schema | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-28 | ADR | Base-Erstellung und optionale Plugin-Integration fuer Task Extraction | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-29 | ADR | Input-Schema-Design fuer Office-Creation-Tools | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-30 | ADR | Library-Selection fuer Office-Format-Erzeugung | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-31 | ADR | Binary-Write-Pattern fuer Office-Format-Dateien | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-32 | ADR | Template-basierte PPTX-Erzeugung (JSZip + OOXML) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-33 | ADR | Multimodaler Template-Analyzer (Cloud Run + BYOK) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-34 | ADR | Visual Design Language Document als Skill-Format | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-35 | ADR | Visual Intelligence -- Lokale Qualitaetskontrolle und Agent-basierte Template-An | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-36 | ADR | GitHub Copilot Streaming Strategy | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-37 | ADR | GitHub Copilot Provider Architecture | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-38 | ADR | Copilot Token Storage in Settings | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-39 | ADR | Copilot Content Normalization Strategy | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-40 | ADR | Kilo Gateway Provider Architecture | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-41 | ADR | Kilo Auth and Session Architecture | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-42 | ADR | Kilo Metadata Discovery Strategy | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-43 | ADR | Kilo Embedding Gating Strategy | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-44 | ADR | CSS-SVG Slide Engine (Ablösung PPTX Template Analyzer) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-45 | ADR | pptx-automizer Template Pipeline (Abloesung CSS-SVG Engine) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-46 | ADR | Direct Template Mode (Abloesung Composition-Abstraktion) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-47 | ADR | Schema-Constrained Slide Generation | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-48 | ADR | plan_presentation Pipeline -- Content-Transformation auf Tool-Ebene | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-49 | ADR | Raw XML Clear + Generate (Abloesung modifyElement fuer Content) | Proposed | Candidates |  | ARCH |  |  | 2026-04-30 |  |
| ADR-50 | ADR | SQLite Knowledge DB (sql.js WASM) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-51 | ADR | 4-Stufen Retrieval-Pipeline | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-52 | ADR | Local Reranker Integration | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-53 | ADR | MCP Server Prozess-Architektur | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-54 | ADR | MCP Tool-Mapping & System-Prompt-Uebertragung | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-55 | ADR | Remote MCP Relay via Cloudflare Workers + Durable Objects | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-56 | ADR | Static Site Generator fuer Website-Dokumentation | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-57 | ADR | Informationsarchitektur & Seitenstruktur | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-58 | ADR | Semantic Recipe Promotion (Intent-basiert statt Sequenz-basiert) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-59 | ADR | Memory Decay Prevention (Aktive Qualitaetssicherung) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-60 | ADR | Session-Summary Zuverlaessigkeit und Observability | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-61 | ADR | Fast Path Execution -- Recipe-gesteuertes Batching | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-62 | ADR | KV-Cache-Optimized Prompt Structure & Provider-Agnostic Caching | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-63 | ADR | Context Externalization -- Dateisystem als erweiterter Kontext | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-64 | ADR | Google Gemini als eigenstaendiger Provider | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-65 | ADR | Ontologie-Schema und Befuellung | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-66 | ADR | Ingest-Strategie (Schema-Erkennung und Entitaets-Zuordnung) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-67 | ADR | Lint-Architektur (Tool, UI und Trigger) | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-68 | ADR | OCR-Provider-Auswahl | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-69 | ADR | Confidence Storage Model | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-70 | ADR | Community Detection Library Selection | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-71 | ADR | Retrieval Integration Pattern | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-72 | ADR | Konfigurierbarer Agent-Storage-Root | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-73 | ADR | MCP-Tool-Argument Type-Safety | Superseded | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-74 | ADR | Dependency-Override-Strategie fuer transitive Vulnerabilities | Accepted | Released |  | ARCH |  |  | 2026-04-30 |  |
| ADR-75 | ADR | Skill-Package-Architektur (Anthropic-kompatibel + Coordinator-Erweiterung) | Accepted | Building |  | ARCH |  |  | 2026-04-30 |  |
| ADR-76 | ADR | - Episode-Fact-Boundary | Accepted | Building | ADR-13, ADR-18, ADR-58, PLAN-01 | ARCH |  |  | 2026-04-30 |  |
| ADR-77 | ADR | - Memory v2 Storage Schema | Accepted | Building | ADR-13, ADR-76, ADR-78, ADR-79 | ARCH |  |  | 2026-04-30 |  |
| ADR-78 | ADR | - URI-Schema fuer Memory-Knoten | Accepted | Building | ADR-77, ADR-79, PLAN-01 | ARCH |  |  | 2026-04-30 |  |
| ADR-79 | ADR | - Knowledge-DB-Haertung | Accepted | Building | ADR-77, ADR-78, PLAN-01 | ARCH |  |  | 2026-04-30 |  |
| ADR-80 | ADR | - Persistenz-Service-Pattern fuer Memory-v2-Setup-Klassen | Accepted | Building | ADR-77, ADR-79, FEAT-03-19, PLAN-01 | ARCH |  |  | 2026-04-30 |  |
| ADR-81 | ADR | - MCP-Tool-Routing + Plugin-Standalone-RPC | Accepted | Building | ADR-80, FEAT-14-04, FEAT-03-19 | ARCH |  |  | 2026-04-30 |  |
| ADR-82 | ADR | - Topic-Inference-Strategie | Accepted | Building | ADR-77, FEAT-03-17, FEAT-03-18 | ARCH |  |  | 2026-04-30 |  |
| ADR-83 | ADR | - Single-Call Tool-Calling Output-Schema | Accepted | Building | ADR-76, ADR-77, FEAT-03-18, FEAT-03-24 | ARCH |  |  | 2026-04-30 |  |
| ADR-84 | ADR | - Engine-Public-API-Versionierung | Accepted | Building | FEAT-03-21, ADR-77, ADR-80 | ARCH |  |  | 2026-04-30 |  |
| ADR-85 | ADR | - Soft-Delete-Cascade | Accepted | Building | FEAT-03-22, ADR-77, ADR-79 | ARCH |  |  | 2026-04-30 |  |
| ADR-86 | ADR | - Inference-Pass-Architektur | Accepted | Building | FEAT-03-24, ADR-77, ADR-83 | ARCH |  |  | 2026-04-30 |  |
| ADR-87 | ADR | - Vault-Note-Memory-Source-Pipeline | Superseded | Released | FEAT-03-25, ADR-77, ADR-78, ADR-85, ADR-109 | ARCH |  |  | 2026-05-03 |  |
| ADR-88 | ADR | ChatGPT OAuth Provider Architecture | Accepted | Building |  | ARCH |  |  | 2026-04-30 |  |
| ADR-89 | ADR | ChatGPT PKCE Loopback OAuth Flow | Accepted | Building |  | ARCH |  |  | 2026-04-30 |  |
| ADR-90 | ADR | Cost-Aware Agent Heuristics | Accepted | Building |  | ARCH |  |  | 2026-04-30 |  |
| ADR-91 | ADR | MCP Pipeline Routing and IgnoreService at Index Build | Accepted | Building |  | ARCH |  |  | 2026-04-30 |  |
| ADR-92 | ADR | Schema-Migration knowledge.db v9 -> v10 (4-Tabellen-Bundle) | Accepted | Building | BA-25, FEAT-15-09, FEAT-15-10, FEAT-15-11, FEAT-15-12 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-93 | ADR | Source-Identitaet-Modell (Domain-only MVP) | Accepted | Building | BA-25, FEAT-15-11, FEAT-19-14, FEAT-19-17 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-94 | ADR | Cluster-Halbwertszeit-Modell (statische Defaults) | Accepted | Building | BA-25, FEAT-15-12, FEAT-19-16 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-95 | ADR | Frontmatter-Write Conflict-Detection | Accepted | Building | BA-25, FEAT-19-09, FEAT-19-10 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-96 | ADR | MOC-Marker-Konvention (HTML-Comment-Marker) | Accepted | Building | BA-25, FEAT-19-11, FEAT-19-26 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-97 | ADR | KV-Cache-Block-Lifecycle (Top-Hub) | Accepted | Building | BA-25, FEAT-03-26 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-98 | ADR | Pre-Triage-Tool-Architektur (eigenes ingest_triage) | Accepted | Building | BA-25, FEAT-19-12 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-99 | ADR | Tension-Detection-Algorithmus (Hybrid Cosine+LLM) | Accepted | Building | BA-25, FEAT-19-13 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-100 | ADR | Dialog-Ingest-State-Storage (ingest_session-Tabelle) | Accepted | Building | BA-25, FEAT-19-22 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-101 | ADR | Output-Modus-Architektur (3 Modi + Folder-Layout + Bibliografie) | Accepted | Building | BA-25, FEAT-19-24, FEAT-19-25, FEAT-19-30 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-102 | ADR | Auto-Trigger-Detection-Mechanik (vault.on-Listener) | Accepted | Building | BA-25, FEAT-19-27 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-103 | ADR | Source-Position-Marker und PDF-Strategie | Accepted | Building | BA-25, FEAT-19-28, FEAT-19-29 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-104 | ADR | Web-Search-Provider-Strategie (BYOK obligatorisch) | Accepted | Building | BA-25, FEAT-19-14, FEAT-19-19, FEAT-19-20 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-105 | ADR | Stufe-3 Job-Runner und Token-Budget-Enforcement | Accepted | Building | BA-25, FEAT-19-20 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-106 | ADR | Health-Modal-Severity und Activity-Trigger-Cooldown | Accepted | Building | BA-25, FEAT-19-18, FEAT-19-19 | ARCH | | sebastian-opus-4.7 @ 2026-05-03 | 2026-05-03 | |
| ADR-107 | ADR | MCP-Memory-Tools Versionierung (V1 deprecaten, V2 als save_to_memory) | Accepted | Released | EPIC-23, BA-26, FEAT-23-01, FEAT-23-05 | ARCH |  |  | 2026-05-03 |  |
| ADR-108 | ADR | Source-Interface-Tagging fuer cross-surface origin tracking | Accepted | Released | EPIC-23, BA-26, FEAT-23-04 | ARCH |  |  | 2026-05-03 |  |
| ADR-109 | ADR | Vault-zu-Memory-Bruecke via Single-Listener-Pattern | Accepted | Released | FEAT-03-25, BA-25, ADR-87 (superseded) | ARCH |  |  | 2026-05-03 |  |
| PLAN-01 | Plan | - Memory v2 Master Plan (Pfad alpha) | Active | Building | ADR-76, ADR-77, ADR-78, ADR-79 | ARCH |  |  | 2026-04-30 |  |
| PLAN-04 | Plan | - Memory v2 Phase 1 Engine Foundation | Active | Building | FEAT-03-15, ADR-76, ADR-77, ADR-80 | ARCH |  |  | 2026-04-30 |  |
| PLAN-05 | Plan | - Memory v2 Phase 2 Migration + Vault-RRF | Draft | Building | FEAT-03-16, ADR-77, ADR-78, ADR-80 | ARCH |  |  | 2026-04-30 |  |
| PLAN-06 | Plan | - Memory v2 Phase 3 Dynamic Context Composition | Draft | Building | FEAT-03-17, ADR-77, ADR-78, ADR-80 | ARCH |  |  | 2026-04-30 |  |
| PLAN-07 | Plan | - Memory v2 Phase 4 Single-Call Update | Draft | Building | FEAT-03-18, ADR-76, ADR-77, ADR-83 | ARCH |  |  | 2026-04-30 |  |
| PLAN-08 | Plan | - Memory v2 Phase 4.5 Agent-Self Layer | Draft | Building | FEAT-03-19, ADR-77, ADR-85 | ARCH |  |  | 2026-04-30 |  |
| PLAN-09 | Plan | - ChatGPT OAuth Provider (EPIC-21) | Active | Building | FEAT-00-21, ADR-88, ADR-89 | ARCH |  |  | 2026-04-30 |  |

---

## Refs and the relation graph

Each row carries the related artifact IDs in its Refs column. The
graph is implicit; no separate file is needed. /consistency-check
derives the graph from these columns. Run `/consistency-check --view`
for a rendered Mermaid graph.
