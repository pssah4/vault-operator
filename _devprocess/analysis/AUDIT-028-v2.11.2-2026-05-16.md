---
id: AUDIT-028
project: vault-operator
date: 2026-05-16
scope: v2.11.2 delta (EPIC-28 safeFs + spawnAllowlist + 12 call-site migrations, FIX-28-00-01 execSync hardening, FIX-28-00-02 GitCheckpointService raw-fs revert, EPIC-26 test coverage f15a169f)
overall-risk: Low
predecessor: AUDIT-027 (EPIC-26 Welle 1+2+3, 2026-05-16, Green)
release-recommendation: Green
fix-status: 0 Critical, 0 High, 0 Medium, 2 Low (deferred to backlog as defense-in-depth), 1 Info, 4 Positive
---

# AUDIT-028: v2.11.2 Delta -- EPIC-28 Security Hardening + FIX Loop

## Executive Summary

| Analysis Domain | Critical | High | Medium | Low | Info |
|-----------------|----------|------|--------|-----|------|
| SAST | 0 | 0 | 0 | 2 | 1 |
| OWASP Top 10 | 0 | 0 | 0 | 0 | 0 |
| OWASP LLM Top 10 | 0 | 0 | 0 | 0 | 0 |
| Zero Trust | 0 | 0 | 0 | 0 | 0 |
| Code Quality | 0 | 0 | 0 | 0 | 0 |
| SCA | 0 | 0 | 0 | 0 | 0 |
| **Total** | **0** | **0** | **0** | **2** | **1** |

EPIC-28 (safeFs path allowlist, spawn binary allowlist, pre-push gate, SECURITY.md threat model) raised the security floor of the plugin. The 12 call-site migrations behind the wrappers are syntactically equivalent to pre-EPIC-28 fs/cp calls but now route every operation through an explicit allowlist check. The one revert (FIX-28-00-02, GitCheckpointService back to raw fs for isomorphic-git compatibility) restores the exact pre-EPIC-28 behaviour at that single call site and is documented in the wrapper's exception list.

Two Low findings are defense-in-depth gaps that pre-date EPIC-28 and were not introduced by this delta. They remain after the wrapper migration because the wrapper allowlist alone does not enforce them.

Release-Empfehlung: **Green**. v2.11.2 ships cleanly. The Low findings move to BACKLOG as P3 follow-ups.

## Scope of the Delta since AUDIT-027

New files (EPIC-28-introduced):

- `src/core/security/safeFs.ts` (360 LOC) -- centralised fs wrapper with path allowlist.
- `src/core/security/spawnAllowlist.ts` (114 LOC) -- centralised child_process wrapper with binary allowlist.
- `src/core/security/__tests__/safeFs.test.ts` (175 LOC) -- 18 wrapper tests.
- `src/core/security/__tests__/spawnAllowlist.test.ts` (117 LOC) -- 15 wrapper tests.
- `src/__test-stubs__/safeFsSetup.ts` -- vitest bootstrap for the allowlist in tests.
- `SECURITY.md` (292 LOC) -- threat model + capability disclosure + reporting section.
- `scripts/check-safe-fs-imports.sh` (90 LOC) -- pre-push gate against direct fs/child_process imports.

Call-site migrations to `safeFs` (12 files):

- `src/core/knowledge/KnowledgeDB.ts`
- `src/core/persistence/MultiFileAtomicCommit.ts`
- `src/core/persistence/SnapshotJob.ts`
- `src/core/persistence/WriterLock.ts`
- `src/core/semantic/SemanticIndexService.ts`
- `src/core/storage/GlobalFileService.ts` (existsSync -> probePathExists, documented bypass)
- `src/core/office/libreOfficeDetector.ts`
- `src/core/office/pptxRenderer.ts`
- `src/core/sandbox/ProcessSandboxExecutor.ts`
- `src/core/tools/agent/ExecuteRecipeTool.ts`
- `src/core/utils/migrateFolderRename.ts`
- `src/core/utils/runtimeWorker.ts`
- `src/mcp/McpBridge.ts`
- `src/ui/settings/McpTab.ts`

Call-site migrations to `spawnAllowlist` (7 files): same surface; `cp.execSync` and `cp.exec` are no longer re-exported, every spawn site now passes `shell: false`.

Reverts in v2.11.2:

- `src/core/checkpoints/GitCheckpointService.ts` -- `getFs()` reverts to raw `require('fs')` after isomorphic-git was observed to hang indefinitely with the safeFs wrapper on iCloud-backed vaults (FIX-28-00-02). Repo scope is confined to `<vault>/.obsidian/plugins/<id>/checkpoints/` by the `dir` parameter of every `git.X()` call. Documented as the fifth exception in `scripts/check-safe-fs-imports.sh`.

Test coverage additions (f15a169f, EPIC-26 backfill):

- `src/core/routing/__tests__/ModelTierClassifier.coverage.test.ts` (212 LOC) -- fixture-driven coverage test for H-02.
- `src/core/settings/__tests__/activeModelsToProviders.test.ts` (+168 LOC) -- H-05 migration coverage.
- `src/core/routing/ModelTierClassifier.ts` (+3 LOC) -- two regex tweaks (`gemini-1.5-pro` to flagship, `gpt-5-mini`/`gpt-5-nano` to fast).

## Findings

### L-1: GitCheckpointService.snapshot has no upstream path traversal check on filepath

- **Status:** Confirmed, deferred to backlog as defense-in-depth follow-up
- **Severity:** Low
- **CWE:** CWE-22 (Path Traversal)
- **Location:**
  - `src/core/checkpoints/GitCheckpointService.ts:109` -- `const repoRelative = vaultRelPath;`
  - `src/core/checkpoints/GitCheckpointService.ts:127-130` -- `destPath = ${this.repoPath}/${repoRelative}; fs.promises.writeFile(destPath, content, 'utf8')` writes via raw fs after FIX-28-00-02.
- **Risk:** If `filePaths[]` passed to `snapshot()` contains entries with `..` segments, `path.resolve` of the concatenated destPath can escape `this.repoPath`. In the worst case the escape lands inside the vault root (the shadow repo lives 5 levels below vault root, so up to 5 `..` segments stay inside the vault). It cannot escape to system root because the vault tree is itself capped above by the user's directory hierarchy. Real exploitability is gated by upstream tool input validation: `write_file` / `edit_file` validate vault-relative paths before calling AgentTask, which then passes them to snapshot. No tool in the current codebase passes unsanitised paths to snapshot. The wrapper migration in EPIC-28 (if applied here) would have caught a traversal escape to system roots via the allowlist, but vault-internal traversal would still have been allowed because the vault root is itself an allowlist entry.
- **Pre-existence:** This pattern exists in `GitCheckpointService` since the initial implementation. EPIC-28 did not introduce it; FIX-28-00-02 maintains it. Pre-EPIC-28 used raw fs with the same gap.
- **Remediation:** Add a guard at the top of `snapshot()`:

  ```ts
  for (const vaultRelPath of filePaths) {
      if (vaultRelPath.includes('..') || path.isAbsolute(vaultRelPath)) {
          console.warn(`[Checkpoints] Rejected non-vault-relative path: ${vaultRelPath}`);
          continue;
      }
      // ... existing logic ...
  }
  ```

  Defense-in-depth check, kept simple because upstream tool validation is the primary boundary.

### L-2: safeFs.promises.symlink exposes unvalidated target

- **Status:** Confirmed, deferred to backlog as defensive cleanup
- **Severity:** Low
- **CWE:** CWE-59 (Improper Link Resolution Before File Access)
- **Location:**
  - `src/core/security/safeFs.ts:275-277` -- `async symlink(target: string, p: string, type?: ...) { await fs().promises.symlink(target, assertAllowed(p), type); }`
- **Risk:** The wrapper validates the symlink *location* `p` against the allowlist but does not validate the symlink *target*. A caller could create `<allowed-root>/link -> /etc/passwd`, and a subsequent `safeFs.readFileSync('<allowed-root>/link')` would pass the lexical allowlist check (`path.resolve` does not follow symlinks) and read the target via the underlying Node fs call which does follow symlinks. The wrapper documents this design choice ("Symlinks are not resolved -- that is deliberate, since resolving would extend the allowlist to whatever the real filesystem points at", lines 13-15), but `promises.symlink` punches a hole in that design because it allows creating the trapdoor symlink in the first place.
- **Exploitability:** Zero callers of `safeFs.promises.symlink` in `src/` other than the wrapper definition itself. The sandbox bridge (`src/core/sandbox/SandboxBridge.ts`) does not expose symlink creation. MCP and recipe tool parameter validators reject paths with shell metacharacters. The risk is purely theoretical until a future feature adds a caller.
- **Remediation:** Either remove `symlink` from the exported `promises` surface (no current caller breaks), or wrap it with a target validation: resolve `target` (relative to dirname of `p` if relative, otherwise absolute) and run `assertAllowed` on the result. The remove path is preferable because the API is unused and adding callers without target validation would silently undermine the wrapper.

### I-1: ALLOWED_BINARIES includes binaries with arbitrary-code-execution primitives

- **Status:** Confirmed, no action recommended (mitigated by caller-side input control)
- **Severity:** Info
- **CWE:** CWE-78 (Command Injection)
- **Location:**
  - `src/core/security/spawnAllowlist.ts:35-52` -- `node`, `node.exe`, `soffice`, `git`, `pandoc`, `cloudflared`, plus Windows variants.
- **Risk:** The allowlist permits binaries that can execute arbitrary code given the right arguments: `node -e '<JS>'`, `soffice --headless` with macro-enabled documents, `git -c core.sshCommand=<cmd>` (config injection running shell hooks), `pandoc --filter=<binary>` (executes filter binary), `cloudflared` (tunnel control). The wrapper validates only the *command*, not `args[]`. If a caller were to pass user-controlled data into `args`, an attacker could achieve code execution within the plugin's process privileges.
- **Verification:** All 7 caller sites enumerated and reviewed:

  - `ProcessSandboxExecutor` (sandbox worker): `args = ['--max-old-space-size=128', workerPath]` -- hardcoded.
  - `pptxRenderer` (soffice): args hardcoded template `['--headless', '--convert-to', 'pdf', '--outdir', outDir, pptxPath]`. `outDir` from `safeFs.mkdtempSync` (allowlist-checked). `pptxPath` copied via `safeFs.copyFileSync` (allowlist-checked).
  - `libreOfficeDetector`: args = `['--version']` -- hardcoded.
  - `McpBridge` (cloudflared): args = `['tunnel', '--url', 'http://127.0.0.1:${this.port}']` -- port is plugin-controlled.
  - `ExecuteRecipeTool` (pandoc + future binaries): args built from `recipeRegistry.ts` hardcoded templates with parameter substitution. `recipeValidator.ts:21` rejects shell metacharacters `[;&|`$(){}[\]<>\\!#~*?\n\r\0]` and enforces per-type validation (vault-file path traversal check, enum allowlist, safe-string pattern).
- **Recommendation:** Maintain the invariant. Any new spawn caller must pass `args[]` built from a hardcoded template with parameter substitution, where each parameter is validated against a typed schema. The pattern is already documented implicitly by all current call sites; no new code is required.

## Positive findings

### P-1: safeFs path allowlist with default-deny

- **Location:** `src/core/security/safeFs.ts`
- **What is well implemented:** Default-deny allowlist with five well-defined root categories (vault, plugin-data, agent-config, system-temp, desktop-config). Every fs operation that takes a path goes through `assertAllowed`. The allowlist is immutable after `initialize()`. Two narrowly scoped bypasses (`probePathExists`, `probeBinaryExists`) return only booleans, never contents, and are documented with their use cases.

### P-2: spawnAllowlist with shell:false enforcement and shell-metachar rejection

- **Location:** `src/core/security/spawnAllowlist.ts`
- **What is well implemented:** Hardcoded binary allowlist with reasons. `cp.exec` and `cp.execSync` are not re-exported -- shell strings cannot enter the spawn surface at all. `forceNoShell` rejects `shell: true` (the most common spawn bypass) and forces `shell: false` even if the option is omitted. Command-level shell metachar regex (`[;&|`$<>(){}\\\n\r]`) catches the obvious injection vectors at the command name.

### P-3: check-safe-fs-imports.sh pre-push gate

- **Location:** `scripts/check-safe-fs-imports.sh`
- **What is well implemented:** Static check that the only files allowed to import `fs` or `child_process` directly are the wrapper file itself, the spawn-allowlist file, the standalone MCP worker, the vitest test stub, and GitCheckpointService (documented exception, FIX-28-00-02). Any new file importing fs directly fails the gate. The list is short by design; growing it requires an explicit decision.

### P-4: SECURITY.md threat model in public repo

- **Location:** `SECURITY.md` (292 LOC at repo root, included in sync-public CI)
- **What is well implemented:** Capability disclosure (fs, child_process, vault enumeration, clipboard, dynamic code execution) addresses the five Obsidian community-store scanner findings in one document. Sandbox architecture ASCII diagram. Audit history summary. Vulnerability reporting section. Compliance mapping. Sets the Obsidian-reviewer audit angle from "hours of manual code review" to "minutes of document review".

## SCA (Software Composition Analysis)

```
npm audit --omit=dev
found 0 vulnerabilities
```

22 runtime dependencies, zero advisories. Unchanged from AUDIT-027.

## OWASP Top 10 Coverage (delta-only)

| Category | Delta status |
|----------|--------------|
| A01 Broken Access Control | safeFs raises this protection: file access is now default-deny |
| A02 Cryptographic Failures | No crypto changes in delta |
| A03 Injection | spawn args validation pattern enforced by existing callers (I-1) |
| A04 Insecure Design | SECURITY.md threat model published (positive, P-4) |
| A05 Security Misconfiguration | check-safe-fs-imports.sh pre-push gate prevents regression (P-3) |
| A06 Vulnerable Components | npm audit clean |
| A07 Auth Failures | No auth changes in delta |
| A08 Software/Data Integrity | Build provenance attestation in release workflow (pre-existing) |
| A09 Logging Failures | No logging changes in delta |
| A10 SSRF | No new HTTP surface in delta |

## OWASP LLM Top 10 Coverage (delta-only)

No changes to prompt construction, tool surface, or LLM-input handling in v2.11.2. AUDIT-027 coverage of LLM01-LLM10 remains current.

## Delta from Previous Audit

| Finding | AUDIT-027 | AUDIT-028 | Change |
|---------|-----------|-----------|--------|
| H-1 (providerConfigs plaintext credentials) | Resolved | Resolved | Unchanged |
| L-1 (multi-auth ID collision, cosmetic) | Deferred | Deferred | Unchanged |
| I-1 (provider-response trust boundary) | Info | Info | Unchanged |
| I-2 (ConsultFlagshipTool budget enforcement) | Info | Info | Unchanged |
| L-1 (GitCheckpointService snapshot traversal) | -- | **New** | New (defense-in-depth, pre-existing pattern) |
| L-2 (safeFs.promises.symlink unvalidated target) | -- | **New** | New (introduced by EPIC-28 wrapper, no callers) |
| I-1 (spawn ALLOWED_BINARIES architectural risk) | -- | **New** | New (mitigated by caller-side input control) |

## Release Recommendation

**Green.** v2.11.2 is shippable. The two Low findings are defense-in-depth follow-ups, not blockers:

- L-1 mitigated by upstream tool validation; defense-in-depth guard recommended.
- L-2 has zero callers; recommended action is removal of the unused export.

EPIC-28's positive contribution to the security posture (P-1 through P-4) substantially outweighs the two newly surfaced Low findings. AUDIT-028 closes the audit cycle for the v2.11.2 release.
