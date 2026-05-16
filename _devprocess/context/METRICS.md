# Project Metrics (Memory v2 + UCM)

> Append-additive Signal-Layer fuer V-Model-Workflow.
> Schreibende Skills: /coding, /business-analysis, /dia-guide, /architecture, /testing.

## Drift count (plan-context.md vs. real code)

| Date | ADRs reviewed | arc42 sections | plan-context items | Drift flagged | Drift resolved | Open | Reviewer |
|------|---------------|----------------|---------------------|---------------|----------------|------|----------|
| 2026-04-26 | 12 (ADR-76 bis 087) | 1 (Section 5.9.1) | 12 | 4 | 4 | 0 | /coding Phase 2 |
| 2026-05-12 | 4 (ADR-12, ADR-62, ADR-63, ADR-111 inkl. Amendments) | 0 | 8 (FEAT-24-01/02/03, FIX-24-01-01/03-01/03-02, IMP-24-05-01, IMP-18-01-02) | 1 (ADR-62-Amendment-Impl-Note nennt die `── CACHE BREAKPOINT ──`-Kommentarzeile als Split-Anker, aber dieser Kommentar steht nicht im gerenderten System-Prompt-String -> Split braucht einen echten Sentinel) | 1 (in PLAN-18 Task 4 aufgeloest: exportierte `CACHE_BREAKPOINT_MARKER`-Konstante zwischen Section 8 und 9 emittieren, Provider splittet daran und strippt sie) | 0 | /coding Phase 2 (EPIC-24 Welle 1) |
| 2026-05-16 | 3 (ADR-120, ADR-121, ADR-115-Amendment) | 0 | 1 (plan-context-epic26.md) | 1 (Plan-Text spricht von Top-Level-Feld `providers: ProviderConfig[]`; Legacy `providers: Record<string, LLMProvider>` belegt den Key) | 1 (F-4: neues Feld in PLAN-24 + ADR-Implementation-Notes auf `providerConfigs[]` umbenannt; Legacy bleibt unangetastet -- keine silent Schema-Migration nötig) | 0 | /coding Phase 2 (EPIC-26 Welle 1) |

## Cycle time per FEATURE

| FEATURE ID | Started | Completed | Cycle time | Scope | Notes |
|---|---|---|---|---|---|
| FEAT-26-01 (Welle 1 Backend) | 2026-05-15 (BA-Pass) | 2026-05-16 (Code) | 1 Tag | Advisor-Pattern Engine -- Tool + Profile + Tier-Resolver + Prompt-Reminder + Cost-Log mode-Tag | Backend-Scope; UI-SC-07 deferred zu Welle 2 FEAT-26-05 |
| FEAT-26-02 (Welle 1 Backend) | 2026-05-15 (BA-Pass) | 2026-05-16 (Code) | 1 Tag | Tier-Klassifikator + DiscoveryService (Pattern + Capability + OpenRouter-Pricing, 24h-Cache) | Production-Fetcher-Wiring + UI-Toggles bleiben Welle 2 PLAN-25 |

## Phase transition counts

| Date | Item | Phase from -> to | Notes |
|---|---|---|---|
| 2026-05-16 | PLAN-24 | Active -> Done | EPIC-26 Welle 1 Engine komplett, Übergang nach /testing geplant |
| 2026-05-16 | ADR-120 | Proposed -> Accepted | Implementation deckt Decision; Beta-Validation H-03 ausstehend |
| 2026-05-16 | ADR-121 | Proposed -> Accepted | Classifier 49 Tests grün, Pattern-Tabelle aktiv |

## Cross-phase trigger counts

| Date | PLAN | Trigger | Artifact | Notes |
|---|---|---|---|---|
| 2026-05-16 | PLAN-24 | design | F-4 -- `providers` Namens-Kollision | Beim Phase-2-Reconciliation entdeckt; Top-Level-Feld zu `providerConfigs[]` umbenannt, Plan-Text + ADR-Notiz aktualisiert. Kein Code-Pivot, additiv. |
