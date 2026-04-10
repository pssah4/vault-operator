---
title: Chat Interface
description: Attachments, @-mentions, tool picker, chat history, and keyboard shortcuts.
---

# Chat Interface

The Obsilo sidebar is where you talk to the agent, attach files, browse past conversations, and watch the agent work in real time.

## The chat panel

Open Obsilo by clicking its icon in the left sidebar. The panel has three areas:

- Toolbar at the top: mode selector, model picker, and the history button
- Message area in the center: your conversation, activity blocks, and approval cards
- Input bar at the bottom: text field, attachment button, and send button

## Sending messages

Type your message and press **Enter** to send. For multi-line messages, press **Shift+Enter** to add a new line.

:::tip Configurable send key
In **Settings > Obsilo Agent > Interface** you can change the send shortcut to **Ctrl+Enter** (or **Cmd+Enter** on Mac) if you prefer Enter for new lines.
:::

## Attachments

You can attach files to give the agent additional context:

- Drag and drop a file from your desktop or file manager onto the chat input
- Paste from clipboard (screenshots and copied images are added automatically)
- Click the paperclip icon next to the input field to browse your files

### Supported file types

| Type | Examples | Notes |
|------|----------|-------|
| Images | PNG, JPG, GIF, WebP | The agent can see and describe image content |
| Office documents | PPTX, DOCX, XLSX | Content is extracted and added as context |
| PDF | Any PDF file | Text is extracted for the agent to read |
| Text files | Markdown, TXT, CSV, JSON | Added as plain text context |

:::warning 50 MB Limit
Each attachment can be up to 50 MB. Very large files may use a significant portion of the model's context window, leaving less room for conversation.
:::

## @-Mentions

Type **@** in the input field to search your vault by file name. A dropdown appears as you type, showing matching notes. Select a file to attach it as context.

Fastest way to point the agent at a specific note without leaving the chat.

**Example:** *"Summarize @meeting-notes-march and compare the action items with @project-roadmap"*

## Workflow and prompt picker

Type **/** in the input field to open the picker. This shows:

- Workflows: multi-step task templates (e.g., research a topic, reorganize a folder)
- Support prompts: pre-written prompts for common tasks

Select an entry to insert it into your message. You can edit the text before sending.

## Activity blocks

When the agent works, an activity block appears below its response. It shows every tool call in real time:

- The tool name and key parameters (e.g., which file was read or what search query was used)
- A result preview (click to expand and see full details)
- Diff badges on write operations showing lines added and removed (e.g., `+12 / -3`)

Activity blocks are collapsed by default after the agent finishes. Click to expand them at any time.

:::info Full transparency
You can always see exactly what the agent did, which files it read, and what it changed.
:::

## Approval cards

When the agent wants to perform a write operation (and auto-approve is off for that category), an approval card appears. It shows what the agent intends to do and gives you three choices:

- Allow once: approve this single action
- Always allow: auto-approve this category from now on
- Deny: reject the action

See [Safety & Control](/guides/safety-control) for details on permission categories.

## The undo bar

After the agent completes a task that changed files, an undo bar appears at the bottom of the conversation. Click Undo to revert all changes made during that task. Every modified file is restored from its checkpoint.

The undo bar stays visible until you start a new message or dismiss it.

## Chat history

Obsilo saves every conversation automatically. To access your history:

1. Click the history icon in the toolbar (clock symbol)
2. Browse past conversations, each showing a title, date, and preview
3. Click a conversation to restore it and continue where you left off

Conversations are titled automatically based on their content. You can also find linked conversations directly from your notes. See [Memory & Personalization](/guides/memory-personalization) for chat-linking.

## Context display and condensation

At the top of the message area, a small indicator shows how much of the model's context window is in use. As conversations grow longer, Obsilo may condense earlier messages to stay within limits. When this happens:

- A brief note appears in the conversation
- Key facts and decisions are preserved
- Older tool call details may be summarized

This happens automatically and keeps long conversations running.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message (configurable) |
| `Shift+Enter` | New line in input |
| `@` | Open file mention picker |
| `/` | Open workflow/prompt picker |
| `Escape` | Close picker or cancel current input |

## Tips

1. Attach relevant files rather than pasting long text into the message. Attachments are handled more efficiently.
2. Use @-mentions when you know which note you need. Faster and more precise than asking the agent to search.
3. Check activity blocks after the agent works. They help you learn what tools are available and how the agent approaches tasks.
4. Start a new conversation for unrelated topics. Keeps context focused and avoids condensation.

## Next steps

- [Vault Operations](/guides/vault-operations): What the agent can do with your files
- [Knowledge Discovery](/guides/knowledge-discovery): Set up semantic search for better results
- [Safety & Control](/guides/safety-control): Permissions, checkpoints, and the audit log
