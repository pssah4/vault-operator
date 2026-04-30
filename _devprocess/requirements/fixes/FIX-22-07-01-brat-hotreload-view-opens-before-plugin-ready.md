# BUG-026: Sidebar view crashes during BRAT hot-reload (opens before doLoad)

> **Priority:** P0 (all sidebar UI broken after BRAT update)
> **Epic:** EPIC-04 (Chat UX) / FEAT-22-08 (BRAT rebuild survive)
> **Date:** 2026-04-19
> **Discovered:** Beta-8 BRAT test by user

## Problem

After a BRAT auto-update, the chat sidebar loads with two stack traces
in the console and the input area never renders:

```
[AgentSidebarView] Failed to initialize context tracker:
  TypeError: Cannot read properties of undefined (reading 'currentMode')
    at ModeService.getActiveMode (...)
    at _AgentSidebarView.onOpen (...)

Failed to open view
  TypeError: Cannot read properties of undefined (reading 'autoAddActiveFileContext')
    at _AgentSidebarView.updateContextBadge (...)
    at _AgentSidebarView.buildChatInput (...)
    at _AgentSidebarView.onOpen (...)
```

The sidebar shows the title but the chat container, input, and toolbar
are missing. A manual Obsidian reload recovers (because on fresh start,
`doLoad()` finishes before any view is opened).

## Causal Chain

1. BRAT replaces plugin files and calls `app.plugins.enablePlugin('obsilo-agent')`.
2. Obsidian fires `onload()` on the new plugin instance.
3. `onload()` is sync: it calls `registerView(VIEW_TYPE, cb)` and
   kicks off `doLoad()` fire-and-forget.
4. Because there's an existing leaf of this view type in the workspace
   (the user's open sidebar), Obsidian immediately calls `cb(leaf)` to
   instantiate a new `AgentSidebarView`. This happens within the same
   tick as `onload()`.
5. `onOpen()` runs and reads `this.plugin.settings.currentMode`.
6. `doLoad()` has not reached `await this.loadSettings()` yet.
   `this.plugin.settings` is `undefined`.
7. Access throws, the whole `onOpen` aborts, the DOM below the title
   is never built.

## Root Cause

The view's `onOpen` assumed that by the time Obsidian opened it, the
plugin's settings were loaded. That holds on cold start (settings load
long before the layout is ready) but NOT on BRAT hot-reload, where the
layout is already live and `onOpen` fires within the same tick as the
new plugin instance's `onload`.

## Fix

Two changes in [main.ts](../../../src/main.ts) and
[AgentSidebarView.ts](../../../src/ui/AgentSidebarView.ts):

1. **`plugin.readyPromise`**: created synchronously at the top of
   `onload()`, resolved from `.finally()` on `doLoad()`. This gives the
   view a deterministic signal for "plugin is fully initialised".

2. **View awaits readyPromise**: the first `await` in `onOpen()` is
   now `await plugin.readyPromise`. After that, `plugin.settings` and
   the rest of plugin state are guaranteed populated.

Order in `onload()` is important: the readyPromise is created BEFORE
`registerView`, so even the view instance that Obsidian spawns in the
same tick finds the promise already on `plugin`.

## Risk

- None. The await only fires on hot-reload or layout-restore paths;
  cold start already has settings by the time onOpen runs, so the
  promise resolves synchronously.
- If `doLoad()` itself throws (rare; non-fatal errors are already
  swallowed with `.catch` internally), the `.finally()` still marks
  ready so the view renders what it can. A downstream error surfaces
  through the existing log paths.

## Test Plan

Manual BRAT-update flow:

1. Install Obsilo Beta-N, open chat sidebar, verify normal render.
2. Publish Beta-N+1 on obsilo-dev (tag only), wait for BRAT to fetch.
3. Sidebar should re-render WITHOUT a full Obsidian reload. Console
   clean of the two TypeError stack traces.
4. Interact with chat: `/`, `@`, send a message. All should work.

## References

- Beta-5 BRAT fix (FEAT-22-08): introduced the leaf-cycle that
  exposed this race.
- FEAT-05-07 / ADR-72: settings-dependent paths that threw.
- Console trace from Beta-8 BRAT test (2026-04-19).
