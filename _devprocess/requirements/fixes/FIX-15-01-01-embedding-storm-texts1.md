---
id: FIX-15-01-01
feature: FEAT-15-01
epic: EPIC-15
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-08
issue: https://github.com/pssah4/vault-operator-dev/issues/61
---

# FIX-15-01-01: SemanticIndex sendet pro Chunk einen `texts=1`-Embedding-Call statt Batches

## Symptom

Live-Test 2026-05-08 (`/ingest-deep` auf
`Attachements/enbw-geschaeftsbericht-2025.pdf`, branch
`feature/block-source-citations`). Beim Indexing der gerade angelegten
Mirror-Note (`Sources/EnBW-Geschaeftsbericht-2025-Mirror.md`) loggt die
Konsole 500+ aufeinanderfolgende Zeilen:

```
[SemanticIndex] Embedding via SDK: openrouter https://openrouter.ai/api/v1 model=qwen/qwen3-embedding-8b texts=1
[SemanticIndex] Embedding via SDK: openrouter https://openrouter.ai/api/v1 model=qwen/qwen3-embedding-8b texts=1
... (mehrere hundert Zeilen)
```

Jeder Eintrag ist ein eigener HTTP-Roundtrip mit `texts=1`. Der Logger
selbst ist nicht das Problem; das Problem ist, dass er fuer jeden
Chunk einzeln feuert, weil das Indexing pro Chunk einen Embedding-Call
macht.

## Root cause -- Hypothese (zu validieren)

Der Indexing-Pfad ruft den Embedding-Client in einer Schleife pro
Chunk auf, statt eine Liste von Chunks an einen Batch-Embed-Call zu
uebergeben. Vermuteter Code-Pointer: `SemanticIndexService` und/oder
ein OpenRouter-Embedding-Wrapper unter `src/providers/`.

Folgen:

- Latenz: pro Roundtrip ~hundert ms; bei 500 Chunks ~ein Minute reines
  Netzwerk.
- Kosten: pro-Request-Overhead bei OpenRouter (Provider berechnet
  i. d. R. pro Call zusaetzliche Tokens fuer System-Wrapping).
- Rate-Limit-Risiko: bei groesseren Vault-Indexings landet das Plugin
  in 429.

```
SemanticIndexService.indexNote(content)
  -> chunks = splitIntoChunks(content)        // ok
  -> for chunk of chunks:                     // ANTI-PATTERN
       embedding = await client.embed([chunk])
       index.put(chunk.id, embedding)
  // erwartet: client.embed(chunks) als Batch
```

## Fix

Offen. Vorschlag:

1. Indexing-Pfad identifizieren -- `grep -rn "Embedding via SDK" src/`.
2. Aufrufer pruefen: wird in einer Schleife pro Chunk `embed([chunk])`
   gerufen? Oder wird das Batching weiter unten verschluckt
   (z. B. weil ein Wrapper jedes Element einzeln durchschickt)?
3. Auf Batch-Embedding umstellen, z. B. 32 Chunks pro Call. Provider
   limitieren Batch-Groesse (OpenRouter dokumentiert i. d. R. ein Limit
   pro Modell), das Limit aus dem Modell-Catalog ablesen.
4. Telemetrie ergaenzen: einmal pro Batch loggen
   `[SemanticIndex] Embedding batch via SDK: ... texts=N`, statt pro
   Chunk -- haelt die Console lesbar.

## Regression test

Indexing-Test mit synthetischer 200-Chunk-Note. Assertion: maximal
`ceil(200 / batchSize)` Embedding-Calls werden abgesetzt, jeder Call
mit `texts >= batchSize` (mit Toleranz fuer letzten Restbatch).

## Status

See the backlog row for FIX-15-01-01 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).

## Tracking

GitHub Issue: https://github.com/pssah4/vault-operator-dev/issues/61
