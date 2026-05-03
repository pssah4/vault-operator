---
id: ADR-99
title: Tension-Detection-Algorithmus (Hybrid Cosine + LLM)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-13
---

# ADR-99: Tension-Detection-Algorithmus (Hybrid Cosine plus LLM)

## Context

Tension-Detection (FEAT-19-13) klassifiziert pro Claim der neuen Source: stuetzt-Note-X / widerspricht-Note-Y / neutral / orthogonal. Drei Algorithmus-Familien sind moeglich: pure Cosine-Schwellwerte, pure LLM-Klassifikation pro Claim, oder Hybrid. Token-Kosten bei pure-LLM koennen explodieren (n Claims x m Cluster-Notes = n*m Vergleiche).

## Decision Drivers

- Precision (BA-25 H-09: > 60% Sample-Eval)
- Token-Kosten pro Source (Ziel: 0.10-0.30 USD)
- Skalierbarkeit (Sebastians 1.500-Notes-Vault)
- Implementierungsgeschwindigkeit

## Considered Options

### Option A: Pure Cosine-Schwellwerte

Logik: Claim-Embedding gegen Cluster-Note-Embeddings. Hohe Cosine-Similarity = stuetzt. Niedrige Cosine plus topic-overlap = widerspricht. Sonst neutral/orthogonal.

Pros:
- Kein LLM-Call, null Token-Kosten.
- Schnell.

Cons:
- Cosine misst Aehnlichkeit, nicht semantische Beziehung. "X ist gut" und "X ist schlecht" haben hohe Cosine aber widersprechen sich.
- Precision wird unter Ziel bleiben.

### Option B: Pure LLM-Klassifikation pro Claim x Note

Logik: pro Claim ueber alle Match-Cluster-Notes ein LLM-Call zur Klassifikation.

Pros:
- Hoechste Precision.

Cons:
- Token-Kosten skalieren n*m. Bei 5 Claims plus 20 Cluster-Notes = 100 LLM-Calls pro Source.
- Geschwindigkeit: viel langsamer als 0.30 USD-Budget.

### Option C: Hybrid Cosine-Pre-Filter plus LLM-Klassifikation auf Top-K

Logik: pro Claim Cosine-Lookup -> Top-3 Cluster-Notes mit hoechster Aehnlichkeit. Dann ein LLM-Call mit Claim plus 3 Note-Excerpten zur Klassifikation.

Pros:
- Token-Kosten kontrollierbar (1 LLM-Call pro Claim, nicht pro Note-Vergleich).
- Cosine-Filter findet plausible Kandidaten in Millisekunden.
- Precision durch LLM-Call.

Cons:
- Wenn Cosine-Top-3 die echte widersprechende Note nicht enthaelt, wird Tension uebersehen.
- Komplexere Implementation.

## Decision

**Option C**: Hybrid. Cosine-Pre-Filter Top-3 plus LLM-Klassifikation pro Claim.

Begruendung:
- Token-Budget-Realistik: 5 Claims x 1 LLM-Call mit ~1k Token Input = ~5k Token = ~0.005 USD Haiku. Im Budget.
- Cosine-Top-3 deckt > 80% der echten Tension-Faelle ab (Annahme, zu validieren in Sample-Eval).
- Wenn Sample-Eval < 60% Precision zeigt: K von 3 auf 5 oder 10 erweitern (Token-Kosten skalieren linear).

## Consequences

### Positive
- Token-Kosten im Budget.
- Precision durch LLM, nicht durch Cosine.
- Schnell genug fuer Deep-Ingest-Pipeline.

### Negative
- Verpasst Tension wenn echte widersprechende Note ausserhalb Top-3 Cosine.
- Bei sehr grossem Cluster (zB 100+ Notes) ist Top-3 zu eng.

### Risks
- Bei Sample-Eval < 60% Precision: K erweitern oder Algorithmus revidieren. Mitigation: Telemetrie pro Tension-Decision (ja/nein/dismissed) zur Precision-Beobachtung.

## Implementation Notes

Pipeline pro Claim:
1. Embed Claim-Text (reuse EmbeddingService).
2. SQL-Query: Top-3 Cluster-Notes per Cosine (reuse 4-Stufen-Pipeline-Stage 1 Helper).
3. LLM-Call mit Schema:
   ```
   { claim: "...", candidate_notes: [{path, summary, excerpt}], output: { relationship: "supports|contradicts|neutral|orthogonal", target_note_path?: string, confidence: 0-1, rationale: string } }
   ```
4. Wenn relationship in {supports, contradicts}: Marker-Inline-Callout im Sense-Making-Note schreiben.
5. Wenn confidence < threshold (default 0.6): kein Marker, Skip.
