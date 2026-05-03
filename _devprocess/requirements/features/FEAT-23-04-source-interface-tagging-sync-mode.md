---
id: FEAT-23-04
title: Source-Interface-Tagging + Settings Cross-Surface-Sync
epic: EPIC-23
status: Active
priority: P0
date: 2026-05-03
related-bas: BA-26
adr-refs: [ADR-108]
plan-refs: []
depends-on: []
---

# FEAT-23-04: Source-Interface-Tagging + Settings Cross-Surface-Sync

## Description

Source-Interface-Tag (`'chatgpt' | 'claude-ai' | 'claude-code' |
'perplexity' | 'obsilo' | 'unknown'`) wird durchgaengig in Memory
und History gespeichert. Settings-Tab "Memory" bekommt einen neuen
Bereich "Cross-Surface Sync" mit zwei Modi (Auto-Sync vs Manual-
Sync). Memory-Thresholds (Throttle, Auto-Save) werden mit der
internen Pipeline geteilt.

## Benefits Hypothesis

Wenn Sebastian an einer Stelle entscheidet, wann externer Sync
Memory-Extraction triggert, und das Tag in jedem Eintrag mitlaeuft,
dann bleibt das Memory-Layer transparent und vorhersagbar.

## User Stories

**US-01** -- Settings-Sicht:
- **As** Sebastian
- **I want to** zwischen Auto-Sync und Manual-Sync waehlen koennen,
- **so that** ich die Cross-Surface-Cost selbst kontrolliere.

**US-02** -- Konsistente Thresholds:
- **As** Sebastian
- **I want to** dass externe Conversations dieselben Auto-Save-
  Schwellen wie interne nutzen,
- **so that** ich Settings nicht doppelt pflegen muss.

**US-03** -- Filter:
- **As** Sebastian
- **I want to** in `recall_memory` und `search_history` nach
  source_interface filtern koennen,
- **so that** ich gezielt z.B. nur "Coding-Insights aus Claude
  Code" finde.

## Success Criteria

| ID | Criterion | Measurement | Method |
|----|-----------|-------------|--------|
| SC-01 | source_interface-Spalte in `conversations`-Tabelle (Migration v3) | Schema-Audit | SQL |
| SC-02 | source_interface in `facts.source_interface` ueberall gesetzt | DB-Audit | SQL |
| SC-03 | Settings "Cross-Surface Sync" mit Toggle Auto/Manual sichtbar | UI-Sicht | Manuell |
| SC-04 | Auto-Sync triggert ExtractionQueue mit Plugin-internen Throttles | Eval | Test |
| SC-05 | Manual-Sync schreibt Conversation in pending-Bucket, ohne Extraction zu triggern | Eval | Test |
| SC-06 | Whitelist-Validation, unbekannte Werte fallen auf 'unknown' | Test | Test |
| SC-07 | Pending-Conversations sind im jeweiligen History-Tab sichtbar mit `pending`-Marker | UI-Sicht | Manuell |
| SC-08 | Pending -> Confirmed-Pfade: Star-Click in Obsilo, mark_for_memory MCP-Call, save_to_memory parallel | Eval | Test |

## Technical NFRs

- **Migration**: ConversationStore-Schema v2 -> v3 additiv (ALTER
  TABLE ADD COLUMN source_interface TEXT DEFAULT 'obsilo' plus
  ALTER TABLE ADD COLUMN sync_state TEXT DEFAULT 'confirmed'),
  bestehende Eintraege ohne Tag werden als 'obsilo' interpretiert,
  ohne sync_state als 'confirmed'.
- **Performance**: Migration laeuft auch bei 5000 Conversations
  unter 1s (additives ALTER TABLE).
- **Settings-Persistenz**: ueber die bestehende Settings-Pipeline
  (`memory.crossSurface` als neuer Block, mit `syncMode:
  'auto' | 'manual'` und Default `'auto'`).
- **Pending-Bucket**: `sync_state = 'pending' | 'confirmed' |
  'rejected'`. Pending-Conversations werden gelistet aber nicht
  im ExtractionQueue verarbeitet. Pending -> Confirmed Uebergang
  loescht den Marker und triggert ExtractionQueue genau einmal
  (idempotent durch sync_state-Check).

## ASRs

- **ASR-1 (Critical)**: Schema-Migration ConversationStore v2 -> v3.
- **ASR-2 (Critical)**: Settings-Block + UI in MemoryTab (existiert
  bereits, wird erweitert).
- **ASR-3 (Moderate)**: Whitelist-Validation in MCP-Tool-Layer.

## Definition of Done

- [ ] Schema-Migration + Tests
- [ ] Settings-UI + Persistenz
- [ ] Whitelist-Validation im MCP-Tool-Layer
- [ ] Filter-API in ConversationStore + RecallMemoryTool +
      SearchHistoryTool
- [ ] Tests gruen

## Out of Scope

- Profil-Routing (FEAT-23-06)
- Per-Source Cost-Telemetrie (Folge-IMP wenn Bedarf entsteht)
