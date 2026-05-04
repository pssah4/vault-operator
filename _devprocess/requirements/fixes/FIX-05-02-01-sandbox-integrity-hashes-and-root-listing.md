# BUG-022: Sandbox esbuild integrity hashes stale + vaultList('/') throws

> **Priority:** P1
> **Epic:** EPIC-05 (Sandbox)
> **Date:** 2026-04-19
> **Reporter:** [@nicholas-leonard](https://github.com/nicholas-leonard) via [#31](https://github.com/pssah4/obsilo/issues/31) / commit [36bad1c](https://github.com/nicholas-leonard/obsilo/commit/36bad1c)

## Problem

Two independent symptoms, both in the sandbox subsystem:

**a) Integrity hashes for esbuild-wasm no longer match the CDN.** On the
first sandbox use after install, `EsbuildWasmManager` downloads
`browser.js` and `esbuild.wasm` from esm.sh / jsdelivr and verifies
SHA-256 against pinned constants. The CDN content changed (same version
tag, different minified bytes) so verification fails every time. The
sandbox never initialises; all `evaluate_expression` calls error out.

**b) `vaultList('/')` always throws "Not a folder".**
`SandboxBridge.vaultList(path)` passes `'/'` directly to
`vault.getAbstractFileByPath('/')`, which returns `null` (Obsidian
represents the vault root as an empty string internally). The
`instanceof TFolder` check fails and the method throws.

## Causal Chain -- (a) Hashes

1. esm.sh / jsdelivr rebuild the `esbuild-wasm@0.25.4` bundle (e.g.
   different source-map comment, different banner).
2. Obsilo ships with hashes computed against the previous build.
3. User opens a skill that calls `evaluate_expression`.
4. `EsbuildWasmManager.ensureDownloaded()` fetches the bundle.
5. Computed SHA-256 does not equal the pinned constant.
6. Download is rejected. Cache stays empty. Next call repeats.

## Causal Chain -- (b) vaultList

1. A sandbox script calls `vaultList('/')` to enumerate the vault root.
2. Bridge runs path validation, passes the literal `'/'` through.
3. `vault.getAbstractFileByPath('/')` returns `null` (root is not
   addressable by path in Obsidian's model).
4. The null fails `instanceof TFolder`; bridge throws
   `"Not a folder: /"`.
5. Sandbox script crashes.

## Root Cause

**(a)** Pinned SHA-256 integrity hashes are a security guard for
supply-chain attacks -- good idea in principle but brittle against
CDN-driven content change even at a fixed version tag. We have no
process that detects hash drift and refreshes them; the drift shows up
only as a runtime failure on a user machine.

**(b)** `SandboxBridge.vaultList` was written assuming every path
resolves through `getAbstractFileByPath`. Root is a special case in
Obsidian's abstract-file model that the bridge missed.

## Fix Direction (from upstream commit 36bad1c)

### (a) Refresh hashes

In [src/core/sandbox/EsbuildWasmManager.ts](../../../src/core/sandbox/EsbuildWasmManager.ts)
update `INTEGRITY_HASHES`:

- `esbuild-0.25.4.js`: recompute SHA-256 from the current CDN bundle
- `esbuild-0.25.4.wasm`: same

Upstream commit already supplies the numbers. We must verify them
locally before merging; do not trust blindly.

### (b) Normalise root path

In [src/core/sandbox/SandboxBridge.ts](../../../src/core/sandbox/SandboxBridge.ts)
`vaultList(path)`:

- If `path === '/'` set `path = ''`.
- Run path validation.
- If `path === ''` use `vault.getRoot()` (which returns the root TFolder).
- Otherwise use `getAbstractFileByPath(path)` as before.

## Adaptations for Our Codebase

- Add a CI-guard / build-time check for hash drift:
  - Dev-time `npm run check:esbuild-hash` that fetches the CDN URL and
    compares against `INTEGRITY_HASHES`. Used before every release, not
    on CI (would burn network on every PR).
  - Document the refresh procedure in the sandbox ADR.
- For the root-listing fix, add a unit test that `vaultList('/')`,
  `vaultList('')`, and `vaultList('some/folder')` all behave correctly.

## Risk

- (a) Low. Updating hashes is a build-time constant change. If we pin to
  wrong bytes (e.g. we fetched tampered content), the sandbox still
  fails the same way it does today -- no new risk class.
- (b) Low. Path normalisation stays inside the bridge; validation still
  runs against the normalised path so sandbox scripts cannot bypass
  anything.

## Test Plan

- **Hashes**: add a vitest-level check that reads the bundled cached
  binaries (if present in the test fixtures) and asserts their SHA-256
  matches the constants. Skip when fixtures are missing so the test
  doesn't gate CI without them.
- **Root listing**: unit tests for `'/'`, `''`, a real folder, a
  non-folder (should still throw), and `..` (should be rejected by
  validation before reaching the lookup).

## Out of Scope

- Switching away from CDN to a vendored bundle (larger decision, belongs
  in a sandbox-hardening FEATURE).
- Removing the integrity check entirely (would lose the supply-chain
  guard).

## References

- Upstream commit: [36bad1c](https://github.com/nicholas-leonard/obsilo/commit/36bad1c)
- Touches: `src/core/sandbox/EsbuildWasmManager.ts`,
  `src/core/sandbox/SandboxBridge.ts`, plus a hash-drift check and
  unit tests.
