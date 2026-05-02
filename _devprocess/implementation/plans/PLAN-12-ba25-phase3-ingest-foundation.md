---
id: PLAN-12
title: BA-25 Phase 3 Ingest-Foundation
date: 2026-05-03
status: Active
feature-refs: [FEAT-19-12, FEAT-19-22, FEAT-19-24, FEAT-19-25, FEAT-19-27, FEAT-19-28]
adr-refs: [ADR-93, ADR-98, ADR-100, ADR-101, ADR-102, ADR-103]
pair-id: sebastian-opus-4.7
---

# PLAN-12: BA-25 Phase 3 Ingest-Foundation

## Kontext

Backend-Layer fuer Karpathys Pattern. Triage, Dialog-State, Output-Modi, Auto-Trigger, Block-IDs.

**Architektur-Entscheidung:** dieser PLAN liefert Service-Layer plus Stores plus Helpers. Konkretes Tool-Wiring (Tool-Definition `ingest_triage`, ContextComposer-Integration, Plugin-Onload-Wiring) bleibt zusammen mit den Settings-UI-Erweiterungen fuer eine Folge-Session, weil die Tool-Definition tief in den Tool-Registry-Layer eingreift und besser in einem Pass mit dem Plugin-Wiring landet.

## Tasks

| Task | Status | Files |
|------|--------|-------|
| 1 IngestSessionStore (ADR-100) | Done | IngestSessionStore.ts + IngestStores.test.ts |
| 2 IngestTriageLogStore (ADR-98 + ADR-102) | Done | IngestTriageLogStore.ts + IngestStores.test.ts |
| 3 BlockIdSetter (deterministische ^block-N, ADR-103) | Done | BlockIdSetter.ts + BlockIdSetter.test.ts |
| 4 OutputModeGenerator (3 Modi, Folder-Layout, ADR-101) | Done | OutputModeGenerator.ts (FrontmatterRenderer inline) |
| 5 AutoTriggerObserver (vault.on-Listener, ADR-102) | Done | AutoTriggerObserver.ts |
| 6 ingest_triage Tool-Definition + Plugin-Wiring | Deferred | TBD: src/core/tools/ingest/IngestTriageTool.ts + main.ts onload |
| 7 Dialog-Modus-Implementation im Chat-Sidebar | Deferred | UI-Layer-Aufwand, separater Pass |
| 8 PDF-Strategie-Switch in OutputModeGenerator (page-refs vs markdown-mirror) | Deferred | optional, default page-refs schon implizit (Source-Note bleibt md, PDF wird separat gehalten) |

## Coverage Gate

| SC | Mapped to Task |
|----|--------|
| FEAT-19-12 SC-01..05 (Triage-Pass) | Task 1+2 (Stores) plus Task 6 (Tool-Wiring deferred) |
| FEAT-19-22 SC-01..05 (Dialog-Modus) | Task 1 (State) plus Task 7 (UI deferred) |
| FEAT-19-24 SC-01..05 (Output-Modi) | Task 4 |
| FEAT-19-25 SC-01..05 (Folder-Konfig) | Task 4 (OutputFolderConfig) |
| FEAT-19-27 SC-01..05 (Auto-Trigger) | Task 5 |
| FEAT-19-28 SC-01..05 (Source-Position-Marker) | Task 3 (BlockIdSetter) plus Task 4 (Inline-Anwendung) |

## ADR-Alignment

- ADR-93 Source-Identitaet (Domain-only): bereits in PLAN-10 (cluster_source_stats). Keine PLAN-12-Aenderung.
- ADR-98 Pre-Triage-Tool-Architektur (eigenes Tool): operationalisiert via IngestTriageLogStore und OutputModeGenerator, Tool-Definition Deferred.
- ADR-100 Dialog-State-Storage: IngestSessionStore.
- ADR-101 Output-Modus-Architektur: OutputModeGenerator (3 Modi, Bibliografie mit Base-Codeblock, Folder-Konfig).
- ADR-102 Auto-Trigger-Detection: AutoTriggerObserver (vault.on('create'+'modify')).
- ADR-103 Source-Position-Marker: BlockIdSetter (System-generated `^block-N`, idempotent).

## Change Log

- 2026-05-03 initial: PLAN persistiert nach Implementation-Pass.
- 2026-05-03 partial-completion: Tasks 1-5 (Backend-Layer) implementiert. Tasks 6-8 (Tool-Wiring, Dialog-UI, PDF-Strategie-Switch) deferred. PLAN bleibt Status=Active.

## Implementation Notes

**Test-Count-Delta:** +27 (8 BlockIdSetter + 9 IngestSessionStore + 10 IngestTriageLogStore).

**ADR-Status nach Session:**
- ADR-98: Proposed -> Accepted (Tool-Architektur durch Stores operationalisiert).
- ADR-100: Proposed -> Accepted (IngestSessionStore implementiert).
- ADR-101: Proposed -> Accepted (3 Modi inkl. Bibliografie+Base implementiert).
- ADR-102: Proposed -> Accepted (AutoTriggerObserver implementiert).
- ADR-103: Proposed -> Accepted (BlockIdSetter implementiert).

**Build:** gruen, deployed.
