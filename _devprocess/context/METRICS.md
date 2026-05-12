# Project Metrics (Memory v2 + UCM)

> Append-additive Signal-Layer fuer V-Model-Workflow.
> Schreibende Skills: /coding, /business-analysis, /dia-guide, /architecture, /testing.

## Drift count (plan-context.md vs. real code)

| Date | ADRs reviewed | arc42 sections | plan-context items | Drift flagged | Drift resolved | Open | Reviewer |
|------|---------------|----------------|---------------------|---------------|----------------|------|----------|
| 2026-04-26 | 12 (ADR-76 bis 087) | 1 (Section 5.9.1) | 12 | 4 | 4 | 0 | /coding Phase 2 |
| 2026-05-12 | 4 (ADR-12, ADR-62, ADR-63, ADR-111 inkl. Amendments) | 0 | 8 (FEAT-24-01/02/03, FIX-24-01-01/03-01/03-02, IMP-24-05-01, IMP-18-01-02) | 1 (ADR-62-Amendment-Impl-Note nennt die `── CACHE BREAKPOINT ──`-Kommentarzeile als Split-Anker, aber dieser Kommentar steht nicht im gerenderten System-Prompt-String -> Split braucht einen echten Sentinel) | 1 (in PLAN-18 Task 4 aufgeloest: exportierte `CACHE_BREAKPOINT_MARKER`-Konstante zwischen Section 8 und 9 emittieren, Provider splittet daran und strippt sie) | 0 | /coding Phase 2 (EPIC-24 Welle 1) |
