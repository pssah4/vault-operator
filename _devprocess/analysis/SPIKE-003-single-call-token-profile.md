---
id: SPIKE-003
title: Single-Call Token-Profil (Approximation aus Benchmark + Pricing)
status: Provisional Green (formaler Test deferred zu Phase 4 / FEATURE-0318)
date: 2026-04-27
related:
  - ADR-083-single-call-tool-output-schema.md
  - FEATURE-0318-single-call-update-pipeline.md
  - PLAN-002-phase-0-spikes.md
---

# SPIKE-003 -- Single-Call Token-Profil

## Ziel

Klaeren: Bleibt Single-Call-Extraction nach ADR-083-Schema mit Claude Haiku 4.5 unter dem Mem0-Benchmark-Ziel von ~1500 Tokens pro Memory-Operation?

## Methodik (Approximation, ohne echten API-Call)

User-Entscheidung: echter Test deferred zu Phase 4 (FEATURE-0318), wo Single-Call-Pipeline ohnehin implementiert wird. Approximation aus drei Datenpunkten:

### Datenpunkt 1: Mem0 April-2026-Benchmark

- A-MEM Paper (arxiv 2502.12110): ~1200 Tokens pro Memory-Operation, 85-93% Reduktion gegenueber naiver Methoden
- Mem0 April-2026-Update: hierarchische single-pass Extraction, ~1500 Tokens pro Op
- Quelle: [Mem0 Research](https://mem0.ai/research)

### Datenpunkt 2: ADR-083-Schema-Schaetzung

Token-Komponenten pro Single-Call:

| Komponente | Geschaetzte Tokens | Bemerkung |
|---|---|---|
| System-Prompt + Tool-Calling-Schema | 600-900 | Schema mit ~30 Feldern, Beispielen |
| Conversation-Content (Median) | 1500-3000 | Sebastian's typische Conversation |
| Conversation-Content (95th percentile) | 8000-15000 | Lange Coding-Sessions |
| Output-Tokens | 200-500 | Strukturierter JSON mit 3-10 Facts |
| **Total Median** | **~2500** | Ueber Target, aber im akzeptablen Bereich |
| **Total p95** | **~10000** | Lang, aber durch Cost-Cap (FEATURE-0318) abgesichert |

### Datenpunkt 3: Claude Haiku 4.5 Pricing

- Input: $1/Mio Tokens
- Output: $5/Mio Tokens
- Cost pro Single-Call (Median): (~2000 Input * $1 + ~400 Output * $5) / 1M = **$0.004**
- Cost pro Single-Call (p95): (~9500 Input * $1 + ~500 Output * $5) / 1M = **$0.012**
- Sebastian's geschaetzte Use: 5-10 memory-eligible Conversations/Tag = $0.02-0.12/Tag

Token-Cost-Cap (FEATURE-0318 C5) Default 1M Input + 200K Output = $2/Tag. Decken 100x typische Use ab. Bei runaway-Bug greift der Cap.

## Bewertung

**Schaetzung liegt etwas ueber dem 1500-Token-Ideal**, aber im akzeptablen Korridor:

- Median ~2500 Tokens vs Mem0-Ziel 1500: 67% Aufschlag
- Begruendung: ADR-083-Schema ist umfangreicher (Single-Call ersetzt 2-3 Calls heute, traegt also mehr Output-Felder)
- Mem0 macht hierarchische Extraktion ueber mehrere Passes -- moeglich post-MVP-Optimierung

**Cost-Profil ist kein Showstopper.** Sebastian's monatlicher Memory-Cost geschaetzt $0.50-3, plus durch Cost-Cap Auto-Disable bei Bug-Loop geschuetzt.

## Risiken

- **R-1: Schema-Validation-Fehler unbekannt.** Anthropic Tool-Calling ist generell robust, aber lange Conversations koennen Output-Truncation triggern. Phase-4-Eval mit 5 echten Conversations entscheidet.
- **R-2: Output-Quality nicht messbar in Approximation.** Erst Phase-4-Eval mit LLM-as-Judge auf Reference-Outputs.
- **R-3: Schema-Reduktion-Bedarf.** Wenn p95 doch ueber 5000 Tokens kippt, ADR-083 reduziert (z.B. mentions-Liste optional, weniger Felder).

## Konsequenz fuer ADR-083

**Schema bleibt wie spezifiziert.** Phase 4 (FEATURE-0318) implementiert + misst real. Schema-Reduktion wird Backlog-Item wenn Token-Profil signifikant ueber Schaetzung kippt.

## Status-Pfad

| Datum | Status | Bemerkung |
|---|---|---|
| 2026-04-27 | Provisional Green | Approximation aus Benchmarks + Pricing |
| (Phase 4) | Final Green oder Schema-Reduktion | nach echtem Test mit Sebastians Conversations + Claude Haiku 4.5 |
