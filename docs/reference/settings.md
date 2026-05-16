---
title: Settings Reference
description: Every Vault Operator setting explained, organized by tab with defaults and recommendations.
---

# Settings reference

All Vault Operator settings are in **Obsidian Settings > Vault Operator**. This page documents every section.

## Providers

Configure AI providers. Each provider exposes its own model list and is mapped into three tiers (Budget, Main, Frontier) that the agent picks from based on the current task.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Provider list | All configured providers with type, display name, sign-in status, and tier mapping | Empty | Add at least one provider to start |
| Active provider | The provider used for chat by default | First added | Pick the one with the strongest Main tier (Claude Sonnet 4.x, GPT-5, Gemini 2.x) |
| + Add provider | Opens the provider detail modal | n/a | Start with one cloud and optionally one local |
| Refresh | Pulls the provider's model list and auto-classifies the models into tiers | n/a | Click after sign-in; rerun if the provider releases new models |
| Tier mapping | Manual override for Budget / Main / Frontier slots | Auto-classified | Keep auto unless you want a specific model |
| Test connection | Verifies the provider's credentials and endpoint with a minimal request | n/a | Always test after adding or rotating credentials |

:::tip Tiers and overrides
The Main tier drives chat by default. The agent escalates to Frontier on hard synthesis steps via the `consult_flagship` tool (budget: 3 calls per task, 3000 tokens per call). The chat-header model picker lets you pin a specific provider/model for a single task without changing the active provider.
:::

:::info Local capabilities and providers
Ollama and LM Studio prefill their Base URL field with the well-known default port. The Refresh button uses Ollama's native `/api/tags` endpoint to enumerate installed models. ChatGPT (OAuth) bills against your existing Plus or Pro subscription instead of a per-token API key.
:::

## Embeddings

Configure the semantic index for meaning-based vault search.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Embedding model | The model used to generate text embeddings | None | OpenAI `text-embedding-3-small` (cheapest) |
| API key | Separate key for the embedding provider | None | Can share the OpenAI key from Models |
| Auto-index | Automatically index notes when they change | Off | Enable for vaults under 5,000 notes |
| Rebuild index | Re-index the entire vault from scratch | n/a | Run after first setup or major vault changes |
| Reranking | Re-rank semantic search results for better relevance | Off | Enable if search results feel imprecise |
| Implicit connections | Discover hidden relationships between notes | Off | Enable for knowledge discovery use cases |
| Graph enrichment | Add semantic similarity data to the Obsidian graph | Off | Enable if you use the graph view heavily |
| Confidence-weighted ranking | Factor edge confidence into graph expansion | On | Leave on, it improves retrieval quality |
| Knowledge freshness | Boost recently edited notes in search results | On | Leave on unless you prefer strict relevance over recency |
| Community detection | Run Louvain clustering on the knowledge graph at startup | On | Needed for category-mismatch health checks |

:::info Index size
The semantic index stores embeddings locally. For a vault with 1,000 notes, expect roughly 10-20 MB of storage.
:::

### Knowledge properties

Vault conventions used by the [knowledge ingest](/guides/knowledge-ingest) workflow and [vault health check](/guides/vault-health). Set these once to match your vault's schema.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Category property | Frontmatter key that holds the note's type or category | `Category` | Match whatever you already use (`type`, `kind`, etc.) |
| Summary property | Frontmatter key for the short note summary | `Summary` | Match your existing convention (`abstract`, `tldr`) |
| Source naming convention | Filename pattern for source notes created by ingest | `Author-Year_Title` | Keep short and sortable. Ingest uses this for PDFs |
| MOC properties | Extra frontmatter keys that participate in Maps of Content | Empty | Add `related`, `parent`, or whatever you link through |

### Vault health check

Diagnostic and repair pipeline for structural vault problems. See [Vault Health Check](/guides/vault-health) for the full workflow.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Enable vault health check | Run structural checks automatically on vault open | On | Keep on. Scans are fast and use no LLM tokens |
| Show health badge | Colored dot in the sidebar when findings exist | On | Keep on. It's the primary entry point to the repair modal |
| God-node threshold | Connection count above which a note is flagged as overloaded | 50 | Raise it for very large vaults, lower it if you want stricter hygiene |

## Web search

Enable tools for accessing the internet.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Enable web tools | Allow the agent to use `web_fetch` and `web_search` | Off | Enable when you need current information |
| Search provider | Which search API to use | Brave | Brave (free tier) or Tavily (better results) |
| API key | Key for the selected search provider | None | Get a free key from your chosen provider |

## MCP (Model Context Protocol)

Connect external tool servers and expose Vault Operator as a server.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Client servers | List of MCP servers the agent can call tools on | Empty | Add servers for external integrations |
| + add server | Configure a new MCP server connection (SSE or streamable-http) | n/a | Only SSE and streamable-http transports work |
| Test server | Verify connectivity to a configured server | n/a | Test after adding |
| Vault Operator as MCP server | Expose Vault Operator's tools to external clients like Claude Desktop | Off | Enable to use Vault Operator from Claude Desktop |

:::info Transport limitation
Vault Operator runs inside Electron (Obsidian's runtime), so only **SSE** and **streamable-http** transports are supported. Stdio-based MCP servers do not work.
:::

## Modes

Configure agent modes. Each mode defines which tools, skills, and model the agent uses.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Ask mode | Read-only mode with only read and vault intelligence tools | Built-in | Keep as your safe exploration mode |
| Agent mode | Full-access mode with all tools enabled | Built-in | Your primary working mode |
| Custom modes | User-defined modes with custom tool sets and system prompts | Empty | Create modes for specific workflows (Researcher, Writer) |
| Per-mode model | Override which model a mode uses | Global model | Set a fast model for Ask, a stronger one for Agent |
| Per-mode tools | Select which tool groups are available in each mode | Varies by mode | Restrict tools to what the mode actually needs |
| Per-mode skills | Attach specific skills to a mode | None | Attach relevant skills for the mode's purpose |

## Permissions (auto-approve)

Control what the agent can do without asking. See [Safety & Control](/guides/safety-control) for details.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Read operations | Auto-approve file reads, searches, listings | Off | Safe to enable. Nothing changes. |
| Note edits | Auto-approve editing existing notes | Off | Enable after you trust the agent's edits |
| Vault changes | Auto-approve creating, moving, deleting files | Off | Keep off until comfortable |
| Web operations | Auto-approve web fetches and searches | Off | Enable if you use web tools frequently |
| MCP calls | Auto-approve calls to external MCP servers | Off | Enable per-server based on trust |
| Subtasks | Auto-approve spawning sub-agents | Off | Safe to enable. Inherits parent permissions. |
| Plugin skills | Auto-approve plugin command execution | Off | Enable for trusted plugin workflows |
| Plugin API reads | Auto-approve reading plugin data | Off | Safe to enable. Read-only. |
| Plugin API writes | Auto-approve modifying plugin settings | Off | Keep off. High risk. |
| Recipes | Auto-approve multi-step CLI recipes | Off | Keep off. Runs external commands. |
| Sandbox | Auto-approve code execution in the sandbox | Off | Keep off unless you trust generated code |

:::warning Permissive combination
Enabling both **web operations** and **note edits** (or vault changes) triggers a security warning. This combination lets the agent fetch internet content and write it to your vault without asking.
:::

## Loop (agent behavior)

Control how the agent loop runs.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Consecutive error limit | How many consecutive tool errors before the agent stops | 3 | Keep at 3. Prevents infinite error loops. |
| Rate limit | Minimum milliseconds between API calls | 0 | Set to 500-1000 if you hit rate limits |
| Max iterations | Maximum tool calls per conversation turn | 25 | Increase for complex tasks, decrease to limit cost |
| Context condensing | Summarize older messages when context gets long | On | Keep on. Prevents context overflow errors. |
| Condensing threshold | Percentage of context window before condensing triggers | 70% | Lower if you see 400-error context overflow |
| Power steering | Re-inject key instructions every N messages | 4 | Keep at 4 for consistent behavior |
| Subtask depth | Maximum nesting depth for sub-agents | 2 | Keep at 2 unless you need deep delegation |

## Memory

Configure how the agent remembers across conversations.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Chat history | Save conversation history for future reference | On | Keep on. Required for memory extraction. |
| Chat history folder | Where to store conversation files in the vault | `Vault Operator/Chats` | Change if you prefer a different location |
| Memory extraction | Automatically extract key facts from conversations | On | Keep on for personalization |
| Memory model | Which model to use for memory extraction (background task) | Global model | Use a cheap model (Haiku, GPT-4o-mini) to save cost |
| Memory threshold | Minimum relevance score for a memory to be saved | 0.7 | Lower for more memories, raise for fewer but higher quality |

## Rules

Persistent instructions that guide the agent in every conversation.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Rule list | All active rules injected into the system prompt | Empty | Add rules for your writing style, vault conventions |
| + add rule | Create a new rule (plain text or Markdown) | n/a | Keep rules concise and specific |
| Import | Import rules from a file | n/a | Share rules across vaults |

## Workflows & prompts

Pre-defined multi-step instructions and prompt templates.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Workflows | Slash-command triggered instruction sequences (type `/` in chat) | Built-in defaults | Create workflows for your repeated tasks |
| Prompts | Reusable message templates with optional variables | Empty | Create prompts for common questions |

## Skills

Persistent instruction sets matched by keywords. Like mini-manuals the agent follows.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Skill list | All skills with name, trigger pattern, and body | Built-in defaults | Add skills for domain-specific tasks |
| + add skill | Create a new skill | n/a | Include a clear trigger pattern and step-by-step instructions |

## Interface

Appearance and input behavior settings.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Auto-add active file | Automatically include the currently open note as context | On | Keep on. Helps the agent understand what you're looking at. |
| Send key | Which key sends a message (Enter or Ctrl/Cmd+Enter) | Enter | Change to Ctrl+Enter if you write multi-line messages often |
| Show date/time | Display timestamps in the chat | Off | Personal preference |
| Chat history folder | Vault folder for saved conversations | `Vault Operator/Chats` | Also configurable in Memory tab |
| Chat linking | Link chat sessions to notes for traceability | Off | Enable for project-based workflows |
| Task extraction | Detect and extract tasks from agent responses | Off | Enable to auto-create tasks from conversations |

## Shell (plugin API & recipes)

Configure external tool integrations.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Plugin API | Allow the agent to call JavaScript APIs on other plugins | Off | Enable if you use Dataview, Omnisearch, or similar |
| Command allowlist | Which Obsidian commands the agent can execute | None | Add specific command IDs you trust |
| Recipes | Pre-validated CLI tool recipes (e.g., Pandoc export) | Built-in | Add recipes only for tools you have installed |

## Vault (checkpoints)

Checkpoint and snapshot settings for the undo system.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Enable checkpoints | Create snapshots before file modifications | On | Keep on. This powers the undo system. |
| Snapshot timeout | Maximum time to wait for a snapshot to complete (ms) | 5000 | Increase for very large files |
| Auto-cleanup | Automatically remove old checkpoints | On | Keep on to save storage |

### Agent folder

Vault-relative folder where Vault Operator keeps its own files: plugin skills, the vault-dna snapshot, externalised tmp results, and the local knowledge database. Default is `.obsidian-agent`.

Use the **Pick folder...** button to choose an existing folder from a fuzzy picker (works the same on Windows, macOS, and Linux), or type a new path that will be created on next use. Existing files are not auto-migrated when you change this path. Move them manually if needed.

## Log

Daily audit trail of every tool call. Each tool invocation is appended to a JSONL log file under the plugin's data folder, with timestamp, tool name, arguments, result status, and approval decision.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Date selector | Pick which day's log to load | Today | Use to review what the agent did yesterday or last week |
| Load | Render the selected day's log as a table | n/a | Click after picking a date |
| Download | Save the raw JSONL log for the selected day | n/a | Useful for audits, sharing with support, or external analysis |
| Clear all | Delete every log file from disk | n/a | Use sparingly. Logs are the only post-hoc record of what the agent did |

:::info Where logs live
Logs are stored under the agent folder (`Settings > Vault > Agent folder`, default `.vault-operator/logs/`). Each day is a separate JSONL file. Logs do not contain conversation content, only tool calls.
:::

## Debug

Internal diagnostics and optional source bundle for self-development tools.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Debug mode | Enable verbose logging to the developer console | Off | Enable while reproducing a bug. Disable for normal use, it generates a lot of output |
| Self-Development source bundle | Optional one-time download (~5 MB) of the plugin's TypeScript source. Required for the `manage_source` tool, so the agent can answer "how does feature X work?" questions and propose patches. Downloaded from the plugin's GitHub release, verified by SHA256, stored under the agent folder | Not installed | Install only if you want the agent to introspect its own source code |

:::tip Inspecting the running state
Use the `inspect_self` tool from chat ("inspect your tools" or "show me your current settings") to see live introspection of the running plugin. It returns a Markdown summary of the actual runtime state, not guesses.
:::

## Backup

Export and import your Vault Operator configuration. Useful when moving to a new device, sharing settings with a team, or restoring after a bad change.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Export categories | Checkboxes for each settings category (models, rules, skills, workflows, prompts, modes, soul, memory) | All on | Uncheck categories that contain device-specific keys before sharing |
| Export | Bundle the selected categories into a JSON file | n/a | Run before major settings changes or before sharing with another machine |
| Select file (Import) | Pick a previously exported JSON file | n/a | Step 1 of import |
| Import categories | Pick which categories from the file to import | All on | Skip categories that should keep their current values |
| Confirm import | Apply the imported settings | n/a | Step 3 of import. Existing settings in the selected categories are overwritten |
| Import legacy `soul.md` | Read `memory/soul.md` and add each bullet under Identity / Values / Anti-Patterns / Communication into the soul store. Idempotent. | n/a | One-off migration if you have an older `soul.md` from a prior plugin version |

:::warning API keys travel with the export
A full export includes provider API keys. Treat the JSON file like a password vault: never commit it, never share it publicly. Uncheck **Models** before sharing if you want to keep keys private.
:::

## Language

Set the agent's response language. The setting follows Obsidian's language by default. UI strings (settings labels, modals, errors) follow the Obsidian language separately.
