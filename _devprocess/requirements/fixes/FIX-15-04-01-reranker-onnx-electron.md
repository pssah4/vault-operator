# FIX-07: Reranker ONNX-Runtime Fehler in Electron

**Prioritaet:** P2 (Mittelfristig)
**Datei:** `src/core/knowledge/RerankerService.ts`
**Feature:** FEAT-15-04 (Local Reranking)
**Entdeckt:** 2026-04-03, beim Memory/Self-Learning-Systemtest

---

## Problem

Der RerankerService (Cross-Encoder via transformers.js/ONNX WASM) kann in Obsidians
Electron-Umgebung nicht laden. Fehler tritt bei jedem `semantic_search`-Aufruf auf
(lazy load retry in `rerank()` Zeile 106-108).

## Fehlermeldung

```
[Reranker] Failed to load model: TypeError: Cannot read properties of undefined (reading 'create')
    at load (plugin:obsilo-agent:110355:40)
    at async createInferenceSession (plugin:obsilo-agent:110360:19)
    at async constructSessions (plugin:obsilo-agent:112372:5)
    at async BertForSequenceClassification.from_pretrained (plugin:obsilo-agent:128636:23)
    at async AutoModelForSequenceClassification.from_pretrained (plugin:obsilo-agent:134787:18)
    at async RerankerService.loadModel (plugin:obsilo-agent:136813:24)
```

## Root Cause Analyse

Die ONNX-Runtime (Teil von `@huggingface/transformers`) versucht eine InferenceSession
zu erstellen. Der `create`-Aufruf schlaegt fehl, weil:

1. **Electron-Umgebungserkennung:** transformers.js erkennt Obsidians Electron als
   Node.js-Umgebung, versucht aber den WASM-Backend zu nutzen. Die WASM-Backend-
   Initialisierung funktioniert nicht korrekt in diesem Hybrid-Kontext.

2. **ONNX Backend undefined:** `env.backends.onnx.wasm` existiert moeglicherweise
   nicht oder das WASM-Backend ist nicht korrekt initialisiert, bevor
   `createInferenceSession` aufgerufen wird.

3. **Code-Stelle:** `RerankerService.ts:62-76` -- der `loadModel()`-Call. Der Guard
   `env.backends?.onnx?.wasm` (Zeile 66) laeuft durch, aber die Session-Erstellung
   scheitert trotzdem.

## Auswirkung

- **Funktional:** Mittel. Semantic Search funktioniert weiterhin (ohne Reranking).
  Ergebnisqualitaet leicht reduziert (kein Cross-Encoder Re-Scoring).
- **Performance:** Der Fehler tritt bei JEDEM `semantic_search`-Aufruf erneut auf,
  da `_loaded = false` bleibt und `rerank()` erneut `loadModel()` versucht
  (Zeile 106-108). Das fuehrt zu ca. 2-5s unnoetigem Delay pro Aufruf.
- **Console Noise:** Zwei Warn-Meldungen pro semantic_search (einmal beim Tool-Aufruf,
  einmal beim Rerank-Fallback).

## Moegliche Loesungen

### Option A: Fail-Once-Guard (Quick Fix)
Nach erstem Fehlschlag `_failed = true` setzen, danach kein Retry mehr.
Verhindert den wiederholten 2-5s Delay. Einfachste Loesung.

### Option B: transformers.js Update
Pruefen ob neuere Version von `@huggingface/transformers` das Electron-Problem loest.
Eventuell explizites Backend-Setting noetig (`env.backends.onnx.wasm.proxy = true`
oder `env.useBrowserCache = true`).

### Option C: ONNX Runtime separat konfigurieren
Statt transformers.js-Defaults nutzen: `ort.env.wasm.wasmPaths` explizit auf die
bundled WASM-Dateien setzen. Erfordert Investigation der ONNX-Runtime-WASM-Kompatibilitaet
mit Electrons Chromium-Version.

### Option D: Feature deaktivieren wenn Electron
Guard in `main.ts:432-436`: Reranker nur laden wenn die Umgebung kompatibel ist
(z.B. ueber Feature-Detection `typeof onnxruntime !== 'undefined'`).

## Empfehlung

Option A als sofortiger Quick Fix (1h), dann Option B/C als nachhaltige Loesung.

## Betroffene Dateien

- `src/core/knowledge/RerankerService.ts` (Hauptdatei)
- `src/main.ts:432-436` (Initialisierung)
- `src/core/tools/vault/SemanticSearchTool.ts` (Consumer)
- `src/ui/settings/EmbeddingsTab.ts:591-598` (Settings Toggle)
