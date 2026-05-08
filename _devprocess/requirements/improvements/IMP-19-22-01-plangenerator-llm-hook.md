# IMP-19-22-01: planGenerator LLM-Hook + Multi-Turn-Dialog

**Prioritaet:** P1 (FEAT-19-22 ist als Done markiert, Code ist Skelett)
**Feature-Bezug:** FEAT-19-22 (Aktiver Dialog-Ingest), EPIC-19
**Verwandt:** ADR-100 (Dialog-Ingest-State-Storage), FIX-19-28-01

## Problem

`IngestDeepTool.planGenerator` ist heute ein Default-Stub: nimmt die
ersten 5 Absaetze als Take-Aways, baut einen Bullet-Body, kein LLM-
Aufruf. Code-Kommentar [IngestDeepTool.ts:117-148](src/core/tools/vault/IngestDeepTool.ts#L117-L148): "echter Multi-Turn-Dialog kann
spaeter via Conversation-Loop kommen; Hook bleibt offen."

Folge: BA-25 11.2.1 (Modus A Aktiver Dialog) ist im Code nicht
verdrahtet. mode='dialog' wird durchgereicht, aber kein LLM-getriebener
Take-Away-Vorschlag, kein Approval-Loop, keine ingest_session-
Persistenz aus ADR-100.

## Scope

In-Scope:
1. PlanGeneratorRegistry: Plugin-Setting fuer aktiven Plan-Generator
   (Default: LLM-driven, fallback auf Stub).
2. LLM-driven planGenerator-Implementation:
   - Liest Source-Markdown (PdfParser bei PDF, cachedRead bei MD).
   - Single-Pass-LLM-Call mit Take-Away-Extraktions-Prompt.
   - Output: 5-15 strukturierte Take-Aways mit Position-Map.
3. Multi-Turn-Approval-Loop:
   - Take-Aways via askQuestion an User.
   - User-Korrekturen verschmelzen mit dem Plan.
   - 1-3 Runden, dann freeze.
4. ingest_session-Tabelle (ADR-100): Plan-State persistieren, damit
   Dialog session-tolerant ist.

Out-of-Scope:
- Auto-Modus (FEAT-19-23) bekommt eigenes IMP-19-23-01.
- TensionDetection (FEAT-19-13) eigenes IMP-19-13-01.

## Akzeptanzkriterien

| ID | Criterion |
|---|---|
| AC-01 | LLM-Hook produziert 5-15 Take-Aways pro Source mit Anchor-Text und Position-Kind |
| AC-02 | User-Korrekturen werden in Plan integriert, nicht ueberschrieben |
| AC-03 | ingest_session persistiert Plan-State, Resume nach App-Restart funktional |
| AC-04 | Stub-Fallback aktiv wenn kein LLM-Provider konfiguriert |

## Files (vorraussichtlich)

- `src/core/tools/vault/IngestDeepTool.ts`: PlanGenerator-Wahl via
  Plugin-Settings.
- `src/core/ingest/LlmPlanGenerator.ts` (neu)
- `src/core/ingest/IngestSessionStore.ts`: erweitern um Plan-State.
- Tests: end-to-end-mock mit fake LLM-Provider.
