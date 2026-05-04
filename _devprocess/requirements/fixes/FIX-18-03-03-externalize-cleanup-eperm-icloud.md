# BUG-023: Externalise cleanup fails with EPERM on iCloud-synced vaults

> **Priority:** P2
> **Epic:** EPIC-18 (Token-Kostenreduktion / ADR-63 Context Externalization)
> **Date:** 2026-04-19
> **Discovered:** Wave-4 BRAT test for BUG-020 against an iCloud-backed vault

## Problem

At the end of a task, `ResultExternalizer.cleanup()` removes the per-task
directory under `<agent-folder>/tmp/task-<id>/`. On macOS iCloud vaults
the unlink fails:

```
[Externalize] Cleanup failed (non-fatal): Error: EPERM: operation not
permitted, unlink '.../Documents/NexusOS/.obsidian-agent/tmp/task-<id>'
```

The error is caught and logged as non-fatal, so no functional loss --
but the tmp directory accumulates stale task folders over time.

## Causal Chain

1. Task completes, `cleanupExternalized()` calls `fs.unlink(taskDir)`.
2. macOS iCloud file provider holds a transient lock on the directory
   (uploading / materialising the file metadata to CloudKit).
3. `unlink` returns `EPERM` because the file provider refuses the
   operation while it owns the fd.
4. Catch block logs a warning; the directory stays.

Reproducible only when the vault lives under `Library/Mobile
Documents/iCloud~md~obsidian/...` (or any file-provider-backed path).
Local-only vaults clean up correctly.

## Root Cause

`fs.promises.unlink` doesn't cooperate with macOS file providers.
Obsidian's own `FileManager.trashFile()` goes through the app layer and
knows about the provider; direct Node `fs` does not.

## Fix Direction (for a future wave)

Three options, in order of safety:

1. **Retry with backoff**: catch `EPERM`, wait 500ms, retry up to 3x.
   Handles transient iCloud locks in practice.
2. **Defer cleanup to next plugin start**: record tmp dirs that failed
   to clean, purge them on next `onload()` when the file provider has
   released the lock.
3. **Skip cleanup on file-provider paths**: keep the tmp dirs but rotate
   them with TTL (e.g. older than 7 days). Accept the disk cost.

Option 2 is the cleanest -- one extra bookkeeping step, no retry loops,
no disk growth.

## Risk

- Current behaviour is non-fatal; the fix has no security implication.
- Option 1's retry could race against a new task that reuses the same
  tmp dir; make the retry idempotent.

## References

- Console trace from Wave-4 BRAT test (2026-04-19).
- Related: ADR-63 Context Externalization.
- Related: BUG-014 (tmp-path Windows) -- same subsystem, different OS.
