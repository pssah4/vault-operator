---
id: FIX-23-01-03
feature: FEAT-23-01
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-01-03: Auto-Session-Tracking erzeugt Duplikat-Eintrag bei EPIC-23 Tools

## Symptom

EPIC-23 MCP-Tools (save_to_memory, save_conversation) wurden zweimal in der History gezaehlt: einmal explizit ueber save_conversation, einmal implizit ueber das generische Auto-Tracking aller MCP-Tool-Calls.

## Root Cause

Auto-Tracker hat alle MCP-Tools indiscriminat geloggt; EPIC-23-Tools haben aber eigene Persistenz-Pfade.

## Fix

SKIP_AUTO_TRACK Set fuer EPIC-23-Tools; das Auto-Tracking ueberspringt diese Tools und ueberlaesst die Persistenz dem Tool selbst.

## Verification

Test in Claude Desktop: nur 1 History-Row pro save_conversation. BACKLOG: Status Done (commit 2e25036).
