# Feature: Agent Folder Change Handling (P0/P1/P2)

> **Feature ID**: FEATURE-0508
> **Epic**: EPIC-005 (Self-Development & Sandbox)
> **Priority**: P0 (Hotfix), P1 (Folge), P2 (Follow-up)
> **Effort Estimate**: S
> **Status**: Geplant (Wave 3 hotfix)
> **Issue-Bezug**: [#26](https://github.com/pssah4/obsilo/issues/26) follow-up
> **Abhaengig von**: FEATURE-0507 (Konfigurierbarer Agent-Folder, released v2.5.0/v2.5.1)

## Problem

Nach dem Aendern von `agentFolderPath` in den Settings ist der Plugin-Zustand inkonsistent:

- Nicht alle Komponenten reagieren: `SkillRegistry`, `VaultDNAScanner`, `KnowledgeDB`, `MemoryDB` cachen den Pfad im Constructor und bleiben am alten Pfad haengen bis Obsidian reloaded wird.
- Bestehende Dateien werden NICHT automatisch mitumgezogen (ADR-072: intended, aber User-ueberraschend).
- Folge: neue Plugin-Skills landen am neuen Pfad, `VaultDNAScanner` sucht am alten, Datei "verschwindet" fuer den Agent. `KnowledgeDB` schreibt weiter an alter Location.

User-Feedback (Issue #26 follow-up): "wird dann alles umgezogen und der Agent bekommt das mit, oder zerbricht etwas?" Aktuell: letzteres (still und leise).

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-P0-01 | Setting-Aenderung zeigt klaren Hinweis auf Migration und Reload | 100% | UI-Test |
| SC-P1-01 | Plugin-Skills erscheinen am neuen Pfad ohne Plugin-Reload | 100% | Manueller Test: Path aendern, dann Skills-Tab oeffnen |
| SC-P1-02 | VaultDNA-Scan laeuft gegen neuen Pfad ohne Plugin-Reload | 100% | Manueller Test: Path aendern, dann `.skill.md` erscheint am neuen Pfad |
| SC-P2-01 | "Migrate data" Button kopiert plugin-skills, vault-dna.json, knowledge.db vom alten zum neuen Pfad | 100% | Manueller Test: Files vorher/nachher pruefen |
| SC-P2-02 | Originale bleiben erhalten (kein silent delete) | 100% | Defensive by design |
| SC-P2-03 | KnowledgeDB wird vor Move sauber geschlossen und danach re-oeffnet | 100% | Console-Log pruefen |

## Loesung — drei Priori-Stufen

### P0 — Clear Notice bei Setting-Change

Nach jedem Save der `agentFolderPath` (sowohl Textfeld als auch Picker):

- Notice (12 Sekunden sichtbar) mit:
  - "Agent folder changed to `<newPath>`."
  - "Existing files are NOT moved. Use 'Migrate data' below if you want them to follow."
  - "Reload Obsidian once the migration is done."

Kosten: ~10 LOC, rein UI.

### P1 — Auto-invalidation ohne Plugin-Reload

**`SkillRegistry.setSkillsDir(newDir: string): void`**
- Aktualisiert private `skillsDir` Field (aus `readonly` gestrichen).
- Naechster `getPluginSkillsPromptSection()`-Aufruf nutzt neuen Pfad.

**`VaultDNAScanner.setAgentFolder(newFolder: string): void`**
- Aktualisiert `skillsDir` und `dnaPath`.
- Triggert `initialize()` (Re-Scan + .skill.md neu schreiben am neuen Pfad).

**Wiring:** Nach `plugin.saveSettings()` in VaultTab:
```typescript
this.plugin.skillRegistry?.setSkillsDir(getPluginSkillsDir(this.plugin));
this.plugin.vaultDNAScanner?.setAgentFolder(getAgentFolderPath(this.plugin));
```

**Nicht abgedeckt in P1:** `KnowledgeDB` und `MemoryDB`. Beide halten ein `sql.js`-Handle zu einer konkreten Datei. Live-re-open waehrend einer Agent-Session ist riskant (in-flight reads/writes). Stattdessen: Notice aus P0 fordert Reload fuer DB-Location-Change an.

### P2 — Migrate data button

Separater Button "Migrate data" in VaultTab unter dem Pfad-Feld. Detects was am alten Pfad liegt und kopiert:

1. `<oldPath>/plugin-skills/` → `<newPath>/plugin-skills/` (rekursiv)
2. `<oldPath>/vault-dna.json` → `<newPath>/vault-dna.json`
3. `<oldPath>/knowledge.db` → `<newPath>/knowledge.db`
4. `<oldPath>/memory.db` → `<newPath>/memory.db` (falls storageLocation=local)
5. `<oldPath>/tmp/` ausgelassen (ephemeral, wird beim naechsten cleanup entsorgt)

Ablauf:
- Dry-run: scannt old path, zeigt Summary im Confirm-Modal (`3 plugin skills, 1 vault-dna, knowledge.db (12 MB)`)
- User OK: KnowledgeDB + MemoryDB schliessen
- File copy (Obsidian adapter API, recursive) — Originale bleiben am alten Pfad erhalten
- Setting-Notice: "Migration complete. Reload Obsidian for databases to re-open at new path."

**Originale werden NICHT geloescht** — User kann sie manuell aufraeumen. Defensive by design (ADR-072-Prinzip).

## Out of Scope

- Absolute-Path-Support fuer KnowledgeDB/MemoryDB (Phase 3 wenn benoetigt).
- Live re-open der DBs ohne Obsidian-Reload.
- Auto-trigger der Migration (User muss explizit klicken, ADR-072-prinzip).

## Verifikation

1. Build: `npm run build` ohne Fehler.
2. Tests:
   - `SkillRegistry.setSkillsDir` aktualisiert das Prompt-Section.
   - `VaultDNAScanner.setAgentFolder` triggert re-scan.
   - Migration-Helper kopiert Dateien korrekt, Originale bleiben.
3. Live:
   - Path-Aenderung ohne Reload: Skills-Tab zeigt Skills am neuen Pfad.
   - "Migrate data" kopiert korrekt, Reload-Notice erscheint.
