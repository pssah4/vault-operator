---
title: Chat Interface
description: Attachments, @-mentions, tool picker, chat history, and keyboard shortcuts.
---

# Chat Interface

The Vault Operator sidebar is where you talk to the agent, attach files, browse past conversations, and watch the agent work as it goes.

**You will need:** Vault Operator installed, one model configured (see [Choosing a model](/guides/choosing-a-model)).

**Use this guide when:** you want to learn the input surface (attachments, @-mentions, slash commands, the activity block, history) before settling into a daily routine.

**You will know it works when:** you can send a message, attach a file via drag-and-drop, jump to a past chat, and undo a tool call from the checkpoint history without thinking about it.

## The chat panel

Open Vault Operator by clicking its icon in the left sidebar. The panel has three areas:

- Toolbar at the top: model picker, tool picker, history button
- Message area in the center: your conversation, activity blocks, approval cards
- Input bar at the bottom: text field, attachment button, send button

## Model picker: thinking and reasoning effort

The model picker controls which model the conversation runs on, plus two per-conversation reasoning controls that apply to the current chat without changing your saved settings.

- **Auto** keeps the tier router on: it picks a model strength (Budget / Main / Frontier) based on the task. Pinning a specific model turns the router off for that conversation.
- **Thinking** is an On/Off toggle. On models that support extended thinking it forces it on or off for this chat; on models without it, the toggle is ignored. The current state is shown on the chat header.
- **Reasoning effort** is a slider that appears when you pin a model and turn thinking on. It uses the model's own native levels (Claude: Low / Medium / High / XHigh / Max; GPT-5 and o-series: Minimal / Low / Medium / High). The leftmost stop, **Auto**, sends no effort field, so the model keeps its own default. In Auto model mode the slider stays hidden, because the router is already choosing model strength for you.

## Sending messages

Type your message and press **Enter** to send. For multi-line messages, press **Shift+Enter** to add a new line.

:::tip Configurable send key
In **Settings > Vault Operator > Interface** you can change the send shortcut to **Ctrl+Enter** (or **Cmd+Enter** on Mac) if you prefer Enter for new lines.
:::

## Attachments

Three ways to attach a file:

- Drag and drop from your desktop or file manager onto the chat input
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

Type **@** in the input field to search your vault by file name. A dropdown appears as you type, showing matching notes. Select a file to attach it as context. This is the fastest way to point the agent at a specific note without leaving the chat.

**Example:** *"Summarize @meeting-notes-march and compare the action items with @project-roadmap"*

## Workflow and prompt picker

Type **/** in the input field to open the picker. It lists workflows (multi-step task templates like "research a topic" or "reorganize a folder") and support prompts (pre-written prompts for common tasks). Pick one to insert into your message. You can edit the text before sending.

## Activity blocks

When the agent works, an activity block appears below its response and shows every tool call as it happens:

- The tool name and key parameters (which file was read, what query was used)
- A result preview (click to expand and see full details)
- Diff badges on write operations showing lines added and removed (e.g., `+12 / -3`)

Activity blocks collapse by default after the agent finishes. Click to expand them again whenever you want.

:::info Full transparency
You can always see exactly what the agent did, which files it read, and what it changed.
:::

## Approval cards

When the agent wants to perform a write operation (and auto-approve is off for that category), an approval card appears. It shows what the agent plans to do and gives you three choices:

- Allow once: approve this single action
- Always allow: auto-approve this category from now on
- Deny: reject the action

See [Safety & Control](/guides/safety-control) for details on permission categories.

## The undo bar

After the agent finishes a task that changed files, an undo bar appears at the bottom of the conversation. Click Undo to revert all changes made during that task. Every modified file is restored from its checkpoint.

The undo bar stays visible until you start a new message or dismiss it.

## Chat history

Vault Operator saves every conversation automatically. To access your history:

1. Click the history icon in the toolbar (clock symbol)
2. Browse past conversations, each showing a title, date, and preview
3. Click a conversation to restore it and continue where you left off

The history sidebar groups conversations by source tab: Vault Operator, Claude Desktop, ChatGPT, Perplexity, plus an "All" view. Each conversation carries the `source_interface` tag of where it came from, so you can see what came in via which surface without mixing it all together. Living documents (multiple turns within 30 minutes from the same source) appear as one entry with a turn count rather than separate conversations.

Conversations are titled automatically based on their content. You can also jump to linked conversations directly from your notes. See [Memory & Personalization](/guides/memory-personalization) for chat-linking.

:::info Attachments live for one turn
Files you drop into the chat are parsed once and made available for the same turn the user sent. From the next turn on, the parsed text is gone. Skills that need to operate on an attachment across multiple turns (like `/ingest-deep`) save the file to the vault first, then work against the vault path.
:::

## Context display and condensation

At the top of the message area, a small indicator shows how much of the model's context window is in use. As conversations grow longer, Vault Operator may condense earlier messages to stay within limits. When that happens, a brief note appears in the conversation, key facts and decisions are kept, and older tool call details may get summarized. It runs automatically so long conversations keep going.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message (configurable) |
| `Shift+Enter` | New line in input |
| `@` | Open file mention picker |
| `/` | Open workflow/prompt picker |
| `Escape` | Close picker or cancel current input |

## Tips

1. Attach files instead of pasting long text. Attachments are handled more efficiently.
2. Use @-mentions when you know which note you want. It is faster and more precise than asking the agent to search.
3. Skim activity blocks after the agent works. They show you what tools exist and how the agent thinks about tasks.
4. Start a new conversation for unrelated topics so context stays focused and you avoid condensation.

## Next steps

- [Vault Operations](/guides/vault-operations): What the agent can do with your files
- [Knowledge Discovery](/guides/knowledge-discovery): Set up semantic search for better results
- [Safety & Control](/guides/safety-control): Permissions, checkpoints, and the audit log
