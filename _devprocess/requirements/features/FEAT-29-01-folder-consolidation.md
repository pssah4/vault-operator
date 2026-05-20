---
id: FEAT-29-01
title: Folder-Konsolidierung auf .vault-operator als kanonischen Pfad
epic: EPIC-29
priority: P0
effort: M
asr-refs: []
adr-refs: []
depends-on: []
created: 2026-05-20
---

# Feature: Folder-Konsolidierung auf .vault-operator als kanonischen Pfad

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-01
> (status, phase, claim, last-change leben dort).

## Feature description

Heute existieren im Vault drei parallele Plugin-Daten-Ordner: `.obsilo-vault/` (Haupt-Daten mit knowledge.db, Skills, plugin-skills, tmp), `.obsidian-agent/` (Legacy mit telemetry/) und `.vault-operator/` (Neuer Pfad mit assets/ und runtime/). Diese Drift hat sich ueber mehrere Umbenennungen (obsilo-agent v2.7.3 zu Vault Operator) ergeben und macht die Datenhaltung intransparent. Dieses Feature konsolidiert alle drei Pfade auf den kanonischen `.vault-operator/` Pfad, der zum Plugin-Branding passt. Die Migration laeuft als einmaliger Pass beim ersten Start nach Update, mit vorherigem Backup-Snapshot und einem Doppel-Lesen-Fenster, in dem der alte und neue Pfad parallel verfuegbar sind, bis die Migration validiert wurde.

## Benefits hypothesis

**Wir glauben dass** ein einziger kanonischer Daten-Ordner mit klar benanntem Pfad
**folgende messbare Wirkung erzielt:**

- Anzahl Plugin-Daten-Ordner sinkt von 3 auf 1
- Keine Datenduplikate zwischen den Pfaden
- Plugin-Name (Vault Operator) und Folder-Name (.vault-operator) sind konsistent

**Wir wissen dass wir erfolgreich sind, wenn:**

- Migrations-Report meldet 0 errors fuer alle drei Quell-Pfade
- Nach Migration sind die alten Pfade leer (nur .DS_Store darf bleiben) oder explizit als Legacy markiert
- knowledge.db (288 MB) wird verlustfrei auf den neuen Pfad bewegt, Hash-Check bestaetigt Integritaet

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will einen klaren Ort haben, wo Plugin-Daten leben | Story 1 |
| Emotional | User will Vertrauen haben, dass Daten nicht verloren gehen | Story 2 |
| Social | User will seine Vault-Struktur einem Teammitglied erklaeren koennen ohne historische Drift erklaeren zu muessen | Story 3 |

## User stories

### Story 1: Klar identifizierbarer Daten-Ordner (Functional Job)

**Als** Power-User des Vault Operators
**moechte ich** dass alle Plugin-Daten unter einem einzigen Ordner liegen, dessen Name zum Plugin-Branding passt,
**damit** ich beim Debugging oder Backup nicht raten muss, wo welche Datei liegt.

### Story 2: Sichere Migration mit Backup (Emotional Job)

**Als** User mit knowledge.db von ueber 280 MB plus 138 Plugin-Skills
**moechte ich** dass die Migration vor jedem Schreiben einen Backup-Snapshot anlegt,
**damit** ich auch nach gescheiterter Migration meine Daten zurueckholen kann und nicht Wochen Reindex investieren muss.

### Story 3: Konsistente Vault-Struktur erklaeren (Social Job)

**Als** User der seinen Vault einem Kollegen oder einem Blog-Leser zeigt
**moechte ich** einen Ordnerbaum mit klaren Namen,
**damit** der Plugin-Name (Vault Operator) und der Folder-Name (.vault-operator) ohne Erklaerung zueinander passen.

---

## Success criteria (tech-agnostic)

> Amended 2026-05-20 (dritte Iteration, finale): Option 1 mit allem vault-local plus Backup-Tool als FEAT-29-12. Cross-Vault-Sharing via Backup-Export-Import, nicht via vault-parent.

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Migration legt vor erstem Schreiben ein wiederherstellbares Backup an | 100% der Migrationen mit Backup-Bestaetigung | Migrations-Report-Log |
| SC-02 | Nach Migration liegt alles Plugin-State unter `{vault}/.vault-operator/{data,cache}/`. Drei Legacy-Pfade sind entfernt (`.obsidian-agent`, `.obsilo-vault`, `{vault-parent}/obsilo-shared`) | Nur noch `.vault-operator/` exists, alte Pfade weg | Filesystem-Check |
| SC-03 | Plugin startet nach Migration ohne Reindex- oder Reload-Forderung an den User | Plugin laeuft im ersten Boot nach Migration normal weiter | Manueller Test |
| SC-04 | User kann eine Migration abbrechen und auf den alten Layout zurueckkehren | Restore innerhalb von 5 Minuten moeglich | Manueller Test |
| SC-05 | Doppel-Lesen-Fenster funktioniert: alte und neue Pfade werden waehrend Uebergang beide gelesen | Keine Datenverluste bei Plugin-Reload mitten in der Migration | Test mit Plugin-Disable und Re-Enable |
| SC-06 | Drift-Resolve fuer skills/: Union aus vault-local und vault-parent, bei Konflikt mtime-Praezedenz, alte Version als .versions/-Snapshot | Alle Skills aus beiden Quellen sind in `.vault-operator/data/skills/` vorhanden | Filesystem-Check vor und nach Migration |
| SC-07 | chatHistoryFolder-Setting wird entfernt, ConversationStore wird Single-Source-of-Truth. User der das Setting genutzt hat sieht Migrations-Notice-Modal mit Pfad-Hinweis | Setting nicht mehr im UI, Modal beim ersten Boot wenn relevant | Manueller Test |
| SC-08 | Settings-UI hat Reset-Button pro Pfad-Setting plus Reset-all-Button. Reset macht echte File-Migration (Files umziehen, alten Pfad entfernen), nicht nur Setting-Aenderung | Reset-Button verfuegbar und funktional | Manueller Test |

---

## Technical NFRs

### Performance

- Migrations-Dauer: unter 60 Sekunden fuer einen typischen Vault (knowledge.db ca. 300 MB, 138 plugin-skills, 10 User-Skills, ca. 300 tmp-Files).
- Backup-Snapshot-Anlage: unter 30 Sekunden, parallelisiert wenn moeglich.
- Doppel-Lesen-Window: jeder Filesystem-Lookup hoechstens 2 ms Overhead.

### Security

- Backup-Pfad ausserhalb des Vault-Trees (lokales Plugin-Datenverzeichnis oder konfigurierbarer Backup-Pfad), damit Vault-sync nicht das Backup ueberschreibt.
- Keine Plaintext-Credentials in Backup-Metadaten.
- Backup ist Read-Only nach Anlage, kann nur explizit ueber Restore-Aktion gelesen werden.

### Scalability

- Migration funktioniert fuer Vaults bis 2 GB Plugin-Daten und 500 Plugin-Skills, mit linearer Dauer.
- Bei sehr grossen knowledge.db (5+ GB): Migration in chunks oder per Filesystem-Move statt Kopie, sofern Quell- und Ziel-Pfad auf derselben Partition liegen.

### Availability

- Migration ist resumable: bei Abbruch zur Mitte (Crash, Power-off) kann sie beim naechsten Start fortgesetzt oder zurueckgesetzt werden.
- Plugin-Boot bleibt waehrend Migration funktional eingeschraenkt nutzbar (read-only-Modus mit klarer Anzeige im UI).

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Doppel-Lesen-Fenster waehrend Migration

- Begruendung: Plugin kann waehrend Migration neu starten oder crashen. Alle Lese-Operationen muessen waehrend dieser Phase resilient gegen Quell-/Ziel-Konsistenz sein.
- Impact: SkillRegistry, KnowledgeDB-Loader, alle Code-Pfade die heute auf `.obsilo-vault/` referenzieren.
- Qualitaetsattribut: Availability + Data Integrity.

**CRITICAL ASR #2:** Backup-Snapshot-Strategie

- Begruendung: knowledge.db ist 288 MB, Inhalt nicht trivial reproduzierbar (Reindex via OpenRouter kostet Tokens). Verlust waere schmerzhaft.
- Impact: Storage-Lokation (ausserhalb Vault), Komprimierungs-Entscheidung, Retention.
- Qualitaetsattribut: Data Integrity, Storage Efficiency.

### Constraints

- iCloud-Sync ist aktiv im Vault. Migration darf nicht zu iCloud-Konflikten fuehren (z.B. parallele Schreibvorgaenge waehrend Migration).
- Plugin-Loader-Pfade (`.obsidian/plugins/vault-operator/`) bleiben unveraendert. Nur Datenverzeichnisse werden migriert.
- ADR-072 Konfigurierbarer Agent-Folder muss respektiert werden, der Default-Wert wird auf `.vault-operator/` umgestellt aber Custom-Pfade des Users muessen erhalten bleiben.

### Open questions for architect

- Soll der Backup-Pfad in `~/.vault-operator-backups/` (User-Home) oder im Vault als `.vault-operator-backup/` liegen?
- Welche Retention-Policy fuer Backups? Letzten 3? Letzten 30 Tage? Konfigurierbar?
- Wie wird das Doppel-Lesen-Fenster auf den SkillRegistry-Code-Pfad abgebildet? Adapter-Pattern oder Settings-Toggle?
- Wie loesen wir den `.vault-operator/`-Konflikt zwischen dem aktuellen Inhalt (assets/, runtime/) und dem Ziel-Inhalt (Skills, knowledge.db)?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer Migration-Logik (Backup-Anlage, Restore, Doppel-Lesen-Fenster)
- [ ] Integrations-Test mit echtem 300-MB-Vault
- [ ] Smoke-Test nach Migration: Plugin startet, alle Skills geladen, knowledge.db lesbar
- [ ] Rollback-Test: alte Pfade wiederherstellen, Plugin laeuft wieder mit alten Daten

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] ARCHITECTURE.map updated wenn neuer Migration-Entry-Point
- [ ] CHANGELOG entry erlaeutert Migration und Backup-Pfad
- [ ] ADR fuer Folder-Konsolidierung beschlossen und referenziert

---

## Hypothesis validation

Nicht anwendbar, dieses Feature validiert keine BA-Hypothese, sondern adressiert technische Drift.

---

## Dependencies

- **ADR-072 Konfigurierbarer Agent-Folder**: bestehendes Setting `agentFolderPath` wird wiederverwendet, Default-Wert wird angepasst.
- **knowledge.db Atomic-Write (FEATURE-0314)**: bestehende Atomic-Write-Garantien muessen waehrend Migration erhalten bleiben.

## Assumptions

- User ist bereit einen einmaligen Reload nach Migration zu akzeptieren.
- Filesystem-Mount-Punkt ist stabil waehrend Migration (iCloud-Sync, keine externen Drives die mid-flight rauswachsen).
- Plugin-Bundle-Pfad `.obsidian/plugins/vault-operator/` ist nicht Teil dieser Migration.

## Out of scope

- Migration zwischen verschiedenen Vaults (Cross-Vault-Sync).
- Migration der `.obsidian/plugins/vault-operator/` Code-Bundle-Files.
- Automatische Cleanup-Tasks fuer Backup-Files (manuell oder per Retention-Policy).

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `plugin-data-folder` und `agent-config-dir` (run `grep "plugin-data-folder" src/ARCHITECTURE.map` fuer Entry-Point).
