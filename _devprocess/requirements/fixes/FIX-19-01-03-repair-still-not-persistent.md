---
id: FIX-19-01-03
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FEAT-19-01, FIX-19-01-01]
created: 2026-06-20
---

# FIX-19-01-03, Vault Health repair still not persistent after FIX-19-01-01

## Symptom

User report 2026-06-20 (after FIX-19-01-01 shipped): clicks Auto-fix, sees the completion modal, closes, opens Vault Health again. The same findings reappear, including the proposal to fix them again.

## Root cause (three combined defects)

Parallel diagnose ran three independent scouts (`edgeReplacement`, `dbState`, `modalReopen`); they converged on the same chain:

### Defect A (smoking gun): the global `vault.on('modify')` listener overwrites fresh edges with stale-cache reads

`src/main.ts:1759` registers a synchronous modify-listener:

```ts
this.registerEvent(this.app.vault.on('modify', (file) => {
    ...
    if (file.extension === 'md') {
        this.graphExtractor?.extractFile(file);
        ...
    }
}));
```

Every `processFrontMatter` call inside `fixMissingBacklinks` fires this listener BEFORE Obsidian's `metadataCache.on('changed', file)` event settles. `extractFile` reads `app.metadataCache.getFileCache(file)`, which is still the OLD frontmatter (no fresh `Notizen: [[S]]` yet). `replaceEdgesForPath` then writes the STALE edge set back into the DB, undoing whatever the repair just produced. The modal's later `waitForMetadataCacheSettle + per-file extractFile` does write the right edges — but by then the listener has already polluted the DB, and any subsequent modify during the rest of the batch fires the listener again with stale-cache.

### Defect B: per-file re-extraction skips files outside `selectedFindings`

`VaultHealthService.fixMissingBacklinks` and `cleanupInvalidBacklinks` iterate every one-sided edge in the DB, NOT only the selected findings. They mutate a SUPERSET of `selectedFindings.paths`. The modal's re-extraction loop only touches `affectedPaths` (derived from `selectedFindings`); files outside that set never get a fresh `extractFile` call. The `extractAll` fallback only fires when `perFileSucceeded === 0`, which is almost never — so the safety net effectively doesn't exist.

### Defect C: 100-path cap on `collectAffectedPaths`

Even for the files inside `selectedFindings`, `slice(0, 100)` truncates the batch. With more than 100 affected paths, the tail never gets re-extracted.

## Fix

### A. New `plugin.vaultHealthRepairInProgress` flag

```ts
// main.ts (plugin instance field)
vaultHealthRepairInProgress = false;

// main.ts (modify listener, edge-extract branch)
if (!this.vaultHealthRepairInProgress) {
    this.graphExtractor?.extractFile(file);
}
```

The non-edge parts of the listener (FrontmatterIndexer, scheduleFileIndex, implicitConnection, ontologyStore) still run; only the synchronous edge-extract is skipped during the repair window. The repair owns the post-write extraction.

### B. Always run `extractAll` at the end of the repair

The per-file `extractFile(file)` loop stays as a fast first pass for the tracked paths, but `extractAll(vault)` runs unconditionally afterwards. extractAll picks up every mutated file regardless of which path the selection tracked. It is O(vault) but the user is already in a "Verifying..." progress state, so the latency is acceptable; the alternative is incorrect findings.

### C. Cap on `collectAffectedPaths` raised from 100 to 500

The cap exists only so the checkpoint snapshot does not balloon on huge batches; the re-extract path no longer depends on this set after fix (B), so the constant is loose.

### D. Repair window pinned via try/finally

`runRepair` splits into a thin orchestrator that flips the flag in `try` and clears it in `finally`, plus a `doRepair` worker. If `doRepair` throws, the flag still resets — no permanent silencing of the modify listener.

## Acceptance criteria

| AC | Description |
|---|---|
| AC-01 | During a Vault Health repair, the global modify listener does NOT call `graphExtractor.extractFile(file)` on the modified file. |
| AC-02 | After repair, `extractAll(vault)` runs unconditionally before the verification `runChecks()` call. |
| AC-03 | After the repair completes (success OR exception), `plugin.vaultHealthRepairInProgress` is `false`. |
| AC-04 | `collectAffectedPaths()` caps at 500 entries, not 100. |
| AC-05 | A second open of the modal in the same session shows the post-repair findings, NOT the pre-repair findings. |
| AC-06 | After a plugin reload + a fresh health check, the post-repair findings persist (the DB write made it to disk via the standard 2-second debounce + onunload close). |

## Out of scope

- The 2-second `markDirty` save debounce on `KnowledgeDB`: if the user quits Obsidian within 2 seconds of finishing the repair, the in-memory edge changes may not be persisted. Tracked separately under the existing `onunload` close path which awaits the flush; deferred unless a follow-up bug surfaces.
- The `metadataCache` settle timeout of 3 seconds for the whole batch: with `extractAll` always running afterwards, individual file-settle races no longer matter for the edges table. The settle wait still helps the per-file fast pass; nothing else depends on it.

## References

- `src/main.ts` (field + modify listener edge-extract gate)
- `src/ui/modals/VaultHealthRepairModal.ts:998-1140` (runRepair orchestrator split + extractAll + cap raise)
- Diagnose anchor: `/private/tmp/.../w2aouweoo.output` (three converging scout reports)
