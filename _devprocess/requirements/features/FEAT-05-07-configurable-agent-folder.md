# Feature: Konfigurierbarer Agent-Folder

> **Feature ID**: FEAT-05-07
> **Epic**: EPIC-05 (Self-Development & Sandbox)
> **Priority**: P2
> **Effort Estimate**: M
> **Issue-Bezug**: https://github.com/pssah4/vault-operator/issues/26
> **ADR**: ADR-72
> **Bezogene Features**: FEAT-05-01 (Self-Development), FEAT-02-03 (Skills), FEAT-02-04 (Local Skills)

## Feature Description

Heute liegen Agent-Artefakte (Skills, Plugin-Skills, Recipes, Memory, KnowledgeDB) hartcodiert unter `.obsidian-agent/` (relativ zur Vault-Wurzel oder Vault-Parent). User wie der Issue-Reporter (Setup mit FolderBridge fuer versionierbare Templates) wollen den Pfad selbst waehlen, etwa um Skills in einem privaten Submodule zu halten oder mehrere Vaults dieselbe Skills-Bibliothek teilen zu lassen.

Das Feature gehoert in EPIC-05 (Self-Development), weil der Agent-Folder die Wurzel fuer alle Self-Development-Artefakte ist (manage_skill, manage_source). Es fuehrt ein Setting `agentFolderPath` ein (Default: `.obsidian-agent`). Bei Aenderung wird der bestehende Inhalt nicht automatisch migriert. Alle Konsumenten (SkillRegistry, VaultDNAScanner, SkillRegistry-Prompt-Section, GlobalFileService, KnowledgeDB) lesen den Pfad aus einer zentralen Konstante `getAgentFolderPath(plugin)`.

## User Stories

### Story 1: Agent-Folder ueber Setting waehlen
**Als** Power-User mit FolderBridge-Setup
**moechte ich** den Agent-Folder auf einen versionierten Submodule-Pfad legen
**um** Skills, Recipes und Agent-Definitionen mit Git zu versionieren.

### Story 2: Default-Verhalten bleibt erhalten
**Als** Standard-User der das Setting nie anfasst
**moechte ich** dass alles weiter unter `.obsidian-agent/` liegt
**um** keine Migration zu brauchen.

### Story 3: Setting wirkt ohne Restart
**Als** User der den Pfad aendert
**moechte ich** dass der naechste Skill-Refresh die neuen Dateien benutzt
**um** sofort zu sehen, ob mein neuer Setup funktioniert.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Setting `agentFolderPath` existiert in der Settings-UI | 100% | Manueller Settings-Tab Check |
| SC-02 | Default ist `.obsidian-agent`, alle bestehenden Vaults arbeiten weiter | 100% | Regression-Test |
| SC-03 | Aenderung des Settings wirkt auf neue Skill-Reads ohne Restart | 100% | Manueller Test |
| SC-04 | Skills, Plugin-Skills, Recipes, KnowledgeDB lesen aus dem konfigurierten Pfad | 100% | Manueller Test mit `agentFolderPath = "private/agent"` |
| SC-05 | KnowledgeDB.ts:154 Disable fuer `obsidianmd/hardcoded-config-path` ist entfernt | true | Code-Review |
| SC-06 | Setting wird im System-Prompt korrekt referenziert (read_file-Hinweis nutzt aktuellen Pfad) | true | Manueller Test |

## Out of Scope

- Auto-Migration bestehender Agent-Folder bei Setting-Aenderung.
- Multi-Vault Sharing per Symlink/Submodule (separates Folge-Feature).
- Absolute Filesystem-Pfade ausserhalb der Vault (sicherheitskritisch, Folge-Epic).

## Architektur-Hinweise

Der konfigurierbare Pfad ist Vault-relativ. Default `.obsidian-agent`. Globale Daten (cross-vault settings, KnowledgeDB im Storage-Mode "global") bleiben unter `{vault-parent}/.obsidian-agent/` falls der storage-mode "global" gewaehlt ist, oder folgen dem konfigurierbaren Pfad falls "local". Details in ADR-72.

## Verifikation

1. Build: `npm run build` ohne Fehler.
2. Smoke-Test mit Default-Pfad: alle bestehenden Skills laden.
3. Smoke-Test mit Custom-Pfad `_skills/agent`: Skills muessen in dem neuen Pfad gefunden werden, alter Pfad ignoriert.
4. Bot-Re-Scan: KnowledgeDB.ts:154 Finding ist weg.
