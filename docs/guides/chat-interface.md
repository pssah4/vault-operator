---
title: Chat Interface
description: Parallel chat tabs, attachments, @-mentions, tool picker, chat history, and keyboard shortcuts.
---

# Chat Interface

The Vault Operator sidebar is where you talk to the agent, attach files, browse past conversations, and watch the agent work as it goes.

:::info Two chat surfaces (v3.0.0)
Vault Operator ships two peer entry-points for the same agent:

- **Sidebar chat** (this page): the full panel on the left, with history, attachments, the activity block, and the slash menu.
- **Inline AI chat** ([guides/inline-chat.md](/guides/inline-chat)): a floating panel over the current editor selection, opened via the editor right-click menu entry **Inline AI chat**, or with a hotkey you bind to the **Open inline AI chat** command (no default).

Conversations from the inline panel show up in the same history list as sidebar chats. The list refreshes live via the `vault-operator:conversation-list-changed` event, so a new inline conversation appears without reopening the sidebar.
:::

**You will need:** Vault Operator installed, one model configured (see [Choosing a model](/guides/choosing-a-model)).

**Use this guide when:** you want to learn the input surface (attachments, @-mentions, slash commands, the activity block, history) before settling into a daily routine.

**You will know it works when:** you can send a message, attach a file via drag-and-drop, jump to a past chat, and undo a tool call from the checkpoint history without thinking about it.

## The chat panel

Open Vault Operator by clicking its icon in the left sidebar. The panel has four areas:

- Toolbar at the top: model picker, tool picker, history button, New chat button
- Tab strip below the toolbar: one tab per open conversation (see [Working with several chats at once](#working-with-several-chats-at-once))
- Message area in the center: your conversation, activity blocks, approval cards
- Input bar at the bottom: text field, attachment button, send button

### What you see

The header carries the Vault Operator brand mark, a gradient square with a slash, next to the plugin name. While the agent works, a single status line sits at the top of the current response: the mark spins, the line names what the agent is doing right now, and a live token count climbs as the model writes. The count is fed by real API usage, so it reflects what the turn actually consumed. It can pause while a tool runs, because nothing is being generated then; the spinning mark shows the run is still alive.

When the agent lays out a plan, it appears as a card with a timeline running down its side, and each step is a node on that line, marked as it completes. Tool calls render as a thread of steps along a vertical line rather than as boxes, so a long run stays readable. The input area at the bottom is a floating card with a round send button in your theme's accent color. And during a long answer your question stays reachable: once it scrolls out of view, it reappears as a compact bar floating at the top of the chat, and clicking the bar shows the full text.

## Working with several chats at once (v3.3.1) {#working-with-several-chats-at-once}

The sidebar holds more than one conversation at a time. A tab strip sits just under the toolbar, with one tab per open chat. Each tab is an independent conversation with its own history, so you can keep separate topics side by side.

### Opening and closing tabs

- Click the **New chat** button in the toolbar, or the **+** at the end of the tab strip, to open another chat. Both open a fresh tab and switch to it.
- The **New chat session (parallel)** command does the same. It has no default shortcut, so bind one under **Settings > Hotkeys** if you want a keystroke.
- Click a tab to switch to it. Switching is instant and does not reload the conversation.
- Click the **x** on a tab to close it. If a run is still going in that chat, Vault Operator asks first (**Close this chat?**) and lets you **Stop and close**. Closing a chat ends it cleanly: it saves, generates the title, and runs memory extraction, the same as any finished conversation.

A tab is named from your first message, so a fresh one reads **New chat** until you send something. Once the agent has more to go on, the tab picks up an automatic title.

### Runs that keep going in the background

Starting a chat no longer waits for another to finish. You can launch a long task (an ingest, a vault-wide edit) in one tab and immediately open a second tab to do other work. The first run keeps streaming into its own tab while you type in another. A small dot on a tab marks a chat with a run in progress, so you can see at a glance which conversations are still working.

Each tab keeps its own state, not just its history:

- **Mode and agent**: switching one chat to a different agent leaves the others on their own.
- **Model, thinking, and reasoning effort**: a per-chat model override (see [Choosing a model](/guides/choosing-a-model)) applies only to that tab.
- **Attachments**: a file you drop into one chat is read only by that chat.

So two topics stay separate. A mode switch or an attachment in one tab never changes what another tab does on its next turn.

### One API key, shared across chats

All open chats send requests through the same model and API key, so they share one upstream quota. Runs still proceed in parallel. If they push past the key's rate limit, Vault Operator backs off and retries rather than failing. While a run is waiting for shared capacity, a brief notice (**Waiting on shared API budget (parallel chats)**) appears so a paused chat does not look stuck. That notice only shows when you have configured a request rate limit, which is off by default.

### After a restart

When you reload or restart Obsidian, the sidebar opens one fresh chat. Your earlier conversations are not lost: they are in [Chat history](#chat-history), one click away. If a run was interrupted mid-task (a crash, or a reload while the agent was working), open that conversation from History and Vault Operator offers a **Resume** so you can continue from where it stopped. Each interrupted run is offered once, in its own conversation.

### Picking up an earlier thread

When you open a conversation whose topic you explored before, Vault Operator suggests the related earlier chats at the top of the message area (**You explored this topic before:**). Click one to open it in its own tab, or **Dismiss** the hint. The suggestion is read-only: it never changes either conversation and never merges their histories. See [Memory & Personalization](/guides/memory-personalization) for how chat linking works.

## Thinking and reasoning effort {#thinking-and-reasoning-effort}

The model picker controls which model the conversation runs on, plus two per-conversation reasoning controls that apply to the current chat without changing your saved settings.

- **Auto** keeps the tier router on: it picks a model strength (Budget, Main, or Frontier) based on the task. Pinning a specific model turns the router off for that conversation.
- **Thinking** is an On/Off toggle. On models that support extended thinking it forces it on or off for this chat; on models without it, the toggle is ignored. The current state is shown on the chat header.
- **Reasoning effort** is a slider that appears when you pin a model and turn thinking on. It uses the model's own native levels (Claude: Low, Medium, High, XHigh, Max; GPT-5 and o-series: Minimal, Low, Medium, High). The leftmost stop, **Auto**, sends no effort field, so the model keeps its own default. In Auto model mode the slider stays hidden, because the router is already choosing model strength for you.

Cross-reference: [Choosing a model](/guides/choosing-a-model#thinking-and-reasoning-effort) covers when to pin a model versus letting the router pick.

## Sending messages

Type your message and press **Enter** to send. For multi-line messages, press **Shift+Enter** to add a new line.

:::tip Send with enter toggle
In **Settings > Vault Operator > Advanced > Interface**, the **Send with enter** toggle controls how Enter behaves. Turn it off if you prefer Enter for new lines and **Cmd+Enter** (or **Ctrl+Enter** on Windows and Linux) to send.
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
| Text files | Markdown, TXT, CSV, JSON, XML | Added as plain text context |

:::warning 50 MB Limit
Each attachment can be up to 50 MB. Very large files may use a significant portion of the model's context window, leaving less room for conversation.
:::

### Notes with embeds {#notes-with-embeds}

A note can embed other notes with `![[Note]]`, `![[Note#Heading]]` or `![[Note#^block]]`. By default Vault Operator sends the Markdown of an attached note as it is, so an embed reaches the model as a link and not as text. The agent can still open the linked note with `read_file`, one call per embed.

Turn on **Expand embedded notes in attachments** in `Settings > Vault Operator > Advanced > Interface`, or flip **Expand note embeds** in the chat options menu. For attached Markdown notes and for the open note, the text of each embed is then added right below the embed line as a read-only copy.

- The `![[...]]` line stays in place, so editing and spellchecking keep working on the real Markdown.
- Headings and block references are resolved by Obsidian itself, the same way its own embeds are.
- Embeds inside embeds are expanded up to two levels. A loop (A embeds B embeds A) stops at the repeat.
- A message gets at most 20 embeds, 4,000 characters per embed and 24,000 characters in total. Everything beyond stays a link.
- Images, PDFs, canvases, missing targets, embeds inside code and notes on your ignore list stay as they are.

:::warning The embedded text goes to your model provider
The expanded text is sent like the attached note itself. The setting is off by default.
:::

## @-Mentions

Type **@** in the input field to search your vault by file name. A dropdown appears as you type, showing matching notes. Select a file to attach it as context. This is the fastest way to point the agent at a specific note without leaving the chat.

**Example:** *"Summarize @meeting-notes-march and compare the action items with @project-roadmap"*

## Slash menu

Type **/** in the input field to open the slash menu. One list covers everything you can trigger by name: skills, prompts (pre-written prompts for common tasks), and workflows (multi-step task templates like "research a topic" or "reorganize a folder"). Each row carries a type label. Pick an entry to insert it into your message, and edit the text before sending if you like.

When two entries share the same name, a fixed precedence decides what `/name` runs: skills win over prompts, and prompts win over workflows. The losing entry is not hidden. It stays in the list, marked as not reachable under that name, so you can spot the collision and rename one of the two. Typing a name directly and picking it from the list always resolve to the same entry.

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

## Post-task review (v3.0.0)

When the agent finishes a multi-file task, Vault Operator can open a unified review modal titled **Review changes**. The header source label reads **Task &lt;taskId&gt;**, and each file appears as a side-by-side before/after entry. You can apply, skip, or discard per file. Applied edits get written back via the vault API, and a system message of the form `User edited N file(s): ...` is appended to the conversation so the agent knows what you changed.

The same EditReviewModal surface is shared with the inline panel. The previous section-accordion DiffReviewModal has been retired so both entry-points use one consistent review experience.

## Inspecting a checkpoint (v3.0.0)

Click a checkpoint marker in the conversation to open it as a read-only side-by-side diff. The modal is titled **View checkpoint** and exposes a **Restore** button that rolls the affected files back to the snapshot. This view uses the same modal component as the post-task review (`showCheckpointReviewModal` in `src/ui/edit-review/EditReviewModal.ts`), so inline and sidebar share one checkpoint UI.

## Chat history

Vault Operator saves every conversation automatically. To access your history:

1. Click the history icon in the toolbar (clock symbol)
2. Browse past conversations, each showing a title, date, and preview
3. Click a conversation to restore it and continue where you left off

The history sidebar groups conversations by source tab: Vault Operator, Claude.ai, Claude Code, ChatGPT, Perplexity, Unknown, plus an "All" view. Each conversation carries the `source_interface` tag of where it came from, so you can see what came in via which surface without mixing it all together. Living documents (multiple turns within 30 minutes from the same source) appear as one entry with a turn count rather than separate conversations.

Conversations are titled automatically based on their content. You can also jump to linked conversations directly from your notes. See [Memory & Personalization](/guides/memory-personalization) for chat linking.

:::info Attachments live for one turn
Files you drop into the chat are parsed once and made available for the same turn the user sent. From the next turn on, the parsed text is gone. Workflows that need to operate on an attachment across multiple turns (like a deep ingest) save the file to the vault first, then work against the vault path.
:::

## Context display and condensation

At the top of the message area, a small indicator shows how much of the model's context window is in use. As conversations grow longer, Vault Operator may condense earlier messages to stay within limits. When that happens, a brief note appears in the conversation, key facts and decisions are kept, and older tool call details may get summarized. It runs automatically so long conversations keep going.

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message (configurable) |
| `Shift+Enter` | New line in input |
| `@` | Open file mention picker |
| `/` | Open the slash menu (skills, prompts, workflows) |
| `Escape` | Close picker or cancel current input |
| Right-click > Inline AI chat (or a hotkey you bind to **Open inline AI chat**) | Open inline AI chat over the selection |

## Tips

1. Attach files instead of pasting long text. Attachments are handled more efficiently.
2. Use @-mentions when you know which note you want. It is faster and more precise than asking the agent to search.
3. Skim activity blocks after the agent works. They show you what tools exist and how the agent thinks about tasks.
4. Open a new tab for an unrelated topic instead of continuing in the same chat. Context stays focused, you avoid condensation, and a long run in the old tab keeps going in the background.

## Next steps

- [Vault Operations](/guides/vault-operations): What the agent can do with your files
- [Knowledge Discovery](/guides/knowledge-discovery): Set up semantic search for better results
- [Safety & Control](/guides/safety-control): Permissions, checkpoints, and the audit log
