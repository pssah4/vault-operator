---
id: ADR-86
title: Inference-Pass-Architektur fuer Derives (Pattern-basierte Memory-Evolution)
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - FEAT-03-24-inference-pass-derives.md
  - ADR-77-memory-v2-storage-schema.md
  - ADR-83-single-call-tool-output-schema.md
triggers:
  - ASR-056 (Inference-Pass als Background-Job)
---

# ADR-86 -- Inference-Pass-Architektur

## Status

Proposed.

## Context

E5-Empfehlung (FEAT-03-24, Supermemory-Differenzierung) verlangt, dass die Engine "derived" Facts aus Patterns in der bestehenden Fact-Sammlung generiert. Beispiel: 3 Facts ueber Sebastian + Plan-Mode + erfolgreiches Outcome -> derived Fact "Sebastian bevorzugt Plan-Mode bei nicht-trivialen Aenderungen". Dieses Pattern ist Supermemorys "Derives"-Konzept.

Triggernde ASR: ASR-056 (Inference-Pass als Background-Job).

Konflikt-Vermeidung: Synchroner Pass pro Conversation waere zu teuer. Token-Cost-Cap (FEAT-03-18) schuetzt vor Cost-Explosion.

## Decision Drivers

- **DD-1 Cost-Effizienz:** Inference-Pass darf Token-Verbrauch nicht explosiv machen
- **DD-2 Genauigkeit:** False-Positive-Patterns wuerden Memory verschmutzen
- **DD-3 User-Souveraenitaet:** User kann inferred Facts loeschen oder bestaetigen
- **DD-4 Reversibilitaet:** Wenn Source-Facts geloescht werden, derived Fact entsprechend behandelt

## Considered Options

### Option 1: Synchroner Inference-Pass nach jedem Single-Call (verworfen)

Bei jedem Fact-Insert ein Inference-Pass.

- + Pro: Sofortige Pattern-Detection
- - Con: Bricht DD-1 (Token-Cost explodiert)
- - Con: Bricht 60s-Throttle (FEAT-03-18)

### Option 2: Background-Job mit Pattern-Threshold + Confidence-Bands (Empfohlen)

Taeglicher Job (oder Plugin-Start wenn > 24h). Pattern-Detection: > 3 verwandte Facts -> LLM-Call. Confidence-Bands fuer Auto-Insert / Pending-Review / Reject.

- + Pro: DD-1 erfuellt -- 1 LLM-Call/Pattern, nicht pro Conversation
- + Pro: DD-2 erfuellt -- Confidence-Bands filtern False-Positives
- + Pro: DD-3 erfuellt -- Pending-Review-Queue + delete_fact-Tool

### Option 3: Real-Time Streaming-Inference (verworfen fuer MVP)

Continuous Watch auf neue Facts, sofortige Pattern-Erkennung.

- + Pro: Schnellste Reaktion
- - Con: Komplex, Background-Worker plus Stream-Verarbeitung
- - Con: Cost-Profil unklar

## Decision

**Option 2 -- Background-Job mit Pattern-Threshold + Confidence-Bands.**

**Job-Trigger:**

- Plugin-Start wenn `last_inference_run_at < now() - 24h`
- Manuelles `/run_inference_pass` Slash-Command (Sebastian-only Trigger)
- Token-Cost-Cap respektiert: wenn Tages-Cap erreicht, Job ueberspringt

**Pattern-Detection-Algorithmus:**

```sql
-- Step 1: Cluster-Kandidaten finden (>3 Facts mit gleicher Entity-URI + Topic-Overlap)
SELECT
    fe.to_external_ref AS cluster_key,
    GROUP_CONCAT(f.id) AS fact_ids,
    COUNT(*) AS fact_count
FROM fact_edges fe
JOIN facts f ON fe.from_fact_id = f.id
WHERE fe.edge_type = 'mentions_entity'
  AND f.is_latest = 1 AND f.deleted_at IS NULL
GROUP BY fe.to_external_ref
HAVING fact_count >= 3;
```

**Pro-Cluster LLM-Call:**

```
Input: N Source-Facts + Topic-Kontext
Prompt: "Erkenne ein Pattern in diesen Facts und generiere optional einen
abstrakteren derived Fact, falls einer aussagekraeftig ist."
Output: Single-Call-Schema (ADR-83) mit `relation: 'derive'`,
        `confidence: 0.0-1.0`, `related_fact_ids: [N Source-Facts]`
```

**Confidence-Bands (analog FEAT-03-18 Conflict-Resolution):**

| Confidence | Aktion |
|---|---|
| >= 0.85 | Auto-Insert mit `kind=preference` (oder LLM-Output), `relation=derive`, Edge `derived_from_pattern` zu Source-Facts. User-Notification "Pattern erkannt: ..." |
| 0.5 - 0.85 | Pending-Review-Queue (FEAT-03-18) -- User bestaetigt oder verwirft |
| < 0.5 | kein Insert, Audit-Log-Eintrag "Pattern verworfen, Confidence zu niedrig" |

**Cascade-Verhalten bei Source-Fact-Loeschung:**

Wenn ein Source-Fact (related_fact_id) soft-deletet wird:

- Wenn `> 50%` der Source-Facts noch aktiv: derived Fact bleibt
- Wenn `<= 50%` der Source-Facts noch aktiv: derived Fact wird als `stale` markiert (`metadata.stale=true`), bleibt aber sichtbar bis User entscheidet
- User kann via `delete_fact` selbst loeschen

**Re-Inference-Trigger:**

Wenn neue Source-Facts hinzukommen, die zum Cluster passen, wird der derived Fact NICHT automatisch upgedated. Stattdessen entsteht ggf. ein neuer derived Fact via `relation=update` zum bestehenden -- bei naechstem Inference-Pass.

**Token-Cost-Cap-Integration:**

Inference-Pass nutzt denselben taeglichen Token-Counter wie Single-Call-Extraction (FEAT-03-18 C5). Wenn Cap erreicht: Job pausiert, log "inference_pass_skipped_cost_cap".

## Consequences

**Positiv:**

- Supermemory-aequivalente "Derives"-Funktion
- Cost-Profil unter Kontrolle
- User-Souveraenitaet via Pending-Review-Queue
- Cascade-Verhalten ist sinnvoll modelliert

**Negativ:**

- Background-Job kann verzoegerte Pattern-Detection erzeugen (max 24h Latenz)
- LLM-Output-Schema-Validierung muss auch fuer Inference-Pass funktionieren
- Cascade-Logic bei 50%-Schwelle ist heuristisch

**Risks:**

- **R-1:** Pattern-Detection-Query auf grossen DBs langsam. **Mitigation:** Index auf `fact_edges(to_external_ref, edge_type)`. Plus `fact_count`-Threshold limitiert Scope.
- **R-2:** LLM-False-Positive-Patterns. **Mitigation:** Eval-Test-Set 10 Pattern-Szenarien, > 70% Auto-Insert-Akzeptanz Quality-Gate.
- **R-3:** Re-Inference-Loop -- ein bestehender derived Fact wird beim naechsten Run wieder als "neu zu deriviereen" gesehen. **Mitigation:** Pre-Filter in Pattern-Detection: ueberspringe Cluster mit bereits existierendem `relation=derive`-Edge zu allen Source-Facts.

## Implementation-Bezug

- FEAT-03-24 implementiert Pattern-Detection + Inference-Pass-LLM-Call
- ADR-83 Single-Call-Output-Schema wird wiederverwendet (Teil der Engine-API)
- Engine-Public-API: `runInferencePass()`, `findPatternCandidates()`, `inferDerivedFact()`

## Open Questions

- Pattern-Threshold (3 Facts default): konfigurierbar via Settings? Default fest, post-MVP Setting.
- Inference-Job-Frequenz: taeglich vs woechentlich? Default taeglich.
- Multi-Hop-Pattern (z.B. "Sebastian bevorzugt X" + "X korreliert mit erfolgreichem Outcome" -> "Sebastian's Erfolgs-Pattern"): post-MVP.
