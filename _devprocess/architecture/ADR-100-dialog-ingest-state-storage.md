---
id: ADR-100
title: Dialog-Ingest-State-Storage (ingest_session-Tabelle)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-22
---

# ADR-100: Dialog-Ingest-State-Storage (ingest_session-Tabelle)

## Context

Aktiver Dialog-Ingest-Modus (FEAT-19-22) braucht persistenten State zwischen Multi-Turn-Dialog-Steps: User-Selektion der Take-Aways, User-Edits am Update-Plan, beruehrte Notes-Liste, generierte Block-IDs. State muss Plugin-Restart ueberleben (User koennte Obsidian schliessen mitten im Dialog). Drei Storage-Optionen: Conversation-Metadata, eigene DB-Tabelle, Memory-v2-Facts.

## Decision Drivers

- Persistenz ueber Plugin-Restart
- Kein Memory-v2-Schema-Bruch
- Resume-Faehigkeit
- Cleanup nach Abschluss (kein State-Leak)

## Considered Options

### Option A: ConversationStore-Metadata

Pros:
- Conversation existiert ohnehin pro Dialog-Session.
- Reuse existing Persistenz.

Cons:
- Conversation-Metadata-Schema ist nicht fuer strukturierten Multi-Step-State gedacht.
- Bei Conversation-Delete waere Ingest-State weg.

### Option B: Eigene Tabelle `ingest_session` in knowledge.db

Pros:
- Klares Schema, getrennt von Conversation-Lifecycle.
- Resume trivial.
- Cleanup-Job moeglich (alte abgeschlossene Sessions loeschen).

Cons:
- Schema-Migration-Schritt (aber im v9->v10 Bundle absorbierbar, wenn rechtzeitig im Architecture-Phase entschieden).

### Option C: Memory-v2 facts mit kind='ingest-state'

Pros:
- Reuse existing Storage.

Cons:
- Memory-v2-Facts sind fuer Knowledge-Statements, nicht fuer ephemeren Workflow-State. Verstoss gegen Schema-Semantik.
- Cleanup-Logik wuerde Memory-v2-Aging stoeren.

## Decision

**Option B**: Eigene Tabelle `ingest_session` in knowledge.db. Ergaenzt das v9->v10-Bundle (siehe ADR-92).

Begruendung:
- Workflow-State ist nicht persistentes Knowledge, gehoert nicht in Memory-v2-Facts.
- Conversation-Lifecycle (User loescht Chat) und Ingest-Lifecycle (Ingest-Source bleibt valide) sind orthogonal.
- Eigene Tabelle erlaubt Cleanup (Sessions aelter 7 Tage und Status='abandoned' loeschen).

## Consequences

### Positive
- Clean Resume nach Plugin-Restart.
- Workflow-State und Memory-State klar getrennt.
- Einfache Cleanup-Logik.

### Negative
- v9->v10-Bundle (ADR-92) waechst um eine fuenfte Tabelle. Kein architektonisches Problem, aber Migration-Test muss diese Tabelle einbeziehen.

### Risks
- Wenn Dialog-Sessions sehr lang werden (viele User-Turns), waechst Tabelle. Mitigation: Cleanup-Job nach Abschluss oder Abbruch.

## Implementation Notes

Schema `ingest_session`:
```
id INTEGER PRIMARY KEY AUTOINCREMENT,
source_uri TEXT NOT NULL,
mode TEXT NOT NULL,              -- 'A' (Dialog) | 'B' (Auto)
status TEXT NOT NULL,            -- 'active' | 'awaiting-user' | 'completed' | 'abandoned'
started_at TEXT NOT NULL,
last_turn_at TEXT NOT NULL,
state_json TEXT NOT NULL,        -- Take-Aways, User-Selections, Update-Plan, Block-IDs
conversation_id TEXT             -- optional FK zur Chat-Conversation
```

state_json enthaelt:
- `takeaways: [{text, sourcePosition, userImportance, userEmphasis}]`
- `update_plan: [{noteAction: 'create'|'update', notePath, contentPreview}]`
- `tension_markers: [{claim, targetNote, confidence}]`
- `current_step: 'take-away-selection' | 'plan-review' | 'execute' | 'done'`

Cleanup: Background-Job loescht Sessions wo `status='abandoned'` und `last_turn_at < now - 7d`.
