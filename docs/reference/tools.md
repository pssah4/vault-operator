---
title: Tools Reference
description: Complete list of all 49 tools available to the Obsilo agent, organized by group.
---

# Tools reference

Obsilo has 49 built-in tools organized into six groups. The agent picks the right tool automatically based on your request. You never need to call tools yourself.

:::tip How tools work
When you ask Obsilo to do something, it selects one or more tools, shows you what it plans to do (in the activity block), and asks for approval before any write operation. See [Safety & Control](/guides/safety-control) for details.
:::

## Tool groups at a glance

| Group | Tools | Modifies vault | Needs approval |
|-------|-------|----------------|----------------|
| Read | 4 | No | No |
| Vault Intelligence | 8 | No (except `open_note`) | No |
| Edit | 15 | Yes | Yes |
| Web | 2 | No | Yes (external access) |
| Agent Control | 12 | Varies | Varies |
| Plugin Integration | 6 | Varies | Yes |
| MCP | 1+ | Depends on server | Yes |

## Read tools

Tools for reading, searching, and exploring your vault. These never modify anything.

| Tool | Description | When to use |
|------|-------------|-------------|
| `read_file` | Read the complete content of a Markdown or plain-text file. | Before editing a file, or when you ask to see content. |
| `read_document` | Parse and extract text from Office and data files (PPTX, XLSX, DOCX, PDF, JSON, XML, CSV). | For binary document formats, not for plain-text files. |
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
| `semantic_search` | Find notes by meaning using AI-powered similarity search. | For natural-language questions about vault content ("What do I know about X?"). |
| `query_base` | Query an Obsidian Bases database file and return matching records. | To retrieve structured data from a .base file. |
| `vault_health_check` | Run structural checks: orphaned notes, missing backlinks, broken links, weak clusters, inconsistent tags. | To audit and maintain vault quality. See [Vault Health](/guides/vault-health). |

:::info Semantic search setup
`semantic_search` requires an embedding model and a built index. Configure both in **Settings > Embeddings**. See [Knowledge Discovery](/guides/knowledge-discovery) for setup instructions.
:::

## Edit tools

Tools that create, modify, or delete files in your vault. Each one triggers an approval prompt (unless auto-approved).

| Tool | Description | When to use |
|------|-------------|-------------|
| `write_file` | Create a new file or completely replace an existing file's content. | For new files or full rewrites. |
| `edit_file` | Replace a specific string in an existing file, preserving surrounding content. | For targeted edits. The preferred way to modify files. |
| `append_to_file` | Append content to the end of a file. | For daily notes, logs, and additive entries. |
| `update_frontmatter` | Set, update, or remove frontmatter fields without touching note content. | To change metadata (tags, status, dates) cleanly. |
| `create_folder` | Create a new folder, including parent folders if needed. | Before writing files to a new location. |
| `delete_file` | Move a file or empty folder to the system trash (recoverable). | When you explicitly ask to delete something. |
| `move_file` | Move or rename a file or folder. Obsidian auto-updates wikilinks. | To reorganize vault structure. |
| `generate_canvas` | Create an Obsidian Canvas (.canvas) visualizing notes and their connections. | To visualize note relationships as a spatial map. |
| `create_excalidraw` | Create an Excalidraw drawing with labeled boxes and connections. | To create diagrams and visual overviews. |
| `create_base` | Create an Obsidian Bases (.base) database view from vault notes. | To build structured database views filtered by frontmatter. |
| `update_base` | Add or replace a view in an existing Bases file. | To modify database views without recreating the file. |
| `plan_presentation` | Plan a presentation from source material and a template using an internal AI call. | Always before `create_pptx` when using corporate templates. |
| `create_pptx` | Create a PowerPoint presentation (.pptx) from structured slide data. | For creating PowerPoint files. |
| `create_docx` | Create a Word document (.docx) with headings, sections, bullets, and tables. | For creating Word documents. |
| `create_xlsx` | Create an Excel spreadsheet (.xlsx) with sheets, headers, data rows, and formulas. | For creating Excel files. |

## Web tools

Tools for accessing the internet. Require Web Tools to be enabled in settings.

| Tool | Description | When to use |
|------|-------------|-------------|
| `web_fetch` | Fetch a URL and return its content as Markdown. Supports pagination for long pages. | To read a specific web page, documentation, or article. |
| `web_search` | Search the web and return titles, URLs, and snippets. | For current or external information not in your vault. |

## Agent control tools

Internal tools the agent uses to manage its own workflow.

| Tool | Description | When to use |
|------|-------------|-------------|
| `ask_followup_question` | Ask you a clarifying question with optional answer choices. | When your request is genuinely ambiguous. |
| `attempt_completion` | Signal that a multi-step task is done and log a summary. | After completing a tool-based workflow. |
| `update_todo_list` | Publish a visible task checklist for multi-step work. | For tasks with 3 or more distinct steps. |
| `new_task` | Spawn a sub-agent with a fresh context for isolated or parallel work. | For tasks (5+ steps) that benefit from delegation. |
| `switch_mode` | Switch to a different agent mode (e.g., from Ask to Agent). | When the current task needs a different set of tools or behavior. |
| `evaluate_expression` | Execute TypeScript code in an isolated sandbox with vault access. | For batch operations, computations, data transforms, or API calls beyond built-in tools. |
| `manage_skill` | Create, update, delete, or list skills (persistent instruction sets). | To save a reusable approach for a specific task type. |
| `manage_source` | Manage context sources: persistent text blocks injected into every conversation. | To always include certain context like project rules. |
| `manage_mcp_server` | Add, remove, or test MCP server connections. | To connect external tool servers. |
| `configure_model` | Add, select, or test an LLM model configuration. | To set up a new AI model or switch the active one. |
| `update_settings` | Change Obsilo plugin settings or apply permission presets. | When you ask the agent to adjust its own configuration. |
| `read_agent_logs` | Read the agent's internal console logs for self-debugging. | To diagnose errors or understand what happened. |

## Plugin integration tools

Tools that interact with other Obsidian plugins installed in your vault.

| Tool | Description | When to use |
|------|-------------|-------------|
| `execute_command` | Run an Obsidian command by ID (e.g., "daily-notes:open"). | To trigger any plugin's commands. |
| `call_plugin_api` | Call a JavaScript API method on a plugin (Dataview, Omnisearch, etc.). | To retrieve structured data from plugins. |
| `enable_plugin` | Enable or disable an installed community plugin. | When a disabled plugin is needed for a task. |
| `resolve_capability_gap` | Search for plugins that could help when no built-in tool matches. | When the agent cannot fulfill a request with existing tools. |
| `execute_recipe` | Run a pre-defined recipe for external CLI tools (e.g., Pandoc export). | For validated command-line integrations. |
| `render_presentation` | Render a PPTX file to images for visual quality inspection. | After creating a presentation, to verify layout and content. |

## MCP tools

| Tool | Description | When to use |
|------|-------------|-------------|
| `use_mcp_tool` | Call any tool provided by a connected MCP server. | When an external MCP server offers the functionality you need. |

:::tip Custom modes control tool access
Each mode (Ask, Agent, or your custom modes) can enable or disable specific tool groups. Configure per-mode tools in **Settings > Modes**. Ask mode only has read tools enabled by default.
:::

## Quick-pick guide

Not sure which tool the agent should use? This table maps common tasks to the right tool.

| You want to... | Best tool | Why not the alternative |
|----------------|-----------|------------------------|
| Find notes about a topic | `semantic_search` | `search_files` only matches exact text, not meaning |
| Find an exact phrase | `search_files` | `semantic_search` finds similar meanings, not exact matches |
| Check a note's tags | `get_frontmatter` | `read_file` reads the whole file, unnecessary for metadata |
| Add a paragraph to a note | `edit_file` | `write_file` replaces the entire file |
| Add an entry to a log | `append_to_file` | `edit_file` requires matching existing text |
| Create a Word document | `create_docx` | `write_file` cannot produce binary .docx format |
| Create a PowerPoint | `plan_presentation` then `create_pptx` | Skipping `plan_presentation` leaves empty shapes |
| Read a PDF or PPTX | `read_document` | `read_file` returns raw binary for non-text formats |
| Run a Dataview query | `call_plugin_api` | `search_files` cannot execute Dataview logic |
| Process 50 files at once | `evaluate_expression` | Calling `edit_file` 50 times is slow and error-prone |
| Look something up online | `web_search` then `web_fetch` | Vault tools only search local files |
| Create a visual map of notes | `generate_canvas` | Manual note arrangement is tedious |

## Notes on tool behavior

- Read tools run in parallel. When the agent needs to read multiple files, it reads them all at once.
- Edit tools run sequentially. Write operations are processed one at a time to avoid conflicts.
- Checkpoints are automatic. Before any edit tool modifies a file, a snapshot is created. You can undo any change.
- The sandbox is isolated. Code in `evaluate_expression` runs in a sandboxed environment with limited vault access. It cannot access the file system directly or run shell commands.
- Office tools create binary files. `create_pptx`, `create_docx`, and `create_xlsx` produce real Office files that open in Microsoft Office, Google Docs, or LibreOffice.
- Quality gates apply. Some tools (`create_pptx`, `create_docx`, `create_xlsx`, `generate_canvas`, `create_excalidraw`) include a self-check step where the agent verifies the output meets quality standards.
