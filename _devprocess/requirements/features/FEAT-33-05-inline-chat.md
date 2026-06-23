---
id: FEAT-33-05
title: Inline-Chat-Action mit persistentem Conversation-Block
epic: EPIC-33
subtype: user-facing
priority: P1
effort: L
asr-refs: [ASR-EPIC-33-03]
adr-refs: []
depends-on: [FEAT-33-01]
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# Feature: Inline-Chat-Action mit persistentem Conversation-Block

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-33-05
> (status, phase, claim, last-change live there).

## Feature description

Der User markiert Text in einer Obsidian-Note und startet eine Konversation direkt an der Selection. Statt in die Sidebar zu wechseln, oeffnet sich ein persistenter Conversation-Block unter der Selection in der Note selbst. Der User stellt eine Frage zur markierten Stelle, der Agent antwortet im Block, der User kann Follow-ups stellen. Nach dem Schliessen bleibt der Block sichtbar als Teil der Note, ist via Memory- und History-Suche vault-weit auffindbar und steht beim erneuten Oeffnen sofort als Multi-Turn-Verlauf bereit.

Die Funktion fuellt Need N-03 aus BA-EPIC-33: Konversation ueber markierten Inhalt, persistent als Block. Sie ist die Innovation im Markt, die kein bekannter Editor-AI-Konkurrent so anbietet (Cursor: Multi-Turn als Floating-Bar ohne Persistenz im Dokument; ChatGPT Canvas: atomare Comment-Bubbles ohne Multi-Turn-Chat). Der persistente Block wird Markdown-konform gespeichert, damit die Note auch ohne Vault Operator lesbar bleibt. Speicher-Strategie und Block-Rendering-Variante (CodeMirror-Widget, Code-Fence mit Sprach-Tag, separate Companion-Datei) sind Architektur-Entscheidung (ASR-EPIC-33-03).

## Benefits hypothesis

**We believe that** ein persistenter, im Note-Text verankerter Conversation-Block fuer Selektion-getriebene AI-Dialoge

**delivers the following measurable outcomes:**

- Power-User starten Dialoge ueber Text-Stellen, ohne den Lesefluss durch Sidebar-Wechsel zu unterbrechen
- Frueher gefuehrte Inline-Konversationen werden beim Wiederaufrufen einer Note ohne erneuten Kontext-Aufbau verfuegbar
- Die Konversation bleibt Teil der Wissensbasis und ist via History-Search auch ausserhalb der Ursprungsnote auffindbar

**We know we are successful when:**

- Mindestens 30 Prozent der getriggerten Inline-Aktionen in der ersten Adoptionsphase sind Inline-Chat-Sessions mit mindestens zwei Turns
- Mehr als 70 Prozent der gestarteten Inline-Chats werden vom User akzeptiert (Block bleibt in der Note erhalten, wird nicht direkt geloescht)
- Wiederaufgerufene Notes mit Inline-Chat-Bloecken zeigen den vollstaendigen Verlauf rekonstruiert beim Oeffnen der Note an

## Jobs to be Done (from BA Section 5.4)

| Job type   | Job                                                                                                              | Addressed in story |
|------------|------------------------------------------------------------------------------------------------------------------|--------------------|
| Functional | An einer Text-Stelle eine Frage stellen und Follow-ups fuehren, ohne aus dem Note-Kontext zu fallen              | Story 1            |
| Emotional  | Eigene Lesefluss-Hoheit behalten, weil die Konversation im sichtbaren Note-Fenster bleibt                        | Story 2            |
| Social     | Inline-Chats als Diskussions-Spuren in geteilten Notes hinterlassen, die andere Vault-Nutzer nachvollziehen      | Story 3            |

## User stories

### Story 1: Konversation an der Stelle starten (Functional Job)

**As a** Power-User mit umfangreicher Vault-basierter Arbeitsweise
**I want to** an einer markierten Text-Stelle eine Konversation starten und Follow-ups innerhalb der Note fuehren
**so that** I can accomplish die Klaerung einer Stelle, ohne den Lese-Kontext zu verlieren oder Antworten manuell in die Note zu kopieren

### Story 2: Block bleibt nach dem Schliessen sichtbar (Emotional Job)

**As a** Power-User
**I want to** die Inline-Konversation als sichtbaren Teil der Note belassen koennen, wenn ich sie schliesse
**so that** I experience die Note als gewachsenes Dokument inklusive der Dialoge, die zur aktuellen Fassung gefuehrt haben

### Story 3: Inline-Chat als nachvollziehbare Diskussions-Spur (Social Job)

**As a** Power-User mit Vault, den ich gelegentlich mit Kollegen teile
**I want to** dass Inline-Konversationen als lesbarer Markdown-Block in der Note erhalten bleiben
**so that** I am perceived als jemand der Entscheidungen transparent dokumentiert, nicht als jemand mit zerstreuten externen Chats

---

## Success criteria (tech-agnostic)

> Keine Technologie-Begriffe in dieser Tabelle. Rendering-Details, Storage-Felder, Latenz-Zahlen stehen in den Technical NFRs unten.

| ID    | Criterion                                                                                                | Target                                            | Measurement |
|-------|----------------------------------------------------------------------------------------------------------|---------------------------------------------------|-------------|
| SC-01 | User kann Inline-Chat an einer beliebigen Selection in einer Markdown-Note starten und eine erste Antwort erhalten | Antwort erscheint innerhalb der Note bei jedem Versuch | Manuelles Acceptance-Skript ueber 20 Test-Selections in 5 verschiedenen Notes |
| SC-02 | User kann Follow-up-Fragen im selben Block stellen und erhaelt Antworten als Teil des Verlaufs           | Multi-Turn-Verlauf bleibt vollstaendig sichtbar bis mindestens 10 Turns | Manuelles Acceptance-Skript mit 10 Follow-up-Schritten |
| SC-03 | Geschlossener Conversation-Block bleibt nach Note-Schliessen und Wiederoeffnen rekonstruiert sichtbar    | Verlauf identisch zum Stand vor dem Schliessen    | Test: Block erstellen, Note schliessen, neu oeffnen, Inhalt vergleichen |
| SC-04 | Frueher gefuehrte Inline-Chats sind via vault-weite History-Suche auffindbar                            | Trefferquote >= 95 Prozent auf 20 Test-Queries fuer bekannte Chat-Inhalte | Test-Suite gegen ein Seed-Set aus 30 Inline-Chats |
| SC-05 | Eine Note mit Inline-Chat-Bloecken bleibt ohne Vault Operator als lesbares Markdown geoeffnet           | Bloecke erscheinen als interpretierbarer Markdown-Text in Roh-Markdown-Anzeige | Manuell: Note in externem Markdown-Viewer oeffnen, Inhalt sichtbar |
| SC-06 | Inline-Chat funktioniert mit geschlossener Chat-Sidebar                                                  | Erfolgsquote 100 Prozent in 10 Testlaeufen mit geschlossener Sidebar | Acceptance-Skript mit explizit geschlossener Sidebar |

---

## Technical NFRs (for the architect): technology terms allowed

### Performance

- Erste Token-Antwort im Block: <= 2000 ms ab Trigger (P95 ueber 30 Test-Calls bei Haiku-Tier-Routing fuer kurze Fragen)
- Block-Render-Update pro Token-Chunk: <= 50 ms im Editor (P95)
- Note-Open mit 5 historischen Inline-Chat-Bloecken: zusaetzliche Render-Last <= 100 ms gegen Baseline ohne Bloecke (P95)
- Speicher-Overhead pro Conversation-Turn im Note-Text: <= 4 KB durchschnittlich (Markdown + Metadaten)

### Security

- Selektions-Inhalt wandert ueber den gleichen Provider-Pfad wie Main-Chat (TaskRouter mit Haiku-Tier fuer kurze Lookup-Fragen, Default-Tier fuer Chat-Dialoge)
- Inline-Chat-Block wird ueber FileManager.trashFile-konformen Schreibpfad in die Note geschrieben (keine Vault.modify-Direktnutzung ohne refreshOpenMarkdownViewsFor)
- Keine Bot-Compliance-Verletzung: kein fetch, kein innerHTML, kein direkter element.style-Set, keine TFile-Assertions, kein require ausserhalb der Allowlist

### Scalability

- Eine Note kann mindestens 50 Inline-Chat-Bloecke mit je bis zu 20 Turns enthalten, ohne dass das Note-File ueber 5 MB Markdown waechst
- History-Search bleibt fuer einen Vault mit 1000 Inline-Chats unter 500 ms P95 fuer Top-10-Recall
- Block-Persistierung im Note-Text plus optionaler Companion-Index in HistoryDB skaliert auf mindestens 10.000 Inline-Chat-Turns vault-weit

### Availability

- Trigger funktioniert offline fuer lokale Modelle (LMStudio, Ollama) ohne Provider-spezifische Pfad-Abhaengigkeit
- Bei Provider-Fehler wird der Block mit lesbarer Fehlermeldung im Verlauf abgeschlossen, Block bleibt persistiert und retrybar
- Note-File-Korruption durch parallele Editor-Mutation und Block-Append wird durch refreshOpenMarkdownViewsFor-Pattern verhindert (FIX-01-07-03)

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR-EPIC-33-03:** Storage-Strategie fuer persistente Conversation-Bloecke

- Why ASR: Die Wahl zwischen drei Varianten ist nicht reversibel ohne User-Datenmigration: (a) Inline-Markdown-Code-Fence mit Sprach-Tag (`vault-operator-chat`) direkt im Note-Text, (b) Note-Frontmatter mit Block-IDs plus Companion-Datei (`<note>.inline-chats.md`), (c) reine HistoryDB-Sub-Conversation mit Note-Reference-Anchor. Variante (a) erfuellt SC-05 trivial, blaeht aber Note-Files; (b) trennt Lesefluss von Volumen, riskiert aber Companion-Drift; (c) entkoppelt vollstaendig, bricht aber Markdown-Portabilitaet. ADR muss eine Variante mit explizitem Trade-off-Argument waehlen.
- Impact: bestimmt Block-Rendering-Pfad (CodeMirror-Inline-Widget vs Live-Preview-Markdown-Renderer vs Companion-File-Reader), History-Indexierungs-Pfad und Migration-Strategie fuer bestehende Inline-Chats falls die Variante spaeter wechselt.
- Quality attribute: Maintainability, Portability, Performance

**MODERATE ASR-EPIC-33-03b:** Sidebar-unabhaengiger AgentTask-Lifecycle

- Why ASR: AgentTask wird heute im Sidebar-Context instanziiert (src/core/AgentTask.ts). Inline-Chat braucht einen AgentTask-Lebenszyklus, der unabhaengig vom Sidebar-View existiert und sterben kann, ohne den Main-Chat-State zu mutieren. ADR muss klaeren, ob ein zweiter AgentTask-Slot eingefuehrt wird oder ob Inline-Chats als Subtasks des Main-AgentTask laufen.
- Impact: betrifft AgentTask-Konstruktor, Settings-Snapshot-Lesepfad (Cross-FEAT-Constraint 2), History-Persistierungs-Routing
- Quality attribute: Maintainability, Reliability

**MODERATE ASR-EPIC-33-03c:** Block-Pruning und Auto-Collapse-Policy

- Why ASR: Ein Inline-Chat kann ohne Pruning eine Note unbegrenzt aufblasen (Risiko aus EPIC-33-Spec). ADR muss Pruning-Schwellen festlegen (Max-Turns pro Block, Auto-Collapse nach n Turns, optionales User-Setting) und ob abgeschnittene Turns in HistoryDB bleiben.
- Impact: betrifft Block-Renderer, Storage-Layout, User-Settings-Schema
- Quality attribute: Performance, Usability

### Constraints

- Technology: Obsidian-Plugin-Runtime, CodeMirror 6 Editor, Markdown-konforme Persistierung Pflicht
- Platform: Desktop-First (Welle 2). Mobile-Companion bleibt out of scope dieses FEAT
- Compliance: Obsidian Community Plugin Review-Bot Rules (siehe Cross-FEAT-Constraint 5)
- Provider-Routing: TaskRouter mit Tier-Klassifizierung, Chat-Dialoge auf Default-Tier, Lookup-Fragen koennen via Tier-Heuristik auf Haiku-Tier fallen

### Open questions for architect

- **Storage-Variante:** Welche der drei Varianten (Inline-Code-Fence, Frontmatter+Companion, History-only) erfuellt SC-03 + SC-05 + Note-Performance am robustesten?
- **AgentTask-Slot:** Eigener Inline-AgentTask oder Subtask-Mechanik aus FEAT-03-05 Multi-Agent? Wie wird der Settings-Snapshot zum Trigger-Zeitpunkt fixiert?
- **Block-Identitaet:** Wie wird ein Block ueber Note-Edits hinweg eindeutig identifizierbar, wenn die Selection-Position sich verschiebt (UUID im Markdown, Anchor-basierte Identifikation, Position-Tracking)?
- **History-Indexierung:** Werden Inline-Chats als eigene Domain in vectors.domain (FEAT-03-27) gefuehrt oder reichen sie in die history-Domain ein? Trifft search_history sie automatisch?
- **Pruning-Policy:** Default-Max-Turns, Default-Auto-Collapse-Schwelle, User-Override-Setting Ja oder Nein?
- **Sidebar-Independence:** Wie wird sichergestellt, dass AgentTask-Lifecycle, Callbacks und Streaming-Renderer ohne Sidebar-View existieren? Welcher Code-Pfad ersetzt den Sidebar-Sink fuer Stream-Chunks?
- **Render-Pfad:** CodeMirror-Inline-Widget oder Markdown-Live-Preview-Renderer? Trade-off zwischen Edit-Mode-Support und Render-Performance
- **Multi-Block pro Note:** Wie verhalten sich zwei parallel laufende Inline-Chats in derselben Note (paralleler Stream, sequenzielle Queue, Block-Lock)?

---

## Definition of Done

### Activation Path (mandatory)

| Field | Value |
|-------|-------|
| Type | Floating Menu + Command Palette + Hotkey |
| Identifier | `vault-operator:inline-chat-start` |
| Where | Floating-Menu-Eintrag "Chat about this" auf aktiver Selection in Markdown-Editor; Command Palette "Vault Operator: Start inline chat on selection"; Hotkey-Default rebindbar (Vorschlag: Cmd/Ctrl+Shift+L analog SOTA-Konsens "Cmd+L fuer Chat") |
| How | User markiert Text -> Trigger ausloesen -> Conversation-Block erscheint direkt unter Selection mit Input-Feld -> User tippt Frage -> Antwort streamt in den Block -> User kann Follow-up tippen oder Block schliessen; geschlossener Block bleibt als Markdown in der Note |

### Functional

- [ ] Alle User Stories implementiert
- [ ] Alle Success Criteria SC-01 bis SC-06 erfuellt (verifiziert)
- [ ] Activation Path funktioniert ueber alle drei Trigger-Varianten (Floating-Menu, Command Palette, Hotkey)
- [ ] Multi-Turn-Dialog mit mindestens 10 Turns laeuft stabil im Block
- [ ] Block ueberlebt Note-Close und Note-Reopen mit vollstaendigem Verlauf
- [ ] **Sidebar-Independence-Check:** Inline-Chat funktioniert mit explizit geschlossener Sidebar (SC-06 verifiziert), Main-Chat-State wird nicht durch Inline-Chat-Turns mutiert
- [ ] Settings-Snapshot zum Trigger-Zeitpunkt wirksam: Modell, Skills, System-Prompt, Provider werden aus Main-Chat-State gelesen und in den AgentTask uebergeben
- [ ] Tier-Routing per Action: Lookup-Fragen koennen via TaskRouter auf Haiku-Tier fallen, Chat-Dialoge bleiben Default-Tier
- [ ] Provider-Fehler erscheint als lesbarer Fehler-Turn im Block, Block bleibt persistiert
- [ ] Note-Edit-Sicherheit: refreshOpenMarkdownViewsFor-Pattern aus FIX-01-07-03 wird verwendet, kein Editor-View-Cache uebermalt vault.modify

### Quality

- [ ] Unit Tests: Block-Parser (Markdown -> Verlauf-Objekt + zurueck), AgentTask-Inline-Slot-Lifecycle, Pruning-Policy
- [ ] Integration Tests: Trigger -> Block-Erscheinen -> Streaming-Antwort -> Follow-up -> Close -> Reopen mit Verlauf
- [ ] Bot-Compliance: ESLint-Bot-Suite green, kein neues `console.log`, kein `fetch`, kein `innerHTML`, kein `element.style.X = Y`, kein `as TFile`/`as TFolder`, kein `require` ausserhalb Allowlist
- [ ] Performance: P95-Latenzen aus Technical NFRs gemessen und im Budget
- [ ] Security: keine neuen H/M-Findings im Folge-Audit AUDIT-EPIC-33
- [ ] Side-Effect-Audit: 5 parallele Inline-Chats in der gleichen Note ohne Note-File-Korruption

### Documentation

- [ ] Backlog row updated auf Status `Done`, Commit-SHA recorded
- [ ] ADR fuer ASR-EPIC-33-03 (Storage-Strategie) akzeptiert und referenziert in adr-refs
- [ ] ARCHITECTURE.map updated fuer neuen Concept `inline-chat`
- [ ] User-Doc unter `docs/guides/` mit Quick-Start fuer Inline-Chat-Trigger und Block-Verhalten
- [ ] MEMORY.md aktualisiert fuer neuen AgentTask-Slot und Storage-Variante

---

## Hypothesis validation (if applicable)

Dieses Feature validiert keine kritische BA-Hypothese direkt. Es adressiert Need N-03 aus BA-EPIC-33 (Konversation ueber markierten Inhalt, persistent als Block) und stuetzt die Gesamt-Hypothese der EPIC-33-Initiative (Inline-AI-Aktionen reduzieren Context-Switch-Kosten). Die Benefits-Hypothese oben dient als Erfolgs-Mass fuer dieses spezifische FEAT.

---

## Dependencies

- **FEAT-33-01 (Floating-Menu + Hotkey-Infrastructure):** liefert den Trigger-Layer fuer alle Inline-Aktionen. FEAT-33-05 registriert sich als Action im gemeinsamen Menu- und Hotkey-Apparat.
- **FEAT-03-20 (History Search):** liefert die HistoryDB plus search_history-Tool, in das Inline-Chat-Turns als suchbare Eintraege fliessen (SC-04).
- **FEAT-03-27 (Tracing-Layer-Trennung in der KnowledgeDB):** liefert vectors.domain als Diskriminator, ueber den die Inline-Chat-Domain sauber von Vault-Notes getrennt indexiert werden kann.

## Assumptions

- AgentTask laesst sich mit moderatem Refactoring sidebar-unabhaengig instanziieren oder ist es bereits (Code-Pruefung in der ARCH-Phase noetig)
- TaskRouter unterstuetzt per-Call-Tier-Override, damit Lookup-Fragen das Haiku-Tier nutzen koennen, ohne die globale Tier-Heuristik zu umgehen
- Obsidian-Live-Preview-Renderer interpretiert eingebettete Markdown-Code-Bloecke mit Custom-Language-Tag konsistent zwischen Edit- und Reading-Mode (Variante a der Storage-Strategie)
- User akzeptiert eine Default-Pruning-Policy mit Auto-Collapse bei 20 Turns ohne explizite Konfiguration in Welle 2

## Out of scope

- Mobile-Companion-Support fuer Inline-Chat: Mobile-Spike in Welle 1/2 der Mobile-Initiative, hier nicht enthalten
- Voice-Input in den Inline-Chat-Block: gehoert zur Mobile-Initiative
- Inline-Chat ueber Bilder, PDF-Inhalte oder Office-Dokument-Selektionen: Welle 3, separates FEAT
- Cross-Note-Inline-Chat (selber Verlauf in mehreren Notes verankert): erst sinnvoll nach Welle 2-Adoption, separates FEAT
- Per-Action-Modell-Pin direkt im Inline-Chat-Block: liegt in FEAT-33-10 (Per-Action-Pin) und greift dort generisch ueber alle Inline-Actions
- Reverse-Migration zwischen Storage-Varianten falls die ADR-Entscheidung spaeter geaendert wird: ADR-spezifische Folgearbeit

---

## Code Pointer (optional, may go stale)

> Der Wayfinder (`src/ARCHITECTURE.map`) ist die Quelle fuer aktuelle Pfade.

ARCHITECTURE.map concepts: `agent-task`, `task-router`, `history-db`, `semantic-index`, `inline-chat` (neu durch dieses FEAT).

Relevante bestehende Sites (Stand 2026-06-22):

- `src/core/AgentTask.ts` -- Lifecycle, der sidebar-unabhaengig laufen muss
- `src/core/utils/refreshMarkdownView.ts` -- Editor-View-Cache-sichere Note-Mutation (FIX-01-07-03)
- `src/services/TaskRouter.ts` -- Tier-Klassifikation fuer Per-Action-Routing
- `src/services/SkillsService.ts` -- Skill-Capability-Filter fuer Settings-Snapshot
- `src/services/MemoryRetriever.ts` und ContextComposer -- Memory-Layer fuer Inline-Chat-Kontext
- HistoryDB + HistoryIndexer (aus FEAT-03-20) -- Indexierungs-Sink fuer Inline-Chat-Turns
