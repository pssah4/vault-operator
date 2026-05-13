---
title: Your First Conversation
description: Learn the basics of chatting with Vault Operator, including modes, context, and how the agent thinks.
---

# Your first conversation

Vault Operator is an agent that reads, writes, and searches your vault. A few concepts help before you start.

## Modes

Vault Operator has two built-in modes:

| Mode | What it does | When to use it |
|------|-------------|----------------|
| **Ask** | Read-only. Searches and analyzes but never changes your vault. | Questions, research, analysis |
| **Agent** | Full access. Can read, write, edit, create, and delete files. | Active work, content creation, refactoring |

The mode dropdown sits at the top of the chat panel, next to the model selector. Click it to switch between **Ask** and **Agent**. The agent can also switch modes mid-conversation when the task calls for it.

:::tip Start with Ask mode
If you are new to Vault Operator, start in **Ask** mode. It cannot change anything, so you can explore safely. Switch to **Agent** mode when you are ready to let it work.
:::

## Context: what the agent knows

The agent sees:
- Your message and the conversation history
- The active note (if "auto-add active file" is enabled in Settings > Interface)
- Attached files (drag & drop or click the paperclip icon)
- @-mentioned files (type `@` in the chat to search your vault)
- Its memory of past conversations (if memory is enabled)

It does **not** read your entire vault upfront. It searches and reads files on demand via tools.

## The activity block

When the agent works, an expandable activity block appears below the response. It shows every tool call in real time:

- Tool name (e.g., `read_file`, `search_files`, `semantic_search`)
- Key parameters (e.g., the file path or search query)
- Result (expand to see details)
- Diff badge for write operations: `+3 / -1` lines changed

Click the activity block to expand or collapse it.

## Approvals

By default, the agent asks for your approval before any write operation. An approval card appears showing exactly what the agent wants to do:

- Write file: shows the full content
- Edit file: shows the diff
- Delete file: shows which file
- Move file: shows source and destination

Click **"Allow once"** to approve, or **"Always allow"** to auto-approve that category.

:::warning Auto-approve with care
Enabling auto-approve for writes means the agent acts without asking. The checkpoint system lets you undo, but review what changed after each task.
:::

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message (configurable: Ctrl/Cmd+Enter) |
| `Shift+Enter` | New line |
| `/` | Open workflow/prompt picker |
| `@` | Open file mention picker |

## Tips for better results

Be specific. "Summarize the meeting notes from March" works better than "summarize my notes."

Use `@filename` to point the agent at specific notes instead of hoping it finds them. Pick the mode deliberately: Ask for questions, Agent for actions.

The activity block shows exactly what the agent did, which is useful for learning how it works and for catching mistakes when it goes sideways.

For broad questions like "What do I know about X?", just ask. The agent will run a semantic search on the vault itself.

## Next steps

See [Choosing a model](/guides/choosing-a-model) for provider comparisons, [Chat interface](/guides/chat-interface) for the full feature set, and [Knowledge discovery](/guides/knowledge-discovery) to set up semantic search.

If a tool call fails or the agent gets stuck, the [Troubleshooting](/reference/troubleshooting) page covers the common cases.
