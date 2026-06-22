---
id: EPIC-33
title: Inline-Editor-AI-Actions
date: 2026-06-22
related-bas: BA-EPIC-33-inline-editor-ai-actions
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
related-research: ../../analysis/RESEARCH-EPIC-33-inline-ai-competitors-2026-06-22.md
---

# EPIC-33: Inline-Editor-AI-Actions

> **Source-of-Truth (Why/Who/Scope):** [BA-EPIC-33-inline-editor-ai-actions.md](../../analysis/BA-EPIC-33-inline-editor-ai-actions.md)
> **Marktrecherche:** [RESEARCH-EPIC-33-inline-ai-competitors-2026-06-22.md](../../analysis/RESEARCH-EPIC-33-inline-ai-competitors-2026-06-22.md) (8 Tools, Multi-Agent verifiziert)
> **Backlog row:** `_devprocess/context/BACKLOG.md` -> EPIC-33 (Status, Phase, Claim, Last-change live dort)

## How-Might-We

How might we Vault Operator-User den Wechsel vom Schreibmodus in den Chat-Modus eliminieren lassen, sodass markierter Text in einer Note der Trigger für die nächstpassende AI-Aktion wird, ohne dass die getrennten Konfigurationen von Editor-Surface und Chat-Sidebar dem im Weg stehen, und ohne dass eine geschlossene Chat-Sidebar die Inline-Aktion blockiert?

## Epic Hypothesis Statement

Vault Operator-User markieren regelmäßig Text in Notes (Begriffe, Absätze, Quellen-Highlights) und müssen heute den Editor verlassen, den Chat-Sidebar öffnen, Selection mit Kontext zusammenbauen und das Ergebnis zurück in die Note kopieren. Jeder dieser Context-Switches bricht den Schreib- oder Lese-Fluss und kostet Klicks ohne Mehrwert. Bei geschlossener Chat-Sidebar kommt ein zusätzlicher Layout-Sprung dazu.

EPIC-33 macht markierten Text zur direkten Eingangstür für elf kuratierte AI-Aktionen: Lookup mit Vault-Knowledge-Integration, Rewrite mit Inline-Diff und Per-Hunk Accept/Reject, persistenter Inline-Chat-Conversation-Block, Send-to-Main-Chat, Translate, Summarize, User-Skills im Floating-Menu, optional Per-Action-Model-Pin, Find-Action-Items. Jede Aktion übernimmt die im Main-Chat aktiven Settings per Snapshot (Modell, Skills, Prompts, Provider). Alle Aktionen funktionieren unabhängig davon ob die Chat-Sidebar offen oder geschlossen ist. Send-to-Main-Chat öffnet die Sidebar bei Bedarf automatisch.

Im Unterschied zu generischen AI-Plugins mit getrennten Inline-Settings und im Unterschied zum heutigen Vault Operator-Setup (Chat-Sidebar als einzige AI-Surface) wird der Editor zur zweiten gleichwertigen Surface mit geteilter Settings-Schicht. Im Unterschied zu Wettbewerbern wie Notion AI (LLM-only-Erklärung), Cursor (kein Vault-Knowledge), Obsidian Copilot (per-Command-Modell als Pflicht statt Option) verheiratet Vault Operator zwei Differenzierungs-Anker: Vault-Knowledge-Layer-Integration im Lookup und Skills-System als Inline-Action-Quelle. Beides läuft auf existierender Backend-Tiefe (Semantic-Index mit 10.783 Vektoren, voll ausgeprägtes Skills-System mit Mastery + Capabilities, TaskRouter mit Tier-Klassifizierung), nicht als Greenfield-Implementierung.

## Business Outcomes (messbar)

Vollständige KPI-Tabelle in BA Section 6.3. Hauptziele:

1. **Inline-Adoption (Lernziel)**: Anteil aktiver User mit mindestens einer Inline-Action pro Woche, gemessen 90 Tage post-release. Empirisch erheben, da kein Markt-Benchmark öffentlich verfügbar
2. **Friction-Reduktion (Tech-Akzeptanz)**: Median Time-to-AI-Response von Selection bis erstes Output-Token sinkt von ~8-12s (Sidebar-Pfad inkl. Switching) auf <=3s. Erreichbar durch Streaming plus Cost-aware-Tier-Routing
3. **Action-Mix-Balance (Lernziel)**: keine einzelne Action unter 3% des Mix (Indikator dass Action-Wahl trifft), kein Mix über 70% (Indikator dass andere Actions überflüssig wirken)
4. **Diff-Accept-Rate für Rewrite (Lernziel)**: Anteil akzeptierter Rewrite-Outputs über alle Rewrites mindestens 60%. Disaccept-Rate >50% triggert Modell-Tier-Review
5. **Sidebar-Independence-Coverage (Tech-Akzeptanz)**: 100% der Actions außer Send-to-Main-Chat laufen mit geschlossener Sidebar fehlerfrei

## Leading Indicators

Abgeleitet aus den Critical Hypotheses der BA Section 7.3. Validierungspfade:

- **Floating-Menu-Opt-Out-Rate (H-01)**: Anteil User die auf Hotkey-only umschalten. Indikator wie stark Floating stört
- **Inline-Diff-Render-Latenz (H-02)**: Wallclock zwischen Token-Arrival und Render. Indikator für Tech-Feasibility des CodeMirror-6-Diff-Renderers
- **Per-Action-Model-Pin-Nutzung (H-03)**: Anteil User die mindestens eine Action gepinnt haben. Zielband 10-30% (zu wenig = Foldback unnötig, zu viel = Default-Settings-Reuse passt nicht)
- **TOP-5-Watchlist-Issue-Density (H-04)**: Anzahl Issues pro Watchlist-Action (Continue-Writing, Fix-Grammar-as-Preset, Make-Shorter/Longer-Buttons, Change-Tone, Reading-Level). Priorisierung statt blinder Schwellwert
- **Sidebar-Independence-Bug-Rate (H-06)**: Bugs mit "Sidebar must be open"-Symptom. Erwartung 0 in Beta
- **Vault-RAG-Akzeptanz-Differenz (H-07)**: A/B-Test Insert-into-Note-Rate Vault-RAG vs LLM-only-Lookup. Zielband >=20%-Vorteil für Vault-RAG

## Critical Hypotheses (from BA)

Vollständig in BA Section 7.3. Übersicht:

| BA Ref | Hypothesis | Validated by FEATURE | Status |
|---|---|---|---|
| H-01 | Floating-Menu stört nicht normal-Markieren | FEAT-33-01 | Open |
| H-02 | CodeMirror-6 Inline-Diff Tech-Feasible | FEAT-33-03 | Open (Spike erforderlich) |
| H-03 | Settings-Reuse Default + optional Pin | FEAT-33-10 | Open |
| H-04 | 11 Actions decken Hauptbedarf | FEAT-33-01..11 zusammen | Open |
| H-05 | CodeMirror/Obsidian-API tragen alle Output-Modi | FEAT-33-02..05 | Open (Spike erforderlich) |
| H-06 | Sidebar-Independence: alle Actions ohne offene Sidebar | alle FEATs (Cross-Constraint in DoD) | Open (Spike + Beta-Verifikation) |
| H-07 | Vault-Knowledge-RAG schlägt LLM-only-Lookup | FEAT-33-09 | Open (A/B-Test in Beta) |

## MVP Features (11 FEATs in drei Wellen)

| Feature ID | Name | Priority | Effort | Welle |
|---|---|---|---|---|
| FEAT-33-01 | Trigger-Layer (Floating-Menu + Hotkey + Command-Palette + Settings-Surface) | P0 | M | 1 |
| FEAT-33-02 | Lookup-Action (Preview-Block) | P0 | M | 1 |
| FEAT-33-03 | Rewrite-Action (Inline-Diff mit Per-Hunk Accept/Reject) | P0 | L | 1 |
| FEAT-33-04 | Send-to-Main-Chat-Action (öffnet Sidebar bei Bedarf) | P0 | S | 1 |
| FEAT-33-08 | Skills-im-Floating-Menu | P0 | M | 1 |
| FEAT-33-09 | Vault-Knowledge-Integration im Lookup (RAG) | P0 | M | 1 |
| FEAT-33-05 | Inline-Chat-Action (persistenter Conversation-Block) | P1 | L | 2 |
| FEAT-33-06 | Translate-Action | P1 | S | 2 |
| FEAT-33-07 | Summarize-Action | P1 | S | 2 |
| FEAT-33-10 | Optional Per-Action-Model-Pin | P2 | S | 3 |
| FEAT-33-11 | Find-Action-Items-Action | P2 | S | 3 |

**Priority:** P0 = MVP-Release-Blocker (Welle 1 = 6 P0-FEATs liefern voll funktionsfähige Inline-Surface mit Differenzierungs-Ankern). P1 = High-Priority Folgewelle (Inline-Chat-Innovation + Tool-Parity-Completion). P2 = nach Beta-Lernen.

**Effort:** S (1-2 Wochen), M (3-5 Wochen), L (6+ Wochen)

**Wellen-Begründung:**

- **Welle 1 (P0, 6 FEATs):** Liefert vollständige MVP-Surface mit Sidebar-Independence und beiden Differenzierungs-Ankern (Skills + Vault-Knowledge). Trigger-Layer (FEAT-33-01) ist Substrat aller anderen Actions, muss zuerst stehen. Rewrite (FEAT-33-03) hat höchsten Effort wegen CodeMirror-6-Diff-Renderer-Spike. Vault-Knowledge (FEAT-33-09) ist als eigenes FEAT herausgelöst weil RAG-Pipeline-Akzeptanzkriterien separat von Lookup-UX (FEAT-33-02) sind
- **Welle 2 (P1, 3 FEATs):** Inline-Chat (FEAT-33-05) als Innovation mit Conversation-Block-Storage-Spike, Translate (FEAT-33-06) und Summarize (FEAT-33-07) als Tool-Parity-Completion
- **Welle 3 (P2, 2 FEATs):** Per-Action-Model-Pin (FEAT-33-10) und Find-Action-Items (FEAT-33-11) nach Beta-Lernen. FEAT-33-11 ist möglicherweise via FEAT-33-08-Skills realisierbar, dann wird das FEAT geschlossen

## Cross-FEAT-Constraints (Architektur-Anker)

Diese Constraints gelten für alle 11 FEATs:

1. **Sidebar-Independence (kritisch):** Jedes FEAT in seiner Definition of Done belegt dass die Action mit geschlossener Chat-Sidebar funktioniert. Send-to-Main-Chat (FEAT-33-04) ist die einzige Ausnahme und öffnet die Sidebar als Teil seiner Funktion. ASR mit eigener ADR-Pflicht
2. **Settings-Snapshot zum Trigger-Zeitpunkt:** Modell, Skills, Prompts, Provider werden zum Action-Trigger aus dem aktiven Main-Chat-State gelesen, nicht beim Plugin-Load. Optional Per-Action-Pin (FEAT-33-10) überschreibt
3. **Sidebar-unabhängige Output-Renderpfade:** Inline-Diff (FEAT-33-03), Preview-Block (FEAT-33-02/07), Tooltip mit Vault-Quellen (FEAT-33-09), Conversation-Block (FEAT-33-05) rendern alle im Editor (CodeMirror-Decorations + Inline-Widgets), nicht im Sidebar
4. **Cost-aware Tier-Routing per Action:** TaskRouter Phase D wählt pro Action-Kategorie einen Tier (Lookup/Translate/Summarize → Haiku, Rewrite/Chat → Default-Tier)
5. **Bot-Compliance:** alle FEATs folgen den Obsidian Community Plugin Review-Bot Rules

## Architecturally Significant Requirements (ASRs)

Vollständig in den FEAT-Specs (asr-refs in Frontmatter). Übersicht:

- **ASR-EPIC-33-01 (CRITICAL):** Sidebar-Independence. AgentTask-Layer muss ohne Sidebar-View instanziierbar sein. Wenn aktueller Code an Sidebar gekoppelt ist, Refactoring-Inventory in Spike
- **ASR-EPIC-33-02 (CRITICAL):** CodeMirror-6 Diff-Renderer mit Per-Hunk Accept/Reject. Eigenbau vs. Library (InlineAI-Plugin als Vorbild), Latenz-Budget, Editor-State-Korruption-Schutz
- **ASR-EPIC-33-03 (CRITICAL):** Inline-Chat-Conversation-Block-Speicherung. Ephemer in Memory, persistiert in Note-Frontmatter, eigenes `.inline-chats.md` mit Note-Anker, Sub-Conversation in History-Pipeline - Architektur-Entscheidung mit Folgekosten für Search, Recall, Linking
- **ASR-EPIC-33-04 (MODERATE):** Vault-Knowledge-RAG-Pipeline für Lookup. Semantic-Search → Confidence-Threshold → LLM-Augmentation. Fallback wenn keine relevanten Treffer
- **ASR-EPIC-33-05 (MODERATE):** Skill-Capability-Filter "inline-action-eligible". Welche Skills tauchen im Floating-Menu auf, wie wird Skill-Input (Selection) übergeben
- **ASR-EPIC-33-06 (MODERATE):** Settings-Snapshot-Lifecycle. Pro Trigger oder gecached bis Settings-Änderung

## Explicit Out-of-Scope

Vollständig in BA Section 8.2. Zusammengefasst:

- Diff-Preview OFF (Direct-Replace) - explizit verworfen nach Markt-Recherche
- Eigene Inline-Settings-Surface - verworfen via H-03, nur optional Pin
- Continue-Writing auf leerer Zeile - Selection-driven Scope, eigene EPIC-Kandidat (Notion Space-Pattern, Cursor Tab)
- Reading-Level-Slider, Suggest-Edits-Comment-Bubbles, Code-Review-Action - im Vault-Kontext Nische
- Inline-Actions auf Canvas-Selection oder Base-Cell-Selection - eigene EPIC
- Workflow-Trigger aus Inline-Action - separater Hebel via EPIC-30 (Workflow-Builder)
- Mobile-spezifische Optimierungen jenseits Tap-and-hold-Menu - mit Welle-1-Mobile (FEAT-27-01) abstimmen

## Dependencies und Risks

### Dependencies

- **Knowledge-Layer (EPIC-15/19, FEAT-15-XX SemanticIndex)**: Pflicht für FEAT-33-09 (Vault-RAG im Lookup). Existiert und funktioniert (10.783 Vektoren in Sebastian's Vault). Kein Block
- **Skills-System (EPIC-22 Skill-Package-Ecosystem, FEAT-22-XX)**: Pflicht für FEAT-33-08 (Skills-im-Floating-Menu). Benötigt "inline-action-eligible"-Capability als neuen Skill-Metadata-Eintrag (kleines Schema-Update)
- **TaskRouter (EPIC-24, FEAT-24-XX TaskRouter)**: Pflicht für Cost-aware-Tier-Routing-Constraint. Existiert
- **Memory + History-Pipeline (EPIC-03 Memory v2 + EPIC-07 Chat-Linking)**: Pflicht für FEAT-33-05 (Conversation-Block-Indexing). Existiert
- **EPIC-27 (Mobile Welle 1)**: läuft parallel. Mobile-Tap-and-hold-Menu in FEAT-33-01 muss mit FEAT-27-01 Capability-Filter koordiniert werden

### Risks

Vollständig in BA Section 9. Hauptrisiken:

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Sidebar-Independence-Refactoring größer als erwartet | M | H | Architektur-Spike Welle 1: inventarisiere AI-Aufruf-Pfade und View-Abhängigkeiten. Wenn Refactor >2 Wochen, eigene Pre-Welle aufmachen |
| CodeMirror-6 Diff-Renderer Tech-Feasibility | M | H | Spike + InlineAI-Plugin als Vorbild + FIX-01-07-03-Pattern als Editor-State-Mutation-Referenz. Fallback Modal-Preview wenn Inline nicht trägt |
| Vault-Knowledge-RAG liefert irrelevante Treffer | M | M | H-07 A/B-Test, Confidence-Threshold, Fallback auf LLM-only |
| Skills-im-Menu überflutet | M | M | "inline-action-eligible"-Capability-Flag, Settings-Toggle pro Skill, TOP-N-Cap |
| Floating-Menu-Kollision mit Obsidian-Format-Toolbar | M | M | Render-Position koordinieren, Hotkey-Fallback |
| Inline-Chat-Conversation-Block bläht Note auf | M | M | Begrenzung, Auto-Collapse, oder Sub-File-Speicherung |

## Technical Debt (MVP-bewusst)

Keine. Inline-Actions sind Surface-Wiring auf existierender Backend-Tiefe. Wenn der Sidebar-Independence-Refactor mehr Aufwand wird als geschätzt, kann das als technische Schuld in eine Pre-Welle ausgegliedert werden, aber das ist nicht MVP-Cut-Korruption sondern Welle-Stretching.

## Cross-EPIC-Berührungspunkte

- **EPIC-09 / EPIC-10 (Cost-Tracking, Office-Pipeline):** Inline-Action-Aufrufe müssen ins existierende Cost-Tracking eingehängt werden
- **EPIC-15 / EPIC-19 (Knowledge-Layer, Maintenance):** FEAT-33-09 nutzt Knowledge-Layer aktiv
- **EPIC-16 (Backend-Optimierungs-Patterns):** unabhängig, keine Überschneidung
- **EPIC-22 (Skill-Package-Ecosystem):** FEAT-33-08 erweitert Skill-Metadata um "inline-action-eligible"-Capability
- **EPIC-23 (Cross-Surface AI Workflow):** semantisch verwandt (mehrere Surfaces), aber EPIC-23 ist externe Tools via MCP, EPIC-33 ist Editor innerhalb Obsidian. Kein Code-Overlap
- **EPIC-27 (Mobile Welle 1):** Trigger-Layer (FEAT-33-01) muss Tap-and-hold-Menu auf Mobile abdecken
- **EPIC-30 (Workflow-Builder):** zukünftig könnten Inline-Actions Workflows triggern, aber kein Hard-Dependency

## Nächster Schritt

`/architecture` schreibt ADRs für die 6 ASRs (Sidebar-Independence, CodeMirror-Diff-Renderer, Conversation-Block-Storage, Vault-RAG-Pipeline, Skill-Capability-Filter, Settings-Snapshot-Lifecycle), arc42-Update Sections 5/9, plan-context.md mit Wellen-Schnitt und Spike-Plan.

Parallel: `/coding` Spike für H-02 (CodeMirror-6 Diff-Renderer) und H-06 (Sidebar-Independence-Inventory).
