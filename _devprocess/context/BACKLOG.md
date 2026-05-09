# Backlog obsidian-agent

> Single source of truth for state and the artifact relation graph.
> Status fields live HERE, not in artifact frontmatter.

Last update: 2026-05-08 by /coding (chore/bug-capture-2026-05-08)

---

## Dashboard

| Status | Count | | Phase | Count | | Type | Count |
|---|---|-|---|---|-|---|---|
| Planned | 16 | Released | 358 | Epic | 23 |
| Active | 24 | Building | 52 | Feature | 203 |
| Done | 251 | Planned | 9 | Fix | 55 |
| Accepted | 110 | Candidates | 0 | Improvement | 15 |
| Draft | 12 |  |  | ADR | 110 |
| Open | 5 |  |  | Plan | 13 |
| Proposed | 0 |  |  |  |  |

Total artifacts: 419

---

## Active Epics

### EPIC-01: Core Foundation

Source: `_devprocess/requirements/epics/EPIC-01-core-foundation.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-01-01 | Feature | Agent Core Loop | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/137 |
| FEAT-01-02 | Feature | Core Agent Interaction & Modes | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/138 |
| FEAT-01-03 | Feature | Vault Operations (Full CRUD) | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/139 |
| FEAT-01-04 | Feature | Vault Tools (Read, Write, Intelligence) | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/140 |
| FEAT-01-05 | Feature | Controlled Content Editing | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/141 |
| FEAT-01-06 | Feature | Permissions & Approval | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/142 |
| FEAT-01-07 | Feature | Checkpoints (Undo / Restore) | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/143 |
| FEAT-01-08 | Feature | Operation Logging & Audit Trail | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/144 |
| FEAT-01-09 | Feature | Tool Execution Pipeline | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/145 |
| FEAT-01-10 | Feature | Parallel Tool Execution | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/146 |
| FEAT-01-11 | Feature | Diff Stats Badge | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/147 |
| FEAT-01-12 | Feature | Attachments, Clipboard, and Images | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/148 |
| FIX-01-01-01 | Fix | Anthropic API rejects history with orphaned tool_use blocks | Done | Released | FEAT-01-01, EPIC-01 | BUG |  |  |  | P0  Issue: https://github.com/pssah4/obsilo-dev/issues/68 |
| FIX-01-12-01 | Fix | Drag-and-drop from Obsidian file explorer opens tab instead of attaching | Done | Released | FEAT-01-12, EPIC-01 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/69 |
| FIX-01-07-01 | Fix | 07-01: Checkpoint-Snapshot legt neue Dateien nicht ab -- 'No files staged' trotz newFiles=1 | Open | Building | FEAT-01-07, EPIC-01 | BUG |  |  | 2026-05-08 | P2 Live-Test 2026-05-08 (Logging vs. echter Snapshot-Bug zu validieren)  Issue: https://github.com/pssah4/obsilo-dev/issues/63 |

### EPIC-02: Rules, Workflows & Intelligence

Source: `_devprocess/requirements/epics/EPIC-02-rules-workflows-intelligence.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-02-01 | Feature | Rules | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/149 |
| FEAT-02-02 | Feature | Workflows & Slash Commands | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/150 |
| FEAT-02-03 | Feature | Skills | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/151 |
| FEAT-02-04 | Feature | PAS-1 – Local Skills | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/152 |
| FEAT-02-05 | Feature | VaultDNA — Automatic Plugin Discovery | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/153 |
| FEAT-02-06 | Feature | Autocomplete | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/154 |
| FEAT-02-07 | Feature | Custom Prompts (Slash Command Templates) | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/155 |
| FEAT-02-08 | Feature | Chat History | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/156 |
| FEAT-02-09 | Feature | Modes | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/157 |
| FEAT-02-10 | Feature | Custom Instructions, Custom Modes, and Rules | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/158 |
| FIX-02-04-01 | Fix | Agent nutzt built-in `create_excalidraw` statt Excalidraw-Plugin (Plugin-Routing | Done | Released | FEAT-02-04, EPIC-02 | BUG |  |  |  | P0  Issue: https://github.com/pssah4/obsilo-dev/issues/70 |

### EPIC-03: Context, Memory & Scaling

Source: `_devprocess/requirements/epics/EPIC-03-context-memory-scaling.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-03-01 | Feature | Semantic Search & Index | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/159 |
| FEAT-03-02 | Feature | Keyword Search Upgrade — Stemming + TF-IDF + Word Boundaries | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/160 |
| FEAT-03-03 | Feature | Context Management (Active Files & Tabs) | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/161 |
| FEAT-03-04 | Feature | Memory, Chat History & Personalization | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/162 |
| FEAT-03-05 | Feature | Multi-Agent (new_task) | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/163 |
| FEAT-03-06 | Feature | Context Condensing & Power Steering | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/164 |
| FEAT-03-07 | Feature | Power Steering | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/165 |
| FEAT-03-08 | Feature | Tool Repetition Detection | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/166 |
| FEAT-03-09 | Feature | Canvas & Bases Tools | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/167 |
| FEAT-03-10 | Feature | Global Storage Architecture | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/168 |
| FEAT-03-11 | Feature | Safe Storage (Encrypted API Keys) | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/169 |
| FEAT-03-12 | Feature | Modular System Prompt Architecture | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/170 |
| FEAT-03-13 | Feature | Import Models from Code Snippet | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/171 |
| FEAT-03-14 | Feature | Knowledge-DB-Haertung | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/172 |
| FEAT-03-15 | Feature | Memory-Engine-Foundation | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/173 |
| FEAT-03-16 | Feature | Memory-Migration und Vault-RRF-Quick-Win | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/174 |
| FEAT-03-17 | Feature | Dynamic Context Composition | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/175 |
| FEAT-03-18 | Feature | Single-Call Update Pipeline und Combined Note-Index-Pass | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/176 |
| FEAT-03-19 | Feature | Living Document UX | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/177 |
| FEAT-03-19b | Feature | Agent-Self Layer (Soul, Capabilities, Self-Awareness) | Done | Released | EPIC-03 | BA |  |  |  |  |
| FEAT-03-20 | Feature | History Search ueber alle Konversationen | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/178 |
| FEAT-03-21 | Feature | Engine-Extract zu @obsilo/memory-engine | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/179 |
| FEAT-03-22 | Feature | Privacy und Forget-Right | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/180 |
| FEAT-03-23 | Feature | Memory-UX, Onboarding und Settings-Migration | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/181 |
| FEAT-03-24 | Feature | Inference-Pass fuer Derives | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/182 |
| FEAT-03-25 | Feature | Vault-Note-zu-Fact-Extraction | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/183 |
| FEAT-03-26 | Feature | Selektiver Top-Hub-Block im KV-Cache | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/184 |
| FIX-03-06-01 | Fix | Session-Summary .md-Dateien werden nicht geschrieben | Done | Released | FEAT-03-06, EPIC-03 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/71 |
| FIX-03-06-02 | Fix | Memory-Extractor und Context-Prefix-Generator retry-spammen bei permanenten Prov | Done | Released | FEAT-03-06, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/72 |
| FIX-03-14-01 | Fix | - WriterLock nicht verdrahtet | Done | Released | FEAT-03-14, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/73 |
| FIX-03-14-02 | Fix | - iCloud-Vault Rename nicht cascadiert | Done | Released | FEAT-03-14, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/74 |
| FIX-03-18-01 | Fix | 18-01: SingleCallProcessor budget-exhausted Test schlaegt fehl wegen Mock-Setup | Done | Released | FEAT-03-18, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/75 |
| FIX-03-23-01 | Fix | 23-01: FEAT-03-23 falsch auf Done -- Onboarding-Memory-Step + Coach-Marks fehlen | Done | Released | FEAT-03-23, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/76 |
| FIX-03-25-01 | Fix | 25-01: FEAT-03-25 falsch auf Done -- VaultMemorySourceService fehlt komplett | Done | Released | FEAT-03-25, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/77 |
| FIX-03-26-01 | Fix | 26-01: Settings-UI-Hinweis fuer Top-Hub-Block Privacy-Trade-Off | Done | Released | FEAT-03-26, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/78 |
| FIX-03-26-02 | Fix | 26-02: Top-Hub-Block + andere Settings-Toggles reagieren nach Privacy-Ack nicht  | Done | Released | FEAT-03-26, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/79 |
| IMP-03-17-01 | Improvement | IMP-03-17-01: recall_memory queryFacts auf Cosine ueber fact_embeddings | Planned | Building | FEAT-03-17, EPIC-03 | USER |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/185 |
| IMP-03-18-01 | Improvement | IMP-03-18-01: AgingService Daily-Scheduler | Planned | Building | FEAT-03-18, EPIC-03 | USER |  |  |  |  |
| IMP-03-18-02 | Improvement | IMP-03-18-02: DriftEventBus Subscriber in ExtractionQueue | Planned | Building | FEAT-03-18, EPIC-03 | USER |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/186 |

### EPIC-04: Providers, Web & Localization

Source: `_devprocess/requirements/epics/EPIC-04-providers-web-localization.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-04-00 | Feature | create_pptx Tool | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/187 |
| FEAT-04-01 | Feature | create_docx Tool | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/188  Issue: https://github.com/pssah4/obsilo-dev/issues/189 |
| FEAT-04-01 | Feature | MCP Client & Tools | Done | Released | EPIC-04 | BA |  |  |  |  |
| FEAT-04-02 | Feature | create_xlsx Tool | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/190  Issue: https://github.com/pssah4/obsilo-dev/issues/191 |
| FEAT-04-02 | Feature | Web Tools | Done | Released | EPIC-04 | BA |  |  |  |  |
| FEAT-04-03 | Feature | Providers & Models | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/192 |
| FEAT-04-04 | Feature | Agent Prompt & Skill Update | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/193  Issue: https://github.com/pssah4/obsilo-dev/issues/194 |
| FEAT-04-04 | Feature | Localization (i18n) | Done | Released | EPIC-04 | BA |  |  |  |  |
| FEAT-04-05 | Feature | Conversational Onboarding & Settings-Skill | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/195 |
| FEAT-04-06 | Feature | Notifications | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/196 |
| FEAT-04-07 | Feature | Agent Skill Mastery | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/197 |
| FEAT-04-08 | Feature | Ollama Provider Management | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/198 |
| FEAT-04-09 | Feature | OpenAI-kompatible Streaming Tool-Call Robustheit | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/199 |
| FIX-04-09-01 | Fix | OpenAI Provider verschluckt Tool-Calls bei finish_reason="stop" | Done | Released | FEAT-04-09, EPIC-04 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/80 |
| FIX-04-03-01 | Fix | 03-01: SummaryGenerator umgeht konfigurierten Provider, Anthropic 400 trotz OpenRouter-Setup | Open | Building | FEAT-04-03, EPIC-04, IMP-04-03-01 | BUG |  |  | 2026-05-08 | P1 Live-Test 2026-05-08, Pattern-Wiederkehr von BUG-016, Sub-Issue von IMP-04-03-01  Issue: https://github.com/pssah4/obsilo-dev/issues/60 |
| IMP-04-03-01 | Improvement | 03-01: Provider-Bypass-Audit -- alle direkten LLM-Client-Instanziierungen auf ProviderResolver umstellen | Planned | Building | FEAT-04-03, EPIC-04, FIX-04-03-01 | AUDIT |  |  | 2026-05-08 | P2 Pattern-Audit, Parent von FIX-04-03-01 (#60)  Issue: https://github.com/pssah4/obsilo-dev/issues/65 |

### EPIC-05: Self-Development & Sandbox

Source: `_devprocess/requirements/epics/EPIC-05-self-development-sandbox.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-05-01 | Feature | Spezifikation: Agent Self-Development (Meta-Agent) | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/200 |
| FEAT-05-02 | Feature | Spezifikation: Sandbox OS-Level Process Isolation | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/201 |
| FEAT-05-03 | Feature | Agent Control Tools | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/202 |
| FEAT-05-04 | Feature | Agent Self-Configuration Tools | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/203 |
| FEAT-05-05 | Feature | Plugin API Bridge & Recipe System | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/204 |
| FEAT-05-06 | Feature | Tool Metadata Registry | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/205 |
| FEAT-05-07 | Feature | Konfigurierbarer Agent-Folder | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/206 |
| FEAT-05-08 | Feature | Agent Folder Change Handling (P0/P1/P2) | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/207 |
| FIX-05-02-01 | Fix | Sandbox esbuild integrity hashes stale + vaultList('/') throws | Done | Released | FEAT-05-02, EPIC-05 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/81 |
| FIX-05-02-02 | Fix | SandboxBridge circuit-breaker stays open, permanently blocks evaluate_expression | Done | Released | FEAT-05-02, EPIC-05 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/82 |
| FIX-05-02-03 | Fix | SandboxBridge vault paths with trailing slash return null | Done | Released | FEAT-05-02, EPIC-05 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/83 |

### EPIC-06: Files-to-Chat (Office-Format-Support)

Source: `_devprocess/requirements/epics/EPIC-06-files-to-chat.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-06-01 | Feature | Document Parsing Pipeline | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/208 |
| FEAT-06-02 | Feature | File Picker Erweiterung | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/209 |
| FEAT-06-03 | Feature | Token-Budget-Management | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/210 |
| FEAT-06-04 | Feature | On-Demand Bild-Extraktion | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/211 |
| FEAT-06-05 | Feature | Modell-Kompatibilitäts-Check | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/212 |

### EPIC-07: Chat-Linking (Provenienz & Nachvollziehbarkeit)

Source: `_devprocess/requirements/epics/EPIC-07-chat-linking.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-07-01 | Feature | Chat-Linking | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/213 |
| FEAT-07-02 | Feature | Protocol Handler (Deep-Links) | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/214 |
| FEAT-07-03 | Feature | Auto-Frontmatter-Linking | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/215 |
| FEAT-07-04 | Feature | Semantisches Chat-Titling | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/216 |
| FEAT-07-05 | Feature | Chat-Linking Setting | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/217 |
| FIX-07-03-01 | Fix | ChatLink stampt ungueltiges Frontmatter (YAMLParseError) | Done | Released | FEAT-07-03, EPIC-07 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/84 |

### EPIC-08: Task Management

Source: `_devprocess/requirements/epics/EPIC-08-task-management.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-08-01 | Feature | Task Extraction & Management | Done | Released | EPIC-08 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/218 |

### EPIC-09: Monetarisierung

Source: `_devprocess/requirements/epics/EPIC-09-monetarisierung.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-09-01 | Feature | Obsilo Gateway | Done | Released | EPIC-09 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/219 |
| FEAT-09-02 | Feature | AgentSidebarView Refactoring | Done | Released | EPIC-09 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/220 |

### EPIC-10: Office Document Creation

Source: `_devprocess/requirements/epics/EPIC-10-office-document-creation.md`
Phase: Released | Status: Done

(Container epic. Office creation tools `create_pptx`, `create_docx`, `create_xlsx`
track under EPIC-11 features and FEAT-04-00 to FEAT-04-02. No standalone
FEAT-10-XX rows.)

### EPIC-11: Office Document Quality -- Template Design Intelligence

Source: `_devprocess/requirements/epics/EPIC-11-office-document-quality.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-11-00 | Feature | PPTX Template-Engine (JSZip + OOXML) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/221 |
| FEAT-11-01 | Feature | Default PPTX Templates | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/222 |
| FEAT-11-02 | Feature | Pre-Creation Dialog & Template-Upload | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/223 |
| FEAT-11-03 | Feature | Theme-Extraktion (vereinfacht) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/224 |
| FEAT-11-05 | Feature | Universelle Design-Prinzipien (Skill-Erweiterung) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/225 |
| FEAT-11-08 | Feature | In-Plugin Template-Analyzer (Spatial Analysis + Skill-Generierung) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/226 |
| FEAT-11-10 | Feature | Shape-Name-Matching (Strategy S0) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/227 |
| FEAT-11-11 | Feature | Visual Design Language Document (Skill-Format) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/228 |
| FEAT-11-12 | Feature | Multimodaler Template-Analyzer (Cloud Run Backend) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/229 |
| FEAT-11-13 | Feature | Template-Analyzer Web-Frontend (obsilo.ai) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/230 |
| FEAT-11-14 | Feature | Template Gallery (Community) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/231 |
| FEAT-11-15 | Feature | Visual Intelligence | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/232 |
| FEAT-11-16 | Feature | Schema-Constrained Slide Generation | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/233 |
| FEAT-11-17 | Feature | plan_presentation Tool | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/234 |
| FEAT-11-18 | Feature | Catalog-Enrichment (special_role, group_id, vollstaendige Beispiele) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/235 |

### EPIC-12: GitHub Copilot LLM Provider Integration

Source: `_devprocess/requirements/epics/EPIC-12-github-copilot-provider.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-12-01 | Feature | GitHub Copilot Auth & Token Management | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/236 |
| FEAT-12-02 | Feature | Copilot Chat Completions Provider | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/237 |
| FEAT-12-03 | Feature | Copilot Settings UI Integration | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/238 |
| FEAT-12-04 | Feature | Copilot Embedding Support | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/239 |
| FEAT-12-05 | Feature | Dynamic Copilot Model Listing | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/240 |
| FEAT-12-06 | Feature | GitHub Copilot Modern Model Compatibility (max_completion_tokens) | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/241 |
| FIX-12-06-01 | Fix | GitHub Copilot Provider lehnt max_tokens fuer neuere Modelle ab | Done | Released | FEAT-12-06, EPIC-12 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/85 |

### EPIC-13: Kilo Gateway LLM Provider Integration

Source: `_devprocess/requirements/epics/EPIC-13-kilo-gateway-provider.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-13-01 | Feature | Kilo Auth & Session Management | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/242 |
| FEAT-13-02 | Feature | Kilo Gateway Chat Provider | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/243 |
| FEAT-13-03 | Feature | Kilo Settings UI Integration | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/244 |
| FEAT-13-04 | Feature | Kilo Dynamic Model Listing | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/245 |
| FEAT-13-05 | Feature | Kilo Organization Context | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/246 |
| FEAT-13-06 | Feature | Kilo Embedding Support | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/247 |
| FEAT-13-07 | Feature | Kilo Manual Token Mode | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/248 |

### EPIC-14: MCP Connector

Source: `_devprocess/requirements/epics/EPIC-14-mcp-connector.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-14-00 | Feature | MCP Server Core (stdio) | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/249 |
| FEAT-14-01 | Feature | Tool-Tier-Mapping | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/250 |
| FEAT-14-02 | Feature | MCP Server Settings UI | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/251 |
| FEAT-14-03 | Feature | Remote Transport (Cloudflare Relay) | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/252 |
| FEAT-14-04 | Feature | Remote Authentication | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/253 |
| FEAT-14-05 | Feature | MCP Resources | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/254 |
| FEAT-14-06 | Feature | MCP Prompts (System-Prompt-Ersatz) | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/255 |
| FEAT-14-07 | Feature | Plugin Skill Discovery | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/256 |
| FEAT-14-08 | Feature | Remote Approval Pipeline | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/257 |
| FEAT-14-09 | Feature | Connectors Directory Submission | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/258 |
| FEAT-14-10 | Feature | Sandbox Exposure via MCP | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/259 |
| FEAT-14-11 | Feature | Memory Transparency (Agent vs. Human) | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/260 |
| FIX-14-03-01 | Fix | 03-01: Relay-Poll laeuft endlos in Backoff weil Cloudflare Worker mit HTTP 429 + | Done | Released | FEAT-14-03, EPIC-14 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/86 |
| FIX-14-03-02 | Fix | 03-02: RelayClient verschluckt Poll-Fehler komplett, Diagnose nur ueber Browser- | Done | Released | FEAT-14-03, EPIC-14 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/87 |
| FIX-14-03-03 | Fix | 03-03: MCP Cloudflare-Worker-Connect schlaegt aus Settings UI fehl | Open | Building | FEAT-14-03, EPIC-14 | BUG |  |  | 2026-05-08 | P1 Live-Test 2026-05-08, Fehlermeldung wird im Issue nachgereicht  Issue: https://github.com/pssah4/obsilo-dev/issues/64 |

### EPIC-15: Unified Knowledge Layer

Source: `_devprocess/requirements/epics/EPIC-15-knowledge-layer.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-15-00 | Feature | SQLite Knowledge DB | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/261 |
| FEAT-15-01 | Feature | Enhanced Vector Retrieval | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/262 |
| FEAT-15-02 | Feature | Graph Data Extraction & Expansion | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/263 |
| FEAT-15-03 | Feature | Implicit Connection Discovery | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/264 |
| FEAT-15-04 | Feature | Local Reranking | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/265 |
| FEAT-15-05 | Feature | Knowledge Data Consolidation | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/266 |
| FEAT-15-06 | Feature | Implicit Connection UI | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/267 |
| FEAT-15-08 | Feature | Storage Consolidation | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/268 |
| FEAT-15-09 | Feature | Note-Summary Storage | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/269 |
| FEAT-15-10 | Feature | Frontmatter-Property Mirror | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/270 |
| FEAT-15-11 | Feature | Cluster-Source-Stats fuer Source-Diversity-Tracking | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/271 |
| FEAT-15-12 | Feature | Cluster-Metadata mit Halbwertszeit-Konfiguration | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/272 |
| FIX-15-00-01 | Fix | KnowledgeDB Korruption durch nicht-atomare Writes + Cloud Sync | Done | Released | FEAT-15-00, EPIC-15 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/88 |
| FIX-15-03-01 | Fix | ImplicitConnections "Statement closed" Race Condition | Done | Released | FEAT-15-03, EPIC-15 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/89 |
| FIX-15-04-01 | Fix | Reranker ONNX-Runtime Fehler in Electron | Done | Released | FEAT-15-04, EPIC-15 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/90 |
| FIX-15-01-01 | Fix | 01-01: SemanticIndex sendet pro Chunk einen texts=1 Embedding-Call statt Batches | Open | Building | FEAT-15-01, EPIC-15 | BUG |  |  | 2026-05-08 | P1 Live-Test 2026-05-08, 500+ Single-Embed-Calls pro Note, Performance/Kosten  Issue: https://github.com/pssah4/obsilo-dev/issues/61 |

### EPIC-16: Claude Code Pattern Adoption

Source: `_devprocess/requirements/epics/EPIC-16-claude-code-pattern-adoption.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-16-00 | Feature | Deferred Tool Loading | Done | Released | EPIC-16 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/273 |

### EPIC-17: Website-Dokumentation & Roadmap

Source: `_devprocess/requirements/epics/EPIC-17-website-documentation.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-17-00 | Feature | SSG-Migration & Grundgeruest | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/274 |
| FEAT-17-01 | Feature | User Guide -- Informationsarchitektur & Content | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/275 |
| FEAT-17-02 | Feature | Obsilo Doku-Skill | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/276 |
| FEAT-17-03 | Feature | Developer Docs -- Update & Erweiterung | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/277 |
| FEAT-17-04 | Feature | Homepage -- Roadmap & Versions-Log | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/278 |
| FEAT-17-05 | Feature | Homepage -- Hero & Messaging Update | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/279 |
| FEAT-17-06 | Feature | Design-Ueberarbeitung (Best-in-Class) | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/280 |
| FEAT-17-07 | Feature | DE Uebersetzung | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/281 |

### EPIC-18: Token-Kostenreduktion

Source: `_devprocess/requirements/epics/EPIC-18-token-cost-reduction.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-18-00 | Feature | Fast Path Execution | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/282 |
| FEAT-18-01 | Feature | Prompt Caching (Provider-agnostisch) | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/283 |
| FEAT-18-02 | Feature | Context Externalization (Dateisystem als Kontext) | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/284 |
| FEAT-18-03 | Feature | Cross-Platform TMP-Pfade fuer Context Externalization | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/285 |
| FEAT-18-04 | Feature | Cost-Aware Agent Heuristics | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/286 |
| FIX-18-03-01 | Fix | TMP-Files nicht lesbar auf Windows (Pfad-Trennzeichen) | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/91 |
| FIX-18-03-02 | Fix | read_file cannot open externalised tool results under tmp/ | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/92 |
| FIX-18-03-03 | Fix | Externalise cleanup fails with EPERM on iCloud-synced vaults | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/93 |
| FIX-18-03-04 | Fix | FastPath planner JSON parse fails -- recipe aborts mid-task | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/94 |
| FIX-18-04-01 | Fix | Streaming Tool-Error verschluckt + edit_file-Schleife bei grossen Diffs | Done | Released | FEAT-18-04, EPIC-18 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/95 |
| FIX-18-02-01 | Fix | 02-01: PDF tool_result mehrfach im Hauptkontext, Context Externalization (ADR-063) greift bei PDF-Attachments nicht | Open | Building | FEAT-18-02, EPIC-18, ADR-063 | BUG |  |  | 2026-05-08 | P1 Live-Test 2026-05-08, ~114k Tokens fuer ein PDF in 3 Messages parallel  Issue: https://github.com/pssah4/obsilo-dev/issues/62 |

### EPIC-19: Knowledge Maintenance

Source: `_devprocess/requirements/epics/EPIC-19-knowledge-maintenance.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-19-00 | Feature | Knowledge Ingest Skill | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/66 |
| FEAT-19-01 | Feature | Vault Health Check (Lint) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/13 |
| FEAT-19-02 | Feature | Knowledge Ontologie | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/14 |
| FEAT-19-03 | Feature | Template-Onboarding | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/15 |
| FEAT-19-04 | Feature | Synthese → Zettel | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/16 |
| FEAT-19-05 | Feature | OCR-Integration | Planned | Planned | EPIC-19 | BA |  |  | | Spec ohne Code (Audit 2026-05-07) Issue: https://github.com/pssah4/obsilo-dev/issues/17 |
| FEAT-19-06 | Feature | Attachment-Batch-Umbenennung | Planned | Planned | EPIC-19 | BA |  |  | | Spec ohne Code (Audit 2026-05-07) Issue: https://github.com/pssah4/obsilo-dev/issues/18 |
| FEAT-19-07 | Feature | Chat UI Polish | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/19 |
| FEAT-19-08 | Feature | Konfigurierbarer Standard-Prompt fuer Note-Summary-Generierung | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/20 |
| FEAT-19-09 | Feature | Auto-Summary-Generierung beim Indexing | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/21 |
| FEAT-19-10 | Feature | Frontmatter-Write Toggle plus Backfill-Job | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/22 |
| FEAT-19-11 | Feature | Aktive MOC-File-Pflege mit Marker-Konvention | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/23 |
| FEAT-19-12 | Feature | Pre-Triage-Tool mit 10s-Triage-Karte | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/24 |
| FEAT-19-13 | Feature | Tension-Detection beim Deep-Ingest | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/25 |
| FEAT-19-14 | Feature | Concentration-Warning UI plus Anti-Echo-Vorschlag | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/26 |
| FEAT-19-15 | Feature | Inbox-Workflow fuer Batch-Triage | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/27 |
| FEAT-19-16 | Feature | Stufe-1 Composite-Freshness-Score als VaultHealth-Check | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/28 |
| FEAT-19-17 | Feature | Source-Diversity-Check als Bias-Lint-Kategorie | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/29 |
| FEAT-19-18 | Feature | Health-Modal-Erweiterung mit kontext-spezifischen Action-Buttons | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/30 |
| FEAT-19-19 | Feature | Stufe-2 Activity-Trigger plus Web-Search-Update-Pass | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/31  Issue: https://github.com/pssah4/obsilo-dev/issues/67 |
| FEAT-19-20 | Feature | Stufe-3 Periodischer Job plus Token-Budget-Cap plus Notifications | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/32 |
| FEAT-19-21 | Feature | Hot-Cluster-Konfiguration in Settings | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/33 |
| FEAT-19-22 | Feature | Aktiver Dialog-Ingest-Modus (Modus A) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/34 |
| FEAT-19-23 | Feature | Auto-Ingest-Modus (Modus B) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/35 |
| FEAT-19-24 | Feature | Output-Modus-Auswahl | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/36 |
| FEAT-19-25 | Feature | Source-Folder vs Wissens-Folder Konfiguration | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/37 |
| FEAT-19-26 | Feature | Dialog-getriebener MOC-Page-Update beim Ingest | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/38 |
| FEAT-19-27 | Feature | Konfigurierbarer Auto-Trigger via Frontmatter-Property | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/39 |
| FEAT-19-28 | Feature | Source-Position-Marker (Block-Refs MD, Page-Refs PDF, Anchor URL) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/40 |
| FEAT-19-29 | Feature | PDF-Strategie (Page-Refs Default vs Markdown-Mirror opt-in) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/41 |
| FEAT-19-30 | Feature | Bibliographische Summary-Note mit Base-Block fuer Multi-Zettel-Modus | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/42 |
| FIX-19-01-01 | Fix | vault_health_check and ingest_document missing from builtin mode tool groups | Done | Released | FEAT-19-01, EPIC-19 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/43 |
| FIX-19-01-02 | Fix | Vault-health badge disappeared + redesign to heart-pulse icon | Done | Released | FEAT-19-01, EPIC-19 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/44 |
| FIX-19-12-02 | Fix | 12-02: URL-Sanitizer in IngestTriageLogStore (Query-Params strippen) | Done | Released | FEAT-19-12, EPIC-19 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/45 |
| FIX-19-27-01 | Fix | 27-01: Rate-Limit fuer AutoTriggerObserver gegen vault.on-Storm | Done | Released | FEAT-19-27, EPIC-19 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/46 |
| FIX-19-28-01 | Fix | 28-01: Sense-Making-Note enthaelt keine Source-Position-Marker (Page-Refs / Block-Refs fehlen im Default-Pfad) | Active | Building | FEAT-19-28, EPIC-19 | BUG |  |  | 2026-05-08 | P0 Tool-Group-Drift behoben (ingest_deep+ingest_triage in edit-group), Default output_mode=source-only. Skill-Spec-Update + Live-Test ausstehend. Issue#11 PLAN-15  Issue: https://github.com/pssah4/obsilo-dev/issues/47 |
| FIX-19-28-03 | Fix | 28-03: Mirror-Markdown ist UTF-8-Mojibake (Geschaeftsbericht statt Geschaeftsbericht, Euro-Zeichen kaputt) | Active | Building | FEAT-19-28, EPIC-19, ADR-103, FIX-19-28-01 | BUG |  |  | 2026-05-08 | P1 Folge-Symptom Tool-Group-Drift, sollte mit FIX-19-28-01 verschwinden. Live-Test ausstehend.  Issue: https://github.com/pssah4/obsilo-dev/issues/96 |
| FIX-19-28-04 | Fix | 28-04: PdfMarkdownMirror deckt nur 1-135 von 410 Seiten ab (User erwartet vollen Mirror, kein selektiver Filter dokumentiert) | Active | Building | FEAT-19-28, EPIC-19, ADR-103, FIX-19-28-01 | BUG |  |  | 2026-05-08 | P1 Folge-Symptom Tool-Group-Drift, sollte mit FIX-19-28-01 verschwinden. Live-Test ausstehend.  Issue: https://github.com/pssah4/obsilo-dev/issues/97 |
| FIX-19-31-02 | Fix | 31-02: Tool-Result-Doubles im Chat-Transkript bei /ingest-deep (jedes content-Block erscheint zweimal) | Open | Building | FEAT-19-31, EPIC-19 | BUG |  |  | 2026-05-08 | P2 Diagnose-pending Live-Test 2026-05-08  Issue: https://github.com/pssah4/obsilo-dev/issues/98 |
| FIX-19-28-02 | Fix | 28-02: Chat-Attachments leben nur 1 Turn -- ingest_document attachment_index schlaegt ab Turn 2 fehl, Skill rutscht in Retry-Loop (~12 EUR Token-Cost) | Active | Building | FEAT-19-28, FEAT-19-31, EPIC-19 | BUG |  |  | 2026-05-07 | P1 Live-Test 2026-05-07 (Skill v2 + Tool-Errormsg landed, persistent-attachment-state als IMP separat)  Issue: https://github.com/pssah4/obsilo-dev/issues/57 |
| IMP-19-31-01 | Improvement | 31-01: User-konfigurierbare Note-Templates fuer /ingest, /ingest-deep, /meeting-summary (Settings-UI + bundled defaults) | Done | Building | FEAT-19-31, EPIC-19 | AUDIT |  |  | 2026-05-07 | P1 Live-Test 2026-05-07  Issue: https://github.com/pssah4/obsilo-dev/issues/58 |
| FEAT-19-31 | Feature | Ingest- und Synthese-Skill-Suite (/ingest-deep, /ingest, /meeting-summary) | Done | Building | EPIC-19, ADR-103, FIX-19-28-01 | BA |  |  | | Issue#11 (3 SKILL.md in bundled-skills/, embed-assets 9->12, vault-deploy ok)  Issue: https://github.com/pssah4/obsilo-dev/issues/49 |
| IMP-19-08-01 | Improvement | 08-01: Strukturierter Output-Parser fuer Summary-Prompt (Keywords/Themen/Konzepte) | Planned | Planned | FEAT-19-08, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/obsilo-dev/issues/50 |
| IMP-19-13-01 | Improvement | 13-01: TensionDetector default-instanziiert im IngestDeepTool-Produktpfad | Planned | Planned | FEAT-19-13, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/obsilo-dev/issues/51 |
| IMP-19-15-01 | Improvement | 15-01: Bulk-UI fuer Triage-Inbox-Tab im Vault-Health-Modal | Planned | Planned | FEAT-19-15, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/obsilo-dev/issues/52 |
| IMP-19-19-01 | Improvement | 19-01: Stufe-2-Klick startet Web-Pass direkt (statt nur @anti_echo_search-Hint) | Planned | Planned | FEAT-19-19, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/obsilo-dev/issues/53 |
| IMP-19-20-01 | Improvement | IMP-19-20-01: Stufe3PeriodicJob state-Persistierung in DB | Planned | Building | FEAT-19-20, EPIC-19 | USER |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/48 |
| IMP-19-22-01 | Improvement | 22-01: planGenerator LLM-Hook + Multi-Turn-Dialog im IngestDeepTool | Planned | Planned | FEAT-19-22, ADR-100, EPIC-19 | AUDIT |  |  | 2026-05-07 | P1 Audit2026-05-07  Issue: https://github.com/pssah4/obsilo-dev/issues/54 |
| IMP-19-23-01 | Improvement | 23-01: Auto-Modus mit echtem LLM-Plan (nicht Stub-Default) | Planned | Planned | FEAT-19-23, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 abh.IMP-19-22-01  Issue: https://github.com/pssah4/obsilo-dev/issues/55 |
| IMP-19-25-01 | Improvement | 25-01: Settings-UI fuer Sources- und Knowledge-Folder | Planned | Planned | FEAT-19-25, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/obsilo-dev/issues/56 |

### EPIC-20: Graph Intelligence

Source: `_devprocess/requirements/epics/EPIC-20-graph-intelligence.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-20-01 | Feature | Confidence Scoring | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/287 |
| FEAT-20-02 | Feature | Community Detection (Louvain) | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/288 |
| FEAT-20-03 | Feature | God-Node Analysis | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/289 |
| FEAT-20-04 | Feature | Retrieval Quality Improvements | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/290 |
| FEAT-20-05 | Feature | Batch Ingest | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/291 |
| FEAT-20-06 | Feature | Knowledge Freshness | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/292 |

### EPIC-21: ChatGPT OAuth Provider

Source: `_devprocess/requirements/epics/EPIC-21-chatgpt-oauth-provider.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-21-01 | Feature | ChatGPT OAuth Lifecycle (PKCE, Loopback, Refresh) | Done | Released | EPIC-21 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/293 |
| FEAT-21-02 | Feature | Codex Responses-API Handler | Done | Released | EPIC-21 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/294 |
| FEAT-21-03 | Feature | Settings-UI mit "Mit ChatGPT anmelden" | Done | Released | EPIC-21 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/295 |

### EPIC-22: Skill-Package Ecosystem (Anthropic-kompatibel)

Source: `_devprocess/requirements/epics/EPIC-22-skill-package-ecosystem.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-22-01 | Feature | Skill-Folder-Struktur (SKILL.md + Subfolders) | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/296 |
| FEAT-22-02 | Feature | Universal Skill-Import (.md / Folder / .skill-Zip) | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/297 |
| FEAT-22-03 | Feature | Scripts-im-Skill (Sandbox-Aufruf) | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/298 |
| FEAT-22-04 | Feature | Coordinator-Skill (Multi-Rolle in einem Ordner) | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/299 |
| FEAT-22-05 | Feature | Slash Skill Autocomplete | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/300 |
| FEAT-22-06 | Feature | Inline @-Reference | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/301 |
| FEAT-22-07 | Feature | Prefix Split + `+` Menu Integration | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/302 |
| FIX-22-07-01 | Fix | Sidebar view crashes during BRAT hot-reload (opens before doLoad) | Done | Released | FEAT-22-07, EPIC-22 | BUG |  |  |  | P0  Issue: https://github.com/pssah4/obsilo-dev/issues/99 |

### EPIC-23: Cross-Surface AI Workflow

Source: `_devprocess/requirements/epics/EPIC-23-cross-surface-ai-workflow.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-23-01 | Feature | save_to_memory + save_conversation MCP-Tools | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/303 |
| FEAT-23-02 | Feature | recall_memory + search_history MCP-Tools | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/304 |
| FEAT-23-03 | Feature | History-Sidebar Source-Tabs + Read-Only-View | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/305 |
| FEAT-23-04 | Feature | Source-Interface-Tagging + Settings Cross-Surface-Sync | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/306 |
| FEAT-23-05 | Feature | update_memory V1-Deprecation + Migrations-Helper | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/307 |
| FEAT-23-06 | Feature | Memory-Profile-System (Wiedervorlage) | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/308 |
| FIX-23-01-01 | Fix | 01-01: save_conversation Living-Document-Semantik + Cross-Interface-Thread-Klamm | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P0  Issue: https://github.com/pssah4/obsilo-dev/issues/100 |
| FIX-23-01-02 | Fix | 01-02: sync_session ohne source_interface landet im falschen Tab | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/101 |
| FIX-23-01-03 | Fix | 01-03: Auto-Session-Tracking erzeugt Duplikat-Eintrag bei EPIC-23 Tools | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/102  Issue: https://github.com/pssah4/obsilo-dev/issues/311 |
| FIX-23-01-04 | Fix | 01-04: ensureSession erzeugt leere ConversationStore-Row bei jedem MCP-Call -> l | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/103 |
| FIX-23-01-05 | Fix | 01-05: save_conversation per-message-size-cap (DoS-Vektor, AUDIT-015 H-1) | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/104 |
| FIX-23-04-01 | Fix | 04-01: Perplexity MCP-Connect schlaegt mit "Unexpected content type" fehl | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/obsilo-dev/issues/105 |
| FIX-23-04-02 | Fix | 04-02: MCP Rate-Limiter (sliding window, AUDIT-015 M-1) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/106 |
| FIX-23-04-03 | Fix | 04-03: sanitizeVaultContentForLLM gegen Prompt-Injection im memorySourceHook (AU | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/107 |
| FIX-23-04-04 | Fix | 04-04: strictSourceIsolation Setting fuer recall_memory + search_history (AUDIT- | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/108 |
| FIX-23-04-05 | Fix | 04-05: sync_session per-message-cap + transcript-length-limit (AUDIT-016 H-1) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/109 |
| FIX-23-04-06 | Fix | 04-06: write_vault content-length cap (AUDIT-016 M-1) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/110 |
| FIX-23-04-07 | Fix | 04-07: search_history LIKE-wildcard escape (AUDIT-016 M-2) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/111 |
| FIX-23-04-08 | Fix | 04-08: get_context strictSourceIsolation gating (AUDIT-016 M-3) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/112 |
| FIX-23-04-09 | Fix | 04-09: ConversationStore.generateId crypto.randomUUID (AUDIT-016 M-4) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/113 |
| FIX-23-04-10 | Fix | 04-10: ActiveMcpSessions ohne Hash + cosine NaN-Guard + OutputModeGenerator inst | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/obsilo-dev/issues/114 |
| IMP-23-01-01 | Improvement | IMP-23-01-01: Eval-Coverage Pass: MCP-Tool-Handlers + Vault-Tools + FrontmatterI | Planned | Building | FEAT-23-01, EPIC-23 | USER |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/309 |
| IMP-23-04-05 | Improvement | IMP-23-04-05: relay /poll partitioniert pro Plugin-Session (AUDIT-016 L-4, defer | Planned | Building | FEAT-23-04, EPIC-23 | USER |  |  |  |   Issue: https://github.com/pssah4/obsilo-dev/issues/310 |

## Cross-cutting (ADRs, Plans, no Epic)

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| ADR-01 | ADR | Zentrale ToolExecutionPipeline für alle Tool-Aufrufe | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-02 | ADR | isomorphic-git für Checkpoints (Shadow Repository) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-03 | ADR | vectra + Xenova Transformers für lokalen Semantic Index | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-04 | ADR | Mode-basierte Tool-Filterung via Tool-Gruppen | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-05 | ADR | Fail-Closed Approval (kein Callback = Ablehnung) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-06 | ADR | Sliding Window für Tool-Repetition-Erkennung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-07 | ADR | Event Separation — Completion Signals vs. Text Output | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-08 | ADR | Modular Prompt Sections & Central Tool Metadata | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-09 | ADR | PAS-1 – Local Skills | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-10 | ADR | Permissions Audit — Auto-Approval Wiring | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-100 | ADR | Dialog-Ingest-State-Storage (ingest_session-Tabelle) | Accepted | Released | FEAT-19-22 | ARCH |  |  |  |  |
| ADR-101 | ADR | Output-Modus-Architektur | Accepted | Released | FEAT-19-24, FEAT-19-25, FEAT-19-30 | ARCH |  |  |  |  |
| ADR-102 | ADR | Auto-Trigger-Detection-Mechanik (vault.on-Listener) | Accepted | Released | FEAT-19-27 | ARCH |  |  |  |  |
| ADR-103 | ADR | Source-Position-Marker und PDF-Strategie | Accepted | Released | FEAT-19-28, FEAT-19-29 | ARCH |  |  |  |  |
| ADR-104 | ADR | Web-Search-Provider-Strategie (BYOK obligatorisch) | Accepted | Released | FEAT-19-14, FEAT-19-19, FEAT-19-20, FEAT-04-02 | ARCH |  |  |  |  |
| ADR-105 | ADR | Stufe-3 Job-Runner und Token-Budget-Enforcement | Accepted | Released | FEAT-19-20, FEAT-19-21 | ARCH |  |  |  |  |
| ADR-106 | ADR | Health-Modal-Severity-Modell und Activity-Trigger-Cooldown | Accepted | Released | FEAT-19-18, FEAT-19-19 | ARCH |  |  |  |  |
| ADR-107 | ADR | MCP-Memory-Tools Versionierung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-108 | ADR | Source-Interface-Tagging | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-109 | ADR | Vault-zu-Memory-Bruecke via Single-Listener-Pattern | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-11 | ADR | Multi-Provider API Architecture (Adapter Pattern) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-110 | ADR | Living-Document-Semantik + Cross-Interface-Thread-Klammer | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-12 | ADR | Context Condensing Strategy (Keep-First-Last) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-13 | ADR | 3-Tier Memory Architecture (Chat -> Session -> Long-Term) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-14 | ADR | VaultDNA — Automatische Plugin-Erkennung als Skills | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-15 | ADR | Hybrid Search mit Semantic + BM25 + RRF Fusion | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-16 | ADR | Rich Tool Descriptions in ToolMeta | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-17 | ADR | Procedural Skill Recipes | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-18 | ADR | Episodic Task Memory | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-19 | ADR | Electron safeStorage fuer API-Key-Verschluesselung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-20 | ADR | Global Storage Architecture mit Sync Bridge | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-21 | ADR | OS-Level Sandbox via child_process.fork() | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-22 | ADR | Chat-Linking via Pipeline Post-Write Hook | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-23 | ADR | Document Parser als wiederverwendbare Tools | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-24 | ADR | Parsing-Library-Auswahl fuer Office-Formate | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-25 | ADR | On-Demand Bild-Nachlade-Strategie | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-26 | ADR | Post-Processing Hook fuer Task Extraction | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-27 | ADR | Task-Note Frontmatter Schema | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-28 | ADR | Base-Erstellung und optionale Plugin-Integration fuer Task Extraction | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-29 | ADR | Input-Schema-Design fuer Office-Creation-Tools | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-30 | ADR | Library-Selection fuer Office-Format-Erzeugung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-31 | ADR | Binary-Write-Pattern fuer Office-Format-Dateien | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-32 | ADR | Template-basierte PPTX-Erzeugung (JSZip + OOXML) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-33 | ADR | Multimodaler Template-Analyzer (Cloud Run + BYOK) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-34 | ADR | Visual Design Language Document als Skill-Format | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-35 | ADR | Visual Intelligence -- Lokale Qualitaetskontrolle und Agent-basierte Template-An | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-36 | ADR | GitHub Copilot Streaming Strategy | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-37 | ADR | GitHub Copilot Provider Architecture | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-38 | ADR | Copilot Token Storage in Settings | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-39 | ADR | Copilot Content Normalization Strategy | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-40 | ADR | Kilo Gateway Provider Architecture | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-41 | ADR | Kilo Auth and Session Architecture | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-42 | ADR | Kilo Metadata Discovery Strategy | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-43 | ADR | Kilo Embedding Gating Strategy | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-44 | ADR | CSS-SVG Slide Engine (Ablösung PPTX Template Analyzer) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-45 | ADR | pptx-automizer Template Pipeline (Abloesung CSS-SVG Engine) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-46 | ADR | Direct Template Mode (Abloesung Composition-Abstraktion) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-47 | ADR | Schema-Constrained Slide Generation | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-48 | ADR | plan_presentation Pipeline -- Content-Transformation auf Tool-Ebene | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-49 | ADR | Raw XML Clear + Generate (Abloesung modifyElement fuer Content) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-50 | ADR | SQLite Knowledge DB (sql.js WASM) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-51 | ADR | 4-Stufen Retrieval-Pipeline | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-52 | ADR | Local Reranker Integration | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-53 | ADR | MCP Server Prozess-Architektur | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-54 | ADR | MCP Tool-Mapping & System-Prompt-Uebertragung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-55 | ADR | Remote MCP Relay via Cloudflare Workers + Durable Objects | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-56 | ADR | Static Site Generator fuer Website-Dokumentation | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-57 | ADR | Informationsarchitektur & Seitenstruktur | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-58 | ADR | Semantic Recipe Promotion (Intent-basiert statt Sequenz-basiert) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-59 | ADR | Memory Decay Prevention (Aktive Qualitaetssicherung) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-60 | ADR | Session-Summary Zuverlaessigkeit und Observability | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-61 | ADR | Fast Path Execution -- Recipe-gesteuertes Batching | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-62 | ADR | KV-Cache-Optimized Prompt Structure & Provider-Agnostic Caching | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-63 | ADR | Context Externalization -- Dateisystem als erweiterter Kontext | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-64 | ADR | Google Gemini als eigenstaendiger Provider | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-65 | ADR | Ontologie-Schema und Befuellung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-66 | ADR | Ingest-Strategie (Schema-Erkennung und Entitaets-Zuordnung) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-67 | ADR | Lint-Architektur (Tool, UI und Trigger) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-68 | ADR | OCR-Provider-Auswahl | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-69 | ADR | Confidence Storage Model | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-70 | ADR | Community Detection Library Selection | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-71 | ADR | Retrieval Integration Pattern | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-72 | ADR | Konfigurierbarer Agent-Storage-Root | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-73 | ADR | MCP-Tool-Argument Type-Safety | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-74 | ADR | Dependency-Override-Strategie fuer transitive Vulnerabilities | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-75 | ADR | Skill-Package-Architektur (Anthropic-kompatibel + Coordinator-Erweiterung) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-76 | ADR | - Episode-Fact-Boundary | Accepted | Released | ADR-13, ADR-18, ADR-58, PLAN-01 | ARCH |  |  |  |  |
| ADR-77 | ADR | - Memory v2 Storage Schema | Accepted | Released | ADR-13, ADR-76, ADR-78, ADR-79 | ARCH |  |  |  |  |
| ADR-78 | ADR | - URI-Schema fuer Memory-Knoten | Accepted | Released | ADR-77, ADR-79, PLAN-01 | ARCH |  |  |  |  |
| ADR-79 | ADR | - Knowledge-DB-Haertung | Accepted | Released | ADR-77, ADR-78, PLAN-01 | ARCH |  |  |  |  |
| ADR-80 | ADR | - Persistenz-Service-Pattern fuer Memory-v2-Setup-Klassen | Accepted | Released | ADR-77, ADR-79, FEAT-03-19, PLAN-01 | ARCH |  |  |  |  |
| ADR-81 | ADR | - MCP-Tool-Routing + Plugin-Standalone-RPC | Accepted | Released | ADR-80, FEAT-14-04, FEAT-03-19 | ARCH |  |  |  |  |
| ADR-82 | ADR | - Topic-Inference-Strategie | Accepted | Released | ADR-77, FEAT-03-17, FEAT-03-18 | ARCH |  |  |  |  |
| ADR-83 | ADR | - Single-Call Tool-Calling Output-Schema | Accepted | Released | ADR-76, ADR-77, FEAT-03-18, FEAT-03-24 | ARCH |  |  |  |  |
| ADR-84 | ADR | - Engine-Public-API-Versionierung | Accepted | Released | FEAT-03-21, ADR-77, ADR-80 | ARCH |  |  |  |  |
| ADR-85 | ADR | - Soft-Delete-Cascade | Accepted | Released | FEAT-03-22, ADR-77, ADR-79 | ARCH |  |  |  |  |
| ADR-86 | ADR | - Inference-Pass-Architektur | Accepted | Released | FEAT-03-24, ADR-77, ADR-83 | ARCH |  |  |  |  |
| ADR-87 | ADR | - Vault-Note-Memory-Source-Pipeline | Accepted | Released | FEAT-03-25, ADR-77, ADR-78, ADR-85 | ARCH |  |  |  |  |
| ADR-88 | ADR | ChatGPT OAuth Provider Architecture | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-89 | ADR | ChatGPT PKCE Loopback OAuth Flow | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-90 | ADR | Cost-Aware Agent Heuristics | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-91 | ADR | MCP Pipeline Routing and IgnoreService at Index Build | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-92 | ADR | Schema-Migration knowledge.db v9 -> v10 (4-Tabellen-Bundle) | Accepted | Released | FEAT-15-09, FEAT-15-10, FEAT-15-11, FEAT-15-12 | ARCH |  |  |  |  |
| ADR-93 | ADR | Source-Identitaet-Modell (Domain-only fuer MVP) | Accepted | Released | FEAT-15-11, FEAT-19-14, FEAT-19-17 | ARCH |  |  |  |  |
| ADR-94 | ADR | Cluster-Halbwertszeit-Modell (statische Defaults editierbar) | Accepted | Released | FEAT-15-12, FEAT-19-16 | ARCH |  |  |  |  |
| ADR-95 | ADR | Frontmatter-Write Conflict-Detection | Accepted | Released | FEAT-19-09, FEAT-19-10 | ARCH |  |  |  |  |
| ADR-96 | ADR | MOC-Marker-Konvention (HTML-Comment-Marker) | Accepted | Released | FEAT-19-11, FEAT-19-26 | ARCH |  |  |  |  |
| ADR-97 | ADR | KV-Cache-Block-Lifecycle fuer Top-Hub-Block | Accepted | Released | FEAT-03-26, ADR-62 | ARCH |  |  |  |  |
| ADR-98 | ADR | Pre-Triage-Tool-Architektur (eigenes ingest_triage-Tool) | Accepted | Released | FEAT-19-12, ADR-66 | ARCH |  |  |  |  |
| ADR-99 | ADR | Tension-Detection-Algorithmus (Hybrid Cosine plus LLM) | Accepted | Released | FEAT-19-13 | ARCH |  |  |  |  |
| PLAN-01 | Plan | - Memory v2 Master Plan (Pfad alpha) | Draft | Building | ADR-76, ADR-77, ADR-78, ADR-79 | ARCH |  |  |  |  |
| PLAN-04 | Plan | - Memory v2 Phase 1 Engine Foundation | Draft | Building | FEAT-03-15, ADR-76, ADR-77, ADR-80 | ARCH |  |  |  |  |
| PLAN-05 | Plan | - Memory v2 Phase 2 Migration + Vault-RRF | Draft | Building | FEAT-03-16, ADR-77, ADR-78, ADR-80 | ARCH |  |  |  |  |
| PLAN-06 | Plan | - Memory v2 Phase 3 Dynamic Context Composition | Draft | Building | FEAT-03-17, ADR-77, ADR-78, ADR-80 | ARCH |  |  |  |  |
| PLAN-07 | Plan | - Memory v2 Phase 4 Single-Call Update | Draft | Building | FEAT-03-18, ADR-76, ADR-77, ADR-83 | ARCH |  |  |  |  |
| PLAN-08 | Plan | - Memory v2 Phase 4.5 Agent-Self Layer | Draft | Building | FEAT-03-19, ADR-77, ADR-85 | ARCH |  |  |  |  |
| PLAN-09 | Plan | - ChatGPT OAuth Provider (EPIC-21) | Draft | Building | FEAT-00-21, ADR-88, ADR-89 | ARCH |  |  |  |  |
| PLAN-10 | Plan | BA-25 Phase 1 Foundation | Draft | Building | FEAT-15-09, FEAT-15-10, FEAT-15-11, FEAT-15-12 | ARCH |  |  |  |  |
| PLAN-11 | Plan | BA-25 Phase 2 Lint-Foundation | Draft | Building | FEAT-19-16, FEAT-19-17, FEAT-19-18, ADR-94 | ARCH |  |  |  |  |
| PLAN-12 | Plan | BA-25 Phase 3 Ingest-Foundation | Draft | Building | FEAT-19-12, FEAT-19-22, FEAT-19-24, FEAT-19-25 | ARCH |  |  |  |  |
| PLAN-13 | Plan | BA-25 Phase 4 Power-User-Erweiterungen | Draft | Building | FEAT-19-10, FEAT-19-11, FEAT-19-13, FEAT-19-14 | ARCH |  |  |  |  |
| PLAN-14 | Plan | BA-25 Phase 5 Erweiterte Schichten | Draft | Building | FEAT-19-11, FEAT-19-15, FEAT-19-20, FEAT-03-26 | ARCH |  |  |  |  |
| PLAN-15 | Plan | FIX-19-28-01 Source-Position-Marker im Ingest-Output | Done | Building | FIX-19-28-01, FEAT-19-28, FEAT-19-29, ADR-103 | ARCH |  |  | 2026-05-07 | Issue#11 Implemented |

