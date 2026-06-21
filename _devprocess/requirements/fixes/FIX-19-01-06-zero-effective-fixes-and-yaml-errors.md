---
id: FIX-19-01-06
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FEAT-19-01, FIX-19-01-05]
created: 2026-06-20
---

# FIX-19-01-06, Repair reports success but writes zero links

## Symptom

User-reported 2026-06-20 after FIX-19-01-05 shipped to dev: "es funktioniert immer noch nicht, die fixes werden entweder nicht korrekt umgesetzt oder nicht korrekt zurückgemeldet". Provided live console log.

## Log analysis (smoking gun)

```
[VaultHealth] 33 findings (8 high, 11 medium, 14 low)
[Checkpoints] snapshot() called: taskId=health-repair-1781959617287 ...
[VaultHealth] cleanupOrphanedEdges: 372 edges from 108 orphaned paths
[VaultHealth] Failed to fix backlinks for Notes/AI Agents.md: YAMLParseError
[VaultHealth] Failed to fix backlinks for Notes/Business Operating Graph.md: YAMLParseError
... (8 YAML errors total)
[VaultHealth] fixMissingBacklinks: 130 entities, 0 frontmatter links, 0 bases created
[VaultHealth] cleanupInvalidBacklinks: 0 notes, 0 links removed
[VaultHealth] moveOrphansToFolder: 8 moved, 0 skipped, 0 skipped (has context)
[VaultHealth] linkWeakClusters: 0 pairs linked, 0 links added
...
[VaultHealth] 33 findings (8 high, 11 medium, 14 low)  ← identical post-repair
```

The repair iterated 130 entities but wrote zero links and created zero new Bases. Vault inspection found 140 existing `*-Backlinks.base` sibling files — every Thema/Konzept hub already has its Base. The `useBase` branch in `fixMissingBacklinks` is a no-op when the Base already exists: `ensureBacklinksBase` returns false, `basesCreated` stays at 0, the frontmatter property gets set to null, and no edge is written.

Eight notes have malformed YAML (e.g. `- "[[OODA Loop]]"  - "[[AI Agents]]"` on one line). `processFrontMatter` throws YAMLParseError on these, the try/catch swallows it, and these 8 notes can never be fixed by the repair — they reappear as missing_backlinks findings on every run, the user clicks Auto-fix, nothing changes, frustration.

Modal-internal `this.findings` is set once in the constructor and never refreshed. If the user keeps the modal open after Done and re-renders inside the same lifecycle, the state is stale (Scout-2 finding).

Defensive: the service-wide `cancelled` flag is reset only inside `runChecks` at the top, and only then if the running-guard does not short-circuit. A stuck-true flag would silently short-circuit every fix loop on iteration 0 — has not been observed but is a plausible failure mode (Scout-1 finding).

## Fix

### A. Transparency in the result screen

`fixMissingBacklinks` now returns two additional fields:

- `entitiesWithExistingBase: number` — count of entities that hit the `useBase` branch where the Base already existed (so `basesCreated` would not have been incremented anyway).
- `yamlErrorPaths: string[]` — paths whose `processFrontMatter` threw a YAMLParseError-like exception.

The result screen surfaces both:

- "X entities already had a Base (no frontmatter change needed)" — answers the "why did 130 entities produce 0 links" question.
- A clickable list of YAML-broken notes with a clear instruction "These notes are auto-dismissed for missing_backlinks until you fix the YAML."

### B. Auto-dismiss YAML-broken paths

After the iteration, every `yamlErrorPaths` entry is written into `dismissed_health_findings` with `check_type='missing_backlinks'`. Subsequent `runChecks` filters them out via the existing dismissal logic. The user must repair the YAML manually; until they do, the repair stops looping on the same impossible target.

### C. Refresh modal's `this.findings` after repair

`this.findings = newFindings` at the end of `doRepair`. Any subsequent render inside the same modal lifecycle now sees the post-repair set.

### D. Defensive `cancelled` flag reset

`vaultHealthService.cancelled = false` at the top of `doRepair`. The flag was made public (`cancelled` instead of `private cancelled`) so the modal can drive the reset; the modal owns the repair lifecycle and is the correct place to guarantee a clean state.

## Acceptance criteria

| AC | Description |
|---|---|
| AC-01 | `fixMissingBacklinks` returns `entitiesWithExistingBase` and `yamlErrorPaths` in addition to existing fields. |
| AC-02 | The result screen lists YAML-broken paths as clickable links when at least one is present. |
| AC-03 | YAML-broken paths get inserted into `dismissed_health_findings` with `check_type='missing_backlinks'` after the iteration. |
| AC-04 | The next `runChecks()` does not report a missing_backlinks finding for an auto-dismissed YAML-broken note (until the user un-dismisses it). |
| AC-05 | `this.findings` in the modal equals `newFindings` after `doRepair` resolves. |
| AC-06 | `vaultHealthService.cancelled` is `false` at the start of `doRepair` regardless of prior service state. |
| AC-07 | "X entities already had a Base" line appears on the result screen when `entitiesWithExistingBase > 0`, even if `linksAdded == 0`. |

## Out of scope

- Surfacing YAML errors as their own check-type (would be a UX improvement, but the auto-dismiss approach already prevents the loop).
- A repair action that auto-fixes broken YAML (genuinely user-decision territory — the auto-fix could destroy intended structure).
- Refactoring the `useBase` branch to actually write reverse-edges into the graph (the Base mechanism is by design dynamic — wikilink reciprocity is not the right model here; the existing base-filter in `checkMissingBacklinks` handles future detection correctly).

## References

- Live console log anchor: 2026-06-20 user log in chat history
- `src/core/knowledge/VaultHealthService.ts:803-955` (fixMissingBacklinks signature + return shape + auto-dismiss)
- `src/core/knowledge/VaultHealthService.ts:53` (`cancelled` made public)
- `src/ui/modals/VaultHealthRepairModal.ts:1090+` (doRepair: cancelled reset + this.findings refresh)
- `src/ui/modals/VaultHealthRepairModal.ts:1216+` (showResult: result-screen transparency for entitiesWithExistingBase + yamlErrorPaths)
- Diagnose anchor: `/private/tmp/.../w5kz5cgwf.output` (four converging scouts)
