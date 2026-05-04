---
id: FIX-23-04-09
feature: FEAT-23-01
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-04-09: ConversationStore.generateId crypto.randomUUID (AUDIT-016 M-4)

## Symptom

AUDIT-016 M-4: ConversationStore.generateId nutzte `Math.random().toString(36)` -- vorhersagbar genug, dass ein boeswilliger Caller ConversationIds erraten und fremde Threads ueberschreiben kann.

## Fix

`crypto.randomUUID()` (mit Fallback auf Math.random fuer Test-Environments ohne crypto):

```typescript
const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
return `${date}-${uuid}`;
```

## Verification

AUDIT-016 M-4 resolved, Tests in ConversationStore.test.ts. BACKLOG: Status Done (commit 2e26b83).
