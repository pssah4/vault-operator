---
id: FIX-23-01-05
feature: FEAT-23-01
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-01-05: save_conversation per-message-size-cap (DoS-Vektor, AUDIT-015 H-1)

## Symptom

AUDIT-015 H-1: save_conversation ueber MCP nahm Message-Texte beliebiger Groesse entgegen. Ein boeswilliger Caller koennte 100MB-Strings einliefern -- DoS gegen ConversationStore + sql.js-WASM.

## Fix

Hard caps in saveConversation.ts:
- MAX_MESSAGE_TEXT_LENGTH = 100_000 chars pro Message
- MAX_MESSAGES_PER_CALL = 500 Messages pro Call

Validierung vor jedem DB-Write; Ueberschreitung -> 400 mit konkreter Limit-Angabe.

## Verification

AUDIT-015 H-1 resolved. Tests in saveConversation.test.ts. BACKLOG: Status Done (commit b7492ca).
