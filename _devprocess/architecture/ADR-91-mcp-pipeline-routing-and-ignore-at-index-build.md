# ADR-91: MCP Pipeline Routing and IgnoreService at Index Build

**Date:** 2026-04-29
**Deciders:** Sebastian Hanke
**Replaces / refines:** AUDIT-013 interim deny-list (C-1)
**Related:** ADR-01 (ToolExecutionPipeline), AUDIT-013

## Context

AUDIT-013 found two architectural issues that the initial fix wave
addressed with interim measures:

1. **C-1 (Critical) -- MCP `execute_vault_op` bypassed `ToolExecutionPipeline`.**
   The interim fix added a hand-maintained `MCP_DENY_TOOLS` set listing
   every write or executing tool. Two costs followed: every new write
   tool must be added manually (easy to forget; security depends on
   developer discipline), and the read-tool path still skipped IgnoreService,
   schema validation, checkpoints, cache and operation log.

2. **IgnoreService applied only at read time.** Search and resource
   paths filter, but the semantic index itself includes ignored notes.
   A future bypass at the read layer would still leak content because the
   embeddings are already there.

## Decision

Two structural changes that remove the pattern-matching surface entirely.

### Decision 1: route `execute_vault_op` through `ToolExecutionPipeline`

`handleExecuteVaultOp` constructs a per-call `ToolExecutionPipeline`,
synthesises a `ToolUse` envelope, and calls `pipeline.executeTool`. No
`apiHandler` is wired (LLM-driven tools like `plan_presentation` are
unavailable from the MCP context by construction). No `onApprovalRequired`
callback is wired -- which means the pipeline's existing fail-closed
approval logic rejects every write tool without any deny-list to maintain.

What this gives us, for free, on every MCP call:

- **IgnoreService** in `validatePaths` blocks ignored / protected paths.
- **JSON-Schema validation** rejects malformed `params`.
- **Approval flow** auto-approves read tools and rejects writes
  (`No approval callback for X -- denying (fail-closed)`).
- **Checkpoint creation** for write tools (when ever permitted).
- **Result cache** for read tools.
- **Operation log** entry per call.
- **Chat-linking, externalization, read-files tracking** all participate
  through the same code path.

`AGENT_INTERNAL_TOOLS` stays as a hard deny at the MCP boundary because
those tools are not part of the MCP surface conceptually
(`switch_mode`, `new_task`, `update_settings`, ...). The pipeline auto-
approves the `agent` group, so without the boundary check those tools
would still execute.

### Decision 2: extend IgnoreService into the index build

`SemanticIndexService` accepts an optional `isIgnored: (path) => boolean`
predicate via `SemanticIndexOptions`. The plugin wires it to
`ignoreService.isIgnored`. Files matching the predicate are excluded at
build time, so their content never enters the embedding store.

This is defense in depth on top of the read-time filters in `searchVault`
and `SearchFilesTool`. Even if a future read path is added without the
filter, ignored content cannot be retrieved because there are no
embeddings to match against.

## Considered Options

### Option A: keep `MCP_DENY_TOOLS`, fix one more pipeline layer at a time

Cheap in the short term, brittle long term. Every new write tool needs
a code review change to add it to the set. Forgetting one is a silent
security regression. Rejected.

### Option B: route through pipeline, drop deny-list (chosen)

One-time refactor; subsequent tool additions automatically inherit
governance. The pipeline already has the right semantics
(`isWriteOperation` -> approval flow -> fail-closed without callback).

### Option C: add a separate "MCP-allowed" allowlist

Explicit allowlist would mirror the pipeline's read/write groupings.
More intrusive (requires touching every read tool's metadata) and
duplicates information already in `tool.isWriteOperation`. Rejected.

### Option D: index-build ignore via exclusions

`SemanticIndexOptions` already had an `excludedFolders` filter. We
generalise to a predicate so any IgnoreService rule (folder, glob,
pattern) participates uniformly. Existing `excludedFolders` stays for
backwards compat; the new predicate runs after it.

## Consequences

### Positive

- No deny-list to maintain. Adding a new write tool automatically gets
  fail-closed treatment from the MCP boundary because the pipeline's
  `isWriteOperation` check fires.
- Read tools called via `execute_vault_op` now respect IgnoreService,
  schema, cache, and operation log uniformly with the agent loop.
- Ignored content never enters the embedding store. A future bypass at
  read level cannot retrieve embeddings that were never created.
- Single source of truth (pipeline) for tool execution semantics; the
  MCP handler shrinks to a thin envelope.

### Negative

- Per-call pipeline construction has a small overhead (one
  `ResultExternalizer` instance + tmp dir creation lazily). Acceptable
  for MCP frequency.
- Tools that need an `apiHandler` for internal LLM calls
  (e.g. `plan_presentation`) are unavailable via `execute_vault_op`. They
  remain available via dedicated MCP handlers when those exist.
- Existing embeddings for now-ignored files persist until next full
  rebuild. Documented as a known limitation; the read-time filters
  continue to gate retrieval until the rebuild catches up.

### Risks

- **Tool that depends on full Pipeline context but is wired as read-only**:
  `pushToolResult` is the only callback the previous direct path
  invoked. The pipeline supplies the same callback shape plus
  `pushProgress`, `handleError`, `log`. Tests confirm tool execution
  still works for synthetic read tools. Production tools that previously
  worked through the direct path continue to work because they only use
  `pushToolResult`.
- **Auto-approve of `agent` group**: `checkApproval` returns
  `{ decision: 'auto' }` for `group === 'agent'`. The `AGENT_INTERNAL_TOOLS`
  boundary check stops these from reaching the pipeline at all.

## Implementation

### Changed files

| File | Change |
|------|--------|
| `src/mcp/tools/executeVaultOp.ts` | Replaces direct `tool.execute` with `pipeline.executeTool`. Drops `MCP_DENY_TOOLS`. Keeps `AGENT_INTERNAL_TOOLS` deny. |
| `src/mcp/tools/__tests__/executeVaultOp.test.ts` | New test cases: read-tool round-trip, write-tool fail-closed via approval, unknown-op listing excludes internals. |
| `src/core/semantic/SemanticIndexService.ts` | New `isIgnored` option; build filter combines folder + ignore. |
| `src/main.ts` | Wires `ignoreService.isIgnored` into the SemanticIndex constructor. |

### Not changed

- `IgnoreService`, the pipeline approval logic, the read-time filters
  in `searchVault` / `SearchFilesTool` / `McpBridge` resources. The
  AUDIT-013 P1 fixes from earlier in the session remain.

## Validation

- 1011 / 1011 tests passing after the change.
- Test suite for the new dispatcher: 11 cases covering AGENT_INTERNAL deny,
  unknown-op behaviour, read tool round-trip, write tool fail-closed.
- Build green on the iCloud-deployed plugin path.

## Related

- AUDIT-013 finding C-1 status moves from "Resolved (interim)" to
  "Resolved (proper)".
- ADR-90 (cost-aware heuristics) unaffected.
