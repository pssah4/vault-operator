# BUG-025: Vault-health badge disappeared + redesign to heart-pulse icon

> **Priority:** P1 (regression)
> **Epic:** EPIC-19 / FEAT-19-01 (Vault Health Check)
> **Date:** 2026-04-19

## Problem

Two separate items rolled into one fix:

**a) Regression.** The vault-health indicator next to the sidebar title
stopped appearing after the Beta-5 BRAT-rebuild change. Health findings
still existed and were readable from the modal, but the coloured dot
never showed up.

**b) Redesign request.** User wanted the indicator moved out of the
title, replaced with a lucide `heart-pulse` icon coloured by severity
(`color-red` / `color-orange`), and placed immediately left of the
settings button. The indicator must stay hidden when no findings exist.
Same opportunity: shorten the sidebar title from "Vault Operator" to
"Vault Operator".

## Causal Chain -- (a)

1. Beta-5 introduced an `onLayoutReady` path that cycles stale sidebar
   leaves through `setViewState({ type: 'empty' })` and back -- fixes
   a BRAT-update regression (empty input area).
2. The vault-health block in `main.ts` runs in its own `onLayoutReady`
   and calls `view.updateHealthBadge(...)` on the FIRST leaf it finds.
3. The cycle and the health-check run in parallel. Depending on race
   outcome, `updateHealthBadge` either runs on the stale (about-to-be-
   replaced) view or on the new view whose `buildHeader` has not
   finished yet -- `this.healthBadge` is still null.
4. Result: the healthBadge that ends up mounted in the DOM never sees
   the update, so it stays hidden.

## Root Cause -- (a)

The view never self-syncs from the plugin's cached health service
state. It relies entirely on a one-shot push from `main.ts`, and that
push can miss when the view mounts after the check completes.

## Fix -- (a)

`AgentSidebarView.buildHeader()` now calls a new private
`syncHealthBadge()` immediately after creating the badge element. That
helper reads `plugin.vaultHealthService.getFindings()` and updates the
badge against the current state. The external push from `main.ts` stays
-- both paths now reach the same end state.

## Fix -- (b)

- `this.healthBadge` is now a `header-button` styled like its
  neighbours, placed in `headerRight` BEFORE the settings button.
- `setIcon(innerSpan, 'heart-pulse')` replaces the coloured dot.
- Severity classes (`.severity-high`, `.severity-medium`,
  `.severity-low`) control the icon colour via `color` (heart-pulse
  uses `currentColor` for its stroke). Hidden state is handled by the
  existing `.agent-u-hidden` utility class.
- The title `ui.sidebar.title` is now `"Vault Operator"` (English locale);
  other labels like the ribbon tooltip stay `"Vault Operator"` so the
  command palette keeps its full identifier.

## Risk

- Low. The view-side sync is a pure read; the push from `main.ts` still
  runs and converges to the same state. Having both paths is belt-and-
  braces, not conflict.

## Test Plan

- Existing integration tests of `updateHealthBadge` cover the CSS
  transitions; no unit test was added for `syncHealthBadge` because it
  is a pure passthrough that uses the already-tested update path.
- Manual: BRAT-update Vault Operator while a findings-rich vault is open;
  verify the heart-pulse icon appears left of the settings button in
  red/orange after the update.

## References

- Beta-5 BRAT fix (FEAT-22-08): same `onLayoutReady` where the race
  was introduced.
- FEAT-19-01: Vault Health Check infrastructure.
- Lucide icon `heart-pulse`: https://lucide.dev/icons/heart-pulse
