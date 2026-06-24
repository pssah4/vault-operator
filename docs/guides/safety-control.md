---
title: Safety and control
description: Auto-approve, checkpoints, approvals, and the operation log. How to stay in control of what Vault Operator does.
---

# Safety and control

Nothing changes in your vault without your knowledge.

See also: [Checkpoints](../concepts/checkpoints.md) and [Governance](../concepts/governance.md).

## The approval system

Vault Operator is fail-closed by default. It asks before any action that modifies your vault. Every write, edit, delete, or external call triggers an approval card in the chat.

### What an approval card shows

When Vault Operator wants to do something, a card appears with the tool name and a short preview:

- **Write a file:** path and a truncated preview of the content
- **Edit a file:** path and a truncated preview of the edit
- **Delete a file:** which file will be removed
- **Move or rename:** source and destination paths

Click the card to expand the full payload before deciding. You can Allow once (approve this specific action) or Always allow (auto-approve this category from now on).

## Auto-approve categories

You can enable auto-approve per category. Go to **Settings > Vault Operator > Agents > Auto-approve** to see the full list. The categories map one-to-one to the seven tool groups the agent uses internally.

| Category | What it covers | Risk level |
|----------|----------------|------------|
| **read** | Reading files, listing folders, searching, reading checkpoints | Low (nothing changes) |
| **vault** | Frontmatter, tag and link lookups, semantic search, memory recall, daily notes | Low (read-side queries) |
| **edit** | Writing, editing, moving, deleting files, frontmatter updates, canvas, office docs, ingest, restore checkpoint | High (changes your content and structure) |
| **web** | Fetching pages, web search, anti-echo search | Medium (external data enters the vault) |
| **agent** | Followup questions, completion signal, todo list, subtasks, mode and settings changes, plugin discovery, skill invocation | Medium (controls agent behaviour and settings) |
| **mcp** | Calling external MCP tools | Medium (depends on the connected server) |
| **skill** | Shell commands, recipes, plugin API calls, capability resolution, sandbox scripts | High (runs generated or scripted code) |

:::warning Permissive combination
If you auto-approve both **web** and **edit**, Vault Operator shows a security warning. The agent could fetch content from the internet and write it to your vault without asking.
:::

## Reviewing changes

### Before the edit

The approval card shows the tool name and a truncated preview. Expand the card to see the full path and payload before approving.

### After the edit

Once the agent runs the tool, the chat shows a result row with a `+N / -M` diff badge for files that were edited. Click the row to inspect the full diff.

### The edit review panel

Since v3.0.0, the same review panel handles every change that touches a note. It appears for sidebar tasks after the agent finishes, and for inline-chat actions like Rewrite or Translate (see [Inline chat](inline-chat.md)).

The panel layout:

- Side-by-side aligned diff. The left column shows the original content. The right column shows the proposed content.
- Line numbers and `+` / `−` gutters on both sides, so you can see exactly which lines were added or removed.
- The right column is editable (`contenteditable` with plaintext-only input). Click in and type to adjust the proposal before applying.
- A live `+N / −N` counter above the right column updates as you edit.
- When the change spans more than one file, a file list on the left lets you switch between them. Each file has a "Diese Datei skippen" toggle to skip writing that file.
- The footer offers two actions: "Verwerfen" discards everything. "Anwenden" writes the right-column content to disk.

For sidebar tasks, the panel opens automatically once the agent finishes a turn that wrote files. The modal title reads "Änderungen prüfen". For inline-chat actions, the panel opens automatically once the model finishes streaming.

### Checkpoint view

The same panel runs in checkpoint mode when you open a past snapshot. In this mode the right column is read-only and shows the snapshot content. The footer replaces "Anwenden" with "Wiederherstellen", which restores the snapshot to the vault.

Inline-chat edits also create checkpoints under a stable per-note task id, so every inline Rewrite or Translate is undoable from the inline checkpoint marker in the chat (Diff, Undo this, Undo from here, More menu). See [Inline chat](inline-chat.md) for the marker controls.

## Checkpoints and undo

Vault Operator creates a checkpoint before the first modification to any file in a task. Checkpoints live in a shadow git repository (via isomorphic-git) that sits next to your vault, not inside it, so your own git history is untouched. For details see [Checkpoints](../concepts/checkpoints.md).

### The undo bar

After every task that modified files, an undo bar appears with one button:

- **"Undo all changes":** restore every file to its pre-task state in one click

In parallel, the edit review panel (see above) opens automatically so you can inspect, edit, and apply per file.

:::tip Undo is always available
Even if you auto-approve everything, the checkpoint system records the state before changes. You can always undo after the fact.
:::

### How checkpoints work

1. Vault Operator snapshots each file before its first modification in a task.
2. The shadow repo stores the snapshot as a git commit.
3. If you undo, the original content comes back from the snapshot.
4. Files that were newly created (did not exist before the task) get deleted on undo.

Checkpoints are automatic. There is nothing to configure.

## The operation log

Every tool call is recorded in a daily log file.

Each entry records:

- Timestamp
- Tool name and parameters (sensitive values like API keys are redacted)
- Success or failure
- Duration

**Location:** JSONL files in your vault under `.vault-operator/data/logs/`, one per day, named by date (for example `2026-03-31.jsonl`).

**Retention:** Logs are kept for 30 days, then deleted. Browse recent logs in **Settings > Vault Operator > Advanced > Log**.

:::info No file content in logs
The operation log records that a file was read or written, but not the full content. It logs path and content length, not the actual text.
:::

## The ignore file

Create `.obsidian-agentignore` in your vault root to define paths the agent must never access. Same syntax as `.gitignore`:

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

Both files are protected themselves. The agent cannot modify or delete them. See [Governance](../concepts/governance.md) for the full ignore and protect model.

:::tip Always-blocked paths
Vault Operator never accesses `.git/`, the Obsidian workspace cache, or internal config files, no matter how you configure it.
:::

## Best practices

1. Start with approvals on. Leave auto-approve disabled until you are comfortable with how Vault Operator works. Watch the approval cards to learn what the agent does.

2. Enable categories gradually. Turn on `read` first (low risk), then add others as you build trust. Keep `edit` and `skill` on manual approval longer.

3. Avoid the permissive combination. Do not auto-approve `web` and `edit` at the same time unless you fully trust the content sources.

4. Use the ignore file. If you have sensitive notes (financial records, medical info, private journals), add them to `.obsidian-agentignore` before giving the agent broad permissions.

5. Review the operation log now and then. A quick scan of recent logs shows what the agent has been doing and catches anything off.

6. Back up your vault. Checkpoints give you undo inside Vault Operator, but a proper vault backup (Obsidian Sync, git, or a file-system backup) protects against everything else.

7. Run read-only sessions when you only want answers. Two paths that work today:
   - Leave auto-approve off for `edit`, `skill`, and `mcp`, and decline any write card. The agent then has to ask for every change.
   - Open the tool picker (knife icon in the chat header) and disable the `edit`, `web`, `agent`, `mcp`, and `skill` groups for the current agent. The override persists in `modeToolOverrides` and survives reloads.

   The New agent modal currently grants every tool group on create. Per-agent tool filtering happens through the tool picker override, not through the create form.
