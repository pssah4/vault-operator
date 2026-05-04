---
id: FIX-23-04-06
feature: FEAT-23-04
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-04-06: write_vault content-length cap (AUDIT-016 M-1)

## Symptom

AUDIT-016 M-1: write_vault hat content-Strings beliebiger Groesse akzeptiert; ein boeswilliger MCP-Caller konnte mehrere GB pro Call ins File-System schreiben.

## Fix

Pre-flight content-cap in writeVault.ts:
- MAX_CONTENT_BYTES_PER_OP = 4 MB pro Datei
- MAX_AGGREGATE_BYTES_PER_BATCH = 16 MB pro Batch

Ueberschreitung -> 400 vor jedem Disk-Write.

## Verification

AUDIT-016 M-1 resolved, Tests in writeVault.test.ts. BACKLOG: Status Done (commit 2e26b83).
