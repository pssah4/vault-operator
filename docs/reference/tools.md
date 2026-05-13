---
title: Tools Reference
description: Complete list of all 65 tools available to the Vault Operator, organized by group.
---

# Tools reference

Vault Operator has 65 built-in tools across nine groups. The agent picks the right tool based on your request. You never call tools yourself.

:::tip How tools work
When you ask Vault Operator to do something, it picks one or more tools, shows its plan in the activity block, and asks for approval before any write operation. See [Safety & Control](/guides/safety-control) for details.
:::

## Tool groups at a glance

| Group | Tools | Modifies vault | Needs approval |
|-------|-------|----------------|----------------|
| Read | 4 | No | No |
| Vault intelligence | 10 | No (except `open_note`) | No |
| Knowledge ingest | 3 | Yes | Yes |
| Memory and history | 8 | Yes (memory store) | Yes for writes |
| Edit | 16 | Yes | Yes |
| Web | 2 | No | Yes (external access) |
| Agent control | 15 | Varies | Varies |
| Plugin integration | 5 | Varies | Yes |
| MCP | 2 | Depends on server | Yes |

## Read tools

Tools for reading, searching, and exploring your vault. They never modify anything.

| Tool | Description | When to use |
|------|-------------|-------------|
| `read_file` | Read the complete content of a Markdown or plain-text file. | Before editing a file, or when you ask to see content. |
| `read_document` | Parse and extract text from Office and data files (PPTX, XLSX, DOCX, PDF, JSON, XML, CSV). Supports `start_page` / `end_page` for large files. | For binary document formats and large PDFs. |
| `list_files` | List files and folders in a directory, optionally recursive. | To discover folder structure or find files by location. |
| `search_files` | Search for text or regex patterns across files, returning matching lines with line numbers. | For exact text or pattern matching across your vault. |

## Vault intelligence tools

Tools that understand your vault's structure, metadata, and connections.

| Tool | Description | When to use |
|------|-------------|-------------|
| `get_vault_stats` | Overview of your vault: note count, folder structure, top tags, recently modified files. | When you need a broad picture of your vault. |
| `get_frontmatter` | Read all YAML frontmatter fields of a note (tags, aliases, dates, status, custom properties). | To check or inspect metadata before updating it. |
| `search_by_tag` | Find all notes with given tags, supporting AND/OR matching and nested tags. | To filter notes by tags or categories. |
| `get_linked_notes` | Get forward links and backlinks for a note. | To understand how notes connect in the graph. |
| `get_daily_note` | Read (or create) a daily note for today, yesterday, or any offset. | To work with your daily notes. |
| `open_note` | Open a note in the Obsidian editor. | After creating or editing a note so you can see the result. |
| `semantic_search` | Find notes by meaning using embedding-based similarity search. | For natural-language questions about vault content ("What do I know about X?"). |
| `query_base` | Query an Obsidian Bases database file and return matching records. | To retrieve structured data from a `.base` file. |
| `vault_health_check` | Run structural checks on the knowledge graph: orphans, broken links, missing backlinks, weak clusters, inconsistent tags, category mismatches, god-nodes. | To audit vault quality or diagnose a specific issue area. Runs against the knowledge database, no LLM tokens used. See [Vault Health](/guides/vault-health). |
| `anti_echo_search` | Find sources that contradict or extend the current note instead of confirming it. | To break out of confirmation bias when researching a topic. |

:::info Semantic search setup
`semantic_search` requires an embedding model and a built index. Configure both in **Settings > Embeddings**. See [Knowledge Discovery](/guides/knowledge-discovery) for setup instructions.
:::

## Knowledge ingest tools

Tools for bringing external sources (PDFs, Office files, web clips) into the vault as structured notes with provenance back to the source.

| Tool | Description | When to use |
|------|-------------|-------------|
| `ingest_triage` | Ten-second pre-triage of a source against the vault's ontology. Returns cluster match, source-diversity hint, tension hint, and a recommendation (ingest / later / discard). Costs about $0.05 per pass. | Before deep-reading a source, to decide whether it is worth the effort. |
| `ingest_document` | Single-pass ingest of a document into one note: frontmatter, overview, key statements with `[[basename#Page N\|↗]]` provenance refs, and the full original text. | For quick inbox capture of PDFs, DOCX, PPTX, XLSX, or web clips. |
| `ingest_deep` | Karpathy-style multi-turn deep ingest. Converts PDFs into a Markdown mirror with block IDs, then produces either a single dense sense-making note or a bibliography note plus N atomic zettel. Every claim carries a `[[mirror#^block-N\|↗]]` link to the exact paragraph. | For research papers, long reports, or anything that requires sense-making instead of summarization. See [Knowledge Ingest](/guides/knowledge-ingest). |

## Memory and history tools

Tools for the agent's persistent memory layer (facts, preferences, soul) and the conversation history index.

| Tool | Description | When to use |
|------|-------------|-------------|
| `recall_memory` | Retrieve relevant facts and preferences from the persistent memory store, filtered by source interface (Obsidian, Claude Desktop, ChatGPT, etc.). | When the agent needs personal context to answer well. |
| `mark_for_memory` | Mark a piece of information from the current conversation as memory-worthy. | When the user says "remember this" or shares a stable preference. |
| `update_soul` | Update the user's soul layer (long-term identity, values, working style). | For deep, slow-changing personality updates, not day-to-day facts. |
| `search_history` | Full-text search across past conversations, optionally filtered by source interface. | When the user references a past chat ("what did we say about X last week?"). |
| `mark_note_as_memory_source` | Mark a vault note as a memory source. The frontmatter indexer will keep facts derived from it in sync as the note changes. | When a note holds canonical knowledge that should feed the memory layer. |
| `unmark_note_as_memory_source` | Remove a note from the memory-source set. | When a note should no longer feed the memory layer. |
| `list_memory_source_notes` | List all notes currently marked as memory sources. | To audit which notes drive the memory layer. |
| `list_pinned_conversations` | List chat conversations pinned to memory (via the star button or `mark_for_memory`). Read-only, complementary to `list_memory_source_notes`. | To audit which chats are saved to long-term memory. |

## Edit tools

Tools that create, modify, or delete files in your vault. Each one triggers an approval prompt unless auto-approved.

| Tool | Description | When to use |
|------|-------------|-------------|
| `write_file` | Create a new file or completely replace an existing file's content. | For new files or full rewrites. |
| `edit_file` | Replace a specific string in an existing file, preserving surrounding content. | For targeted edits. The preferred way to modify files. |
| `append_to_file` | Append content to the end of a file. | For daily notes, logs, and additive entries. |
| `update_frontmatter` | Set, update, or remove frontmatter fields without touching note content. | To change metadata (tags, status, dates) cleanly. |
| `create_folder` | Create a new folder, including parent folders if needed. | Before writing files to a new location. |
| `delete_file` | Move a file or empty folder to the system trash (recoverable). | When you explicitly ask to delete something. |
| `move_file` | Move or rename a file or folder. Obsidian auto-updates wikilinks. | To reorganize vault structure. |
| `generate_canvas` | Create an Obsidian Canvas (`.canvas`) visualizing notes and their connections. | To visualize note relationships as a spatial map. |
| `create_excalidraw` | Create an Excalidraw drawing with labeled boxes and connections. | To create diagrams and visual overviews. |
| `create_drawio` | Create a Draw.io / diagrams.net flowchart (`.drawio` or `.drawio.svg`) with nodes, shapes, and arrows. | For programmatically created flowcharts that the user then extends in the plugin. |
| `create_base` | Create an Obsidian Bases (`.base`) database view from vault notes. | To build structured database views filtered by frontmatter. |
| `update_base` | Add or replace a view in an existing Bases file. | To modify database views without recreating the file. |
| `plan_presentation` | Plan a presentation from source material and a template using an internal AI call. Source-grounded, outline-first. | Always before `create_pptx` when using corporate templates. |
| `create_pptx` | Create a PowerPoint presentation (`.pptx`) from structured slide data, either from a template or ad-hoc. | For creating PowerPoint files. |
| `create_docx` | Create a Word document (`.docx`) with headings, sections, bullets, and tables. | For creating Word documents. |
| `create_xlsx` | Create an Excel spreadsheet (`.xlsx`) with sheets, headers, data rows, and formulas. | For creating Excel files. |

## Web tools

Tools for accessing the internet. Require Web Tools to be enabled in settings.

| Tool | Description | When to use |
|------|-------------|-------------|
| `web_fetch` | Fetch a URL and return its content as Markdown. Supports pagination for long pages. | To read a specific web page, documentation, or article. |
| `web_search` | Search the web and return titles, URLs, and snippets. | For current or external information not in your vault. |

## Agent control tools

Internal tools the agent uses to manage its own workflow and configuration.

| Tool | Description | When to use |
|------|-------------|-------------|
| `ask_followup_question` | Ask you a clarifying question with optional answer choices. | When your request is genuinely ambiguous. |
| `attempt_completion` | Signal that a multi-step task is done and log a summary. | After completing a tool-based workflow. |
| `update_todo_list` | Publish a visible task checklist for multi-step work. | For tasks with 3 or more distinct steps. |
| `new_task` | Spawn a sub-agent with a fresh context for isolated or parallel work. | For tasks (5+ steps) that benefit from delegation. |
| `switch_mode` | Switch to a different agent mode (e.g., from Ask to Agent). | When the current task needs a different set of tools or behavior. |
| `evaluate_expression` | Execute TypeScript code in an isolated sandbox with vault access. | For batch operations, computations, data transforms, or API calls beyond built-in tools. |
| `find_tool` | Look up which tool fits a task description, including custom and plugin tools. | When the agent is unsure which tool to use. |
| `inspect_self` | Read the agent's own configuration, available tools, modes, and active rules. | For debugging or when the user asks "what can you do?". |
| `read_skill` | Load the full step-by-step body of a skill listed in the SKILLS directory of the system prompt. | Before doing the work when a skill matches the task. Skip when no skill applies. |
| `manage_skill` | Create, update, delete, or list skills (persistent instruction sets). | To save a reusable approach for a specific task type. |
| `manage_source` | Manage context sources: persistent text blocks injected into every conversation. | To always include certain context like project rules. |
| `manage_mcp_server` | Add, remove, or test MCP server connections. | To connect external tool servers. |
| `configure_model` | Add, select, or test an LLM model configuration. | To set up a new AI model or switch the active one. |
| `update_settings` | Change Vault Operator plugin settings or apply permission presets. | When you ask the agent to adjust its own configuration. |
| `read_agent_logs` | Read the agent's internal console logs for self-debugging. | To diagnose errors or understand what happened. |

## Plugin integration tools

Tools that interact with other Obsidian plugins installed in your vault.

| Tool | Description | When to use |
|------|-------------|-------------|
| `execute_command` | Run an Obsidian command by ID (e.g., `daily-notes:open`). | To trigger any plugin's commands. |
| `call_plugin_api` | Call a JavaScript API method on a plugin (Dataview, Omnisearch, etc.). | To retrieve structured data from plugins. |
| `enable_plugin` | Enable or disable an installed community plugin. | When a disabled plugin is needed for a task. |
| `resolve_capability_gap` | Search for plugins that could help when no built-in tool matches. | When the agent cannot fulfill a request with existing tools. |
| `execute_recipe` | Run a pre-defined recipe for external CLI tools (e.g., Pandoc export). | For validated command-line integrations. |

## MCP tools

| Tool | Description | When to use |
|------|-------------|-------------|
| `use_mcp_tool` | Call any tool provided by a connected MCP server. | When an external MCP server offers the functionality you need. |
| `read_mcp_tool` | Read the full description and a compact input-schema summary for a single MCP tool. | When the MCP listing shows a truncated description and the agent needs the full text or schema before calling `use_mcp_tool`. |

:::tip Custom modes control tool access
Each mode (Ask, Agent, or your custom modes) can enable or disable specific tool groups. Configure per-mode tools in **Settings > Modes**. Ask mode only has read tools enabled by default.
:::

## Cross-surface tools (MCP outbound)

Vault Operator also exposes a small surface to external AI clients (Claude Desktop, ChatGPT, Perplexity) via its own MCP server. These are not built-in tools the agent calls; they are entry points other AIs use to read and write Vault Operator's memory and history layers. See [MCP architecture](/concepts/mcp-architecture).

- `get_context`: pull the user's memory, soul, skills, and rules (gated by strict source isolation setting).
- `recall_memory`: cross-source memory retrieval.
- `save_to_memory`: fact persistence with source tagging.
- `save_conversation`: persist a conversation as a living document.
- `search_history`: cross-source history search.
- `execute_vault_op`: run vault operations (read, list, write) with the user's permission boundaries.
- `read_notes`: bulk-read notes by path.
- `search_vault`: search across the vault.
- `update_memory`: legacy memory write, deprecated in favor of `save_to_memory`.
- `sync_session`: legacy session sync from external clients.
- `close_conversation`: close a living document explicitly.
- `get_vault_implicit_edges` / `get_vault_note_metadata`: structural vault queries.

## Quick-pick guide

Common tasks mapped to the right tool.

| You want to... | Best tool | Why not the alternative |
|----------------|-----------|------------------------|
| Find notes about a topic | `semantic_search` | `search_files` only matches exact text, not meaning |
| Find an exact phrase | `search_files` | `semantic_search` finds similar meanings, not exact matches |
| Check a note's tags | `get_frontmatter` | `read_file` reads the whole file, unnecessary for metadata |
| Add a paragraph to a note | `edit_file` | `write_file` replaces the entire file |
| Add an entry to a log | `append_to_file` | `edit_file` requires matching existing text |
| Quickly capture a PDF | `ingest_document` | `read_document` reads but does not write a note |
| Sense-make a research paper | `ingest_deep` | `ingest_document` is single-pass without dialog or block-refs |
| Decide whether to read a source | `ingest_triage` | Reading the whole thing first defeats the point |
| Create a Word document | `create_docx` | `write_file` cannot produce binary `.docx` format |
| Create a PowerPoint | `plan_presentation` then `create_pptx` | Skipping `plan_presentation` leaves empty shapes |
| Read a PDF or PPTX | `read_document` | `read_file` returns raw binary for non-text formats |
| Run a Dataview query | `call_plugin_api` | `search_files` cannot execute Dataview logic |
| Process 50 files at once | `evaluate_expression` | Calling `edit_file` 50 times is slow and error-prone |
| Look something up online | `web_search` then `web_fetch` | Vault tools only search local files |
| Create a visual map of notes | `generate_canvas` | Manual note arrangement is tedious |
| Recall what we discussed last week | `search_history` | `read_file` cannot find conversations by content |

## Notes on tool behavior

- **Read tools run in parallel.** When the agent needs to read multiple files, it reads them all at once.
- **Edit tools run sequentially.** Write operations go one at a time to avoid conflicts.
- **Checkpoints run automatically.** Before any edit tool modifies a file, Vault Operator creates a snapshot so you can undo the change.
- **`evaluate_expression` runs in a sandbox.** No direct file system access, no shell. Vault access goes through a bridge with the user's permission settings.
- **Office-document tools self-check after output.** `create_pptx`, `create_docx`, `create_xlsx`, `generate_canvas`, and `create_excalidraw` produce real binary files that open in Microsoft Office, Google Docs, or LibreOffice.
- **Knowledge-ingest tools enforce provenance.** Every key statement in an ingest output carries a `[[source#position\|↗]]` link to the exact block, page, slide, or anchor in the source. See [Knowledge Ingest](/guides/knowledge-ingest).
