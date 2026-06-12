/**
 * Tool Metadata — Single Source of Truth
 *
 * Central registry for tool display names, descriptions, icons,
 * and group assignments. Consumed by:
 *   - systemPrompt.ts  → generates TOOLS section for LLM
 *   - ToolPickerPopover → labels, descriptions, icons in UI
 *
 * The API-level tool schema (input_schema, detailed description)
 * stays in each Tool's getDefinition() method — it serves a
 * different purpose (function calling) and needs parameter details.
 */

import type { ToolGroup } from '../../types/settings';

export interface ToolMeta {
    /** Which tool group this belongs to */
    group: ToolGroup;
    /** Display label in the UI (e.g., "Read File") */
    label: string;
    /** Short description — used in system prompt AND UI popover */
    description: string;
    /** Lucide icon name for the UI */
    icon: string;
    /** Prompt signature — e.g., "read_file(path)" for system prompt */
    signature: string;
    /** Concrete example call with realistic parameters (shown in system prompt) */
    example?: string;
    /** When to prefer this tool over alternatives */
    whenToUse?: string;
    /** Frequent LLM mistakes to avoid */
    commonMistakes?: string;
    /**
     * Whether this tool requires a quality gate (self-check checklist appended
     * to tool results). True when 2+ of: artifact-producing, multi-element
     * structure, hard to manually correct. See qualityGates.ts.
     */
    qualityGate?: boolean;
    /**
     * FEATURE-1600 (Deferred Tool Loading): when true, this tool's schema is
     * NOT included in the default system prompt. The LLM can still discover
     * and activate it via the meta-tool `find_tool`, which injects the full
     * schema for the rest of the session.
     *
     * Mark a tool as deferred when it is specialised (e.g. office-format
     * generation, base queries, expression evaluation) and not needed for
     * most conversations. Leave false for core read / edit / search / agent-
     * control tools that are always relevant.
     */
    deferred?: boolean;
}

/** Alias used by qualityGates.ts for validation. */
export type ToolMetadataEntry = ToolMeta;

/**
 * Group display metadata — labels and icons for tool group headers.
 */
export const GROUP_META: Record<string, { label: string; icon: string }> = {
    read:  { label: 'Read Files',          icon: 'file-text' },
    vault: { label: 'Vault Intelligence',  icon: 'brain' },
    edit:  { label: 'Edit Files',          icon: 'file-pen' },
    web:   { label: 'Web Access',          icon: 'globe' },
    agent: { label: 'Agent Control',       icon: 'list-checks' },
    mcp:   { label: 'MCP Tools',           icon: 'plug-2' },
    skill: { label: 'Plugin Integration',  icon: 'puzzle' },
};

/**
 * Group prompt headers — section titles used in the system prompt.
 */
export const GROUP_PROMPT_HEADERS: Record<string, string> = {
    read:  '**Reading & Searching:**',
    vault: '**Obsidian Intelligence:**',
    edit:  '**Writing & Editing:**',
    web:   '**Web:**',
    agent: '**Agent Control:**',
    mcp:   '**MCP Tools:**',
    skill: '**Plugin Integration:**',
};

/**
 * Ordered list of groups for consistent rendering.
 */
export const GROUP_ORDER: ToolGroup[] = ['read', 'vault', 'edit', 'web', 'agent', 'mcp', 'skill'];

/**
 * Central tool metadata registry.
 */
export const TOOL_METADATA: Record<string, ToolMeta> = {
    // ── Read ──────────────────────────────────────────────────────────────
    read_file: {
        group: 'read', label: 'Read File', icon: 'file-text',
        signature: 'read_file(path)',
        description: 'Read the complete content of a file. Use this before modifying any file.',
        example: 'read_file("Projects/meeting-2024-01-15.md")',
        whenToUse: 'Before any edit, or when user asks to see content. NOT needed if content already in conversation.',
        commonMistakes: 'Re-reading a file whose content was already returned by a previous tool call.',
    },
    read_document: {
        group: 'read', label: 'Read Document', icon: 'file-scan',
        signature: 'read_document(path)',
        description: 'Parse and extract text from Office/data documents (PPTX, XLSX, DOCX, PDF, JSON, XML, CSV). Returns structured Markdown text.',
        example: 'read_document("Reports/Q3-results.pptx")',
        whenToUse: 'For binary document formats. Use read_file for plain text files (.md, .txt, .ts).',
        commonMistakes: 'Using read_file for PPTX/XLSX/DOCX/PDF — that returns raw binary. Use read_document instead.',
    },
    list_files: {
        group: 'read', label: 'List Files', icon: 'folder-open',
        signature: 'list_files(path, recursive?)',
        description: 'List files and folders in a directory. Use "/" for the vault root.',
        example: 'list_files("Projects/", true)',
        whenToUse: 'To discover folder structure. Check vault_context first — it may already show what you need.',
        commonMistakes: 'Using this to find files by content — use search_files or semantic_search instead.',
    },
    search_files: {
        group: 'read', label: 'Search Files', icon: 'search',
        signature: 'search_files(path, pattern, file_pattern?)',
        description: 'Search for text or regex across files. Returns matching lines with line numbers.',
        example: 'search_files("/", "meeting.*agenda", "*.md")',
        whenToUse: 'For exact text or regex matching. Use semantic_search for meaning-based queries.',
        commonMistakes: 'Using broad patterns that return too many results. Be specific with file_pattern.',
    },

    // ── Checkpoints (IMP-01-07-01) ────────────────────────────────────────
    list_checkpoints: {
        group: 'read', label: 'List Checkpoints', icon: 'history',
        signature: 'list_checkpoints(taskId?, path?, limit?, verbose?)',
        description: 'List automatic pre-write snapshots from the checkpoint shadow repository. Returns commitOids for read_checkpoint, diff_checkpoint and restore_checkpoint.',
        example: 'list_checkpoints(undefined, "Notes/Madrid.md")',
        whenToUse: 'When the user wants to recover or inspect an earlier version of a note. Start here to find the commitOid.',
        commonMistakes: 'Guessing a commitOid instead of listing first. Use the path filter to narrow the results to one file.',
    },
    read_checkpoint: {
        group: 'read', label: 'Read Checkpoint', icon: 'file-clock',
        signature: 'read_checkpoint(commitOid, path)',
        description: 'Read the snapshot content of a single file from a specific checkpoint (the state before the matching write tool ran).',
        example: 'read_checkpoint("a1b2c3d4...", "Notes/Madrid.md")',
        whenToUse: 'After list_checkpoints, to inspect what a note looked like at snapshot time.',
        commonMistakes: 'Omitting commitOid or path. Both are required; get the commitOid from list_checkpoints.',
    },
    diff_checkpoint: {
        group: 'read', label: 'Diff Checkpoint', icon: 'file-diff',
        signature: 'diff_checkpoint(commitOid, path?)',
        description: 'Diff a checkpoint snapshot against the current vault state. Without path: per-file summary. With path: line-level diff for that file.',
        example: 'diff_checkpoint("a1b2c3d4...", "Notes/Madrid.md")',
        whenToUse: 'Before restore_checkpoint, to confirm what a restore would change.',
        commonMistakes: 'Restoring without diffing first. Run this to preview the change set.',
    },

    // ── Vault Intelligence ────────────────────────────────────────────────
    get_vault_stats: {
        group: 'vault', label: 'Vault Stats', icon: 'bar-chart-2',
        signature: 'get_vault_stats()',
        description: 'Overview of the vault — note count, folder structure, top tags, recently modified files. Use when you need a broad picture of the vault that isn\'t already in the context block.',
        whenToUse: 'Only when vault_context block is insufficient. Rarely needed.',
        commonMistakes: 'Calling this routinely — vault_context already provides the structure.',
    },
    vault_health_check: {
        group: 'vault', label: 'Health Check', icon: 'shield-check',
        signature: 'vault_health_check(checks?)',
        description: 'Run structural health checks: orphaned notes, missing backlinks, broken links, weak clusters, inconsistent tags. Returns findings with fix suggestions.',
        whenToUse: 'To proactively maintain vault quality. Run periodically or when user asks about vault health.',
        commonMistakes: 'Running after every small change — best used on demand or at session start.',
    },
    get_frontmatter: {
        group: 'vault', label: 'Frontmatter', icon: 'tag',
        signature: 'get_frontmatter(path)',
        description: 'Read all YAML frontmatter fields of a note (tags, aliases, dates, status, custom properties).',
        example: 'get_frontmatter("Projects/active-project.md")',
        whenToUse: 'To check tags, status, dates, or custom properties before updating them.',
        commonMistakes: 'Reading the full file just to check frontmatter — this is faster and cleaner.',
    },
    search_by_tag: {
        group: 'vault', label: 'Search by Tag', icon: 'hash',
        signature: 'search_by_tag(tags[], match?)',
        description: 'Find all notes with given tags. match="any" (OR, default) or match="all" (AND). Tags with or without # both work.',
        example: 'search_by_tag(["meeting", "2024"], "all")',
        whenToUse: 'For tag/category filtering. Use match="all" for AND, match="any" for OR.',
        commonMistakes: 'Using search_files to grep for tags — this handles nested tags and tag inheritance.',
    },
    get_linked_notes: {
        group: 'vault', label: 'Linked Notes', icon: 'link',
        signature: 'get_linked_notes(path, direction?)',
        description: 'Get forward links and backlinks for a note. direction="both" (default), "forward", or "backlinks".',
        example: 'get_linked_notes("Projects/main-project.md", "both")',
        whenToUse: 'To understand note relationships and graph connections.',
        commonMistakes: 'Calling this when you only need to read a linked file — just use read_file directly.',
    },
    get_daily_note: {
        group: 'vault', label: 'Daily Note', icon: 'calendar',
        signature: 'get_daily_note(offset?, create?)',
        description: 'Read the daily note. offset=0 today (default), -1 yesterday, 1 tomorrow. create=true creates it if missing.',
        example: 'get_daily_note(0, true)',
        whenToUse: 'To read or create today\'s daily note. Use offset=-1 for yesterday.',
        commonMistakes: 'Creating a daily note (create=true) when the user only asked to read it.',
    },
    open_note: {
        group: 'vault', label: 'Open Note', icon: 'external-link',
        signature: 'open_note(path, newLeaf?)',
        description: 'Open a note in the Obsidian editor. Use after creating or editing a note to bring it into focus.',
        example: 'open_note("Projects/new-note.md", true)',
        whenToUse: 'After creating or editing — so the user can see the result immediately.',
        commonMistakes: 'Opening every file you touch — only open when the user should see it.',
    },
    semantic_search: {
        group: 'vault', label: 'Semantic Search', icon: 'brain',
        signature: 'semantic_search(query, top_k?)',
        description: 'Find notes by meaning (semantic similarity). Returns the most relevant excerpts for a natural-language query. Requires the Semantic Index to be built in Settings.',
        example: 'semantic_search("project planning methodology", 5)',
        whenToUse: 'For meaning-based queries about vault content ("What do I know about X?").',
        commonMistakes: 'Using this for exact text search — use search_files for literal matches.',
    },
    query_base: {
        group: 'vault', label: 'Query Base', icon: 'database',
        signature: 'query_base(path, view_name?, limit?)',
        description: 'Query an Obsidian Bases file and return the notes that match its filter conditions.',
        example: 'query_base("Databases/meetings.base", "This Week")',
        whenToUse: 'To query structured data from a .base file. Returns filtered, sorted results.',
        commonMistakes: 'Using search_files to query Base contents — this returns structured results directly.',
    },

    // ── Edit ──────────────────────────────────────────────────────────────
    write_file: {
        group: 'edit', label: 'Write File', icon: 'file-plus',
        signature: 'write_file(path, content)',
        description: 'Create a new file or completely replace an existing file\'s content. Use for new files or full rewrites. For PDF/document ingest, use ingest_document instead (it appends the original text automatically).',
        example: 'write_file("Inbox/summary.md", "# Summary\\n\\nKey findings...")',
        whenToUse: 'For new files or complete rewrites. For targeted edits, prefer edit_file. For PDF/document ingest, use ingest_document.',
        commonMistakes: 'Using write_file for PDF/document ingest — use ingest_document instead (it appends the full original text automatically, bypassing token limits). Overwriting an existing file without reading it first.',
    },
    edit_file: {
        group: 'edit', label: 'Edit File', icon: 'file-pen',
        signature: 'edit_file(path, old_str, new_str, expected_replacements?)',
        description: 'Replace a specific string in an existing file. Preferred for targeted edits — preserves surrounding content. old_str must exactly match the file content.',
        example: 'edit_file("note.md", "## Old Heading", "## New Heading")',
        whenToUse: 'For targeted edits that preserve surrounding content. Always read_file first to get exact text.',
        commonMistakes: 'Guessing file content for old_str instead of using the exact text from read_file.',
    },
    append_to_file: {
        group: 'edit', label: 'Append', icon: 'plus-circle',
        signature: 'append_to_file(path, content, separator?)',
        description: 'Append content to the end of a file. Ideal for daily notes, logs, and additive entries.',
        example: 'append_to_file("Journal/daily.md", "## New Entry\\n\\nContent...")',
        whenToUse: 'For daily notes, logs, and additive entries. Avoids the read-edit cycle.',
        commonMistakes: 'Using write_file for append operations — that would overwrite existing content.',
    },
    update_frontmatter: {
        group: 'edit', label: 'Update Frontmatter', icon: 'tag',
        signature: 'update_frontmatter(path, updates, remove?)',
        description: 'Set or update frontmatter fields without touching note content.',
        example: 'update_frontmatter("note.md", {"status": "done", "tags": ["review"]}, ["draft"])',
        whenToUse: 'To set/update YAML frontmatter cleanly without touching note body.',
        commonMistakes: 'Using edit_file on YAML frontmatter — this is safer and handles formatting correctly.',
    },
    create_folder: {
        group: 'edit', label: 'Create Folder', icon: 'folder-plus',
        signature: 'create_folder(path)',
        description: 'Create a new folder (including parent folders).',
        example: 'create_folder("Projects/2024/Q1")',
        whenToUse: 'Before writing files to a new location. Creates parent folders automatically.',
    },
    delete_file: {
        group: 'edit', label: 'Delete File', icon: 'trash-2',
        signature: 'delete_file(path)',
        description: 'Move a file or empty folder to the trash (safe — recoverable).',
        example: 'delete_file("Archive/old-note.md")',
        whenToUse: 'When user explicitly asks to delete. Moves to system trash (recoverable).',
        commonMistakes: 'Deleting without user confirmation — always confirm destructive actions first.',
    },
    move_file: {
        group: 'edit', label: 'Move File', icon: 'move',
        signature: 'move_file(source, destination)',
        description: 'Move or rename a file or folder.',
        example: 'move_file("Inbox/note.md", "Projects/note.md")',
        whenToUse: 'To reorganize vault structure. Obsidian automatically updates wikilinks.',
        commonMistakes: 'Moving to a non-existent folder — create it first with create_folder.',
    },
    restore_checkpoint: {
        group: 'edit', label: 'Restore Checkpoint', icon: 'archive-restore',
        signature: 'restore_checkpoint(commitOid, path?, mode?)',
        description: 'Roll a vault file (or every file a task touched) back to a checkpoint snapshot. Mode "file" restores one path, mode "task" restores all files in the checkpoint and trashes newly created ones.',
        example: 'restore_checkpoint("a1b2c3d4...", "Notes/Madrid.md")',
        whenToUse: 'After list_checkpoints and diff_checkpoint, to recover an earlier version. Takes its own pre-restore snapshot, so the restore itself can be undone.',
        commonMistakes: 'Restoring without confirming the diff first. Mode "task" also trashes files the task newly created.',
    },
    generate_canvas: {
        group: 'edit', label: 'Canvas', icon: 'layout-dashboard',
        signature: 'generate_canvas(output_path, mode, source?, files?, max_notes?, draw_edges?)',
        description: 'Create an Obsidian Canvas (.canvas) file visualizing notes and their wikilink connections. mode: "folder" | "tag" | "backlinks" | "files".',
        example: 'generate_canvas("Maps/project-map.canvas", "folder", "Projects/", undefined, 20, true)',
        whenToUse: 'To visualize note relationships. Use "files" mode with specific paths for custom selections.',
        commonMistakes: 'Omitting max_notes — large folders create unreadable canvases. Set a reasonable limit.',
        qualityGate: true,
    },
    create_excalidraw: {
        group: 'edit', label: 'Excalidraw', icon: 'pencil',
        signature: 'create_excalidraw(output_path, elements, arrows?, title?, layout?)',
        description: 'Create an Excalidraw drawing (.excalidraw.md) with labeled boxes and optional arrows between them. Format is handled automatically — never use write_file for .excalidraw.md files.',
        example: 'create_excalidraw("Drawings/overview.excalidraw.md", [{"id":"a","label":"Start"},{"id":"b","label":"End"}], [{"from":"a","to":"b"}])',
        whenToUse: 'To create any Excalidraw visualization. Always prefer this over write_file for .excalidraw.md files.',
        commonMistakes: 'Using write_file for .excalidraw.md — always use create_excalidraw instead.',
        qualityGate: true,
    },
    create_drawio: {
        group: 'edit', label: 'Drawio Flowchart', icon: 'network',
        signature: 'create_drawio(output_path, nodes, edges?, layout?)',
        description: 'Create a Draw.io / diagrams.net flowchart (.drawio or .drawio.svg) with labeled nodes and directed arrows. The SVG variant renders in Obsidian and opens editable in the drawio-obsidian or obsidian-diagrams-net plugin. NEVER use write_file for .drawio files — the mxfile wrapper is strict.',
        example: 'create_drawio("Diagrams/flow.drawio.svg", [{"id":"a","label":"Idea","shape":"rounded"},{"id":"b","label":"Relevant?","shape":"rhombus"}], [{"from":"a","to":"b","label":"yes"}])',
        whenToUse: 'User asks for a draw.io / diagrams.net diagram. Pick .drawio.svg if the diagram should render as a preview in Obsidian, .drawio for pure data.',
        commonMistakes: 'Using write_file with .drawio.svg and hand-authored XML — the plugin rejects those as "Not a diagram file". Always use create_drawio.',
        qualityGate: true,
    },
    create_base: {
        group: 'edit', label: 'Create Base', icon: 'table-2',
        signature: 'create_base(path, view_name, filter_property?, filter_values?, columns?, sort_property?, sort_direction?, exclude_templates?)',
        description: 'Create an Obsidian Bases (.base) database view file.',
        example: 'create_base("Databases/tasks.base", "Active", "status", ["active", "in-progress"], ["title", "status", "due"], "due", "asc")',
        whenToUse: 'To create a structured database view from vault notes filtered by frontmatter.',
        commonMistakes: 'Using non-existent frontmatter properties — check with get_frontmatter first.',
    },
    update_base: {
        group: 'edit', label: 'Update Base', icon: 'table-properties',
        signature: 'update_base(path, view_name, filter_property?, filter_values?, columns?, sort_property?, sort_direction?)',
        description: 'Add or replace a view in an existing Bases file.',
        example: 'update_base("Databases/tasks.base", "Completed", "status", ["done"], ["title", "completed"], "completed", "desc")',
        whenToUse: 'To add or modify a view in an existing .base file.',
        commonMistakes: 'Creating a new base when you should update an existing one — check if it exists first.',
    },

    // ── Office Document Creation ────────────────────────────────────────
    plan_presentation: {
        group: 'edit', label: 'Plan Presentation', icon: 'layout-list',
        signature: 'plan_presentation(source, template, deck_mode, goal?, audience?)',
        description: 'Plan a presentation from source material and corporate template. Generates a complete deck plan with content for every shape via internal LLM call.',
        example: 'plan_presentation("Notes/Q1-Review.md", "enbw", "reading", "Stakeholder informieren")',
        whenToUse: 'ALWAYS before create_pptx when using corporate templates. Reads source material, selects slide types, generates content for all shapes.',
        commonMistakes: 'Skipping this tool and calling create_pptx directly -- results in empty shapes and placeholder text.',
    },
    create_pptx: {
        group: 'edit', label: 'Create PPTX', icon: 'presentation',
        signature: 'create_pptx(output_path, slides, title?, template?, theme?)',
        description: 'Create a PowerPoint presentation (.pptx) with template-based generation. Supports user templates (.pptx/.potx from vault) or bundled defaults (executive, modern, minimal).',
        example: 'create_pptx("Presentations/quarterly.pptx", [{"title":"Q1 Results","bullets":["Revenue +15%","Users +20k"]}], "Q1 Report", "executive")',
        whenToUse: 'For creating PowerPoint files. Never use write_file or evaluate_expression for .pptx.',
        commonMistakes: 'Using write_file or evaluate_expression for .pptx -- always use create_pptx instead.',
        qualityGate: true,
    },
    create_docx: {
        group: 'edit', label: 'Create DOCX', icon: 'file-text',
        signature: 'create_docx(output_path, sections, title?, theme?)',
        description: 'Create a Word document (.docx) with structured sections, headings, bullets, and tables.',
        example: 'create_docx("Documents/report.docx", [{"heading":"Introduction","body":"Main text..."}])',
        whenToUse: 'For creating Word documents. Never use write_file or evaluate_expression for .docx.',
        commonMistakes: 'Using write_file or evaluate_expression for .docx -- always use create_docx instead.',
        qualityGate: true,
    },
    ingest_document: {
        group: 'edit', label: 'Ingest document', icon: 'file-input',
        signature: 'ingest_document(output_path, header_content, source_path?, attachment_index?)',
        description: 'Create a Markdown source note from a PDF/Office activeDocument. You write the frontmatter + overview, the tool appends the full original text automatically.',
        example: 'ingest_document("Notes/Webb-2026_Report.md", "---\\nKategorie: Quelle\\n---\\n## Ueberblick\\n...", "Attachements/report.pdf")',
        whenToUse: 'For converting PDFs and Office documents into Markdown source notes. Bypasses output token limits by appending the full document text programmatically.',
        commonMistakes: 'Using write_file for PDF ingest (hits token limit for long documents). Not providing source_path or attachment_index.',
        qualityGate: true,
    },
    create_xlsx: {
        group: 'edit', label: 'Create XLSX', icon: 'table',
        signature: 'create_xlsx(output_path, sheets)',
        description: 'Create an Excel spreadsheet (.xlsx) with sheets, data rows, headers, and optional formulas.',
        example: 'create_xlsx("Data/budget.xlsx", [{"name":"Sheet1","headers":["Item","Cost"],"rows":[["Server",500],["Domain",12]]}])',
        whenToUse: 'For creating Excel files. Never use write_file or evaluate_expression for .xlsx.',
        commonMistakes: 'Using write_file or evaluate_expression for .xlsx -- always use create_xlsx instead.',
        qualityGate: true,
    },

    // ── Web ───────────────────────────────────────────────────────────────
    web_fetch: {
        group: 'web', label: 'Fetch URL', icon: 'globe',
        signature: 'web_fetch(url, maxLength?, startIndex?)',
        description: 'Fetch a URL and return its content as Markdown. Use for reading documentation, articles, or any public page. maxLength defaults to 20000 chars; use startIndex to paginate.',
        example: 'web_fetch("https://docs.example.com/api", 5000)',
        whenToUse: 'To read a specific URL. Follow up from web_search results or user-provided links.',
        commonMistakes: 'Fetching vault files via URL — use read_file for local files.',
    },
    web_search: {
        group: 'web', label: 'Web Search', icon: 'search',
        signature: 'web_search(query, numResults?)',
        description: 'Search the web and return titles, URLs, and snippets. Follow up with web_fetch to read a full page. Only available when Web Tools are enabled in settings.',
        example: 'web_search("obsidian plugin dataview API", 5)',
        whenToUse: 'For external/current information ("latest", "aktuell", "im Internet"). NOT for vault content.',
        commonMistakes: 'Searching the web when the answer is in the vault — check vault tools first.',
    },

    // ── Agent Control ─────────────────────────────────────────────────────
    ask_followup_question: {
        group: 'agent', label: 'Ask User', icon: 'message-circle',
        signature: 'ask_followup_question(question, options?)',
        description: 'Ask the user a clarifying question when the request is ambiguous. Provide optional answer choices. Use sparingly — only when genuinely needed.',
        example: 'ask_followup_question("Which format do you prefer?", ["Markdown table", "Bullet list", "Canvas"])',
        whenToUse: 'Only when genuinely ambiguous. Do not ask if you can infer from context.',
        commonMistakes: 'Asking unnecessary questions — act on clear instructions directly.',
    },
    attempt_completion: {
        group: 'agent', label: 'Complete Task', icon: 'check-circle',
        signature: 'attempt_completion(result)',
        description: 'End the task loop after a multi-step tool workflow. Only use this after tool calls — never for simple text responses. The result is a brief internal log entry (e.g. "Created summary note"), not the user-facing answer.',
        example: 'attempt_completion("Created summary note at Projects/summary.md")',
        whenToUse: 'After a multi-step tool workflow to signal completion. NOT for simple text responses.',
        commonMistakes: 'Using this for every response — only use after tool-based work with 2+ tool calls.',
    },
    update_todo_list: {
        group: 'agent', label: 'Update Plan', icon: 'list-checks',
        signature: 'update_todo_list(todos)',
        description: 'Publish your task plan as a visible checklist. Use ONLY for complex tasks with 3+ distinct steps. For simple tasks, execute directly — no plan needed. Format: one item per line with - [ ] (pending), - [~] (in progress), - [x] (done).',
        example: 'update_todo_list("- [x] Read source files\\n- [~] Creating summary\\n- [ ] Open note for user")',
        whenToUse: 'Only for complex tasks with 3+ distinct steps. Not for simple operations.',
        commonMistakes: 'Creating plans for simple 1-2 step tasks — just execute them directly.',
    },
    new_task: {
        group: 'agent', label: 'Sub-agent', icon: 'git-fork',
        signature: 'new_task(mode, message)',
        description: 'Spawn a sub-agent (default slug "agent" -- the standard Agent). The sub-agent runs with a fresh conversation and returns its result. Use for agentic workflows: prompt chaining, orchestrator-worker, evaluator-optimizer, or routing.',
        example: 'new_task("agent", "Research all notes tagged #project and create a summary")',
        whenToUse: 'Only for 5+ step tasks that benefit from context isolation or parallel processing.',
        commonMistakes: 'Delegating simple 1-4 step tasks — do those yourself with your own tools.',
    },
    consult_flagship: {
        group: 'agent', label: 'Consult Flagship', icon: 'lightbulb',
        signature: 'consult_flagship(problem, relevant_context, failed_attempts, constraints)',
        description: 'Escalate ONE hard synthesis step to a flagship-tier advisor subagent (read-only, 3000-token answer cap, max 3 calls per task). Use when the main loop is stuck on a problem that needs a stronger model.',
        example: 'consult_flagship({ problem: "How should I structure the cache invalidation here?", relevant_context: "...", failed_attempts: "...", constraints: "no new deps" })',
        whenToUse: 'A genuinely hard architecture / synthesis question where the current tier keeps producing weak answers. NOT for routine reads or small clarifications.',
        commonMistakes: 'Calling on every uncertainty -- the advisor budget is 3 per task. Use it for the hardest one or two steps, not for every doubt.',
    },

    find_tool: {
        group: 'agent', label: 'Find Tool', icon: 'search',
        signature: 'find_tool(query)',
        description: 'Discover and activate specialised tools not in the default schema. Use when you need office-format creation (pptx/docx/xlsx), diagrams (canvas/excalidraw/drawio), base queries, expression evaluation, source management, or vault-health helpers. Keyword search (case-insensitive) ranks matches by name > label > description and activates the top results for the rest of the session.',
        example: 'find_tool({ query: "pptx" })',
        whenToUse: 'The user asks for something the currently loaded tools do not cover — before giving up, try find_tool with a relevant keyword.',
        commonMistakes: 'Calling find_tool repeatedly for the same query. Once activated, the tool stays available; call it directly on the next turn.',
    },
    // FEAT-24-09 / ADR-116: load a SKILL.md body on demand. Always available
    // (group "read", NOT in DEFERRED_TOOL_NAMES) so loading a skill is one
    // round-trip.
    read_skill: {
        group: 'read', label: 'Read Skill', icon: 'book-open',
        signature: 'read_skill(name)',
        description: 'Load the full step-by-step instructions of a skill listed in the SKILLS directory of your system prompt. Returns the workflow body as a tool result; follow it exactly for the current task.',
        example: 'read_skill({ name: "office-workflow" })',
        whenToUse: 'BEFORE doing the work when the user\'s task matches a skill\'s purpose (read the SKILLS directory in your system prompt). Skip when no skill applies.',
        commonMistakes: 'Loading a skill whose description does not match the task. Re-loading the same skill in the same turn — the body is already in the conversation. Calling read_skill for the system tool catalogue (use find_tool for tools, read_skill for skills).',
    },
    // NOTE: group is 'agent' for mode-level availability (shows in Agent Control tools).
    // The Pipeline classifies this as 'sandbox' ApprovalGroup for approval checks.
    evaluate_expression: {
        group: 'agent', label: 'Sandbox Code', icon: 'code-2',
        signature: 'evaluate_expression(expression, context?, dependencies?)',
        description: 'Execute TypeScript in an isolated sandbox. Provides ctx.vault (read, readBinary, write, writeBinary, list) and ctx.requestUrl. For: batch operations across many files (5+), computations, data transforms, HTTP API calls, npm packages. NOT for: single-file edits (use read_file + edit_file/write_file instead) or binary file generation (DOCX, PPTX, XLSX, PDF).',
        example: 'evaluate_expression("const files = await ctx.vault.list(\'Projects/\'); let count = 0; for (const f of files) { const c = await ctx.vault.read(f); count += (c.match(/- \\\\[ \\\\]/g) || []).length; } return `${count} open tasks`")',
        whenToUse: 'ONLY when built-in tools cannot do the job: batch processing across 5+ files, computations, complex data transforms, HTTP requests, npm packages. NEVER for single-file operations — use read_file + edit_file/write_file instead.',
        commonMistakes: 'Using sandbox for single-file edits instead of read_file + edit_file/write_file. Using sandbox for PPTX/DOCX/XLSX — use create_pptx/create_docx/create_xlsx instead. Writing Python. Using require()/fetch()/Blob/Buffer (not available).',
    },
    // FEAT-29-05: manage_skill removed. Skill authoring now flows through
    // the skill-creator builtin skill plus the standard file tools
    // (write_file / read_file) and run_skill_script for helpers.
    run_skill_script: {
        group: 'agent', label: 'Run Skill Script', icon: 'play-circle',
        signature: 'run_skill_script(skill_name, script_name, args?)',
        description: 'Execute a JavaScript helper script that lives in a self-authored skill folder under scripts/{script_name}.js. The script must export `async function execute(args)`; the return value is JSON-serialized back to the tool_result. Replaces the legacy code_modules pattern (FEAT-29-06).',
        example: 'run_skill_script("newsletter-digest", "aggregate", {"window_days": 7})',
        whenToUse: 'For deterministic, repeatable steps the agent should not have to hallucinate each time (data aggregation, API calls, format conversion, binary file generation). The skill folder bundles the SKILL.md instructions WITH the scripts.',
        commonMistakes: 'Calling for a one-off task that has no persisted script -- use evaluate_expression instead. Passing the path with a .js extension -- script_name is the bare name.',
    },
    // FEAT-29-10: composability tools. Skill workflows can name other
    // skills or MCP-server tools as building blocks. Cycle detection and
    // a max-depth limit (default 5) protect against runaway recursion.
    invoke_skill: {
        group: 'agent', label: 'Invoke Skill', icon: 'git-fork',
        signature: 'invoke_skill(skill_name, args?)',
        description: 'Run another skill as a sub-skill. The sub-skill executes in an isolated subtask (own conversation, own attempt_completion). Its final result is returned as the tool_result. Composition cycles and a max-depth of 5 are enforced.',
        example: 'invoke_skill({ skill_name: "meeting-summary", args: { note: "2026-05-21.md" } })',
        whenToUse: 'When the current skill\'s workflow explicitly names another skill as a building block. NOT for one-off questions that the current skill can answer itself.',
        commonMistakes: 'Calling invoke_skill on a skill that does not exist (check the SKILLS directory in the system prompt or use read_skill). Recursing into the current skill -- the cycle guard will refuse it.',
    },
    invoke_mcp_server: {
        group: 'agent', label: 'Invoke MCP Tool', icon: 'plug-2',
        signature: 'invoke_mcp_server(server_id, tool_name, args?)',
        description: 'Call a tool exposed by a configured MCP server as a first-class step inside a skill workflow. The MCP server\'s approval policy still applies. Composition cycles and a max-depth of 5 are enforced across skill <-> mcp transitions.',
        example: 'invoke_mcp_server({ server_id: "notion", tool_name: "search_page", args: { query: "Q2 OKRs" } })',
        whenToUse: 'When a skill workflow names an MCP-server tool as a building block. Equivalent to use_mcp_tool but participates in composition cycle/depth tracking.',
        commonMistakes: 'Using when use_mcp_tool would do (one-off external call outside a skill workflow). Calling a server that is not configured -- run manage_mcp_server first.',
    },
    manage_mcp_server: {
        group: 'agent', label: 'Manage MCP', icon: 'plug-2',
        signature: 'manage_mcp_server(action, name?, config?)',
        description: 'Add, remove, update, list, or test MCP servers. Supported transports: SSE, streamable-http (no stdio).',
        whenToUse: 'When external tool servers could help beyond built-in tools.',
        commonMistakes: 'Using stdio transport — only SSE and streamable-http are supported in the Electron sandbox.',
    },
    manage_source: {
        group: 'agent', label: 'Manage Source', icon: 'file-code',
        signature: 'manage_source(action, name?, content?)',
        description: 'Manage context sources -- persistent text blocks injected into every conversation.',
        whenToUse: 'When the user wants to always include certain context (project rules, style guides).',
    },
    // FEAT-24-06 / ADR-118 second pass: rarely-needed introspection + settings
    // helpers move to the deferred set (see DEFERRED_TOOL_NAMES below). The
    // metadata entries are required so find_tool can rank and activate them.
    inspect_self: {
        group: 'agent', label: 'Inspect Self', icon: 'eye',
        signature: 'inspect_self(area)',
        description: 'Live introspection of the running plugin (areas: settings, tools, capabilities, code). Returns a Markdown summary of the actual runtime state -- not guesses.',
        whenToUse: 'Before claiming a setting/tool/capability exists, especially when the user asks "what can you do" or after a recent code change. Avoids hallucinating features.',
        commonMistakes: 'Calling inspect_self when a normal read_file or settings tab would answer the question. Calling it on every turn instead of caching the result for the session.',
    },
    update_settings: {
        group: 'agent', label: 'Update Settings', icon: 'sliders-horizontal',
        signature: 'update_settings(action, path?, value?, preset?)',
        description: 'Change plugin settings programmatically. action="set" with path+value, or action="apply_preset" with a permissive/balanced/restrictive preset. API keys are NOT writable here -- use configure_model.',
        whenToUse: 'When the user explicitly asks to toggle an auto-approval flag, switch a feature on/off, or apply a permission preset. Always ask the user before changing a flag that affects safety.',
        commonMistakes: 'Writing to settings without confirming with the user. Trying to set API keys (use configure_model instead).',
    },

    // ── MCP ───────────────────────────────────────────────────────────────
    use_mcp_tool: {
        group: 'mcp', label: 'MCP Tool', icon: 'plug-2',
        signature: 'use_mcp_tool(server_name, tool_name, arguments)',
        description: 'Call a tool on an MCP server configured in settings.',
        example: 'use_mcp_tool("my-server", "get_data", {"query": "test"})',
        whenToUse: 'For tools provided by configured MCP servers. Check Connected servers list first.',
    },
    // FEAT-24-06 / ADR-118: on-demand companion to the truncated MCP listing.
    read_mcp_tool: {
        group: 'mcp', label: 'Read MCP Tool', icon: 'help-circle',
        signature: 'read_mcp_tool(server, name)',
        description: 'Read the full description and a compact input-schema summary of a single MCP tool. Use when the MCP listing shows a truncated description and you need the full text before calling use_mcp_tool.',
        example: 'read_mcp_tool("notion", "create_page")',
        whenToUse: 'When the MCP tool listing shows "... [full description: read_mcp_tool({ server, name })]" and you need the rest of the description or the input schema.',
        commonMistakes: 'Reading a tool whose short description already covers what you need. Re-reading the same tool more than once per session -- the result stays in the conversation.',
    },

    // ── Plugin Skills (PAS-1) ──────────────────────────────────────────
    execute_command: {
        group: 'skill', label: 'Execute Command', icon: 'terminal',
        signature: 'execute_command(command_id)',
        description: 'Execute an Obsidian command by its ID. Use this to trigger plugin functionality. Check PLUGIN SKILLS in your context for available commands.',
        example: 'execute_command("daily-notes:open")',
        whenToUse: 'For Obsidian-native plugin commands (templates, daily notes, note organization). Check .skill.md for command IDs.',
        commonMistakes: 'Calling without checking if the plugin is enabled. Read PLUGIN SKILLS section first.',
    },
    resolve_capability_gap: {
        group: 'skill', label: 'Resolve Gap', icon: 'search',
        signature: 'resolve_capability_gap(capability, context?)',
        description: 'When no tool or skill matches a task, check if a disabled or previously installed Obsidian plugin could help.',
        example: 'resolve_capability_gap("create mindmap visualization")',
        whenToUse: 'When no existing tool or skill matches the task. Discovers disabled/uninstalled plugins.',
        commonMistakes: 'Using this for tasks you can already handle with existing tools.',
    },
    enable_plugin: {
        group: 'skill', label: 'Enable Plugin', icon: 'plug',
        signature: 'enable_plugin(plugin_id, enable?)',
        description: 'Enable or disable an installed Obsidian community plugin. Use when a disabled plugin could help with the task and the user agrees to activate it.',
        example: 'enable_plugin("obsidian-excalidraw-plugin", true)',
        whenToUse: 'When a disabled plugin is needed. Ask the user before enabling.',
        commonMistakes: 'Enabling without checking if installed — use resolve_capability_gap first.',
    },
    probe_plugin: {
        group: 'skill', label: 'Probe Plugin', icon: 'scan-search',
        signature: 'probe_plugin(plugin_id)',
        description: 'Live read of a plugin\'s current commands and API methods. Use before the first call_plugin_api or execute_command on a freshly enabled plugin, or when the PLUGIN SKILLS section looks stale.',
        example: 'probe_plugin("dataview")',
        whenToUse: 'Just-enabled lazy plugin (Dataview, Templater), post-update command rename, or before first call to a plugin you have not used this session.',
        commonMistakes: 'Skipping probe and guessing command IDs from the stale PLUGIN SKILLS list -- if a probe disagrees, trust the probe.',
    },
    call_plugin_api: {
        group: 'skill', label: 'Plugin API', icon: 'code',
        signature: 'call_plugin_api(plugin_id, method, args?)',
        description: 'Call a JavaScript API method on a plugin instance. Use for Dataview queries, Omnisearch searches, MetaEdit updates, and any plugin with a JS API.',
        example: 'call_plugin_api("dataview", "pages", {"query": "#meeting AND -#archived"})',
        whenToUse: 'For structured data from plugins (Dataview, Omnisearch, MetaEdit). Returns data, not UI.',
        commonMistakes: 'Using execute_command when you need data — commands produce UI actions, not data.',
    },
    execute_recipe: {
        group: 'skill', label: 'Recipe', icon: 'chef-hat',
        signature: 'execute_recipe(recipe_id, params)',
        description: 'Execute a pre-defined recipe for external tools (Pandoc PDF/DOCX export). No arbitrary shell -- only validated recipes.',
        example: 'execute_recipe("pandoc-pdf", {"input": "note.md", "output": "note.pdf"})',
        whenToUse: 'For CLI tool integrations (Pandoc, LaTeX). Check dependency availability first.',
        commonMistakes: 'Writing fake .pdf/.docx content instead of using the proper export recipe.',
    },

    // IMP-24-06-01: drift-closing entries for tools that were in the ToolName
    // union but had no TOOL_METADATA entry. Without a metadata entry they are
    // not described in the system-prompt TOOLS section, and find_tool cannot
    // rank them either. Discovered by AUDIT-020 F-1.
    anti_echo_search: {
        group: 'web', label: 'Anti-Echo Search', icon: 'search-x',
        signature: 'anti_echo_search(cluster, source_domain)',
        description: 'Active web search for counter-positions to a cluster dominated by one source domain. Returns findings that contradict or qualify the dominant view.',
        whenToUse: 'When a knowledge cluster looks one-sided and the user asked for balance. Used by the periodic knowledge-maintenance job.',
    },
    configure_model: {
        group: 'agent', label: 'Configure Model', icon: 'cpu',
        signature: 'configure_model(action, ...)',
        description: 'Add, select, or test an LLM model. Manages the activeModels list and activeModelKey from the agent loop.',
        whenToUse: 'During onboarding or when the user asks to switch to a different LLM. Prefer update_settings for non-model toggles.',
    },
    ingest_deep: {
        group: 'edit', label: 'Ingest Deep', icon: 'layers',
        signature: 'ingest_deep(source_path, ...)',
        description: 'Deep-Ingest of a source note (BA-25 Karpathy pattern): creates a source note plus structured downstream notes (concepts, claims, evidence). Heavy operation, writes multiple notes.',
        whenToUse: 'After ingest_triage decided that a source warrants deep ingestion.',
        commonMistakes: 'Running deep on every read source. Use triage first; deep is for sources you will reference repeatedly.',
    },
    ingest_triage: {
        group: 'edit', label: 'Ingest Triage', icon: 'filter',
        signature: 'ingest_triage(source_path, ...)',
        description: 'Quick triage of a source (article, PDF, vault note). Decides keep/skim/skip and writes a one-line decision into the triage log.',
        whenToUse: 'Before deciding whether to call ingest_deep on a new source.',
    },
    list_memory_source_notes: {
        group: 'read', label: 'List Memory Sources', icon: 'list',
        signature: 'list_memory_source_notes(only_pending?)',
        description: 'List vault notes registered as memory-source. Read-only. Returns path, registration timestamp, last extraction.',
        whenToUse: 'When the user asks which notes feed long-term memory, or to find notes awaiting re-extraction.',
    },
    list_pinned_conversations: {
        group: 'read', label: 'List Pinned Chats', icon: 'star',
        signature: 'list_pinned_conversations(limit?)',
        description: 'List chat conversations the user pinned to memory (via Star button or mark_for_memory). Read-only. Complementary to list_memory_source_notes.',
        whenToUse: 'When the user asks which chats are saved to memory, or which conversations contributed facts to long-term memory.',
    },
    mark_for_memory: {
        group: 'agent', label: 'Mark for Memory', icon: 'bookmark',
        signature: 'mark_for_memory(scope?)',
        description: 'Save the current sidebar conversation (or the named scope) to long-term memory immediately. Triggers extraction now instead of at session end.',
        whenToUse: 'When the conversation contained a fact, decision, or preference the user wants persisted right away.',
    },
    mark_note_as_memory_source: {
        group: 'edit', label: 'Mark Note as Memory', icon: 'bookmark-plus',
        signature: 'mark_note_as_memory_source(note_path)',
        description: 'Mark a vault note as memory-source. The note content gets extracted into the long-term memory store on the next maintenance pass.',
        whenToUse: 'For notes that contain durable facts (project briefs, glossaries, policy notes) you want the agent to remember beyond the current chat.',
    },
    read_agent_logs: {
        group: 'agent', label: 'Read Agent Logs', icon: 'scroll',
        signature: 'read_agent_logs(action?, level?, since?, pattern?)',
        description: 'Read the agent\'s own console logs (debug, warn, error) from the ring buffer. Supports filtering by level, time, and pattern.',
        whenToUse: 'For self-debugging when something looks off and the user wants the agent to introspect what happened.',
    },
    recall_memory: {
        group: 'agent', label: 'Recall Memory', icon: 'brain',
        signature: 'recall_memory(query, top_k?)',
        description: 'Search the user memory store (Memory v2 facts + edges) by cosine + keyword. Returns ranked facts with sources.',
        whenToUse: 'When the user references something likely stored in long-term memory ("what did we decide about X?") and the conversation history alone is not enough.',
        commonMistakes: 'Confusing recall_memory (facts) with search_history (raw past messages). recall_memory is narrower and faster.',
    },
    search_history: {
        group: 'read', label: 'Search History', icon: 'history',
        signature: 'search_history(query, top_k?)',
        description: 'Keyword-search past conversations for messages that match the query. Returns matching messages with source conversation, role, timestamp, and a clickable obsidian:// link.',
        whenToUse: 'When the user references "we talked about X earlier" or "find that chat where I mentioned Y". Much wider than recall_memory.',
    },
    switch_agent: {
        group: 'agent', label: 'Switch Agent', icon: 'shuffle',
        signature: 'switch_agent(mode_slug, reason?)',
        description: 'Switch to a different Agent when the current task is better handled by another. Each Agent has its own role definition + tool set; switching swaps both from the next iteration.',
        whenToUse: 'When the task profile changes during a conversation and a different role / toolset would help.',
    },
    unmark_note_as_memory_source: {
        group: 'edit', label: 'Unmark Memory Source', icon: 'bookmark-minus',
        signature: 'unmark_note_as_memory_source(note_path)',
        description: 'Remove the memory-source marker from a vault note. The note stays in the vault; only the extraction binding is removed.',
        whenToUse: 'When a previously useful source has become noise or stale and should stop feeding long-term memory.',
    },
    update_soul: {
        group: 'agent', label: 'Update Soul', icon: 'user-circle',
        signature: 'update_soul(action, key?, value?)',
        description: 'Add, update, or replace an entry in the curated Soul (L2): values, principles, lessons, working preferences.',
        whenToUse: 'When the user shares a durable principle ("I always X") or lesson learned that should shape future agent behaviour.',
        commonMistakes: 'Storing transient context as Soul. Soul is for stable identity / values; use mark_for_memory for situational facts.',
    },
};

/**
 * FEATURE-1600: tools whose schemas are NOT included in the default system
 * prompt. The LLM discovers them via the meta-tool `find_tool`, which
 * activates the schema for the rest of the session.
 *
 * Maintained as a list (rather than a `deferred: true` flag on every entry)
 * to keep TOOL_METADATA compact and the deferred set reviewable at a glance.
 * Categories: office-format generation, base operations, vault-stat helpers,
 * self-development, niche agent utilities. Core read/edit/search/agent-control
 * tools stay in the default prompt.
 */
export const DEFERRED_TOOL_NAMES: ReadonlySet<string> = new Set([
    // Vault: rarely-needed intelligence helpers
    'get_vault_stats',
    'vault_health_check',
    'search_by_tag',
    'get_linked_notes',
    'get_daily_note',
    'open_note',
    'query_base',
    // Vault: specialised writers
    'generate_canvas',
    'create_excalidraw',
    'create_drawio',
    'create_base',
    'update_base',
    // Checkpoints (IMP-01-07-01): rarely-needed recovery helpers, same
    // bucket as get_vault_stats/vault_health_check. find_tool hits
    // "checkpoint" strongly in all four names, so deferring them saves
    // four schemas per prompt without hurting discoverability.
    'list_checkpoints',
    'read_checkpoint',
    'diff_checkpoint',
    'restore_checkpoint',
    // Office / presentation pipeline
    // Note v2.10.0: create_xlsx, create_docx, create_pptx removed from the
    // deferred set. Even though their schemas add ~150 tokens to every
    // prompt, the find_tool round-trip they used to require invalidated
    // the prompt cache on every Office tool call (40k+ cache-write tokens
    // = ~75 cents at Opus). For users who create Office files even
    // occasionally, the always-loaded schemas pay for themselves. The
    // less-frequent plan_presentation and ingest_document stay deferred.
    'plan_presentation',
    'ingest_document',
    // Self-development + niche agent utilities
    'evaluate_expression',
    'manage_source',
    'manage_mcp_server',
    'resolve_capability_gap',
    // FEAT-24-06 / ADR-118 second pass: rarely-needed introspection + settings.
    'inspect_self',
    'update_settings',
]);

/** FEATURE-1600: true when a tool is deferred and must be activated via find_tool. */
export function isDeferredTool(toolName: string): boolean {
    return DEFERRED_TOOL_NAMES.has(toolName);
}

/**
 * Get tools for a specific group.
 */
export function getToolsForGroup(group: ToolGroup): Array<[string, ToolMeta]> {
    return Object.entries(TOOL_METADATA).filter(([, meta]) => meta.group === group);
}

/**
 * Build the system prompt tool section for the given groups.
 *
 * ADR-090 Lever 8 (Prompt-Schrumpfung): default mode is COMPACT -- one line per
 * tool (signature + description). Examples / whenToUse / commonMistakes are
 * pulled on demand via find_tool(name). This drops the tool section from
 * ~6k tokens to ~1.5k tokens without losing capability discovery: the agent
 * still sees every tool, just not the full docs.
 *
 * Pass includeExamples=true only when full docs are explicitly needed
 * (e.g. find_tool result, debugging tools).
 *
 * @param groups - Tool groups to include
 * @param includeExamples - Default false (compact). True emits Example / Best for / Avoid lines.
 */
export function buildToolPromptSection(
    groups: ToolGroup[],
    includeExamples = false,
    /**
     * FEAT-24-04 / ADR-113: when set, tools are filtered to the
     * intersection of this allowlist and the group tools. Used by
     * subagent profile spawns to restrict the tool surface.
     */
    allowedNames?: string[],
): string {
    const allowSet = allowedNames && allowedNames.length > 0 ? new Set(allowedNames) : undefined;
    const parts: string[] = [];
    for (const group of GROUP_ORDER) {
        if (!groups.includes(group)) continue;
        const header = GROUP_PROMPT_HEADERS[group];
        let tools = getToolsForGroup(group);
        if (allowSet) tools = tools.filter(([name]) => allowSet.has(name));
        if (tools.length === 0) continue;
        const lines = tools.map(([, meta]) => {
            let line = `- ${meta.signature}: ${meta.description}`;
            if (includeExamples) {
                if (meta.example)        line += `\n  Example: ${meta.example}`;
                if (meta.whenToUse)      line += `\n  Best for: ${meta.whenToUse}`;
                if (meta.commonMistakes) line += `\n  Avoid: ${meta.commonMistakes}`;
            }
            return line;
        });
        parts.push(`${header}\n${lines.join('\n')}`);
        parts.push('');
    }
    if (!includeExamples) {
        parts.push('Need an example or to know when to pick a specific tool? Call find_tool(name) -- it returns the full documentation for that tool. Do not guess.');
    }
    return parts.join('\n');
}
