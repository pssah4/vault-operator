# Feature: Frontmatter-Write Toggle plus Backfill-Job

> **Feature ID**: FEAT-19-10
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 7.2 Retrieval
> **Priority**: P1
> **Effort Estimate**: M

## Feature Description

Bindende User-Entscheidung Variante B: Default OFF. Wenn User in Settings aktiviert, schreibt das System fehlende Frontmatter-Properties (Zusammenfassung, tags, Themen, Konzepte) struktur-erhaltend in die Vault-Note. Bei Aktivierung wird einmaliger Backfill-Job ausgeloest, der bestehende Notes durchgeht.

Bestehende Properties werden NIE ueberschrieben oder geloescht. Nur fehlende Properties werden ergaenzt. Backfill-Job zeigt Progress-UI, kann pausiert/abgebrochen werden, hat Pre-Diff-Preview.

## Benefits Hypothesis

Wir glauben, dass setting-gated Frontmatter-Write von Power-Usern aktiv genutzt wird (BA-25 H-03: > 30% Adoption in 4 Wochen), waehrend Casual User durch Default-OFF geschuetzt sind. Folgende messbare Outcomes liefert: Backfill bewahrt 100% bestehender Properties unveraendert (BA-25 H-06); User hat jederzeit Reversibilitaets-Pfad ueber Vault-Backups.

Wir wissen, dass wir erfolgreich sind, wenn Backfill ohne Datenverlust auf Sebastians 1.500-Notes-Vault laeuft.

## User Stories

**Story 1:** Als Sebastian moechte ich Frontmatter-Pflege im Vault aktivieren, um meine MOC-Pages und Vault-Native-Tools (Bases, Dataview) mit aktuellen Properties zu fuettern.

**Story 2:** Als Power-User moechte ich beim Backfill-Lauf einen Diff-Preview sehen pro Note, bevor das System schreibt, um Trust aufzubauen.

**Story 3:** Als User moechte ich den Backfill jederzeit pausieren oder abbrechen, ohne dass partielle Aenderungen Probleme machen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Default ist OFF | Keine Vault-Aenderungen ohne Aktivierung | Manueller Test |
| SC-02 | Bestehende Properties werden nie ueberschrieben | 100% Bestehendes erhalten | Diff-Audit |
| SC-03 | Backfill zeigt Progress | Live-UI mit Note-Count, ETA | Manueller Test |
| SC-04 | Backfill kann pausiert/abgebrochen werden | Stop ohne korrupten Zustand | Integration-Test |
| SC-05 | Pre-Diff-Preview pro Note (oder Batch) | User kann pro Note approven | Manueller Test |

## Technical NFRs

- **Performance:** Backfill arbeitet im Hintergrund, blockiert UI nicht.
- **Atomicity:** Pro-Note-Write atomisch, kein partieller Frontmatter-Bruch.
- **Conflict-Detection:** wenn Note waehrend Backfill veraendert wird, Skip mit Notification.
- **iCloud-Safety:** Backfill respektiert Sync-Conflicts, retry-faehig.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Frontmatter-Write muss struktur-erhaltend sein (existing replaceInFile-Pattern oder Aequivalent).
- **ASR-2 (Critical):** Conflict-Detection bei parallelem User-Edit. Bei Konflikt: kein Write, Log, Notification.
- **ASR-3 (Moderate):** Approval-Modell ist Open Question fuer Architektur (pro Note vs Batch vs Settings-Level).

## Definition of Done

- Settings-Toggle plus UI-Beschreibung mit Warnung "veraendert Vault-Files".
- Backfill-Job-Runner mit Progress-UI.
- Pre-Diff-Preview im Vault-Health-Modal.
- Pause/Resume/Abort-Steuerung.
- Live-Test auf Sebastians Vault: 100 Notes Backfill mit kompletter Diff-Analyse (kein Property-Verlust).
