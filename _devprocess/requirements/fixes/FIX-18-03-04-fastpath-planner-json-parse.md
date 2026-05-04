# BUG-024: FastPath planner JSON parse fails -- recipe aborts mid-task

> **Priority:** P2
> **Epic:** EPIC-18 / ADR-61 (Fast Path Execution)
> **Date:** 2026-04-19
> **Discovered:** Wave-4 BRAT test for BUG-020 against GitHub Copilot Sonnet 4.6

## Problem

FastPath's Stage-1 planner issues a structured JSON request to the LLM
and `JSON.parse` the response before executing the recipe. On Copilot
Sonnet 4.6 the planner output sometimes starts with a non-JSON preamble
(prose explanation, markdown fence, or trailing trailing content) and
the parse throws:

```
[FastPath] Planner call failed: SyntaxError: Unexpected non-whitespace
character after JSON at position 3 (line 2 column 1)
    at JSON.parse (<anonymous>)
    at FastPathExecutor.plannerCall (.../plugin:obsilo-agent:963:31)
```

The error is caught: FastPath logs "No tools executed, falling back to
normal loop" and the task continues through the regular agent path. So
the user-visible impact is lost efficiency (no Fast Path speedup) plus
confusion when the console shows a stack trace.

## Causal Chain

1. User input matches a recipe (e.g. "Orphaned Notes Analysis").
2. FastPathExecutor.plannerCall() sends the planner prompt.
3. LLM responds with `{\n{valid json}\n}\n\nExplanation: ...` or
   similar -- extra tokens after the JSON block.
4. `JSON.parse(raw)` throws because trailing content is not valid JSON.
5. Catch block logs the error, executor returns with 0 tools, normal
   loop takes over.

## Root Cause

The planner relies on `JSON.parse` seeing exactly a JSON document. Some
LLMs ignore the "respond with JSON only" instruction and add natural
language. The parser is too strict for a real-world LLM protocol.

## Fix Direction (for a future wave)

1. **Strip markdown fences** before parse: `content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')`.
2. **Extract first balanced JSON object** via a one-pass scanner (count
   `{`/`}` while skipping string literals) before handing to `JSON.parse`.
3. **Retry once with a stricter "JSON only" re-prompt** on parse failure.

Option 2 + 1 combined is the standard pattern for LLM-JSON pipelines and
costs no extra tokens when the response is already clean.

## Risk

- Current behaviour is safe (caught and falls back). Fix improves UX
  and preserves the Fast Path speedup; no security impact.

## References

- Console trace from Wave-4 BRAT test (2026-04-19).
- Related: ADR-61 (Fast Path Execution).
