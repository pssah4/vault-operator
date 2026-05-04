---
id: FIX-23-01-04
feature: FEAT-23-01
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: [FIX-23-01-03]
created: 2026-05-03
---

# FIX-23-01-04: ensureSession erzeugt leere ConversationStore-Row bei jedem MCP-Call -> lazy

## Symptom

Nach FIX-23-01-03 funktionierte save_conversation, aber jeder simple MCP-Call (z.B. recall_memory ohne Append) hat ueber ensureSession eine leere ConversationStore-Row angelegt. Memory-Sidebar volle leere Threads.

## Root Cause

ensureSession war eager: bei jedem MCP-Tool-Call wurde proaktiv eine Conversation-Row erzeugt, auch wenn keine Messages dazukamen.

## Fix

createSessionIfNeeded() ist jetzt lazy: die ConversationStore-Row entsteht erst, wenn das erste Message-Append tatsaechlich passiert.

## Verification

Test mit reinen Read-Tools: keine leeren Threads in der Sidebar. BACKLOG: Status Done (commit e4d94e6).
