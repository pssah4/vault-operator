# IMP-19-23-01: Auto-Modus mit echtem LLM-Plan

**Prioritaet:** P2 (Auto-Modus ist Convenience, Dialog-Modus ist primaer)
**Feature-Bezug:** FEAT-19-23 (Auto-Ingest-Modus), EPIC-19
**Abhaengig von:** IMP-19-22-01 (LLM-Hook in planGenerator)

## Problem

FEAT-19-23 ist als Done markiert, aber der Auto-Modus (mode='auto') in
`IngestDeepTool` nutzt denselben Default-Stub-Planner wie der Dialog-
Modus -- erste 5 Absaetze als Take-Aways. Kein LLM-driven Plan, keine
Default-Annahme zu Output-Modus / Cluster.

## Scope

Setzt auf IMP-19-22-01 auf. Sobald der LLM-PlanGenerator existiert:

1. Auto-Modus skippt User-Approval-Loop (BA-25 11.2.2 Schritt 2).
2. Default-Annahmen aus Settings:
   - Output-Modus aus `vaultIngest.defaultOutputMode`.
   - Cluster aus Triage-Empfehlung (FEAT-19-12).
   - Take-Away-Auswahl: alle vom LLM extrahierten.
3. Notification "Source X ingestiert, Y Notes erstellt, Z Notes
   beruehrt" mit Link zum Health-Modal-Tab "Recent Ingests".

## Akzeptanzkriterien

| ID | Criterion |
|---|---|
| AC-01 | Auto-Modus nutzt LLM-PlanGenerator, nicht den Stub |
| AC-02 | Kein Approval-Loop, persistente Output-Schreibung |
| AC-03 | Notification erscheint nach Auto-Run mit Link zum Modal |

## Files

- `src/core/tools/vault/IngestDeepTool.ts`: Auto-Pfad nutzt selben
  PlanGenerator wie Dialog-Modus, mode-aware.
- `src/core/ingest/DeepIngestPipeline.ts`: Mode-Awareness fuer
  Approval-Skip.
