# BUG-021: vault_health_check and ingest_document missing from builtin mode tool groups

> **Priority:** P2
> **Epic:** EPIC-19 (Knowledge Maintenance)
> **Date:** 2026-04-19
> **Reporter:** [@nicholas-leonard](https://github.com/nicholas-leonard) via [#31](https://github.com/pssah4/obsilo/issues/31) / commit [cb5aec3](https://github.com/nicholas-leonard/obsilo/commit/cb5aec3)

## Problem

Two knowledge-maintenance tools exist in the registry but are not
reachable from the built-in modes because they were never added to
`TOOL_GROUP_MAP`:

- `vault_health_check` (FEAT-19-01) -- should live in the `vault` group.
- `ingest_document` (FEAT-19-02 / EPIC-19) -- should live in the `edit` group.

Any mode configured with only these standard groups (including the
shipped defaults) cannot use the tools. Users see them in documentation
but the agent reports them as unavailable.

## Causal Chain

1. FEAT-19-01 adds `vault_health_check` to the tool registry.
2. FEAT-19-02 adds `ingest_document` similarly.
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

In [src/core/modes/builtinModes.ts](../../../src/core/modes/builtinModes.ts):

- Add `'vault_health_check'` to the `vault` array.
- Add `'ingest_document'` to the `edit` array.

One-line changes, no other files involved.

## Adaptations for Our Codebase

- Add a test that iterates `toolRegistry.getAllToolNames()` and asserts
  every tool name (except those explicitly flagged `hidden: true`) is
  reachable from at least one group in `TOOL_GROUP_MAP`. This is the
  real fix -- without it we will repeat the same miss in the next wave.
- Update the feature specs of FEAT-19-01 and FEAT-19-02 with a
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

## Amendment 2026-04-19 (beta-10)

Beta-7 added `vault_health_check` to `TOOL_GROUP_MAP.vault` and
`ingest_document` to `TOOL_GROUP_MAP.edit`, backed by the
`TOOL_GROUP_MAP` coverage test. Live BRAT testing surfaced a second
reason the agent still could not invoke the tools: both tools are in
`DEFERRED_TOOL_NAMES` (FEAT-16-00), so the LLM has to go through
`find_tool` to activate them. The LLM phrased the query as
`"vault health check"` (spaces, natural English), but the matcher in
`FindToolTool.execute` only did plain substring matching. The tool
name is `vault_health_check` and the label is just `"Health Check"`
-- the phrase `"vault health check"` existed in neither string, so
the match scored zero and the tool stayed hidden.

**Fix (FindToolTool.ts):**

- Tokenise the query on whitespace / `-` / `_`, require tokens
  >= 3 chars (filters noise words like "no", "at").
- Normalise haystacks by replacing `_` and `-` with spaces, so
  `vault_health_check` and `vault-health-check` match the same
  phrase.
- Score phrase hits on name / label strongest; score per-token hits
  additively.
- Require a STRONG hit (phrase on any field, OR token on name/label)
  before a tool enters the match list -- description-only token hits
  were noisy (common words like "tool", "note", "file").

Tests: 5 new cases in `deferredToolLoading.test.ts` that would have
caught the regression (multi-word queries like `"vault health check"`,
`"create pptx"`, `"ingest document"`, hyphenated form, label-only
`"health"` hit).

## References

- Upstream commit: [cb5aec3](https://github.com/nicholas-leonard/obsilo/commit/cb5aec3)
- Touches: `src/core/modes/builtinModes.ts` plus new coverage test.
