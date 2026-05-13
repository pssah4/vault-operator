---
title: Vault Operations
description: How Vault Operator reads, writes, searches, and structures your vault.
---

# Vault Operations

Vault Operator can read, write, search, and organize files across your entire vault.

**You will need:** Vault Operator installed, one model configured, and Agent mode active (writes need Agent mode). Auto-approval is off by default, which is the safe choice while you learn how the agent edits files.

**Use this guide when:** you want to know which read, write, edit, search, and structure tools the agent has, when each fires, and how checkpoints protect you from a bad write.

**You will know it works when:** the agent can read a note you asked about, edit a single section without rewriting the whole file, move or rename a note with backlinks intact, and you can undo any write from the checkpoint history.

## How it works

The agent does not access your vault directly. It uses tools: small, single-purpose functions. When you ask it to find a note or create a file, it picks the right tools and calls them on your behalf.

Every tool call shows up in the [activity block](/guides/chat-interface#activity-blocks), and write operations need [approval](/guides/safety-control) unless you enable auto-approve.

## Reading your vault

These tools let the agent look at your files without changing anything. They work in both Ask and Agent mode.

| Tool | What it does |
|------|-------------|
| **read_file** | Opens a note and reads its content |
| **list_files** | Lists files and folders in a given path |
| **search_files** | Finds notes by text content (keyword search) |
| **search_by_tag** | Finds all notes with a specific tag |
| **get_frontmatter** | Reads the YAML metadata at the top of a note |
| **get_linked_notes** | Follows wikilinks and backlinks from a note |
| **get_daily_note** | Opens today's daily note (or a specific date) |

### Examples

- *"What notes do I have in the Projects folder?"* (uses `list_files`)
- *"Find everything I wrote about client onboarding"* (uses `search_files`)
- *"Show me all notes tagged #review"* (uses `search_by_tag`)
- *"What links to my quarterly goals note?"* (uses `get_linked_notes`)
- *"Read today's daily note"* (uses `get_daily_note`)

:::tip Semantic search goes further
Keyword search matches exact words. To find notes by meaning (e.g., "notes about improving sleep" finding a note titled "Evening Routine"), see [Knowledge Discovery](/guides/knowledge-discovery).
:::

## Writing and editing

These tools modify your vault. They only work in Agent mode and need approval by default.

| Tool | What it does |
|------|-------------|
| **write_file** | Creates a new note or replaces an existing one |
| **edit_file** | Makes targeted changes to part of a note |
| **append_to_file** | Adds content to the end of an existing note |
| **update_frontmatter** | Changes YAML metadata fields |

### Examples

- *"Create a note summarizing our Q1 results"* (uses `write_file`)
- *"Replace the second paragraph in @project-brief with a shorter version"* (uses `edit_file`)
- *"Add today's action items to @task-list"* (uses `append_to_file`)
- *"Set the status field to 'complete' in @project-brief"* (uses `update_frontmatter`)

:::info Checkpoints protect your files
Before any write operation, Vault Operator saves a snapshot. If something goes wrong, click Undo in the [undo bar](/guides/chat-interface#the-undo-bar) to restore the original.
:::

## Organizing files and folders

These tools help you restructure your vault.

| Tool | What it does |
|------|-------------|
| **create_folder** | Creates a new folder (including nested paths) |
| **move_file** | Moves a note to a different folder or renames it |
| **delete_file** | Sends a note to the Obsidian trash |

### Examples

- *"Create an Archive/2025 folder and move all notes tagged #archived there"* (uses `create_folder` + `move_file`)
- *"Rename @old-project-name to new-project-name"* (uses `move_file`)
- *"Delete all empty notes in the Inbox folder"* (uses `delete_file`)

:::warning Deletion uses Obsidian trash
Deleted files go to Obsidian's trash (`.trash` folder), not permanent deletion. You can recover them from there.
:::

## Vault statistics

The agent can give you an overview of your vault using **get_vault_stats**:

- Total number of notes, folders, and attachments
- Vault size
- Tag distribution
- Recently modified files

**Example:** *"Give me a summary of my vault: how many notes, what are the most used tags?"*

## Canvas and visual maps

Vault Operator can create visual representations of your notes and their relationships.

| Tool | What it does |
|------|-------------|
| **generate_canvas** | Creates an Obsidian Canvas (.canvas) with cards and connections |
| **create_excalidraw** | Creates an Excalidraw drawing (requires the Excalidraw plugin) |

**Example:** *"Create a canvas map showing all notes in the Projects folder and their connections"*

## Bases (structured data)

Bases let you work with your notes as structured data, similar to a database view.

| Tool | What it does |
|------|-------------|
| **create_base** | Creates a new Base from notes matching certain criteria |
| **query_base** | Queries an existing Base with filters and sorting |
| **update_base** | Modifies entries in a Base |

**Example:** *"Create a Base of all notes tagged #book with columns for author, rating, and status from frontmatter"*

:::info Requires Obsidian 1.8+
Bases use Obsidian's built-in Bases feature. Make sure your Obsidian version supports it.
:::

## Tips

1. Be specific about paths. "The Projects folder" is clearer than "my project notes."
2. Use @-mentions for specific files. The agent doesn't have to search for them then.
3. Let the agent chain tools. A request like "find all notes about X, summarize them, and create a new note with the summary" uses multiple tools automatically.
4. Check the activity block to see which files were read or changed.
5. Start in Ask mode if you just want to explore. Switch to Agent mode when you're ready to make changes.

## Next steps

- [Knowledge Discovery](/guides/knowledge-discovery): Semantic search and the knowledge graph
- [Chat Interface](/guides/chat-interface): Attachments, history, and shortcuts
- [Office Documents](/guides/office-documents): Create PPTX, DOCX, and XLSX from your notes
