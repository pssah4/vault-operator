# BUG-028: SandboxBridge vault paths with trailing slash return null

> **Priority:** P1 (agent regularly produces these paths; triggers BUG-027)
> **Epic:** EPIC-05 (Sandbox)
> **Date:** 2026-04-19
> **Discovered:** Beta-10 BRAT test (downstream of BUG-022)

## Problem

When the agent runs `ctx.vault.list('Notes/')` inside an
`evaluate_expression`, the bridge throws `"Not a folder: Notes/"`. The
same path without the trailing slash works. The agent treats the
trailing slash as idiomatic (mirrors `ls some/dir/`) and therefore
produces this shape routinely.

Follow-on impact: each trailing-slash attempt records an error on the
circuit breaker. A handful of normal-looking agent iterations then
trip BUG-027 and wedge the entire sandbox for the session.

## Causal Chain

1. Agent writes `const items = await ctx.vault.list('Notes/');`.
2. Bridge passes `'Notes/'` through `validateVaultPath` (passes: no
   `..`, no leading `/`).
3. `getAbstractFileByPath('Notes/')` returns `null`. Obsidian's abstract-
   file index addresses `Notes` without the trailing slash; with it,
   there is no hit.
4. `!(folder instanceof TFolder)` is true (`folder === null`), throw
   "Not a folder: Notes/".

BUG-022 fixed the same shape for the vault root (`'/'`). Trailing
slashes on sub-folders were left on the table.

## Root Cause

The bridge used the path verbatim after validation. Obsidian's API is
pedantic about trailing slashes (same quirk that made `'/'` return
null at the root in BUG-022); the bridge needs to normalise before
handing the path to `getAbstractFileByPath`.

## Fix

- New `normaliseVaultPath(raw)` helper in `SandboxBridge.ts`:
  - `/`, `.`, `./` -> `''` (root variants).
  - strip trailing `/` (including multiple `///`).
  - leave everything else alone; `validateVaultPath` still rejects
    absolute paths and `..` segments.
- All vault-reading bridge entries (`vaultRead`, `vaultReadBinary`,
  `vaultList`) pass the path through the helper before validation and
  before calling into Obsidian.
- Each entry also records a `recordError()` from its catch block so
  the breaker state tracks bridge-side exceptions consistently (used
  to only record from the worker side).

## Risk

- None. Trailing-slash paths were previously 100% error; after
  normalisation they succeed or surface the real error (not-a-folder,
  permission denied, etc.). No behaviour change for paths that were
  already correct.

## Test Plan

Five new unit tests in `SandboxBridge.vaultList.test.ts`:

- `vaultList('Notes/')` resolves to the same children as
  `vaultList('Notes')`.
- Multiple trailing slashes stripped.
- `normaliseVaultPath` direct tests cover root variants, trailing
  slashes, and pass-through cases.

## References

- BUG-022 (beta-7): root path `'/'` same class of bug, narrower fix.
- BUG-027: downstream consequence when the breaker trips from repeated
  trailing-slash errors.
- Console trace from Beta-10 BRAT test (2026-04-19).
