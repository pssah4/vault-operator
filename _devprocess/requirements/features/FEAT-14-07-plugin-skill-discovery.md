# Feature: Plugin Skill Discovery

> **Feature ID**: FEAT-14-07
> **Epic**: EPIC-14 - MCP Connector
> **Priority**: P2-Medium
> **Effort Estimate**: M

## Feature Description

VaultDNA-basierte Plugin-Erkennung wird als MCP Tool exponiert (`discover_capabilities`). Claude kann dynamisch erkennen welche Obsidian-Plugins installiert sind und deren Commands/APIs nutzen.

## User Stories

### Story 1: Plugin-Commands aus Claude
**Als** Claude-User mit Obsidian-Plugins
**moechte ich** dass Claude meine Plugins erkennt und nutzen kann
**um** Dataview-Queries, Templater-Templates oder andere Plugin-Features direkt auszuloesen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Installierte Plugins werden erkannt | Alle aktiven Plugins | Plugin-Listing |
| SC-02 | Plugin-Commands als MCP Tools aufrufbar | execute_command via MCP | Funktionstest |
| SC-03 | Plugin-APIs als MCP Tools aufrufbar | call_plugin_api via MCP | Funktionstest |

---

## Definition of Done

- [ ] `discover_capabilities` als MCP Tool
- [ ] Plugin-Commands via `execute_command` MCP Tool
- [ ] Plugin-APIs via `call_plugin_api` MCP Tool
- [ ] Skill-Files als MCP Prompt-Kontext verfuegbar

---

## Dependencies
- **FEAT-14-00**: MCP Server Core
- **VaultDNAScanner**: Bestehende Plugin-Discovery
