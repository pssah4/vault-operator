---
id: AUDIT-030
project: vault-operator
date: 2026-05-19
scope: v2.11.4 + v2.11.5 delta vs AUDIT-029 baseline (commit 058ca61f). 70 files, +2604 / -2157 LOC. Two stable releases promoted from the v2.11.5-beta.* series (humanizer pass, cross-surface clarity, onboarding gate, mode collapse ask -> agent, optional-asset release ordering fix, borderless toolbar)
overall-risk: Low (Green after fix-loop)
predecessor: AUDIT-029 (v2.11.3 delta, 2026-05-16, Green)
release-recommendation: Green. v2.11.5 shipped Yellow; v2.11.6 carries the fix-loop closure and ships Green.
fix-status: 0 Critical, 0 High, 4 Medium (all Resolved), 3 Low (all Resolved) + 1 Mitigated-Low (polish Resolved), 4 Info (1 Resolved via dependency removal, 1 Resolved via package upgrade, 2 carried forward), 12 Positive
---

# AUDIT-030: v2.11.4 + v2.11.5 Delta

## Executive Summary

| Analysis Domain | Critical | High | Medium | Low | Info |
|-----------------|----------|------|--------|-----|------|
| SAST            | 0        | 0    | 2      | 1   | 1    |
| OWASP Top 10    | 0        | 0    | 0      | 0   | 0    |
| OWASP LLM Top 10| 0        | 0    | 0      | 0   | 0    |
| Zero Trust      | 0        | 0    | 2      | 3   | 1    |
| Code Quality    | 0        | 0    | 0      | 0   | 0    |
| SCA             | 0        | 0    | 0      | 0   | 2    |
| **Total (deduped)** | **0** | **0** | **4** | **4** | **4** |

This delta covers two stable releases (2.11.4 and 2.11.5) and the long v2.11.5-beta.1..beta.34 series. The big-ticket changes: humanizer pass over every UI string and prompt section (em-dash to comma/period), `ask` mode removed and folded into `agent` with a migration in `main.ts:1999-2020`, onboarding gate widened in `onboarding-status.ts:33-40`, optional-asset release ordering fix in `.github/workflows/release.yml`, borderless toolbar in `styles.css`, settings UI refactor under `src/ui/settings/` (new helpers `addSectionHeading`, `openInfoPopover`, `addSliderInput`), and a JSON-shaped commit-message format for the `GitCheckpointService` shadow repo.

No Critical or High findings. Four Medium findings cluster in `src/core/checkpoints/GitCheckpointService.ts` (three) and `src/core/tools/agent/newTaskValidation.ts` (one). All four are defense-in-depth gaps, not actively exploitable from the LLM tool surface. The prior closures from AUDIT-028 (snapshot path-traversal guard) and AUDIT-029 (`safeFs.promises.symlink` removed) hold.

**Release recommendation: Yellow.** v2.11.5 is already public, so the practical follow-up is to queue M-1..M-4 for v2.11.6 (small file, single owner, no breaking changes).

## Scope

Baseline: commit `058ca61f` (v2.11.3 release, AUDIT-029 Green). HEAD: `feature/audit-2026-05-19` branched off `dev` post-2.11.5-release-merge.

Notable surface changes:

- **Checkpoint service rewrite (FEAT-24-05 follow-up):** `GitCheckpointService.ts` gained the JSON-shaped commit-message format, a `restoreLatestForTask` git-log fallback path, and a marker-file scheme keyed on `taskId`. The snapshot side keeps the AUDIT-028 path-traversal guard at line 117; the restore side does not yet mirror it.
- **Mode collapse:** `ask` removed from the mode set, `OLD_MODE_MAP` rewrites `ask -> agent` on settings load, `customModes`/`modeModelKeys`/`modeToolOverrides` get filtered to drop dangling `ask` entries (`main.ts:1999-2020`).
- **Humanizer pass:** ~30 prompt and i18n files touched, em-dashes replaced with commas/periods/parens. No instruction text reordered or removed; the guardrails (`VAULT IS SACRED`, `ERROR RECOVERY`, sandbox scope, etc.) read identically after the substitution.
- **Onboarding gate:** `isFirstRun()` widened to also return false when any `providerConfigs[]` entry exists, not just when `onboarding.completed = true`.
- **Optional-asset release order fix:** `.github/workflows/release.yml` now publishes `${version}-assets` BEFORE `${version}`, with `make_latest` pinned explicitly. Fixes the Obsidian community-plugin crawler matching against the wrong tag.
- **Borderless toolbar:** `styles.css` strips Obsidian's default `<button>` `box-shadow` from `.toolbar-button` and `.header-button` with `!important`. `.send-button` and `.stop-button` keep their border by design.
- **Settings UI refactor:** `src/ui/settings/utils.ts` grew three new helpers; none uses `innerHTML`. `McpServerPopover.ts` and `ToolPickerPopover.ts` were rewritten; the popover open path uses `createSpan({ cls, text })` and `setText()`.
- **ChatGPT-OAuth provider:** `extractServerDetail` parser added to surface stale-model errors from the Codex backend.
- **Semantic index:** `enrichmentLoop` now batches embed calls.

## Findings

### M-1: Restore path skips the traversal check that snapshot enforces

- **Status:** Confirmed
- **Severity:** Medium
- **CWE:** CWE-22 (Path Traversal)
- **Location:**
  - `src/core/checkpoints/GitCheckpointService.ts:258` (`restoreCheckpoint` loop)
  - `src/core/checkpoints/GitCheckpointService.ts:415` (`restoreLatestForTask` fallback loop)
- **Risk:** The snapshot path validates each vault-relative path against `..`, `path.isAbsolute()`, and `\0` at line 117, with an inline comment that references AUDIT-028 L-1. The restore paths do not re-validate. Today the trust chain holds because every path was clean when staged, but the JSON commit-message format adds a second source of paths (`JSON.parse(newFilesMatch[1])` at line 380). An attacker with local-disk access who can replace one commit object inside `<vault>/.obsidian/plugins/vault-operator-data/.../objects` can inject `["../../../etc/passwd"]`. `getAbstractFileByPath` stays vault-scoped, but `this.vault.adapter.write(vaultRelPath, content)` two methods away does not.
- **Remediation:** Mirror the snapshot guard at the top of both restore loops. Extract `isVaultRelative(p)` as a private helper next to the snapshot guard and call it before every `adapter.write` and every `restored.push`. Same guard for the `newFilesSet` loop because `restored.push(vaultRelPath)` echoes the value back into log lines.

### M-2: JSON.parse on git commit message body without size limit

- **Status:** Confirmed
- **Severity:** Medium
- **CWE:** CWE-1284 (Improper Validation of Specified Quantity in Input)
- **Location:** `src/core/checkpoints/GitCheckpointService.ts:380` (`newFilesMatch[1]` parse inside `restoreLatestForTask`)
- **Risk:** The regex `/\n\nNewFiles:\s*(\[.*\])/s` captures everything between `NewFiles: [` and the final `]` with the `s` flag (newlines match). The fallback iterates the full git log for the task and runs the parse once per commit. A repo with thousands of commits plus a few malformed or oversized entries becomes a CPU sink at restore time. The snapshot side does not currently produce such inputs, so the gap is defense-in-depth only.
- **Remediation:** Cap `newFilesMatch[1].length` at 64 KB before `JSON.parse`. After parse, bound `parsed.length` to 10000 entries. Both are cheap and defensive.

### M-3: Commit-message delimiter parsing is brittle on vault paths with commas

- **Status:** Confirmed
- **Severity:** Medium
- **CWE:** CWE-20 (Improper Input Validation)
- **Location:** `src/core/checkpoints/GitCheckpointService.ts:378` (parse), message format produced at `:217`
- **Risk:** The recovery loop reconstructs the modified-file list from the commit message by `msg.split('\n\nFiles: ')[1]?.split('\n\n')[0]` and then `filesPart.split(', ')`. The producer joins `staged.join(', ')` without escaping. A vault note named `Plan, Q3 2025.md` (legal in Obsidian) splits into `Plan` and `Q3 2025.md` on restore. Both fragments bypass the path-traversal check (no `..`), but the undo writes empty or wrong content into a sibling note instead of the real file. Likelihood on adversarial input: low (no escape, no execution). Likelihood on benign filenames containing `,`: moderate.
- **Remediation:** Encode the file list with `JSON.stringify(staged)` mirroring the `NewFiles` field at `:222`, then parse with `try { JSON.parse(...) }`. Keep a comma-split fallback for one release so old commit messages still restore.

### M-4: `ALLOWED_SUB_MODES` allowlist contradicts its own comment

- **Status:** Confirmed
- **Severity:** Medium (combined: SAST low + Zero-Trust medium)
- **CWE:** CWE-20 / CWE-697 (Incorrect Comparison)
- **Location:** `src/core/tools/agent/newTaskValidation.ts:13-16`, error message at `:67`
- **Risk:** The comment claims "the single built-in Agent ('agent') + any custom agent slug are valid sub-modes." The set literal only contains `'agent'`. Any custom-mode user trying to spawn a subtask with their own slug hits the validator and gets "Unknown sub-agent mode". Today this fails closed (safe), but the comment misleads future maintainers into removing the gate. Combined with `OLD_MODE_MAP` at `main.ts:1999`, which silently rewrites `ask -> agent` on settings load, a parent task that originally requested a read-only `ask` subtask now spawns a write-capable `agent` subtask after migration. The `customModes` scrub at `main.ts:2014-2020` limits blast radius, but the intent drift is invisible.
- **Remediation:** Resolve the contradiction. Either extend the check to `ALLOWED_SUB_MODES.has(mode) || modeService.isValidMode(mode)` and trust `ModeService`, or drop the misleading comment and document that only built-in `'agent'` is valid. Update the error message at `:67` to match whichever choice.

### L-1: Restore loop logs untrusted-shaped path verbatim

- **Status:** Confirmed
- **Severity:** Low
- **CWE:** CWE-117 (Improper Output Neutralization for Logs)
- **Location:** `src/core/checkpoints/GitCheckpointService.ts:419` (`errors.push(\`${vaultRelPath}: ${e instanceof Error ? e.message : String(e)}\`)`)
- **Risk:** `vaultRelPath` originates from the parsed JSON commit-message blob in the git-log fallback. If a malformed local repo contains a path with embedded `\n` or terminal escape sequences, those land in the user-visible error string in the checkpoint UI and in `console.debug` lines. No code execution; the log can be confusing.
- **Remediation:** Wrap in `JSON.stringify(vaultRelPath)` before pushing into `errors[]` or before `console.debug`. One-liner.

### L-2: Marker-file path uses raw `taskId` without sanitisation

- **Status:** Confirmed
- **Severity:** Low
- **CWE:** CWE-22 (Path Traversal)
- **Location:** `src/core/checkpoints/GitCheckpointService.ts:174-176`
- **Risk:** `const markerPath = \`.vault-operator-newfiles-${taskId}\`` then `fs.promises.writeFile(\`${this.repoPath}/${markerPath}\`, ...)`. Today's only callers (`AgentSidebarView.ts:1704` with `task-${Date.now()}`, `VaultHealthRepairModal.ts:523`) generate the id server-side. A future caller that passes an attacker-influenced `taskId` containing `../` escapes `repoPath`. Defense-in-depth absent.
- **Remediation:** Reject `taskId` values containing `/`, `\`, `..`, or null byte at the top of `snapshot()`. Mirrors the existing check on `filePaths` at `:117`.

### L-3: Snapshot loop swallows per-file errors silently in the UX layer

- **Status:** Confirmed
- **Severity:** Low
- **CWE:** CWE-755 (Improper Handling of Exceptional Conditions)
- **Location:** `src/core/checkpoints/GitCheckpointService.ts:148-150`
- **Risk:** A per-file `try/catch` in the snapshot loop logs the failure via `console.warn` and continues. The caller receives a `CheckpointInfo` that lists the file in neither `staged` nor `newFiles`. The user gets a successful "checkpoint saved" indicator while the file was skipped (transient `EACCES`, locked file, etc.). On undo the file is missed silently. False-positive success signal.
- **Remediation:** Add a `skipped: string[]` field to `CheckpointInfo`, surface the count in the UI's checkpoint footer ("3 saved, 1 skipped, click for detail").

### L-4 (Mitigated): Onboarding gate widens "no longer first-run" criterion

- **Status:** Mitigated (defaults are fail-closed)
- **Severity:** Low
- **CWE:** CWE-840 (Business Logic Errors)
- **Location:** `src/core/onboarding-status.ts:33-40`, consumer at `src/core/memory/OnboardingService.ts:289`
- **Risk:** Pre-change, the wizard was suppressed only when `onboarding.completed = true`. Post-change, it is also suppressed when any `providerConfigs[]` entry exists, even if the user never finished the wizard. A user who adds a provider in settings but skips the wizard never sees the "consent to permissive defaults" dialog that wraps `apply_preset`. `DEFAULT_SETTINGS.autoApproval.enabled = false` ships fail-closed, so the permission posture is safe by default. The user just may not realise the master toggle is off.
- **Remediation:** None required. Optional polish: add a one-line in-tab hint on the Permissions tab for users with `onboarding.completed === false`.

### I-1: Hardcoded git committer identity

- **Status:** Confirmed (informational only, by design)
- **Severity:** Info
- **CWE:** none directly; adjacent to CWE-798
- **Location:** `src/core/checkpoints/GitCheckpointService.ts:170` (`author: { name: 'obsidian-agent', email: 'agent@obsidian.local' }`)
- **Risk:** The shadow repo signs every checkpoint commit with a fixed identity. If the repo ever leaks (backups, sync conflicts) the identity is constant across users, which makes attribution harder during incident response. Not actionable.
- **Remediation:** None. Note in `REVIEWER_NOTES.md` so reviewers do not flag it again.

### I-2: Steering messages append directly into history

- **Status:** Confirmed (no action needed today)
- **Severity:** Info
- **CWE:** N/A (defense-in-depth observation)
- **Location:** `src/core/AgentTask.ts:866-876`, queue source at `src/ui/AgentSidebarView.ts:202-214`
- **Risk:** `consumeSteeringMessages` returns user-typed strings and pushes them straight onto `history` as `{ role: 'user', content: msg }`. The path skips `AttachmentHandler.truncateTextFileForContext` and the prompt-builder. The trust origin is the user, so no security boundary crosses. But the new attachment-truncation cap (80 KB) does not apply. A 200 KB paste mid-run inflates the next turn's input.
- **Remediation:** None required. If a non-user-facing caller is ever wired into `consumeSteeringMessages`, add a cap.

### I-3: `openai` v4 line is one major behind upstream

- **Status:** Confirmed (Info only)
- **Severity:** Info
- **CWE:** none
- **Package:** `openai@4.104.0` (declared `^4.0.0`)
- **Risk:** No active CVE on the v4 line. v5 is a breaking client rewrite. The plugin uses the v4 streaming and tool-call APIs in `src/api/providers/openai.ts`, `chatgpt-oauth.ts`, and `kilo-gateway.ts`. Upgrade is hygiene.
- **Remediation:** Track on backlog. Upgrade when feature work touches the OpenAI provider anyway.

### I-4: `uuid@9.0.1` two majors behind (v11 available)

- **Status:** Confirmed (Info only)
- **Severity:** Info
- **CWE:** none
- **Package:** `uuid@9.0.1`
- **Risk:** No CVE on the v9 line. The plugin imports `uuid/v4` for IDs only. v11 dropped CJS and changed ESM exports; nothing in `src/` requires v11.
- **Remediation:** Defer. Upgrade only when bundler or Node target shifts.

## Verification of prior closures

- **AUDIT-028 L-1 (path traversal in `GitCheckpointService.snapshot()`):** still in place at line 117 (`vaultRelPath.includes('..') || path.isAbsolute(vaultRelPath) || vaultRelPath.includes('\0')`). Inline comment references AUDIT-028. **Not regressed.**
- **AUDIT-028 L-2 / AUDIT-029 (symlink removal from safeFs):** still removed at `src/core/security/safeFs.ts:272` with the documented rationale "symlink and readlink intentionally not exported." **Not regressed.**
- **AUDIT-029 I-1 (`include: ['reasoning.encrypted_content']` request not consumed):** still present at `src/api/providers/chatgpt-oauth.ts:178`. The SSE parser still does not surface the encrypted content; bandwidth-overhead only. Status unchanged (Info, no action).

## Positive findings

1. **Snapshot-side path validation is intact and well-commented** (`GitCheckpointService.ts:110-120`), with the link back to AUDIT-028 L-1 and the rationale "LLM tool-call input is the only boundary."
2. **safeFs continues to refuse `symlink` and `readlink`** with an explanatory block at `src/core/security/safeFs.ts:272`. AUDIT-029 closure stands.
3. **Spawn allowlist refuses `shell: true` and does not re-export `cp.exec`/`cp.execSync`** (`src/core/security/spawnAllowlist.ts:12`). Only a doc-pointer renamed in the delta (`SECURITY.md` -> `REVIEWER_NOTES.md`).
4. **OAuth error parser is defensive.** `extractServerDetail` wraps `JSON.parse` in `try/catch`, handles three response shapes, falls back to `undefined` instead of throwing (`chatgpt-oauth.ts:454`). Trims server body to 400 chars before user-facing display, preventing trace-id leakage.
5. **Optional asset downloads carry SHA256 verification.** `OptionalAssetsTab.ts:52,69,86` references `OFFICE_BUNDLE_SHA256`, `PDFJS_BUNDLE_SHA256`, `SELF_DEV_SOURCE_SHA256`, all generated and pinned.
6. **`ResultExternalizer` sanitises tool names before path construction** (`ResultExternalizer.ts:209`: `toolName.replace(/[^a-zA-Z0-9_-]/g, '_')`). MCP tools with arbitrary names cannot inject path traversal.
7. **Externalised tmp re-read is capped** (`ResultExternalizer.ts:187-194`). The model cannot loop a re-read to drain the same payload back into history.
8. **Approval gating for sandbox tools fails closed** (`ToolExecutionPipeline.ts:550-554`). The new diagnostic log at `:551-557` plus the UI hard-disable at `PermissionsTab.ts:34-44` close the prior gap where opacity-only styling let users click a toggle the pipeline ignored.
9. **`NewTaskTool` validator rejects unknown sub-modes with an actionable error** (`newTaskValidation.ts:64`) and rejects generic justifications via `GENERIC_PHRASE_RE`.
10. **No `innerHTML`, `eval()`, `new Function()`, `child_process` re-import, or `fetch()` introduced anywhere in the delta.** Two new `JSON.parse` call sites, both wrapped in `try/catch`. Settings UI refactor uses `createSpan({ cls, text })` and `setText()` throughout. CSP for the sandbox iframe stays `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'` (`src/core/sandbox/sandboxHtml.ts:17`), no widening.
11. **Capability migration drops dangling references on settings load** (`main.ts:2014-2020`). `customModes`, `modeModelKeys`, and `modeToolOverrides` are actively filtered for the removed `ask` slug. Prevents a downstream lookup from resolving a removed mode to its old tool group set.
12. **SCA hygiene holds.** `npm audit` reports zero advisories at every severity. All four `overrides` pins from AUDIT-029 (`protobufjs >=7.5.5`, `dompurify >=3.4.0`, `hono >=4.12.18`, plus the supplemental `undici`, `path-to-regexp`, `flatted`, `brace-expansion`, `lodash-es`, `express-rate-limit`, `fast-uri`, `fast-xml-builder`, `@hono/node-server`) still effective. Zero new packages since AUDIT-029, no typosquat candidates, all runtime licenses permissive (MIT / Apache-2.0 / BSD-3-Clause).

## OWASP LLM Top 10

| ID    | Title                       | Status                | Reasoning |
|-------|-----------------------------|-----------------------|-----------|
| LLM01 | Prompt Injection            | Concern, unchanged    | Tool-result strings flow verbatim into the model. The delta did not widen this surface. Existing controls (per-tool approval, `ResultExternalizer` capping large blobs) hold. Long-term: consider a `[USER-AUTHORED]` vs `[TOOL-OUTPUT]` boundary marker. |
| LLM02 | Insecure Output Handling    | OK                    | Sandbox CSP unchanged. Chat renderer does not introduce HTML from model output. The `[sources]` and `[followups]` blocks are parsed in code, not handed to `innerHTML`. |
| LLM03 | Training Data Poisoning     | N/A                   | No training pipeline; the plugin uses third-party hosted models. |
| LLM04 | Model DoS                   | OK                    | `resolveOutputBudget` clamps `max_tokens` to both model ceiling and context-window minus input estimate. `consecutiveMistakeLimit` (default 3) bounds tool-error retry loops. |
| LLM05 | Supply Chain                | OK                    | Optional binary assets ship with SHA256 verification. No new CDN imports. `requestUrl` preferred over `fetch`. |
| LLM06 | Sensitive Info Disclosure   | OK                    | Settings encrypted on disk via `encryptSettingsForSave`. New OAuth error parser forwards only the first 400 chars of server bodies; no token or session id is logged. |
| LLM07 | Insecure Plugin Design      | Concern, unchanged    | Auto-approval for `subtask` and `agent` groups gated by master + per-group flags. Diagnostic log added for the conflicting legacy `data.json` combination. New-task validator demands a justification or known profile name. Healthy. |
| LLM08 | Excessive Agency            | Concern, unchanged    | Agent can write to the vault, trash files, run allowlisted shell commands, and patch its own plugin. The delta does not add new agency. The mode collapse removes a profile name (`ask`) but the read-only intent still exists via `profile="research"`. |
| LLM09 | Overreliance                | OK                    | Cost-aware section and `responseFormat` push "result first, no narration" and "cite sources." User-facing `[sources]` block surfaces provenance. |
| LLM10 | Model Theft                 | N/A                   | No locally hosted weights. |

## Fix-loop closure

All P2 + P3 findings closed in this audit. Re-audit verifies no regressions; type-check clean; affected test suites green (105 / 105 in `src/core/checkpoints`, `src/core/tools/agent`, `src/api`).

### Resolutions

| ID  | File                                          | Resolution                                                                                                                                                                                       |
|-----|-----------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| M-1 | `GitCheckpointService.ts`                     | Added `isVaultRelative()` module-level helper; called at every restore boundary (`restoreCheckpoint` modified-file loop, new-files loop, `restoreLatestForTask` git-log loop, new-files loop).   |
| M-2 | `GitCheckpointService.ts`                     | `NEW_FILES_MAX_BYTES = 64 * 1024` cap on the JSON capture before `JSON.parse`. `NEW_FILES_MAX_ENTRIES = 10_000` cap on the parsed array length. Regex switched to non-greedy `\[.*?\]`.        |
| M-3 | `GitCheckpointService.ts`                     | New `FilesJson:` line in commit message carries `JSON.stringify(staged)`; legacy `Files:` line kept for one-release fallback. New `parseFilesFromMessage()` helper prefers JSON, falls back to comma-split. |
| M-4 | `newTaskValidation.ts`                        | Comment rewritten to document the actual narrow allowlist (only `'agent'`) and the EPIC-26 design choice that specialist behaviour lives in `profile`, not `mode`. Note added about `OLD_MODE_MAP` rewriting legacy `ask -> agent` so reviewers understand the migration intent. |
| L-1 | `GitCheckpointService.ts`                     | Every `vaultRelPath` in log strings and error arrays now wrapped in `JSON.stringify()`. Embedded `\n` / escape sequences from a tampered commit message cannot poison the user-facing error.    |
| L-2 | `GitCheckpointService.ts`                     | `snapshot()` rejects any `taskId` that fails `isVaultRelative` or contains `/` or `\`. Throws before any fs write happens, so the marker-file path `${repoPath}/.vault-operator-newfiles-${taskId}` stays inside `repoPath`. |
| L-3 | `GitCheckpointService.ts`                     | New `skipped: string[]` field on `CheckpointInfo`. Snapshot loop collects both path-traversal rejects and per-file `try/catch` failures. Both empty- and populated-checkpoint return paths propagate the field. |
| L-4 | `PermissionsTab.ts`                           | Info-styled hint added at the top of the Permissions tab when `onboarding.completed === false`. Explains that auto-approve ships off and points the user back to the wizard.                       |
| I-3 | `package.json`, `package-lock.json`           | `openai` upgraded from `^4.0.0` to `^5.0.0` (installed `5.23.2`). Type-check clean, 45 provider tests pass, full build green. No source-level changes needed; the `chat.completions.create` + tool_calls path stayed compatible. |
| I-4 | `package.json`, `package-lock.json`           | `uuid@9.0.1` and `@types/uuid@9.0.7` removed entirely. `uuid` had zero direct imports in `src/`; `exceljs` and `mermaid` pull their own transitive versions independently. Bundle-size win as a side effect. |

### Carried forward (Info only, no action this release)

- **I-1**: hardcoded git committer identity (`'obsidian-agent' / agent@obsidian.local`) in the checkpoint shadow repo. By design. Noted in REVIEWER_NOTES so it does not surface again in future audits.
- **I-2**: steering-queue user messages append to history without the attachment-truncation path. The trust origin is the user; no security boundary crosses. Cap only needed if a non-user-facing caller is ever wired into `consumeSteeringMessages`.

### Test status note

29 unrelated test failures exist on the baseline (`VaultHealthService`, `WriterLock`, `GlobalFileService`, `ResultExternalizer`, `ExtractionQueue`, MCP tools). Identical count and identical failures on the pre-fix-loop baseline (`git stash` comparison). Pre-existing, not introduced or aggravated by this audit. Captured for a separate backlog item; out of scope for AUDIT-030.

## Closing

This was a low-risk delta. The fix-loop closes every P2 and P3 finding; the two carried-forward Info entries (`I-1`, `I-2`) are documented behavior, not gaps. `openai` upgrade to v5 and `uuid` removal land in the same set.

**Release recommendation: Green** for v2.11.6 after this fix-loop merges.

Affected files:
- `/Users/sebastianhanke/projects/obsidian-agent/src/core/checkpoints/GitCheckpointService.ts` (M-1, M-2, M-3, L-1, L-2, L-3)
- `/Users/sebastianhanke/projects/obsidian-agent/src/core/tools/agent/newTaskValidation.ts` (M-4)
- `/Users/sebastianhanke/projects/obsidian-agent/src/ui/settings/PermissionsTab.ts` (L-4)
- `/Users/sebastianhanke/projects/obsidian-agent/package.json`, `package-lock.json` (I-3, I-4)
