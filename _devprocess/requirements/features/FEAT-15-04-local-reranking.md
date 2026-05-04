# Feature: Local Reranking

> **Feature ID**: FEAT-15-04
> **Epic**: EPIC-15 - Unified Knowledge Layer
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

Nach den ersten drei Retrieval-Stufen (Vector Search, Graph Expansion, Implicit Connections) werden die ~20 Kandidaten-Ergebnisse durch einen lokalen Cross-Encoder Reranker auf die besten Top-K priorisiert. Der Reranker betrachtet Query und Chunk gemeinsam (nicht separat wie Cosine-Similarity) und erkennt dadurch feine Relevanz-Unterschiede.

**Technologie:** @huggingface/transformers (transformers.js) mit dem Cross-Encoder-Modell `ms-marco-MiniLM-L-6-v2`. Laeuft komplett in JavaScript via WASM -- kein Native Addon, kein electron-rebuild, kein externer API-Call. Modell quantisiert (~23MB INT8) kann im Plugin-Bundle mitgeliefert werden.

Auf Mobile faellt das System auf Cosine-Similarity-Ranking zurueck (Stufe 1-3 funktionieren vollstaendig ohne Reranking).

## Benefits Hypothesis

**Wir glauben dass** lokales Reranking
**Folgende messbare Outcomes liefert:**
- Die Top-5 Ergebnisse sind praeziser und relevanter als reine Cosine-Similarity
- Weniger irrelevante Ergebnisse in der Antwort des LLM

**Wir wissen dass wir erfolgreich sind wenn:**
- Subjektive Relevanz der Top-5 Ergebnisse verbessert sich gegenueber Cosine-Only
- Reranking laeuft lokal ohne externe API-Aufrufe (Datenschutz)

## User Stories

### Story 1: Praezisere Ergebnisse
**Als** Knowledge Worker
**moechte ich** dass die relevantesten Ergebnisse zuoberst stehen
**um** schneller die richtige Information zu finden

### Story 2: Lokale Verarbeitung
**Als** datenschutzbewusster User
**moechte ich** dass das Relevanz-Ranking lokal auf meinem Geraet laeuft
**um** meine Vault-Inhalte nicht an externe Dienste senden zu muessen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Ergebnisqualitaet verbessert sich gegenueber Basis-Ranking | Spuerbare Verbesserung | Subjektiver Vergleich: gleiche Queries mit/ohne Reranking |
| SC-02 | Ranking laeuft vollstaendig lokal | Keine externen Aufrufe | Netzwerk-Monitor: 0 Requests waehrend Reranking |
| SC-03 | Ranking verlangsamt die Suche nicht spuerbar | Unter 1 Sekunde Gesamtzeit | Zeitmessung Ende-zu-Ende |
| SC-04 | Auf Mobile funktioniert die Suche ohne Reranking | Vollstaendige Ergebnisse, nur ohne Rerank-Schritt | Funktionstest auf Mobile |
| SC-05 | Reranking ist deaktivierbar | Toggle in Settings | Deaktivieren und pruefen dass Suche weiterhin funktioniert |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Reranking 20 Kandidaten**: <200ms auf Desktop (WASM, M1/Intel)
- **Modell-Laden**: <3s beim ersten Aufruf (lazy load), danach im Speicher
- **Memory**: <150MB zusaetzlich waehrend Reranking

### Platform
- **Desktop**: @huggingface/transformers (WASM Backend) -- ms-marco-MiniLM-L-6-v2
- **Mobile**: Kein Reranking (Fallback auf Cosine-Similarity)
- **Modell-Delivery**: INT8 quantisiert (~23MB) im Plugin-Bundle oder Lazy Download

### Scalability
- **Kandidaten**: 10-30 Chunks pro Reranking-Durchlauf (konfigurierbar)

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Reranking muss optional und graceful-degradable sein
- **Warum ASR**: Mobile hat kein WASM-Performance. Modell-Load kann scheitern. User kann es deaktivieren.
- **Impact**: Retrieval-Pipeline muss ohne Stufe 4 vollstaendig funktionieren
- **Quality Attribute**: Availability, Portability

**MODERATE ASR #2**: Kein Native Addon -- reines JS + WASM
- **Warum ASR**: Native Addons (onnxruntime-node) erfordern electron-rebuild und sind Review-Bot-riskant
- **Loesung**: @huggingface/transformers nutzt ONNX Runtime Web (WASM), kein Native Addon
- **Quality Attribute**: Portability, Maintainability

### Entscheidungen (beantwortet)

| Frage | Antwort |
|-------|---------|
| ONNX Runtime: node oder web? | **Web (WASM)** via transformers.js -- kein Native Addon |
| Modell-Auswahl? | **ms-marco-MiniLM-L-6-v2** (23MB INT8, 74.3 NDCG@10) |
| Modell-Storage? | Im Plugin-Bundle oder `~/.obsidian-agent/models/` (Lazy Download) |
| Quantisierung? | **INT8** (~23MB statt ~90MB FP32) |
| WASM-Loading? | Gleicher Pattern wie sql.js (fs.readFileSync + Buffer) |

---

## Definition of Done

### Functional
- [ ] Reranking der Top-20 Kandidaten auf Top-K
- [ ] Lokal auf Desktop (kein Netzwerk-Aufruf waehrend Inference)
- [ ] Graceful Fallback auf Mobile (Cosine-Only)
- [ ] Deaktivierbar in Settings
- [ ] Lazy Model Load (erstes rerank() laedt Modell)

### Quality
- [ ] Performance Test: Reranking 20 Chunks <200ms
- [ ] Relevanz-Test: Stichprobe von 10 Queries, subjektiv bessere Top-5
- [ ] Fallback-Test: Suche funktioniert vollstaendig wenn Reranking deaktiviert

### Documentation
- [ ] ADR fuer Reranker-Modell-Auswahl aktualisiert
- [ ] Feature-Spec aktualisiert
- [ ] plan-context.md erstellt

---

## Dependencies
- **FEAT-15-00**: SQLite Knowledge DB (Vektoren laden fuer Kandidaten-Selektion)
- **FEAT-15-01**: Enhanced Vector Retrieval (liefert die Kandidaten)
- **@huggingface/transformers**: npm Package (JS + WASM, kein Native Addon)

## Assumptions
- ms-marco-MiniLM-L-6-v2 laeuft in transformers.js WASM mit akzeptabler Latenz
- INT8-Quantisierung reduziert Groesse ohne signifikanten Qualitaetsverlust
- WASM-Loading funktioniert in Obsidians Electron (gleicher Pattern wie sql.js)

## Out of Scope
- Cloud-basiertes Reranking (Cohere, Jina API)
- Reranking auf Mobile
- Fine-Tuning des Reranker-Modells auf Vault-Daten
- WebGPU Backend (spaetere Optimierung)
