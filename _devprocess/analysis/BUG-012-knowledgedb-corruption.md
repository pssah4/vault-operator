# FIX-12: KnowledgeDB Korruption durch nicht-atomare Writes + Cloud Sync

**Prioritaet:** P1 (Kurzfristig)
**Datei:** `src/core/knowledge/KnowledgeDB.ts`
**Feature:** SQLite Knowledge Layer (ADR-050, FEATURE-1500)
**Entdeckt:** 2026-04-10, eigener Vault + Community-Report

---

## Problem

Die KnowledgeDB (sql.js WASM SQLite) wird beim Laden mit `database disk image is malformed` abgelehnt. Alle abhaengigen Services fallen aus: SemanticIndex, GraphStore, OntologyStore, VaultHealth, ImplicitConnections, Episodic Memory.

## Root Cause

sql.js ist eine In-Memory-Datenbank mit Full-Blob-Persistenz:

```
Laden:    Datei → kompletter Blob → new SQL.Database(blob)
Speichern: db.export() → kompletter Blob → writeFile(blob)
```

Jeder Save schreibt die gesamte Datei neu (mehrere MB bei ~11k Vektoren). Kein WAL, kein Journal, kein atomarer Write.

### 3 Korruptions-Vektoren:

**1. Nicht-atomarer Write (Hauptursache)**
`writeDB()` (Zeile 339-352) nutzt `fs.promises.writeFile()` bzw. `vault.adapter.writeBinary()`. Beides ist nicht atomar. Wenn Obsidian waehrend des Writes abstuerzt, gekillt wird, oder das System in Sleep geht → halbe Datei → korrupt.

**2. Cloud Sync (iCloud/Dropbox/OneDrive)**
Bei `storage=local` liegt die DB unter `{vault}/.obsidian-agent/knowledge.db` -- im synced Vault. Cloud-Dienste verstehen SQLite-Binaerformat nicht:
- Partielle Downloads (Sync noch nicht abgeschlossen, Obsidian oeffnet bereits)
- Sync-Konflikte bei gleichzeitigem Zugriff von zwei Geraeten
- Datei wird waehrend des Writes hochgeladen → Remote-Kopie korrupt

**3. Kein Integrity-Check beim Laden**
`open()` (Zeile 182-184) laed den Blob ohne Integritaetspruefung. `new SQL.Database(data)` kann mit korrupten Daten erfolgreich sein, aber der erste Query schlaegt dann fehl. Kein automatischer Recovery.

## Kette

```
Obsidian-Crash / iCloud-Sync-Konflikt / Sleep waehrend Write
  → writeFile() schreibt partiellen Blob
  → Naechster Start: readDB() laed korrupten Blob
  → new SQL.Database(blob) erstellt DB mit kaputtem B-Tree
  → Erster Query: "database disk image is malformed"
  → Alle Services die KnowledgeDB nutzen fallen aus
  → Kein Index, kein Graph, keine Ontologie, keine Vault Health
```

## Community-Relevanz

Betrifft jeden User mit:
- Cloud-synced Vault (iCloud, Dropbox, OneDrive)
- Gelegentlichen Obsidian-Crashes oder Force-Quits
- Mehreren Geraeten die denselben Vault nutzen

## Loesung (3 Stufen)

### Stufe 1: Auto-Recovery (Sofort)
- Integrity-Check nach `open()`: `PRAGMA integrity_check` oder Test-Query
- Bei Korruption: DB loeschen, neu erstellen, User per Notice informieren
- Alle Daten sind regenerierbar (Embeddings, Graph, Ontologie werden aus Vault-Dateien neu berechnet)

### Stufe 2: Atomic Write (Kurzfristig)
- Write-to-temp + Rename Pattern:
  ```
  writeFile(path + '.tmp', data)
  rename(path + '.tmp', path)  // atomar auf den meisten Dateisystemen
  ```
- Backup der letzten guten Version behalten (`knowledge.db.bak`)
- Bei korruptem Load: Backup versuchen bevor Neuaufbau

### Stufe 3: Storage-Location ueberdenken (Mittelfristig)
- `storage=global` (ausserhalb Vault, nicht gesynct) als Default
- Nur user-facing Daten im Vault (Skills, Settings)
- Alternative: WAL-faehiges SQLite via better-sqlite3 (nativ, nicht WASM)

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/core/knowledge/KnowledgeDB.ts` | Integrity-Check, Atomic Write, Auto-Recovery |
| `src/main.ts:367-368` | Recovery-Flow statt non-fatal warn |

## Nicht betroffen

- `MemoryDB` -- separates Schema, aber gleiche KnowledgeDB-Instanz (gleicher Bug)
- Tool-Logik -- keine Aenderung
- API Provider -- keine Aenderung
