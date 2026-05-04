---
id: FIX-23-04-04
feature: FEAT-23-02
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-04-04: strictSourceIsolation Setting fuer recall_memory + search_history (AUDIT-015 M-3)

## Symptom

AUDIT-015 M-3: recall_memory und search_history haben standardmaessig ueber alle Source-Interfaces hinweg gesucht. Eine Claude-Session konnte ChatGPT-Memories abfragen -- Cross-Source-Leak.

## Fix

Neues Setting `memory.crossSurface.strictSourceIsolation` (Default: false). Wenn true:
- recall_memory liefert nur Memories der aktuellen Source-Interface
- search_history filtert auf den aktuellen Source-Tab

User kann das Setting fuer max-Privacy-Setups einschalten.

## Verification

AUDIT-015 M-3 resolved, Tests in recallMemory.test.ts + searchHistory.test.ts. BACKLOG: Status Done (commit a51ff20).
