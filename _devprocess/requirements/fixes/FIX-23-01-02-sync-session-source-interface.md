---
id: FIX-23-01-02
feature: FEAT-23-01
epic: EPIC-23
adr-refs: [ADR-108]
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-01-02: sync_session ohne source_interface landet im falschen Tab

## Symptom

Aus Claude Desktop per MCP sync_session aufgerufen, landet die Conversation im History-Sidebar-Tab "obsilo" oder "unknown" statt im "claude"-Tab. Source-Tab-Filterung greift nicht.

## Root Cause

sync_session liest source_interface nicht aus dem MCP-Header oder aus den Tool-Args -- Default fiel auf "obsilo".

## Fix

source_interface wird aus dem MCP-Tool-Argument oder aus dem aktiven McpSession-Source-Token uebernommen, an ConversationStore.create durchgereicht und dort persistiert.

## Verification

Manueller Test mit Claude + Perplexity-MCP: Threads erscheinen im jeweiligen Source-Tab. BACKLOG: Status Done (commit 2d0a063).
