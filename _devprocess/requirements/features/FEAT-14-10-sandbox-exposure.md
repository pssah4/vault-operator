# Feature: Sandbox Exposure via MCP

> **Feature ID**: FEAT-14-10
> **Epic**: EPIC-14 - MCP Connector
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

Obsilo's isolierte Sandbox wird als MCP Tool exponiert. Claude kann Code senden,
Obsilo fuehrt ihn sicher in der Sandbox aus. Ermoeglicht Batch-Operationen die
mit einzelnen read/write-Calls ineffizient waeren.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Code in isolierter Sandbox | Kein Zugriff ausserhalb | Security-Test |
| SC-02 | Vault-APIs verfuegbar | read, write, list | Funktionstest |
| SC-03 | Rate-Limiting aktiv | 10 Writes/min, 5 HTTP/min | Load-Test |

## Definition of Done

- [ ] `evaluate_expression` als MCP Tool
- [ ] AstValidator prueft Code vor Ausfuehrung
- [ ] Rate-Limiting
- [ ] .obsidian-Pfade blockiert
- [ ] Intern: SandboxExecutor (read-only, 0 Aenderungen)

## Dependencies
- **FEAT-14-00**: MCP Server Core
- **SandboxExecutor**: Bestehende Sandbox
