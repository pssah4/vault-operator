---
id: FIX-23-04-05
feature: FEAT-23-01
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: [FIX-23-01-05]
created: 2026-05-03
---

# FIX-23-04-05: sync_session per-message-cap + transcript-length-limit (AUDIT-016 H-1)

## Symptom

AUDIT-016 H-1: sync_session war der zweite Persistenz-Pfad nach save_conversation und hatte die Caps aus FIX-23-01-05 nicht uebernommen. DoS-Vektor identisch.

## Fix

syncSession.ts importiert MAX_MESSAGE_TEXT_LENGTH und MAX_MESSAGES_PER_CALL aus saveConversation und validiert vor jedem DB-Write. Ueberschreitung -> 400.

## Verification

AUDIT-016 H-1 resolved, Tests in syncSession.test.ts. BACKLOG: Status Done (commit 2e26b83).
