---
ba: null (User-getrieben, kein dediziertes BA)
epic: EPIC-29
arch-completed: 2026-05-20
related-epics: [EPIC-22, EPIC-26, EPIC-30, EPIC-31]
adr-count: 7 (ADR-119, ADR-124, ADR-125, ADR-126, ADR-127, ADR-128, ADR-129)
plan-count: 0 (PLAN-Items folgen pro Welle im /coding-Pivot)
---

# plan-context EPIC-29: Skills-Konsolidierung und Plugin-as-Skill Reliability

## Tech-Stack (Stand 2026-05-20)

Existing Stack bleibt unveraendert, EPIC-29 fuegt keine externen Dependencies hinzu.

- **Sprache:** TypeScript strict
- **Plugin-Framework:** Obsidian Plugin API
- **Build:** esbuild plus Deploy-Plugin
- **Runtime:** Electron-Renderer-Process im Obsidian-Host
- **AI APIs:** Anthropic SDK, OpenAI SDK plus weitere (vgl. EPIC-26-Liste). Frontier-Modell-Eskalation fuer Skill-Authoring und Translation ueber bestehenden TaskRouter (EPIC-26)
- **Sandbox-Executor:** existing EsbuildWasmManager mit ESM-Bundles ueber esm.sh und jsdelivr-Fallback
- **Sandbox-Bridge:** existing HTTP-Bridge und Vault-Batch-Ops (siehe Memory)
- **Skill-Loader:** existing SelfAuthoredSkillLoader (ADR-75) wird erweitert um Plugin-Skill-Source
- **Plugin-API:** existing ExecuteCommandTool und CallPluginApiTool werden um Notice-Capture und Live-Probe erweitert
- **MCP-Client:** existing MCP-Mechanik fuer Skill-zu-MCP-Aufrufe wiederverwendet
- **Storage:** existing knowledge.db (sql.js WASM) bleibt, wird im Rahmen FEAT-29-01 unter den neuen kanonischen Pfad migriert

Keine neuen externen Dependencies. Kein Sprach-Wechsel. Kein Framework-Wechsel.

## Architektur-Stil und Quality-Goals

EPIC-29 ist ein Refactor- plus Erweiterungs-Epic auf dem bestehenden Skill-Subsystem. Der Stil bleibt service-orientiert mit klar getrennten Verantwortungen: Discovery-Service, Skill-Loader, Tool-Pipeline, Sandbox-Executor. Das Epic vereinheitlicht zwei heute parallele Subsysteme (Plugin-Skill-Subsystem mit File-Snapshots, User-Skill-Subsystem mit Folder-Format) unter einem konsistenten Anthropic-konformen Pattern.

**Quality-Goals fuer EPIC-29 (priorisiert):**

1. **Reliability**: Plugin-Skill-Discovery ist deterministisch und race-frei. silent failures bei execute_command sinken unter zwei Prozent.
2. **Portabilitaet**: Alle Skill-Typen (Plugin, User, Builtin) folgen demselben Anthropic-konformen Format. Skills sind ohne Konvertierung zwischen Vault Operator und Claude Code uebertragbar.
3. **Token-Effizienz**: Wegfall der Snapshot-Inject-Section im stabilen Prompt-Prefix, durch Live-Probe-Tool ersetzt.
4. **User-Trust**: keine silent failures, keine ueberraschenden Translation-Verluste, keine verlorenen Skill-Versionen.
5. **Maintainability**: drei Plugin-Daten-Ordner werden auf einen kanonischen Pfad konvergiert. Konvention zwischen Plugin-Name und Folder-Name wird vereinheitlicht.

## ADR-Summary

| ADR | Titel | Welle | Adressiert |
|---|---|---|---|
| ADR-119 | Plugin-Daten-Ordner-Konsolidierung | 1 | 3 Pfade auf 1 konvergieren, Doppel-Lesen-Fenster, Backup |
| ADR-124 | Plugin-as-Skill Live-Probe Discovery | 1+2 | Plugin-Skill-Format-Migration plus event-driven Discovery plus probe_plugin-Tool |
| ADR-125 | Execution Visibility via Notice-Capture | 2 | silent failures bei execute_command sichtbar machen |
| ADR-126 | Skill-Authoring als Builtin-Skill | 3 | manage_skill entfernen, skill-creator als Builtin, run_skill_script als generisches Tool |
| ADR-127 | Python-zu-JavaScript Skill-Translation | 4 | Anthropic-Skills mit Dry-Run-Pass und User-Modal in Vault Operator portieren |
| ADR-128 | Skill-Versionierung mit Snapshot/Restore | 4 | Diff-basierte Snapshots pro Skill, Tagging, Retention |
| ADR-129 | Skill-Composability (Skill-zu-Skill + Skill-zu-MCP) | 4 | Sub-Skill-Aufruf und MCP-Aufruf aus Skill-Body, Cycle-Detection, Permission-Kette respektiert |

## Datenmodell

Keine neuen Core-Entitaeten. Erweiterungen bestehender Strukturen:

- **Skill-Folder-Struktur** (aus ADR-75) bleibt: Folder mit SKILL.md plus optional scripts/, references/, assets/.
- **Plugin-Skill-Folder** ist die neue Auspraegung pro installiertem Plugin (folgt demselben Folder-Schema).
- **Skill-Snapshot-Folder** (.versions/) wird als Sub-Folder im Skill-Folder eingefuehrt (ADR-128).
- **Migrations-Manifest** als JSON im neuen kanonischen Pfad dokumentiert Folder-Konsolidierung (ADR-119).
- **TRANSLATION.json** als Audit-File im konvertierten Skill-Folder dokumentiert Source und Konvertierung (ADR-127).
- **Aufruf-Stack** im Agent-Loop-Kontext-Frame fuer Cycle-Detection bei Skill-zu-Skill (ADR-129).

Kein neues Daten-Schema, kein DB-Migrations-Schritt jenseits der Folder-Konsolidierung.

## Externe Integrationen

Keine neuen externen Integrationen. EPIC-29 nutzt:

- **CDN (esm.sh, jsdelivr)** fuer Sandbox-Bundle-Loading (existing).
- **Obsidian-Plugin-API** fuer Plugin-Enable/Disable-Events und Notice-API.
- **MCP-Server** ueber bestehenden MCP-Client.
- **Anthropic-Skills-Repo** als optionale Quelle fuer Skill-Import via FEAT-29-08 Translator (kein Push, nur Pull).

## Performance und Security

**Performance-Targets:**

- Skill-Discovery-Latenz: unter 100 ms nach Plugin-Enable
- probe_plugin-Aufruf: unter 50 ms bei Plugin mit bis zu 100 Commands
- Notice-Capture-Overhead pro Command: unter 5 ms
- Folder-Migration: unter 60 Sekunden fuer 300 MB Vault-Plugin-Daten
- Skill-Snapshot-Anlage: unter 100 ms pro Skill
- Skill-Restore: unter 2 Sekunden
- Skript-Bundle-Erstellung: unter 500 ms initial, unter 50 ms ab Cache-Hit

**Security-Targets:**

- Sandbox-Approval-Kette: nicht umgehbar bei Sandbox-JS-Aufrufen (ADR-126)
- MCP-Approval-Kette: nicht umgehbar bei Skill-zu-MCP-Aufrufen (ADR-125)
- Backup-Pfad fuer Folder-Migration: ausserhalb iCloud-Sync (ADR-119)
- Frontmatter-Validator: rejected non-konforme Skills im Discovery-Layer mit klarer Fehlermeldung (ADR-126)
- Notice-Sensitive-Daten: Heuristik redacted offensichtliche Sensitiv-Marker bevor tool_result an Modell geht (ADR-125)

**Storage-Targets:**

- Versions-Overhead pro Skill: unter 5 Prozent der Original-Skill-Groesse (ADR-124)
- Periodische volle Snapshots: alle 10 Versionen, damit Restore nie mehr als 9 Diff-Stufen reapplien muss (ADR-124)

**Reliability-Targets:**

- silent failures bei execute_command: unter 2 Prozent nach Welle 2 (ADR-125)
- NONE-klassifizierte Plugins nach Bootstrap: 0 (ADR-124)
- Migration idempotent und resumable: ja (ADR-119, FEAT-29-01)

## Open Items fuer /coding

Diese Architektur-Fragen werden im /coding-Pivot anhand der Code-Realitaet entschieden:

1. Backup-Pfad-Lokation: User-Home oder im Vault als `.vault-operator-backup/`?
2. Folder-Konflikt-Resolution bei `.vault-operator/` (heute teilweise vorhanden): Sub-Folder-Strategie oder Merge?
3. Plugin-Event-API-Stabilitaet: gibt es saubere Enable/Disable-Events, oder Fallback auf Reflection?
4. probe_plugin-Caching: in-memory pro Session mit Event-Invalidierung, oder per-Aufruf live?
5. Notice-Capture-Tail-Window-Dauer: 1, 2 oder 3 Sekunden?
6. Bundle-Cache-Persistenz: in-memory oder persistent in runtime-Folder?
7. Migration-Pfad fuer bestehende custom-praefixierte Tools auf run_skill_script: Stub-Skripte pro Tool oder explizite User-Aktion?
8. Skill-zu-Skill-Aufruf-Syntax: invoke_skill-Tool-Call, oder Markdown-Pattern?

## Komponenten-Skizze pro Welle

**Welle 1: Foundation**
- FoldermigrationsService (neu) fuer ADR-119 (Option 1 alles vault-local plus Backup-Tool als FEAT-29-12, dritte Iteration nach Phase-2c-Reconciliation 2026-05-20)
- Migrations-Layout: alles Plugin-State landet vault-local in `{vault}/.vault-operator/{data,cache}/`. Drei Quell-Pfade werden konsolidiert: `.obsidian-agent`, `.obsilo-vault`, `{vault-parent}/obsilo-shared`
- Drift-Resolve fuer skills/: Union aus vault-local und vault-parent, mtime-Praezedenz bei Konflikt
- chatHistoryFolder-Setting wird entfernt, ConversationStore wird Single-Source-of-Truth
- Settings-Reset-Buttons als echte File-Migration (nicht nur Setting-Aenderung)
- Wiederverwendung existierender Migrations-Helper: `migrateFolderRename.ts` und `migratePluginDataDirs.ts` als Vorbild und Basis
- SkillRegistry (existing) wird erweitert um Plugin-Skill-Folder-Quelle (ADR-124)
- VaultDNAScanner (existing) wird abgeschafft, Aufgaben uebernehmen Live-Probe-Tool plus Eager-Stub-Generator

**Welle 4: Polish + Bridge** (Update)
- Bereits geplant: FEAT-29-07 Permission Polish, FEAT-29-08 Skill-Translator, FEAT-29-09 Skill-Versionierung, FEAT-29-10 Composability
- **Neu: FEAT-29-12 Backup-Export-Tool** (selektiver ZIP-Export, Import, optional Auto-Daily). Adressiert Cross-Vault-Sharing als User-Werkzeug, weil Storage in Option 1 vault-local ist und automatisches Cross-Vault-Sharing wegfaellt

**Welle 2: Reliability**
- probe_plugin-Tool (neu) im Tool-Registry
- ExecuteCommandTool (existing) wird gewrappt mit Notice-Capture (ADR-125)
- CallPluginApiTool bleibt unveraendert (Polish kommt in Welle 4)

**Welle 3: Authoring**
- skill-creator-Skill (neu) im Builtin-Skills-Folder
- run_skill_script-Tool (neu) im Tool-Registry
- manage_skill-Tool (existing) wird entfernt
- TaskRouter-Eskalation auf Flagship fuer Skill-Trigger
- Customize-Section-UI mit Lucide Toolbox Icon und Folder-Open statt Direkt-Edit

**Welle 4: Polish + Bridge**
- skill-translator-Skill (neu) im Builtin-Skills-Folder mit Mapping-Tabelle und Dry-Run-Pass
- SkillVersionsService (neu) mit Snapshot-Anlage und Restore
- invoke_skill und invoke_mcp_server Tools (neu) mit Cycle-Detection
- CallPluginApiTool bekommt adaptive Timeout und Auto-Promotion-Heuristik

## Kontext fuer /coding

EPIC-29 ist gross (11 Features in 4 Wellen). Empfehlung: pro Welle ein eigener /coding-Pivot mit PLAN-Item, eigenes Build-Deploy-Cycle und eigenes Smoke-Test-Window. Welle 1 ist Foundation und muss vor allen anderen ausgeliefert sein. Welle 2 und Welle 3 koennen parallel gebaut werden falls Kapazitaet. Welle 4 ist die anspruchsvollste und sollte erst nach Stabilisierung der Foundation laufen.
