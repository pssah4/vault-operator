---
id: EPIC-33
title: Inline-Editor-AI-Actions
date: 2026-06-22
related-bas: BA-EPIC-33-inline-editor-ai-actions
---

# EPIC-33: Inline-Editor-AI-Actions

> **Status:** Skeleton-Epic. Volle FEAT-Specs in `/requirements-engineering` aus der BA promoviert.
> **Source-of-Truth (Why/Who/Scope):** [BA-EPIC-33-inline-editor-ai-actions.md](../../analysis/BA-EPIC-33-inline-editor-ai-actions.md)

## How-Might-We

How might we Vault Operator-User den Wechsel vom Schreibmodus in den Chat-Modus eliminieren lassen, sodass markierter Text in einer Note der Trigger fuer die naechstpassende AI-Aktion wird, despite der bestehenden Trennung zwischen Editor-Surface und Chat-Sidebar samt deren getrennten Konfigurationen?

## Hypothesis Statement

Vault Operator-User (Power-User-Wissensarbeiter) markieren regelmaessig Text in Notes und muessen heute den Editor verlassen, den Chat-Sidebar oeffnen, Selection mit Kontext zusammenbauen und das Ergebnis zurueck in die Note kopieren. Jeder Context-Switch bricht den Schreib- oder Leseflow.

EPIC-33 macht markierten Text zur direkten Eingangstuer fuer vier kuratierte AI-Aktionen (Lookup, Rewrite via Direct-Replace+Undo, Inline-Chat, Send-to-Main-Chat). Jede Aktion uebernimmt die im Main-Chat aktiven Settings (Modell, Skills, Prompts, Provider), ohne dass User parallel pflegen oder neu auswaehlen muessen.

Im Unterschied zu generischen AI-Plugins mit getrennten Inline-Settings und im Unterschied zum heutigen Vault Operator-Setup (Chat-Sidebar als einzige AI-Surface) wird der Editor zur zweiten gleichwertigen Surface mit geteilter Settings-Schicht.

## Business Outcomes (messbar)

Konkrete KPIs siehe BA Section 6.3. Hauptziele:

1. **Inline-Adoption:** mindestens 40% weekly-active-user mit mindestens 1 Inline-Action pro Woche, gemessen 90 Tage post-release.
2. **Friction-Reduktion:** Median Time-to-AI-Response von Selection bis erstes Output-Token sinkt von ~8-12s (Sidebar-Pfad) auf <=3s.
3. **Action-Mix-Balance:** keine einzelne Action faellt unter 5% oder ueber 70% des Mix (Indikator dass alle vier Actions echten Bedarf treffen).

## Feature-Skizze

| Feature ID | Name | Priority | Skizze |
|---|---|---|---|
| FEAT-33-01 | Trigger-Layer (Floating-Menu + Hotkey + Command-Palette) | P0 | Default Floating-Menu auf Selection-Event mit debounced Render. Settings-Toggle auf Hotkey-Alternative. Command-Palette-Konsistenz. Selection-Inhalt + Editor-Mode (Source/Live-Preview/Reading) in einem Trigger-Context-Objekt. |
| FEAT-33-02 | Lookup-Action | P0 | Markierte Begriffe nachschlagen, Output als Tooltip oder Side-Panel. Wenn Knowledge-Layer (EPIC-15/19) verfuegbar, Vault-Inhalte als Quelle nutzen, sonst LLM-Knowledge. |
| FEAT-33-03 | Rewrite-Action | P0 | Markierter Absatz wird vom Agenten ueberarbeitet, Output ersetzt Selection direkt im Editor (Cursor-Pattern). Undo-Stack als Rollback. Optional Checkpoint-Snapshot vor Rewrite. |
| FEAT-33-04 | Send-to-Main-Chat-Action | P0 | Sidebar oeffnet sich, Selection landet als Vor-Kontext im neuen Chat-Input. User kann seine Frage ergaenzen und absenden. |
| FEAT-33-05 | Inline-Chat-Action | P1 | Conversation-Block ueber oder unter Selection direkt im Note. Multi-Turn-UX. Storage-Strategie (ephemer vs persistiert) ist Architektur-Entscheidung. |

## Architektur-Anker

- **Settings-Reuse:** alle vier Actions konsumieren Snapshot des aktiven Main-Chat-Provider-Setups (Modell, Skills, Prompts, Tools) zum Trigger-Zeitpunkt. Kein eigener Inline-Settings-Tree.
- **Trigger-Layer:** geteilt zwischen allen vier Actions. Architektur sollte `triggerContext` als gemeinsamen Eingang modellieren (Selection-Text, Editor-Mode, Cursor-Position, Note-Path).
- **Output-Modi:** jede Action hat eigenen Output-Pfad (Tooltip, Direct-Replace, Conversation-Block, Sidebar-Open-with-Context). Output-Renderer pro Action.

## Cross-EPIC-Beruehrungspunkte

- **EPIC-09 / EPIC-10 (Cost-Tracking, Office-Pipeline):** Inline-Action-Aufrufe muessen ins existierende Cost-Tracking eingehaengt werden, damit Action-Mix-Telemetry funktioniert.
- **EPIC-15 / EPIC-19 (Knowledge-Layer, Maintenance):** Lookup-Action nutzt Knowledge-Layer wenn verfuegbar; sonst LLM-Fallback.
- **EPIC-16 (Backend-Optimierungs-Patterns):** unabhaengig, keine Ueberschneidung.
- **EPIC-23 (Cross-Surface AI Workflow):** semantisch verwandt (mehrere Surfaces), aber EPIC-23 ist externe Tools via MCP, EPIC-33 ist Editor innerhalb Obsidian. Kein Code-Overlap.
- **EPIC-27 (Mobile Welle 1):** Trigger-Layer muss Tap-and-hold-Menu auf Mobile abdecken. Coordination via Architektur-Spike.
- **EPIC-30 (Workflow-Builder):** zukuenftig koennten Inline-Actions Workflows triggern, aber kein Hard-Dependency.

## Explicit Out-of-Scope (siehe BA Section 8.2)

- Eigene Inline-Settings (Modell, Skills) - explizit verworfen
- Diff-Preview als Default fuer Rewrite - verworfen
- Translate / Summarize / Explain als separate Actions - kann nach H-04-Validierung nachgezogen werden
- Inline-Actions auf Canvas-Selection oder Base-Cell-Selection - eigene EPIC
- Workflow-Trigger aus Inline-Action - separater Hebel via EPIC-30
- Mobile-spezifische Optimierungen jenseits Tap-and-hold-Menu

## Critical Hypotheses (siehe BA Section 7.3)

5 Hypothesen H-01..H-05. Hauptachsen:

- H-01: Floating-Menu stoert nicht (Problem-Solution Fit)
- H-02: Direct-Replace + Undo akzeptabel (Problem-Solution Fit)
- H-03: Settings-Reuse richtige Granularitaet (Problem-Solution Fit)
- H-04: 4 Actions decken Hauptbedarf (Market)
- H-05: CodeMirror-/Obsidian-API tragen alle 4 Output-Modi (Tech Feasibility)

## Naechster Schritt

`/requirements-engineering` schreibt die vollstaendigen FEAT-Specs (FEAT-33-01..05) mit Akzeptanzkriterien und ASRs aus der BA + diesem Skeleton.
