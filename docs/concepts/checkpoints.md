---
title: Checkpoints and Undo
description: How Vault Operator snapshots your vault before changes and lets you undo any agent action with one click.
---

# Checkpoints and undo

Vault Operator can write to your vault. That is the point. But every write is reversible. Before the agent touches a file for the first time in a task, it snapshots the file. If you do not like what happened, you click "Undo" and the file goes back.

This page explains how the snapshot system works, what gets captured, what does not, and when it kicks in.

## When a checkpoint is created

A checkpoint is created in two situations:

1. **Pre-write checkpoint.** Just before the first modification to any file in a task, Vault Operator captures the file's current state.
2. **Pre-task checkpoint.** On the first user message of a task, Vault Operator captures the full set of files the task is likely to touch (based on attached files, `@`-mentions, and the active note).

If a task modifies five files, you get five pre-write checkpoints plus the pre-task baseline. If a task creates a new file, the checkpoint records that the file did not exist, so undo deletes it instead of restoring content.

## Where checkpoints live

Checkpoints are stored as commits in a **shadow git repository** that is separate from any git repository you might have running on your vault. The shadow repo lives outside the vault, in a sibling folder next to it (`{vault-parent}/vault-operator-shared/checkpoints`), and never touches your own `.git/` folder.

That separation matters for two reasons:

- Your own git history stays clean. The shadow repo collects checkpoints from every task, which would clutter a personal log.
- Vaults that are not git repositories get the same protection. You do not need to set up git yourself.

The shadow repo is created automatically on the first task that writes. There is nothing to configure.

## The undo bar

After every task that modified files, an undo bar appears in the chat below the last message. It offers two actions:

- **Undo all changes.** Restores every file the task touched to its pre-task state. Newly created files get deleted.
- **Review changes.** Opens the diff review modal, which shows every changed file with section-level controls (Keep, Undo, or Edit).

The undo bar stays available as long as the task is in the active conversation. Scroll up and you can undo a task you ran ten minutes ago, even after several follow-up turns.

## Undo from here

Inside the chat, every tool call that wrote to the vault gets a hover action called **Undo from here**. Click it and Vault Operator rolls the vault back to the state just before that specific write. Any later writes from the same task get rolled back too, because their changes depended on the earlier state.

The mechanism behind "Undo from here" went through several iterations. The current implementation writes the restored content into the open editor buffer directly, not just to disk. That matters because Obsidian's editor caches the file content. Without the buffer refresh, the next keystroke would flush the stale cached content back to disk and silently undo the undo. The fix landed in v2.12.3.

## What undo does not cover

Checkpoints protect file content. They do not cover:

- **External writes.** If Vault Operator called an MCP tool that wrote to a database or sent an email, undo cannot reverse that.
- **Already-undone changes.** If you undid a task and then ran another task that modified the same files, undoing the second task takes you to the state after the first undo, not to the original.
- **The shadow repo itself.** The plugin manages it, you do not need to touch it. If you ever need to nuke it, delete the `vault-operator-shared/checkpoints/` folder next to your vault and the next task will create a fresh one.

For everything outside the vault file content, the [operation log](/guides/safety-control#the-operation-log) is the audit trail. It records every tool call, including external ones, so you can see what was done even if you cannot undo it directly.

## Disk usage

Each checkpoint is a git commit containing the touched files. Git deduplicates content across commits, so the shadow repo grows slowly. A heavy-use vault with daily agent activity typically lands in the low tens of megabytes after a year.

The plugin does not prune checkpoints automatically. If disk usage becomes a concern, you can manually delete the `vault-operator-shared/checkpoints/` folder next to your vault. The next task will start a fresh shadow repo.

## How it integrates with the rest of the system

Checkpoints are created inside the tool execution pipeline, after approval but before the actual write. The same pipeline that enforces approval, validates paths, and logs every call also creates the checkpoint. This guarantees a single rule: anything that modifies your vault has a snapshot before it.

The undo UI in the chat reads the shadow repo directly. There is no separate "undo history" data structure to keep in sync.

## Further reading

- [Safety and control guide](/guides/safety-control): how approvals, ignore files, and the operation log fit together.
- [Governance concept](./governance): the principles behind the fail-closed safety model.
- [Agent loop](./agent-loop): where in the loop checkpoints get created.
