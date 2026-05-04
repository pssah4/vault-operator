---
id: FIX-23-04-07
feature: FEAT-23-02
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-04-07: search_history LIKE-wildcard escape (AUDIT-016 M-2)

## Symptom

AUDIT-016 M-2: search_history hat den Query-String unescaped in eine SQL LIKE-Klausel geschoben. User-Input wie `%admin%` matchte alle Threads, %% fuehrte zu unerwarteten Treffern.

## Fix

`query.replace(/[%_\\]/g, '\\$&')` plus `LIKE ? ESCAPE '\\'`-Klausel. Wildcards werden literal behandelt.

## Verification

AUDIT-016 M-2 resolved, Tests in searchHistory.test.ts. BACKLOG: Status Done (commit 2e26b83).
