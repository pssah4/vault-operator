---
id: PLAN-11
title: BA-25 Phase 2 Lint-Foundation
date: 2026-05-03
feature-refs: [FEAT-19-16, FEAT-19-17, FEAT-19-18]
adr-refs: [ADR-94, ADR-106]
pair-id: sebastian-opus-4.7
---

# PLAN-11: BA-25 Phase 2 Lint-Foundation

## Kontext

Stufe-1 des Lint-3-Stufen-Stacks (BA-25 Section 12). Lokale Berechnung, kein LLM-Call. Erweitert VaultHealthService um zwei neue Check-Types: cluster_freshness (FEAT-19-16, ADR-94) und source_concentration (FEAT-19-17, ADR-93).

Health-Modal-UI-Erweiterung (FEAT-19-18) bleibt fuer Folge-Session deferred (UI-Aufwand groesser als Backend-Logik).

## Tasks

| Task | Status | Files |
|------|--------|-------|
| 1 FreshnessScorer (Composite-Score-Helper) | Done | src/core/health/FreshnessScorer.ts plus 6 Tests |
| 2 HealthCheckType-Erweiterung um cluster_freshness und source_concentration | Done | VaultHealthService.ts (Type, runChecks-Switch, 2 private Check-Methoden) |
| 3 BA-25-Check-Tests | Done | VaultHealthService.ba25-checks.test.ts (9 Tests) |
| 4 Health-Modal-UI-Erweiterung (Severity-Tabs, Filter, Bulk-Dismiss, Action-Buttons) | Deferred | UI-Layer, separate Session |

## Coverage Gate

| SC | Mapped to Task |
|----|--------|
| FEAT-19-16 SC-01 (Score-Berechnung lokal, 0 Token) | Task 1 + 2 |
| FEAT-19-16 SC-02 (Score nach Formel) | Task 1 (Tests) |
| FEAT-19-16 SC-03 (Findings im Health-Modal) | Task 2 (im Findings-Array) |
| FEAT-19-16 SC-04 (Schwellwerte konfigurierbar) | Task 1 (FreshnessScorerOptions) |
| FEAT-19-16 SC-05 (dismissed_health_findings reused) | Task 2 (existing dismiss-Logik in runChecks) |
| FEAT-19-17 SC-01 (Concentration > 0.7 + 5 Notes) | Task 2 |
| FEAT-19-17 SC-02 (Output zeigt Cluster + Domain + Score) | Task 2 (description + metadata) |
| FEAT-19-17 SC-03 (Anti-Echo-Action verfuegbar) | Task 4 (Deferred, UI) |
| FEAT-19-17 SC-04 (Findings dismissable) | Task 2 (existing dismiss-Logik) |
| FEAT-19-17 SC-05 (0 LLM-Calls) | Task 2 (SQL-only) |
| FEAT-19-18 SC-01..05 (Modal-UI) | Task 4 (Deferred) |

## ADR-Alignment

- ADR-94 (Halbwertszeit-Modell): operationalisiert durch FreshnessScorer plus VaultHealthService.checkClusterFreshness (nutzt cluster_metadata.half_life_days, Default 180 fuer fehlende Eintraege).
- ADR-106 (Severity-Modell): operationalisiert durch Severity-Mapping (score < 30 = high, 30-50 = medium, sonst low). Source-concentration: 0.85+ = high, sonst medium.

## Change Log

- 2026-05-03 initial: PLAN created plus implementiert in einer Session. Status Draft -> Active -> Done.
- 2026-05-03 Task 4 (Modal-UI) deferred: Backend-Logik komplett, UI-Erweiterung in Folge-Session zusammen mit PLAN-12 Triage-Karte und PLAN-13 Hot-Cluster-Settings (UI-Aufwand bundeln).

## Implementation Notes

**Test-Count-Delta:** +15 (6 FreshnessScorer + 9 VaultHealthService BA-25).

**ADR-Status nach Session:**
- ADR-94: bereits Accepted (PLAN-10).
- ADR-106: Proposed -> Accepted (Severity-Mapping implementiert).

**Build:** gruen, deployed.
