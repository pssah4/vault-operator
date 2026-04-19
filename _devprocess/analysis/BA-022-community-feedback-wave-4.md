# BA-022: Community Feedback Wave 4

> **Status:** Draft (Solution Proposal only -- no implementation yet)
> **Date:** 2026-04-19
> **Trigger:** [pssah4/obsilo#31](https://github.com/pssah4/obsilo/issues/31) by [@nicholas-leonard](https://github.com/nicholas-leonard)
> **Upstream branch:** [nicholas-leonard:obsilo:drag-and-drop](https://github.com/pssah4/obsilo/compare/main...nicholas-leonard:obsilo:drag-and-drop)

## 1 Problem Context

Nicholas Leonard opened issue #31 with four distinct bug-fix commits in his
fork. The reports come from pushing Obsilo "to its limits" in a real
vault. Each commit fixes a discrete symptom; taken together they cover
UI plumbing (drag-and-drop), context-externalisation plumbing
(read_file vs globalFs), tool-group configuration gaps, and a sandbox
integrity regression.

Because the fixes are small, low-risk and each maps cleanly to an
existing Epic, this wave follows the same structure as Wave 1
(BA-013) and Wave 2: route each bug into its owning Epic, no new Epic,
keep changes minimal and verifiable.

## 2 Bug Inventory

| ID | Symptom | Layer | Epic (proposed) | Priority |
|----|---------|-------|-----------------|----------|
| [BUG-019](BUG-019-drag-drop-from-vault-explorer.md) | Drag from file explorer into chat opens the file in a new tab instead of attaching | UI / sidebar | EPIC-004 (Chat UX) | P1 |
| [BUG-020](BUG-020-read-file-externalized-tmp.md) | `read_file` cannot open externalised tool results in `.obsidian-agent/tmp/` | Tool pipeline | EPIC-018 (Token-Kostenreduktion / ADR-063) | P1 |
| [BUG-021](BUG-021-missing-tools-in-builtin-modes.md) | `vault_health_check` not in the vault group, `ingest_document` not in the edit group of `builtinModes.ts` | Mode config | EPIC-019 (Knowledge Maintenance) | P2 |
| [BUG-022](BUG-022-sandbox-integrity-hashes-and-root-listing.md) | Pinned esbuild-wasm SHA-256 hashes no longer match the CDN; `vaultList('/')` throws because `getAbstractFileByPath('/')` returns null | Sandbox | EPIC-005 (Sandbox) | P1 |

All four fixes are already authored by the reporter and visible in the
upstream branch. Our job is to review, validate against our codebase,
adapt where needed (e.g. for Bot compliance, typing, test coverage),
and integrate -- not to re-invent the solution.

## 3 Root-Cause Summary (per bug)

### BUG-019: Drag-and-drop from Obsidian file explorer

The sidebar's `drop` handler reads from `dataTransfer`, which works for
**external** OS drags (Finder / Explorer) but is empty for Obsidian's
**internal** drags. Obsidian populates `app.dragManager.draggable`
instead. Additionally the drop event bubbles up to the workspace, which
then opens the file in a new tab. Missing `stopPropagation()` is the
second half of the bug.

**Fix direction:** read `draggable.file` (single) and `draggable.files`
(multi) first, fall back to `text/plain` for compat; add `stopPropagation`
on both `dragover` and `drop`.

### BUG-020: read_file misses externalised tmp results

ADR-063 externalises large tool results to `.obsidian-agent/tmp/task-*`
via `globalFs`, not through the vault adapter. `read_file` first asks
the vault metadata cache, then the vault adapter, and never consults
`globalFs`. The agent sees its own externalised output as "not found".

**Fix direction:** when the vault adapter reports no file and the path
looks like `tmp/task-*`, fall through to `plugin.globalFs.read()`.

### BUG-021: Mode tool groups missing tools

`vault_health_check` (FEATURE-1901) and `ingest_document`
(FEATURE-1902 / EPIC-019) ship but were never registered in the
`TOOL_GROUP_MAP` constant inside `src/core/modes/builtinModes.ts`. Any
mode that uses the `vault` or `edit` group therefore can't call these
two tools.

**Fix direction:** one-line additions to the `vault` and `edit` arrays.

### BUG-022: Sandbox integrity hashes + vault root listing

Two independent issues in the same commit:

a) `EsbuildWasmManager` pins SHA-256 integrity hashes for the
   esbuild-wasm CDN artefacts. The CDN content changed, so first-time
   download verification now always fails. The reporter already computed
   the new hashes.

b) `SandboxBridge.vaultList(path)` calls
   `vault.getAbstractFileByPath(path)`. For the root case `path === '/'`
   this returns `null` because Obsidian represents the root as an empty
   string internally. `vaultList('/')` therefore always throws
   "Not a folder".

**Fix direction:** update the hash constants, normalise `/` to `''` and
route the root case through `vault.getRoot()`.

## 4 Assessment

### 4.1 Upstream quality

The commits are small, self-contained and surgical. No refactors. Each
commit fixes one root cause. This matches our own commit style.

### 4.2 Risks

- BUG-019 reaches into `app.dragManager`, which is **undocumented**
  Obsidian internals. The Community Plugin Review Bot tolerates this if
  scoped and guarded, but we should keep the type assertion narrow and
  behind a null-check; fallback to `text/plain` must stay working for
  setups where `dragManager` is missing.
- BUG-020 introduces a second file-resolution path in a hot tool. The
  `tmp/task-*` prefix check must be strict (no general tmp fallback)
  to avoid accidentally reaching into user files named `tmp.md` etc.
- BUG-022's integrity hashes must be verified locally once -- we don't
  trust upstream's numbers blindly for a security-relevant check.

### 4.3 Review-Bot alignment

Each fix needs a final `npx eslint src/ --max-warnings 0` pass.
BUG-019's `dragManager` access will trip `no-explicit-any`; we need
`unknown` + narrow casts plus `-- reason` comments on any eslint-disable.

## 5 Proposed Plan (for Coding phase, NOT yet active)

1. **Branch:** `feature/community-wave-4` already created.
2. **Order:**
   1. BUG-021 (trivial, no risk) -- warm-up commit
   2. BUG-020 (small, well-scoped)
   3. BUG-019 (type-guarded, needs unit test for dragManager branch)
   4. BUG-022 (verify hashes locally, then commit)
3. **Each commit cites the BUG-ID** in the footer (`Refs: BUG-019`).
4. **Tests:**
   - BUG-019: unit test asserting the dragManager code path resolves to
     vault files given a mocked `app.dragManager.draggable`.
   - BUG-020: unit test asserting `read_file` delegates to `globalFs`
     for `tmp/task-abc/result.md` when the vault adapter misses it.
   - BUG-021: tiny test that the two tools appear in the respective
     groups of `TOOL_GROUP_MAP`.
   - BUG-022: integration-style check that computed SHA-256 over the
     cached download matches the new constants (guarded so CI doesn't
     re-fetch on every run).
5. **Release:** bundle as `v2.6.0-beta.7` (or `v2.6.1-beta.1` if v2.6.0
   ships before Wave 4 is ready) on obsilo-dev; mainline release only
   after BRAT-tester sign-off.

## 6 Contribution Feedback (for issue response)

Nick asked about contribution guidelines. The community-plugin
conventions used by Obsilo are documented under
`_devprocess/architecture/` (V-Model, ADR-MADR) and in CLAUDE.md. The
workflow Nick followed (fork -> compare branch -> link commits)
matches our preferred pattern for small bundles; PRs are also welcome.
Proper guideline doc is a separate task (tracked once the project
opens up to contributors more formally).

## 7 Deliverables of this Phase (already produced)

- `_devprocess/analysis/BA-022-community-feedback-wave-4.md` (this file)
- `_devprocess/analysis/BUG-019-drag-drop-from-vault-explorer.md`
- `_devprocess/analysis/BUG-020-read-file-externalized-tmp.md`
- `_devprocess/analysis/BUG-021-missing-tools-in-builtin-modes.md`
- `_devprocess/analysis/BUG-022-sandbox-integrity-hashes-and-root-listing.md`

Implementation is intentionally deferred: per user instruction
"noch nicht implementieren".
