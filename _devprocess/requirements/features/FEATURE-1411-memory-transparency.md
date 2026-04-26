# Feature: Memory Transparency (Agent vs. Human)

> **Feature ID**: FEATURE-1411
> **Epic**: EPIC-014 - MCP Connector
> **Priority**: P1-High
> **Effort Estimate**: S
> **Status**: Implementiert -- **Subsumed by Memory v2 (FEATURE-0319 + FEATURE-0320)** seit 2026-04-26. Source-Tracking-Konzept (`human` vs. `mcp`) wird in Memory v2 als `source_interface`-Spalte differenzierter (z.B. `obsilo`, `claude-desktop`, `claude-code`, `chatgpt-dev-mcp`). MCP-Bridge-Conversation-Capture wird durch Setting `mcp.conversationCapture` (FEATURE-0319) gesteuert: `off` / `obsilo` (Solo-Modus, heutiges Verhalten) / `ucm` (Cross-Source via UCM-Service). Visual-Indicator und Living-Document-Marker sind in FEATURE-0319 DoD; History-Sidebar-Tabs (Local + UCM) in FEATURE-0320.

## Feature Description

Source-Tracking fuer alle Interaktionen: `human` (Standalone) vs. `mcp` (Connector).
Ermoeglicht Audit-Trail und verhindert unkontrolliertes Memory-Poisoning.
Beide Quellen fliessen in denselben Memory-Speicher -- eine gemeinsame History.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Source bei jeder Session gespeichert | 100% | Audit-Log |
| SC-02 | Sessions aus beiden Modi in einer History | Gemeinsame DB | History-Pruefung |
| SC-03 | Learnings aus MCP gleichwertig gelernt | Recipes + Patterns | Vergleichstest |

## Definition of Done

- [x] sessions-Tabelle: `source` Feld ('human' | 'mcp') -- `MemoryDB.ts:24`
- [x] sync_session setzt `source = 'mcp'` -- `syncSession.ts:100`
- [x] Standalone SessionExtractor setzt `source = 'human'` -- default in `MemoryService.ts:158`
- [x] Memory-Updates via MCP mit `[via MCP]` markiert -- `updateMemory.ts:40-41`
- [x] Bestehende Sessions: `source = 'human'` (Default, keine Migration) -- SQL DEFAULT

## How It Works

`MemoryService.writeSessionSummary()` akzeptiert einen optionalen `source`-Parameter (default: `'human'`).
- Standalone (SessionExtractor): ruft ohne source auf -> `'human'`
- MCP (sync_session): ruft mit `source: 'mcp'` auf
- Memory-Updates via MCP: prefixed mit `[via MCP]` (updateMemory.ts)
- DB-Schema: `sessions.source TEXT DEFAULT 'human'` (MemoryDB.ts)

## Dependencies
- **FEATURE-1400**: MCP Server Core
- **MemoryService, MemoryDB**: Bestehend (sessions-Tabelle hat bereits `source` Spalte)
