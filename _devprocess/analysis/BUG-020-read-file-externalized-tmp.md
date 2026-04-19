# BUG-020: read_file cannot open externalised tool results under tmp/

> **Status:** Resolved 2026-04-19 (feature-branch, unreleased)
> **Priority:** P1
> **Epic:** EPIC-018 (Token-Kostenreduktion, ADR-063 Context Externalisation)
> **Date:** 2026-04-19
> **Reporter:** [@nicholas-leonard](https://github.com/nicholas-leonard) via [#31](https://github.com/pssah4/obsilo/issues/31) / commit [3cbec9d](https://github.com/nicholas-leonard/obsilo/commit/3cbec9d)

## Problem

Large tool results are externalised to `.obsidian-agent/tmp/task-<id>/result.md`
(ADR-063). The tool result sent to the model contains a compact reference
plus a `read_file` hint so the model can pull the full payload when it
needs it. That `read_file` call then fails: the file is "not found"
even though it is clearly on disk. The agent ends up in a loop trying to
resolve its own externalised output.

## Causal Chain

1. A tool (e.g. `search_files`, `read_document`) returns a large payload.
2. The externaliser (ADR-063) writes the payload via `plugin.globalFs`
   to `.obsidian-agent/tmp/task-<id>/result.md`. `globalFs` is the
   cross-platform fs adapter that respects the configured agent folder
   (ADR-072) and works for absolute paths too.
3. The tool result block replaces the body with a reference containing
   `read_file` hint `tmp/task-<id>/result.md` (relative to the agent
   folder root, not to the vault).
4. The model calls `read_file({ path: 'tmp/task-<id>/result.md' })`.
5. `ReadFileTool.execute()` calls `vault.getAbstractFileByPath(path)` ->
   `null` (vault doesn't index dot-folders / files outside the vault).
6. Fallback: `vault.adapter.exists(path)` -> `false` (the file lives in
   `globalFs`, not the vault adapter).
7. Tool returns "file not found". Agent retries, loops, or gives up.

## Root Cause

`ReadFileTool` knows only about the vault adapter. The externalisation
pipeline writes through `globalFs` -- a separate abstraction that was
introduced after `ReadFileTool` was written. The two systems never met.

## Fix Direction (from upstream commit 3cbec9d)

In [src/core/tools/vault/ReadFileTool.ts](../../src/core/tools/vault/ReadFileTool.ts):

- When vault-adapter check misses, test whether the path begins with
  `tmp/` AND `plugin.globalFs` is available.
- If so, fall through to `globalFs.exists()` + `globalFs.read()`.
- Use the same size-capping and formatting branch as the vault path so
  the tool's response shape stays identical whatever the source.

## Adaptations for Our Codebase

- Upstream duplicates the formatting logic inline. We should extract a
  small helper (`formatReadResult(content, meta)`) so the vault branch
  and the globalFs branch call the same formatter -- avoids future drift.
- Prefix check must be strict: only `tmp/task-*` (externalised task
  outputs), not arbitrary `tmp/...` user files. Guard against
  path-traversal by rejecting `..` segments after the prefix.
- The tool exposes user-visible paths; make sure the returned
  `filePath` keeps the same `tmp/task-<id>/...` form the model sees.

## Risk

- Medium. Introduces a second resolution path in a tool that is called
  on every turn. If the tmp branch ever returns stale content (e.g.
  for a recycled task id), the model reads old data.
- Mitigation: only read files named exactly as the externaliser writes
  them; do not do any `glob` or wildcard resolution in the tmp branch.
  The strict prefix check above is the guard.

## Test Plan

- Unit test: `read_file({ path: 'tmp/task-abc/result.md' })` with vault
  adapter missing the file and `globalFs.read()` returning a mock
  payload -> tool returns the payload with `path` intact.
- Unit test: non-`tmp/task-*` path still misses when the vault adapter
  misses (no leaking to globalFs for arbitrary paths).
- Unit test: `tmp/../etc/passwd` is rejected.
- Integration: run a prompt that triggers externalisation end-to-end,
  verify the downstream `read_file` succeeds.

## Out of Scope (for this fix)

- TTL / garbage collection for externalised tmp files (separate FEATURE
  in EPIC-018).
- Cross-session externalisation persistence.

## References

- Upstream commit: [3cbec9d](https://github.com/nicholas-leonard/obsilo/commit/3cbec9d)
- Touches: `src/core/tools/vault/ReadFileTool.ts` (and a new tiny helper).
- Related: ADR-063 (Context Externalization).
