# ADR-072: Konfigurierbarer Agent-Storage-Root

**Status:** Accepted (implemented in v2.5.0)
**Date:** 2026-04-17
**Deciders:** Sebastian Hanke
**Bezug:** FEATURE-0507 (EPIC-005), Issue #26

## Context

`.obsidian-agent/` ist heute an mehreren Stellen hartcodiert:

- `src/core/knowledge/KnowledgeDB.ts:172` (Default-Pfad fuer global storage)
- SkillRegistry-Prompt-Section ("read_file('.obsidian-agent/plugin-skills/{plugin-id}.skill.md')")
- VaultDNAScanner und PluginSkill-Loader (impliziter Pfad fuer .skill.md-Files)
- `globalRoot`-Default in mehreren Service-Konstruktoren

Drei Probleme entstehen daraus:

1. **User-Anfrage (Issue #26):** Power-User mit FolderBridge oder versionierten Vault-Templates wollen Skills/Recipes/Agent-Definitionen in einem selbst gewaehlten Pfad ablegen, etwa um sie als Git-Submodule zu versionieren oder zwischen Vaults zu teilen.
2. **Review-Bot:** `obsidianmd/hardcoded-config-path` Regel meldet jeden hartcodierten `.obsidian-` Prefix als Finding. Wir haben ihn aktuell mit Disable umgangen.
3. **Wartung:** Wenn der Default-Pfad spaeter geaendert werden muss (z.B. bei Multi-Vault-Sharing), muessten wir an N Stellen suchen.

## Decision Drivers

- **Abwaertskompatibilitaet:** Bestehende Vaults muessen ohne Migration weiter funktionieren. Der Default bleibt `.obsidian-agent`.
- **Single Source of Truth:** Ein Helper `getAgentFolderPath(plugin)` ersetzt alle Hartcodierungen.
- **No-Hidden-State:** Pfad ist im Settings-Tab sichtbar und im System-Prompt korrekt referenziert.
- **Sicherheit:** Pfad bleibt Vault-relativ. Absolute Filesystem-Pfade sind explizit out of scope (Path-Traversal-Risiko, Folge-Epic).
- **Kein Breaking-Change im System-Prompt:** Der Agent muss den korrekten Pfad in die `read_file`-Empfehlungen einsetzen.

## Considered Options

### Option 1: Setting in der Settings-UI, Vault-relativ, Default `.obsidian-agent`

Ein neues Setting `agentFolderPath` (string) in `AgentSettings`, Default `.obsidian-agent`. Helper `getAgentFolderPath(plugin): string` liest aus Settings, `normalizePath()` aus Obsidian-API normalisiert. Alle Konsumenten ersetzen `.obsidian-agent` durch Aufruf des Helpers. SkillRegistry-Prompt-Section bekommt den Pfad als String injiziert statt ihn hardcodiert in den Prompt zu schreiben.

**Pro:** Minimaler Eingriff, klare Migration, kein Sicherheitsrisiko, Regel-konform.
**Contra:** Multi-Vault-Sharing braucht weiterhin manuellen Symlink/Submodule-Workflow.

### Option 2: Absolute Filesystem-Pfade erlauben

Setting akzeptiert auch absolute Pfade ausserhalb der Vault.

**Pro:** Echtes Multi-Vault-Sharing ohne Symlinks.
**Contra:** Path-Traversal-Risiko, kompliziert KnowledgeDB-Lifecycle (sql.js-Datei in fremdem Filesystem-Pfad), Sandbox-Bridge muss Cross-Boundary-Calls erlauben. Sicherheits-Review notwendig. Out of scope fuer Wave 1.

### Option 3: Per-Resource-Pfade (eigene Settings fuer skillsPath, recipesPath, knowledgeDbPath)

**Pro:** Maximale Flexibilitaet.
**Contra:** Setting-Explosion. User muessten N Pfade pflegen. Verstoesst gegen Single-Source-of-Truth. Issue #26 fragt explizit nach einem gemeinsamen Folder.

## Decision

**Option 1.** Ein Setting `agentFolderPath`, Vault-relativ, Default `.obsidian-agent`. Alle Konsumenten ueber zentralen Helper.

### Implementation-Details

```typescript
// src/core/utils/agentFolder.ts (neu)
import { normalizePath } from 'obsidian';
import type { ObsiloPlugin } from '../../main';

export function getAgentFolderPath(plugin: ObsiloPlugin): string {
    const raw = plugin.settings.agentFolderPath?.trim() || '.obsidian-agent';
    return normalizePath(raw);
}

export function getPluginSkillsPath(plugin: ObsiloPlugin, pluginId: string): string {
    return normalizePath(`${getAgentFolderPath(plugin)}/plugin-skills/${pluginId}.skill.md`);
}
```

### Migration

Keine automatische Migration. Wenn ein User den Pfad aendert, sind die alten Inhalte unter `.obsidian-agent/` weiterhin auf der Platte, werden aber vom Plugin nicht mehr gelesen. Dokumentation: User muss bei Bedarf manuell mit `mv` umziehen. Auto-Migration ist out of scope (Folge-Feature).

### Globaler Storage (KnowledgeDB)

Wenn `storageLocation === "global"`, bleibt KnowledgeDB unter `{vault-parent}/.obsidian-agent/` (nicht beruehrt vom Setting). Das Setting wirkt nur auf Vault-relative Speicherorte. Wenn `storageLocation === "local"`, liegt KnowledgeDB unter `${agentFolderPath}/knowledge.db`.

Begruendung: Globaler Storage ist explizit cross-vault, deshalb darf er nicht von einem Vault-spezifischen Setting abhaengen. Fuer User die globalen Storage anders haben wollen, gibt es bereits den `globalRoot`-Konstruktor-Override.

### Bot-Compliance

Mit dem zentralen Helper koennen wir die `eslint-disable obsidianmd/hardcoded-config-path`-Zeile in KnowledgeDB.ts entfernen. Der Helper selbst nutzt das Setting, nicht den Hardcode.

## Consequences

### Pro

- Issue #26 ist geloest, Power-User koennen Skills versionieren.
- Bot-Finding ist weg.
- Single-Source-of-Truth.

### Contra

- Bestehender Code an vielen Stellen muss touchen (suche-und-ersetze, niedriges Risiko).
- System-Prompt ist nicht mehr statisch (Pfad wird in den Prompt-Builder injiziert).

### Folgeentscheidungen

- Auto-Migration zwischen Pfad-Aenderungen: separater Wave 2 Skill.
- Multi-Vault-Sharing via Symlink/Submodule: Doku-Artikel mit Beispiel.

## Verification

- Smoke-Test: Default-Pfad funktioniert wie zuvor.
- Smoke-Test: Custom-Pfad `_skills/agent` wird korrekt verwendet.
- Smoke-Test: System-Prompt enthaelt den korrekten Pfad in der read_file-Empfehlung.
- Bot-Re-Scan: KnowledgeDB.ts:154 Disable ist weg, kein neues hardcoded-config-path Finding.
