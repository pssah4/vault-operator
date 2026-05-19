---
id: FIX-28-00-03
feature:
epic: EPIC-28
adr-refs: []
plan-refs: []
audit-refs: []
depends-on: [FIX-28-00-02]
created: 2026-05-19
---

# FIX-28-00-03: iCloud-Sync stalls Obsidian Mobile when the vault contains the plugin

## Symptom

User mounted an iCloud-backed Obsidian vault (`NexusOS` under
`/Users/.../Library/Mobile Documents/iCloud~md~obsidian/Documents/`) on the
iPhone. Obsidian Mobile loaded for several minutes, then offered to "restart
in safe mode" or open a different vault. Vault never finished opening as long
as the Vault Operator plugin was present in `.obsidian/plugins/` of the synced
vault.

Reproduction: any iCloud-backed vault whose Desktop-side Vault Operator has
seen production use (checkpoints accumulated, esbuild-wasm cache populated).

## Root cause

Two plugin-internal caches lived inside the vault, at paths iCloud and
Obsidian Sync treat as user content and replicate to every mounted device:

| Path | Owner | Typical size |
|------|-------|--------------|
| `{vault}/.obsidian/plugins/<id>/checkpoints/` | GitCheckpointService | 100+ MB across thousands of git-object files |
| `{vault}/.obsidian/plugins/<id>/dev-env/` | EsbuildWasmManager | 11 MB esbuild WASM + browser.js + hash manifest |

On the affected device (`NexusOS`) the checkpoints folder held 196 MB across
3 632 files. iCloud's per-file indexing dominated the Vault-open latency; the
plugin itself was actually skipped on Mobile (manifest `isDesktopOnly: true`),
but the surrounding sync of its data directory blocked everything.

The checkpoint location dates back to Sprint 1.4 (ADR-003): the shadow git
repo was placed inside `pluginDir` because rawFs + isomorphic-git needed an
absolute path on disk and that was the simplest derivation from
`vault.adapter.basePath + configDir + plugins + id`. The esbuild cache
followed the same convention. At the time, vault-content-vs-plugin-internals
was not a distinction the architecture made, because cross-device sync of the
plugin folder had not been an issue yet.

## Fix

Both caches moved to absolute paths under `GlobalFileService.getRoot()`, which
resolves to `{vault-parent}/obsilo-shared/` (with legacy alias detection for
`.obsidian-agent/`). That root sits next to the vault rather than inside it,
so iCloud and Obsidian Sync no longer touch it.

Concrete changes:

- [GitCheckpointService.ts](../../../src/core/checkpoints/GitCheckpointService.ts):
  constructor now takes `repoAbsPath: string`; `initialize()` uses
  `rawFs.promises.mkdir` instead of `vault.adapter.mkdir`. Repo-internal I/O
  was already on `rawFs` for the FIX-28-00-02 reason, so the rest of the
  service is unchanged.
- [EsbuildWasmManager.ts](../../../src/core/sandbox/EsbuildWasmManager.ts):
  constructor takes `cacheAbsDir: string`; the five `vault.adapter` I/O sites
  (`ensureCacheDir`, `getCachedOrDownloadText`, `getCachedOrDownloadBinary`,
  `loadHashManifest`, `saveHashManifest`) moved to `rawFs.promises`.
- [migratePluginDataDirs.ts](../../../src/core/utils/migratePluginDataDirs.ts):
  new helper that handles the one-shot move. Tries atomic `fs.rename` first,
  falls back to recursive copy + delete on EXDEV / EPERM / EBUSY / ENOTEMPTY
  (cross-device mount, locked file, race condition with a prior partial run).
  Skips if the source is missing or the destination already has content.
- [main.ts](../../../src/main.ts): runs the migration once on plugin onload,
  before any of the affected services initialise. Gated by a new
  `_pluginDataDirsMigrated` settings flag. Existing checkpoints and the
  esbuild WASM cache are preserved at the new path.

## Verification

- Desktop: Obsidian reload moves both folders out of the vault and the plugin
  continues to function normally (checkpoints still snapshot and restore,
  sandbox still builds).
- Mobile: Once iCloud has propagated the deletion of the in-vault folders,
  Obsidian Mobile opens the vault without the safe-mode timeout. The plugin
  itself still shows "this device is not supported" because `isDesktopOnly`
  stays `true` for this release. That separation is intentional: removing the
  cross-device sync stall is independent of mobile plugin support (tracked in
  BA-23).
- Storage location: `{vault-parent}/obsilo-shared/checkpoints/` and
  `.../dev-env/` exist and are populated after first Desktop reload.

## Out of scope

- Mobile plugin loading itself. The plugin manifest stays `isDesktopOnly:
  true`. Enabling Mobile is the BA-23 / EPIC-23 initiative.
- Migration of `data.json`. Obsidian's plugin settings file lives in the
  vault by convention and is small enough that iCloud syncs it instantly.
- Migration of `dynamic-tools/`. The folder holds user-editable tool JSON
  (a few KB) and benefits from being visible in the vault file explorer.
