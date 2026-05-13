---
id: FIX-04-03-04
feature: FEAT-04-03
epic: EPIC-04
adr-refs: []
plan-refs: []
audit-refs: [AUDIT-023]
depends-on: [FIX-04-03-02, FIX-04-03-03]
created: 2026-05-13
---

# FIX-04-03-04: AUDIT-023 fix-loop bundle

## Symptom

AUDIT-023 (2026-05-13) ran on the 10 backlog items merged into `dev`
since v2.7.3 plus the open GitHub Security alerts (Dependabot
#47/#48/#49, code-scanning #66/#67/#68). The audit produced one P2
SCA finding, four actionable P3 findings, and one P3 deferred to
IMP-04-03-05. This FIX captures the five resolved findings.

## Resolved findings

### M-1 (P2): mermaid devDependency CVE chain

`mermaid@^11.14.0` is referenced by Dependabot #47, #48, #49 plus the
auto-dismissed GHSA-6m6c-36f7-fhxh (CVE-2026-41150). All four CVEs
are patched in mermaid 11.15.0.

- npm-audit before: 1 moderate (4 advisories on `mermaid`).
- npm-audit after the bump: 0 vulnerabilities.
- Mermaid is a devDependency only (used by VitePress docs build),
  so the plugin bundle itself was never affected.

### L-1 (P3): createNodeFetch had no socket-idle timeout

`src/api/providers/openai.ts:76-143`. The Node.js http(s) request
ran without a socket timeout. A misbehaving server that accepts the
connection and then never writes a response kept the socket open
until the user hit Stop.

Added `req.setTimeout(120_000, ...)` before the AbortSignal hookup,
plus `req.setTimeout(0)` in the response callback so the timeout
applies to the connect/idle phase only, not the streaming phase.

### L-2 (P3): ListPinnedConversationsTool surfaced raw SQL error text

`src/core/tools/vault/ListPinnedConversationsTool.ts:81-84`. The
catch block wrote the exception's `message` into the tool result,
which could leak SQLite schema details (column / table names) to the
LLM and the chat surface.

Raw `e` now goes to `console.warn` for the developer console; the
tool result returns the generic `Failed to query pinned conversations.`.
The matching test (`returns a generic tool_error when the DB query
throws`) was updated to assert the synthetic-error string is NOT
present in the tool result.

### L-4 (P3): FactExporter.escapeMarkdown skipped backslashes (code-scanning #66)

`src/core/memory/FactExporter.ts:148`. The function replaced
newlines and backticks but left backslashes alone, so a fact value
ending in `\` followed by a backtick produced `\\`` and broke out of
the surrounding inline-code span.

The function now escapes backslashes FIRST, then backticks. Order
matters: if backticks were processed first, the inserted `\` would
itself get doubled, producing `\\\``.

### L-5 (P3): two U+2014 em-dashes in code comments

`src/types/model-registry.ts:251` (JSDoc body) and `:262` (inline
comment). The project's CLAUDE.md forbids em-dashes anywhere; both
occurrences were introduced today as part of FIX-04-03-02. Replaced
with a comma and a colon respectively. The other em-dashes in the
same file pre-date today's work and stay out of scope for this fix.

## Regression posture

- 1490 tests passing (no test count delta from the audit; the L-2
  regression test was updated in place).
- npm-audit: 0 vulnerabilities (was 1 moderate with 4 advisories).
- Lint clean for the touched files.
- Build and deploy green.

## Out of scope (deferred)

- **L-3 (SSRF-shape):** deferred to IMP-04-03-05. The widened
  `createNodeFetch` lets the renderer reach hosts that the
  browser-side fetch could not reach, but the user is the sole
  initiator and TLS validation still applies. The IMP captures a UX
  nudge (Models-tab warning + confirm modal) for plain-HTTP remote
  targets.
- Code-scanning #67 (`Math.random()` fallback) and #68 (URL
  substring check in test code): both false positives. Documented
  as Info findings in AUDIT-023 (I-8 and I-9), no code change.

## Status

Done 2026-05-13. AUDIT-023 verdict moves from "Low risk, four
actionable Lows plus one Medium" to "Low risk, all actionable
findings resolved, one Low deferred as IMP-04-03-05."
