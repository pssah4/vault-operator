---
id: FEAT-29-09
title: Skill-Versionierung mit Snapshot und Restore
epic: EPIC-29
priority: P1
effort: M
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-02, FEAT-29-05]
created: 2026-05-20
---

# Feature: Skill-Versionierung mit Snapshot und Restore

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-09
> (status, phase, claim, last-change leben dort).

## Feature description

Skills aendern sich ueber die Zeit: der skill-creator iteriert, der User editiert manuell, der Translator schreibt eine Konversion. Heute gibt es kein Sicherheitsnetz. Wenn eine Aenderung den Skill schlechter macht, ist die vorherige Version verloren. Dieses Feature bringt Versionierung pro Skill nach dem Vorbild von FEAT-01-07 Checkpoints. Bei jedem Schreibvorgang auf einen Skill wird automatisch ein Snapshot mit Timestamp und kompaktem Diff in `.vault-operator/skills/{type}/{name}/.versions/` abgelegt. Im SkillsTab gibt es eine "Versions"-Ansicht pro Skill mit Liste der Snapshots und einem Restore-Button. Restore stellt den Skill auf die gewaehlte Version zurueck und legt vorher einen impliziten Snapshot der aktuellen Version an (damit der Restore selbst auch rueckholbar ist). Retention ist konfigurierbar (Default: letzte 20 Versionen plus alle vom User markierten Tags).

## Benefits hypothesis

**Wir glauben dass** automatische Snapshots vor jeder Skill-Aenderung
**folgende messbare Wirkung erzielt:**

- User experimentiert risikoarm mit Skill-Aenderungen
- Skill-Translator-Ergebnisse koennen verworfen werden ohne manuelles Backup
- Versions-Storage bleibt klein (Diff-basiert)

**Wir wissen dass wir erfolgreich sind, wenn:**

- 100% der Schreibvorgaenge auf einen Skill erzeugen automatisch einen Snapshot
- Restore funktioniert in unter 2 Sekunden
- Storage-Overhead pro Skill bleibt unter 5% der Original-Groesse

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will eine fruehere Skill-Version wiederherstellen koennen | Story 1 |
| Emotional | User will Aenderungen am Skill ausprobieren ohne Angst | Story 2 |
| Social | User will eine bestimmte Skill-Version markieren ("die war gut") | Story 3 |

## User stories

### Story 1: Restore einer fruehen Version (Functional Job)

**Als** User der einen Skill iteriert und feststellt dass die letzte Aenderung schlechter ist
**moechte ich** auf eine fruehere Version zurueckkehren,
**damit** ich nicht manuell aus dem Gedaechtnis rekonstruieren muss.

### Story 2: Risikoarmes Experimentieren (Emotional Job)

**Als** User der einen funktionierenden Skill veraendern moechte
**moechte ich** wissen dass die alte Version sicher gespeichert ist,
**damit** ich ohne Angst experimentiere.

### Story 3: Versionen markieren (Social Job)

**Als** User der eine besonders gute Version eines Skills hat
**moechte ich** sie als "Release v1.0" markieren,
**damit** ich sie spaeter explizit wiederherstellen kann auch wenn die Retention die regulaeren Snapshots verworfen hat.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Automatischer Snapshot bei jeder Skill-Schreib-Aktion | 100% Coverage | Test mit allen Schreib-Pfaden (skill-creator, manueller Edit, Translator) |
| SC-02 | Restore unter 2 Sekunden | 95th percentile unter 2s | Performance-Messung |
| SC-03 | Storage-Overhead unter 5% der Original-Skill-Groesse pro Version | gemittelt ueber 20 Versionen | Filesystem-Messung |
| SC-04 | Restore legt selbst einen Snapshot der vorherigen Version an | Restore ist rueckholbar | Manueller Test |
| SC-05 | User kann Versionen taggen und vor Retention schuetzen | Tagged Versionen ueberleben Retention-Cycle | Test mit 50 Snapshots und Retention=20 |

---

## Technical NFRs

### Performance

- Snapshot-Anlage unter 100 ms fuer typischen Skill (SKILL.md + 5 Skripte).
- Restore unter 2 Sekunden inklusive impliziter Snapshot der aktuellen Version.

### Security

- Snapshots respektieren die gleichen Permissions wie der Skill-Folder selbst.
- Keine Plaintext-Sensitive-Daten im Diff (wenn der Skill Secrets enthaelt, werden Diffs als rotated-secret-aware markiert).

### Scalability

- Bis zu 100 Versionen pro Skill ohne spuerbare Performance-Einbussen im SkillsTab-Listing.

### Availability

- Bei Korruption eines Snapshots: User-Warnung, andere Snapshots bleiben nutzbar.
- Bei Storage-Voll: Retention-Cycle laeuft an, alte Snapshots werden geloescht (mit User-Bestaetigung wenn ueber Schwelle).

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Diff-basierte Snapshots statt voller Kopien

- Begruendung: Volle Kopien wuerden Storage und Sync-Last (iCloud) drastisch erhoehen.
- Impact: Snapshot-Format ist ein Diff, Restore rekonstruiert ueber Diff-Chain.
- Qualitaetsattribut: Storage Efficiency.

**MODERATE ASR #2:** Atomic Snapshot-Plus-Write

- Begruendung: Wenn der Snapshot-Schritt fehlschlaegt, darf der Schreibvorgang nicht stattfinden.
- Impact: Skill-Writer-Pfad muss als Transaktion gefuehrt werden (Snapshot + Write atomar).
- Qualitaetsattribut: Data Integrity.

**MODERATE ASR #3:** Tagged Versionen

- Begruendung: User braucht eine Moeglichkeit "wichtige" Versionen zu markieren die Retention ueberleben.
- Impact: Versions-Liste hat Tags-Feature, Retention-Logik respektiert Tags.
- Qualitaetsattribut: User-Memory.

### Constraints

- Snapshots leben innerhalb des Skill-Folders (`.versions/`-Unterordner), damit sie mit dem Skill kopiert oder verschoben werden.
- Snapshot-Format ist textuell (kein binaeres Diff), damit Audit moeglich ist.

### Open questions for architect

- Wird Diff per file-by-file gemacht oder ueber den ganzen Folder als Tarball?
- Wie wird der Restore-Pfad fuer ein Skill umgesetzt: in-place Schreiben oder Rename-Strategie?
- Wie werden Versionen UI-seitig dargestellt? Zeit, Original-Trigger (skill-creator vs manueller Edit vs Translator), Diff-Vorschau?
- Wie haengt das mit FEAT-01-07 Checkpoints zusammen? Code-Reuse oder neuer Subsystem?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer Snapshot-Anlage und Restore
- [ ] Unit-Tests fuer Diff-Chain und Restore-Rekonstruktion
- [ ] Performance-Test: 50 Versionen, Restore-Latenz gemessen
- [ ] Edge-Case-Test: Korruptes Snapshot in Mitte der Chain

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] SkillsTab-UI dokumentiert Versions-Ansicht
- [ ] CHANGELOG entry beschreibt Snapshot-Mechanik

---

## Hypothesis validation

| Hypothese | Test-Methode | Erfolgs-Kriterium | Resultat |
|---|---|---|---|
| H-05: Snapshot-basierte Versionierung kostet < 5% Storage und Restore < 2 Sekunden | Messung an einem typischen Skill mit 20 Versionen | Storage und Latenz unter Target | Open |

---

## Dependencies

- **FEAT-29-02 Plugin-Skill-Format-Migration**: Folder-Format als Basis.
- **FEAT-29-05 Skill-Creator-Builtin**: Trigger fuer Snapshots.
- **FEAT-01-07 Checkpoints**: Architektur-Vorbild (kein direkter Code-Reuse aber gleiche Idee).

## Assumptions

- Filesystem kann atomic Renames machen (Standard auf macOS, Linux, Windows-NTFS).
- iCloud-Sync wirft keine Konflikte bei kleinen Diff-Dateien (Standard-Verhalten).

## Out of scope

- Git-basierte Versionierung mit echtem Branch-Konzept (zu komplex fuer das Use-Pattern).
- Cross-Skill-Versionierung (z.B. Workflow-Versionen die mehrere Skills umfassen) -> Folge-Initiative EPIC-31.
- Cloud-basiertes Versions-Sharing.

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `skill-versioning` (neu in dieser Implementierung) und `checkpoint-service` (Vorbild).
