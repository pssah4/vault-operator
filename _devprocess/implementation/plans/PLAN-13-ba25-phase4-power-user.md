---
id: PLAN-13
title: BA-25 Phase 4 Power-User-Erweiterungen (Backend)
date: 2026-05-03
feature-refs: [FEAT-19-10, FEAT-19-11, FEAT-19-13, FEAT-19-14, FEAT-19-19, FEAT-19-21, FEAT-19-23, FEAT-19-26, FEAT-19-29, FEAT-19-30]
adr-refs: [ADR-95, ADR-96, ADR-99, ADR-104, ADR-106]
pair-id: sebastian-opus-4.7
---

# PLAN-13: BA-25 Phase 4 Power-User-Erweiterungen

## Kontext

Backend-Layer fuer P1-Features: Backfill-Job, Tension-Detection (Hybrid), MOC-Marker-Pflege. Stufe-2-Activity-Trigger plus Hot-Cluster-Settings plus Auto-Ingest-Modus B plus Bibliografie-Integration sind Wiring/UI-Aufgaben und werden mit dem Plugin-Onload-Pass gebuendelt.

## Tasks

| Task | Status | Files |
|------|--------|-------|
| 1 FrontmatterBackfillJob mit Pause/Resume/Abort + Progress | Done | FrontmatterBackfillJob.ts |
| 2 TensionDetector (Hybrid Cosine + LLM, ADR-99) | Done | TensionDetector.ts (mit Test) |
| 3 MOCMaintainer mit Marker-Konvention (ADR-96) | Done | MOCMaintainer.ts (mit Test) |
| 4 Stufe-2 ActivityTrigger | Deferred | Plugin-Onload-Pass |
| 5 HotClusterSettings UI | Deferred | UI-Layer |
| 6 AutoIngestMode (Modus B) Pipeline | Deferred | Plugin-Wiring |
| 7 Bibliografie + Multi-Zettel-Pipeline-Integration | Deferred | Plugin-Wiring (OutputModeGenerator vorhanden) |

## Coverage Gate

| SC | Mapped to Task |
|----|--------|
| FEAT-19-10 SC-01..05 (Backfill, Default OFF, kein Ueberschreiben) | Task 1 |
| FEAT-19-11 SC-01..05 (MOC-Pflege Marker) | Task 3 (Helper) plus Wiring (Deferred) |
| FEAT-19-13 SC-01..05 (Tension-Detection > 60% Precision) | Task 2 |
| FEAT-19-14 SC-01..05 (Concentration-Warning + Anti-Echo) | Existing PLAN-11 source_concentration check + Wiring (Deferred) |
| FEAT-19-19 SC-01..05 (Stufe-2 Activity-Trigger) | Task 4 (Deferred) |
| FEAT-19-21 SC-01..05 (Hot-Cluster-Settings UI) | Task 5 (Deferred) |
| FEAT-19-23 SC-01..05 (Auto-Modus B Pipeline) | Task 6 (Deferred) |
| FEAT-19-26 SC-01..05 (Dialog-MOC-Update) | Task 3 (Helper) plus Wiring (Deferred) |
| FEAT-19-29 SC-01..05 (PDF-Strategie) | Default page-refs durch OutputModeGenerator. Markdown-Mirror Deferred |
| FEAT-19-30 SC-01..05 (Bibliografie + Base-Block) | OutputModeGenerator (PLAN-12). Wiring (Deferred) |

## Implementation Notes

**Test-Count-Delta:** +12 (6 TensionDetector, 6 MOCMaintainer).

**ADR-Status:**
- ADR-95: bereits Accepted (PLAN-10).
- ADR-96 (MOC-Marker): Proposed -> Accepted.
- ADR-99 (Tension-Hybrid): Proposed -> Accepted.
- ADR-104 (Web-Search BYOK): Proposed -> Accepted (kein Code-Aufwand, ADR alleine reicht; Wiring nutzt existing FEAT-04-02).
- ADR-106: bereits Accepted (PLAN-11).
