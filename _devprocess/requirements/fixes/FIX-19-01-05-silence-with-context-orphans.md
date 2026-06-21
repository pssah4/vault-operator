---
id: FIX-19-01-05
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FEAT-19-01, FIX-19-01-04]
created: 2026-06-20
---

# FIX-19-01-05, silence with-context orphans + add user-defined exclude prefixes

## Symptom

User feedback after the first live Auto-fix run (2026-06-20): 172 notes were moved to `Inbox/Orphans/`. Direct vault-inspection found:

- 132 / 172 (77 %) had MOC-properties (`Themen:`, `Konzepte:`, `Personen:`, ...) in their frontmatter — i.e. they had outgoing edges into the cluster hubs. The previous `with_context` finding emitted them anyway, the modal pre-checked them, the repair moved them.
- 26 of the remaining 40 were TaskNote plugin tasks (`TaskNotes/Tasks/*`), 1 was a Marp presentation, 2 were LinkedIn-inbox drops. None of these belong in the knowledge-graph orphan bucket.

User said: *"in den hub-notes habe ich jeweils eine Base eingefügt, die alle notes mit dem Filter auf die Hub note anzeigt. das ist ausreichend."*

The embedded Base in each hub note acts as the reciprocity guarantee. The reciprocal-wikilink-from-the-hub is not a requirement of this user's workflow.

## Fix

Two new settings on `VaultHealthSettings`, plus plumbing:

### A. `silenceWithContextOrphans: boolean` (default `true`)

When `true` (default), `checkOrphans` does NOT emit a finding for the `with_context` branch. The detection split (`isolated` vs `with_context`) remains in place internally; only the push to `this.findings` is gated.

Users who rely on property-reciprocity (every hub note has explicit reverse wikilinks in frontmatter rather than a Base) can flip this OFF in settings; they then get a Findings entry suggesting to add the missing reciprocal wikilink.

### B. `orphanExcludePathPrefixes: string[]` (default `['TaskNotes/', 'Inbox/Orphans/']`)

User-configurable path-prefix filter. Layered on top of the hardcoded excludes (`Templates`, `Daily Notes`, `Attachements`). Added directly to the SQL pre-filter via `AND v.path NOT LIKE ? || '%'`. `Inbox/Orphans/` is in the default list to keep moved-to-orphans notes from immediately being re-flagged on the next run.

### C. Plumbing

`runChecks()` signature gains `silenceWithContextOrphans?: boolean` and `orphanExcludePathPrefixes?: string[]` in the `options` arg. All four call sites read from `settings.vaultHealth.*` and thread through:

- `src/main.ts` (`onLayoutReady`)
- `src/ui/AgentSidebarView.ts` (sidebar badge command)
- `src/core/tools/vault/VaultHealthCheckTool.ts` (agent tool)
- `src/ui/modals/VaultHealthRepairModal.ts` (post-repair verification)

## Acceptance criteria

| AC | Description |
|---|---|
| AC-01 | `DEFAULT_VAULT_HEALTH_SETTINGS.silenceWithContextOrphans` is `true`. |
| AC-02 | `DEFAULT_VAULT_HEALTH_SETTINGS.orphanExcludePathPrefixes` defaults to `['TaskNotes/', 'Inbox/Orphans/']`. |
| AC-03 | With `silenceWithContextOrphans = true`, a note that has outgoing frontmatter edges and no incoming wikilinks does NOT produce an `orphans` finding. |
| AC-04 | With an entry like `'TaskNotes/'` in `orphanExcludePathPrefixes`, any vault path that starts with `TaskNotes/` is dropped from the orphan candidate set before classification. |
| AC-05 | All four `runChecks()` call sites pass both settings; no call site falls back to the hardcoded defaults silently. |

## Out of scope

- Settings-UI toggle for the two new flags (the values are reachable via `data.json` until a Vault Health settings tab lands).
- A repair action for `with_context` orphans (add the reciprocal wikilink). This would touch the user's hub notes; deferred until a user explicitly asks.
- Detection of embedded Bases inside hub notes (treat-Base-as-backlink would be a more precise fix than the boolean toggle, but requires parsing Base syntax which Obsidian's API does not expose stably).

## Restore record

Before the fix shipped, a one-shot bash script restored the live-run damage:

- 121 notes with MOC-properties were moved back from `Inbox/Orphans/` to `Notes/`.
- 10 conflict cases (note present in BOTH `Notes/` and `Inbox/Orphans/`) were identical duplicates; the `Inbox/Orphans/` copy was deleted.
- 41 notes (true isolates + TaskNote duplicates + Marp + LinkedIn) stayed in `Inbox/Orphans/`.

## References

- `src/types/settings.ts` (VaultHealthSettings shape, defaults)
- `src/core/knowledge/VaultHealthService.ts:69-148` (runChecks signature)
- `src/core/knowledge/VaultHealthService.ts:313-360` (checkOrphans SQL pre-filter)
- `src/core/knowledge/VaultHealthService.ts:395-410` (with_context emission gate)
- `src/core/knowledge/__tests__/VaultHealthService.test.ts` (+2 regression tests)
- `src/types/__tests__/vaultHealthSettings.test.ts` (default-shape pin)
