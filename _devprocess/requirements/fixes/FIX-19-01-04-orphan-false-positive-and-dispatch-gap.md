---
id: FIX-19-01-04
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FEAT-19-01, FIX-19-01-03]
created: 2026-06-20
---

# FIX-19-01-04, Three live-test defects after FIX-19-01-03

## Symptoms (user repro 2026-06-20)

1. **Orphan-move was semantically wrong.** Notes that had outgoing frontmatter edges (e.g. `Notes/Malte Lantin.md` with `Themen: [[Software Engineering ...]]`) got moved to `Inbox/Orphans/`. The user expected only truly isolated notes to land there.

2. **13 findings reappeared after the Auto-fix completion modal closed.** The completion screen claimed success, but re-opening the Vault Health modal showed the same findings (or a similar count) again.

## Root causes (three independently diagnosed)

### Defect A: orphan-split present in detection, but ignored in repair

`checkOrphans` SQL flags any vault note that is NOT a TARGET of any edge — i.e. notes with no INCOMING links. A note with `Themen: [[X]]` has outgoing edges but no incoming, so the predicate fires. The detection method already splits into `withContext` (has outgoing edges OR ontology cluster membership) and `isolated` (neither), but emits BOTH as `check: 'orphans'` findings without any metadata distinguishing them. `moveOrphansToFolder` treats every orphan path the same and moves all of them.

### Defect B: `inconsistent_tags` listed as REPAIRABLE without a dispatch branch

`inconsistent_tags` lives in `REPAIRABLE_CHECKS`, so `selectAllRepairable` checks its boxes. But `doRepair` has NO `selectedTypes.has('inconsistent_tags')` branch, and there is no `fixInconsistentTags` method in `VaultHealthService`. The selected findings produce zero mutations; `runChecks` at the end of the repair re-detects the same tag pairs identically; they show up in the next modal-open exactly as before.

### Defect C: modify-event queue race after the flag clears

`vaultHealthRepairInProgress` clears in the `finally` block of `runRepair`. Obsidian queues `vault.on('modify')` events asynchronously; some events from the repair's `processFrontMatter` writes get dispatched AFTER `waitForMetadataCacheSettle` resolves AND AFTER `extractAll` runs. With the flag false again, the global modify listener in `main.ts` calls `graphExtractor.extractFile(file)` with a possibly-still-stale metadataCache, overwriting the freshly-correct edges in the DB.

## Fix

### A. Orphan-kind metadata + per-finding repairable filter

- `HealthFinding.metadata.orphanKind` carries `'isolated'` or `'with_context'` from `checkOrphans`.
- `isRepairableFinding(finding)` replaces `REPAIRABLE_CHECKS.has(finding.check)` at every selection site (banner count, severity-filter count, checkbox render, selectAllRepairable, post-repair counter). It rejects `orphans` findings whose `metadata.orphanKind !== 'isolated'`.
- `moveOrphansToFolder` adds a live SQL second-pass guard. Even if a future caller mistakenly passes a `with_context` orphan path, the helper checks `edges` (outgoing frontmatter edges) AND `ontology` (cluster membership) for the path and skips it. Returns `{ notesMoved, notesSkipped, notesSkippedWithContext }`.

### B. `inconsistent_tags` removed from REPAIRABLE_CHECKS

The check stays — `inconsistent_tags` findings still appear in the Findings tab as a "consider unifying" hint with a Discuss button. They no longer offer a checkbox or get pre-selected by the Auto-fix banner. A real `fixInconsistentTags` implementation lands as a separate IMP if the user wants it.

### C. `waitForVaultModifyDrain` + second extractAll

Between `extractAll` and `runChecks`, the modal now calls `waitForVaultModifyDrain(affectedPaths)`: a one-shot `vault.on('modify')` listener resolves when every affected path has fired at least once OR a 2-second hard timeout passes. The `vaultHealthRepairInProgress` flag stays true for the whole drain. A second `extractAll` runs right after the drain to overwrite any stale edges a late modify-listener might have written while the queue unwound.

## Acceptance criteria

| AC | Description |
|---|---|
| AC-01 | `checkOrphans` emits `metadata.orphanKind` on both finding branches. |
| AC-02 | Notes with outgoing frontmatter edges OR ontology cluster membership are NEVER moved by `moveOrphansToFolder`, even if a buggy caller passes them. |
| AC-03 | `inconsistent_tags` findings render in the Findings tab without a checkbox and are NOT pre-selected by the Auto-fix banner. |
| AC-04 | After a repair completes, the `vaultHealthRepairInProgress` flag stays true until `vault.on('modify')` has drained for every affected path (or 2 s elapsed). |
| AC-05 | A second `extractAll` runs after the drain so any stale-listener writes that landed during the drain get overwritten. |
| AC-06 | The post-repair results screen shows `N orphan(s) kept in place: they have outgoing edges or cluster membership` when the second-pass guard skips anything. |
| AC-07 | Re-opening the modal after a successful Auto-fix shows the post-repair finding set (the auto-fixed findings do NOT reappear). |

## Out of scope

- Real `fixInconsistentTags` implementation (separate IMP if requested).
- Splitting the `orphans` HealthCheckType into two distinct check types (would touch the full enum); the metadata route is enough.
- A user-visible severity downgrade for `with_context` orphans (they stay at `medium` so the user still notices them and can decide to add the missing backlink manually).

## References

- `src/core/knowledge/VaultHealthService.ts:313-414` (checkOrphans, metadata split)
- `src/core/knowledge/VaultHealthService.ts:1105-1182` (moveOrphansToFolder, live second-pass guard)
- `src/ui/modals/VaultHealthRepairModal.ts` (isRepairableFinding helper, REPAIRABLE_CHECKS without inconsistent_tags, waitForVaultModifyDrain + second extractAll)
- `src/core/knowledge/__tests__/VaultHealthService.test.ts` (+2 regression tests: orphanKind=with_context for note with Themen, orphanKind=isolated for truly lonely note)
- Diagnose anchor: `/private/tmp/.../wtho1x4pg.output` (three converging scouts)
