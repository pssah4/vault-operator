---
id: FIX-20-06-02
epic: EPIC-20
feature: FEAT-20-06
adr-refs: []
plan-refs: []
depends-on: [IMP-20-06-01]
audit-refs: [AUDIT-IMP-20-06-01-2026-06-19]
created: 2026-06-19
---

# FIX-20-06-02: Brave/Tavily Source-URLs ungesaeubert im LLM-Prompt (Audit L-1)

## Symptom

Audit-Finding L-1 aus [AUDIT-IMP-20-06-01-2026-06-19.md](../../analysis/AUDIT-IMP-20-06-01-2026-06-19.md). URL-Pfad und Query-String aus Brave/Tavily-Resultaten erreichen den LLM-Prompt unveraendert. Risiko: Query-String oder Path-Segment koennen prompt-injection-aehnliche Sequenzen enthalten.

## Root Cause

`src/core/health/LlmVerifierProvider.ts:85` interpoliert `source.url` direkt ins Prompt-Template ohne Sanitization.

## Fix-Skizze

- `new URL(s)` parsen.
- Nur `${protocol}//${host}${pathname}` einbetten.
- Query+Fragment droppen.
- Bei `new URL()`-parse-fail: source komplett rejecten (nicht raw einbetten).

## Status

P3. Planned. Nicht im Scope des aktuellen MCP-Hotfix-Branches -- gehoert in eine eigene Welle mit AUDIT-IMP-20-06-01 L-2.
