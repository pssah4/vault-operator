# BUG-019: Drag-and-drop from Obsidian file explorer opens tab instead of attaching

> **Status:** Resolved 2026-04-19 (feature-branch, unreleased)
> **Priority:** P1
> **Epic:** EPIC-004 (Chat UX)
> **Date:** 2026-04-19
> **Reporter:** [@nicholas-leonard](https://github.com/nicholas-leonard) via [#31](https://github.com/pssah4/obsilo/issues/31) / commit [cc97106](https://github.com/nicholas-leonard/obsilo/commit/cc97106)

## Problem

Dragging a note from Obsidian's built-in file explorer or search result
list into the Obsilo chat sidebar does not attach the file. Instead
Obsidian opens the dropped file in a new tab while the chat input shows
no attachment chip. The drag affordance on the input wrapper
(`.drag-over` class) fires correctly, so the handler receives the
event -- it just fails to resolve the payload.

Works correctly today: external drags from Finder / Explorer / GNOME
Files. Those go through `dataTransfer.files` which the current handler
already supports.

## Causal Chain

1. User drags a note from the Obsidian file explorer over the chat input.
2. `dragover` fires on `inputWrapper`, `preventDefault()` is called but
   `stopPropagation()` is not -- the event bubbles up to the workspace.
3. User drops.
4. `drop` handler runs on `inputWrapper`:
   - `e.dataTransfer.files` is empty (Obsidian internal drags don't use
     `files`).
   - `e.dataTransfer.getData('text/plain')` returns an empty string or
     the note's title without a path -- the `getAbstractFileByPath`
     call misses.
5. The drop event continues bubbling up to the workspace drop handler,
   which treats the drag as an "open in new tab" intent.
6. Result: file opens in a new tab, chat attachment list stays empty.

## Root Cause

Obsidian's renderer places the dragged item on
`app.dragManager.draggable` rather than on `dataTransfer`. This is an
undocumented internal but is stable across Obsidian 1.4+ and widely used
by community plugins. Without reading that field the handler has no way
to resolve the file reference.

Second half of the bug: missing `stopPropagation()` on both `dragover`
and `drop` lets the workspace claim the event even after the sidebar
handler ran.

## Fix Direction (from upstream commit cc97106)

In [src/ui/AgentSidebarView.ts](../../src/ui/AgentSidebarView.ts),
`buildChatInput()` -> `drop` handler:

1. Add `e.stopPropagation()` to both `dragover` and `drop`.
2. Before checking `dataTransfer.files` and the `text/plain` fallback,
   read `this.app.dragManager.draggable`:
   - `draggable.type === 'file'` with a `file: TFile` -> attach the single file.
   - `draggable.type === 'files'` with `files: TFile[]` -> attach each.
3. Keep the existing `dataTransfer.files` branch (OS drops) and the
   `text/plain` branch as a last-resort fallback for unknown Obsidian
   builds.

## Adaptations for Our Codebase

- Type the reach-through as `unknown` + narrow cast, not `any`. Review
  Bot rejects `no-explicit-any` even with reason.
- Guard with `if (typeof dm === 'object' && dm !== null && 'draggable' in dm)`
  so missing `dragManager` (older Obsidian) silently falls through.
- Wrap each `TFile` check with `instanceof TFile` -- matches the Bot's
  `no-tfile-tfolder-cast` rule.

## Risk

- Low. The fallback chain is additive: if `dragManager.draggable` is not
  present, existing behaviour wins. Failure mode of the fix is
  "unchanged from today".
- Reaching `app.dragManager` is undocumented but widely used; re-survey
  before bumping target Obsidian API version.

## Test Plan

- Unit test with a mocked `app.dragManager.draggable` of both `type:
  'file'` and `type: 'files'` shapes -- assert the handler dispatches
  to `attachments.addVaultFile` with the right TFile set.
- Smoke test: unchanged external OS drag still routes through
  `dataTransfer.files`.
- Manual: drag from file explorer, from search-results, from a pinned
  tab title.

## Out of Scope (for this fix)

- Dragging URLs from browsers (separate feature, would need
  `text/uri-list` handling).
- Drag-to-reorder attachment chips.

## References

- Upstream commit: [cc97106](https://github.com/nicholas-leonard/obsilo/commit/cc97106)
- Touches only: `src/ui/AgentSidebarView.ts` (drop handler inside
  `buildChatInput()`).
