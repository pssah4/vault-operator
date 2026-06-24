---
title: Inline AI chat (inline editor actions)
description: A floating chat panel anchored to the active note, with quick actions for Lookup, Rewrite, Translate, Summarize, and Find action items.
---

# Inline AI chat (inline editor actions)

The inline AI chat is a floating panel that opens over the current editor selection and runs the same agent engine as the sidebar. It is built for quick edits and questions on a passage you already have under the cursor: explain it, rewrite it, translate it, summarize it, or pull action items out of it.

:::info Available since v3.0.0
The inline panel ships with v3.0.0. Earlier versions only had the sidebar.
:::

**You will need:** Vault Operator installed and one model configured (see [Choosing a model](/guides/choosing-a-model)).

**Use this guide when:** you want to work on a selected passage without leaving the editor, or you want to learn the quick actions, the review-and-apply flow, and the checkpoint markers that show up inline.

## What it is

The inline panel is a small chat surface anchored to the active note. It runs the same `AgentTaskRunner` that powers the sidebar, so tool calls, attachments, model picks, and conversation history all behave the same way. The differences are scope and shape:

- It opens over your selection, with the selected text prepended to the first turn as a `<context>` block.
- It is capped at 20 turns per session so the chat stays focused and token cost stays bounded. When you hit the cap, the panel shows a notice and asks you to open the sidebar to continue the thread.
- Closing the panel ends the session. Opening a new panel starts a fresh session.

The panel writes to the same conversation store as the sidebar, so an inline chat appears in the main history list and can be reopened from there.

## Opening the panel

There are three ways to open the inline panel:

- **Command palette:** run "Open inline AI chat".
- **Hotkey:** `Mod+Shift+I`. On macOS this is `Cmd+Shift+I`. On Windows and Linux this is `Ctrl+Shift+I`. The chord is registered on the app scope, and you can rebind the command under Settings, then Hotkeys.
- **Editor right-click menu:** select text in the editor, right-click, and pick "Inline AI chat". The entry shows the OS-specific hotkey hint next to the label.

Auto-opening the panel when you select text was intentionally removed, because it interfered with normal selection actions like copy or read. The floating menu still exists behind a setting; the panel is the default surface.

## Selection preview

The top of the panel shows a collapsible "Selection" block. The first 3 lines are visible by default. A chevron toggle appears when the selection has more than 3 lines or more than 240 characters; click it to expand the full selection, click again to collapse.

## Free chat

The composer at the bottom is a normal chat input:

- **Enter** sends the message.
- **Shift+Enter** inserts a newline.
- **Escape** closes the panel. Clicking outside the panel does not close it.

On the first turn the panel prepends your selection as a `<context>` block (`<context>Selected text (from note: ...): ...</context>`), followed by your prompt. Later turns only send your prompt.

Every inline chat is persisted to the conversation store, so the panel session appears in the main history list alongside sidebar chats, and a later free-chat turn in the same panel extends the same conversation file. The history list refreshes live via the `vault-operator:conversation-list-changed` event.

## Mid-run steering

If you start typing while a turn is running, your message is queued as a steering message for the next iteration. The user bubble shows up immediately so you can see what you pushed, and the status pill reads "Steering message queued for next iteration." The agent picks it up at the start of the next iteration.

## Quick actions

The panel toolbar exposes the inline-specific actions. The magnifier triggers Lookup directly; the ellipsis opens a menu with the rest.

- **Lookup** (magnifier icon): explain the selected term using vault content first, with an optional one-shot web fallback and a deterministic appendix.
- **Rewrite** (pencil icon, edit-action): rewrite the selection for clarity. The stream collects into a buffer, then opens the EditReviewModal so you can review the diff before it touches the note.
- **Translate selection** (languages icon, edit-action): translate the selection to English (default). German and the short summary variant are registered actions you can toggle in Settings, then Inline AI actions. The stream collects, then opens the EditReviewModal.
- **Summarize (medium)** (file-text icon): summarize the selection. Display-only; the answer renders in the chat bubble and is not written back to the note.
- **Find action items** (check-square icon): extract TODOs as a markdown checklist. Display-only.

"Send to main chat" remains available programmatically but was retired from the menu, because the panel itself is the chat surface.

## Lookup details

Lookup runs in stages:

1. Vault RAG via the semantic index, with a confidence threshold (default 0.7) and a top-N cap (default 5). Each selection embedding is cached per panel session in an LRU with capacity 16, cleared on plugin unload.
2. If the vault tier is not "strong" and web fallback is enabled, the action runs one web search via the configured provider (Brave or Tavily) with a 5-second timeout.
3. Edge collection re-aggregates explicit and implicit connections using the active note and the vault-hit paths as seeds.
4. After the stream, a deterministic appendix is appended listing vault sources, web sources, and explicit and implicit connections.

If the vault match is weak, the appendix prefixes the source list with a low-confidence note.

## Composer extras

The composer mirrors the sidebar:

- A `+` menu with: **Attach file**, **Add vault file**, **Insert skill...**, **Insert prompt...**, **Insert workflow...**, and **Select MCP servers**.
- Autocomplete for `/skills`, `#prompts`, `§workflows`, and `@vault file` references.
- An attachment chip bar above the textarea for pending image and text attachments.
- A per-turn model picker on the toolbar (defaults to "Auto", with thinking and effort overrides for providers that support them).
- A status pill that shows "Thinking", "Calling `<tool>`", "Done", or errors.
- Send and Stop buttons. Stop aborts the in-flight turn.

## Edit review modal

Rewrite and Translate share the same review surface:

- An aligned side-by-side diff with line numbers and `+`/`-` gutters.
- The right column is `contenteditable` in `plaintext-only` mode, so you can hand-correct the rewrite before applying.
- A live `+N`/`-N` counter on the right column updates as you type.
- A per-file **Skip this file** toggle when multiple files are in scope.
- A footer with **Verwerfen** (discard) and **Anwenden** (apply).

The same panel also runs in a read-only "Checkpoint anzeigen" mode for checkpoint diffs. In that mode the footer shows **Verwerfen** and a **Wiederherstellen** button instead of Apply.

The modal title reads **Änderungen prüfen** for the edit flow and **Checkpoint anzeigen** for the checkpoint flow.

## Checkpoint markers

Every edit-action apply and every write tool fired by a free-chat turn emits a checkpoint and a marker bubble in the panel. The marker shows the action label and the affected file, plus a row of icon buttons:

- **Diff anzeigen** (file-diff icon): open the read-only Checkpoint anzeigen view.
- **Diese Änderung zurücknehmen** (undo-2 icon): restore just this checkpoint.
- **Ab hier zurücknehmen** (rotate-ccw icon): restore this checkpoint and every checkpoint that came after it in the same task. A pre-restore snapshot of the affected files is taken first, so the multi-step rollback is itself undoable via the next marker.
- **Weitere Optionen** (more-vertical icon): open a small menu with **Chat ab hier löschen**, which restores the checkpoint and closes the panel so the next open starts fresh.

Markers stamp the session task id, so reopening the conversation from the sidebar history rehydrates them via the sidebar's rehydrate path.

## Skills as inline actions

Skills that opt in via the `inlineActions.skillCapabilities` setting can appear in the inline action set, capped by `inlineActions.skillsTopN`. Eligible skills are picked up when the plugin wires the inline actions; adding a skill later requires a plugin reload.

## Panel chrome

- Drag the slim grip at the top to move the panel anywhere on screen.
- Drag the grip in the bottom-right corner to resize. The minimum size is 320 by 240 pixels.
- Click the `×` button in the top-right corner, or press Escape, to close the panel.

## Lower-level alternative: inline diff in the editor

Rewrite can also stream as a CodeMirror inline diff with per-hunk Accept and Reject decorations. The extension is registered globally, so the keybindings are always live in a Markdown editor:

- `Mod+Enter` accepts all hunks in the current diff session.
- `Mod+Backspace` cancels the diff session.
- `Mod+Alt+Y` accepts the hunk under the cursor.
- `Mod+Alt+N` rejects the hunk under the cursor.

## Related

- [reference/settings.md#inline-ai](/reference/settings)
- [guides/chat-interface.md](/guides/chat-interface)
- [concepts/checkpoints.md](/concepts/checkpoints)
- [guides/safety-control.md](/guides/safety-control)
