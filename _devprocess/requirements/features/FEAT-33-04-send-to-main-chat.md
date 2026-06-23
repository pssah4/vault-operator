---
id: FEAT-33-04
title: Send-to-Main-Chat-Action oeffnet Sidebar bei Bedarf
epic: EPIC-33
subtype: user-facing
priority: P0
effort: S
asr-refs: []
adr-refs: []
depends-on: [FEAT-33-01]
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# FEAT-33-04: Send-to-Main-Chat-Action oeffnet Sidebar bei Bedarf

## Feature description

Diese Action nimmt die aktuelle Editor-Selection und uebergibt sie als Vor-Kontext an den Main-Chat der Vault-Operator-Sidebar. Ist die Sidebar geschlossen, oeffnet die Action sie automatisch ueber die Obsidian-Workspace-API und plaziert die Selection als ersten User-Input-Block in einem frisch gestarteten Chat-Thread. Ist sie bereits offen, fuegt die Action die Selection als Initial-Prompt-Inhalt in das Chat-Input-Feld des aktiven Threads ein. Damit entfaellt der manuelle Vier-Schritt-Pfad (Sidebar oeffnen, Modell waehlen, Text kopieren, Prompt formulieren), den die Persona heute pro AI-Interaktion durchlaeuft.

FEAT-33-04 ist das einzige FEAT in EPIC-33, das die Sidebar bewusst oeffnet. Alle anderen Actions (Lookup, Translate, Summarize, Rewrite, Chat-Inline) laufen sidebar-unabhaengig und rendern ihren Output im Editor. Diese Action ist die Bruecke fuer die Flows, in denen der User die volle Chat-Erfahrung mit Multi-Turn, Tool-Calls und History will, ohne die Selection erneut tippen oder pasten zu muessen.

## Benefits hypothesis

Wir glauben, dass eine Ein-Klick-Action "Send to chat", die Editor-Selection als Vor-Kontext in den Main-Chat injiziert und die Sidebar bei Bedarf auto-oeffnet, folgende messbare Outcomes liefert:

- Wegfall von 3 manuellen Schritten pro Send-to-Chat-Flow (Sidebar-Toggle, Copy-Paste, Prompt-Tippen)
- Anstieg der Selection-getriebenen Chat-Sessions im Verhaeltnis zu leeren Chat-Sessions, weil die Eintrittsschwelle sinkt
- Reduktion der Time-to-First-Token im Chat-Use-Case von Selection bis zur Modell-Antwort

Wir wissen, dass wir erfolgreich sind, wenn:

- 90 Prozent der Trigger-Aufrufe enden mit einer im Chat sichtbaren Vor-Kontext-Selection (kein Pasten erforderlich)
- Bei geschlossener Sidebar oeffnet die Action sie in unter 200 ms ohne Layout-Sprung
- Cmd+L als Hotkey-Konsens entspricht der Markt-Erwartung der Persona (Cursor, Continue, Obsidian Copilot)

## Jobs to be Done

| Type | Job statement | Address in story |
|------|---------------|------------------|
| Functional | Wenn ich einen Abschnitt im Editor ausgewaehlt habe und eine Multi-Turn-Konversation mit dem Agent fuehren will, dann moechte ich die Selection mit einer Aktion in den Chat schicken, damit ich nicht copy-pasten und die Sidebar manuell oeffnen muss. | Story 1 |
| Functional | Wenn die Sidebar geschlossen ist, dann moechte ich, dass die Send-to-Chat-Action sie automatisch oeffnet und den Fokus aufs Chat-Input setzt, damit ich direkt weitertippen kann. | Story 2 |
| Emotional | Ich will mich auf den Inhalt konzentrieren und nicht auf den Workspace-Zustand. Die Sidebar darf mein Workflow nicht unterbrechen. | Story 1, Story 2 |
| Social | Ich will Hotkeys nutzen, die der Marktstandard sind (Cmd+L), damit ich nicht zwischen Tools umlernen muss, wenn ich mit anderen Power-Usern an einem Setup arbeite. | Story 3 |

## User stories

### Story 1: Selection als Vor-Kontext in laufenden Chat

**Als** Vault-Operator-Power-User
**moechte ich** eine markierte Editor-Selection per Floating-Menu oder Hotkey in den Main-Chat schicken
**damit** ich eine Multi-Turn-Konversation mit dem Agent starte, ohne den Text manuell zu kopieren oder die Sidebar separat zu oeffnen.

### Story 2: Sidebar oeffnet sich automatisch

**Als** Vault-Operator-Power-User
**moechte ich**, dass die Send-to-Chat-Action die Chat-Sidebar automatisch oeffnet und den Fokus aufs Input-Feld setzt, falls sie geschlossen ist
**damit** ich nicht erst per Tastatur oder Maus die Sidebar einblenden muss, bevor ich den Chat fuehren kann.

### Story 3: Hotkey-Konsens Cmd+L

**Als** Vault-Operator-Power-User mit Cursor- oder Continue-Erfahrung
**moechte ich** den Hotkey Cmd+L (macOS) bzw. Ctrl+L (Windows/Linux) fuer Send-to-Chat verwenden
**damit** ich keinen neuen Shortcut lernen muss und meine Muscle-Memory aus anderen AI-Tools wiederverwenden kann.

## Success criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Selection erscheint nach Trigger als Vor-Kontext im Chat-Input ohne manuelles Pasten | 100 Prozent der Trigger | Manueller Test pro Trigger-Pfad (Menu, Hotkey, Palette) plus Integration-Test |
| SC-02 | Bei geschlossener Sidebar oeffnet die Action sie automatisch und setzt den Fokus aufs Chat-Input | 100 Prozent der Faelle | Manueller Test mit geschlossener und mit offener Sidebar |
| SC-03 | Time-to-Selection-in-Chat-Input von Trigger bis sichtbarem Vor-Kontext bleibt unauffaellig schnell | unter 300 ms am 95. Perzentil | Stoppuhr-Messung in Smoke-Test, log-basiert |
| SC-04 | Trigger-Pfade sind dem Markt-Konsens nachgebildet (Floating-Menu, Cmd+L Hotkey, Command-Palette) | 3 Pfade vorhanden, alle dokumentiert | Activation Path Checkliste in Definition of Done |
| SC-05 | Action verliert keine Selection-Inhalte (Sonderzeichen, Markdown, Umlaute, mehrzeilige Bloecke) | 0 Verluste in Sample-Suite | Test-Suite mit 5 Selection-Samples inkl. Codeblock und Umlaute |

## Technical NFRs

### Performance

- Sidebar-Oeffnungs-Latenz unter 200 ms am 95. Perzentil, gemessen ab Hotkey-Druck bis Workspace-Layout-Re-render.
- Selection-Transfer in Chat-Input unter 50 ms, kein Round-Trip ueber den Agent-Layer noetig.
- Kein zusaetzlicher Tier-Routing-Call zum Trigger-Zeitpunkt. Die Action transportiert nur Text, sie ruft kein Modell.

### Security

- Selection-Inhalt verbleibt lokal bis der User den Chat manuell abschickt. Keine implizite Provider-Anfrage durch die Action selbst.
- Keine Token-Leakage in Logs. Selection wird nicht in `console.debug` ausgegeben.
- Floating-Menu-Eintrag und Command-Palette-Eintrag respektieren Obsidian-Permissions (keine Vault-Modify-Operation).

### Scalability

- Selection-Groesse bis 200 KB ohne Editor-Lag. Bei groesseren Selections (selten) Truncation-Hinweis im Chat-Input mit Hinweis auf `read_file`-Tool.
- Bot-Compliance: kein `fetch`, kein `innerHTML`, kein direkter `element.style`-Mutation, kein `require` ausser Allowlist.

### Availability

- Action ist verfuegbar, sobald das Plugin geladen ist. Kein Provider-Health-Check noetig (kein Modell-Call).
- Bei Workspace-API-Fehler (Sidebar laesst sich nicht oeffnen) faellt die Action auf eine User-Notice zurueck und kopiert die Selection ins Clipboard als Notfall-Pfad.

## Architecture considerations

### Architecturally Significant Requirements

**CRITICAL ASR-01: Sidebar-State-Detection und Auto-Open**
- Warum ASR: Diese Action bricht bewusst die EPIC-33-Cross-Constraint "Sidebar-Independence". Sie ist das einzige FEAT, das die Sidebar oeffnen darf. Falsche Implementierung sabotiert die anderen Actions.
- Impact: Architekt muss den Aufruf-Pfad zur Obsidian-Workspace-API kapseln (z.B. `workspace.revealLeaf` oder `setActiveLeaf` auf den Sidebar-Leaf) und sicherstellen, dass kein anderes FEAT diesen Pfad versehentlich mitverwendet.
- Quality Attribute: Usability, Architectural Integrity.

**CRITICAL ASR-02: Settings-Snapshot zum Trigger-Zeitpunkt**
- Warum ASR: Die Selection wird in den Main-Chat injiziert. Der Chat nutzt seine Main-Chat-Settings (Modell, Skills, Prompts). Die Action darf diese Settings nicht ueberschreiben, da sie nur ein Vor-Kontext-Transport ist.
- Impact: Architekt muss klar trennen zwischen Per-Action-Settings-Pin (FEAT-33-10, gilt fuer Lookup/Translate/Summarize/Rewrite) und FEAT-33-04, das keine Per-Action-Settings hat.
- Quality Attribute: Predictability, Architectural Integrity.

**MODERATE ASR-03: Selection-Transport-Format**
- Warum ASR: Markt-Vorbilder unterscheiden sich. Cursor injiziert die Selection als Context-Chip mit File-Reference. Continue injiziert sie als Quoted-Block mit File-Pfad. Obsidian Copilot fuegt sie als Markdown-Quote ein.
- Impact: Architekt entscheidet ob Context-Chip, Quoted-Block oder Markdown-Quote. Empfehlung: Markdown-Quote mit File-Pfad als Header, weil Chat-Input bereits Markdown rendert und kein zusaetzliches Chip-UI noetig ist.
- Quality Attribute: Consistency mit bestehender Chat-UX.

**MODERATE ASR-04: Neuer Thread vs. laufender Thread**
- Warum ASR: Cursor differenziert Cmd+L (neuer Chat) und Cmd+Shift+L (an laufenden Chat anhaengen). Welle 1 liefert nur den Default-Pfad.
- Impact: Architekt definiert Default-Behavior (Empfehlung: neuer Thread) und reserviert die Erweiterung als zukuenftigen Settings-Toggle (Phase 2, nicht in Welle 1).
- Quality Attribute: Forward-Compatibility.

### Constraints

- Technology: TypeScript strict, Obsidian Plugin API, CodeMirror 6 fuer Selection-Auslese.
- Platform: Obsidian Desktop (Welle 1). Mobile-Verhalten wird in EPIC-27 separat geprueft.
- Compliance: Obsidian Community Plugin Review-Bot Rules (siehe NFR Security).
- Workspace-API: Verwende `workspace.revealLeaf` oder vorhandenen Vault-Operator-Sidebar-Leaf-Helper, kein direktes DOM-Toggling.

### Open questions for architect

- Soll Selection in einen neuen Thread gehen (Default) oder in den aktiven Thread, wenn dieser leer ist? Empfehlung: aktiver Thread, wenn leer; sonst neuer Thread.
- Wie wird Cmd+Shift+L "an laufenden Chat anhaengen" als Phase-2-Erweiterung vorbereitet, ohne in Welle 1 schon Code zu schreiben?
- Soll der Notfall-Pfad "Clipboard als Fallback" eine User-Notice ausgeben oder still sein?
- Wie unterscheidet die UI visuell den injizierten Vor-Kontext vom freien User-Input im Chat-Input? Markdown-Quote-Praefix `>` ist ein Vorschlag.

## Definition of Done

### Activation Path (mandatory)

| Type | Identifier | Where | How |
|------|------------|-------|-----|
| Floating-Menu | Eintrag "Send to chat" | Inline-Floating-Menu ueber Selection (FEAT-33-01) | Click triggert `sendSelectionToMainChat()` |
| Hotkey | Cmd+L (macOS), Ctrl+L (Windows/Linux) | Global im Editor-Kontext | Obsidian-Command registriert mit `hotkeys`-Default; User kann ueberschreiben |
| Command-Palette | "Vault Operator: Send selection to chat" | Obsidian Command-Palette | Sucht Selection im aktiven Editor, triggert gleiche Funktion |

### Functional checklist

- [ ] Floating-Menu zeigt "Send to chat"-Eintrag bei aktiver Selection (Abhaengigkeit zu FEAT-33-01)
- [ ] Hotkey Cmd+L / Ctrl+L registriert und in Obsidian-Hotkey-Settings sichtbar
- [ ] Command-Palette-Eintrag "Vault Operator: Send selection to chat" vorhanden
- [ ] Bei geschlossener Sidebar: Sidebar wird automatisch geoeffnet, Chat-Leaf aktiviert, Fokus auf Input-Feld gesetzt (verifiziert per Manual-Test und Integration-Test)
- [ ] Bei offener Sidebar: Selection wird ins Chat-Input des aktiven Threads injiziert, kein Layout-Sprung
- [ ] Selection landet als Markdown-Quote mit File-Pfad-Header im Chat-Input (Format gemaess Architekt-Entscheidung in ASR-03)
- [ ] Bei Selection-Groesse ueber 200 KB: Truncation-Hinweis im Chat-Input mit Verweis auf `read_file`-Tool
- [ ] Notfall-Pfad: Wenn Workspace-API fehlschlaegt, Selection landet im Clipboard plus User-Notice
- [ ] Settings-Snapshot: Action liest und uebernimmt KEINE Action-spezifischen Settings, der Chat nutzt seine Main-Chat-Settings (ASR-02 verifiziert)

### Quality checklist

- [ ] Unit-Tests fuer Selection-Auslese (5 Samples inkl. Sonderzeichen, Umlaute, Codeblock, mehrzeilig, leere Selection)
- [ ] Integration-Test "Sidebar geschlossen -> Action -> Sidebar offen mit Vor-Kontext"
- [ ] Integration-Test "Sidebar offen -> Action -> Vor-Kontext im Input"
- [ ] Hotkey-Registration-Test
- [ ] Bot-Compliance-Lint clean (kein `fetch`, kein `innerHTML`, kein direkter Style-Mutation, kein `require` ausser Allowlist)
- [ ] tsc clean, ESLint clean
- [ ] Build + Deploy nach jedem Implementierungsschritt erfolgreich
- [ ] Sidebar-Open-Latenz im Smoke-Test unter 200 ms am 95. Perzentil

### Documentation checklist

- [ ] FEAT-Spec aktualisiert (Status: Implemented) inklusive How-It-Works und Key-Files
- [ ] Backlog-Eintrag aktualisiert
- [ ] User-Doku unter docs/guides/ ergaenzt mit Hotkey-Tabelle und Markt-Vergleich
- [ ] Hinweis in arc42 Sektion 8 zur Sonderstellung "einziges FEAT mit Sidebar-Open-Permission"

## Hypothesis validation

Diese FEAT validiert keine direkte BA-Hypothese. Sie deckt das BA-Need N-04 "Selection als Vor-Kontext senden" ab und erfuellt die EPIC-33-Cross-Constraint "Sidebar-Independence" durch bewusste Ausnahme (das einzige FEAT, das die Sidebar oeffnen darf). Telemetrie-Schwelle fuer den Erfolg dieses FEAT: 90 Prozent der Trigger-Aufrufe enden mit einer im Chat sichtbaren Vor-Kontext-Selection, gemessen ueber eine Woche Live-Use.

## Dependencies

- **FEAT-33-01 (Floating-Menu-Trigger):** Liefert die UI-Oberflaeche fuer den Floating-Menu-Trigger-Pfad. Ohne FEAT-33-01 funktionieren nur Hotkey und Command-Palette.

## Assumptions

- Die Vault-Operator-Sidebar exponiert einen Workspace-Leaf-Identifier, ueber den die Action den Sidebar-Zustand pruefen und ihn oeffnen kann.
- Das Chat-Input-Feld der Sidebar akzeptiert programmatisches Setzen des Input-Inhalts ueber eine bestehende API oder ueber eine kleine Helper-Funktion in der Sidebar-View.
- Der aktive Thread im Chat hat ein eindeutiges "Input-Feld leer"-Signal, das die Action zur Entscheidung "neuer Thread vs. injizieren" nutzt.

## Out of scope

- Cmd+Shift+L "an laufenden Chat anhaengen" als zweiter Hotkey-Pfad. Phase 2.
- Multi-Selection-Transport (mehrere disjoint Selections gleichzeitig). Phase 2.
- Selection-Format als Context-Chip mit File-Reference statt Markdown-Quote. Architekt-Entscheidung in ASR-03; Default in Welle 1 ist Markdown-Quote.
- Mobile-Verhalten (EPIC-27 separat).
- Send-to-Subagent oder Send-to-skill-specific-Chat. Welle 1 fokussiert auf Main-Chat.

## Code Pointer

- Sidebar-View: `src/ui/AgentSidebarView.ts` (Chat-Leaf-Lifecycle, Input-Feld-API)
- Workspace-Helper: neue Datei `src/ui/sidebar/openMainChat.ts` (kapselt `workspace.revealLeaf` und Input-Set)
- Floating-Menu-Anschluss: FEAT-33-01 Menu-Registry (Action-Eintrag "Send to chat")
- Hotkey-Registration: `src/main.ts` `addCommand` mit Default-Hotkey Cmd+L / Ctrl+L
- ARCHITECTURE.map Concept-Name: `inline-editor-actions::send-to-main-chat`
