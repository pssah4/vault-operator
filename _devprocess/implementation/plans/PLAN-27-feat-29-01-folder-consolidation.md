---
id: PLAN-27
title: FEAT-29-01 Folder-Konsolidierung (Variante B mit Cleanup)
date: 2026-05-20
feature-refs: [FEAT-29-01]
adr-refs: [ADR-119, ADR-72]
fix-refs: []
imp-refs: []
supersedes: null
superseded-by: null
pair-id: sebastian-claude-opus-4-7
---

# PLAN-27: FEAT-29-01 Folder-Konsolidierung (Variante B mit Cleanup)

<!--
Backlog row: grep "PLAN-27" _devprocess/context/BACKLOG.md
-->

## Context

Drei vault-local Plugin-Verzeichnisse haben sich ueber Naming-Wellen angesammelt: `.obsidian-agent/` (Legacy mit Telemetry-Resten), `.obsilo-vault/` (User-Daten incl. knowledge.db 288 MB) und `.vault-operator/` (Optional-Asset-Cache aus v2.10er-Refactor). Phase-2c-Reconciliation 2026-05-20 hat das Bild korrigiert: keine drei Drift-Pfade, sondern Legacy plus zwei funktional getrennte Folder.

ADR-119 finale dritte Iteration (Option 1 alles vault-local plus Backup-Tool): alles Plugin-State landet vault-local in `{vault}/.vault-operator/{data,cache}/`. Vierter Quell-Pfad eingeplant: `{vault-parent}/obsilo-shared/` enthaelt Cross-Vault-Shared-Daten (history mit 252 Eintraegen, memory.db 8.8 MB, skills/, rules/, workflows/, episodes/, logs/, checkpoints/, dev-env/) die ebenfalls vault-local migriert werden. Cross-Vault-Sharing wird durch ein separates Backup-Export-Tool (FEAT-29-12 in Welle 4) bereitgestellt, nicht durch vault-parent.

Plus drei Anpassungen aus Diskussion 2026-05-20:
- chatHistoryFolder-Setting wird entfernt (ConversationStore wird Single-Source-of-Truth)
- Drift-Resolve fuer skills/ (vault-local 8 Eintraege, vault-parent 6 Eintraege, 4 Konflikte mit unterschiedlichem Inhalt)
- Settings-Reset-Buttons als echte File-Migration (nicht nur Setting-Wert-Aenderung)

Existierende Migrations-Helper im Code als Vorbild und Basis: `migrateFolderRename.ts` (vault-local Rename), `migratePluginDataDirs.ts` (vault-local zu vault-parent Move, hier umgekehrt), `GlobalFileService.ts` mit Legacy-Aliases.

## Scope

**In Scope:**
- Migration vault-local Daten: `.obsilo-vault/{knowledge.db, knowledge.db.bak, .bak/, plugin-skills/, skills/, vault-dna.json}` -> `{vault}/.vault-operator/data/*`
- Migration vault-local Throwaway: `.obsilo-vault/{tmp/, soak-reports/}` -> `{vault}/.vault-operator/cache/*`
- Migration vault-local Asset-Cache: `{vault}/.vault-operator/{assets/, runtime/}` -> `{vault}/.vault-operator/cache/{assets/, runtime/}` (Sub-Folder-Reorganisation)
- Migration vault-parent shared: `{vault-parent}/obsilo-shared/{history/, history.db plus .bak, memory/, memory.db plus .bak, memory-v1-backup/, episodes/, logs/, rules/, workflows/, pending-extractions.json}` -> `{vault}/.vault-operator/data/*`
- Migration vault-parent cache: `{vault-parent}/obsilo-shared/{checkpoints/, dev-env/, tmp/, .bak/}` -> `{vault}/.vault-operator/cache/*`
- Drift-Resolve fuer skills/: Union aus `.obsilo-vault/skills/` (8 Eintraege) und `{vault-parent}/obsilo-shared/skills/` (6 Eintraege), mtime-Praezedenz bei 4 Konflikt-Skills, aeltere Version als .versions/-Snapshot
- Legacy-Cleanup: `.obsidian-agent/{telemetry/}` -> `{vault}/.vault-operator/data/telemetry/`, alter Pfad entfernt. Plus `obsilo-shared/settings.json` evaluieren und ggf. migrieren
- chatHistoryFolder-Setting-Removal mit Migrations-Notice-Modal beim ersten Boot
- Backup-Snapshot vor erstem Schreiben in Pfad ausserhalb iCloud-Sync (Obsidian-Plugin-Daten-Verzeichnis)
- Doppel-Lesen-Fenster waehrend Migration (alte UND neue Pfade resolvierbar)
- Resume-Logik via `_layoutMigrationStatus` Settings-Flag
- Settings-Default `agentFolderPath` aendert sich auf `.vault-operator/data`
- Settings-UI: Reset-Button pro Pfad-Setting plus Reset-all-Button als echte File-Migration
- Code-Pfad-Updates an allen Stellen die alte Pfade referenzieren (zentralisiert ueber Helper)
- Migrations-Report-JSON pro Phase
- Tests fuer Backup, Restore, Idempotenz, Doppel-Lesen-Fenster, Drift-Resolve, chatHistoryFolder-Removal

**Out of Scope:**
- Migration der `.obsidian/plugins/vault-operator/` Plugin-Bundle-Files
- Backup-Export-Tool (das ist FEAT-29-12, Welle 4)
- Cross-Vault-Sharing-Mechanik (kommt durch FEAT-29-12)
- Migration zwischen verschiedenen Vaults (Cross-Vault-Sync)
- Plugin-Skill-Format-Aenderung (das ist FEAT-29-02 und FEAT-29-03)
- knowledge.db-Schema-Migrationen
- Telemetry-Datenstruktur-Aenderungen jenseits Pfad-Move

## Tasks

### Task 1: Helper `agentFolderPath` zentralisieren

**Ziel:** Sichern dass alle Lese- und Schreib-Stellen ueber einen einzigen Helper laufen, damit der Doppel-Lesen-Fenster-Mechanismus sauber landet.

**Files:**
- Modify: `src/core/utils/agentFolder.ts` (existing, erweitern um `getAgentDataDir()` und `getAgentCacheDir()` Helper)
- Modify: alle Konsumenten die heute `agentFolderPath` direkt lesen, auf neue Helper umstellen (zentral via `getAgentFolderPath` plus Sub-Folder-Resolver)

**Verifikation:**
- Build: `npm run build` gruen
- Test: `npm test -- agentFolder` (existing Tests laufen weiter)

### Task 2: Migrations-Service `migrateAgentLayout.ts` (neu)

**Ziel:** Drei-Phasen-Migration mit Backup, Doppel-Lesen-Fenster, Resume-Flag.

**Files:**
- Create: `src/core/utils/migrateAgentLayout.ts`
- Create: `src/core/utils/__tests__/migrateAgentLayout.test.ts`

**Inhalt (Sketch, dritte Iteration):**
- Phase 1: Backup-Snapshot. Schreibt `.vault-operator-backup-{timestamp}/` im Plugin-Daten-Verzeichnis von Obsidian (ausserhalb iCloud-synced Vault-Tree). Backup deckt alle vier alten Pfade ab.
- Phase 2: Data-Move vault-local. `.obsilo-vault/{knowledge.db, knowledge.db.bak, .bak/, plugin-skills/, skills/, vault-dna.json}` -> `{vault}/.vault-operator/data/*`. `fs.rename` wenn moeglich, Copy-Plus-Delete-Fallback bei EXDEV.
- Phase 3: Cache-Move vault-local. `{vault}/.vault-operator/{assets/, runtime/}` plus `.obsilo-vault/{tmp/, soak-reports/}` -> `{vault}/.vault-operator/cache/{assets/, runtime/, tmp/, soak-reports/}`.
- Phase 4: Shared-Daten-Move vault-parent zu vault-local. `{vault-parent}/obsilo-shared/{history/, history.db plus .bak, memory/, memory.db plus .bak, memory-v1-backup/, episodes/, logs/, rules/, workflows/, pending-extractions.json}` -> `{vault}/.vault-operator/data/*`. Copy-Plus-Delete-Fallback wahrscheinlich (vault-parent zu vault-local Cross-Partition).
- Phase 5: Shared-Cache-Move vault-parent zu vault-local. `{vault-parent}/obsilo-shared/{checkpoints/, dev-env/, tmp/, .bak/}` -> `{vault}/.vault-operator/cache/*`.
- Phase 6: Drift-Resolve fuer skills/. Union von `.obsilo-vault/skills/` und `{vault-parent}/obsilo-shared/skills/`. Bei gleichnamigen Skills: mtime-Praezedenz, aeltere Version als `.versions/{skill}/{old-mtime}/` Snapshot. Ziel ist ein konsolidiertes `{vault}/.vault-operator/data/skills/`.
- Phase 7: Legacy-Cleanup. `.obsidian-agent/{telemetry/}` -> `{vault}/.vault-operator/data/telemetry/`, alter Pfad entfernt. `obsilo-shared/settings.json` evaluieren (ggf. mit Plugin-data.json mergen oder als Legacy-Backup ablegen). Alte Pfade `.obsilo-vault/`, `obsilo-shared/`, `.obsidian-agent/` entfernen wenn leer.
- Phase 8: Settings-Update. `agentFolderPath` Default ist neu `.vault-operator/data`. chatHistoryFolder-Setting wird entfernt. User-Override-Pfade bleiben unangetastet (Reset-Button im Settings-UI fuer expliziten Reset).
- Phase 9: chatHistoryFolder-Migration-Notice. Wenn User chatHistoryFolder vor Migration gesetzt hatte, beim ersten Boot nach Migration ein Modal mit Hinweis "Setting entfernt, Conversations via Plugin-Sidebar zugaenglich, alter Vault-Folder bleibt unangetastet".
- Phase 10: Migrations-Report als JSON schreiben (`{vault}/.vault-operator/data/migration-report.json`) mit Inventur vor/nach und Drift-Resolve-Aktionen.

Idempotenz via `_layoutMigrationStatus` Settings-Flag (Werte: `pending`, `phase-2-done`, `phase-3-done`, ..., `complete`). Bei Crash wird beim naechsten Boot der letzte abgeschlossene Phase-Marker gelesen und ab dort fortgesetzt.

**Verifikation:**
- Build: `npm run build` gruen
- Test: `npm test -- migrateAgentLayout`
- Integration-Test: mit echtem 300 MB Test-Vault Migration durchlaufen, Hash-Check vor und nach Move auf knowledge.db

### Task 3: Doppel-Lesen-Fenster im Agent-Folder-Resolver

**Ziel:** Waehrend Migration laufende Lese-Operationen finden Daten in altem ODER neuem Pfad.

**Files:**
- Modify: `src/core/utils/agentFolder.ts` (Resolver-Logik um Doppel-Lesen erweitern, Falls Migrations-Flag nicht `complete`, beide Pfade pruefen)
- Modify: `src/core/utils/__tests__/agentFolder.test.ts` (Tests fuer Doppel-Lesen-Window)

**Verhalten:**
- Migrations-Flag `complete`: nur neuer Pfad wird gelesen.
- Migrations-Flag nicht `complete`: neuer Pfad praezedent (wenn Datei dort existiert), sonst Fallback auf alten Pfad.

**Verifikation:**
- Test: `npm test -- agentFolder`
- Manueller Test: Plugin-Reload waehrend Phase 2, Daten lesbar ohne Datenverlust

### Task 4: Migrations-Trigger in `plugin.onload`

**Ziel:** Migration laeuft genau einmal beim Plugin-Start, vor jedem Service der `agentFolderPath` liest.

**Files:**
- Modify: `src/main.ts` (Aufruf von `migrateAgentLayout()` einbauen, vor `globalFileService` Init und vor `loadData()` der Skills-Verzeichnisse)
- Modify: `src/types/settings.ts` (`_layoutMigrationStatus` Feld ergaenzen)

**Reihenfolge in main.ts:**
1. `loadSettings()` (existing)
2. `migrateFolderRename()` (existing, fuer `.obsidian-agent` -> `obsilo-vault` Welle, bleibt unveraendert)
3. **`migrateAgentLayout()`** (neu, fuer Variante B mit Cleanup)
4. `migratePluginDataDirs()` (existing, vault-parent Caches)
5. Service-Initialisierung (GlobalFileService, KnowledgeDB, SkillRegistry, etc.)

**Verifikation:**
- Build: `npm run build && npm run dev` Plugin laedt
- Smoke: in lokalem Test-Vault Migration starten, alle Skill-/Knowledge-/Tmp-Daten lesbar nach Migration

### Task 5: Restore-Action im Settings-UI

**Ziel:** User kann ueber Settings einen Restore aus Backup ausloesen falls Migration brach.

**Files:**
- Modify: `src/ui/settings/BackupTab.ts` (Restore-Button fuer Layout-Migration-Backup)
- Modify: `src/ui/settings/MigrationNotificationModal.ts` (Modal-Erweiterung fuer Layout-Migration-Status)

**Verifikation:**
- Manueller Test: Backup-Snapshot manuell unkenntlich machen (Rename), Restore-Action im Settings ausloesen, Pruefen dass alte Daten zurueck sind

### Task 6: ARCHITECTURE.map und Wayfinder-Updates

**Files:**
- Modify: `src/ARCHITECTURE.map` (neues `agent-layout-migration` Konzept verlinkt zu Task 2 Entry-Point, plus Update des `agent-folder` Konzepts auf neuen Default)
- Modify: JSDoc-Header von `migrateAgentLayout.ts` (Konvention fuer neue Entry-Points)

### Task 7: Settings-Migration-Pfad fuer Custom agentFolderPath

**Ziel:** User der `agentFolderPath` auf einen Custom-Pfad gesetzt hat, sieht keine ueberraschende Aenderung. Only Default-User werden migriert.

**Files:**
- Modify: `src/main.ts` (Migration nur ausfuehren wenn `agentFolderPath` einer der bekannten Default-Werte ist: `.obsidian-agent`, `obsilo-vault`, `.obsilo-vault`; Custom-Pfade bleiben unangetastet)
- Modify: `src/core/utils/__tests__/migrateAgentLayout.test.ts` (Custom-Pfad-Test ergaenzen)

### Task 8: Smoke-Test mit echtem Vault

**Ziel:** Vor Release-Push der Welle 1 Pruefen dass Migration auf einem realistischen Vault funktioniert.

**Files:**
- Create: `scripts/smoke-test-folder-migration.sh` (manuelles Skript, kein CI)

**Inhalt:**
- Hash-Check auf knowledge.db, memory.db, history.db vor und nach Migration
- Filesystem-Inventur vor und nach (alle Files migriert, alle alten Pfade leer/entfernt)
- Drift-Resolve-Check fuer skills/ (Union, Konflikt-Auflösung verifiziert)
- Plugin-Reload-Test waehrend Phase 2 und Phase 4 (Doppel-Lesen-Fenster greift)
- chatHistoryFolder-Migration-Notice-Test (Modal erscheint wenn Setting gesetzt war)

### Task 9: Settings Reset-Buttons mit echter File-Migration

**Ziel:** Settings-UI bekommt Reset-Buttons pro Pfad-Setting plus Reset-all-Button. Reset macht echte File-Migration (Files umziehen, alten Pfad entfernen), nicht nur Setting-Wert-Aenderung.

**Files:**
- Modify: `src/ui/settings/InterfaceTab.ts` (Reset-Button pro Pfad-Setting)
- Modify: `src/ui/settings/AgentTab.ts` (analog falls Pfad-Settings dort sind)
- Modify: `src/ui/settings/AdvancedTab.ts` (analog)
- Create: `src/core/utils/resetSettingPath.ts` (Helper der die echte File-Migration triggert)
- Create: `src/core/utils/__tests__/resetSettingPath.test.ts`

**Verhalten:**
- User klickt Reset-Button neben einem Pfad-Setting
- Modal fragt: "Setting wird auf Default ({default}) zurueckgesetzt. Existing Files werden vom aktuellen Pfad ({current}) auf den Default-Pfad migriert. Alter Pfad wird entfernt. Backup wird vorher angelegt. Fortfahren?"
- User bestaetigt
- Backup-Snapshot wird angelegt
- Files werden via Reuse von migrateAgentLayout-Mechanik bewegt
- Setting-Wert wird aktualisiert
- Alter Pfad wird geloescht
- Notice "Setting zurueckgesetzt"

### Task 10: chatHistoryFolder-Removal mit Migrations-Notice

**Ziel:** chatHistoryFolder-Setting wird aus dem Settings-UI entfernt. ConversationStore wird Single-Source-of-Truth. User der das Setting genutzt hat sieht Migrations-Notice-Modal beim ersten Boot.

**Files:**
- Modify: `src/types/settings.ts` (chatHistoryFolder als deprecated markieren, Default leer, Lese-Pfad fuer alte data.json)
- Modify: `src/ui/settings/InterfaceTab.ts` (Setting-UI-Block entfernen)
- Modify: `src/main.ts` (ChatHistoryService entfernen, ConversationStore bleibt)
- Delete: `src/core/ChatHistoryService.ts`
- Create: `src/ui/modals/ChatHistoryRemovalNoticeModal.ts` (Modal fuer User die das Setting genutzt haben)
- Modify: `src/main.ts` plugin.onload (Modal triggern wenn alter chatHistoryFolder-Wert nicht leer war)

**Verhalten:**
- Beim ersten Boot nach Update: pruefen ob `data.json.chatHistoryFolder` einen nicht-leeren Wert hatte
- Wenn ja: Modal "chatHistoryFolder-Setting wurde entfernt. ConversationStore ist jetzt der einzige Speicher fuer Chat-History. Deine Conversations sind weiter ueber die Plugin-Sidebar zugaenglich. Der alte Vault-Folder ({alter Pfad}) bleibt unangetastet, du kannst ihn manuell loeschen wenn nicht mehr benoetigt."
- Modal-Bestaetigung loescht den `chatHistoryFolder`-Setting-Wert aus data.json

### Task 11: Drift-Resolve fuer skills/

**Ziel:** Bei der Migration werden skills/ aus `.obsilo-vault/skills/` und `{vault-parent}/obsilo-shared/skills/` zu einem konsolidierten `{vault}/.vault-operator/data/skills/` gemerged.

**Files:**
- Modify: `src/core/utils/migrateAgentLayout.ts` (Phase 6 Drift-Resolve)
- Create: `src/core/utils/__tests__/migrateAgentLayout.skills-drift.test.ts`

**Algorithmus:**
1. Liste aller Skill-Folder-Namen aus beiden Quell-Pfaden
2. Pro Skill-Name:
   - Wenn nur in einer Quelle: direkt nach Ziel kopieren
   - Wenn in beiden: vergleiche mtime der SKILL.md-Files. Neuere Version gewinnt
   - Aeltere Version als Snapshot in `.vault-operator/data/skills/{name}/.versions/{old-mtime}/SKILL.md` (analog ADR-128 Skill-Versionierung Pattern)
3. Migrations-Report dokumentiert pro Konflikt-Skill die getroffene Entscheidung

---

## Coverage Gate

> Filled before status flips to Active in the backlog row.

- [x] SC coverage: alle 6 SC aus FEAT-29-01 sind in den Tasks gemapped
- [x] ADR alignment: ADR-119 (Variante B mit Cleanup) wird in Task 2 operationalisiert, ADR-72 (existing) bleibt referenziert
- [x] Codebase anchoring: jede Task nennt konkrete Files
- [x] Verify commands: `npm run build`, `npm test`, plus manueller Smoke-Test sind definiert

| FEATURE-SC | Task in this plan | Status |
|---|---|---|
| FEAT-29-01 SC-01 (Backup vor Schreiben) | Task 2 Phase 1 | Mapped |
| FEAT-29-01 SC-02 (alles vault-local data/ + cache/, drei Legacy-Pfade weg) | Task 2 Phasen 2-7 | Mapped |
| FEAT-29-01 SC-03 (Plugin startet ohne Reindex) | Task 4 + Task 8 (Smoke) | Mapped |
| FEAT-29-01 SC-04 (User kann zurueckkehren) | Task 5 (Restore-Action) | Mapped |
| FEAT-29-01 SC-05 (Doppel-Lesen-Fenster) | Task 3 | Mapped |
| FEAT-29-01 SC-06 (Drift-Resolve skills/) | Task 11 | Mapped |
| FEAT-29-01 SC-07 (chatHistoryFolder entfernt mit Notice) | Task 10 | Mapped |
| FEAT-29-01 SC-08 (Settings Reset-Buttons als File-Migration) | Task 9 | Mapped |

| ADR referenced | Task in this plan that operationalizes it |
|---|---|
| ADR-119 (Variante B mit Cleanup) | Task 2, Task 3, Task 4 |
| ADR-72 (Konfigurierbarer Agent-Folder) | Task 1, Task 7 |

## Change Log

Append-only. Each mid-course deviation appends an entry.

### 2026-05-20: Plan created

Initial version nach Phase-2c-Reconciliation. ADR-119 wurde amendiert auf Variante B mit Cleanup. FEAT-29-01 SC wurden amendiert (SC-02 reformuliert, SC-06 neu fuer Legacy-Cleanup). plan-context-epic29 Welle-1-Komponentenskizze aktualisiert.

### 2026-05-20: Variante B' (zweite Iteration)

User-Entscheidung nach Erlaeuterung der iCloud-Sync-Implikationen: cache landet nicht in `{vault}/.vault-operator/cache/` sondern in `{vault-parent}/vault-operator-shared/cache/`, analog zu dem schon released en Pattern aus FIX-28-00-03 (checkpoints und dev-env). User-Daten bleiben vault-local. ADR-119 entsprechend amendiert, FEAT-29-01 SC-02 erneut reformuliert, SC-07 neu fuer iCloud-Sync-Vermeidung der grossen Cache-Assets. Plan-Tasks angepasst: Phase 2 (data-Move) bleibt vault-local, Phase 3 (cache-Move) zielt jetzt nach vault-parent.

### 2026-05-20: Option 1 (dritte Iteration, finale Entscheidung)

User-Entscheidung nach Erlaeuterung der vollen Storage-Topologie (obsilo-shared/ enthielt 252 history-Eintraege, 8.8 MB memory.db, skills/ mit Drift zu vault-local, plus checkpoints und dev-env): alles Plugin-State landet vault-local. Cross-Vault-Sharing wird durch separates Backup-Export-Tool (FEAT-29-12 in Welle 4) bereitgestellt, nicht durch vault-parent. Plus drei zusaetzliche Sub-Themen: chatHistoryFolder-Setting wird entfernt, Drift-Resolve fuer skills/ noetig, Settings-Reset-Buttons mit echter File-Migration. ADR-119 dritte Iteration, FEAT-29-01 SC-02 ueberarbeitet (jetzt vier Quell-Pfade), SC-07 ersetzt durch chatHistoryFolder-Removal, SC-08 neu fuer Reset-Buttons. Plan-Tasks erweitert um Phase 4+5 fuer vault-parent zu vault-local Move, Phase 6 fuer Drift-Resolve, Phase 7 fuer Legacy-Cleanup inklusive obsilo-shared, Phase 9 fuer chatHistoryFolder-Notice. Plus drei neue Tasks (9, 10, 11) fuer Reset-Buttons, chatHistoryFolder-Removal, skills-Drift-Resolve.

Plus: EPIC-30 Scope erweitert um FEAT-30-06 (Episodes-und-Recipes-Konsolidierung in Workflows), weil das Coding-Pivot die Konzept-Ueberlappung sichtbar gemacht hat. EPIC-29 erhaelt neues FEAT-29-12 Backup-Export-Tool in Welle 4.

## Implementation Notes

Filled when the backlog row reaches status Done or Superseded.

- Per-task commit SHAs:
- Deviations summary:
- Test count delta:
- Cycle time:
- ARCHITECTURE.map / JSDoc-header updates landed:
