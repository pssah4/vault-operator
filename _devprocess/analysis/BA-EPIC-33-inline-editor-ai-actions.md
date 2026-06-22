---
type: ba
target-type: epic
target-id: EPIC-33
project-ba-ref: null
personas: [P1]
value-dimensions: []
project-kpi-ref: []
scope: mvp
created: 2026-06-22
---

# Business Analysis: Inline-Editor-AI-Actions

> Status, Phase, Last-Change, Claim leben in der BACKLOG-Zeile, nicht hier.
> `project-ba-ref: null` weil keine kanonische Project-BA existiert (Legacy-Per-Epic-BA-01..10). Personas und KPIs werden hier lokal definiert.

---

## 1. Executive Summary

### 1.1 Problem Statement

Vault Operator-User markieren regelmässig Text in einer Note (Begriffe, Absätze, Zitate) und müssten heute den Editor verlassen, den Chat-Sidebar öffnen, die Selection mit Kontext zusammenbauen und das Ergebnis zurück in die Note kopieren. Jeder dieser Context-Switches bricht den Schreib- oder Lese-Fluss und kostet Klicks ohne Mehrwert.

### 1.2 How-Might-We Question

**How might we** Vault Operator-User **den Wechsel vom Schreibmodus in den Chat-Modus eliminieren lassen, sodass markierter Text in einer Note der Trigger für die nächstpassende AI-Aktion wird**, **despite** der bestehenden Trennung zwischen Editor-Surface und Chat-Sidebar samt deren getrennten Konfigurationen?

### 1.3 Value Proposition

Markierter Text wird zur direkten Eingangstür für vier kuratierte AI-Aktionen (Lookup, Rewrite, Inline-Chat, Send-to-Main-Chat). Jede Aktion verwendet die im Main-Chat aktiven Settings (Modell, Skills, Prompts, Provider), ohne dass User parallel pflegen oder neu auswählen müssen. Das macht den Editor zur zweiten gleichwertigen AI-Surface neben dem Sidebar.

### 1.4 High-Level Concept

"Cursor-Inline-Edit für Obsidian": markieren, Floating-Menu erscheint, eine Aktion klicken oder Hotkey drücken, Ergebnis landet inline oder im richtigen Ziel. Settings werden geerbt, nicht dupliziert.

### 1.5 Expected Outcomes

- Schreib- und Lese-Workflows in Notes erhalten direkten AI-Zugriff, ohne Sidebar-Wechsel
- Vier häufige Use-Cases (Verständnis, Überarbeitung, Diskussion, Übergabe) werden mit einem einheitlichen Trigger abgedeckt
- Editor und Chat teilen eine Settings-Quelle, nicht zwei

---

## 2. Business Context

### 2.1 Background

Vault Operator hat heute eine starke Chat-Sidebar mit voller Tool/Skill/Provider-Konfiguration und einen klassischen Obsidian-Editor ohne native AI-Hooks. Cursor, Continue, Notion AI und Anthropic-Projects haben das Inline-Edit-Muster etabliert und es wird zunehmend als Standard erwartet. Vault Operator hat dieses Muster bisher nicht, obwohl die Backend-Infrastruktur (Modell-Router, Skill-System, Memory) vollständig vorhanden ist.

### 2.2 Current State (As-Is)

User-Pfad heute, wenn sie zu markiertem Text eine AI-Aktion wollen:

1. Selection im Editor
2. Sidebar öffnen (Hotkey oder Ribbon-Click)
3. Selection per Drag-and-Drop oder @-Mention in den Chat ziehen
4. Aktion in den Prompt schreiben (kein vordefiniertes Verb)
5. Antwort lesen, ggf. Block für Block zurück in die Note kopieren

Mindestens 4 Context-Switches pro Inline-Bedürfnis. Bei Rewrite zusätzlich manuelles Diff im Kopf, weil Original-Selection aus dem Sichtfeld ist.

### 2.3 Desired State (To-Be)

1. Selection im Editor
2. Floating-Menu erscheint automatisch über der Selection (Default) ODER User drückt seinen konfigurierten Hotkey
3. Action wählen (Lookup, Rewrite, Inline-Chat, Send-to-Main-Chat)
4. Ergebnis landet im action-typischen Ziel: Tooltip/Side-Panel (Lookup), Direct-Replace (Rewrite), Inline-Conversation-Block (Inline-Chat), Sidebar mit Selection als Vor-Kontext (Send-to-Main-Chat)

Settings (Modell, Skills, Prompts, Provider) werden aus der aktiven Main-Chat-Konfiguration übernommen.

### 2.4 Gap Analysis

- Kein Floating-Menu auf Selection im Editor (Obsidian liefert nur Format-Toolbar)
- Keine vordefinierten AI-Verben für Selection-Aktionen
- Kein Settings-Sharing zwischen Editor und Chat (Chat hat alles, Editor nichts)
- Keine action-spezifischen Output-Modi (Inline-Replace, Tooltip, Conversation-Block existieren nicht)

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Needs |
|---|---|---|---|---|
| Vault Operator-User (Power-User-Wissensarbeiter) | Primärer Konsument | H | H | Schnellere Inline-AI-Aktionen ohne Sidebar-Wechsel |
| Sebastian (Maintainer) | Owner + Dogfooder | H | H | Konsistenz mit bestehender Architektur (Modell-Router, Skills) |
| Community (BRAT-Beta + Public) | Sekundärer Konsument | M | M | GA-Feature, das ohne Hand-Holding entdeckbar ist |

### 3.2 Key Stakeholders

**Primary:** Vault Operator-User (Power-User-Wissensarbeiter). Sebastian entscheidet als Maintainer über Default-UX und Settings-Surface.
**Secondary:** Community via Issues und Discord-Feedback nach Public-Release.

---

## 4. User Analysis

### 4.1 User Personas

**P1: Vault Operator-User (Power-User-Wissensarbeiter)**

- **Role:** Knowledge Worker, Researcher, Note-Taker (Akademiker, Consultants, technische Autoren, Selbständige im Wissensmarkt)
- **Goals:** Schnell zwischen Lesen, Schreiben und AI-Anfragen wechseln, ohne den Flow zu brechen. Selection als Kontext für jede Aktion nutzen können
- **Pain Points:** Sidebar öffnen-Drag-and-Drop-Antwort-zurück-Kopieren ist mindestens 4 Context-Switches. Bei kurzen Lookups steht der Aufwand in keinem Verhältnis zum Nutzen
- **Usage Frequency:** Daily
- **Typical Quote:** "Ich will diesen Absatz schneller umformulieren lassen und nicht erst meinen halben Chat-Kontext aufbauen."
- **Usage Context:** Beim Verfassen längerer Notes, beim Durchgehen von Quellen-Highlights, beim Refining bestehender Inhalte

GA-Annahme: alle User-Segmente von Vault Operator (Casual bis Power-User) sind potenzielle Nutzer, weil das Pattern aus anderen Tools bekannt ist und der Settings-Reuse die Konfigurations-Hürde eliminiert. Persona-Split wird bewusst nicht vorgenommen, weil die 4 Actions die Differenzierung übernehmen.

### 4.2 Needs

| Need ID | Need | Type | Priority | Persona |
|---|---|---|---|---|
| N-01 | Begriff im markierten Text erklärt bekommen, ohne Editor zu verlassen | Functional | H | P1 |
| N-02 | Markierten Absatz vom Agenten überarbeiten lassen, Original im Blick | Functional | H | P1 |
| N-03 | Über markierten Inhalt eine Konversation führen, ohne Sidebar-Switch | Functional | M | P1 |
| N-04 | Markierte Selection als Vor-Kontext in den Main-Chat senden | Functional | M | P1 |
| N-05 | Vertrauen, dass Inline-Aktion dieselben Settings nutzt wie der Main-Chat | Emotional | H | P1 |
| N-06 | Inline-Aktion nicht stört, wenn ich nur kopieren will (Selection-Marker-Konflikt) | Emotional | M | P1 |

### 4.3 Insights

**Functional:** User behelfen sich heute mit Sidebar + @-Mention + Copy-Paste. Workaround funktioniert, aber kostet 4+ Context-Switches pro Aktion.
**Emotional:** Frust entsteht weniger durch die Antwort-Qualität als durch die Vorbereitung des Aufrufs. "Cursor kann das doch auch" wird im Plugin-Community-Diskurs sichtbar.
**Social:** Inline-Edit ist 2026 ein Standard-Pattern in AI-Writing-Tools (Cursor, Continue, Notion AI, Anthropic-Projects). Tool-Parity reduziert Wechsel-Reibung von User die aus anderen Tools kommen.
**Analogien:** "Markdown-Note ist meine IDE für Wissen, Inline-Edit ist meine Quick-Action wie Cmd+K in Cursor."

### 4.4 User Journey (High-Level)

1. User markiert Text während Schreib- oder Leseflow
2. Floating-Menu erscheint (oder User drückt Hotkey)
3. User klickt Lookup / Rewrite / Inline-Chat / Send-to-Main-Chat
4. Aktion läuft mit Main-Chat-Settings (Modell, Skills, Prompts)
5. Output landet im action-typischen Ziel
6. User entscheidet ob das Ergebnis bleibt (Rewrite: Undo / Inline-Chat: weitere Turns / Send: Sidebar übernimmt)

### 4.5 Touchpoints

| Touchpoint | Phase | Channel | Experience |
|---|---|---|---|
| Selection im Editor | During | Digital | + |
| Floating-Menu Render | During | Digital | o (muss unaufdringlich bleiben) |
| Hotkey-Auslösung | During | Digital | + |
| Output-Render (4 Modi) | During | Digital | + |
| Settings-Surface (Floating an/aus, Hotkey ändern) | Before/After | Digital | o |

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)

Der Editor in Obsidian ist heute eine reine Text-Surface ohne native AI-Aktionen. Jede AI-Bedürfnis erzwingt einen Context-Switch in den Sidebar und das manuelle Wiederherstellen des Selection-Kontexts. Das ist friction-reich für häufige, kurze Aktionen (Lookup, Rewrite) und reduziert den faktischen Nutzungsgrad des Agenten ausserhalb expliziter Chat-Sessions. Gleichzeitig pflegt der User seine Modell/Skill/Prompt-Konfiguration nur einmal im Main-Chat und erwartet, dass jede AI-Surface diese Konfiguration übernimmt.

### 5.2 Root Causes

1. **Architektur-Trennung Editor vs Chat:** Bisher kein gemeinsamer Action-Bus zwischen CodeMirror-Selection-Events und AgentTask-Pipeline
2. **Kein UI-Hook auf Selection:** Obsidian liefert nur Format-Toolbar, kein Plugin-Hook für Custom-Menus auf Selection
3. **Settings-Surface ist Chat-zentriert:** Modell/Skills/Prompts werden im Sidebar-Settings-Modus gewählt, keine Surface-Konsumenten ausser dem Chat selbst
4. **Keine vordefinierten AI-Verben:** User muss in natürlicher Sprache formulieren, was Lookup/Rewrite/Chat-About-This bedeuten soll

### 5.3 Impact

- **Business Impact:** AI-Feature-Nutzung unter dem möglichen Niveau. Wettbewerb (Cursor, Notion AI) deckt das Pattern ab; Vault Operator riskiert Plugin-Wechsel von Power-Usern. Wahrnehmung als "AI-Sidebar-Plugin" statt "AI-integriert in Obsidian"
- **User Impact:** Frustration bei kurzen Inline-Bedürfnissen, höhere Schwelle für AI-Nutzung in Lese-Workflows (wo der Sidebar selten offen ist), repetitive Wiederholung des Kontext-Aufbaus

### 5.4 Jobs to be Done

| Job Type | Job Description | Currently Hired | Firing Reason |
|---|---|---|---|
| Functional | Begriff im Text verstehen, ohne Tab/Sidebar zu wechseln | Sidebar-@-Mention + manueller Lookup-Prompt | 4 Context-Switches für eine 5-Sekunden-Antwort |
| Functional | Absatz mit AI umformulieren | Sidebar-Drag-and-Drop + "schreib das besser"-Prompt + Copy-Paste zurück | Original geht aus Sichtfeld, Diff-Vergleich im Kopf |
| Emotional | "Mein Agent ist überall verfügbar, nicht nur im Sidebar" | Heute nicht erfüllbar | Sidebar-Zwang fühlt sich wie ein Tool-Wechsel an |
| Social | "Mein Plugin kann das, was Cursor kann" | Heute nicht erfüllbar | Tool-Parity-Lücke sichtbar in Community |

---

## 6. Goals and Objectives

### 6.1 Business Goals

- Vault Operator als integrierte AI-Surface positionieren (nicht nur AI-Sidebar)
- Tool-Parity mit Cursor/Continue/Notion AI in dem Pattern, das User aus diesen Tools mitbringen
- Settings-Reuse als Differenzierungsmerkmal gegenüber generischen AI-Plugins

### 6.2 User Goals

- AI-Aktion auf markiertem Text in <2 Sekunden auslösen, ohne Editor zu verlassen
- Konsistente Modell/Skill/Prompt-Konfiguration zwischen Editor- und Chat-Surface
- Vier häufige Use-Cases mit einem einheitlichen Trigger abgedeckt

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe |
|---|---|---|---|
| Inline-Adoption (% weekly-active-user mit ≥1 Inline-Action/Woche) | 0% (Feature existiert nicht) | ≥40% | 90 Tage post-release |
| Action-Mix-Balance (kein einzelne Action <5% oder >70% des Mix) | n/a | alle 4 Actions zwischen 5%-70% | 90 Tage post-release |
| Time-to-AI-Response (Median: Selection bis erstes Output-Token) | Sidebar-Pfad: ~8-12s inkl. Switching | ≤3s | sofort nach Release |
| Floating-Menu-Opt-Out (% User die in Settings auf Hotkey-only umstellen) | n/a | ≤15% | 90 Tage post-release |

Baselines werden im PoC/Spike der Architektur-Phase verfeinert.

---

## 7. Idea Potential and Solution Concept

### 7.1 Idea Potential

| Axis | Score | Rationale |
|---|---|---|
| Value / Urgency | 8/10 | Etabliertes Pattern, User erwarten es. Friction-Reduktion direkt messbar. Nicht existenz-kritisch (Sidebar funktioniert), aber spürbar in Daily-Use |
| Transferability | 9/10 | GA-Feature, alle User-Segmente von Vault Operator profitieren. Mobile-tauglich (Tap-and-hold-Menu) |
| Feasibility | 7/10 | CodeMirror-Selection-API zugänglich. 4 Output-Modi haben unterschiedliche Komplexität (Inline-Chat-Conversation-Block am anspruchsvollsten). Settings-Reuse erfordert Refactoring der Settings-Konsum-Surface |

### 7.2 The Wow

"Vault Operator ist die einzige AI-Sidebar, bei der der Sidebar optional wird. Markiere Text, frag den Agenten, Ergebnis landet wo du es brauchst - mit denselben Settings, denselben Skills, demselben Modell wie im Main-Chat."

### 7.3 Critical Hypotheses

| ID | Hypothesis | Type | Test Method | Success Criterion |
|---|---|---|---|---|
| H-01 | Floating-Menu auf Selection stört das normale Markieren-zum-Kopieren nicht, wenn Default-Trigger sinnvoll debounced ist | Problem-Solution Fit | 14 Tage BRAT-Beta mit Telemetry auf Opt-Out und Bug-Reports | <15% User schalten in Settings auf Hotkey-only, keine "Menu erscheint immer"-Bugs |
| H-02 | Direct-Replace + Undo ist die akzeptable UX für Rewrite. User vertraut auf Undo-Stack statt Diff-Preview zu erwarten | Problem-Solution Fit | 14 Tage Beta mit Telemetry auf Undo-Frequenz nach Rewrite | Undo-Rate nach Rewrite-Action <30% (Indikator dass meiste Outputs akzeptiert werden) |
| H-03 | Settings-Reuse aus Main-Chat ist die richtige Granularität. Kein User-Bedarf für separate Inline-Settings | Problem-Solution Fit | 30 Tage Beta + Issue-Tracking | <2 Issues mit "ich will andere Settings für Inline" |
| H-04 | Die 4 gewählten Actions (Lookup, Rewrite, Inline-Chat, Send-to-Main-Chat) decken den Hauptbedarf. Kein häufiger Use-Case fehlt | Market | 30 Tage Beta + Issue-Backlog | <3 Issues mit "fehlt Action X" wo X eine klar einzelne neue Action ist |
| H-05 | CodeMirror-Selection-API + Obsidian-Editor-API tragen alle 4 Output-Modi (Floating-Menu, Tooltip, Direct-Replace, Conversation-Block, Sidebar-Open-with-Context) ohne Editor-State zu korrumpieren | Tech Feasibility | Spike in Architektur-Phase | Alle 4 Actions funktionieren in Source-Mode + Live-Preview; Lookup/Send zusätzlich in Reading-Mode |

### 7.4 Solution Idea and Object Model

Vier Actions auf einer geteilten Trigger-Schicht:

```
Selection-Event (CodeMirror)
   |
   v
Trigger-Resolver (Floating-Menu | Hotkey | Command-Palette)
   |
   v
Action-Dispatcher
   |
   +-- Lookup           --> SemanticIndex/LLM, Tooltip oder Side-Panel
   +-- Rewrite          --> AgentTask, Direct-Replace via Editor-API + Undo-Stack
   +-- Inline-Chat      --> AgentTask, Conversation-Block über/unter Selection
   +-- Send-to-Main-Chat --> Sidebar öffnen, Selection als Vor-Kontext einfügen

Alle Actions konsumieren Settings aus dem aktiven Main-Chat-Provider-Setup
(Modell, Skills, Prompts, Tools). Kein eigener Settings-Tree fuer Inline.
```

Granularere Architektur-Entscheidungen (Settings-Snapshot vs Live-Bind, Streaming-Pfad pro Action, Conversation-Block-Speicherung) sind ASRs für die Architektur-Phase.

---

## 8. Scope Definition

### 8.1 In Scope

- Floating-Menu auf Selection im Editor (Default), umschaltbar auf Hotkey-Trigger via Settings
- Vier Actions: Lookup, Rewrite (Direct-Replace + Undo), Inline-Chat, Send-to-Main-Chat
- Settings-Reuse aus aktivem Main-Chat-Provider-Setup (Modell, Skills, Prompts, Provider)
- Source-Mode + Live-Preview (Edit-Modi)
- Reading-Mode für Lookup und Send-to-Main-Chat (kein Rewrite/Inline-Chat in read-only)

### 8.2 Out of Scope

- Eigene Inline-Settings (Modell, Skills) - explizit verworfen via H-03
- Diff-Preview für Rewrite - verworfen via Rewrite-Output-Entscheidung
- Translate, Summarize, Explain-Like-I-Am-5 als separate Actions - kann nach H-04-Validierung als FEAT-33-05+ nachgezogen werden
- Inline-Actions auf Canvas-Selection oder Base-Cell-Selection - eigene EPIC, falls Surface-Parity ausgebaut wird
- Workflow-/Recipe-Trigger aus Inline-Action - EPIC-30 (Workflow-Builder) ist separater Hebel
- Mobile-spezifische Optimierungen jenseits Tap-and-hold-Menu - mit Welle-1-Mobile (FEAT-27-01) abstimmen

### 8.3 Assumptions

- CodeMirror-6-Selection-Events sind in der Obsidian-Plugin-API stabil zugänglich (zu verifizieren in Spike)
- Modell/Skills-Snapshot zum Action-Zeitpunkt ist akzeptabel (vs Live-Bind), weil User Settings selten mid-Session ändert
- Inline-Chat-Conversation-Block kann als Sub-Conversation in der existierenden History-Pipeline gespeichert werden (oder ephemer bleiben - Architektur-Entscheidung)

### 8.4 Constraints

- Obsidian-Plugin-API (Editor-Hooks, Floating-Toolbar-Slots)
- Performance: Selection-Event-Frequenz hoch, Trigger-Resolver muss debounce-effizient sein (keine LLM-Latenz beim Selection-Event selbst)
- Mobile: Touch-Selection-Pattern ist anders als Desktop (Tap-and-hold-Menu)
- Bot-Compliance (Obsidian Community Plugin Review): keine fetch, kein innerHTML, keine direkten Stil-Mutations, FileManager.trashFile etc.

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Floating-Menu kollidiert mit Obsidian-eigener Format-Toolbar | M | M | Render-Position koordinieren oder Format-Toolbar in Editor-Modus erkennen und ausweichen. Hotkey-Fallback via Settings |
| Direct-Replace überschreibt Inhalt, Undo-Stack reicht nicht zurück | L | H | Checkpoint-Snapshot vor Rewrite (analog zu edit_file-Pattern). Optional Settings-Toggle für Diff-Preview-Fallback bei langen Selections |
| Settings-Snapshot wird stale, User ändert Modell und Inline nutzt altes | M | L | Snapshot pro Action zum Trigger-Zeitpunkt (nicht beim Plugin-Load). Optional Indikator im Floating-Menu welches Modell verwendet wird |
| Inline-Chat-Conversation-Blocks blähen die Note auf | M | M | Begrenzung pro Block oder Auto-Collapse. Architektur-Entscheidung in Spike-Phase |
| Bot-Review-Findings durch neue Editor-DOM-Manipulationen | M | M | review-bot-Skill vor Push, Pattern aus existierenden Modals/Tooltips wiederverwenden |
| Mobile-Tap-and-hold-Menu kollidiert mit System-Selection-Menu | M | M | Plattform-Detection, Fallback auf Command-Palette wenn Mobile-Floating nicht trägt |

---

## 10. Requirements Overview

### 10.1 Functional Requirements (Summary)

- Trigger-Mechanismus auf Selection (Floating-Menu Default + Hotkey-Alternative + Command-Palette-Konsistenz)
- 4 Actions mit action-spezifischen Output-Modi
- Settings-Reuse aus aktivem Main-Chat-Provider
- Mode-Awareness (Source/Live-Preview/Reading)
- Mobile-Pattern (Tap-and-hold)

### 10.2 Non-Functional Requirements (Summary)

- **Performance:** Trigger-Resolver-Overhead pro Selection-Event <5ms (kein User-spürbarer Lag); Time-to-First-Token-Output ≤3s
- **Security:** Selection-Inhalt wird wie Chat-Input behandelt (gleiche Prompt-Injection-Hardening wie Main-Chat). Keine zusätzliche PII-Exposure
- **Scalability:** Skaliert mit Note-Grösse und Selection-Länge (Selection-Cap ggf. analog zu CONTEXT_DOCUMENT_CHAR_LIMIT)
- **Bot-Compliance:** Obsidian Community Plugin Review-Bot Rules

### 10.3 Key Features (für RE)

| Priority | Feature | Description |
|---|---|---|
| P0 | FEAT-33-01 (geplant) | Trigger-Layer: Floating-Menu + Hotkey + Command-Palette + Settings-Surface |
| P0 | FEAT-33-02 (geplant) | Lookup-Action: Tooltip oder Side-Panel mit Begriffs-Erklärung |
| P0 | FEAT-33-03 (geplant) | Rewrite-Action: Direct-Replace + Undo-Stack + optional Checkpoint |
| P0 | FEAT-33-04 (geplant) | Send-to-Main-Chat-Action: Sidebar öffnen, Selection als Vor-Kontext |
| P1 | FEAT-33-05 (geplant) | Inline-Chat-Action: Conversation-Block über/unter Selection (anspruchsvollster Output-Modus) |

Priorisierung: Trigger-Layer und drei einfachere Actions (Lookup, Rewrite, Send-to-Main-Chat) bilden P0-Welle. Inline-Chat ist P1 weil Conversation-Block-Storage und Multi-Turn-UX zusätzliche Spike-Tiefe braucht.

---

## 11. Evaluate: Market Assessment

> Vault Operator ist ein kostenloses Community-Plugin. Sections 11.3 (Pricing), 11.6 (Revenue Stream) sind nicht anwendbar. 11.4 (Channels) und 11.5 (Unfair Advantage) werden im Plugin-Kontext interpretiert.

### 11.1 Value Proposition Score

| Dimension | Score | Rationale |
|---|---|---|
| Activate users | 7/10 | Pattern aus Cursor/Notion AI bekannt, Adoption-Hürde niedrig |
| Preference vs substitutes | 8/10 | Substitut = Sidebar-Workflow; Inline reduziert 4 Context-Switches auf 0-1 |
| Willingness to pay | n/a | Plugin ist kostenlos |
| Referral potential | 7/10 | Inline-Edit-Feature ist demonstrierbar (Screencast-tauglich), unterstützt Community-Mund-zu-Mund |

### 11.2 Assessment Radar

| Axis | Score | Rationale |
|---|---|---|
| Brand Fit | 9/10 | Passt zur Vault-Operator-Vision (AI-überall im Vault, nicht nur Sidebar) |
| Investment | 5/10 | 4 Actions + Trigger-Layer + Settings-Refactor = mehrere Wellen, M-Aufwand pro FEAT |
| Asset Fit | 9/10 | AgentTask, Skills, Modell-Router bestehen; nur Surface-Wiring fehlt |
| Viral Potential | 7/10 | Demonstrierbar in Tweets/Screencasts |
| New Customer | 6/10 | Hilft User die von Cursor-ähnlichen Tools migrieren, weniger Erstkunden-Akquise |
| Market Size | 8/10 | Alle Vault Operator-Nutzer + Cursor-User die auch Obsidian nutzen |

### 11.3 Price Point and Willingness to Pay

n/a. Vault Operator ist kostenloses Community-Plugin.

### 11.4 Channels

| Channel | Purpose | Priority |
|---|---|---|
| BRAT-Beta auf vault-operator-dev | Pre-Release-Test + Telemetry für Kritische Hypothesen | H |
| Obsidian Community Plugin (public obsilo-Repo) | GA-Release | H |
| Release-Notes + Screencast | Adoption + Tool-Parity-Kommunikation | M |
| Community-Discord/Issues | Feedback-Loop für H-04 (fehlende Actions) | M |

### 11.5 Unfair Advantage

- Vault Operator hat bereits Modell-Router, Skills, Memory, Provider-Setup. Inline ist Surface-Wiring auf existierender Backend-Tiefe, nicht eine Greenfield-Implementierung
- Settings-Reuse als Architektur-Prinzip differenziert von Plugins die Inline und Chat als parallele Silos behandeln
- Community-Vertrauen + BRAT-Beta-Kanal für schnelle Iteration

### 11.6 Revenue Stream

n/a.

### 11.7 KPIs

Siehe Section 6.3.

### 11.8 User Experience and Emotion

- **User Experience:** "AI ist im Editor zu Hause, nicht nur im Sidebar." Selection ist Trigger genug, keine extra Konfiguration nötig
- **Emotional Response:** Schreibflow bleibt erhalten, AI ist verfügbar wenn gebraucht und unsichtbar wenn nicht. Vertrauen durch Settings-Konsistenz und Undo-Stack

---

## 12. Next Steps

- [ ] Review durch Sebastian (Self-Validation als primärer User)
- [ ] Handoff zu `/requirements-engineering` für EPIC-33-Spec + FEAT-33-01..05
- [ ] Architektur-Phase: Spike auf CodeMirror-Selection-API + Floating-Menu-Slot (H-05 Tech Feasibility)
- [ ] BRAT-Beta-Plan nach P0-Welle (FEAT-33-01..04) für H-01/H-02/H-03/H-04-Validierung

---

## Appendix

### A. Glossary

- **Inline-Action:** AI-Aktion auf markiertem Text, ausgelöst über Floating-Menu oder Hotkey, Output landet im action-spezifischen Ziel
- **Main-Chat-Settings:** Aktive Provider-Konfiguration (Modell, Skills, Prompts, Tools) im Sidebar-Chat zum Action-Zeitpunkt
- **Trigger-Resolver:** Modul das Selection-Events in Action-Choices übersetzt (Floating-Menu-Render oder Hotkey-Dispatch)
- **Conversation-Block:** Inline-Element im Note das eine Inline-Chat-Konversation zur Selection persistiert (Architektur-Entscheidung offen: ephemer vs persistiert)

### B. Exploration Board

Kein separates EXPLORE-Dokument erstellt; EXPLORE-Inhalte sind direkt in Sektionen 1-5 dieser BA inline. Rationale: kompaktes EPIC mit klarem Scope, kein separates Discovery-Artefakt nötig.

### C. Interview Notes

Sebastian (2026-06-22, Sitzung mit /dia-guide + /business-analysis):

- Primärer Anker: Mischung aller vier Trigger-Anker (Friction + Tool-Parity + Wissens-Anreicherung + Kontext-Präzision)
- Persona: GA-Feature, kein Persona-Split, eine homogene Vault Operator-User-Persona P1
- HMW: Friction-Reduktion als Outcome-Anker
- Trigger-UX: Floating-Menu Default + Settings-Toggle auf Hotkey
- Rewrite-Output: Direct-Replace + Undo (Cursor-Pattern), kein Diff-Preview

### D. References

- BACKLOG: `_devprocess/context/BACKLOG.md` (Sektion EPIC-33)
- Branch: `feature/inline-editor-ai-actions` (von `dev` abgezweigt 2026-06-22)
- Verwandte EPICs: EPIC-16 (Backend-Optimierungs-Patterns, kein Überschneidung im Scope), EPIC-30 (Workflow-Builder, separate Surface), EPIC-23 (Cross-Surface AI Workflow, externe Tools)
- Konkurrenz-Patterns: Cursor (Cmd+K Inline-Edit), Continue (Inline-Chat), Notion AI (Slash-Menu auf Selection), Anthropic-Projects (Conversation-Block)
