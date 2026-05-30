---
id: AUDIT-032
title: Targeted Security Audit v2.12.5 (tmp CVE + FIX-04-03-07 delta)
version: 2.12.5
date: 2026-05-29
scope: targeted
prior-audit: AUDIT-031 (v2.12.3)
triggers:
  - Dependabot alert #53 (GHSA-ph9p-34f9-6g65 / CVE-2026-44705, tmp path traversal)
  - Release closure for v2.12.5 (FIX-04-03-07 reasoning_content passback)
verdict: Green (override applied on chore/audit-032-tmp-override, ships with next patch release)
findings:
  resolved: 1
  deferred: 0
  pending: 0
  total: 1
---

# AUDIT-032 -- v2.12.5 Targeted Security Audit

## Scope and rationale

Two specific triggers, not a full re-audit:

1. **GitHub Dependabot alert #53** on `pssah4/vault-operator` (`tmp` < 0.2.6, CWE-22 path traversal, CVSS v4 7.7 / High).
2. **Delta surface from FIX-04-03-07** (released as 2.12.5): new `{ type: 'thinking' }` ContentBlock, OpenAI-compatible provider echo of `reasoning_content` for DeepSeek, cross-provider defensive `stripThinkingBlocks` helper, UI replay of captured reasoning.

Prior audit AUDIT-031 (2.12.3) closed the qs override and the FIX-01-07-03 editor-refresh surface. Between AUDIT-031 and now we shipped 2.12.4 (qs bump only, no new attack surface) and 2.12.5 (FIX-04-03-07). Tech stack unchanged from AUDIT-030.

## Findings

### H-1 -- tmp < 0.2.6 path traversal via prefix/postfix/dir

- **Severity:** High (CVSS v4 7.7)
- **CWE:** CWE-22 Improper Limitation of a Pathname to a Restricted Directory
- **Source:** Dependabot alert [#53](https://github.com/pssah4/vault-operator/security/dependabot/53), GHSA-ph9p-34f9-6g65, CVE-2026-44705
- **Affected version:** `tmp@0.2.5` (transitive via `exceljs@4.4.0`)
- **First patched version:** `tmp@0.2.6`
- **Manifest path:** `package-lock.json`
- **Scope:** runtime
- **Status:** Resolved on branch `chore/audit-032-tmp-override` (2026-05-29) -- `tmp >= 0.2.6` override added, resolved to `tmp@0.2.7`, `npm audit` clean, full test suite at baseline (20 pre-existing failures, no new regressions), build clean. Awaiting next patch release (Dependabot alert closes automatically when the lockfile change reaches `main` via sync-public).

### Risk

`tmp.file()` builds the final path as `path.join(tmpDir, opts.dir || '', name)` where `name` is `<prefix>-<pid>-<random>-<postfix>`. Path traversal sequences in `prefix`, `postfix`, or `dir` escape the intended temp directory because `path.join` normalises `../` regardless of surrounding text, and an absolute `opts.dir` makes `path.join` discard `tmpDir` entirely. An attacker who can influence those options can place files outside the temp area at arbitrary attacker-controlled locations with the privileges of the running process.

### Exposure analysis

Direct calls to `tmp` from `src/` -- none. The only call site in the dependency graph is `node_modules/exceljs/lib/stream/xlsx/workbook-reader.js:115`:

```js
tmp.file((err, path, fd, tempFileCleanupCallback) => { ... })
```

This is the **streaming reader** path inside ExcelJS. The plugin's XLSX surface area is the writer side only: `create_xlsx` and the workbook builders, which never reach `WorkbookReader` and never expose `prefix`/`postfix`/`dir` to user input. Practical exploit path against the deployed plugin: effectively nil. Same shape as the qs/express situation in AUDIT-031.

The risk is still real for the SCA baseline and for any future code path that opts into ExcelJS streaming read with user-controlled options. Patching keeps the alert closed and the audit baseline clean.

### Remediation

Add `tmp` to the npm `overrides` block in `package.json`, same pattern as `qs` in AUDIT-031:

```json
"overrides": {
  ...,
  "qs": ">=6.15.2",
  "tmp": ">=0.2.6"
}
```

Then `npm install`, verify `npm ls tmp` shows `0.2.6`, run `npm audit` to confirm the advisory is gone, rebuild, and ship as a 2.12.6 patch release alongside the regular ones.

---

## FIX-04-03-07 delta -- SAST review

Code delta in 2.12.5:
- `src/api/types.ts` -- ThinkingBlock variant on ContentBlock; `requiresPassback?: boolean` on the thinking stream chunk.
- `src/api/providers/openai.ts` -- captures `reasoning_content` from streaming delta and echoes it back as `reasoning_content` on the assistant message in `convertMessages` for `config.type` in `{custom, ollama, lmstudio}`. 50_000-char cap with truncation trailer.
- `src/core/AgentTask.ts` -- persists thinking text into a ContentBlock when the stream chunk has `requiresPassback: true`. New `estimateTokens` branch counts thinking blocks.
- `src/core/utils/stripThinkingBlocks.ts` -- new helper; called defensively by Anthropic and Bedrock providers before their strict `convertMessages`.
- `src/api/providers/anthropic.ts` + `src/api/providers/bedrock.ts` -- invoke `stripThinkingBlocks(messages)` before `convertMessages(...)`.
- `src/core/history/ConversationStore.ts` -- optional `reasoningText?: string` on UiMessage; persisted as JSON.
- `src/ui/AgentSidebarView.ts` -- renders captured reasoning into a collapsed "Reasoning..." bubble via `createDiv` + `setText`. Live accumulator writes to UiMessage at turn end.

### Categories checked

| Category | Verdict | Notes |
|---|---|---|
| Prompt / log injection | Clean | reasoning_content is string-guarded at the source, never used as a format / regex / log template. Only emitted as an OpenAI-message field value. |
| DoS / token cost | Clean | 50_000-char cap fires before persistence and before passback. `estimateTokens` adds a guarded `chars/4` branch, no OOM path. |
| XSS in UI | Clean | Renders use `createDiv` + `setText` only, no `innerHTML`. `MarkdownRenderer.render` runs only on the existing text body, not on `reasoningText`. |
| Persistence injection | Clean | Native `JSON.stringify` / `JSON.parse` round-trip; `reasoningText` is a plain optional string field. |
| Type confusion | Clean | All three call sites for `block.type === 'thinking'` (openai.ts convertMessages, AgentTask.estimateTokens, sidebar replay) guard `text` with a type predicate or `typeof === 'string'` before use. |
| Cross-provider leakage | Clean | `stripThinkingBlocks` runs unconditionally in Anthropic + Bedrock `createMessage` before their `convertMessages`. OpenAI allow-list excludes `openai`/`azure`/`openrouter`/`gemini`; only the last assistant message with tool_use ever emits `reasoning_content` on the wire. |
| Race conditions | Clean | `thinkingParts` buffer is scoped per iteration of AgentTask's streaming loop. `spawnSubtask` creates a fresh AgentTask instance with its own buffer; no shared state. |

No findings on the delta. The implementation has defense-in-depth across input validation, output encoding, rate limiting (cap), scope isolation (per-iteration buffer), and provider isolation (allow-list plus defensive strip).

---

## Other categories (unchanged from AUDIT-031 / AUDIT-030)

OWASP Top 10, OWASP LLM Top 10, Zero Trust, code quality: no regressions in the 2.12.4 -> 2.12.5 delta. The qs override from AUDIT-031 stays in place. No new direct dependencies were added.

`npm audit` after the override lands is expected to report 0 vulnerabilities.

## Verdict

- **Pre-fix:** Yellow. One High-severity SCA finding (H-1) with effectively-nil exploit path against the deployed plugin, but the alert is open and the patched version is available.
- **Post-fix:** Green. `tmp >= 0.2.6` override applied on `chore/audit-032-tmp-override`, resolved to `tmp@0.2.7`, audit clean. The fix waits on `dev` for the next regular patch release; no standalone 2.12.6 cut.

## Release recommendation

Roll the override into the next patch alongside whatever lands next (DeepSeek verification follow-up, ingest tweaks, etc.). Add a security note to the release notes when the release ships, referencing AUDIT-032 / Dependabot #53 / CVE-2026-44705. No standalone 2.12.6 needed for the SCA alone; the production-exposure path is effectively nil (writer-only XLSX surface, the vulnerable code in exceljs is the streaming reader).
