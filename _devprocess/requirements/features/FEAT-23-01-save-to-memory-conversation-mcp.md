---
id: FEAT-23-01
title: save_to_memory + save_conversation MCP-Tools (Schreibpfad)
epic: EPIC-23
priority: P0
date: 2026-05-03
related-bas: BA-26
adr-refs: [ADR-107]
plan-refs: []
depends-on: []
---

# FEAT-23-01: save_to_memory + save_conversation MCP-Tools

## Description

Zwei neue MCP-Tools, die externe Chat-UIs (ChatGPT, Claude.ai, Claude
Code, Perplexity) ueber Vault Operator Remote MCP nutzen koennen, um
Insights in Vault Operator's v2-Memory und History zu schreiben.

## Benefits Hypothesis

Wenn Sebastian aus jedem Chat-Tool Insights direkt in Vault Operator
festhalten kann, dann sinkt die Reibung beim Tool-Wechsel und kein
Insight geht verloren.

## User Stories

**US-01** -- Functional Job (Save-Memory):
- **As** Sebastian, der gerade in ChatGPT ueber das EnBW-Coworking-
  Konzept arbeitet,
- **I want to** ein wichtiges Detail in Vault Operator's Memory schreiben
  ("save_to_memory"-Tool-Aufruf),
- **so that** ich es spaeter in Claude Code beim Architektur-
  Review wiederfinde.

**US-02** -- Functional Job (Save-Conversation):
- **As** Sebastian, der eine ergiebige Brainstorming-Session in
  Claude.ai gefuehrt hat,
- **I want to** die ganze Conversation in Vault Operator speichern,
- **so that** sie in der History-Sidebar verfuegbar ist und
  optional Memory-Extraction triggert.

**US-03** -- Emotional Job:
- **As** Sebastian
- **I want to** sicher sein, dass save_to_memory in v2 landet und
  nicht in Legacy-MD-Files,
- **so that** ich Vertrauen in Vault Operator als Memory-Hub habe.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Measurement | Method |
|----|-----------|-------------|--------|
| SC-01 | save_to_memory schreibt einen Fact, der in Vault Operator recall_memory wiedergefunden wird | Cross-Tool-UAT | Manuell |
| SC-02 | save_conversation legt eine Conversation an, die in der History-Sidebar erscheint | UI-Sicht | Manuell |
| SC-03 | Beide Tools tragen das source_interface in jedem geschriebenen Eintrag | DB-Audit | SQL |
| SC-04 | Auto-Sync-Mode triggert Memory-Extraction mit denselben Thresholds wie interne Conversations | Eval | Test |
| SC-05 | Manual-Sync-Mode triggert keine Extraction ohne expliziten mark_for_memory-Flag | Eval | Test |

## Technical NFRs

- **Performance**: < 500ms p95 fuer save_to_memory, < 1s p95 fuer
  save_conversation (vor Atomizer-Extraction).
- **Concurrency**: WriterLock-Pattern (ADR-79) bei v2-Schreibern
  bleibt erhalten.
- **Living-Document-Semantik (Update FIX-23-01-01, ADR-110)**:
  save_conversation erweitert die Active-Session der Source statt
  jedes Mal eine neue Conversation anzulegen. BA-24 Selling-Point #5
  wird damit in der MCP-Schicht sichtbar. Reuse von FEAT-03-18
  Memory-Delta-Logik ueber `lastExtractedMessageIndex`. Default:
  `crossSurface.livingDocumentByDefault = true`. Per-Call-Override
  `living_document=false` legt eine getrennte Conversation an.
- **Cross-Interface-Thread-Klammer (Update FIX-23-01-01)**: Plugin
  generiert einen `cross_interface_thread_id`, externer LLM kann
  ihn ueber source_interface-Grenzen hinweg mitsenden, alle
  Conversations werden ueber das Thread-ID verbunden.
- **Idempotenz**: save_conversation appendet bei identischem
  Message-Anfang automatisch in die bestehende Active-Session
  (Hash-Match), explizit ueberschreibbar via `conversation_id`-
  Argument oder `living_document=false`.

## ASRs

- **ASR-1 (Critical)**: MCP-Tool-Registrierung im
  `src/mcp/tools/index.ts` plus Bridge-Routing in `McpBridge.ts`.
- **ASR-2 (Moderate)**: source_interface als Pflichtargument in
  save_conversation, optional in save_to_memory mit 'unknown'-
  Fallback.
- **ASR-3 (Moderate)**: Bridge-Architektur zum bestehenden
  FactStore + ConversationStore via thin adapter ohne neue
  Storage-Klassen.

## Definition of Done

- [ ] Zwei MCP-Tools registriert + dokumentiert
- [ ] Atomizer-Pfad fuer save_to_memory gewired
- [ ] ConversationStore-Pfad fuer save_conversation gewired
- [ ] Source-Interface-Tag in beiden Pfaden gesetzt
- [ ] Tests gruen (Unit + Eval)
- [ ] Cross-Tool-Round-Trip-UAT bestanden

## Out of Scope

- Profil-Routing (FEAT-23-06)
- Continue-Pfad fuer externe Conversations
