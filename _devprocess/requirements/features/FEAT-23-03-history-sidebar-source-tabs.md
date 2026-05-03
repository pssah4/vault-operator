---
id: FEAT-23-03
title: History-Sidebar Source-Tabs + Read-Only-View
epic: EPIC-23
status: Active
priority: P0
date: 2026-05-03
related-bas: BA-26
adr-refs: []
plan-refs: []
depends-on: [FEAT-23-04]
---

# FEAT-23-03: History-Sidebar Source-Tabs + Read-Only-View

## Description

Die Obsilo-Sidebar History-Panel bekommt am oberen Rand Tabs zum
Filtern nach Source-Interface. Externe Conversations oeffnen in
einer Read-Only-Variante der Chat-View mit Source-Banner.

## Benefits Hypothesis

Wenn externe Conversations sichtbar in einer dedizierten
History-Sicht erscheinen, dann erlebt Sebastian Obsilo als
einheitlichen Memory- und History-Hub statt als ein weiteres
isoliertes Tool.

## User Stories

**US-01** -- Discoverability:
- **As** Sebastian
- **I want to** zwischen Tabs wechseln (All / Obsilo / ChatGPT /
  Claude.ai / Claude Code / Perplexity),
- **so that** ich gezielt Conversations einer bestimmten Source
  finde.

**US-02** -- Awareness:
- **As** Sebastian
- **I want to** sofort sehen, dass eine Conversation aus einem
  externen Tool kommt (Banner / Tag-Pill),
- **so that** ich den Kontext richtig einordne.

**US-03** -- Read-Only-Sicherheit:
- **As** Sebastian
- **I want to** in einer importierten ChatGPT-Conversation nicht
  versehentlich weiter-chatten (Banner: "Imported from ChatGPT --
  read only"),
- **so that** ich nicht in Verwirrung gerate, welcher Conversation-
  State gerade aktiv ist.

## Success Criteria

| ID | Criterion | Measurement | Method |
|----|-----------|-------------|--------|
| SC-01 | Tabs erscheinen am oberen Rand der History-Sidebar | UI-Sicht | Manuell |
| SC-02 | Tab erscheint nur wenn min. eine Conversation der Source existiert | UI-Sicht | Manuell |
| SC-03 | Klick auf Tab filtert die Liste, keine Vermischung der Provider | UI-Test | Test |
| SC-04 | Klick auf externe Conversation oeffnet Read-Only-Chat-View mit Source-Banner | UI-Sicht | Manuell |
| SC-05 | Source-Pill am Listeneintrag zeigt das Tool kompakt | UI-Sicht | Manuell |
| SC-06 | Pending-Marker (Manual-Sync) am Listeneintrag, plus Confirm-Button | UI-Sicht | Manuell |
| SC-07 | Thread-Pill (FIX-23-01-01) am Listeneintrag bei Conversations mit `crossInterfaceThreadId`. Klick filtert auf alle Thread-Mitglieder ueber source-Tabs hinweg. | UI-Sicht | Manuell |

## Technical NFRs

- **Performance**: Tab-Wechsel rendert < 100ms bei 500
  Conversations (HistoryDB-Query mit WHERE-Filter).
- **Backwards-Compatibility**: bestehende Conversations ohne
  source_interface gelten als 'obsilo' (Default-Mapping in der
  Migration aus FEAT-23-04).

## ASRs

- **ASR-1 (Moderate)**: ConversationStore erhaelt Filter-API
  `list({sourceInterface?})`.
- **ASR-2 (Moderate)**: Read-Only-Variante der AgentSidebarView
  ohne neue Komponente -- Wiederverwendung mit `readOnly`-Flag.

## Definition of Done

- [ ] Tabs gerendert mit dynamischer Sichtbarkeit
- [ ] Filter-API in ConversationStore
- [ ] Read-Only-Banner in Chat-View
- [ ] Source-Pill am Listeneintrag
- [ ] Tests gruen

## Out of Scope

- Continue-Pfad fuer externe Conversations
- Bulk-Delete pro Source-Tab (FEAT-03-22 Folge-IMP)
