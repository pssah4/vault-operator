---
id: AUDIT-029
project: vault-operator
date: 2026-05-16
scope: v2.11.3-wave delta (commit 71750282 -- chatgpt-oauth reasoning fix, OpenAI chat-completion filter helper, local-provider pre-fill, boot error surface) + closure of AUDIT-028 L-1 + L-2
overall-risk: Low
predecessor: AUDIT-028 (v2.11.2 delta, 2026-05-16, Green)
release-recommendation: Green
fix-status: 0 Critical, 0 High, 0 Medium, 0 Low (2 from AUDIT-028 closed in this pass), 1 Info, 2 Positive
---

# AUDIT-029: v2.11.3 Delta + AUDIT-028 Fix-Loop Closure

## Executive Summary

| Analysis Domain | Critical | High | Medium | Low | Info |
|-----------------|----------|------|--------|-----|------|
| SAST | 0 | 0 | 0 | 0 | 1 |
| OWASP Top 10 | 0 | 0 | 0 | 0 | 0 |
| OWASP LLM Top 10 | 0 | 0 | 0 | 0 | 0 |
| Zero Trust | 0 | 0 | 0 | 0 | 0 |
| Code Quality | 0 | 0 | 0 | 0 | 0 |
| SCA | 0 | 0 | 0 | 0 | 0 |
| **Total** | **0** | **0** | **0** | **0** | **1** |

The v2.11.3-wave commit (71750282) adds a `reasoning` block to the ChatGPT-OAuth request body, extracts an `isOpenAIChatCompletionModel` helper that tightens model-list filtering, pre-fills the base-URL field for local providers, and surfaces `doLoad` rejection via `console.error`. None of these changes introduce a new trust boundary, new HTTP endpoint, new fs/spawn surface, or new credential handling. All four are policy / UX / typing improvements.

This audit pass also closes the two Low findings deferred from AUDIT-028:

- **AUDIT-028 L-1** (GitCheckpointService.snapshot missing path-traversal guard): **Resolved**. Defense-in-depth check added at `snapshot()` entry; absolute paths, `..` segments, and NUL bytes are rejected before they reach the raw-fs writeFile.
- **AUDIT-028 L-2** (safeFs.promises.symlink exposes unvalidated target): **Resolved**. `promises.symlink` and `promises.readlink` removed from the exported surface; the wrapper no longer exposes any API that could create or follow a trapdoor symlink. Zero callers existed; the removal is the cleanest closure.

Release-Empfehlung: **Green**. v2.11.3 ships cleanly. Both AUDIT-028 follow-ups are closed in the same release.

## Scope of the Delta since AUDIT-028

Single commit `71750282 feat(v2.11.3-wave)`:

- `src/api/providers/chatgpt-oauth.ts` (+57 LOC):
  - Added typed `reasoning?: { effort: ReasoningEffort; summary?: 'auto' }` and `include?: string[]` fields on `ResponsesRequestBody`.
  - New helper `isGpt5Family(modelId)` plus the `KNOWN_MODELS` table expanded to include `gpt-5`, `gpt-5.1`, `gpt-5.2`, `gpt-5-codex`, `gpt-5-codex-mini`, `gpt-5.1-codex*`, `gpt-5.2-codex`, `gpt-5.3-codex`.
  - New exports `CHATGPT_OAUTH_DEFAULT_TEST_MODEL = 'gpt-5'` and `listKnownChatGptOAuthModels()`.
  - `createMessage` and `classifyText` attach `reasoning: { effort: 'low', summary: 'auto' }` for matching models; `createMessage` also attaches `include: ['reasoning.encrypted_content']`.
- `src/main.ts` (+55 LOC):
  - `.catch((err) => console.error('[Boot] doLoad threw before completion:', err))` between `void this.doLoad()` and `.finally`.
  - New OpenAI cleanup pass that filters `providerConfigs[].discoveredModels` through `isOpenAIChatCompletionModel`.
- `src/ui/settings/ProviderDetailModal.ts` (+37 LOC):
  - Pre-fill `formBaseUrl` with the well-known default for new local providers (ollama, lmstudio).
  - Tier-candidate picker filters through `isOpenAIChatCompletionModel` for OpenAI providers.
  - Falls back to `CHATGPT_OAUTH_DEFAULT_TEST_MODEL` when no tier mapping is set for ChatGPT-OAuth.
- `src/ui/settings/testModelConnection.ts` (+68 LOC):
  - Exported `isOpenAIChatCompletionModel(id)` with tightened `NONCHAT_EXCLUDE_RE`.
  - New `provider === 'ollama'` branch uses native `/api/tags` via `fetchOllamaModels`.
  - New `provider === 'chatgpt-oauth'` branch returns the hardcoded Codex lineup.
- `src/ui/settings/__tests__/openaiChatModelFilter.test.ts` (new, 119 LOC) -- coverage for the filter.

## Findings

### I-1: include: ['reasoning.encrypted_content'] requests data the SSE parser does not read

- **Status:** Confirmed, no action recommended
- **Severity:** Info
- **CWE:** none (not a vulnerability)
- **Location:**
  - `src/api/providers/chatgpt-oauth.ts:178` -- `body.include = ['reasoning.encrypted_content']`
  - `src/api/providers/chatgpt-oauth.ts:430-559` -- the SSE parser handles `response.output_text.delta`, `response.output_item.added`, `response.function_call_arguments.delta`, `response.completed`, `response.failed`. Reasoning events (`response.reasoning_summary.delta`, `response.reasoning_text.delta`, etc.) are silently dropped.
- **Observation:** The plugin asks the Codex backend to return encrypted reasoning content (`include: ['reasoning.encrypted_content']`), but the SSE parser does not surface those events to the agent loop. Net effect: bandwidth overhead on each completion request, no functional or security impact. The encrypted_content is server-side encrypted by OpenAI; even if the parser exposed it, the value would be opaque to the client.
- **Recommendation:** Leave as-is for v2.11.3. If multi-turn reasoning re-use is added later (the fork's `getEncryptedContent()` pattern), the include flag is already in place. If it never gets used, drop the include in a future cleanup to save the round-trip bytes.

## Closures of AUDIT-028 follow-ups

### AUDIT-028 L-1 (GitCheckpointService.snapshot filepath traversal): Resolved

- **Original location:** `src/core/checkpoints/GitCheckpointService.ts:101-139`
- **Resolution location:** `src/core/checkpoints/GitCheckpointService.ts:108-118`
- **Fix:** Added a guard at the top of the per-file loop inside `snapshot()`:

  ```ts
  if (vaultRelPath.includes('..') || path.isAbsolute(vaultRelPath) || vaultRelPath.includes('\0')) {
      console.warn(`[Checkpoints] Rejected non-vault-relative path: ${vaultRelPath}`);
      continue;
  }
  ```

  The check fires before the path is concatenated into `destPath`. Mirrors the vault-file recipe validator's traversal check (`recipeValidator.ts:21`). Sub-paths with forward slashes (`subdir/file.md`) are still accepted; only `..`, absolute roots, and NUL bytes are rejected. Path is imported as `import * as path from 'path'`.
- **Why this is the right fix:** filePaths arrives at `snapshot()` from `ToolExecutionPipeline.ts:338` (`toolCall.input.path`), which is LLM-controlled tool input. Upstream `write_file` / `edit_file` tool validators already reject path traversal, but FIX-28-00-02 routed the shadow-repo write back to raw fs, so the safeFs allowlist no longer fires as a backstop. The guard restores defense-in-depth at the only call site that uses raw fs.
- **Verification:** Build clean, tsc clean, `npm run build` deploys without regressions.

### AUDIT-028 L-2 (safeFs.promises.symlink unvalidated target): Resolved

- **Original location:** `src/core/security/safeFs.ts:272-277`
- **Resolution location:** `src/core/security/safeFs.ts:272-281` (replaced both `readlink` and `symlink` with an explanatory comment block)
- **Fix:** Removed `promises.symlink` and `promises.readlink` from the exported surface. The remaining `promises` object covers `readFile`, `writeFile`, `mkdir`, `stat`, `lstat`, `readdir`, `rm`, `rmdir`, `unlink`, `rename`, `access`, `cp`, `copyFile`, `appendFile`, `open`, `chmod`.
- **Why this is the right fix:** Zero callers of either method exist in `src/`. The wrapper resolves paths lexically (`path.resolve`, not `path.realpath`), which is the documented design choice. Allowing `promises.symlink` punched a hole in that design because a caller could have created a trapdoor link inside an allowed root pointing outside it; a subsequent read would have passed the lexical allowlist check while resolving to the off-allowlist target through the underlying Node fs. Removing both prevents anyone from re-introducing the gap later.
- **Verification:** Build clean, tsc clean, 33 wrapper tests pass (`npx vitest run src/core/security/__tests__/safeFs.test.ts src/core/security/__tests__/spawnAllowlist.test.ts`).

## SCA (Software Composition Analysis)

```
npm audit --omit=dev
found 0 vulnerabilities
```

22 runtime dependencies, zero advisories. Unchanged from AUDIT-028.

## OWASP Top 10 Coverage (delta-only)

| Category | Delta status |
|----------|--------------|
| A01 Broken Access Control | safeFs surface narrowed (symlink/readlink removed); positive |
| A02 Cryptographic Failures | No crypto changes in delta |
| A03 Injection | path traversal closed in GitCheckpointService.snapshot |
| A04 Insecure Design | No design changes in delta |
| A05 Security Misconfiguration | check-safe-fs-imports.sh pre-push gate still passes |
| A06 Vulnerable Components | npm audit clean |
| A07 Auth Failures | No auth changes in delta |
| A08 Software/Data Integrity | Release workflow build-provenance unchanged |
| A09 Logging Failures | New `console.error` on doLoad rejection improves observability |
| A10 SSRF | New ollama branch uses user-configured baseUrl as before; SSRF gate at user trust boundary unchanged |

## OWASP LLM Top 10 Coverage (delta-only)

The chatgpt-oauth `reasoning` field is sent in outgoing requests, not received from untrusted sources. The new `include: ['reasoning.encrypted_content']` requests opaque encrypted blobs which are dropped by the SSE parser (I-1). No new prompt construction, no new tool surface, no new training data path. AUDIT-027 + AUDIT-028 coverage of LLM01-LLM10 remains current.

## Delta from Previous Audit

| Finding | AUDIT-028 | AUDIT-029 | Change |
|---------|-----------|-----------|--------|
| L-1 (GitCheckpointService.snapshot traversal) | Deferred | **Resolved** | Closed |
| L-2 (safeFs.promises.symlink unvalidated target) | Deferred | **Resolved** | Closed |
| I-1 (ALLOWED_BINARIES architectural note) | Info | Info | Unchanged |
| I-1 (include: reasoning.encrypted_content unused) | -- | New Info | New (no action) |

## Release Recommendation

**Green.** v2.11.3 is shippable. AUDIT-028 backlog is empty. AUDIT-029 backlog has one Info-only entry (bandwidth overhead, not a vulnerability). EPIC-28's security posture is intact and tightened further by the L-2 closure.
