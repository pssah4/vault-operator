---
id: EPIC-23
title: Cross-Surface AI Workflow
date: 2026-05-03
related-bas: BA-26
---

# EPIC-23: Cross-Surface AI Workflow

## Hypothesis Statement

Sebastian arbeitet taeglich mit ChatGPT, Claude.ai, Claude Code und
Perplexity neben Vault Operator. Ohne eine ueberdachende Memory- und
History-Schicht entstehen Insights in einem Tool und gehen im
naechsten verloren. Wenn Vault Operator via Remote-MCP zur einheitlichen
Memory- und History-Schicht ueber alle Surfaces wird, wird Vault Operator
zur Single Source of Truth fuer Sebastians AI-Wissen, und der
Tool-Wechsel verliert seine Reibung. Im Unterschied zu den
Memory-Loesungen einzelner Provider (ChatGPT-Memory, Claude
Projects, Mem0) liegt unser Fokus auf BYOI (Bring Your Own
Interface): jedes Chat-Frontend kann ueber MCP zum Vault Operator-Memory-
Hub greifen, mit klar erkennbarer Source-Interface-Differenzierung.

## How might we

Wie kann Sebastian aus jedem Chat-Tool gezielt Insights und
Conversations in Vault Operator's Memory + History festschreiben und beim
naechsten Tool-Wechsel sofort darauf zugreifen, ohne den Tool-Stack
zu wechseln und ohne dass das Lifecycle-Management des Memory-
Layers extra Arbeit fuer ihn erzeugt?

## Business Outcomes

- **OUT-01**: Cross-Surface-Memory-Coverage: Conversations aus min.
  2 externen Tools landen binnen 7 Tagen Live-Use in Vault Operator's
  History-Sidebar.
- **OUT-02**: Reduktion der Provider-Lock-In-Wechselkosten: Vault Operator
  haelt persistent Memory + History; Tool-Wechsel ohne Memory-
  Verlust.
- **OUT-03**: V1-Legacy-Pfad gegen Null: 100% der MCP-`update_memory`-
  Aufrufe landen im v2-FactStore, nicht in Legacy-MD-Files.

## Features (priorisiert)

### P0 (MVP)

| ID | Title | Wert |
|----|-------|------|
| FEAT-23-01 | save_to_memory + save_conversation MCP-Tools | Schreibpfad zu v2 |
| FEAT-23-02 | recall_memory + search_history MCP-Tools | Lese-Pfad zu v2 |
| FEAT-23-03 | History-Sidebar Source-Tabs + Read-Only-View | UI fuer externe Conversations |
| FEAT-23-04 | Source-Interface-Tagging + Settings Cross-Surface-Sync | Tag-Konzept + Sync-Mode |
| FEAT-23-05 | update_memory V1-Deprecation + Migrations-Helper | Legacy-Cut-over |

### P1 (Wiedervorlage nach 2 Wochen Live-Use)

| ID | Title | Trigger fuer Aktivierung |
|----|-------|--------------------------|
| FEAT-23-06 | Profil-System (4 Memory-Profiles) | Live-Use zeigt, dass Source-Tag-Filter nicht reicht |

## Out-of-Scope (Epic)

- Continue-Conversation-from-external (UCM-Thema)
- UCM-Native Persistence Layer
- Voice-Capture-Pipeline
- GUI/Dashboard fuer Standalone-Worker

## Critical Hypotheses (Leading Indicators)

- H1: Vault Operator Remote MCP ist stabil genug fuer taegliche Cross-Surface-
  Use. (Bestaetigt seit FEATURE-1403, 2026-04-01.)
- H2: Vier P0-Tools decken 80% der Cross-Surface-Use-Cases ab.
  (Validierung in Phase 4 UAT.)
- H3: Source-Interface-Tagging reicht in P0 ohne Profil-System.
  (Wiedervorlage nach 2 Wochen.)
- H4: Read-only Sicht auf externe Conversations ist ausreichend.
  (UAT.)

## Definition of Done (Epic)

- Alle P0-Features auf Done.
- AK-01 bis AK-08 aus BA-26 erfuellt.
- Mindestens eine Cross-Tool-Round-Trip-UAT (ChatGPT save -> Claude
  recall) erfolgreich.
- Telemetrie fuer V1-Legacy-`update_memory`-Aufrufe aktiviert.
- Wiedervorlage FEAT-23-06 als Backlog-Row mit klarem Trigger.
