---
title: AUDIT-034 v2.12.8 pre-release delta-audit
audit_id: AUDIT-034
version: 2.12.8
date: 2026-05-31
auditor: security-audit skill
scope: delta vs AUDIT-033 (v2.12.6)
verdict: GREEN
---

# Security Audit Report

| Field | Value |
|-------|-------|
| Project | obsidian-agent (Vault Operator) |
| Date | 2026-05-31 |
| Auditor | security-audit skill |
| Scan Scope | Delta-Audit -- 10 code files modified for FIX-01-05-02 / FIX-01-12-02 / FIX-04-03-09 / FIX-13-02-01 / FIX-13-02-02 / FIX-18-04-02 / FIX-18-04-03 |
| Risk Rating | Low (Release-readiness GREEN) |
| Languages | TypeScript (strict) |
| Previous Audit | AUDIT-033 v2.12.6 (2026-05-30, 0 H/M/L, 1 Info) |
| Commit | 407f21fc on fix/code-review-7-findings |

---

## Executive Summary

| Analysis Domain | Critical | High | Medium | Low | Info |
|-----------------|----------|------|--------|-----|------|
| SAST (CWE-equiv.) | 0 | 0 | 0 | 0 | 1 |
| OWASP Top 10 | 0 | 0 | 0 | 0 | 0 |
| OWASP LLM Top 10 | 0 | 0 | 0 | 0 | 0 |
| Zero Trust | 0 | 0 | 0 | 0 | 0 |
| Code Quality | 0 | 0 | 0 | 0 | 0 |
| SCA (Dependencies) | 0 | 0 | 0 | 0 | 0 |
| License Compliance | 0 | 0 | 0 | 0 | 0 |
| Total | 0 | 0 | 0 | 0 | 1 |

Delta-audit on the seven FIX commits between v2.12.7 and the v2.12.8 release candidate. Code surface added: two shared provider helpers (`utils/openAiContent.ts`, `utils/toolCallFlush.ts`), the rewritten `tryNormalizedMatch` in `EditFileTool`, the byte-compare `resolveAttachmentTargetPath` in `AttachmentHandler`, the `tools` parameter on `estimatePromptTokens`, and an `image_url` branch in three OpenAI-shape providers. No new external IO. No new dependencies. `npm audit` reports 0 vulnerabilities across 1006 packages (baseline unchanged from AUDIT-033). All seven FIXes tighten existing trust boundaries rather than relaxing them. One Info-class observation on TOCTOU in the collision-rename cascade, documented for context.

### Delta from Previous Audit

| Finding | Previous (AUDIT-033) | Current | Change |
|---------|---------------------|---------|--------|
| AUDIT-033-I-1 (cosmetic i18n) | Info | Released in 2.12.6 | Resolved |
| Baseline `npm audit` clean | 0 vuln | 0 vuln | Unchanged |
| TOCTOU on collision rename | n/a | I-1 (Info) | New (added by FIX-01-12-02 mitigation) |

---

## Findings

### P1: Must Fix (Critical + High)

None.

### P2: Should Fix (Medium)

None.

### P3: Consider (Low + Info)

#### I-1: TOCTOU between collision check and createBinary (resolveAttachmentTargetPath)

| Field | Value |
|-------|-------|
| Severity | Info |
| CWE | CWE-367 (Time-of-Check Time-of-Use) |
| Location | [src/ui/sidebar/AttachmentHandler.ts:509-549](src/ui/sidebar/AttachmentHandler.ts#L509-L549) |
| Status | Confirmed, accepted |

Risk. `resolveAttachmentTargetPath` queries `getAbstractFileByPath`, optionally calls `readBinary` for the byte-equal check, then returns a target path the caller passes to `createBinary`. Between the lookup and the write, another writer could in theory create or replace a file at the chosen path. Result: silent overwrite of an unrelated file, or an unexpected `createBinary` failure.

Real-world exposure. Obsidian runs a single JavaScript process and the AttachmentHandler is only reached from the sidebar drop handler. A second writer would have to be (a) another community plugin holding a write reference to the same path, or (b) the user manually editing the file in a different tool while the drop is in flight. Neither is a remote attack vector. Worst-case impact is local-vault data inconsistency, not a confidentiality or integrity breach.

Remediation. Accept as documented limitation for now. If a future incident shows this firing in practice, switch the write path to a guarded `createBinary` with an existence-recheck, or move to a per-vault write lock. No code change required for v2.12.8.

---

## Phase-by-phase findings

### Phase 1 -- Reconnaissance

Stack confirmed: TypeScript strict, Obsidian Plugin API, esbuild bundler, 1006 npm packages (377 prod, 589 dev, 119 optional, 24 peer). Scope: 10 code files modified, 5 test files added, 2 new util modules, 7 FIX spec files, 1 BACKLOG update. No infrastructure or build pipeline change. No new runtime dependency.

### Phase 2 -- SAST

| Check | File | Result |
|-------|------|--------|
| CWE-22 path traversal in collision-rename | AttachmentHandler.ts:529-548 | OK -- `safeName` passes through `sanitiseAttachmentFileName` (line 466) which already strips `..`, path separators, NUL. Suffix lands strictly between trusted `base` and trusted `ext` slices of that sanitised name. |
| CWE-78 / CWE-94 code injection in image data-URL | openai.ts, github-copilot.ts, kilo-gateway.ts | OK -- `${media_type};base64,${data}` is sent to the LLM API only, never injected into a browser DOM. `ImageMediaType` is a typed union restricted to png/jpeg/gif/webp at the AttachmentHandler source. |
| CWE-1333 ReDoS in EditFileTool normalisation | EditFileTool.ts:236-237 | OK -- `/\r\n/g` and `/[ \t]+/g` are linear, no nested quantifiers, no alternation backtracking. |
| CWE-129 array index in mapNormToOrigIndex | EditFileTool.ts:258-281 | OK -- both cursors bounds-checked against `orig.length` and `targetNormIdx`. Returns `-1` on under-walk; callers treat that as no-match. |
| CWE-674 unbounded loop in cascade | AttachmentHandler.ts:532-548 | OK -- explicit `n < 1000` ceiling with thrown error. |
| CWE-755 unhandled exception in JSON.parse | toolCallFlush.ts:55-67 | OK -- wrapped in try/catch, emits a tool_error chunk with the actionable `truncatedToolInputError` message. |
| CWE-200 information disclosure via console | toolCallFlush.ts:47-50 | OK -- only the accumulator id/name (transient SDK identifiers) reach `console.warn`. No tokens, no payload. |
| CWE-367 TOCTOU on collision rename | AttachmentHandler.ts:514-548 | Info (I-1) -- see finding. |
| CWE-369 div-by-zero / overflow in estimatePromptTokens | model-registry.ts:362-381 | OK -- `Math.ceil(chars / 4)` cannot divide by zero; tool-stringify length added to a Number (capacity well below Number.MAX_SAFE_INTEGER). |
| `eval`/`Function`/`exec` introduced | all touched files | None. Only existing `pageHeaderRegex.exec` in unchanged AttachmentHandler section. |
| `innerHTML`/DOM injection | all touched files | None. No DOM writes in any modified file. |

### Phase 3 -- OWASP Top 10

| Category | Finding |
|----------|---------|
| A01 Broken Access Control | None. No auth or authz code changed. |
| A02 Cryptographic Failures | None. No crypto code added or removed. Byte-equal compare is an equality check, not an authentication primitive. |
| A03 Injection | None. The image data-URL is constructed from a typed `ImageMediaType` union and a base64 payload, both produced by the AttachmentHandler trust boundary; emitted to the LLM provider only. |
| A04 Insecure Design | None. All seven FIXes tighten existing surfaces (multi-match rejected, collision detected, image input no longer dropped, tool-call flush emits actionable error). Defensive direction. |
| A05 Security Misconfiguration | None. No config defaults changed. |
| A06 Vulnerable and Outdated Components | None. `npm audit` reports 0 vulnerabilities across 1006 packages. |
| A07 Identification and Authentication Failures | None. Provider auth code unchanged. |
| A08 Software and Data Integrity Failures | None. No deserialisation of untrusted data added. `JSON.parse` on tool arguments is wrapped and the error becomes a tool_error chunk, not a thrown exception. |
| A09 Security Logging and Monitoring Failures | None. New code uses `console.warn` consistently with the repo's review-bot rule (no `console.log`). |
| A10 Server-Side Request Forgery | None. No new `fetch`/network call. |

### Phase 4 -- OWASP LLM Top 10

| Category | Finding |
|----------|---------|
| LLM01 Prompt Injection | Image input now reaches OpenAI / Copilot / Kilo Gateway vision models via FIX-04-03-09. A user-attached image could carry textual content the model reads. Trust boundary stays the same as Anthropic/Bedrock (which already accept the same blocks): the attaching user is the trusted source. No remote attack vector introduced. |
| LLM02 Insecure Output Handling | The new tool_error chunk carries the JSON-parse `rawError` and the `truncatedToolInputError` template. Both are deterministic strings, no exfiltration channel opened. |
| LLM03 Training Data Poisoning | n/a (no training pipeline in this project). |
| LLM04 Model Denial of Service | FIX-18-04-02 now accounts for tool-schema tokens in `resolveOutputBudget`, which prevents the OpenAI 400 + emergency-condense loop that AUDIT-024 had flagged as a partial DoS surface. Net positive. |
| LLM05 Supply Chain | No new dependencies. `npm audit` clean. |
| LLM06 Sensitive Information Disclosure | `resolveAttachmentTargetPath` reads bytes of an existing colliding file (via `adapter.readBinary`) only to byte-equal-compare with the incoming attachment. The bytes never leave the function. |
| LLM07 Insecure Plugin Design | n/a. |
| LLM08 Excessive Agency | None. No new tool or capability granted. |
| LLM09 Overreliance | n/a. |
| LLM10 Model Theft | n/a. |

### Phase 5 -- SCA

`npm audit --json` returns 0 vulnerabilities at any severity. Dependency totals: 377 prod, 589 dev, 119 optional, 24 peer (1006 total). No new package added by the seven FIXes; the two new files in `src/api/providers/utils/` are internal to the repo and ship via the existing bundle. No license-classification change.

### Phase 6 -- Zero Trust and Code Quality

| Principle | Check | Result |
|-----------|-------|--------|
| Trust boundary at user input | AttachmentHandler.processFile -> sanitiseAttachmentFileName | Preserved. The new resolveAttachmentTargetPath consumes the already-sanitised name; never re-derives a name from user-controlled source. |
| Least privilege | No new privileged API call | OK. |
| Defense in depth | resolveAttachmentTargetPath has hash-equal short-circuit + cascade + bounded loop + thrown error | OK. |
| Fail-closed | Multi-match in tryNormalizedMatch -> hard error instead of silent first-match | Stricter than before. |
| Audit trail | console.warn on incomplete tool_call accumulators (with provider label) | OK. |
| Error handling | JSON.parse, readBinary, vault.modify wrapped in try/catch | OK. |
| Race conditions | TOCTOU on collision rename | Info (I-1). |
| Hardcoded credentials | None added | OK. |
| Debug code in production | No `console.log`, no `debugger` statements | OK. |

---

## Remediation Plan

| Priority | Finding | Remediation | Effort |
|----------|---------|-------------|--------|
| Info | I-1 TOCTOU on collision rename | Accept for v2.12.8. Revisit if telemetry shows real collisions in production. | none |

---

## Positive Findings

- All seven FIXes are net-defensive: they replace silent failure modes (whitespace destruction, content swap, dropped tool_use, dropped image input, generic recovery message) with either correct behaviour or a hard error that surfaces to the agent.
- The new shared helpers `utils/openAiContent.ts` and `utils/toolCallFlush.ts` reduce three parallel one-off implementations across providers to one canonical version. Future security fixes land in one place instead of three.
- 38 new regression tests pin the new behaviour, including the multi-match-rejection guard (AttachmentHandler) and the byte-equal short-circuit (AttachmentHandler).
- `sanitiseAttachmentFileName` (AUDIT-025 M-1) remains the single trust boundary for attachment names; the new collision-rename path operates only on its output.
- `truncatedToolInputError` now reaches every OpenAI-shape provider with the correct `wasMaxTokens` flag, reducing the "model retries the same broken payload" loop that AUDIT-024 had flagged as a soft DoS surface.

---

## SCA Details

### Vulnerable Dependencies

None.

### License Compliance

No change from AUDIT-033. No new packages.

---

## Appendix

### A. Tools Used

- `git diff main..HEAD --stat`
- `npm audit --json`
- Manual SAST grep over the 10 modified files for CWE-22 / CWE-78 / CWE-94 / CWE-129 / CWE-200 / CWE-367 / CWE-369 / CWE-674 / CWE-755 / CWE-1333 patterns.
- OWASP Top 10 and OWASP LLM Top 10 category walk against the diff.
- Pattern checks: `exec`, `eval`, `child_process`, `innerHTML`, `dangerouslySetInnerHTML`, `document.write`.

### B. Files Analysed

Modified:
- `src/api/providers/anthropic.ts` (1 line)
- `src/api/providers/bedrock.ts` (1 line)
- `src/api/providers/github-copilot.ts` (helper refactor + image-block branch)
- `src/api/providers/kilo-gateway.ts` (helper refactor + image-block branch + delta.content + post-loop flush)
- `src/api/providers/openai.ts` (helper refactor + image-block branch + wasMaxTokens wiring)
- `src/core/tools/vault/EditFileTool.ts` (tryNormalizedMatch rewrite)
- `src/types/model-registry.ts` (estimatePromptTokens tools param)
- `src/ui/sidebar/AttachmentHandler.ts` (collision rename + byte-equal short-circuit)
- `src/__test-stubs__/obsidian.ts` (Notice stub for tests)

Added:
- `src/api/providers/utils/openAiContent.ts`
- `src/api/providers/utils/toolCallFlush.ts`

Tests (out of audit scope for vulnerability classification, in scope for behaviour pin):
- `src/api/providers/__tests__/openAiContent.test.ts`
- `src/api/providers/__tests__/openai-image-blocks.test.ts`
- `src/api/providers/__tests__/kilo-gateway-tool-call-flush.test.ts`
- amended `src/api/providers/__tests__/openai-tool-call-flush.test.ts`
- amended `src/core/tools/vault/__tests__/EditFileTool.test.ts`
- amended `src/types/__tests__/model-registry.test.ts`
- amended `src/ui/sidebar/__tests__/AttachmentHandler.test.ts`

### C. Excluded from Analysis

- `chatgpt-oauth.ts`: not touched by the seven FIXes. The Responses API delta noted in FIX-18-04-03 is tracked as a follow-up there and out of scope here.
- `main.js`: build artefact, not source.
- Pre-existing test failures (20 in WriterLock / VaultHealth / Tool-Metadata clusters): identical to AUDIT-033 baseline, not caused by the FIX wave.
- `forked-kilocode/`: third-party reference checkout, excluded from production bundle.
