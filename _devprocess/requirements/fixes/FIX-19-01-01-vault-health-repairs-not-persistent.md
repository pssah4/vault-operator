---
id: FIX-19-01-01
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FEAT-19-01]
created: 2026-06-20
---

# FIX-19-01-01, Vault Health repairs do not persist across re-check

## Symptom

User report 2026-06-20: after clicking "Repair selected (N)" in the Vault Health modal, the modal shows success. But after closing and re-opening (or after a plugin reload + re-running the health check), the same notes appear again as `missing_backlinks` findings. The fix did not stick.

## Causal chain (two combined defects)

### Defect A: backlinksProperty hardcoded, SQL ignored property_name

`VaultHealthRepairModal.runRepair` hardcoded `'Notizen'` as the first argument to `fixMissingBacklinks` and `cleanupInvalidBacklinks`. User vaults that organize their backlinks under a different property (`Notes`, `Linked`, etc.) saw:

1. SQL flagged the user's `Notes`-edge as one-sided because the reverse predicate looked for ANY `link_type='frontmatter'` reverse, including foreign properties.
2. Repair writes the reverse-edge under `'Notizen'`, NOT under the user's `'Notes'` property. The target note now has a redundant `Notizen: [[A]]` next to the original `Notes:`.
3. The original A→B `Notes`-edge stays without a `Notes`-side reverse; the next `runChecks()` re-detects the same one-sided edge.

### Defect B: metadataCache race between repair and re-extract

The repair calls `app.fileManager.processFrontMatter()`, which resolves after the disk write but BEFORE Obsidian's `metadataCache.on('changed')` event fires. The synchronous `graphExtractor.extractAll(vault)` immediately after the await reads the STALE `metadataCache.getFileCache(file)` for every touched file, finds the old frontmatter (still missing the just-inserted reverse-link), writes the OLD edge-set back into the DB. The subsequent `runChecks()` re-queries the now-overwritten edges table and the reverse-edge predicate fires again on the same finding.

### Defect C (secondary): brittle alias dedup

`fixMissingBacklinks` deduped existing entries by stripping `[[` and `]]` only. An entry like `[[Source|Alias]]` was kept as the string `Source|Alias`, which never matched the new source path. Result: duplicate `[[Source]]` got pushed alongside the existing `[[Source|Alias]]`. Doesn't fully explain re-detection but contributes to noise.

## Fix

### Settings

- New `settings.backlinksProperty` (default `'Notizen'`) so the user can match the property name already used in their existing notes. Wired into `EmbeddingsTab` as a textbox next to `categoryProperty`.

### SQL

`VaultHealthService.checkMissingBacklinks` accepts an optional `backlinksProperty` and pins BOTH the outer edge AND the searched-for reverse edge to that property:

```sql
SELECT e1.source_path, e1.target_path
FROM edges e1
WHERE e1.link_type = 'frontmatter'
  AND e1.property_name = ?
  AND NOT EXISTS (
      SELECT 1 FROM edges e2
      WHERE e2.source_path = e1.target_path
        AND e2.target_path = e1.source_path
        AND e2.link_type = 'frontmatter'
        AND e2.property_name = ?
  )
LIMIT 200
```

The option is plumbed into `runChecks()` and propagated from every caller (main.ts onLayoutReady, AgentSidebarView health-check command, VaultHealthCheckTool, VaultHealthRepairModal.runRepair).

### MetadataCache race

`VaultHealthRepairModal.runRepair` calls a new `waitForMetadataCacheSettle(affectedPaths)` between the repair and the re-extract step. The helper listens to `app.metadataCache.on('changed', ...)` per affected path with a 3-second hard timeout. After the wait, the modal calls `graphExtractor.extractFile(file)` PER touched path instead of `extractAll(vault)`; this is O(touched) instead of O(vault) and means we never overwrite fresh edges with stale ones from untouched files. `extractAll()` remains as a fallback when per-file extraction produces zero successes (defensive).

### Alias dedup

`fixMissingBacklinks` now splits on `|` and on path-segment before comparing. The dedup set carries both the bare wikilink target and the last-segment to catch `[[Notes/A]]` vs `[[A]]` vs `[[A|Alias]]`.

## Acceptance criteria

| AC | Description |
|---|---|
| AC-01 | `settings.backlinksProperty` exists, defaults to `'Notizen'`, is reachable from `EmbeddingsTab` Settings UI. |
| AC-02 | `runChecks(undefined, { backlinksProperty: 'Notes' })` pins the missing-backlink predicate to `property_name = 'Notes'` only. |
| AC-03 | After a successful repair, the same finding does NOT come back on the next `runChecks()` call within the same modal session. |
| AC-04 | After a plugin reload + re-running the health check, the same finding does NOT come back (re-extract reads fresh frontmatter). |
| AC-05 | When the user has `[[Source|Alias]]` already in the property, the repair does NOT add a duplicate `[[Source]]`. |
| AC-06 | The metadataCache settle helper times out after 3 seconds so a stuck cache does not freeze the modal. |
| AC-07 | All existing callers of `runChecks()` (main.ts, AgentSidebarView, VaultHealthCheckTool, VaultHealthRepairModal) pass the configured property. |

## Out of scope

- `cleanupInvalidBacklinks` uses the same property argument; full audit of its mutation path is deferred unless a follow-up bug surfaces.
- The base-file branch (`<Name>-Backlinks.base`) uses `processFrontMatter` to CLEAR the property; same race could theoretically apply but is benign because clearing is not undone by a stale re-read.
- `onunload` knowledge-DB save-debounce race (2 seconds): user can quit Obsidian within the debounce and lose edges. Tracked separately under the same Vault-Health context; out of scope for this fix.

## References

- `src/core/knowledge/VaultHealthService.ts:69-147` (`runChecks` signature + dispatch)
- `src/core/knowledge/VaultHealthService.ts:390+` (`checkMissingBacklinks` predicate)
- `src/core/knowledge/VaultHealthService.ts:680-820` (`fixMissingBacklinks` repair logic)
- `src/ui/modals/VaultHealthRepairModal.ts:998-1100` (`runRepair` orchestration + `waitForMetadataCacheSettle`)
- `src/core/knowledge/__tests__/VaultHealthService.test.ts` (+4 regression tests)
