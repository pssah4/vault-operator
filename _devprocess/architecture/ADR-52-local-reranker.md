# ADR-52: Local Reranker Integration

**Date:** 2026-03-29 (revised 2026-03-30)
**Deciders:** Sebastian Hanke

## Context

Die Retrieval-Pipeline (ADR-51) liefert nach Stufe 1-3 ca. 20 Kandidaten-Ergebnisse. Diese sind nach Cosine-Similarity sortiert, aber Cosine-Similarity ist ein schwacher Relevanz-Indikator: sie misst Aehnlichkeit des Themas, nicht Relevanz fuer die spezifische Frage. Ein Cross-Encoder Reranker betrachtet Query und Chunk gemeinsam und verbessert die Precision um 33-47%.

Der User will lokale Verarbeitung (Datenschutz). Mobile hat keine ML-Runtime.

**Erste Iteration (2026-03-29):** onnxruntime-node war vorgeschlagen, wurde aber deferred wegen:
- Native Addon erfordert electron-rebuild
- 125-500MB Modell-Download
- Review-Bot-Risiko

**Zweite Iteration (2026-03-30):** transformers.js (@huggingface/transformers) als Alternative identifiziert. Loest alle Blocker.

**Triggering ASR:**
- ASR-4 (FEAT-15-04): Graceful Degradation -- Reranking muss optional sein

## Decision Drivers

- **Lokal**: Keine externen API-Aufrufe, Vault-Daten bleiben auf dem Geraet
- **Performance**: <200ms fuer 20 Kandidaten auf Desktop
- **Kein Native Addon**: Kein electron-rebuild, Review-Bot-sicher
- **Kleine Modell-Groesse**: Moeglichst im Plugin-Bundle oder kleiner Download
- **Portable**: Desktop ja, Mobile Fallback auf Cosine-Only

## Considered Options

### Option 1: BGE-Reranker-v2-m3 via onnxruntime-node (Native)

- Pro: Beste Qualitaet, schnellste Inference
- Con: Native Addon -- erfordert electron-rebuild
- Con: 125-500MB Modell-Download
- Con: Review-Bot-Risiko (require mit Native Addon)
- **Ergebnis: Abgelehnt (zu hohe Komplexitaet, zu riskant)**

### Option 2: ms-marco-MiniLM-L-6-v2 via @huggingface/transformers (WASM)

Cross-Encoder Modell (ms-marco-MiniLM-L-6-v2) via transformers.js. Laeuft komplett in JavaScript + WASM. Kein Native Addon.

- Pro: **Kein Native Addon** -- reines JS + WASM, kein electron-rebuild
- Pro: **~23MB INT8 quantisiert** -- kann im Plugin-Bundle oder als kleiner Download
- Pro: **~160ms fuer 20 Kandidaten** auf WASM (akzeptabel)
- Pro: Electron-kompatibel (offizielles Beispiel existiert)
- Pro: WASM-Loading Pattern identisch mit sql.js (bereits geloest)
- Pro: Review-Bot-sicher (kein require fuer Native Addon)
- Con: Etwas schlechter als BGE-Reranker (74.3 vs ~80 NDCG@10)
- Con: Electron Runtime Detection kann WASM-Backend falsch waehlen (konfigurierbar)
- Con: Nicht auf Mobile (WASM zu langsam)

### Option 3: Cohere/Jina Rerank API

- Pro: Beste Performance, kein lokales Modell
- Con: Daten verlassen das Geraet -- Datenschutz-Problem
- Con: API-Key + Netzwerk noetig
- **Ergebnis: Abgelehnt (widerspricht lokaler Verarbeitung)**

### Option 4: LLM-basiertes Reranking

- Pro: Kein zusaetzliches Modell
- Con: 1-3s Latenz, teuer, nicht-deterministisch
- **Ergebnis: Abgelehnt (zu langsam, zu teuer)**

## Decision

**Option 2: ms-marco-MiniLM-L-6-v2 via @huggingface/transformers (WASM)**

**Begruendung:**
Loest alle Blocker der ersten Iteration: Kein Native Addon (reines JS + WASM), kleine Modell-Groesse (~23MB INT8), bewaehrter WASM-Loading Pattern aus sql.js wiederverwendbar. Die Qualitaet (74.3 NDCG@10) ist fuer den Anwendungsfall ausreichend -- der Reranker muss nur die besten 5 aus 20 Kandidaten finden, nicht absolute Relevanz-Scores liefern.

## Consequences

### Positive
- Lokales Reranking ohne API-Kosten, ohne Native Addon
- ~23MB Modell-Groesse (INT8) -- im Bundle oder kleiner Download
- Datenschutz: Vault-Daten verlassen nie das Geraet
- WASM-Loading Pattern aus sql.js wiederverwendbar
- Review-Bot-konform (kein require fuer Native Addon)

### Negative
- Etwas geringere Qualitaet als BGE-Reranker (74.3 vs ~80 NDCG@10)
- WASM ist ~2-3x langsamer als Native (~160ms vs ~60ms), aber noch akzeptabel
- Nur Desktop -- Mobile hat keinen Reranker
- @huggingface/transformers ist eine neue Dependency (~5MB Package)

### Risks
- **Electron Runtime Detection**: transformers.js kann Electron als Node.js erkennen und suboptimales Backend waehlen. Mitigation: WASM-Backend explizit forcieren via `env` Config.
- **WASM Memory Limits**: INT8-Modell (~23MB) passt problemlos. FP32 (~90MB) koennte auf aelteren Geraeten eng werden. Mitigation: INT8 als Default.
- **Package-Updates**: transformers.js wird aktiv entwickelt, API kann sich aendern. Mitigation: Version pinnen.

## Implementation Notes

### Dependency

```bash
npm install @huggingface/transformers
```

### Modell-Storage

```
Option A: Im Plugin-Bundle (esbuild kopiert ONNX-Dateien)
  {vault}/.obsidian/plugins/vault-operator/models/ms-marco-MiniLM-L-6-v2-int8/

Option B: Lazy Download nach ~/.obsidian-agent/models/
  Download via requestUrl (Review-Bot-konform)
```

Empfehlung: **Option A** (Bundle) wegen der kleinen Groesse (~23MB).

### Inference-Pipeline

```typescript
import { AutoModelForSequenceClassification, AutoTokenizer, env } from '@huggingface/transformers';

// Force WASM backend (avoid Electron detection issues)
env.backends.onnx.wasm.numThreads = 4;

class RerankerService {
    private model: AutoModelForSequenceClassification | null = null;
    private tokenizer: AutoTokenizer | null = null;

    async loadModel(): Promise<void> {
        const modelPath = this.getModelPath();
        this.tokenizer = await AutoTokenizer.from_pretrained(modelPath);
        this.model = await AutoModelForSequenceClassification.from_pretrained(modelPath);
    }

    async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]> {
        if (!this.model || !this.tokenizer) return candidates;

        const scores: number[] = [];
        for (const c of candidates) {
            const inputs = await this.tokenizer(query, { text_pair: c.text, padding: true, truncation: true });
            const output = await this.model(inputs);
            scores.push(output.logits.data[0]);
        }

        return candidates
            .map((c, i) => ({ ...c, rerankScore: scores[i] }))
            .sort((a, b) => b.rerankScore - a.rerankScore);
    }
}
```

### Settings

```typescript
enableReranking: boolean;       // default: false
rerankCandidates: number;       // default: 20
```

## Related Decisions

- ADR-50: SQLite Knowledge DB (Vektoren fuer Stufe 1)
- ADR-51: Retrieval-Pipeline (Reranker als Stufe 4)

## References

- FEAT-15-04: Local Reranking
- ms-marco-MiniLM-L-6-v2: https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2
- @huggingface/transformers: https://huggingface.co/docs/transformers.js
- Electron Example: https://github.com/huggingface/transformers.js-examples/tree/main/electron
