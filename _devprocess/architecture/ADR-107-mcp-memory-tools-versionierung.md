---
id: ADR-107
title: MCP-Memory-Tools Versionierung -- V1 update_memory deprecaten, V2 als save_to_memory
date: 2026-05-03
deciders: Sebastian + Architekt-Agent
related-features: FEAT-23-01, FEAT-23-02, FEAT-23-05
related-adrs: ADR-77 (Memory-v2-Storage-Schema)
---

# ADR-107: MCP-Memory-Tools Versionierung

## Status

Proposed (RE-Pass 2026-05-03).

## Kontext

Das bestehende MCP-Tool `update_memory` schreibt heute in V1-MD-
Files via `MemoryService.appendToFile`. Externe Clients (Claude
Desktop, ChatGPT-MCP, Claude Code mit MCP-Config, Perplexity)
nutzen das Tool produktiv. Memory v2 ist seit Phase 6 die kanonische
Storage-Schicht; V1-Pfade sind tot, aber das MCP-Tool fuettert sie
noch.

Frage: wie schalten wir um, ohne externe Konfigurationen
beibehalten zu muessen?

## Decision Drivers

- **Backward-Compat**: bestehende Konfigurationen externer Clients
  muessen weiter funktionieren. Sebastian will nicht 4 MCP-Configs
  anfassen.
- **Single-Source-of-Truth**: alle MCP-Schreibungen sollen in v2
  landen, nicht in toten V1-Files.
- **Sichtbarkeit**: Sebastian soll wissen, wann V1-Tool noch
  genutzt wird.
- **Cut-over-Pfad**: spaetere Entfernung des Legacy-Tools soll
  trivial sein.

## Considered Options

### Option A: V1-Tool ersatzlos loeschen, neue Tools `save_to_memory` etc. exposen

**Pro:** sauberer Schnitt, kein Legacy-Code.
**Con:** alle externen Konfigurationen brechen sofort.

### Option B: V1-Tool behalten, neue Tools daneben exposen, V1 in v2 mappen

**Pro:** Backward-Compat, klare Migration, Telemetrie-Daten zeigen
Cut-over-Reife.
**Con:** zwei Tools mit aehnlicher Semantik gleichzeitig sichtbar
(API-Surface waechst kurzfristig).

### Option C: V1-Tool im Code behalten, im MCP-Manifest unsichtbar machen

**Pro:** keine API-Verbreiterung.
**Con:** existierende Clients sehen das Tool nicht mehr im Manifest
und brechen.

## Decision

**Option B**.

Konkret:

1. `update_memory`-MCP-Tool bleibt registriert.
2. Tool-Description traegt `[deprecated, use save_to_memory]`-
   Marker.
3. Der Handler ruft intern `save_to_memory(content, tags=[category],
   source_interface='unknown')` und schreibt damit in v2.
4. Telemetrie-Channel `legacy_update_memory_called` zaehlt jeden
   Aufruf.
5. Neue Tools `save_to_memory`, `save_conversation`, `recall_memory`,
   `search_history` werden parallel exposed.
6. Nach 2 Wochen Live-Use entscheidet Sebastian ueber komplette
   Entfernung des Legacy-Tools.

## Konsequenzen

**Positive**: keine Brueche fuer externe Clients; V1-Storage stirbt
ab; Cut-over-Punkt datengetrieben.

**Negative**: kurze Phase mit Doppel-API; Telemetrie muss aktiv
geprueft werden.

**Risiken**: wenn Sebastian die Telemetrie nicht ansieht, lebt
das Legacy-Tool unbemerkt weiter -> Mitigation: Settings-Tab zeigt
Aufruf-Counter.

## Implementation Notes

(allowed-to-stale)

- update_memory-Handler: `src/mcp/tools/updateMemory.ts` (geplant umzubauen)
- save_to_memory-Handler: `src/mcp/tools/saveToMemory.ts` (NEU)
- save_conversation-Handler: `src/mcp/tools/saveConversation.ts` (NEU)
- recall_memory-Handler: `src/mcp/tools/recallMemory.ts` (NEU, wrappt RecallMemoryTool)
- search_history-Handler: `src/mcp/tools/searchHistory.ts` (NEU, wrappt SearchHistoryTool)
- MCP-Bridge: `src/mcp/McpBridge.ts` braucht 4 neue case-Branches
- Telemetrie: `src/core/memory/MemoryV2Telemetry.ts` neuer Channel
