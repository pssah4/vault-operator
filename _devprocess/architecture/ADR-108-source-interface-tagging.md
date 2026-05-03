---
id: ADR-108
title: Source-Interface-Tagging fuer cross-surface origin tracking
status: Proposed
date: 2026-05-03
deciders: Sebastian + Architekt-Agent
related-features: FEAT-23-04, FEAT-23-01, FEAT-23-02, FEAT-23-03
related-adrs: ADR-77 (Memory-v2-Storage-Schema)
---

# ADR-108: Source-Interface-Tagging

## Status

Proposed (RE-Pass 2026-05-03).

## Kontext

EPIC-23 "Cross-Surface AI Workflow" exposed Obsilo's Memory + History
ueber MCP an externe Chat-UIs. Damit landen Conversations und Facts
aus mehreren Surfaces im selben Storage. Ohne Differenzierung kann
Sebastian nicht erkennen, woher ein Fact stammt -- weder in der
History-Sidebar noch in Memory-Recalls.

Profil-System (BA-24 Section 7.1 P0 "min. 4 Profile") loest das
Problem strukturierter, ist aber fuer P0 zu gross (siehe
FEAT-23-06 Wiedervorlage). Source-Interface-Tagging ist der
P0-Mittelweg: ein Tag pro Eintrag, ohne Routing-Logik.

## Decision Drivers

- **Sichtbarkeit**: Sebastian muss in der UI sofort erkennen, wo
  ein Eintrag herkommt.
- **Filterbarkeit**: Tools koennen nach source_interface filtern.
- **Migrations-Sicherheit**: bestehende Eintraege bekommen sinnvollen
  Default ('obsilo').
- **Schema-Sparsamkeit**: minimale Migration, additives Schema.

## Considered Options

### Option A: Source-Interface als String-Tag (Whitelist)

**Pro:** klein, additives Schema (`ALTER TABLE ADD COLUMN`),
trivial filterbar, Default-Migration einfach.
**Con:** kein semantisches Routing, Whitelist muss gepflegt werden.

### Option B: Volles Profil-System sofort

**Pro:** loest auch Routing-Bedarf, BA-24 P0-konform.
**Con:** zu gross fuer P0; ohne Live-Use bauen wir 4 abstrakte
Profile ohne zu wissen, welche real noetig sind.

### Option C: Source-Interface als JSON-Property im Metadata-Feld

**Pro:** keine Schema-Migration noetig.
**Con:** SQL-Filter aufwendig, Indexing geht nicht; performance
suffers bei groesseren Datenmengen.

## Decision

**Option A**.

Konkret:

1. Whitelist-Enum: `'chatgpt' | 'claude-ai' | 'claude-code' |
   'perplexity' | 'obsilo' | 'unknown'`.
2. Memory v2 `facts.source_interface` existiert bereits (FEAT-03-15
   Schema). Konsistente Befuellung sicherstellen.
3. ConversationStore-Schema v2 -> v3 additiv mit zwei neuen Spalten:
   - `ALTER TABLE conversations ADD COLUMN source_interface TEXT
     NOT NULL DEFAULT 'obsilo'`
   - `ALTER TABLE conversations ADD COLUMN sync_state TEXT NOT NULL
     DEFAULT 'confirmed'` (Werte: 'pending', 'confirmed', 'rejected'
     -- Manual-Sync-Mode parkt save_conversation-Eintraege in
     'pending' bis User Star-Click oder mark_for_memory triggert).
   Migration faellt unter 1s bei 5000 Conversations.
4. MCP-Tool-Layer nimmt source_interface als Argument, validiert
   gegen Whitelist, faellt auf 'unknown' bei unbekanntem Wert.
5. Filter-API in:
   - `ConversationStore.list({sourceInterface?})`
   - `RecallMemoryTool` queryFacts mit optionalem Filter
   - `SearchHistoryTool` mit optionalem Filter
6. UI: History-Sidebar Source-Tabs, Source-Pill am Listeneintrag,
   Read-Only-Banner in Chat-View bei externen Conversations.

## Konsequenzen

**Positive**: minimale Migration, sofortige Sichtbarkeit, FEAT-23-06
Profile koennen orthogonal dazukommen ohne diese Aenderung anzupacken.

**Negative**: zwei Tag-Konzepte (source_interface + spaeteres
profile) koexistieren spaeter -- das ist okay, weil sie unterschiedliche
Achsen sind (Origin vs Routing).

**Risiken**: Whitelist veraltet wenn neue Surfaces dazukommen.
Mitigation: 'unknown'-Fallback verhindert Brueche; Whitelist-
Erweiterung ist Settings-Task ohne Schema-Change.

## Implementation Notes

(allowed-to-stale)

- Schema-Migration: `src/core/history/ConversationStore.ts` v2->v3
- MCP-Tool-Validierung: `src/mcp/tools/validateSourceInterface.ts` (NEU, ~30 LOC)
- Filter-API: Erweiterung der drei oben genannten Stellen
- UI-Tabs: `src/ui/HistoryPanel.ts` (neuer Bereich am oberen Rand)
- Read-Only-Banner: AgentSidebarView mit `readOnly`-Flag
