---
id: ADR-119
title: Plugin-Daten-Ordner-Konsolidierung auf einen kanonischen Pfad
date: 2026-05-20
deciders: [Sebastian, Architekt-Agent]
asr-refs: [ASR-29-01, ASR-29-02]
feature-refs: [FEAT-29-01]
related-adrs: [ADR-72]
supersedes: null
superseded-by: null
---

# ADR-119: Plugin-Daten-Ordner-Konsolidierung auf einen kanonischen Pfad

## Context

Heute existieren im Vault drei aktive Plugin-Daten-Verzeichnisse fuer dasselbe Plugin: ein historisches Haupt-Verzeichnis mit Datenbank, Skills und Plugin-Skill-Snapshots, ein Legacy-Verzeichnis das nur noch Telemetry-Daten haelt, und ein parallel neueres Verzeichnis fuer Assets und Runtime-Caches. Die drei Verzeichnisse sind durch wiederholtes Rebranding und schrittweise Refactors entstanden. Das Plugin selbst heisst inzwischen anders als das Haupt-Verzeichnis, was die Drift offensichtlich macht und das Debugging erschwert.

ADR-72 hat den Mechanismus fuer einen konfigurierbaren Agent-Storage-Root eingefuehrt, mit Default auf den damaligen historischen Pfad. Mit dem Branding-Wechsel und der entstandenen Mehrfach-Struktur ist eine erneute Architektur-Entscheidung faellig: welche Konvergenz auf einen Pfad ist sicher, abwaerts-kompatibel und sichtbar fuer den User?

**Triggering ASR:**
- ASR-29-01 (Critical): Doppel-Lesen-Fenster waehrend Migration, alter und neuer Pfad parallel
- ASR-29-02 (Critical): Backup-Snapshot vor erstem Schreiben
- Quality attribute: Data Integrity, Maintainability, User-Trust

## Decision drivers

- **Daten-Integritaet zuerst**: Plugin-Daten enthalten knowledge.db (hundert Megabyte plus), die nicht trivial reproduzierbar ist (Reindex kostet Tokens). Migration muss verlustfrei sein.
- **Abwaerts-Kompatibilitaet im Lese-Pfad**: bestehende Vaults muessen waehrend und nach Migration ohne User-Aktion lauffaehig bleiben.
- **Konvergenz mit Plugin-Branding**: der Daten-Ordnername sollte zum Plugin-Namen passen, damit Debugging und Doku konsistent sind.
- **iCloud-Sicherheit**: Migration darf keine iCloud-Sync-Konflikte ausloesen (kein Parallel-Schreiben auf gleichen Pfad waehrend Migration).
- **Resumable**: Crash, Power-off oder Plugin-Reload mitten in der Migration darf den Vault nicht in einen halb-migrierten Zustand bringen.

## Considered options

### Option 1: Big-Bang-Migration in einem onload-Pass

Beim ersten Plugin-Start nach Update werden alle drei Verzeichnisse atomar auf einen einzigen kanonischen Pfad umgezogen, Backup vorher angelegt. Lese-Pfade werden gleichzeitig umgestellt.

- Pro: Klare Semantik, ein klar definierter "vorher" und "nachher" Zustand.
- Con: Race-Condition wenn Plugin waehrend Migration neu geladen wird. User sieht moeglicherweise einen kurzen Boot-Lock.

### Option 2: Doppel-Lesen-Fenster mit gestaffelter Migration

Migration laeuft in Phasen. Phase 1 schreibt einen Backup-Snapshot. Phase 2 kopiert Daten zum neuen Pfad. Phase 3 markiert den alten Pfad als Read-Only. Phase 4 schaltet Schreib-Operationen auf den neuen Pfad um. Phase 5 markiert die Migration als abgeschlossen. Waehrend aller Phasen kann der Lese-Pfad sowohl aus altem als auch neuem Verzeichnis liefern, mit Praezedenz fuer den neuen Pfad sobald dort Daten existieren.

- Pro: Resumable, race-condition-sicher, kein Lock-Boot.
- Pro: Bei Crash mid-flight kann der naechste Start die Migration fortsetzen oder zuruecksetzen.
- Con: Mehr Code-Komplexitaet, Lese-Pfad-Logik wird transient kompliziert.

### Option 3: Belassen und nur den Lese-Pfad transparent machen

Drei Pfade bleiben physisch. Ein Pfad-Locator-Service entscheidet pro Daten-Typ, in welchem Pfad die Datei liegt.

- Pro: Kein Migration-Risiko.
- Con: Ordner-Drift bleibt sichtbar im Filesystem, Branding-Konflikt bleibt, neue Daten landen weiter in willkuerlichen Pfaden.

## Decision

**Proposed option:** Option 2, Doppel-Lesen-Fenster mit gestaffelter Migration.

**Reasoning:**
Daten-Integritaet ist der dominante Treiber, und die Resumability-Eigenschaft macht Option 2 die einzige sichere Wahl angesichts der knowledge.db-Groesse und der iCloud-Sync-Umgebung. Der Komplexitaets-Aufschlag im Lese-Pfad ist temporaer (eine Phase) und wird nach Abschluss der Migration auf einen Pfad reduziert.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Plugin-Daten leben langfristig unter einem einzigen, Branding-konsistenten Pfad.
- Backup-Pattern (Snapshot vor jeder Migration) wird als wiederverwendbares Tool etabliert und kann fuer spaetere Folder-Aenderungen wiederverwendet werden.
- Lese-Pfad-Logik ist resilient gegen Crashes und Plugin-Reloads waehrend Migration.

### Negative

- Mehrphasige Migration ist komplexer zu testen als ein Big-Bang.
- Doppel-Lesen-Fenster bedeutet kurzzeitig zwei aktive Datenpfade, was Debugging-Output unscharf machen kann.

### Risks

- **knowledge.db Migration korrupt**: mitigation durch Backup-Snapshot in einem Pfad ausserhalb des iCloud-synced Vault-Tree, plus Hash-Vergleich vor und nach Move.
- **iCloud-Konflikt waehrend Migration**: mitigation durch Read-Only-Markierung des alten Pfads als erster Schreib-Akt, danach Daten-Move.
- **Mid-flight Plugin-Reload**: mitigation durch Resume-Flag in Settings, naechster Start prueft Migration-Status und faehrt fort oder rollt zurueck.

## Related decisions

- ADR-72: Konfigurierbarer Agent-Storage-Root. ADR-119 amends ADR-72 mit dem neuen Default-Pfad und der Migrations-Mechanik aus den drei historisch entstandenen Verzeichnissen.

## References

- FEAT-29-01: Folder-Konsolidierung
- EPIC-29: Skills-Konsolidierung und Plugin-as-Skill Reliability

---

## Implementation Notes (optional, may go stale)

Erste Skizze fuer die /coding-Phase:

- Der Migrations-Code lebt in einem neuen Service (analog zum bestehenden `migratePluginDataDirs` Service aus FIX-28-00-03, der dort fuer Mobile-Sync das gleiche Pattern auf einem anderen Pfad-Paar gemacht hat).
- Backup-Snapshot liegt unter einem Pfad ausserhalb des iCloud-synced Vault-Trees, beispielsweise im Plugin-Daten-Verzeichnis von Obsidian selbst.
- Settings-Flag `agentFolderPath` aus ADR-72 wird zum Migrations-Trigger umfunktioniert: alter Default wird beim ersten Boot auf neuen Default gemappt, alter Wert bleibt als Resume-Anker erhalten bis Migration abgeschlossen.
- Die Migrations-Routine schreibt einen Migrations-Report als JSON in den neuen Pfad, damit /testing und Audit den Erfolg verifizieren koennen.
