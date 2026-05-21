---
id: ADR-128
title: Skill-Versionierung mit Diff-basiertem Snapshot und Restore
date: 2026-05-20
deciders: [Sebastian, Architekt-Agent]
asr-refs: [ASR-29-17, ASR-29-18]
feature-refs: [FEAT-29-09]
related-adrs: [ADR-02, ADR-75]
supersedes: null
superseded-by: null
---

# ADR-128: Skill-Versionierung mit Diff-basiertem Snapshot und Restore

## Context

Skills aendern sich ueber die Zeit. Der Skill-Creator iteriert ein Skill in mehreren Turns mit dem User. Der Translator schreibt eine konvertierte Anthropic-Skill. Der User selbst editiert sein Skill manuell im Filesystem. Heute existiert kein Sicherheitsnetz fuer diese Aenderungen. Wenn eine Iteration den Skill verschlechtert, ist die vorherige Version verloren. Das ist eine User-Trust-Bremse fuer das gesamte Skill-Authoring-Toolkit: User experimentieren weniger, weil sie wissen dass Rueckholen aufwaendig ist.

ADR-02 hat fuer den Vault-Inhalt das Checkpoint-Pattern mit isomorphic-git etabliert. Das Pattern ist bewaehrt aber pro Vault, nicht pro Skill. Skills sind kleiner und haben ihre eigene Lifecycle-Klammer (Skill-Creator-Schreibaktion, Translator-Schreibaktion, manueller Edit). Eine Skill-spezifische Snapshot-Schicht ist die natuerliche Loesung.

**Triggering ASR:**
- ASR-29-17 (Critical): Diff-basierte Snapshots statt voller Kopien
- ASR-29-18 (Moderate): Atomic Snapshot-Plus-Write als Transaktion
- Quality attribute: Data Integrity, Storage Efficiency, User-Trust

## Decision drivers

- **Storage-Effizienz**: Skill-Folder koennen Skripte und References enthalten. Volle Kopien bei jeder Aenderung waeren teuer und iCloud-sync-belastend.
- **Atomicity**: Snapshot und Write muessen als Transaktion gefuehrt werden, sonst entsteht bei Crash ein Skill ohne Sicherheitsnetz.
- **Restore-Latenz**: Wiederherstellung muss schnell sein, sonst nutzt es niemand.
- **Tagging**: User braucht Mechanik, wichtige Versionen vor Retention zu schuetzen.
- **Portabilitaet**: Snapshots leben im Skill-Folder, damit sie mit dem Skill kopiert oder verschoben werden.

## Considered options

### Option 1: Vollstaendige Folder-Kopien pro Version

Jede Aenderung erzeugt einen vollstaendigen Snapshot des Skill-Folders unter einem Versionsindex.

- Pro: Einfache Restore-Semantik (Folder-Copy zurueck).
- Con: Storage-Overhead linear mit Versions-Anzahl, iCloud-Sync-belastend.
- Con: Bei grossen Skripten oder Assets schnell unverhaeltnismaessig.

### Option 2: Diff-basierte Snapshots mit Restore via Diff-Chain

Pro Aenderung wird ein Diff zwischen aktuellem und vorherigem Zustand gespeichert. Restore rekonstruiert ueber die Diff-Chain vom aktuellen Stand bis zur Ziel-Version. Snapshot-und-Write laufen als atomare Operation.

- Pro: Storage-Overhead niedrig (typisch unter fuenf Prozent vom Skill-Original).
- Pro: Diffs sind textuell und auditierbar.
- Con: Restore-Latenz steigt mit Diff-Chain-Laenge. Bei vielen Versionen kann Reapply teuer werden.
- Con: Bei Diff-Korruption mid-Chain wird die Wiederherstellung schwierig.

### Option 3: Echtes Git-Sub-Repo pro Skill

Jeder Skill hat ein eigenes Git-Repository als Sub-Folder.

- Pro: Maximale Versions-Granularitaet, Branching moeglich.
- Con: Overkill fuer Skill-Use-Pattern, das selten Branching braucht.
- Con: Komplexe Filesystem-Struktur, Konflikte mit Plugin-Skill-Migration und Skill-Sharing.

## Decision

**Proposed option:** Option 2, Diff-basierte Snapshots mit Restore via Diff-Chain.

**Reasoning:**
Storage-Effizienz und Atomicity sind beide leichter mit Diff-basierten Snapshots zu erreichen, und die Restore-Latenz bleibt im sub-Sekunden-Bereich solange Diff-Chains kurz gehalten werden. Diff-Korruption wird ueber Snapshot-Periodicaltrigger (jeder zehnte Snapshot ist eine volle Kopie) abgefedert, sodass Restore nie ueber mehr als neun Diff-Stufen rekonstruieren muss. Tagging-Logik schuetzt User-Markierte Versionen vor Retention-Cycle.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- User experimentiert risikoarm mit Skill-Aenderungen.
- Skill-Translator-Ergebnisse koennen verworfen werden ohne manuelles Backup.
- Snapshots leben innerhalb des Skill-Folders, sind mit dem Skill kopierbar und teilbar.

### Negative

- Diff-Chain-Code ist komplexer als Vollkopie-Code.
- Bei sehr vielen Versionen (Hundert plus) wird Restore-Latenz spuerbar, daher Retention-Policy noetig.

### Risks

- **Diff-Chain-Korruption mid-Chain**: mitigation durch periodische volle Snapshots (z.B. alle zehn Versionen) damit Restore nie mehr als neun Diff-Stufen reapplien muss.
- **Snapshot-und-Write-Atomicity bricht bei Crash**: mitigation durch Write-Through-Pattern (Diff-Snapshot wird angelegt, dann Skill-Schreibaktion, dann Snapshot als comitted markiert). Bei Crash zwischen den Steps bleibt der vorherige Stand intakt.
- **Storage-Drift bei Aenderungen ausserhalb des skill-creator (z.B. manueller Filesystem-Edit)**: mitigation durch File-Watcher-Trigger, der auch externe Aenderungen als Snapshot-Trigger erkennt.

## Related decisions

- ADR-02: Isomorphic-Git Checkpoints. ADR-124 nutzt das gleiche konzeptionelle Pattern (Snapshot vor potentially-destruktiver Aktion), aber pro Skill statt pro Vault.
- ADR-75: Skill-Package-Architektur. ADR-124 baut Snapshots als Sub-Folder innerhalb des Skill-Folders.

## References

- FEAT-29-09: Skill-Versionierung
- EPIC-29

---

## Implementation Notes (optional, may go stale)

Erste Skizze fuer die /coding-Phase:

- Snapshots liegen in einem .versions-Unterordner innerhalb des Skill-Folders.
- Diff-Format ist textuell (z.B. unified diff oder JSON-Patch fuer SKILL.md, dateibasierter Diff fuer Skripte).
- Restore-Code rekonstruiert von der letzten vollen Snapshot zur Ziel-Version durch sequenzielles Anwenden der Diffs.
- Tagging-Logik liegt im Snapshot-Manifest, Retention-Cycle respektiert getaggte Versionen.
- SkillsTab-UI bekommt eine Versions-Liste pro Skill mit Restore-Button und Tag-Option.
