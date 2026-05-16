# Vault Operator

**Agentic AI for Obsidian.**

An autonomous AI operating layer for your Obsidian vault. 60+ tools, semantic search, persistent memory, multi-agent workflows, office document creation, plugin discovery, and full safety controls. Works with 12+ providers including local models. Unifies chat history from ChatGPT, Claude, and Perplexity into your vault. Open source. Free.

[pssah4.github.io/vault-operator](https://pssah4.github.io/vault-operator)

---

## What it does

You describe a task in natural language. Vault Operator plans, searches your vault, reads relevant notes, creates or edits content, generates PowerPoint / Word / Excel files, browses the web, calls MCP servers, and reports back. Every step is visible in the sidebar in real time. Every write operation requires your approval and creates a checkpoint you can undo with one click.

Concrete examples:

- "Read this PDF, link the key concepts to my existing notes, then create a summary in my Inbox."
- "Find all my meeting notes about the EnBW project from the last 6 weeks and build a status presentation from my corporate PPTX template."
- "Compare these two strategy notes, flag contradictions, and propose how to merge them."
- "Look up the latest research on context-engineering, save the three best papers as ingested notes, and update my Innovation Strategy MOC."

The agent works with one model for chat and (optionally) a cheaper helper model for internal tasks like context condensing, which keeps cost predictable. A sidebar footer shows real-time token usage and cost in EUR per task.

## Features

### 60+ built-in tools

Organized into nine groups:

- **Read & Search**: `read_file`, `read_document`, `list_files`, `search_files`, `semantic_search`, `search_history`
- **Vault Intelligence**: `get_frontmatter`, `search_by_tag`, `get_linked_notes`, `get_vault_stats`, `get_daily_note`, `query_base`, `open_note`, `vault_health_check`
- **Write & Edit**: `write_file`, `edit_file`, `append_to_file`, `update_frontmatter`, `create_folder`, `delete_file`, `move_file`, `generate_canvas`, `create_excalidraw`, `create_drawio`, `create_base`, `update_base`
- **Office Documents**: `plan_presentation`, `create_pptx`, `create_docx`, `create_xlsx`
- **Knowledge Ingest & Maintenance**: `ingest_document`, `ingest_triage`, `ingest_deep`
- **Web**: `web_fetch`, `web_search` (Brave / Tavily), `anti_echo_search`
- **Memory**: `recall_memory`, `mark_for_memory`, `update_soul`, `mark_note_as_memory_source`, `unmark_note_as_memory_source`, `list_memory_source_notes`, `list_pinned_conversations`
- **Agent Control**: `new_task`, `update_todo_list`, `ask_followup_question`, `attempt_completion`, `evaluate_expression`, `manage_skill`, `manage_source`, `switch_mode`, `find_tool`, `read_skill`, `read_agent_logs`, `configure_model`, `update_settings`, `inspect_self`, `manage_mcp_server`
- **Plugin Integration**: `execute_command`, `call_plugin_api`, `enable_plugin`, `resolve_capability_gap`, `execute_recipe`
- **MCP**: `use_mcp_tool`, `read_mcp_tool` (connect any MCP server)

### Knowledge discovery

Local vector index (SQLite-backed via sql.js) with configurable embedding providers. Combines semantic similarity with full-text keyword search (RRF fusion), graph expansion via wikilinks (1-3 hops), local reranking (cross-encoder via WebAssembly), contextual retrieval, and implicit connection discovery between unlinked notes.

### Agent modes

Two built-in modes: **Ask** (read-only knowledge assistant) and **Agent** (full capabilities). Create custom modes with their own roles, tool sets, and instructions. Per-mode model overrides let you run a fast model for quick questions and a powerful one for complex tasks.

### Multi-agent workflows

Spawn sub-agents with `new_task` for complex parallel or sequential workflows. Built-in patterns: Orchestrator-Worker, Prompt Chaining, Evaluator-Optimizer, and Routing. Depth-limited to 2 levels with parallel execution for read-safe tools.

### Office documents

Create PowerPoint, Word, and Excel files directly in your vault:
- **Template mode**: Use your corporate `.pptx` template. The agent analyzes every layout and placeholder, plans content with an internal LLM call, and builds the presentation in your exact design.
- **Ad-hoc mode**: Create presentations from scratch without a template.
- **Reading**: Parse existing PPTX, DOCX, XLSX, PDF, CSV, and JSON files as conversation context.
- **Visual QA**: Render presentations to images for layout verification (requires LibreOffice).

### Sandbox code execution

Run TypeScript directly in a secure sandboxed iframe. Import npm packages (pptxgenjs, xlsx, pdf-lib, d3, etc.) from CDN, with no Node.js or shell required. Process data, automate complex batch operations, and create reusable skills with code modules.

### Knowledge ingest and maintenance

Keep your vault clean and discoverable as it grows.

- `ingest_document` parses PDF, DOCX, PPTX, XLSX, CSV, and JSON into structured Markdown with extracted metadata.
- `ingest_triage` makes a quick keep / skim / skip decision on a new source before deeper processing.
- `ingest_deep` runs a thorough multi-pass ingest with summary, tension detection, ontology mapping, and graph linking back into the vault.
- `vault_health_check` audits for orphaned notes, broken links, missing frontmatter, duplicate titles, and stale content. It proposes fixes you can approve in batches.

### Plugin integration

Vault Operator automatically scans your installed Obsidian plugins and generates skill files that teach the agent how to use them. The agent learns each plugin's commands, settings, and file formats, so it can create Excalidraw drawings, build Kanban boards, populate Dataview tables, or use any other plugin on your behalf.

### Memory and personalization

Three-tier memory system:
- **Session memory**: summaries of each conversation (decisions, outcomes, open questions).
- **Long-term memory**: durable facts promoted from sessions (your preferences, projects, workflow patterns). Pin individual chats to memory with one click.
- **Soul**: core understanding of your communication style and how you like the agent to behave.

Mark any vault note as a **memory source** (via frontmatter or the `mark_note_as_memory_source` tool) and the agent extracts facts from it automatically on save. Chat-linking adds frontmatter references back to conversations, so you can trace any change to the chat that caused it.

### Context injection

- **Rules** (`.obsidian-agent/rules/`): permanent instructions injected into every system prompt
- **Skills** (`.obsidian-agent/skills/`): keyword-matched mini-instructions auto-injected per message
- **Workflows** (`.obsidian-agent/workflows/`): slash-command driven instruction sets
- **Custom Prompts**: `/prompt-slug` templates with `{{userInput}}` and `{{activeFile}}` variables

### Safety and control

- **Approval-based writes**: every write operation requires explicit approval (or configured auto-approval per category)
- **Automatic checkpoints**: isomorphic-git shadow repo snapshots before every task's first write
- **Diff review**: color-coded diffs with per-section Keep / Undo / Edit decisions after each task
- **Vault governance**: `.obsidian-agentignore` and `.obsidian-agentprotected` access control files
- **Audit log**: JSONL operation trail with parameter sanitization (30-day retention)

### Provider flexibility

| Provider | Type | Auth | Notes |
|----------|------|------|-------|
| Anthropic | Cloud | API key | Claude model family. Best tool use in testing. |
| OpenAI | Cloud | API key | GPT model family. Fast, good structured output. |
| Google | Cloud | API key | Gemini models. Free tier available. |
| AWS Bedrock | Cloud | API key or IAM | Anthropic, Mistral, and other models hosted on AWS. EU region support. |
| OpenRouter | Gateway | API key | 100+ models from many providers with a single key. |
| Azure OpenAI | Enterprise | API key + endpoint | Enterprise compliance and private endpoints. |
| GitHub Copilot | Gateway | OAuth | Uses your existing Copilot subscription. No separate API key. |
| ChatGPT (OAuth) | Subscription | OAuth | Use your existing ChatGPT Plus/Pro subscription via the Responses API. |
| Kilo Gateway | Gateway | Device auth / token | Centralized gateway with organization context. |
| Ollama | Local | None | Free, fully private. Many open-source models. |
| LM Studio | Local | None | Free, fully private. Visual model browser. |
| Custom | Any | Varies | Any OpenAI-compatible endpoint. |

You can also pick a **helper model** for cheap internal tasks (context condensing, fast-path planning, presentation planning) while a more capable model handles the main chat. Settings > Vault Operator > Agent behaviour > Loop > Helper model.

### MCP integration

Connect MCP servers via stdio, SSE, or streamable-HTTP. Tools are dynamically discovered and exposed to the agent. Per-mode whitelisting available. Vault Operator can also act as an MCP server, exposing your vault to Claude Desktop or any MCP client.

### Cross-surface AI workflow

Vault Operator can act as a remote MCP server for ChatGPT, Claude Desktop, Perplexity, and other AI tools. Conversations and facts from those surfaces flow into the same memory layer as the in-Obsidian agent. One thread of thinking, one searchable vault, regardless of which AI client you used to capture the idea.

---

## Installation

> **Note:** Vault Operator is currently in the Obsidian community plugin review queue and not yet available in the official directory. Until approval, install via BRAT or manually.

### BRAT (recommended)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. Open BRAT settings and select **Add Beta Plugin**
3. Enter `https://github.com/pssah4/vault-operator`
4. Enable "Vault Operator" in Settings > Community Plugins

### Manual installation

Download the three release assets and drop them into your plugin folder:

1. Open the [latest GitHub release](https://github.com/pssah4/vault-operator/releases/latest)
2. Download `main.js`, `manifest.json`, and `styles.css`
3. Move them into `<vault>/.obsidian/plugins/vault-operator/` (create the folder if it does not exist)
4. Reload Obsidian, then enable the plugin in Settings > Community Plugins

The three files are everything you need. Workers, WASM, bundled skills and templates are bundled into `main.js`. Optional features that need a one-time download (Semantic Reranker, Self-Development) prompt for installation from inside the plugin's Settings page.

### Building from source

```bash
git clone https://github.com/pssah4/vault-operator.git
cd vault-operator
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` from the repo root into `<vault>/.obsidian/plugins/vault-operator/`.

### Requirements
- Obsidian 1.4.0 or later (1.8+ for Bases features)
- Desktop only (not available on mobile)
- Node.js 18+ for building from source

---

## Quick start

1. **Add a model**: Settings > Vault Operator > Models > click "+ add model"
   - **Free option**: Get a [Google AI Studio](https://aistudio.google.com/app/apikey) API key (no credit card needed).
   - **Best quality**: Anthropic Claude Sonnet 4.6 or OpenAI GPT-4o.
   - **Subscription-based**: GitHub Copilot or ChatGPT Plus / Pro via OAuth (no separate API key).
   - **Local & private**: [Ollama](https://ollama.ai) or [LM Studio](https://lmstudio.ai).
2. **(Optional) Add a helper model**: Settings > Vault Operator > Agent behaviour > Loop > Helper model. Pick something small and cheap (Haiku 4.5, GPT-4o-mini, a local Ollama model). The agent uses it for context condensing and other internal tasks while the main model handles the chat.
3. **Open the sidebar**: click the Vault Operator icon in the ribbon.
4. **Ask a question**: type any question about your vault, e.g. *"What are my most-linked notes?"*
5. **Run a task**: switch to Agent mode and try *"Create a weekly review template"*.

For search to work at its best, configure an embedding model and build the semantic index in Settings > Embeddings.

---

## Network usage

This plugin makes network requests depending on your configuration:

- **LLM API calls**: every message is sent to the configured model provider (Anthropic, OpenAI, Google, AWS Bedrock, OpenRouter, Azure, GitHub Copilot, ChatGPT-OAuth, Kilo Gateway, or a local server like Ollama / LM Studio). No data is sent without a configured provider.
- **Web search** (optional): when using `web_search`, requests go to the configured search API (Brave or Tavily). Disabled by default.
- **MCP servers** (optional): connected MCP servers may make additional network requests depending on their configuration. Vault Operator can also expose your vault as a remote MCP server (cross-surface workflows with ChatGPT, Claude, Perplexity); the remote-MCP path is opt-in and uses a token-protected Cloudflare relay.
- **Sandbox npm CDN** (only when you run custom agent code): the EvaluateExpression sandbox can load npm packages on demand from `esm.sh` (with `jsdelivr` as fallback). Triggered only when an agent script or `evaluate_expression` call declares dependencies. Packages are cached locally and pinned by version. No requests are made unless user-initiated sandbox code declares a dependency.
- **No telemetry**: The plugin does not collect analytics, usage data, or crash reports.
- **API key storage**: API keys are encrypted via Electron's safeStorage API when available. On systems without safeStorage support, keys fall back to Obsidian's plugin settings (`data.json`), which is not encrypted. If you use Obsidian Sync, your settings will be synced.

---

## Local capabilities

Vault Operator runs on desktop Obsidian and uses several Node.js APIs that go beyond the standard vault API. The plugin only does this where the Obsidian API does not cover the feature; nothing is invoked without a user-initiated action.

- **Filesystem access (`fs`)**: required for the local knowledge database (sql.js WASM with atomic writes and snapshots), the office document pipeline (PPTX, DOCX, XLSX, PDF temp files), the shadow git checkpoint store, the semantic index persistence, and the optional asset downloader. All writes stay under the vault path, the plugin data directory (`<vault>/.obsidian/plugins/vault-operator/`), or a dedicated temp folder that is cleaned up after use.
- **Shell execution (`child_process`)**: used to spawn the Node-based sandbox worker (isolated child process for `evaluate_expression`), the local MCP server proxy, the shadow git executable for checkpoints, and the optional LibreOffice converter when generating presentations. Arguments are not constructed from chat text; commands are fixed binaries with structured argv.
- **Vault enumeration**: standard vault listing (`vault.getFiles`) is used by semantic search, `list_files`, MOC generation, and inventory tools. The agent only acts on files you reference or explicitly approve.
- **Clipboard access**: read and write only on user-initiated commands (the "Copy" buttons in chat / system-prompt previews and the optional clipboard-paste flow). No automatic clipboard monitoring.
- **Dynamic code execution**: limited to the sandbox (`evaluate_expression`). Sandbox code runs inside a sealed iframe or a Node `vm.runInNewContext` realm with an AST allow-list (no `eval`, no `require`, no `process`). Third-party packages from `esm.sh` are integrity-pinned by version. The sandbox cannot access plugin internals, settings, or other vault files outside the explicit `ctx.vault` bridge.

---

## Directory structure

```
<vault>/
├── .vault-operator/      # User-facing agent state (renamed from legacy
│   │                     # `.obsidian-agent` / `.obsilo-vault`, auto-migrated
│   │                     # on first launch)
│   ├── rules/            # Permanent system prompt instructions
│   ├── workflows/        # Slash-command workflow files
│   ├── skills/           # Keyword-matched skill instructions
│   ├── plugin-skills/    # Discovered plugin API skills (VaultDNA cache)
│   └── knowledge.db      # Local sql.js knowledge database (vectors, edges,
│                         # tags, memory) -- atomic writes, daily snapshots
│
└── .obsidian/plugins/vault-operator/
    ├── checkpoints/      # Shadow git repo (automatic undo)
    ├── data.json         # Plugin settings (API keys encrypted via OS keychain)
    └── dynamic-tools/    # User-authored sandbox skill code
```

---

## Documentation

Full documentation: **[pssah4.github.io/vault-operator](https://pssah4.github.io/vault-operator)**

**Tutorials**
- [Installation & Quick Start](https://pssah4.github.io/vault-operator/tutorials/getting-started)
- [Your First Conversation](https://pssah4.github.io/vault-operator/tutorials/first-conversation)
- [Your First Knowledge Workflow](https://pssah4.github.io/vault-operator/tutorials/knowledge-workflow)

**Guides**
- [What Vault Operator Can Do](https://pssah4.github.io/vault-operator/guides/capabilities)
- [Choosing a Model](https://pssah4.github.io/vault-operator/guides/choosing-a-model)
- [Chat Interface](https://pssah4.github.io/vault-operator/guides/chat-interface)
- [Vault Operations](https://pssah4.github.io/vault-operator/guides/vault-operations)
- [Knowledge Discovery](https://pssah4.github.io/vault-operator/guides/knowledge-discovery)
- [Memory & Personalization](https://pssah4.github.io/vault-operator/guides/memory-personalization)
- [Safety & Control](https://pssah4.github.io/vault-operator/guides/safety-control)
- [Skills, Rules & Workflows](https://pssah4.github.io/vault-operator/guides/skills-rules-workflows)
- [Office Documents](https://pssah4.github.io/vault-operator/guides/office-documents)
- [Connectors (MCP)](https://pssah4.github.io/vault-operator/guides/connectors)
- [Multi-Agent & Tasks](https://pssah4.github.io/vault-operator/guides/multi-agent)
- [Knowledge Ingest](https://pssah4.github.io/vault-operator/guides/knowledge-ingest)
- [Vault Health Check](https://pssah4.github.io/vault-operator/guides/vault-health)

**Reference**
- [Tools](https://pssah4.github.io/vault-operator/reference/tools)
- [Providers & Models](https://pssah4.github.io/vault-operator/reference/providers)
- [Settings](https://pssah4.github.io/vault-operator/reference/settings)
- [Troubleshooting](https://pssah4.github.io/vault-operator/reference/troubleshooting)

**Concepts**
- [How Vault Operator Works](https://pssah4.github.io/vault-operator/concepts/)
- [The Agent Loop](https://pssah4.github.io/vault-operator/concepts/agent-loop)
- [Tool System](https://pssah4.github.io/vault-operator/concepts/tool-system)
- [Knowledge Layer](https://pssah4.github.io/vault-operator/concepts/knowledge-layer)
- [Memory System](https://pssah4.github.io/vault-operator/concepts/memory-system)
- [Governance](https://pssah4.github.io/vault-operator/concepts/governance)

---

## Development

```bash
npm install       # Install dependencies
npm run dev       # Dev build with watch mode
npm run build     # Production build
```

---

## License

Apache 2.0

---

## Acknowledgements

- [Kilo Code](https://kilocode.ai) for architectural inspiration
- [Obsidian](https://obsidian.md) as the platform
- [sql.js](https://github.com/sql-js/sql.js) for SQLite in WebAssembly powering the knowledge layer
- [Hugging Face Transformers.js](https://github.com/huggingface/transformers.js) for local ONNX reranking
- [isomorphic-git](https://isomorphic-git.org) as pure JS git for checkpoints
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) for the Model Context Protocol
