---
id: FIX-23-04-08
feature: FEAT-03-25
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: [FIX-23-04-04]
created: 2026-05-03
---

# FIX-23-04-08: get_context strictSourceIsolation gating (AUDIT-016 M-3)

## Symptom

AUDIT-016 M-3: get_context hat unabhaengig von strictSourceIsolation alle Memory- und Soul-Sektionen ausgeliefert. Cross-Source-Leak war auch im aggregierten Context-Block moeglich.

## Fix

In getContext.ts: wenn settings.memory.crossSurface.strictSourceIsolation true und source !== 'obsilo', werden Memory/Soul/Skills/Rules-Sektionen ausgeblendet.

## Verification

AUDIT-016 M-3 resolved, Tests in getContext.test.ts. BACKLOG: Status Done (commit 2e26b83).
