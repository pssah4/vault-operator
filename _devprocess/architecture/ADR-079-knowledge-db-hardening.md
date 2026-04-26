---
id: ADR-079
title: Knowledge-DB-Haertung -- Atomic Write, Multi-File-Commit, Rename-Cascade
status: Proposed
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - BUG-012-knowledgedb-corruption.md
  - ADR-077-memory-v2-storage-schema.md
  - ADR-078-uri-versioning-schema.md
  - PLAN-001-memory-v2-master.md
---

# ADR-079 -- Knowledge-DB-Haertung

## Context

Drei aktive Probleme im Vault-Retrieval-Pfad, sichtbar geworden durch die Memory-v2-Tiefenanalyse:

### Problem 1: BUG-012 (Atomic-Write-Gap)

`sql.js@^1.14.1` exportiert die DB als kompletter Blob via `db.export()`. Schreibvorgang nutzt `fs.promises.writeFile()` -- nicht atomar. Bei Crash mid-write oder Cloud-Sync (iCloud, Dropbox) auf der DB-Datei droht Korruption. Status heute: P1 dokumentiert in `_devprocess/analysis/BUG-012-knowledgedb-corruption.md`, NICHT gefixt. Wahrscheinlichkeit waechst linear mit Schreib-Frequenz, Memory v2 verschaerft das massiv.

### Problem 2: Vault-Rename-Cascade fehlt

Wenn der User eine Note umbenennt, sterben:

- `vectors`-Rows mit altem Pfad
- `implicit_edges` mit altem `from_path`/`to_path`
- `tags`-Joins
- `note_freshness`

Heute: Pfade werden orphan, `semantic_search` liefert tote Treffer, "Open Note"-Tool 404. Latent, aber Recall-Quality leidet.

### Problem 3: Embedding-Model-Drift

`vectors`-Tabelle hat heute keine `embedding_model`-Spalte. Wenn der User das Embedding-Modell wechselt (Settings erlauben das), werden alte Embeddings mit neuen vermischt. Cosine-Scores zwischen Modellen sind nicht vergleichbar -> stille Recall-Verschlechterung.

## Decision

Drei Massnahmen in Phase 0.5 (vor Memory-v2-Phase-1), als Ein-Block-Lieferung:

### Massnahme 1: Multi-File-Atomic-Commit-Pattern

Jeder DB-Export laeuft ueber einen `MultiFileAtomicCommit`-Helper:

```typescript
class MultiFileAtomicCommit {
    async commit(writes: Array<{ targetPath: string; data: Uint8Array }>): Promise<void> {
        const journal = { id: uuid(), pending: writes.map(w => ({ target: w.targetPath, tmp: w.targetPath + '.tmp' })) };
        const journalPath = `${appDataDir}/.commit-journal.json`;

        // Phase 1: Stage alle Files als .tmp
        for (const w of writes) {
            await this.writeAtomic(w.targetPath + '.tmp', w.data);
        }

        // Phase 2: Journal schreiben (Erfolg = Recovery moeglich)
        await this.writeAtomic(journalPath, JSON.stringify(journal));

        // Phase 3: Rotate alte Files zu .bak, rename .tmp zu Original
        for (const w of writes) {
            try { await fs.rename(w.targetPath, w.targetPath + '.bak'); } catch (_) { /* erste Schreibung */ }
            await fs.rename(w.targetPath + '.tmp', w.targetPath);
        }

        // Phase 4: Journal loeschen
        await fs.unlink(journalPath);
    }

    async recoverOnStartup(): Promise<void> {
        // Beim Plugin-Start: Journal vorhanden? Replay oder Rollback.
        const journalPath = `${appDataDir}/.commit-journal.json`;
        if (!await fs.exists(journalPath)) return;
        const journal = JSON.parse(await fs.readFile(journalPath, 'utf-8'));
        // Pruefen ob alle .tmp-Files existieren (= Phase 3 unvollstaendig)
        const allTmpExist = await Promise.all(journal.pending.map((p: any) => fs.exists(p.tmp)));
        if (allTmpExist.every(Boolean)) {
            // Replay: Phase 3 vollenden
            for (const p of journal.pending) {
                try { await fs.rename(p.target, p.target + '.bak'); } catch (_) {}
                await fs.rename(p.tmp, p.target);
            }
        } else {
            // Rollback: .tmp-Files loeschen
            for (const p of journal.pending) {
                try { await fs.unlink(p.tmp); } catch (_) {}
            }
        }
        await fs.unlink(journalPath);
    }
}

async function writeAtomic(path: string, data: Uint8Array | string) {
    await fs.writeFile(path, data);
    // fsync fuer Crash-Sicherheit
    const fh = await fs.open(path, 'r+');
    await fh.sync();
    await fh.close();
}
```

Anwendung:

- **Setup A (Single-Device):** Plugin haelt memory.db + history.db + knowledge.db (knowledge ggf. Vault-resident via FEATURE-0301), Multi-File-Atomic-Commit ueber 2-3 Files je nach knowledge.db-Lokalitaet
- **Setup B (Vault-Sync):** Plugin haelt alle DBs Vault-resident, Multi-File-Atomic-Commit + Single-Writer-Lock per PID weil mehrere Plugins
- **Setup C (Central-Service):** Persistenz-Service haelt memory.db + history.db, Plugin haelt knowledge.db separat. Atomic-Commit pro Standort (Service-Process commitet 2 Files, Plugin commitet knowledge.db separat). Cross-Standort-Konsistenz wird via FactIntegrator-Logik (FEATURE-0318) garantiert, nicht via Multi-File-Lock.
- Coordinated Commits, wenn mehrere DBs in einem Standort gemeinsam geaendert wurden
- **Setup-Migration (FEATURE-0319):** Migration-Journal als Sub-Typ des Multi-File-Atomic-Commit-Journals. Beim Plugin-Restart werden zwei Journal-Typen erkannt -- normale DB-Commit-Journals (Replay vs. Rollback wie bisher) und Migration-Journals (komplette Setup-Wechsel-Phase atomar abbilden, Quelle als `.bak` erhalten). Migration-Journal speichert: source-Setup, target-Setup, Phase (lock | dump | restore | settings-update | smoke-test | done), Conflict-Resolution-Mode.

### Massnahme 2: Vault-Rename-Cascade

Ein zentraler `VaultRenameHandler` registriert sich auf `vault.on('rename')` (Files) und `vault.on('rename')` (Folders, rekursiv) und cascadiert URI-Updates in beide DBs (siehe ADR-078 Snippet).

Edge-Cases:

- **Rename waehrend Indexing:** Mutex pro Pfad, Rename wartet bis Index-Op fertig.
- **Folder-Rename mit vielen Notes:** Batch-UPDATE per `WHERE path LIKE 'vault://oldFolder/%'`.
- **Rename ins Trash:** Wird als Delete behandelt -> Cascade-Delete plus Soft-Marker fuer eventuelle Restore.
- **Konflikt beim Rename:** Wenn neuer Pfad schon existiert, Rename wird vom Vault verhindert (Obsidian-Verhalten).

### Massnahme 3: Embedding-Model-Spalte in vectors

```sql
-- knowledge.db Migration
ALTER TABLE vectors ADD COLUMN embedding_model TEXT NOT NULL DEFAULT 'unknown';
CREATE INDEX idx_vectors_model ON vectors(embedding_model);
```

Bestehende Rows bekommen `'unknown'`. Bei Modell-Wechsel:

- Neue Embeddings tragen aktuelles Modell
- Cosine-Suche filtert auf gleiches Modell (`WHERE embedding_model = :currentModel`)
- Hintergrund-Re-Embed-Job fuellt `'unknown'`-Rows mit aktuellem Modell, falls User es triggert

### Zusaetzlich: Cloud-Sync-Abwehr

Lock-File `.obsilo-lock` waehrend der Schreib-Phase. Verhindert Doppel-Writes durch parallele Plugin-Instanzen (z.B. iCloud Sync auf zwei Geraeten). UI-Notice bei Lock-Konflikt.

Empfehlung in Plugin-Settings: `~/.obsidian-agent/` aus Cloud-Sync ausschliessen. Doku-Snippet in Settings-Tab.

### Integrity-Check beim Load

Beim DB-Open:

```typescript
const result = db.exec("PRAGMA integrity_check;")[0]?.values?.[0]?.[0];
if (result !== 'ok') {
    // Auto-Recovery aus .bak
    await restoreFromBackup(dbPath);
    new Notice('Database recovered from backup. Some recent changes may be lost.');
}
```

## Consequences

**Positiv:**

- BUG-012 wird endgueltig adressiert, nicht nur dokumentiert
- Memory v2 baut auf hardened Foundation, nicht auf bekannt-instabiler
- Vault-Retrieval wird heute schon stabiler (Rename-Cascade fixt latenten Bug)
- `embedding_model`-Spalte erlaubt sauberen Modell-Wechsel ohne Recall-Verlust
- Multi-File-Atomic-Commit ist UCM-tauglich (UCM-Sidecar-DB nutzt dasselbe Pattern)

**Negativ:**

- Schreib-Aufwand pro DB-Save erhoeht sich (write `.tmp` + journal + rotate `.bak` + rename + unlink journal -> 5 FS-Ops statt 1)
- Bei iCloud/Dropbox-Vaults: zusaetzliche `.tmp`/`.bak`-Files werden mit-synced (storage-Aufschlag)
- Lock-File-Pattern braucht UI-Behandlung fuer Edge-Cases (zwei Geraete gleichzeitig)
- Re-Embed-Job ist eigene UX-Frage (background vs. user-triggered)

**Risk:** Performance-Aufschlag pro Save bei haeufigen Memory-Touch-Events. Mitigation: Write-Batching (alle pending Writes in einem Commit-Block).

## Alternatives Considered

1. **WAL-Mode-Equivalent in sql.js bauen** -- Nicht moeglich, sql.js hat keinen WAL.
2. **Wechsel zu native better-sqlite3** -- Vom Review-Bot blockiert.
3. **Wechsel zu wa-sqlite mit OPFS** -- Plugin laeuft nicht im Browser-Context, OPFS nicht verfuegbar.
4. **Nur Periodic Backup, kein Atomic Write** -- Source-Doc-Vorschlag, reicht nicht weil Korruption zwischen Backup-Intervallen passiert.

## Verification

Phase 0.5 muss folgende Tests grun haben:

- Fault-Injection: writeFile wirft mid-write -> Recovery aus .bak greift
- Crash-Simulation: Plugin-Kill zwischen Phase 2 (Journal) und Phase 3 (Rename) -> Replay komplettiert
- Rename-Cascade: Note umbenennen -> alle 5 Tabellen aktualisiert
- Folder-Rename mit 100 Notes -> Batch-UPDATE in < 200ms
- Modell-Wechsel: Cosine-Suche filtert korrekt auf aktuelles Modell, alte 'unknown'-Embeddings werden ausgeschlossen
- Lock-File: Zweiter Plugin-Start mit aktiver Lock -> Notice, kein Schreibversuch

## Open Questions

- Lock-File-TTL: was wenn Plugin abstuerzt mit aktiver Lock? Vermutlich PID-basierte Validation
- Cloud-Sync-Konflikt-Detection: erkennen wir Sync-Konflikte aktiv (z.B. .icloud-Suffix), oder vertrauen wir auf den User?
- Re-Embed-Job UX: Toast mit Progress oder Settings-Button?
