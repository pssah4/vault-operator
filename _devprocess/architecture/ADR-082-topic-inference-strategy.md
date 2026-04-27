---
id: ADR-082
title: Topic-Inference-Strategie -- lokale Centroids, Soft-Lock, Cold-Start-Fallback
status: Accepted
phase: Building
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - ADR-077-memory-v2-storage-schema.md
  - FEATURE-0317-dynamic-context-composition.md
  - FEATURE-0318-single-call-update-pipeline.md
triggers:
  - ASR-007 (Topic-Inference ohne LLM-Call beim Conversation-Start)
  - ASR-019 (Soft-Topic-Lock mit Drift-Detection)
  - ASR-008 (ContextComposer-Output deterministisch)
---

# ADR-082 -- Topic-Inference-Strategie

## Status

Proposed.

## Context

Memory v2 muss bei jedem Conversation-Start die relevanten Topical-Facts in den System-Prompt komponieren. Topic-Klassifikation ist Voraussetzung. Naive Loesung waere ein LLM-Call beim Conversation-Start ("welche Topics behandelt diese Conversation?"), aber das erzeugt 500-1500ms Time-To-First-Token-Aufschlag plus Token-Cost pro Conversation.

Triggernde ASRs: ASR-007 ("kein LLM-Call beim Conversation-Start"), ASR-019 ("Soft-Topic-Lock"), ASR-008 ("Output deterministisch").

Plus: FEATURE-0318 Single-Call-Extraction generiert bereits Topics fuer neue Facts. Diese sind in `facts.topics` gespeichert. `known_topics`-Tabelle hat `centroid_embedding` (siehe ADR-077).

## Decision Drivers

- **DD-1 Latenz:** Conversation-Start muss < 800ms p95 TTFT bleiben (NFR aus FEATURE-0317)
- **DD-2 Cost:** kein zusaetzlicher LLM-Call pro Conversation, nur Single-Call-Extraction beim Re-Extract
- **DD-3 Genauigkeit:** Topic-Match muss > 70% praezise sein (sonst werden falsche Facts injiziert)
- **DD-4 Cold-Start:** Bei < 5 Facts pro Topic ist Centroid-Inference instabil, Fallback noetig

## Considered Options

### Option 1: LLM-Topic-Inference per Conversation-Start (verworfen)

Bei jeder neuen Conversation Haiku-Call: "Klassifiziere diese letzte User-Message in 1-3 Topics aus folgender Liste".

- + Pro: Praezise Klassifikation
- - Con: Bricht DD-1 (Latenz-Selbstmord ~500-1500ms)
- - Con: Bricht DD-2 (LLM-Call pro Conversation)

### Option 2: Lokale Centroid-Cosine-Inference (Empfohlen)

`known_topics.centroid_embedding` wird beim Insert/Update von Facts inkrementell refresht. Beim Conversation-Start: Embedding der letzten User-Message, Cosine gegen alle Centroids, Top-K Topics als Inference-Ergebnis.

- + Pro: DD-1 erfuellt -- sub-50ms Inference
- + Pro: DD-2 erfuellt -- kein LLM-Call, Embedding ist sowieso budgetiert
- + Pro: DD-3 erfuellt fuer Use-Case mit > 5 Facts pro Topic (Sebastians Setup)
- - Con: DD-4 Cold-Start-Problem -- bei wenigen Facts pro Topic sind Centroids instabil

### Option 3: Hybrid -- lokale Inference + LLM-Fallback bei niedriger Confidence (verworfen fuer MVP)

Lokale Cosine-Inference, aber wenn Top-K-Score zu niedrig, fallback auf LLM-Call.

- + Pro: Praezision + Kosten-Optimum
- - Con: Komplexere Implementation, zwei Code-Pfade
- - Con: LLM-Fallback ist genau bei den Cold-Start-Faellen aktiv, dann ist Latenz-Problem zurueck

## Decision

**Option 2 -- lokale Centroid-Cosine-Inference, mit explizitem Cold-Start-Fallback.**

Algorithmus:

```typescript
async function inferTopics(userMessage: string): Promise<string[]> {
    const queryEmbedding = await embeddingService.embed(userMessage);
    const centroids = await topicRegistry.getActiveCentroids();

    if (centroids.length === 0 || allCentroidsHaveLowFactCount()) {
        // Cold-Start-Fallback: nutze die N neuesten Facts unabhaengig vom Topic
        return topicsFromRecentFacts(N=10);
    }

    const matches = centroids
        .map(c => ({ topic: c.topic, score: cosineSimilarity(queryEmbedding, c.centroid_embedding) }))
        .filter(m => m.score > THRESHOLD_TOPIC_MATCH)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_TOPICS_PER_CONVERSATION);

    return matches.map(m => m.topic);
}
```

**Schwellenwerte:**

- `THRESHOLD_TOPIC_MATCH = 0.55` -- nur Topics mit klarem Match
- `THRESHOLD_COLD_START_FACT_COUNT = 5` -- ein Topic gilt als "stabil" wenn >=5 Facts existieren
- `MAX_TOPICS_PER_CONVERSATION = 5` -- Cap gegen Topical-Memory-Overflow

**Soft-Topic-Lock pro Conversation:**

Beim ersten User-Turn wird das Inference-Ergebnis als Topic-Lock auf der Conversation gespeichert. Bei jedem Folge-Turn wird Drift detected:

```typescript
async function checkTopicDrift(userMessage: string, currentLock: string[]): Promise<boolean> {
    const newTopics = await inferTopics(userMessage);
    const overlap = jaccardSimilarity(newTopics, currentLock);
    return overlap < THRESHOLD_TOPIC_DRIFT; // 0.4
}
```

Wenn Drift detected: Topic-Lock wird soft-invalidiert, neue Inference, Topical-Memory-Block fuer naechsten Turn refresh. Drift-Signal wird zudem an FactExtractor (FEATURE-0318) propagiert -- triggert ggf. Re-Extract auch ohne Time-Throttle.

**Centroid-Refresh-Strategie:**

Bei jedem Fact-Insert/Update wird das `centroid_embedding` des betroffenen Topics als gewichteter Durchschnitt der Fact-Embeddings re-computed. Inkrementell, nicht voll-recalc:

```typescript
new_centroid = (old_centroid * old_count + new_fact_embedding) / (old_count + 1)
```

Performance: O(1) pro Insert. Bei Bulk-Operations (Migration, Inference-Pass) wird Centroid-Refresh deferred zu Job-Ende.

## Consequences

**Positiv:**

- Latenz-Ziel erreicht (sub-50ms)
- Keine zusaetzlichen LLM-Calls im Hot-Path
- Cold-Start-Verhalten ist klar definiert (Fallback statt Crash)
- Soft-Topic-Lock erlaubt mid-conversation Topic-Wechsel

**Negativ:**

- Centroid-Drift-Risiko bei Embedding-Modell-Wechsel (Mitigation: `embedding_model`-Filter siehe FEATURE-0314)
- Cold-Start-Fallback ist heuristisch, nicht praezise
- Centroid-Storage: zusaetzliche Float32Array-BLOB pro Topic (~3KB), bei 50 Topics = 150KB. Akzeptabel.

**Risks:**

- **R-1:** THRESHOLD_TOPIC_MATCH = 0.55 ist Default ohne empirische Daten. **Mitigation:** Eval-Test-Set in FEATURE-0317 misst Topic-Match-Recall, Schwelle wird kalibriert.
- **R-2:** Soft-Lock-Drift-Threshold (Jaccard < 0.4) ist Default. **Mitigation:** Telemetrie (siehe FEATURE-0317 C4) traegt Drift-Events, Schwelle wird in Iteration getunt.
- **R-3:** Bei sehr lange Conversations koennte Topic-Drift staendig triggern (Cache-Invalidierung). **Mitigation:** Drift-Cool-down 5min, kein erneuter Drift-Check innerhalb dieses Fensters.

## Implementation-Bezug

- FEATURE-0317 ContextComposer implementiert Topic-Inference
- FEATURE-0317 Reranker-Pass nutzt Topic-Lock fuer Score-Boost (E7)
- FEATURE-0318 FactIntegrator updated Centroids inkrementell beim Insert
- ADR-077 enthaelt `centroid_embedding`-Spalte in `known_topics`

## Open Questions

- Centroid-Recalc-Granularitaet: pro Insert (eager) oder periodisch (lazy)? Default eager, Re-Eval nach Phase 3.
- Topic-Hierarchie (z.B. coding > coding/typescript): MVP flach, Hierarchie post-MVP.
- Multi-Lingual-Topic-Centroids: Qwen3-8b multilingual, Sebastian's Setup ist out-of-the-box ok. Englisch-only-Modelle waeren limitiert.
