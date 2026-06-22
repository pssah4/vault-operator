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

Vault Operator hat heute eine starke Chat-Sidebar mit voller Tool/Skill/Provider-Konfiguration und einen klassischen Obsidian-Editor ohne native AI-Hooks. Cursor (Cmd+K Inline-Edit mit Inline-Diff), Continue (Cmd+I Inline-Edit mit Diff-Streaming), GitHub Copilot (Cmd+I Inline-Chat mit Keep/Undo-Diff), Notion AI (Floating-Menu mit Preview-Block) und ChatGPT Canvas (Selection-Floating-Toolbar) haben das Inline-Edit-Muster etabliert. Der SOTA-Output-Modus für Rewrite ist über alle ernsthaften Wettbewerber hinweg **Inline-Diff mit Accept/Reject** (6 von 8 untersuchten Tools, siehe RESEARCH-EPIC-33-inline-ai-competitors-2026-06-22.md). Direct-Replace ohne Diff ist Minderheitsposition. Vault Operator hat das Inline-Muster bisher nicht, obwohl die Backend-Infrastruktur (Modell-Router, Skill-System, Memory, Knowledge-Layer mit 10.783 Vektoren) vollständig vorhanden ist.

Die Markt-Lücke ist nicht "noch eine Inline-Edit-UX". 5 Obsidian-Plugins decken Inline-AI teilweise ab (Obsidian Copilot mit Quick-Ask + Modal-Inline-Edit, InlineAI mit echter Cursor-Style-Diff-UX, Smart Composer mit Apply-Edit, AI Revisionist mit Modal-Review, Text Generator mit Template-Append). Die echte Lücke: kein Plugin kombiniert Settings-Reuse aus aktivem Chat plus tiefe Vault-Knowledge-Integration im Lookup plus Skills-System-Integration im Rewrite plus persistenten Inline-Chat-Conversation-Block. Genau das ist Vault Operators Differenzierungskorridor.

### 2.2 Current State (As-Is)

User-Pfad heute, wenn sie zu markiertem Text eine AI-Aktion wollen:

1. Selection im Editor
2. Sidebar öffnen (Hotkey oder Ribbon-Click)
3. Selection per Drag-and-Drop oder @-Mention in den Chat ziehen
4. Aktion in den Prompt schreiben (kein vordefiniertes Verb)
5. Antwort lesen, ggf. Block für Block zurück in die Note kopieren

Mindestens 4 Context-Switches pro Inline-Bedürfnis. Bei Rewrite zusätzlich manuelles Diff im Kopf, weil Original-Selection aus dem Sichtfeld ist. Wenn die Sidebar aktuell geschlossen ist (typisch wenn der User lesend oder schreibend in der Note arbeitet und die Sidebar bewusst zugemacht hat um Platz zu haben), kostet die Sidebar-Reaktivierung einen weiteren Layout-Sprung.

### 2.3 Desired State (To-Be)

1. Selection im Editor
2. Floating-Menu erscheint automatisch über der Selection (Default) ODER User drückt seinen konfigurierten Hotkey
3. Action wählen (Lookup, Rewrite, Inline-Chat, Send-to-Main-Chat, Translate, Summarize, Skill-Action, Find-Action-Items)
4. Ergebnis landet im action-typischen Ziel:
   - Lookup: Preview-Block unter Selection mit Vault-Quellen-Verlinkung (Notion-Pattern plus Vault-Knowledge-Augmentation)
   - Rewrite: Inline-Diff im Editor mit Accept/Reject und Per-Hunk-Granularität (Cursor/Continue/Copilot-SOTA)
   - Inline-Chat: persistenter Conversation-Block in der Note, durch Memory + History-Search indexiert
   - Send-to-Main-Chat: Sidebar öffnet sich automatisch (auch wenn vorher geschlossen) mit Selection als Vor-Kontext

Settings (Modell, Skills, Prompts, Provider) werden per Snapshot zum Action-Trigger-Zeitpunkt aus der aktiven Main-Chat-Konfiguration übernommen. Optional kann der User pro Action einen Modell-Override pinnen (Foldback für Power-User, default off).

**Sidebar-Independence:** alle Inline-Actions funktionieren unabhängig davon ob die Chat-Sidebar offen oder geschlossen ist. Der Settings-Snapshot, der Modell-Provider, das Skills-System und das Streaming-Rendering müssen sidebar-unabhängig leben. Send-to-Main-Chat öffnet die Sidebar bei Bedarf automatisch.

### 2.4 Gap Analysis

- Kein Floating-Menu auf Selection im Editor (Obsidian liefert nur Format-Toolbar)
- Keine vordefinierten AI-Verben für Selection-Aktionen
- Kein Settings-Sharing zwischen Editor und Chat (Chat hat alles, Editor nichts)
- Keine action-spezifischen Output-Modi (Inline-Diff, Preview-Block, Conversation-Block, Tooltip mit Vault-Quellen existieren nicht)
- Keine sidebar-unabhängige AI-Infrastruktur (Modell-Aufrufe sind heute an die Sidebar-View gekoppelt)
- Vault-Knowledge-Layer (Semantic-Index, Memory) ist nicht in Editor-Aktionen integriert, obwohl 10.783 Vektoren bereitstehen

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
| N-01 | Begriff im markierten Text erklärt bekommen, mit Verlinkung auf Vault-Quellen wenn vorhanden | Functional | H | P1 |
| N-02 | Markierten Absatz vom Agenten überarbeiten lassen, Original im Blick, Diff sehen vor Accept | Functional | H | P1 |
| N-03 | Über markierten Inhalt eine Konversation führen, persistent als Block in der Note | Functional | M | P1 |
| N-04 | Markierte Selection als Vor-Kontext in den Main-Chat senden, Sidebar öffnet bei Bedarf | Functional | M | P1 |
| N-05 | Vertrauen, dass Inline-Aktion dieselben Settings nutzt wie der Main-Chat (Modell, Skills, Prompts) | Emotional | H | P1 |
| N-06 | Inline-Aktion stört nicht beim normalen Markieren-zum-Kopieren | Emotional | M | P1 |
| N-07 | Inline-Action funktioniert auch wenn die Chat-Sidebar geschlossen ist | Functional | H | P1 |
| N-08 | Eigene Skills (User Skills, Plugin Skills) im Floating-Menu nutzen können | Functional | M | P1 |
| N-09 | Markierten Text in andere Sprache übersetzen lassen, inline | Functional | M | P1 |
| N-10 | Lange Selection in Kurzfassung zusammenfassen lassen | Functional | M | P1 |

### 4.3 Insights

**Functional:** User behelfen sich heute mit Sidebar + @-Mention + Copy-Paste. Workaround funktioniert, kostet aber 4+ Context-Switches pro Aktion. Wenn die Sidebar geschlossen ist, kommt der Sidebar-Reaktivierungs-Layout-Sprung hinzu.
**Emotional:** Frust entsteht weniger durch die Antwort-Qualität als durch die Vorbereitung des Aufrufs. "Cursor kann das doch auch" wird im Plugin-Community-Diskurs sichtbar - präzise gemeint ist hier das Inline-Diff-Pattern mit Accept/Reject (Cmd+K floating Bar plus inline Diff), nicht Direct-Replace.
**Social:** Inline-Edit ist 2026 ein Standard-Pattern in AI-Writing-Tools. Marktrecherche 2026-06-22 zeigt: Floating-Menu auf Selection ist Standard (Notion, Obsidian Copilot, InlineAI), Hotkey-Default ist Standard (Cursor Cmd+K, Continue Cmd+I, Copilot Cmd+I). Output-SOTA für Rewrite ist Inline-Diff mit Accept/Reject (6/8 Tools). Tool-Parity reduziert Wechsel-Reibung.
**Analogien:** "Markdown-Note ist meine IDE für Wissen, Cmd+K im Editor ist meine Quick-Action wie in Cursor." "Notion AI hat 17 Operationen im Selection-Menu, davon nutze ich täglich 5-6 - das gleiche Set will ich in Obsidian."

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

| KPI | Baseline | Lernziel / Target | Timeframe |
|---|---|---|---|
| Inline-Adoption (% weekly-active-user mit ≥1 Inline-Action/Woche) | 0% (Feature existiert nicht) | Lernziel: empirisch erheben, da kein Markt-Benchmark öffentlich verfügbar (Cursor/Notion publizieren keine Inline-Adoption-Raten). Erwartung qualitativ: signifikanter Zuwachs gegenüber 0%. | 90 Tage post-release |
| Action-Mix-Balance (Verteilung über alle implementierten Actions) | n/a | Lernziel: keine einzelne Action <3% des Mix (sonst Indikator dass Action-Wahl nicht trifft), kein Mix >70% (sonst Hinweis dass andere Actions überflüssig wirken) | 90 Tage post-release |
| Time-to-AI-Response (Median: Selection bis erstes Output-Token) | Sidebar-Pfad: ~8-12s inkl. Switching | ≤3s (Tech-Feasibility, durch Streaming + Cost-aware-Tier-Routing erreichbar) | sofort nach Release |
| Floating-Menu-Opt-Out (% User die in Settings auf Hotkey-only umstellen) | n/a | Lernziel: empirisch, Indikator wie stark der Floating-Default User stört | 90 Tage post-release |
| Sidebar-Independence-Coverage (% Inline-Actions die mit geschlossener Sidebar erfolgreich laufen) | n/a (Feature existiert nicht) | 100% (alle Actions außer Send-to-Main-Chat müssen ohne Sidebar funktionieren; Send-to-Main-Chat öffnet sie automatisch) | sofort nach Release, Tech-Akzeptanzkriterium |
| Diff-Accept-Rate für Rewrite (% Rewrite-Outputs die User akzeptiert statt verwirft) | n/a | Lernziel: ≥60% (Indikator für Rewrite-Qualität); Disaccept-Rate >50% triggert Modell-Tier-Review | 90 Tage post-release |

Baselines werden im PoC/Spike der Architektur-Phase verfeinert. Telemetrie-Infrastruktur ist offene Architektur-Frage (siehe Section 7.4).

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
| H-01 | Floating-Menu auf Selection stört das normale Markieren-zum-Kopieren nicht, wenn Default-Trigger sinnvoll debounced ist und Obsidian-Format-Toolbar nicht kollidiert | Problem-Solution Fit | 14 Tage BRAT-Beta mit Telemetry auf Opt-Out-Rate und Bug-Reports zu Menu-Kollision. Cursor und Continue setzen bewusst nur auf Hotkey (kein Floating), Notion und Obsidian Copilot machen Floating. Test der Annahme dass Vault-Wissensarbeiter wie Notion-User auf Floating reagieren, nicht wie Code-Entwickler auf reinen Hotkey-Workflow. | <15% User schalten in Settings auf Hotkey-only, keine "Menu erscheint immer"-Bugs, Time-to-Action steigt nicht im Vergleich zu Hotkey-Default |
| H-02 | Inline-Diff mit Accept/Reject auf CodeMirror lässt sich mit akzeptabler Latenz und ohne Editor-State-Korruption rendern. Per-Hunk-Accept (Continue Cmd+Opt+Y/N-Pattern) ist Tech-Feasible. | Tech Feasibility | Spike in Architektur-Phase auf CodeMirror-6 Diff-Renderer. Vorbild-Code: FIX-01-07-03 `refreshOpenMarkdownViewsFor` für Editor-State-Mutation. Vergleich mit InlineAI-Plugin-Source als Best-Practice-Referenz. | Diff streamt mit <100ms zwischen Token und Render; Per-Hunk-Accept funktioniert ohne Cursor-Position-Verlust; Multi-Selection (Edge-Case) crasht nicht |
| H-03 | Settings-Snapshot aus Main-Chat zum Action-Trigger-Zeitpunkt ist der richtige Default. Power-User wollen optional einen Per-Action-Modell-Pin als Override (Continue role-basierter Modell-Setup als Markt-Inspiration). | Problem-Solution Fit | 30 Tage Beta plus Issue-Tracking plus Telemetrie auf Pin-Nutzung (wie viele User pinnen mindestens 1 Action). | Default-Settings-Reuse wird von >80% akzeptiert. Pin-Funktion (FEAT-33-10) wird von 10-30% genutzt (Indikator dass Optionalität gerechtfertigt war). |
| H-04 | Die 11 Actions decken den Hauptbedarf. Falls dennoch eine häufig gewünschte Action fehlt, ist die TOP-5-Watchlist (Continue-Writing, Fix-Grammar-as-Preset, Make-Shorter/Longer-Buttons, Change-Tone, Reading-Level) der erste Kandidat. | Market | 30 Tage Beta plus Issue-Backlog. TOP-5-Watchlist wird gegen Issue-Density gewichtet. | Keine Action außerhalb der Watchlist sammelt ≥3 Issues. Watchlist-Actions werden nach Issue-Density priorisiert (statt blind 3-Issues-Schwelle). |
| H-05 | CodeMirror-Selection-API + Obsidian-Editor-API tragen alle Output-Modi (Floating-Menu, Inline-Diff, Preview-Block, Conversation-Block, Sidebar-Open-with-Context) ohne Editor-State zu korrumpieren | Tech Feasibility | Spike in Architektur-Phase | Alle Actions funktionieren in Source-Mode + Live-Preview; Lookup/Send/Translate zusätzlich in Reading-Mode (Read-only-Editor) |
| H-06 | **Sidebar-Independence:** Alle Inline-Actions funktionieren ohne offene Chat-Sidebar. Modell-Provider, Settings-Snapshot, TaskRouter, Skills-System und Streaming-Rendering sind sidebar-unabhängig. Send-to-Main-Chat öffnet die Sidebar automatisch bei Bedarf. | Tech Feasibility + Problem-Solution Fit | Spike + Akzeptanzkriterium in jeder FEAT-DoD ("funktioniert mit geschlossener Sidebar, verifiziert"). Live-Verifikation in Beta: alle Actions ausführen während Sidebar zu, beobachten ob Bugs/Errors auftreten. | 100% der Actions außer Send-to-Main-Chat laufen mit geschlossener Sidebar fehlerfrei. Send-to-Main-Chat öffnet Sidebar automatisch und pflegt Selection als Vor-Kontext ein. Keine "Sidebar must be open"-Errors in Beta. |
| H-07 | **Vault-Knowledge-Differenzierung:** Lookup-Action mit Vault-RAG (Semantic-Search der 10.783 Vektoren + LLM-Augmentation + Quellen-Verlinkung im Tooltip) ist messbar wertvoller als ein reiner LLM-Lookup ohne Vault-Kontext. | Problem-Solution Fit | A/B-Test: 50% User bekommen Vault-RAG-Lookup, 50% bekommen LLM-only-Lookup. Akzeptanz-Rate vergleichen (Insert-into-Note-Rate, User-Folge-Aktion-Rate). | Vault-RAG-Variante hat ≥20% höhere Akzeptanz-Rate. Wenn Differenz <10%, ist Vault-Knowledge-Integration nicht der Differenzierungs-Hebel und FEAT-33-09 muss neu gedacht werden. |

### 7.4 Solution Idea and Object Model

Elf Actions auf einer geteilten Trigger-Schicht, sidebar-unabhängig:

```
Selection-Event (CodeMirror 6)
   |
   v
Trigger-Resolver (Floating-Menu Default | Hotkey | Command-Palette | Right-Click)
   |
   v
Settings-Snapshot (Modell, Skills, Prompts, Provider aus aktivem Main-Chat-State)
   |  ^
   |  +-- Optional Per-Action-Pin (FEAT-33-10): überschreibt Modell pro Action
   |
   v
Action-Dispatcher (sidebar-unabhängig)
   |
   +-- Lookup (FEAT-33-02)            --> Vault-RAG (FEAT-33-09) + LLM, Preview-Block unter Selection mit Quellen-Tooltip
   +-- Rewrite (FEAT-33-03)           --> AgentTask, Inline-Diff im Editor (Cursor-Pattern) mit Per-Hunk Accept/Reject
   +-- Inline-Chat (FEAT-33-05)       --> AgentTask, persistenter Conversation-Block in Note, indexiert via Memory + History
   +-- Send-to-Main-Chat (FEAT-33-04) --> Sidebar öffnen falls geschlossen, Selection als Vor-Kontext einfügen
   +-- Translate (FEAT-33-06)         --> AgentTask, Diff-Preview oder Direct-Replace je nach Settings, Sub-Menu für Zielsprache
   +-- Summarize (FEAT-33-07)         --> AgentTask, Preview-Block unter Selection mit Insert-below
   +-- Skill-Action (FEAT-33-08)      --> Skills-System konsumiert Selection als Input, action-typischer Output je Skill-Capability
   +-- Find-Action-Items (FEAT-33-11) --> entweder built-in oder via Skill (FEAT-33-08), extrahiert Checklist
   +-- Trigger-Layer (FEAT-33-01) ist das gemeinsame Substrat aller obigen

Sidebar-Status-Detector
   |
   +-- closed -> Send-to-Main-Chat öffnet sie automatisch
   +-- open   -> Send-to-Main-Chat fügt Selection in laufenden Chat ein

Cost-aware Tier-Routing (TaskRouter Phase D)
   |
   +-- Lookup        -> Haiku-Tier (cheap, schnell)
   +-- Rewrite       -> Mid-Tier (Default Main-Chat-Modell)
   +-- Inline-Chat   -> Mid-Tier mit Memory-Augmentation
   +-- Translate     -> Haiku-Tier
   +-- Summarize     -> Haiku-Tier
   +-- Skill-Action  -> Skill-Capability bestimmt Tier
```

**Sidebar-Independence-Anker (kritisch für H-06):**

- Settings-Snapshot ist Plugin-State, nicht Sidebar-DOM
- Modell-Provider und Streaming-Pipeline sind im AgentTask-Modul, nicht in Sidebar-View
- Skills-System läuft im Hintergrund, View-unabhängig
- Inline-Output-Rendering geschieht im Editor (CodeMirror-Decorations + Inline-Widgets), nicht im Sidebar
- Telemetrie-Hooks (Cost, Token-Counts, Diff-Accept-Rate) leben im AgentTask-Layer

**Granularere Architektur-Entscheidungen (ASR-Kandidaten für die Architektur-Phase):**

- Settings-Snapshot Lifecycle: pro Trigger oder gecached bis Settings-Änderung
- Conversation-Block-Speicherung: ephemer (nur im Memory) oder persistiert in Note-Frontmatter / separate `.inline-chats.md` / Sub-Conversation in History-Pipeline
- Telemetrie-Infrastruktur: existiert ein Hook im AgentTask-Layer oder muss gebaut werden
- CodeMirror-Diff-Renderer: Eigenbau vs. Library (InlineAI als Vorbild prüfen)
- Sidebar-Status-Detection: View-API oder Workspace-Layout-Observer
- Skills-im-Floating-Menu: welche Skill-Capability triggert Listung im Menu

---

## 8. Scope Definition

### 8.1 In Scope

- Floating-Menu auf Selection im Editor (Default), umschaltbar auf Hotkey-Trigger via Settings
- Empfohlene Hotkey-Defaults (Markt-Konsens): Cmd/Ctrl+K für Inline-Edit-Actions, Cmd/Ctrl+L für Send-to-Main-Chat
- Elf Actions:
  - **P0:** FEAT-33-01 Trigger-Layer, FEAT-33-02 Lookup (Preview-Block), FEAT-33-03 Rewrite (Inline-Diff mit Per-Hunk Accept/Reject), FEAT-33-04 Send-to-Main-Chat, FEAT-33-08 Skills-im-Floating-Menu, FEAT-33-09 Vault-Knowledge-Integration im Lookup
  - **P1:** FEAT-33-05 Inline-Chat (Conversation-Block), FEAT-33-06 Translate (mit Sub-Menu für Zielsprache), FEAT-33-07 Summarize
  - **P2:** FEAT-33-10 Optional Per-Action-Model-Pin, FEAT-33-11 Find-Action-Items
- Settings-Snapshot aus aktivem Main-Chat-Provider-Setup (Modell, Skills, Prompts, Provider) zum Action-Trigger-Zeitpunkt
- **Sidebar-Independence:** alle Actions laufen ohne offene Chat-Sidebar (H-06). Send-to-Main-Chat öffnet die Sidebar automatisch falls geschlossen
- Source-Mode + Live-Preview (Edit-Modi)
- Reading-Mode für Lookup, Send-to-Main-Chat und Translate (kein Rewrite/Inline-Chat in read-only)
- Cost-aware Tier-Routing per Action (Lookup/Translate/Summarize -> Haiku; Rewrite/Chat -> Default-Tier)

### 8.2 Out of Scope

- Diff-Preview-Default OFF (Direct-Replace ohne Diff) - explizit verworfen nach Markt-Recherche; Direct-Replace ist Markt-Minderheit
- Eigene Inline-Settings-Surface (kompletter Settings-Tree separat) - verworfen via H-03; nur optional Per-Action-Model-Pin als Foldback
- Continue-Writing auf leerer Zeile (Notion-Space-Pattern, Cursor-Tab) - Selection-driven scope, Autocomplete ist eigene Kategorie. Separate EPIC-Kandidat
- Change-Tone-Sub-Menu, Make-Shorter/Longer-Buttons als dedizierte Aktionen - können über Skills (FEAT-33-08) realisiert werden, kein eigenes FEAT
- Reading-Level-Slider, Suggest-Edits-Comment-Bubbles, Code-Review-Action - im Vault-Kontext nische, Watchlist nach Beta
- Inline-Actions auf Canvas-Selection oder Base-Cell-Selection - eigene EPIC, falls Surface-Parity ausgebaut wird
- Workflow-/Recipe-Trigger aus Inline-Action - EPIC-30 (Workflow-Builder) ist separater Hebel
- Mobile-spezifische Optimierungen jenseits Tap-and-hold-Menu - mit Welle-1-Mobile (FEAT-27-01) abstimmen

### 8.3 Assumptions

- CodeMirror-6-Selection-Events sind in der Obsidian-Plugin-API stabil zugänglich (zu verifizieren in Spike, H-05)
- CodeMirror-6 Diff-Decorations sind tragfähig für Inline-Diff-Rendering (zu verifizieren in Spike, H-02). InlineAI-Plugin-Source ist Best-Practice-Referenz
- Modell/Skills-Snapshot zum Action-Zeitpunkt ist akzeptabel (vs Live-Bind), weil User Settings selten mid-Session ändert
- AgentTask-Layer ist sidebar-unabhängig instanziierbar (zu verifizieren, H-06). Plugin-State (nicht View-State) ist Single-Source-of-Truth
- Vault-Knowledge-Layer (Semantic-Index, 10.783 Vektoren) liefert für 80%+ Lookup-Anfragen relevante Treffer (H-07-Vorannahme)
- Inline-Chat-Conversation-Block kann als Sub-Conversation in der existierenden History-Pipeline gespeichert werden (oder ephemer bleiben - Architektur-Entscheidung)

### 8.4 Constraints

- Obsidian-Plugin-API (Editor-Hooks, Floating-Toolbar-Slots, Workspace-Sidebar-State)
- Performance: Selection-Event-Frequenz hoch, Trigger-Resolver muss debounce-effizient sein (keine LLM-Latenz beim Selection-Event selbst)
- Inline-Diff-Rendering-Latenz: <100ms zwischen Token und Render damit Streaming flüssig wirkt
- Mobile: Touch-Selection-Pattern ist anders als Desktop (Tap-and-hold-Menu)
- Bot-Compliance (Obsidian Community Plugin Review): keine fetch, kein innerHTML, keine direkten Stil-Mutations, FileManager.trashFile etc.
- Sidebar-Independence: alle AI-Aufruf-Pfade müssen ohne offene Sidebar-View funktionieren (Architektur-Refactoring wenn aktueller Code daran gebunden ist)

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Floating-Menu kollidiert mit Obsidian-eigener Format-Toolbar | M | M | Render-Position koordinieren oder Format-Toolbar in Editor-Modus erkennen und ausweichen. Hotkey-Fallback via Settings |
| CodeMirror-6 Diff-Renderer komplexer als erwartet, Latenz oder Editor-State-Korruption | M | H | Spike in Architektur-Phase mit Vorbild InlineAI-Plugin. Fallback-Plan: Modal-Preview wie Obsidian Copilot (Insert/Replace/Copy) falls Inline-Diff nicht trägt. Vorbild für Editor-State-Pflege: FIX-01-07-03 `refreshOpenMarkdownViewsFor` |
| Settings-Snapshot wird stale, User ändert Modell und Inline nutzt altes | M | L | Snapshot pro Action zum Trigger-Zeitpunkt (nicht beim Plugin-Load). Indikator im Floating-Menu welches Modell verwendet wird |
| Inline-Chat-Conversation-Blocks blähen die Note auf | M | M | Begrenzung pro Block, Auto-Collapse, oder Speicherung in `.inline-chats.md`-Sub-File mit Note-Anker. Architektur-Entscheidung in Spike-Phase |
| Vault-Knowledge-RAG liefert irrelevante Treffer bei Lookup, User-Vertrauen sinkt | M | M | H-07 A/B-Test gegen LLM-only-Variante. Confidence-Threshold für Quellen-Anzeige im Tooltip (nur Treffer >X% Similarity anzeigen). Fallback auf LLM-only wenn Knowledge-Layer keine relevanten Treffer hat |
| Sidebar-Independence-Refactoring größer als erwartet (aktueller AI-Code ist sidebar-gekoppelt) | M | H | Architektur-Spike in Phase 1: inventarisiere alle AI-Aufruf-Pfade und ihre View-Abhängigkeiten. Wenn Refactoring >2 Wochen, Welle aufteilen (FEAT-33-01 + Sidebar-Independence-Refactor als Welle 1, Rest als Welle 2) |
| Skills-im-Floating-Menu überflutet das Menu wenn User viele Skills hat | M | M | Skill-Capability-Flag "inline-action-eligible" (nur passende Skills tauchen auf). Settings-Toggle pro Skill ob im Inline-Menu sichtbar. Limitierung auf TOP-N nach Häufigkeit |
| Bot-Review-Findings durch neue Editor-DOM-Manipulationen | M | M | review-bot-Skill vor Push, Pattern aus existierenden Modals/Tooltips wiederverwenden |
| Mobile-Tap-and-hold-Menu kollidiert mit System-Selection-Menu | M | M | Plattform-Detection, Fallback auf Command-Palette wenn Mobile-Floating nicht trägt |
| Per-Action-Model-Pin (FEAT-33-10) untergräbt Settings-Reuse-Vereinfachung wenn User es überall nutzt | L | M | Pin ist explizit opt-in. UI macht klar dass Pin existiert ("dieser Action nutzt Pin-Modell statt Default"). H-03-Telemetrie misst Pin-Nutzung |

---

## 10. Requirements Overview

### 10.1 Functional Requirements (Summary)

- Trigger-Mechanismus auf Selection (Floating-Menu Default + Hotkey-Alternative + Command-Palette-Konsistenz)
- 4 Actions mit action-spezifischen Output-Modi
- Settings-Reuse aus aktivem Main-Chat-Provider
- Mode-Awareness (Source/Live-Preview/Reading)
- Mobile-Pattern (Tap-and-hold)

### 10.2 Non-Functional Requirements (Summary)

- **Performance:** Trigger-Resolver-Overhead pro Selection-Event <5ms (kein User-spürbarer Lag); Time-to-First-Token-Output ≤3s; Inline-Diff-Render-Latenz <100ms zwischen Token und Render
- **Security:** Selection-Inhalt wird wie Chat-Input behandelt (gleiche Prompt-Injection-Hardening wie Main-Chat). Keine zusätzliche PII-Exposure. Settings-Snapshot kapselt Provider-Credentials nicht neu (gleiches Schlüssel-Material wie Main-Chat)
- **Scalability:** Skaliert mit Note-Grösse und Selection-Länge (Selection-Cap ggf. analog zu CONTEXT_DOCUMENT_CHAR_LIMIT). Skills-im-Menu skaliert mit User-Skill-Anzahl (TOP-N-Cap im Menu)
- **Availability / Architecture:** **Sidebar-Independence: alle Inline-Actions außer Send-to-Main-Chat MÜSSEN ohne offene Chat-Sidebar funktionieren.** Modell-Provider, Settings-Snapshot, TaskRouter, Skills-System und Streaming-Rendering laufen sidebar-unabhängig. Send-to-Main-Chat öffnet die Sidebar automatisch bei Bedarf
- **Compatibility:** Source-Mode + Live-Preview tragen alle Actions; Reading-Mode trägt Lookup, Send-to-Main-Chat und Translate (read-only-Actions). Rewrite/Inline-Chat in Reading-Mode sind no-op mit User-Hinweis
- **Bot-Compliance:** Obsidian Community Plugin Review-Bot Rules (keine fetch, kein innerHTML, kein direkter Style-Mutation, FileManager.trashFile, kein require außer Allowlist)
- **Mobile:** Tap-and-hold-Menu als Trigger-UX-Variante; Fallback auf Command-Palette wenn System-Selection-Menu nicht ausweichbar

### 10.3 Key Features (für RE)

> Konkurrenz-Spalte: SOTA-Position aus der Marktrecherche (RESEARCH-EPIC-33-inline-ai-competitors-2026-06-22.md). "Tool-Parity" heisst die Mehrheit der Wettbewerber hat es; "Innovation" heisst Vault Operator führt es ein; "Differenzierung" heisst Vault Operator macht es anders als der Markt.

| Priority | Feature | Description | Konkurrenz-Position |
|---|---|---|---|
| P0 | FEAT-33-01 | Trigger-Layer: Floating-Menu Default + Hotkey-Settings-Toggle (Cmd+K-Konsens) + Command-Palette + Settings-Surface | Tool-Parity: Floating-Menu (Notion, Obsidian Copilot), Hotkey (Cursor, Continue, GitHub Copilot) |
| P0 | FEAT-33-02 | Lookup-Action: Preview-Block unter Selection mit Begriffs-Erklärung und Vault-Quellen-Tooltip (Notion-Pattern als Basis) | Tool-Parity (Notion "Explain this", Cursor Opt+Return-Question), aber Vault-Quellen ist Differenzierung |
| P0 | FEAT-33-03 | Rewrite-Action: Inline-Diff im CodeMirror mit Per-Hunk Accept/Reject (Cursor + Continue + Copilot SOTA), Streaming-Diff während Token reinkommen | Tool-Parity SOTA (6/8 Tools machen Inline-Diff) |
| P0 | FEAT-33-04 | Send-to-Main-Chat-Action: Sidebar öffnen falls geschlossen (Sidebar-Independence-Verhalten), Selection als Vor-Kontext einfügen, Cmd+L als empfohlener Hotkey-Default | Tool-Parity (Cursor Cmd+L, Continue Cmd+L, Obsidian Copilot Cmd+L) |
| P0 | FEAT-33-08 | Skills-im-Floating-Menu: User Skills + Plugin Skills mit "inline-action-eligible"-Capability tauchen als Action im Menu auf. Per-Skill-Settings-Toggle ob im Inline-Menu sichtbar | Differenzierung (Notion Custom Skills seit März 2026 als Vorbild, aber Vault Operator hat tieferes Skills-System mit Mastery + Capabilities) |
| P0 | FEAT-33-09 | Vault-Knowledge-Integration im Lookup: Semantic-Search der 10.783 Vektoren plus LLM-Augmentation plus Quellen-Verlinkung im Tooltip. RAG-Pipeline mit Confidence-Threshold | Differenzierung (kein Wettbewerber kombiniert AI-Lookup + Vault-RAG) |
| P1 | FEAT-33-05 | Inline-Chat-Action: persistenter Conversation-Block in Note, indexiert via Memory + History-Search. Speicher-Strategie (Note-Frontmatter vs `.inline-chats.md` vs Sub-Conversation) ist Architektur-Entscheidung | Innovation (kein Wettbewerber macht persistenten Inline-Chat-Block) |
| P1 | FEAT-33-06 | Translate-Action: Floating-Menu-Eintrag mit Sub-Menu für Zielsprache (Notion-Pattern). Output-Modus folgt Settings (Inline-Diff Default, optional Direct-Replace) | Tool-Parity (Notion AI, ChatGPT Canvas Code, Continue via custom) |
| P1 | FEAT-33-07 | Summarize-Action: Preview-Block unter Selection mit Insert-below. Sub-Menu für Länge (kurz, mittel, lang) | Tool-Parity (Notion, Obsidian Copilot built-in, Smart Composer) |
| P2 | FEAT-33-10 | Optional Per-Action-Model-Pin: User kann pro Action einen Modell-Override pinnen. UI macht Pin sichtbar im Floating-Menu | Differenzierung gegen H-03-Default (Continue role-basiertes Setup als Inspiration) |
| P2 | FEAT-33-11 | Find-Action-Items-Action: extrahiert Tasks aus Selection als Checklist (Notion-Pattern). Realisierung primär über FEAT-33-08 Skills, eigenes FEAT nur wenn Skills-Pfad nicht trägt | Tool-Parity-Spezial (Notion-exklusiv, aber stark gemerkt) |

**Wellen-Strategie:** P0-Welle (6 FEATs) liefert MVP-Surface mit Differenzierungs-Ankern (Skills + Vault-Knowledge). P1-Welle (3 FEATs) füllt Tool-Parity-Gap auf (Translate, Summarize) plus Inline-Chat-Innovation. P2-Welle (2 FEATs) nach Beta-Lernen.

**Cross-FEAT-Constraint (Sidebar-Independence):** Jedes FEAT in seiner Definition of Done belegt explizit dass es mit geschlossener Chat-Sidebar funktioniert. Send-to-Main-Chat ist die einzige Ausnahme - es öffnet die Sidebar als Teil seiner Funktion.

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

- **Vault-Knowledge-Layer-Integration im Lookup (first-class differenzierend):** kein Wettbewerber kombiniert AI-Erklärung mit Vault-RAG. Smart Connections macht Vault-Lookup ohne AI, Notion "Explain this" ist LLM-only ohne Vault-Bezug. Vault Operator verheiratet Semantic-Search der 10.783 Vektoren mit LLM-Augmentation und Quellen-Tooltip. Architektur-Hebel auf existierender Knowledge-Infrastruktur (EPIC-15/19), nicht Greenfield
- **Skills-System als Inline-Action-Quelle:** Notion hat seit März 2026 Custom Skills, Obsidian Copilot hat Custom Commands - Vault Operator hat das tieferste Skills-System (User Skills + Plugin Skills + Skill-Mastery + Capabilities). Skills mit "inline-action-eligible"-Capability bekommen Floating-Menu-Eintrag. Bestehende Skill-Bibliothek wird sofort nutzbar
- **Memory + History-Integration im Inline-Chat-Block (FEAT-33-05):** wenn der Conversation-Block persistent in der Note bleibt, wird er via Phase D-Recall + Phase F-Chat-Linking indexiert. Cross-Vault-discoverable. Andere Vault-Operator-Tools (search_history, search_vault, recall_memory) finden ihn. Vault wird zum AI-Knowledge-Graph, nicht nur zur AI-Surface
- **Cost-aware Tier-Routing per Action (TaskRouter Phase D):** Lookup auf Haiku, Rewrite auf Default-Tier, Inline-Chat auf Mid-Tier mit Memory-Augmentation. Cursor "Auto" ist konzeptuell nah aber nicht pro Action granular
- **Backend-Wiederverwendung statt Greenfield:** Modell-Router, Skills, Memory, Provider-Setup, Knowledge-Layer, History-Pipeline stehen alle. Inline ist Surface-Wiring auf existierender Tiefe
- **Settings-Reuse als Architektur-Prinzip** differenziert von Plugins die Inline und Chat als parallele Silos behandeln (Obsidian Copilot mit per-Command-Modell ist Gegenposition). Optional Per-Action-Pin (FEAT-33-10) als Foldback
- **Community-Vertrauen + BRAT-Beta-Kanal** für schnelle Iteration und H-01/H-02/H-04/H-06/H-07-Validierung

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

Sebastian (2026-06-22, Sitzung mit /dia-guide + /business-analysis + Marktrecherche):

- Primärer Anker: Mischung aller vier Trigger-Anker (Friction + Tool-Parity + Wissens-Anreicherung + Kontext-Präzision)
- Persona: GA-Feature, kein Persona-Split, eine homogene Vault Operator-User-Persona P1
- HMW: Friction-Reduktion als Outcome-Anker
- Trigger-UX: Floating-Menu Default + Settings-Toggle auf Hotkey
- Rewrite-Output (initial Sitzung): Direct-Replace + Undo, mit Referenz "Cursor-Pattern"
- **Rewrite-Output (revidiert 2026-06-22 nach Marktrecherche):** Inline-Diff mit Per-Hunk Accept/Reject. Begründung: die initial Referenz "Cursor-Pattern" war faktisch unzutreffend - Cursor macht selbst Inline-Diff mit Accept/Reject (Cmd+K Floating Bar plus Diff rot/grün, Cmd+Return akzeptieren, Cmd+Backspace verwerfen), nicht Direct-Replace. 6/8 untersuchte Tools (Cursor, GitHub Copilot, Continue, InlineAI, Smart Composer, ChatGPT Canvas mit Show-Changes-Toggle) machen Inline-Diff. Direct-Replace ohne Diff wäre Markt-Minderheit gewesen
- **Feature-Scope erweitert (2026-06-22 nach Marktrecherche):** von 4 auf 11 FEATs. Translate, Summarize aus Out-of-Scope in In-Scope gezogen weil 6-8/8 Tools sie als first-class haben. Skills-im-Floating-Menu (FEAT-33-08) und Vault-Knowledge-Integration im Lookup (FEAT-33-09) als P0-Differenzierungs-Anker hinzugefügt. Per-Action-Model-Pin (FEAT-33-10) und Find-Action-Items (FEAT-33-11) als P2-Folgewelle
- **Sidebar-Independence (User-Anforderung 2026-06-22):** alle Inline-Actions müssen ohne offene Chat-Sidebar funktionieren. Als kritische ASR + H-06 in BA aufgenommen, als NFR in Section 10.2 und als Cross-FEAT-Constraint in der Definition of Done jedes FEAT. Send-to-Main-Chat öffnet die Sidebar automatisch bei Bedarf

### C.1 Marktrecherche-Referenz

Vollständige Recherche: `_devprocess/analysis/RESEARCH-EPIC-33-inline-ai-competitors-2026-06-22.md` (8 Tools, Multi-Agent-Workflow, adversarial verifiziert). Wichtigste Befunde die in diese BA geflossen sind:

- Output-SOTA Rewrite: Inline-Diff mit Accept/Reject (6/8 Tools)
- Trigger-Standard: Floating-Menu + Hotkey (Konsens), Cmd+K für Edit, Cmd+L für Send-to-Chat
- Settings-Modell-Lager: Notion/ChatGPT/Claude erben global, Cursor/Continue/Obsidian Copilot/Smart Composer haben per-Operation-Override
- Notion AI hat 17 Operationen im Floating-Menu, davon Translate + Summarize universell verbreitet
- Obsidian-Ecosystem-Lücke: kein Plugin kombiniert Settings-Reuse + Vault-Knowledge + Skills-System + Memory-Integration

### D. References

- BACKLOG: `_devprocess/context/BACKLOG.md` (Sektion EPIC-33)
- Branch: `feature/inline-editor-ai-actions` (von `dev` abgezweigt 2026-06-22)
- Verwandte EPICs: EPIC-16 (Backend-Optimierungs-Patterns, kein Überschneidung im Scope), EPIC-30 (Workflow-Builder, separate Surface), EPIC-23 (Cross-Surface AI Workflow, externe Tools)
- Konkurrenz-Patterns: Cursor (Cmd+K Inline-Edit), Continue (Inline-Chat), Notion AI (Slash-Menu auf Selection), Anthropic-Projects (Conversation-Block)
