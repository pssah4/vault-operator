---
title: Task extraction
description: How Vault Operator turns checkbox lines from agent responses into trackable task notes.
---

# Task extraction

When the agent writes a Markdown checkbox in a response, Vault Operator can turn it into a real note in your vault. The feature is off by default and lives in **Settings > Interface > Task extraction**. Once enabled, every agent response is scanned post-hoc; matching lines become task notes that you can track, query, or feed into the Bases or Tasks plugins.

## What gets extracted

A regex pattern scans for unchecked checkbox lines:

```
- [ ] follow up with Anna about pricing
* [ ] @Tom due: 2026-06-01 review the proposal
```

Two list markers count: `-` and `*`. The text after `[ ]` is the task body. Two optional patterns are parsed from the body:

- **Assignee.** A leading `@PersonName` or `@PersonName:` becomes the assignee field.
- **Due date.** A `due: YYYY-MM-DD` or `(due: YYYY-MM-DD)` anywhere in the body becomes the due date field. Other date formats (relative dates, written months) are not parsed.

Duplicate task texts in the same response are merged. The agent does not need to know task extraction exists; it just writes Markdown checkboxes as usual.

## What you get

For each extracted task, the post-processing hook offers a dialog: **X tasks found. Create notes?** You see the task list, can deselect individual tasks, and confirm. Each accepted task becomes a note in the configured task folder (default `TaskNotes/Tasks/`) with frontmatter like:

```yaml
---
kategorie: [Task]
assignee: Tom
dueDate: 2026-06-01
sourceNote: Chats/2026-05-13-1234.md
---

# Review the proposal
```

The `kategorie: [Task]` convention lets the Base plugin recognize task notes for view and timeline rendering. The `sourceNote` field points to the conversation note that produced the task, so you can jump back to the context.

## Title generation

The agent writes free-form task text. The note title is auto-derived: take the first 7 to 8 words, cut before a natural phrase boundary (prepositions, conjunctions), title-case it. The filename is a slug of that title. This keeps filenames reasonable without forcing you to write short tasks.

## When it runs

Extraction is a post-processing hook that runs after every assistant message (ADR-26). It does not block the agent loop. The dialog appears next to the response once parsing finishes.

If task extraction is off, the scan does not run, and checkbox lines stay as plain text in the chat log.

## Limits

- Regex-only. A sentence like "we should review the proposal next week" has no checkbox, so it is not extracted. The agent decides what becomes a checkbox.
- Strict date format. `due: 2026-06-01` works; `due tomorrow` or `next Friday` does not.
- Text-based deduplication. Two tasks with slightly different wording count as separate notes.
- The `sourceNote` backlink is a path. If you move or rename the source chat note, the backlink breaks.
- The Interface-tab toggle is binary. There is no per-mode or per-prompt switch yet.

## Related decisions

- ADR-26: post-processing hook architecture
- ADR-27: task-note frontmatter schema (the `kategorie: [Task]` convention)

See also: [Multi-agent and tasks guide](/guides/multi-agent), [Settings reference: Interface](/reference/settings#interface).
