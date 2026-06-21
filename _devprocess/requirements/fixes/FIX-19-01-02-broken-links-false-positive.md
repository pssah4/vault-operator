---
id: FIX-19-01-02
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FEAT-19-01]
created: 2026-06-20
---

# FIX-19-01-02, broken_links false-positive for existing notes

## Symptom

User report 2026-06-20: the Vault Health modal claims `[[X]]` is referenced from N notes but does not exist in the vault. Same description renders `[[X]]` as a clickable wikilink that Obsidian resolves and opens. The note clearly exists.

## Root cause

`VaultHealthService.checkBrokenLinks` used the `vectors` table as the "exists" predicate:

```sql
WHERE target_path LIKE '%.md'
  AND target_path NOT IN (
      SELECT DISTINCT path FROM vectors WHERE chunk_index = 0
  )
```

The `vectors` table is the embedding index, NOT the vault filesystem. A note can legitimately exist on disk without ever being embedded:

- Embeddings have been disabled by the user.
- The path is in `embeddings.excludePaths` (folder-level exclusion).
- The note is new and the embedding job has not run yet.
- The note is empty so no chunks were emitted.
- The embedding service is unreachable / failed.

Whenever any of these conditions hold for a target note, the SQL flags every edge into that note as broken, and the modal renders the description with `[[target]]` as a wikilink. Obsidian's renderer resolves the wikilink against the filesystem (where the note exists) and shows it as a normal blue link, producing the contradiction the user reported.

## Fix

The SQL stays as a cheap candidate-pre-filter (we still don't want to JS-iterate every frontmatter edge in the vault). But every candidate is verified against the vault filesystem before becoming a finding:

```ts
private existsInVault(targetPath: string, sourcePath: string): boolean {
    // Direct path lookup (most common case)
    const direct = this.app.vault.getAbstractFileByPath(targetPath);
    if (direct instanceof TFile) return true;

    // Path-with-ext normalization (in case the edge stored a bare name)
    const withoutExt = targetPath.replace(/\.md$/, '');
    const direct2 = this.app.vault.getAbstractFileByPath(withoutExt + '.md');
    if (direct2 instanceof TFile) return true;

    // Obsidian linkpath resolver: respects "shortest path when
    // unambiguous", same rule the wikilink renderer uses.
    const resolved = this.app.metadataCache.getFirstLinkpathDest(withoutExt, sourcePath);
    return resolved instanceof TFile;
}
```

Bonus side-effects:

- The SQL LIMIT goes from 50 to 200 so we have more candidates to filter; the modal surfaces at most 50 real findings (cap moved to the JS side).
- The third lookup (`getFirstLinkpathDest`) means edges that stored only the wikilink basename (e.g. `[[Note]]` → edge with `target='Note.md'` or `target='Note'`) are correctly resolved from the source-note's directory.

## Acceptance criteria

| AC | Description |
|---|---|
| AC-01 | When a target exists at the exact path stored in the edge, no `broken_links` finding fires for that target. |
| AC-02 | When a target exists at a path that differs in folder but Obsidian's linkpath resolver finds it via the source note, no `broken_links` finding fires. |
| AC-03 | When a target truly does not resolve anywhere in the vault, a `broken_links` finding still fires. |
| AC-04 | Embedding-state is not consulted at all by the check. Embedding-disabled vaults produce zero false positives. |
| AC-05 | The modal surface cap stays at 50 entries; the SQL cap moves to 200 candidates so the JS filter has headroom. |

## Out of scope

- Hardening of `checkOrphans` against the same false-positive class. The orphans check uses `edges` (no edges in OR out) which is filesystem-independent, so it does not suffer from the same defect; deferred unless a follow-up bug surfaces.
- Re-running the embedding job from the modal: that is `vault_health_check` tool's responsibility, not the modal's.

## References

- `src/core/knowledge/VaultHealthService.ts:487-560` (post-fix shape)
- `src/core/knowledge/__tests__/VaultHealthService.test.ts` (+2 regression tests under `describe('checkMissingBacklinks (FIX-19-01-01 property scoping)')` — placed there for proximity to the related FIX, not their own describe block)
