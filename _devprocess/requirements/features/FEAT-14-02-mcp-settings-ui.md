# Feature: MCP Server Settings UI

> **Feature ID**: FEAT-14-02
> **Epic**: EPIC-14 - MCP Connector
> **Priority**: P0-Critical
> **Effort Estimate**: S

## Feature Description

Settings-Tab fuer den MCP Server in den Vault Operator Settings. Ermoeglicht Aktivierung,
Statusanzeige und Claude Desktop Auto-Konfiguration.

## User Stories

### Story 1: MCP Server aktivieren
**Als** Obsidian-Nutzer
**moechte ich** den MCP Server mit einem Toggle aktivieren
**um** meinen Vault als Connector verfuegbar zu machen

### Story 2: Claude Desktop Auto-Config
**Als** User
**moechte ich** einen Button der Claude Desktop automatisch konfiguriert
**um** keine JSON-Datei manuell bearbeiten zu muessen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Server laesst sich ein/ausschalten | Toggle funktioniert | Funktionstest |
| SC-02 | Status wird korrekt angezeigt | Running/Stopped/Connected | Visueller Test |
| SC-03 | Auto-Config schreibt claude_desktop_config.json | Konfiguration korrekt | Config-Pruefung |

---

## Definition of Done

- [ ] MCP Server Toggle (enable/disable, default: disabled)
- [ ] Status-Anzeige (Stopped / Running / Connected)
- [ ] "Configure Claude Desktop" Button (schreibt claude_desktop_config.json)
- [ ] Anleitung-Text: Wie man den Connector in Claude einrichtet
- [ ] Settings: `enableMcpServer: boolean` (default: false)

---

## Dependencies
- **FEAT-14-00**: MCP Server Core
