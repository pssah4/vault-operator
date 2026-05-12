---
title: Safety & Control
description: Permissions, checkpoints, approvals, and the audit log. How to stay in control of what Vault Operator does.
---

# Safety & Control

Nothing changes in your vault without your knowledge.

## The approval system

Vault Operator is fail-closed by default. It asks before any action that modifies your vault. Every write, edit, delete, or external call triggers an approval card in the chat.

### What an approval card shows

When Vault Operator wants to do something, a card appears showing exactly what:

- **Write a file:** the full content that will be written
- **Edit a file:** a diff with lines added and removed
- **Delete a file:** which file will be removed
- **Move/rename:** source and destination paths

You can Allow once (approve this specific action) or Always allow (auto-approve this category from now on).

## Permission categories

You can enable auto-approve per category. Go to **Settings > Vault Operator > Permissions** to see the full list:

| Category | What it covers | Risk level |
|----------|---------------|-----------|
| **Read operations** | Reading files, listing folders, searching | Low (nothing changes) |
| **Note edits** | Editing existing Markdown notes | Medium (changes your content) |
| **Vault changes** | Creating, moving, or deleting files and folders | Medium-High (structural changes) |
| **Web operations** | Fetching web pages, searching the internet | Low-Medium (external data access) |
| **MCP calls** | Calling external tools via the Model Context Protocol | Medium (depends on the tool) |
| **Subtasks** | Spawning background sub-agents | Low (inherits parent permissions) |
| **Plugin skills** | Running built-in skill workflows | Low (guided multi-step tasks) |
| **Plugin API reads** | Reading Obsidian plugin data | Low (read-only) |
| **Plugin API writes** | Modifying Obsidian plugin settings | High (can change app behavior) |
| **Recipes** | Running multi-step automated workflows | High (many actions in sequence) |
| **Sandbox** | Executing code in the isolated sandbox | High (runs generated code) |

:::warning Permissive mode
If you auto-approve both web operations and note edits (or vault changes), Vault Operator shows a security warning. This combination means the agent could fetch content from the internet and write it to your vault without asking.
:::

## Reviewing changes

### The approval card

Before any write operation, an approval card appears in the chat. For file edits, it shows a color-coded diff with a badge like `+3 / -1` for lines added and removed. Read the diff before approving.

### The diff review modal

After a task finishes, you can review all changes at once:

1. The undo bar appears below the last message
2. Click "Review changes" to open the diff review modal
3. For each file, you see every change grouped by section (headings, paragraphs, code blocks)
4. Decide per section: Keep, Undo, or Edit (modify the change manually)

This gives you fine-grained control. Keep most of a task's work while reverting one specific paragraph.

## Checkpoints and undo

Vault Operator creates a checkpoint before the first modification to any file in a task. Checkpoints live in a shadow repository (via isomorphic-git) that does not touch your own git history.

### The undo bar

After every task that modified files, an undo bar appears:

- **"Undo all changes":** restore every file to its pre-task state in one click
- **"Review changes":** open the diff review modal for per-file decisions

:::tip Undo is always available
Even if you auto-approve everything, the checkpoint system records the state before changes. You can always undo after the fact.
:::

### How checkpoints work

1. Vault Operator snapshots each file before its first modification in a task
2. The snapshot is stored as a git commit in the shadow repository
3. If you undo, the original content is restored from the snapshot
4. Files that were newly created (didn't exist before the task) are deleted on undo

Checkpoints are automatic. There is nothing to configure.

## The operation log

Every tool call is recorded in a daily audit log file.

Each entry records:
- Timestamp
- Tool name and parameters (sensitive values like API keys are redacted)
- Success or failure
- Duration

**Location:** JSONL files (one per day) in your plugin directory under `logs/`, named by date (e.g. `2026-03-31.jsonl`).

**Retention:** Logs are kept for 30 days, then automatically deleted. Browse recent logs in **Settings > Vault Operator > Log**.

:::info No file content in logs
The operation log records that a file was read or written, but not the full content. It logs file path and content length, not the actual text.
:::

## The ignore file

Create `.obsidian-agentignore` in your vault root to define paths the agent should never access. Same syntax as `.gitignore`:

```
# Private journal: agent cannot read or modify these
journal/
diary-*.md

# Credentials and sensitive files
secrets/
*.env
```

There is also `.obsidian-agentprotected` for files the agent can read but never write:

```
# Templates: agent can reference but not modify
templates/
```

Both files are protected themselves. The agent cannot modify or delete them.

:::tip Always-blocked paths
Vault Operator never accesses `.git/`, the Obsidian workspace cache, or internal config files, no matter how you configure it.
:::

## Best practices

1. Start with approvals on. Leave auto-approve disabled until you are comfortable with how Vault Operator works. Watch the approval cards to learn what the agent does.

2. Enable categories gradually. Auto-approve reads first (low risk), then note edits once you trust the agent's judgment. Keep vault changes and sandbox on manual approval longer.

3. Avoid the permissive combination. Don't auto-approve web operations and writes at the same time unless you fully trust the content sources.

4. Use the ignore file. If you have sensitive notes (financial records, medical info, private journals), add them to `.obsidian-agentignore` before giving the agent broad permissions.

5. Review the operation log now and then. A quick scan of recent logs shows what the agent has been doing and catches anything weird.

6. Back up your vault. Checkpoints give you undo inside Vault Operator, but a proper vault backup (Obsidian Sync, git, or a file-system backup) protects against everything else.

7. Use Ask mode for exploration. When you just want answers without changes, switch to Ask mode. It is read-only, so nothing in your vault can be modified.
