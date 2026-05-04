---
id: ADR-109
title: Vault-zu-Memory-Bruecke via Single-Listener-Pattern
date: 2026-05-03
deciders: Sebastian + Architekt-Agent
related-features: FEAT-03-25, FEAT-19-09
related-adrs: ADR-95 (Frontmatter-Schreibrechte), ADR-102 (Auto-Trigger-Detection-Mechanik)
---

# ADR-109: Vault-zu-Memory-Bruecke via Single-Listener-Pattern

## Status

Proposed (RE-Pass 2026-05-03, awaiting Architecture-Phase Approval).

## Kontext

FEAT-03-25 "Vault-Note-zu-Fact-Extraction" wurde im April-Pass als
eigener `VaultMemorySourceService` mit eigenem `vault.on`-Listener
geplant. BA-25 (Karpathy-Wiki-Pattern, EPIC-19) hat parallel den
`FrontmatterIndexer` mit eigenem vault.on-Listener fuer alle
Markdown-Notes implementiert.

Beide Initiativen lesen Vault-Notes und reagieren auf Aenderungen.
Wenn FEAT-03-25 als getrennter Service gebaut wird, entstehen:

- Zwei vault.on-Listener fuer dieselben Events (Doppel-Dispatch).
- Doppelter Frontmatter-Parse pro Modify-Event.
- Race-Conditions zwischen den beiden Pfaden bei Rapid-Edits.
- Doppelte LLM-Cost wenn beide Pfade extrahieren.
- Notice-Spam-Risiko (BA-25 hat dieses Risiko in Stufe-2-Trigger
  bereits adressiert; FEAT-03-25 wuerde es zurueckholen).

Ohne ADR landen wir in einem Doppel-Stack, den wir spaeter mit
einem groesseren Refactor wieder aufloesen muessen.

## Decision Drivers

- **Maintainability**: ein einziger Vault-Watch-Pfad ist langfristig
  einfacher zu pflegen als zwei.
- **Resource-Efficiency**: Frontmatter-Parsing einmal pro Event,
  nicht zweimal.
- **Konsistenz mit BA-25**: BA-25 ist live, FEAT-03-25 ist neu --
  das neue Feature passt sich an, nicht umgekehrt.
- **Engine-Extract-Vorbereitung**: FEAT-03-21 will die Memory-Engine
  vom Plugin entkoppeln. Ein dedizierter Vault-Service waere ein
  Extract-Hindernis; eine Bridge-Komponente im Plugin-Layer haelt
  die Engine clean.
- **Schema-Sparsamkeit**: `memory_source_notes`-Tabelle existiert in
  memory.db v2 bereits (Schema landed mit FEAT-03-15). Sie soll
  Bruecken-Tabelle bleiben (note-path -> source_session_id), nicht
  zum vollen Storage werden.

## Considered Options

### Option A: Eigener VaultMemorySourceService mit eigenem Listener

**Pro:**

- Klare Trennung Memory-Layer vs. Vault-Layer.
- Leichter testbar in Isolation.

**Con:**

- Doppel-Listener fuer dieselben Events.
- Doppelter Frontmatter-Parse, doppelte LLM-Cost wenn nicht aufwendig
  koordiniert.
- Refactor-Risiko: spaeter muessen wir die zwei Pfade
  zusammenfuehren wenn Memory-Engine extrahiert wird.

### Option B (gewaehlt): Bridge-Komponente im BA-25 FrontmatterIndexer

**Pro:**

- Ein Listener, ein Frontmatter-Parse, ein klarer Dispatch-Punkt.
- `memory_source_notes` bleibt schmale Brueckentabelle.
- BA-25-Tests decken den Watch-Pfad bereits ab; FEAT-03-25 muss
  nur die Bridge-Branch testen.
- Vault-Indexing bleibt synchron-stabil, Memory-Extract laeuft als
  Best-Effort-Microtask (eigener try/catch).
- Engine-Extract bleibt sauber: die Bridge ist im Plugin-Layer,
  nicht in der Engine.

**Con:**

- FrontmatterIndexer wird etwas breiter.
- Wenn Vault-Indexing wegen unerwartetem Fehler abbricht, laeuft
  auch Memory-Extract nicht (Mitigation: zwei separate try/catch).

### Option C: Event-Bus zwischen den Layern

**Pro:**

- Lose Kopplung, leicht erweiterbar fuer weitere Sinks.

**Con:**

- Zusaetzliche Indirektion fuer ein Pattern, das heute nur zwei
  Konsumenten hat.
- Erhoeht Komplexitaet ohne aktuellen Nutzen.
- YAGNI-Verletzung.

## Decision

**Option B**: Bridge-Komponente im BA-25 FrontmatterIndexer.

Konkret:

1. `FrontmatterIndexer.indexNote(file)` parst Frontmatter wie heute.
2. Wenn `memory-source: true` (oder Eintrag in
   `memory_source_notes` ueber Settings/Agent-Tool-Pfad gesetzt):
   die Note wird zusaetzlich an `SingleCallProcessor` als
   `vault://{path}` Source-URI geschickt. Eigener try/catch.
3. `memory_source_notes` haelt: `note-path`, `last_extracted_at`,
   `marker_source` ('frontmatter' / 'agent-tool' / 'settings'),
   `source_session_id` (Brueckenfeld zu memory.db Facts).
4. Vault-Tools `mark_note_as_memory_source(notePath)`,
   `unmark_note(notePath)`, `list_memory_source_notes()` setzen
   nur das Frontmatter-Property bzw. die Bruecken-Row und
   ueberlassen die Extraktion dem Indexer.
5. Cascade-Delete: bei `vault.on('delete')` (bereits im
   FrontmatterIndexer) wird zusaetzlich `cascadeDeleteFactsBySession`
   mit `source_session_id = vault://{path}` aufgerufen.

## Konsequenzen

### Positive

- Kein Doppel-Listener.
- Frontmatter-Parse einmal pro Event.
- Klare Verantwortlichkeit: Vault-Layer (BA-25) sieht alle
  Notes, Memory-Layer (FEAT-03-25) reagiert nur auf markierte.
- Engine-Extract spaeter ohne Sonderfall.
- Code-Volumen sinkt von ~600 LOC (eigener Service) auf ~150-200 LOC
  (Bridge + Tools).

### Negative

- FrontmatterIndexer wird breiter -- Risiko, dass er zu vielen
  Verantwortungen anhaeuft. Mitigation: weitere Sinks brauchen ADR
  und Review.
- Tests fuer FEAT-03-25 sind enger an BA-25-Mocks gekoppelt.

### Risiken

- **R-1**: Memory-Extract-Fehler koennten Vault-Indexing blockieren.
  Mitigation: eigener try/catch + Microtask-Wrapper, Memory-Extract
  blockiert Indexer nie.
- **R-2**: Wenn FrontmatterIndexer in Zukunft umgebaut wird, muss
  die Bridge mit-bedacht werden. Mitigation: JSDoc-Header in
  FrontmatterIndexer dokumentiert die Bridge-Branch ausdruecklich.

## Implementation Notes

(allowed-to-stale)

- FrontmatterIndexer: [src/core/ingest/FrontmatterIndexer.ts](../../src/core/ingest/FrontmatterIndexer.ts)
- SingleCallProcessor: [src/core/memory/SingleCallProcessor.ts](../../src/core/memory/SingleCallProcessor.ts)
- memory_source_notes-Tabelle: [src/core/knowledge/MemoryDB.ts](../../src/core/knowledge/MemoryDB.ts) (Schema v2, Zeile 119)
- Neue Vault-Tools: src/core/tools/vault/MarkNoteAsMemorySourceTool.ts (geplant), UnmarkNoteTool.ts, ListMemorySourceNotesTool.ts
