---
id: FIX-23-04-02
feature: FEAT-23-04
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-04-02: MCP Rate-Limiter (sliding window, AUDIT-015 M-1)

## Symptom

AUDIT-015 M-1: MCP-Tools waren unlimited callable. Boeswillige Clients konnten teure Tools (recall_memory mit Embedding-Generation, search_vault) in Schleife aufrufen -- Cost- und CPU-DoS.

## Fix

McpRateLimiter mit sliding-window 60s, drei Klassen:
- cheap (60/min): get_context, sync_session ping
- medium (30/min): save_to_memory, save_conversation, search_history
- expensive (10/min): recall_memory, search_vault, ingest_triage

Ueberschreitung -> 429 mit Retry-After-Header.

## Verification

AUDIT-015 M-1 resolved, Unit-Tests in McpRateLimiter.test.ts. BACKLOG: Status Done (commit a51ff20).
