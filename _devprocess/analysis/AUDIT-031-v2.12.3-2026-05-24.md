---
id: AUDIT-031
title: Targeted Security Audit v2.12.3 (qs DoS + FIX-01-07-03 surface)
version: 2.12.3
date: 2026-05-24
scope: targeted
prior-audit: AUDIT-030 (v2.11.5)
triggers:
  - Dependabot alert #52 (GHSA-q8mj-m7cp-5q26, qs DoS)
  - Release closure for v2.12.3 (FIX-01-07-03)
verdict: Green
findings:
  resolved: 1
  deferred: 0
  total: 1
---

# AUDIT-031 -- v2.12.3 Targeted Security Audit

## Scope and rationale

Two specific triggers, not a full re-audit:

1. **GitHub Dependabot alert #52** on `pssah4/vault-operator` (qs DoS, GHSA-q8mj-m7cp-5q26).
2. **Delta surface from FIX-01-07-03** (released as 2.12.3): new file `src/core/utils/refreshMarkdownView.ts` plus the small editor-refresh hooks added to `GitCheckpointService`, `EditFileTool`, `WriteFileTool`, `AppendToFileTool`.

The last full audit was AUDIT-030 (v2.11.5, 2026-05-19) plus the per-feature audits AUDIT-FEAT-29-01 and AUDIT-FEAT-29-11. Between then and 2.12.3 we shipped 2.11.7 (iCloud-fix + Phase-7 work), 2.11.8 (Review-Bot follow-ups), 2.12.0 (ingest-deep rebuild + attachment auto-save), 2.12.1 (AUDIT-025 fixes), 2.12.2 (Review-Bot pre-checks), 2.12.3 (FIX-01-07-03). All of these had per-item audits or were maintenance-only with no new attack surface; the single open Dependabot finding is the only outstanding item.

## Tech stack (unchanged from AUDIT-030)

- Language: TypeScript (strict)
- Runtime: Electron (Obsidian), Node 20 in CI
- Major runtime deps: `@anthropic-ai/sdk`, `openai`, `@modelcontextprotocol/sdk`, `express` (only used by MCP HTTP transport), `body-parser`, `sql.js`, `vectra`
- Total deps: 377 prod, 589 dev, 119 optional, 1006 total
- Existing controls: SafeStorage (electron) for API keys, `requestUrl` instead of `fetch`, atomic SQLite writes with journal, MCP token-in-URL auth, path-traversal protection on binary writes, npm overrides for prior CVEs (protobufjs, hono, dompurify, undici, brace-expansion, ...).

## Findings

### M-1 -- qs DoS via null/undefined entries in comma-format arrays with encodeValuesOnly (CVE-2026-8723)

**Severity:** Medium (CVSS 5.3, CWE-476)
**Status:** Resolved in 2.12.3 patch (this audit)
**Source:** Dependabot alert #52, GHSA-q8mj-m7cp-5q26
**Affected package:** `qs@6.15.1` (transitive)
**Dependency chain:** `vault-operator → @modelcontextprotocol/sdk@1.29.0 → express@5.2.1 → body-parser@2.2.2 → qs@6.15.1`
**Vulnerable range:** `>= 6.11.1, <= 6.15.1`
**Patched version:** `6.15.2`

**Risk in our context:** Low practical exposure.

- The vulnerable code path is `qs.stringify(...)` with `encodeValuesOnly: true` plus null or undefined entries inside a comma-format array. A `TypeError` is thrown and the process crashes.
- `body-parser` and `express` use `qs.parse`, not `qs.stringify`. The MCP HTTP transport receives query strings via `req.query` (parse path), so the vulnerable stringify path is not on our request handling.
- Our own code does not import `qs` at all (grep -r `"qs"` in `src/`: no hits, no direct usage of `encodeValuesOnly` or `qs.stringify`).
- Even if a downstream library called `qs.stringify` with attacker-controlled input, the impact is a crash of the local Electron renderer process the user already controls. There is no remote multi-tenant server.

**Why fix anyway:**

- Keeps `npm audit` and Dependabot clean (release-gate hygiene).
- Existing override pattern already addresses the same class of transitive CVEs (memory: `protobufjs`, `hono`, `dompurify`, `undici`, `brace-expansion`).
- Patch is non-breaking (6.15.1 to 6.15.2, semver patch).

**Remediation applied:**

```diff
  "overrides": {
    "uuid": ">=11.1.1",
+   "qs": ">=6.15.2"
  }
```

- `npm install` after the override change pulled `qs@6.15.2`.
- `npm ls qs` shows `qs@6.15.2` deduped from both `body-parser` and `express`.
- `npm audit`: `found 0 vulnerabilities` (was: 1 moderate).
- Build clean (`npm run build` produces 4.5 MB `main.js`, no TS errors).

### Delta surface scan -- FIX-01-07-03 (clean)

Files added or touched in 2.12.3 beyond version-bump:

| File | Change | Security review |
|------|--------|-----------------|
| `src/core/utils/refreshMarkdownView.ts` (new, 84 lines) | Iterates `app.workspace.getLeavesOfType('markdown')`, calls `view.editor.setValue(content)` to flush stale CodeMirror buffer after `vault.modify` writes | No user input parsing. No path manipulation (operates on `TFile` references). Failure path is `console.warn` plus return-count; fails closed, never throws. Cursor and scroll clamping prevents out-of-range coordinates after content shrinks. **No finding.** |
| `src/core/checkpoints/GitCheckpointService.ts` | Calls `refreshOpenMarkdownViewsFor` after `vault.modify` during restore | Pure delegation to the new helper. No new attack surface. **No finding.** |
| `src/core/tools/vault/EditFileTool.ts` | Same delegation after `vault.modify` | Existing path-traversal and content-validation checks unchanged. **No finding.** |
| `src/core/tools/vault/WriteFileTool.ts` | Same | Same. **No finding.** |
| `src/core/tools/vault/AppendToFileTool.ts` | Same | Same. **No finding.** |

The fix only adds a UI-refresh side-effect; it does not change what the agent is permitted to write, where, or under which conditions. The existing approval gates on `edit_file`, `write_file`, `append_to_file` still run before the new hook is reached.

## OWASP and OWASP-LLM delta check

No new categories triggered. The release does not add LLM input handling, prompt-injection surface, new providers, new external APIs, new auth boundaries, new secrets-handling paths, or new file-write capabilities. The carry-over status from AUDIT-030 stands:

- A01..A10: unchanged from AUDIT-030.
- LLM01..LLM10: unchanged. LLM01 (prompt injection) is documented as accepted risk in permissive mode since AUDIT-003.

## SCA snapshot

```
npm audit
found 0 vulnerabilities (after override)

prod=377, dev=589, optional=119, peer=24, total=1006
```

## Zero-Trust and code-quality spot check

Re-checked the items most likely to drift after a maintenance release:

- Input validation at agent tool boundaries (read/edit/write/append): unchanged.
- File path resolution still routes through the GlobalFileService vault adapter; no direct `fs` calls on user-supplied paths in the FIX-01-07-03 diff.
- No new `eval`, `Function`, `child_process`, or dynamic import patterns added in the diff.
- No new `console.log`/`console.info` (Review-Bot rule); the new helper uses `console.warn` for fail paths only.
- No `any` types in the new helper; `view instanceof MarkdownView` guard before editor access.

## Summary

| Severity | Confirmed | Resolved | Deferred |
|----------|-----------|----------|----------|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 1 | 1 | 0 |
| Low | 0 | 0 | 0 |
| Info | 0 | 0 | 0 |
| **Total** | **1** | **1** | **0** |

**Positive findings:**

- The existing override pattern caught the qs CVE in one minimal edit, with no semver bump on the parent (`express`, `body-parser`) and no code change in `src/`.
- FIX-01-07-03 fix surface is tightly scoped (one new helper, four call-sites), no new attack surface introduced, fail-closed error handling.
- `npm audit` baseline was already at 1 moderate before this release; no regression introduced by the 2.12.x line.

## Release recommendation

**Green.** 2.12.3 is already published. The override patch raises the audit verdict to "0 vulnerabilities" without re-spinning the release; ship the override change on the next dev cycle (no urgency, no exploit path in our deployment, the published 2.12.3 plugin runs `qs@6.15.1` on end-user installs but cannot be remotely triggered into the vulnerable path).

## Action items

1. Commit the package.json override and refreshed package-lock.json on the dev branch as a chore commit (`chore(audit): AUDIT-031 fixes -- qs override 6.15.2`). No version bump required; ships passively with the next release.
2. Close Dependabot alert #52 with "fixed via override" once the commit reaches `main` and the next sync runs.
3. No backlog entries created (no deferred findings).
