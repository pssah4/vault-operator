# Feature: MCP Prompts (System-Prompt-Ersatz)

> **Feature ID**: FEAT-14-06
> **Epic**: EPIC-14 - MCP Connector
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

Vault Operator's System-Prompt-Inhalt wird als MCP Prompts an Claude uebergeben. Beim Connect
erhaelt Claude die Rolle, Kommunikationsstil, User-Profil, Regeln und Skill-Anleitungen --
exakt wie der System-Prompt im Standalone-Modus, aber ueber MCP statt als API-Parameter.

**Kernprinzip:** Claude bekommt beim ersten Kontakt gesagt: "Wenn du mit Vault Operator arbeitest,
ist das hier deine Rolle und diese Regeln gelten." Ersetzt den System-Prompt 1:1.

## User Stories

### Story 1: Claude kennt die Regeln
**Als** User mit eigenen Rules und Patterns
**moechte ich** dass Claude meine Regeln kennt wenn es Vault Operator nutzt
**um** konsistente Ergebnisse zu bekommen (z.B. immer Deutsch, bestimmter Stil)

### Story 2: Workflow-Anleitungen
**Als** User
**moechte ich** dass Claude meine Skills/Workflows kennt
**um** komplexe Aufgaben (Praesentation erstellen, Recherche) korrekt auszufuehren

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Claude kennt User-Profil + Patterns beim Connector-Start | Memory-Infos im Kontext | Claude antwortet gemaess Profil |
| SC-02 | Skills als MCP Prompts verfuegbar | Alle aktiven Skills | Prompt-Listing |
| SC-03 | Rules werden beachtet | Claude befolgt User-Regeln | Verhaltens-Test |

---

## MCP Prompts

### `obsilo-system-context` (statisch + dynamisch)

Quelle: `MemoryService.buildMemoryContext()` + `soul.md` + `RulesLoader.getRules()`

```
Inhalt:
- Rolle: "Du arbeitest mit Vault Operator, einem Vault-Intelligence-Backend."
- Kommunikationsstil: aus soul.md
- Regeln: "Rufe IMMER get_context als erstes auf. Am Ende: sync_session aufrufen."
- User-Regeln: aus Rules-Dateien
- User-Profil: aus user-profile.md
- Patterns: aus patterns.md
```

### `obsilo-skill-{name}` (pro Skill)

Quelle: `SkillsManager.getSkills()`

```
Pro Skill ein MCP Prompt:
- Name: "office-workflow"
- Description: "Anleitung fuer Dokument-Erstellung aus Vault-Notizen"
- Content: Skill-Markdown (gleicher Inhalt wie im Standalone System-Prompt)
```

---

## Definition of Done

- [ ] `obsilo-system-context` MCP Prompt implementiert
- [ ] Dynamisch generiert aus Memory + Rules + soul.md
- [ ] Skills als individuelle MCP Prompts registriert
- [ ] Claude befolgt Regeln beim ersten Tool-Call (Verifikation)
- [ ] Intern: MemoryService + SkillsManager + RulesLoader (read-only, 0 Aenderungen)

---

## Dependencies
- **FEAT-14-00**: MCP Server Core
- **MemoryService, SkillsManager, RulesLoader**: Bestehende Services (read-only)
