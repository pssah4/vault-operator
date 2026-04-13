---
title: Settings Reference
description: Every Obsilo setting explained, organized by tab with defaults and recommendations.
---

# Settings reference

All Obsilo settings are in **Obsidian Settings > Obsilo Agent**. This page documents every section.

## Models

Configure AI models and providers. You can add multiple models and switch between them.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Model list | All configured models with provider, name, and status | Empty | Add at least one model to start |
| Active model | The model used for conversations | First added | Use a capable model (Claude Sonnet, GPT-4o) |
| + add model | Opens the model configuration dialog | -- | Start with one cloud + one local model |
| Import from code | Import model configurations shared as code snippets | -- | Useful for team setups |
| Test connection | Verify that a model's API key and endpoint work | -- | Always test after adding a new model |

:::tip Multiple models
Add several models and assign them to different modes. Use a fast/cheap model for Ask mode and a powerful one for Agent mode.
:::

## Embeddings

Configure the semantic index for meaning-based vault search.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Embedding model | The model used to generate text embeddings | None | OpenAI `text-embedding-3-small` (cheapest) |
| API key | Separate key for the embedding provider | None | Can share the OpenAI key from Models |
| Auto-index | Automatically index notes when they change | Off | Enable for vaults under 5,000 notes |
| Rebuild index | Re-index the entire vault from scratch | -- | Run after first setup or major vault changes |
| Reranking | Re-rank semantic search results for better relevance | Off | Enable if search results feel imprecise |
| Implicit connections | Discover hidden relationships between notes | Off | Enable for knowledge discovery use cases |
| Graph enrichment | Add semantic similarity data to the Obsidian graph | Off | Enable if you use the graph view heavily |

:::info Index size
The semantic index stores embeddings locally. For a vault with 1,000 notes, expect roughly 10-20 MB of storage.
:::

## Web search

Enable tools for accessing the internet.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Enable web tools | Allow the agent to use `web_fetch` and `web_search` | Off | Enable when you need current information |
| Search provider | Which search API to use | Brave | Brave (free tier) or Tavily (better results) |
| API key | Key for the selected search provider | None | Get a free key from your chosen provider |

## MCP (Model Context Protocol)

Connect external tool servers and expose Obsilo as a server.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Client servers | List of MCP servers the agent can call tools on | Empty | Add servers for external integrations |
| + add server | Configure a new MCP server connection (SSE or streamable-http) | -- | Only SSE and streamable-http transports work |
| Test server | Verify connectivity to a configured server | -- | Test after adding |
| Obsilo as MCP server | Expose Obsilo's tools to external clients like Claude Desktop | Off | Enable to use Obsilo from Claude Desktop |

:::info Transport limitation
Obsilo runs inside Electron (Obsidian's runtime), so only **SSE** and **streamable-http** transports are supported. Stdio-based MCP servers do not work.
:::

## Modes

Configure agent modes. Each mode defines which tools, skills, and model the agent uses.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Ask mode | Read-only mode with only read and vault intelligence tools | Built-in | Keep as your safe exploration mode |
| Agent mode | Full-access mode with all tools enabled | Built-in | Your primary working mode |
| Custom modes | User-defined modes with custom tool sets and system prompts | Empty | Create modes for specific workflows (Researcher, Writer) |
| Per-mode model | Override which model a mode uses | Global model | Set a fast model for Ask, a powerful one for Agent |
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
| Chat history folder | Where to store conversation files in the vault | `Obsilo/Chats` | Change if you prefer a different location |
| Memory extraction | Automatically extract key facts from conversations | On | Keep on for personalization |
| Memory model | Which model to use for memory extraction (background task) | Global model | Use a cheap model (Haiku, GPT-4o-mini) to save cost |
| Memory threshold | Minimum relevance score for a memory to be saved | 0.7 | Lower for more memories, raise for fewer but higher quality |

## Rules

Persistent instructions that guide the agent in every conversation.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Rule list | All active rules injected into the system prompt | Empty | Add rules for your writing style, vault conventions |
| + add rule | Create a new rule (plain text or Markdown) | -- | Keep rules concise and specific |
| Import | Import rules from a file | -- | Share rules across vaults |

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
| + add skill | Create a new skill | -- | Include a clear trigger pattern and step-by-step instructions |

## Interface

Appearance and input behavior settings.

| Setting | What it does | Default | Recommendation |
|---------|-------------|---------|----------------|
| Auto-add active file | Automatically include the currently open note as context | On | Keep on. Helps the agent understand what you're looking at. |
| Send key | Which key sends a message (Enter or Ctrl/Cmd+Enter) | Enter | Change to Ctrl+Enter if you write multi-line messages often |
| Show date/time | Display timestamps in the chat | Off | Personal preference |
| Chat history folder | Vault folder for saved conversations | `Obsilo/Chats` | Also configurable in Memory tab |
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

## Other tabs

| Tab | What it does |
|-----|-------------|
| Log | Browse the daily audit trail of all tool calls with timestamps and parameters |
| Debug | Internal diagnostics: ring buffer viewer, system prompt preview |
| Backup | Export and import your complete Obsilo configuration |
| Language | Set the agent's response language (follows Obsidian's language by default) |
