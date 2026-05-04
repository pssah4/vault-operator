---
id: SPIKE-002
title: FTS5 + JSON1 Bundle-Size Spike (Approximation)
status: Provisional Green (formaler Build deferred zu Phase 0.5 / FEAT-03-14)
date: 2026-04-26
related:
  - ADR-77-memory-v2-storage-schema.md
  - PLAN-02-phase-0-spikes.md
  - FEAT-03-14-knowledge-db-hardening.md
---

# SPIKE-002 -- FTS5 + JSON1 Bundle-Size

## Ziel

Klaeren: Sprengt ein Custom-sql.js-WASM-Build mit FTS5 + JSON1 das Plugin-Bundle-Size-Limit?

## Methodik (Approximation, ohne echten Build)

Echter Build wurde defered, weil Build-Toolchain (Docker oder Emscripten via Homebrew) User-Aktion erfordert und der erwartete Bundle-Aufschlag aus SQLite-Source-Analyse stark genug ableitbar ist. Formaler Build wird Sub-Task von FEAT-03-14 (Phase 0.5) -- dort ist die Toolchain-Entscheidung mit echter Implementation gekoppelt.

### Schritt 1: Trust-Verifikation FTS5

- FTS5 ist Bestandteil des offiziellen SQLite-Source-Codes seit 2015 (sqlite.org/fts5.html)
- Wartung durch SQLite-Konsortium (Richard Hipp et al.), eines der best-gewarteten OSS-Projekte
- Source-Compile-Flag: `-DSQLITE_ENABLE_FTS5` (single line patch im sql.js-Makefile)
- JSON1 analog via `-DSQLITE_ENABLE_JSON1`

Trust-Risiko = Null, weil wir weiterhin offizielles sql.js-Repo + offiziellen SQLite-Source verwenden, nur mit zusaetzlichen Compile-Flags.

Pre-built Drittanbieter-Variante `sql.js-fts5` ([github.com/Erdbeergeist/sql.js-fts5](https://github.com/Erdbeergeist/sql.js-fts5)) wurde **abgelehnt** wegen Trust-Risiko (1 Star, 0 Forks, Ein-Person-Maintainer, sqlite-Version-Basis nicht klar, JSON1 nicht garantiert).

### Schritt 2: Source-Code-Analyse

Aus SQLite-Amalgamation-Source ($SQLITE_VERSION):

| Komponente | Source-Code-Groesse | Erwarteter WASM-Aufschlag (nach -O3) |
|---|---|---|
| FTS5 (`fts5*.c`) | ~150KB Code | ~150-200KB |
| JSON1 (`json.c`) | ~30KB Code | ~40-60KB |
| **Total** | **~180KB Source** | **~190-260KB WASM** |

WASM-Aufschlag berechnet aus erfahrungs-typischem Verhaeltnis WebAssembly Source-zu-Binary-Ratio (~1.0-1.3x mit -O3 Optimization).

### Schritt 3: Plugin-Bundle-Impact

| Bundle | Heute | Mit FTS5+JSON1 (geschaetzt) | Aufschlag |
|---|---|---|---|
| sql-wasm.wasm | 660KB | ~850-920KB | +29-39% |
| Plugin main.js (gesamt) | 33.6MB | ~33.85MB | **+0.7%** |

Plugin-Bundle ist heute schon 33.6MB (Sebastian distribuiert via BRAT, nicht ueber Marketplace mit 5MB-Limit). Aufschlag von ~0.7% absolut keinerlei Showstopper.

### Schritt 4: Funktionalitaets-Verifikation Obsidian/Electron

sql.js (Standard) laeuft heute schon erfolgreich im Plugin (KnowledgeDB.ts produktiv). FTS5 ist Compile-Time-Feature in der WASM-Binary, KEIN Runtime-Mechanismus -- WASM-Loader, Module-Init, Renderer-Process-Verhalten alle identisch. Der einzige Verhaltens-Unterschied: `CREATE VIRTUAL TABLE foo USING fts5(...)` wirft nicht mehr `"no such module: fts5"`.

Empirische Belege fuer Machbarkeit:

- [ouseful.info Blog 2022](https://blog.ouseful.info/2022/04/06/compiling-full-text-search-fts5-into-sqlite-wasm-build/): konkrete sql.js-Makefile-Patch-Anleitung
- SQLite Foundation's eigenes [WASM-Build](https://sqlite.org/wasm/doc/trunk/index.md): zeigt FTS5+JSON1 in Browser/Electron-Kontext supported

## Ergebnis (Provisional Green)

**Empfehlung: ADR-77 mit FTS5+JSON1-Annahme weiterfuehren.** Custom-Build via Docker oder Emscripten in Phase 0.5 (Sub-Task von FEAT-03-14):

```bash
# In /tmp/sql.js (bereits geclont)
# Makefile bereits gepatcht (sed-in-place applied):
#   -DSQLITE_ENABLE_FTS5
#   -DSQLITE_ENABLE_JSON1
# Backup unter /tmp/sql.js/Makefile.bak

# Build-Aufruf (Docker-Variante):
docker pull emscripten/emsdk:3.1.50
docker run --rm -v /tmp/sql.js:/src -w /src emscripten/emsdk:3.1.50 \
  bash -c "make clean && make"

# Output: dist/sql-wasm.wasm
ls -la dist/sql-wasm.wasm  # Erwartung: 850-920KB
```

## Akzeptanz-Kriterien (formal in Phase 0.5)

- [ ] Custom-WASM-Build erfolgreich, sql-wasm.wasm < 1MB
- [ ] Plugin-Bundle (main.js) < 35MB nach Replace
- [ ] Smoke-Test `CREATE VIRTUAL TABLE test_fts USING fts5(content)` ohne Error
- [ ] Smoke-Test `SELECT json_valid('{}')` returns 1
- [ ] Sebastian-eigenes Plugin-Build laeuft mit Custom-WASM ohne Regression in bestehender knowledge.db

## Fallback-Pfad

Falls Phase-0.5-Build die Approximation widerlegt (z.B. > 1MB WASM, Bundle > 50MB, Funktionalitaets-Bug):

- ADR-77 wird modifiziert: JS-Trigram-Index-Fallback in Application-Layer fuer FTS-Anteil von RRF-Hybrid-Retrieval, JSON-Validation in JS-Layer beim Insert/Read
- 2-3 Tage Re-Implementation, kein Plugin-Bundle-Aufschlag

## Status-Pfad

| Datum | Status | Bemerkung |
|---|---|---|
| 2026-04-26 | Provisional Green | Approximation, kein Build |
| (Phase 0.5) | Final Green oder Fallback aktiviert | nach echtem Build und Smoke-Test |
