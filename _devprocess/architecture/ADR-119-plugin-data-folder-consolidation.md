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

## Amendment 2026-05-20 (Mid-course design discovery, Phase 2c)

Beim Codebase-Reconciliation-Pass fuer FEAT-29-01 wurde sichtbar, dass die ursprueschliche Lesart "drei Drift-Pfade auf einen kanonischen Pfad" die Realitaet nicht trifft. Tatsaechlich existieren drei vault-local Verzeichnisse mit unterschiedlicher Funktion:

- `.obsidian-agent/` ist eine echte Legacy aus einer aelteren Namens-Welle, enthaelt heute nur Telemetry-Reste, sollte abgebaut werden.
- `.obsilo-vault/` ist der heutige Agent-Daten-Folder (knowledge.db, Skills, Plugin-Skill-Snapshots).
- `.vault-operator/` ist ein bewusst angelegter Optional-Asset-Cache aus dem v2.10er-Refactor (Office-Bundles, PDF-Bundles, ONNX-WASM, Sandbox-Worker). Funktional getrennt von User-Daten.

Zusaetzlich wurde sichtbar, dass im Code bereits zwei Naming-Wellen released sind: `migrateFolderRename.ts` migriert `.obsidian-agent` auf `obsilo-vault` (vault-local), und `GlobalFileService.ts` setzt `vault-operator-shared` als kanonischen vault-parent-Folder mit Legacy-Aliases `obsilo-shared` und `.obsidian-agent`. EPIC-29 setzt die naechste Welle auf, die nun aber nicht "drei auf einen" sondern "die letzte Branding-Welle plus Sub-Folder-Strukturierung" ist.

**Korrigierte Entscheidung (Variante B' mit Cleanup, ueberholt durch dritte Iteration unten):**

Daten und Cache leben unter unterschiedlichen Roots, weil sie unterschiedliche Sync-Semantik brauchen. User-Daten bleiben vault-local und syncen ueber iCloud / Obsidian-Sync mit. Wiederherstellbare Assets, Worker-Files und Tempfiles leben device-local in dem schon released en `vault-operator-shared/`-Folder (FEATURE-1508, FIX-28-00-03) ausserhalb des Vault-Trees, damit grosse Assets wie das 12 MB ONNX-WASM-Modul nicht ueber Geraete-iCloud-Sync repliziert werden.

Ziel-Layout:

```
{vault}/.vault-operator/data/          # vault-local, iCloud-synct
{vault-parent}/vault-operator-shared/cache/   # device-local, nicht iCloud-synct
```

Migration:

- `.obsilo-vault/{knowledge.db, knowledge.db.bak, .bak/, plugin-skills/, skills/, vault-dna.json}` wird nach `{vault}/.vault-operator/data/*` migriert.
- `.obsidian-agent/{telemetry/, ...}` (Legacy) wird nach `{vault}/.vault-operator/data/telemetry/` migriert (falls noch Daten vorhanden) und der alte Pfad geloescht.
- `{vault}/.vault-operator/{assets/, runtime/}` (heute vault-local Optional-Asset-Cache) wird nach `{vault-parent}/vault-operator-shared/cache/{assets/, runtime/}` migriert.
- `.obsilo-vault/tmp/` und `.obsilo-vault/soak-reports/` werden nach `{vault-parent}/vault-operator-shared/cache/tmp/` und `.../soak-reports/` migriert.

`vault-operator-shared/checkpoints/` und `vault-operator-shared/dev-env/` (schon released, FIX-28-00-03) sind davon nicht betroffen, sie sind schon dort.

Die Migration laeuft in drei Phasen: erst data-Move (vault-local Source -> vault-local Ziel), dann cache-Move (vault-local Source -> vault-parent Ziel), dann Legacy-Cleanup. Alle Phasen nutzen das gleiche Doppel-Lesen-Fenster-Pattern und Backup-Snapshot. Atomic-Migration auf der gleichen Filesystem-Partition (fs.rename), Copy-Plus-Delete-Fallback bei EXDEV (vor allem fuer cache-Move plausibel, weil vault-local zu vault-parent ueber verschiedene iCloud-Subdomains laufen kann).

Code-Wiederverwendung: `migrateFolderRename.ts` (vault-local Rename) und `migratePluginDataDirs.ts` (vault-local zu vault-parent Move) sind die existierenden Vorbilder und werden erweitert statt neu gebaut.

## Amendment 2026-05-20 (dritte Iteration, finale Entscheidung)

Beim Codebase-Reconciliation-Pass wurde sichtbar, dass die Storage-Topologie noch komplexer war als die zweite Iteration angenommen hat:

- vault-parent (`{vault-parent}/obsilo-shared/`) enthaelt nicht nur Cache-Inhalte (checkpoints, dev-env), sondern auch substantielle Cross-Vault-Shared-Plugin-Daten (history mit 252 Eintraegen, memory.db 8.8 MB, memory/, episodes/, logs/, rules/, workflows/, skills/).
- skills/ liegt mit unterschiedlichem Inhalt in vault-local (`.obsilo-vault/skills/`, 8 Eintraege) UND vault-parent (`obsilo-shared/skills/`, 6 Eintraege). Echte Drift, vier Skills nur in vault-local, zwei nur in vault-parent.
- Bei Vaults im iCloud-Mobile-Documents-Container (Sebastians Setup) syncet vault-parent ebenfalls ueber iCloud Drive. Die vault-parent-Strategie aus FIX-28-00-03 schuetzt nur vor Obsidian-Mobile-Indexer-Stall, nicht vor iCloud-Sync-Last.
- Cross-Vault-Sharing ist ein eigenes User-Werkzeug, nicht ein automatischer Side-Effect der Storage-Lokation.

**Finale Entscheidung (Option 1 mit Backup-Tool):**

Alles Plugin-State landet vault-local unter `{vault}/.vault-operator/`. Zwei Sub-Folders trennen Persistenz-Semantik:

- `{vault}/.vault-operator/data/`: User-State, Plugin-Daten, persistent gewuenscht
- `{vault}/.vault-operator/cache/`: Regenerierbar, kann jederzeit geloescht werden ohne Datenverlust

Cross-Vault-Sharing wird durch ein separates Backup- und Export-Tool (FEAT-29-12 in Welle 4) bereitgestellt, das selektiven ZIP-Export plus Import ermoeglicht. Damit faellt vault-parent als Storage-Lokation fuer Plugin-Daten weg.

Migration-Quellen (alle nach `{vault}/.vault-operator/`):

- `.obsilo-vault/{knowledge.db, knowledge.db.bak, .bak/, plugin-skills/, skills/, vault-dna.json}` -> `data/*`
- `.obsilo-vault/{tmp/, soak-reports/}` -> `cache/*`
- `.obsidian-agent/*` (Legacy) -> `data/telemetry/*`, alter Pfad entfernt
- `{vault-parent}/obsilo-shared/{history/, history.db plus .bak, memory/, memory.db plus .bak, memory-v1-backup/, episodes/, logs/, rules/, workflows/, pending-extractions.json}` -> `data/*`
- `{vault-parent}/obsilo-shared/skills/` -> Drift-Merge mit vault-local-skills (siehe unten)
- `{vault-parent}/obsilo-shared/{checkpoints/, dev-env/, tmp/, .bak/}` -> `cache/*`
- `{vault-parent}/obsilo-shared/settings.json` -> evaluieren, ggf. mit Plugin-data.json mergen oder als Legacy-Backup ablegen

**Drift-Aufloesung fuer skills/:**

Beide Quell-Pfade haben unterschiedlichen Inhalt. Migration mergt durch Union:
- Skills die nur in einer Quelle existieren werden uebernommen
- Skills die in beiden Quellen existieren werden nach mtime aufgeloest: neuere Version gewinnt, aeltere wird als Snapshot in `.versions/` des Skill-Folders abgelegt (analog zu FEAT-29-09 Skill-Versionierung, aber als Migrations-Side-Effect)

**chatHistoryFolder-Abschaffung:**

Das `chatHistoryFolder`-Setting wird in dieser Migration entfernt. ConversationStore wird Single-Source-of-Truth fuer Chat-History. User, die das Setting aktiv genutzt haben, sehen beim ersten Boot ein Migrations-Modal: "Setting entfernt, Conversations sind weiter via Plugin-Sidebar zugaenglich. Dein Vault-Folder ({alter Pfad}) bleibt unangetastet und kann manuell geloescht werden, falls nicht mehr benoetigt."

**Reset-Buttons als echte Migration:**

Settings-UI bekommt einen Reset-Button pro Pfad-Setting plus einen Reset-all-Button. Der Reset macht eine echte File-Migration: liest aus altem Pfad, schreibt nach neuem Default-Pfad, loescht alten Pfad. Nicht nur Setting-Aenderung.

**Migration in Phasen:**

1. Backup-Snapshot des gesamten alten Layouts in einen Pfad ausserhalb iCloud-Sync
2. Data-Migration vault-local plus vault-parent shared -> `.vault-operator/data/`
3. Cache-Migration -> `.vault-operator/cache/`
4. Legacy-Cleanup (`.obsidian-agent`, `.obsilo-vault`, `obsilo-shared`) entfernen
5. Settings-Update (`agentFolderPath` auf neuen Default, `chatHistoryFolder` entfernt)
6. Migrations-Report-JSON

Alle Phasen sind idempotent und resumable via `_layoutMigrationStatus` Settings-Flag.

## Related decisions

- ADR-72: Konfigurierbarer Agent-Storage-Root. ADR-119 amends ADR-72 mit dem neuen Default-Pfad und der Sub-Folder-Strukturierung.
- FEATURE-1508 (Vault-Parent-Folder-Rename auf `vault-operator-shared`): bereits released, ADR-119 baut darauf auf und uebernimmt das Migrations-Pattern.

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
