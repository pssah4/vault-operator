# BUG-021: vault_health_check and ingest_document missing from builtin mode tool groups

> **Status:** Resolved 2026-04-19 (feature-branch, unreleased)
> **Priority:** P2
> **Epic:** EPIC-019 (Knowledge Maintenance)
> **Date:** 2026-04-19
> **Reporter:** [@nicholas-leonard](https://github.com/nicholas-leonard) via [#31](https://github.com/pssah4/obsilo/issues/31) / commit [cb5aec3](https://github.com/nicholas-leonard/obsilo/commit/cb5aec3)

## Problem

Two knowledge-maintenance tools exist in the registry but are not
reachable from the built-in modes because they were never added to
`TOOL_GROUP_MAP`:

- `vault_health_check` (FEATURE-1901) -- should live in the `vault` group.
- `ingest_document` (FEATURE-1902 / EPIC-019) -- should live in the `edit` group.

Any mode configured with only these standard groups (including the
shipped defaults) cannot use the tools. Users see them in documentation
but the agent reports them as unavailable.

## Causal Chain

1. FEATURE-1901 adds `vault_health_check` to the tool registry.
2. FEATURE-1902 adds `ingest_document` similarly.
3. Neither feature's PR edits the `TOOL_GROUP_MAP` constant in
   `src/core/modes/builtinModes.ts`.
4. Default modes (all using standard groups) exclude both tools.
5. Agent receives a system prompt without these tools; it can neither
   discover nor invoke them.

## Root Cause

`TOOL_GROUP_MAP` is a hand-maintained registry. We have no lint / test
that verifies every registered tool appears in at least one group. When
a tool lands but the wiring step is forgotten, it is invisible until
someone notices.

## Fix Direction (from upstream commit cb5aec3)

In [src/core/modes/builtinModes.ts](../../src/core/modes/builtinModes.ts):

- Add `'vault_health_check'` to the `vault` array.
- Add `'ingest_document'` to the `edit` array.

One-line changes, no other files involved.

## Adaptations for Our Codebase

- Add a test that iterates `toolRegistry.getAllToolNames()` and asserts
  every tool name (except those explicitly flagged `hidden: true`) is
  reachable from at least one group in `TOOL_GROUP_MAP`. This is the
  real fix -- without it we will repeat the same miss in the next wave.
- Update the feature specs of FEATURE-1901 and FEATURE-1902 with a
  note: "tool group wiring is part of the DoD; confirm via
  TOOL_GROUP_MAP coverage test."

## Risk

- None for the two added tool names.
- The coverage test is the only change that could fail on unrelated
  work; acceptable because that is exactly its purpose.

## Test Plan

- New test `builtinModes.toolGroupMapCoverage.test.ts` that fails loudly
  when a registered tool is not assigned to any group.
- Regression check: existing mode-tests still pass (no mode-shape change).

## Out of Scope (for this fix)

- Re-sorting the existing group arrays alphabetically (cosmetic).
- Splitting `edit` into smaller sub-groups (separate UX decision).

## References

- Upstream commit: [cb5aec3](https://github.com/nicholas-leonard/obsilo/commit/cb5aec3)
- Touches: `src/core/modes/builtinModes.ts` plus new coverage test.
