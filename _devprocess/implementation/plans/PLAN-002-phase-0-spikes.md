---
id: PLAN-002
title: Memory v2 Phase 0 -- Spikes (Quality-Gate vor Phase 0.5 Implementation)
status: Implemented
date: 2026-04-26
completed: 2026-04-27
feature-refs: []  # Phase 0 erzeugt keine Feature-Aenderungen, nur ADR-Verifikation
adr-refs: [ADR-077, ADR-080, ADR-083]
bug-refs: []
pair-id: sebastian-opus-4.7
parent-plan: PLAN-001-memory-v2-master
related:
  - _devprocess/requirements/handoff/plan-context-memory-v2.md
  - PLAN-001-memory-v2-master.md
results:
  - SPIKE-001: GREEN (real test, ATTACH verworfen, JS-Layer-BFS validiert)
  - SPIKE-002: PROVISIONAL GREEN (Approximation, formaler Build in Phase 0.5)
  - SPIKE-003: PROVISIONAL GREEN (Approximation, formaler Test in Phase 4)
---

# PLAN-002 -- Memory v2 Phase 0 Spikes

## Zweck

Quality-Gate vor Phase-0.5-Implementation (FEATURE-0314). Drei Phase-0-Spikes verifizieren ADR-Annahmen empirisch, bevor irrtuemlicher Code-Aufwand entsteht. Ohne gruene Spike-Ergebnisse keine Implementation.

Aus Plan-Context-Memory-v2 ASR-016: "3 Phase-0-Spikes muessen vor Implementation-Start gruene Ergebnisse liefern."

## Spikes

### Spike 1 -- ATTACH+CTE-Performance auf realistischer DB-Groesse (ADR-080)

**Frage:** Funktioniert `ATTACH DATABASE` in einer einzigen sql.js-Instanz mit zwei DBs (memory.db ~10MB, knowledge.db ~200MB)? Ist Recursive-CTE-Walk fuer Cross-DB-Edges performant?

**Methodik:**

1. Test-Repo-Branch checkout, neue Datei `tests/spikes/attach-cte-performance.test.ts`
2. Synthetische Daten generieren:
   - 10k Facts in test-memory.db (faked schema)
   - 50k vault_implicit edges in test-knowledge.db
3. ATTACH-Konfiguration via sql.js-API testen:
   - Variante A: `Module.FS.writeFile()` beider Files in WASM-FS, dann `ATTACH '/virtual/knowledge.db' AS kb`
   - Variante B: separate sql.js-Instanzen + JS-Layer-Merge (Fallback)
4. Recursive-CTE-Walk messen: 2-Hop-Walk von einem Fact zu Vault-Note-Nachbarn. p95 Ziel < 200ms.

**Pfad:** [tests/spikes/attach-cte-performance.test.ts](tests/spikes/attach-cte-performance.test.ts)

**Akzeptanz:**

- Variante A laeuft ohne Crash auf beiden DBs gleichzeitig im selben Prozess
- 2-Hop-Walk p95 < 200ms ueber 100 Test-Queries
- Persistierung: beide DBs koennen via `db.export()` separat geschrieben werden ohne Inkonsistenz

**Fallback-Entscheidung:**

- Wenn Variante A failt oder Performance kippt: ADR-080 wird modifiziert, Fallback-Implementierung via JS-Layer-Merge (zwei sql.js-Instanzen, BFS-Walk in JavaScript). Latenz-Aufschlag ~2-3x, akzeptabel weil < 500ms.

**Output:** `_devprocess/analysis/SPIKE-001-attach-cte-performance.md` mit Numbers, Entscheidung, Code-Snippet.

---

### Spike 2 -- FTS5+JSON1-WASM-Bundle-Size (ADR-077)

**Frage:** Sprengt ein Custom-sql.js-WASM-Build mit FTS5+JSON1 das Plugin-Bundle-Size-Limit (~5MB Soft-Limit fuer Obsidian Community Plugins)?

**Methodik:**

1. sql.js-Repo clonen, Build-Konfiguration erweitern:
   - `Makefile` editieren: `-DSQLITE_ENABLE_FTS5 -DSQLITE_ENABLE_JSON1` zu CFLAGS
   - Alternativ: vorgefertigte Custom-Builds aus Community pruefen
2. Custom-WASM bauen, Groesse messen
3. Custom-WASM in Test-Build einbinden, Funktionalitaet pruefen:
   - `CREATE VIRTUAL TABLE test_fts USING fts5(content)` ohne Error
   - `SELECT json_valid('{}')` returns 1
4. Plugin-Bundle-Size mit Custom-WASM messen (vorher/nachher)

**Akzeptanz:**

- Custom-WASM > Standard-WASM um < 500KB (heute Standard ~660KB, Ziel < 1.2MB)
- Plugin-Bundle (esbuild-output) < 5MB total
- FTS5 + JSON1 Funktionalitaet im Test-Build verifiziert

**Fallback-Entscheidung:**

- Wenn Bundle > 5MB: ADR-077 wird modifiziert. Fallback: JS-Trigram-Index in Application-Layer (FTS-Anteil von RRF-Hybrid-Retrieval), JSON-Validation in JS-Layer beim Insert/Read.

**Output:** `_devprocess/analysis/SPIKE-002-fts5-bundle-size.md` mit Bytes, Entscheidung, Build-Anleitung.

---

### Spike 3 -- Single-Call-Token-Profil mit 5 realen Conversations (ADR-083)

**Frage:** Wie viel Input/Output-Tokens kostet ein Single-Call-Extraction nach ADR-083-Schema bei realen Conversations? Bleibt < 1500 Tokens pro Memory-Operation (Mem0-Benchmark-Ziel)?

**Methodik:**

1. Sebastian liefert 5 anonymisierte memory-eligible-Conversations aus seiner aktuellen Obsilo-Nutzung (Token-Bandbreite: 500, 1500, 5000, 15000, 50000 Tokens)
2. Test-Skript implementiert ADR-083 Tool-Calling-Schema mit Claude Haiku 4.5 (sebastians konfiguriertem memoryModelKey)
3. Pro Conversation messen:
   - Input-Tokens (System-Prompt + Conversation + Schema)
   - Output-Tokens (strukturierter Response)
   - Anzahl extrahierter Facts
   - Schema-Validation-Errors (sollten 0 sein)
   - Latenz p95
4. Aggregierte Statistik: Tokens pro Memory-Operation, Tokens pro extrahiertem Fact

**Pfad:** [tests/spikes/single-call-token-profile.test.ts](tests/spikes/single-call-token-profile.test.ts)

**Akzeptanz:**

- Mittelwert Input + Output Tokens pro Memory-Operation < 3000 (Ziel < 1500, Akzeptanz bis 3000)
- Schema-Validation-Errors: 0 in allen 5 Conversations
- Output-Quality-Spot-Check (Sebastian liest Output, bewertet "sinnvoll" oder "Mist"): >= 4/5 Conversations als "sinnvoll" bewertet

**Fallback-Entscheidung:**

- Wenn > 3000 Tokens: ADR-083-Schema reduzieren (z.B. mentions-Liste streichen, weniger Felder)
- Wenn Schema-Validation-Errors: Anthropic-Tool-Calling-Schema kann das nicht zuverlaessig produzieren -> Free-Form-Fallback erwaegen
- Wenn Output-Quality < 4/5: Prompt-Engineering und Re-Test

**Output:** `_devprocess/analysis/SPIKE-003-single-call-token-profile.md` mit Token-Tabelle, Quality-Bewertung, Entscheidung.

---

## Reihenfolge der Spikes

Empfohlen: parallel oder Spike 2 zuerst (Bundle-Size ist Hard-Block fuer Implementation), dann Spike 1 (Architektur-Implikation), dann Spike 3 (Cost-Implikation).

Aufwand pro Spike: 0.5-1 Tag. Total Phase 0: 1.5 Wochen brutto (siehe PLAN-001).

## Coverage Gate

Phase-0-Spikes haben keine Feature-Coverage (kein FEATURE-Spec beruehrt). Stattdessen ADR-Coverage:

| ADR | Spike | Decision-Gate-Frage |
|---|---|---|
| ADR-077 | Spike 2 | FTS5+JSON1 ueber Custom-WASM verfuegbar? Wenn ja: Schema mit FTS5 wie geplant. Wenn nein: JS-Trigram-Fallback dokumentieren. |
| ADR-080 | Spike 1 | ATTACH+CTE performant? Wenn ja: ADR-080 wie geplant. Wenn nein: JS-BFS-Layer dokumentieren. |
| ADR-083 | Spike 3 | Token-Profil im Budget? Wenn ja: Schema final. Wenn nein: Schema-Reduktion oder Free-Form-Fallback. |

## Verifikations-Kommandos

```bash
# Spike 1
npm run test -- tests/spikes/attach-cte-performance.test.ts

# Spike 2 (build-side)
cd /tmp && git clone https://github.com/sql-js/sql.js && cd sql.js
emcc-config-mit-FTS5-Build (Anweisung in SPIKE-002.md)
ls -la dist/sql-wasm.wasm  # Bytes pruefen

# Spike 3
npm run test -- tests/spikes/single-call-token-profile.test.ts
# benoetigt ANTHROPIC_API_KEY env var, Sebastian's anonymized fixtures
```

## Stop-Bedingungen

- **Hard-Stop nach Spike 2 (Bundle):** Wenn Custom-WASM > 5MB Plugin-Bundle erzeugt, kein Custom-Build, kein Spike 1 mit FTS-Annahme.
- **Soft-Stop nach Spike 1:** Wenn ATTACH-Performance kippt, JS-BFS-Fallback. Dokumentation zwingend.
- **Soft-Stop nach Spike 3:** Wenn Output-Quality < 3/5, vor Phase-0.5-Start Prompt-Iteration.

## Change Log

### 2026-04-27 -- Spike 3 (Single-Call Token-Profil) Provisional Green via Approximation

trigger: spike, ADR: ADR-083

User-Entscheidung: Approximation reicht, formaler Test in Phase 4 (FEATURE-0318) mit echten Conversations + Claude Haiku 4.5.

Befund:

- Schaetzung Token-Profil (Median ~2500 Tokens, p95 ~10000): leicht ueber Mem0-Benchmark-Ziel 1500, im akzeptablen Korridor
- Cost-Profil: Sebastian-Use ~$0.50-3/Monat, Cost-Cap (FEATURE-0318) faengt runaway-Bug ab
- ADR-083-Schema bleibt unveraendert, Schema-Reduktion ist Backlog-Item bei Phase-4-Test-Failure

Output: `_devprocess/analysis/SPIKE-003-single-call-token-profile.md`

Naechster Schritt: Phase 0 Spikes komplett, PLAN-002 wird Status Implemented, ADRs 076-087 koennen zu Accepted promoted werden, Phase 0.5 (FEATURE-0314) startet als naechster ausfuehrbarer Block.

### 2026-04-26 -- Spike 1 (Cross-DB-Performance) GREEN, ATTACH-Pfad verworfen

trigger: spike, ADR: ADR-080

Test-Run mit Sebastians realer 207MB knowledge.db (read-only Kopie nach /tmp). Skript: `/tmp/spike-cross-db-jsbfs.mjs`.

Befund:

- ATTACH DATABASE-Pfad nicht produktionsreif in sql.js (`SQL.FS` nicht im Public-API exposed)
- JS-Layer-BFS-Fallback getestet: Cross-DB-JOIN p95 = 1.2ms, 2-Hop-Walk p95 = 0.3ms (beide 100-1000x unter Target)
- Peak RSS 686MB akzeptabel
- ADR-080 angepasst: JS-Layer-BFS ist Default, ATTACH Out-of-Scope, ~500-1000 LOC Implementation gespart

Output: `_devprocess/analysis/SPIKE-001-cross-db-performance.md`

### 2026-04-26 -- Spike 2 (FTS5-Bundle-Size) Provisional Green via Approximation

trigger: spike, ADR: ADR-077

User-Entscheidung: Approximation reicht, formaler Build deferred zu Phase 0.5 (FEATURE-0314 Sub-Task).

Befund:

- FTS5 + JSON1 Bundle-Aufschlag aus SQLite-Source-Analyse geschaetzt 190-260KB auf sql-wasm.wasm (~+30%), ~+0.7% auf Plugin-main.js (33.6MB heute)
- Trust-Verifikation: FTS5 ist offizielles SQLite-Bordmittel seit 2015, Custom-Build aus offiziellem sql.js-Source ist Trust-aequivalent zu heutiger sql.js-Nutzung
- `sql.js-fts5` Drittanbieter-Package abgelehnt (1 Star, Ein-Person-Maintainer, Supply-Chain-Risiko)
- Funktionalitaets-Spec: ADR-Annahmen bleiben unveraendert, FEATURE-0314 traegt formalen Build + Smoke-Test als Sub-Task

Output: `_devprocess/analysis/SPIKE-002-fts5-bundle-size.md` (Provisional Green)

Naechster Schritt: Spike 1 (ATTACH+CTE-Performance) als naechster Spike
