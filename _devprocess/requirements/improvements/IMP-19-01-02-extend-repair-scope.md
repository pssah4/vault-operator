---
id: IMP-19-01-02
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FEAT-19-01, IMP-19-01-01]
created: 2026-06-20
---

# IMP-19-01-02, Extend the Vault Health repair scope

## Context

After IMP-19-01-01 shipped, only three finding types were REPAIRABLE: `missing_backlinks`, `category_mismatch`, `inconsistent_tags`. The user wants checkbox-driven repairs across ALL finding types so they can mass-apply trivial fixes without per-row clicks, plus a Apply-button that is reachable without scrolling.

## User-chosen design (2026-06-20 AskUserQuestion)

| Finding type | Decision |
|---|---|
| `orphans` | Move to a configurable target folder (default `Inbox/Orphans`) |
| `broken_links` | NO auto-fix (case-by-case decision) |
| `weak_clusters` | Mutual frontmatter link (mirrors `fixMissingBacklinks` shape) |
| `god_nodes` | NO auto-fix (refactor decision) |
| `cluster_freshness` | Stays in Knowledge-review tab |
| `source_concentration` | Stays as hint |
| Apply-button position | Top sticky + bottom (no scrolling required) |

## Acceptance criteria

| AC | Description |
|---|---|
| AC-01 | `REPAIRABLE_CHECKS` includes `orphans` and `weak_clusters`. |
| AC-02 | `VaultHealthService.moveOrphansToFolder(paths, folder)` creates the folder if missing, renames each note to `folder/note.md` via `app.fileManager.renameFile`, skips notes already in the target folder, returns `{ notesMoved, notesSkipped }`. |
| AC-03 | `VaultHealthService.linkWeakClusters(pairs, backlinksProperty)` writes the wikilink of the other note into each pair-member's `backlinksProperty` frontmatter. Dedup matches the alias + last-segment logic from `fixMissingBacklinks`. Returns `{ pairsLinked, linksAdded }`. |
| AC-04 | `settings.vaultHealth.orphansTargetFolder` exists; default `'Inbox/Orphans'`. |
| AC-05 | The runRepair dispatch handles `orphans` and `weak_clusters` like the existing three rule types. The progress text reflects the running step. |
| AC-06 | The post-repair results screen lists `N orphan notes moved` and `N weak cluster pairs linked` when applicable. |
| AC-07 | A sticky Apply-button renders at the top of the Findings tab. It shares the selectedFindings counter with the bottom button; both texts live-update via `updateRepairButton()`. |
| AC-08 | The bottom "Repair selected (N)" button stays untouched. |
| AC-09 | Existing finding-types whose repair was deterministic before (missing_backlinks, category_mismatch, inconsistent_tags) still work identically; no regression in the existing repair paths. |

## Binding constraints

| C | Description |
|---|---|
| C-01 | NO new repair logic outside `VaultHealthService`. The modal dispatches to service methods. |
| C-02 | The user-chosen orphan target folder is created lazily; the repair must not crash if the folder already exists. |
| C-03 | `linkWeakClusters` operates only on pairs where both files exist; missing files are silently skipped. |
| C-04 | The sticky-top Apply-button reuses `.mod-cta` so the visual weight matches the bottom button. |
| C-05 | `broken_links` and `god_nodes` MUST NOT enter `REPAIRABLE_CHECKS`. |

## Out of scope

- Mark-as-reviewed action for non-repairable findings (separate UX consideration).
- An undo-per-row inside the post-repair screen; the existing checkpoint-undo covers everything atomically.
- Settings UI for the orphans target folder location (the setting exists in the data layer; the user can edit data.json directly until a Settings-tab toggle lands).
- Per-finding-type opt-out for the Auto-fix banner (already controllable via the row checkboxes).

## References

- `src/core/knowledge/VaultHealthService.ts` (+ `moveOrphansToFolder`, `linkWeakClusters` methods)
- `src/ui/modals/VaultHealthRepairModal.ts` (REPAIRABLE_CHECKS extension, dispatch, preview text, sticky top button, result row)
- `src/types/settings.ts` (`VaultHealthSettings.orphansTargetFolder`, default `'Inbox/Orphans'`)
- `styles.css` (`.vault-health-apply-sticky` rule with `position: sticky`)
