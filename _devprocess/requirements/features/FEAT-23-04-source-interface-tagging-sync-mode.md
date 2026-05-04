---
id: FEAT-23-04
title: Source-Interface-Tagging + Settings Cross-Surface-Sync
epic: EPIC-23
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
Bereich "Cross-Surface Sync" mit:
- einem globalen Default-Sync-Mode (Auto vs Manual),
- einem Per-Provider-Override (`global / Auto / Manual`) fuer jeden
  Provider in der Whitelist.

Memory-Thresholds (Throttle, Auto-Save) werden mit der internen
Pipeline geteilt.

**Privacy-Use-Case**: ChatGPT und Perplexity werden im Familien-
Kontext mit geteilten Accounts genutzt. Per-Provider-Override
verhindert, dass Familien-Threads ungewollt in Sebastians Memory
landen.

## Benefits Hypothesis

Wenn Sebastian an einer Stelle entscheidet, wann externer Sync
Memory-Extraction triggert, und das Tag in jedem Eintrag mitlaeuft,
dann bleibt das Memory-Layer transparent und vorhersagbar.

## User Stories

**US-01** -- Settings-Sicht (global):
- **As** Sebastian
- **I want to** einen globalen Default-Sync-Mode (Auto / Manual)
  setzen koennen,
- **so that** neue oder unbekannte Provider sinnvoll vorkonfiguriert
  sind.

**US-02** -- Per-Provider-Override (Privacy):
- **As** Sebastian
- **I want to** pro Provider entscheiden, ob Auto-Sync oder
  Manual-Sync gilt,
- **so that** ChatGPT und Perplexity (Familien-Account, Kinder-
  Hausaufgaben-Threads) auf Manual stehen koennen, waehrend
  Claude.ai und Claude Code auf Auto laufen.

**US-03** -- Konsistente Thresholds:
- **As** Sebastian
- **I want to** dass externe Conversations dieselben Auto-Save-
  Schwellen wie interne nutzen,
- **so that** ich Settings nicht doppelt pflegen muss.

**US-04** -- Filter:
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
| SC-03 | Settings "Cross-Surface Sync" mit globalem Default-Toggle Auto/Manual | UI-Sicht | Manuell |
| SC-04 | Per-Provider-Override-Liste mit drei Werten ('global', 'auto', 'manual') pro Whitelist-Provider | UI-Sicht | Manuell |
| SC-05 | Default-Settings auf neuer Installation: Claude.ai/Claude Code = Auto, ChatGPT/Perplexity/Unknown = Manual | Test | Test |
| SC-06 | Auto-Sync triggert ExtractionQueue mit Plugin-internen Throttles | Eval | Test |
| SC-07 | Manual-Sync schreibt Conversation in pending-Bucket, ohne Extraction zu triggern | Eval | Test |
| SC-08 | Effektiver Mode pro Conversation = `perProvider[source_interface] ?? defaultSyncMode` | Test | Test |
| SC-09 | Whitelist-Validation, unbekannte Werte fallen auf 'unknown' (Sync-Mode laut Per-Provider-Override fuer 'unknown') | Test | Test |
| SC-10 | Pending-Conversations sind im jeweiligen History-Tab sichtbar mit `pending`-Marker | UI-Sicht | Manuell |
| SC-11 | Pending -> Confirmed-Pfade: Star-Click in Obsilo, mark_for_memory MCP-Call, save_to_memory parallel | Eval | Test |

## Technical NFRs

- **Migration**: ConversationStore ist JSON-basiert; Migration
  ueber additive optionale Felder am `ConversationMeta`-Interface
  (`sourceInterface?`, `syncState?`). Bestehende Conversation-
  Dateien ohne diese Felder werden beim Laden als 'obsilo' /
  'confirmed' interpretiert. Kein Schreib-Pass noetig.
- **Performance**: O(1) pro Conversation -- Default-Mapping passiert
  beim Lesen.
- **Settings-Persistenz**: ueber die bestehende Settings-Pipeline
  (`memory.crossSurface` als neuer Block, mit:
  - `defaultSyncMode: 'auto' | 'manual'` (Default: `'auto'`)
  - `perProvider: Record<SourceInterface, 'global' | 'auto' |
    'manual'>` mit Defaults: claude-ai/claude-code = 'global',
    chatgpt/perplexity/unknown = 'manual', obsilo = 'global').
  Default-Mapping macht Sebastians Familien-Use-Case (ChatGPT,
  Perplexity geteilt) sofort sicher, ohne dass er die Settings
  selbst erstmal aufrufen muss.
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
- [ ] Settings-UI mit Default-Toggle + Per-Provider-Liste
- [ ] Settings-Persistenz mit privacy-sicheren Defaults
- [ ] resolveSyncMode(sourceInterface) Helper mit Test
- [ ] Whitelist-Validation im MCP-Tool-Layer
- [ ] Filter-API in ConversationStore + RecallMemoryTool +
      SearchHistoryTool
- [ ] Tests gruen

## Out of Scope

- Profil-Routing (FEAT-23-06)
- Per-Source Cost-Telemetrie (Folge-IMP wenn Bedarf entsteht)
- Per-Conversation-Override (waere noch granularer; falls Bedarf,
  IMP-Folge mit `conversations.sync_mode_override`-Spalte)
