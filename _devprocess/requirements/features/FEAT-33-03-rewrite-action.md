---
id: FEAT-33-03
title: Rewrite-Action mit Inline-Diff und Per-Hunk Accept/Reject
epic: EPIC-33
subtype: user-facing
priority: P0
effort: L
asr-refs: [ASR-EPIC-33-02]
adr-refs: []
depends-on: [FEAT-33-01]
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# FEAT-33-03: Rewrite-Action mit Inline-Diff und Per-Hunk Accept/Reject

## Feature description

Die Rewrite-Action schreibt einen markierten Absatz auf Basis einer User-Instruktion oder eines Default-Prompts neu und zeigt das Ergebnis als Inline-Diff direkt im CodeMirror-Editor an. Roter Marker fuer entfernten Text, gruener Marker fuer neuen Text, Per-Hunk Accept/Reject-Buttons inline. Der Stream rendert die Diff-Hunks live, waehrend Tokens reinkommen, sodass der Nutzer das Original und die Aenderung gleichzeitig im Blick behaelt.

Der Job dahinter: Der Nutzer markiert einen Absatz, will ihn umformulieren, sieht aber das Original noch und entscheidet pro Hunk, was uebernommen wird. Heute kostet das vier Context-Switches (Selection -> Sidebar -> Antwort lesen -> Copy zurueck). Die Inline-Variante hebt das auf einen Hotkey oder Floating-Menu-Klick.

## Benefits hypothesis

Wir glauben, dass eine Inline-Diff-Rewrite-Action mit Per-Hunk Accept/Reject
- die Zeit pro Rewrite von durchschnittlich 35 Sekunden (Sidebar-Roundtrip) auf unter 8 Sekunden senkt (Markup -> Trigger -> Diff -> Accept),
- die Akzeptanzrate von AI-Rewrites erhoeht, weil der Nutzer Original und Vorschlag nebeneinander sieht und granular entscheidet,
- die Anzahl der manuellen Copy/Paste-Korrekturen nach Rewrite auf nahezu null reduziert.

Wir wissen, dass wir erfolgreich sind, wenn
- die mediane Time-to-Accepted-Rewrite unter 8 Sekunden liegt,
- mindestens 70 Prozent der getriggerten Rewrites pro Hunk akzeptiert werden (statt komplettes Verwerfen),
- weniger als 5 Prozent der Rewrites mit "Reject all" enden.

## Jobs to be Done

Aus BA Section 5.4, Need N-02 (Absatz ueberarbeiten, Original im Blick, Diff vor Accept).

| Job-Type | Job | Address-in-Story |
|---|---|---|
| Functional | Markierten Absatz umformulieren und vor Uebernahme pruefen | Story 1 |
| Functional | Granular entscheiden, welche Teile der Aenderung uebernommen werden | Story 2 |
| Emotional | Kontrolle behalten, keine Black-Box-Ueberschreibung erleben | Story 1 |
| Emotional | Vertrauen in AI-Vorschlaege durch sichtbares Original aufbauen | Story 1 |
| Social | Eigene Stimme im Text bewahren, Rewrite als Hilfe, nicht als Ersatz | Story 2 |

## User stories

### Story 1: Absatz schnell umformulieren

Als Knowledge Worker mit markiertem Absatz
moechte ich per Hotkey oder Floating-Menu eine Rewrite-Action triggern, einen Freitext-Prompt eingeben und die Aenderung als Inline-Diff sehen,
sodass ich Original und Vorschlag direkt vergleichen kann, ohne in die Sidebar zu wechseln.

### Story 2: Granular akzeptieren

Als Power-User mit einem mehrteiligen Rewrite-Vorschlag
moechte ich pro Hunk separat Accept oder Reject klicken (oder per Hotkey Cmd+Opt+Y/N navigieren),
sodass ich die guten Teile uebernehme und stilistische Eigenheiten meiner Stimme behalte.

### Story 3: Direct-Rewrite ohne Prompt

Als Vielnutzer fuer Standard-Rewrites
moechte ich die Action mit einem Default-Prompt ("Improve this passage") ohne Freitext-Eingabe direkt ausloesen,
sodass ich einen schnellen Cleanup-Pass mache, wenn ich keine spezifische Anweisung habe.

---

## Success criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Markierter Absatz wird auf Trigger hin als Inline-Diff im Editor dargestellt, ohne dass Original verschwindet | 100 Prozent der Trigger zeigen Diff inline | Manuelle Stichprobe an 20 Rewrites pro Release |
| SC-02 | Nutzer kann pro Hunk Accept oder Reject entscheiden, ohne den gesamten Vorschlag komplett anzunehmen oder verwerfen zu muessen | Hunk-Granularitaet ab 2 Hunks pro Rewrite verfuegbar | Akzeptanz-Telemetrie Hunk-Level vs. Bulk |
| SC-03 | Diff-State bleibt konsistent, wenn der Nutzer waehrend Streaming abbricht, das Fenster wechselt oder die Datei schliesst | Keine sichtbaren Diff-Artefakte nach Cancel/Switch | Manuelle Smoke-Tests fuer alle drei Abbruch-Szenarien |
| SC-04 | Rewrite-Vorgang fuehlt sich live an, der Vorschlag erscheint schrittweise und nicht erst nach voller Antwort | Wahrgenommene Latenz Token-zu-Render unter 100 Millisekunden | Wahrnehmungstest plus technische Messung |
| SC-05 | Action funktioniert mit geschlossener Chat-Sidebar | Trigger und Diff-Render unabhaengig vom Sidebar-State | Smoke-Test mit geschlossener Sidebar in Definition of Done |

---

## Technical NFRs

### Performance
- Latenz vom Empfang eines Stream-Tokens bis zum Render im Editor: unter 100 Millisekunden im 95. Perzentil.
- Time-to-First-Diff-Hunk: unter 1.5 Sekunden ab Trigger bei Default-Tier-Modell.
- Diff-Berechnung pro Hunk: unter 50 Millisekunden bei Absaetzen bis 2000 Zeichen.

### Security
- Freitext-Prompt wird nicht als Markdown ausgefuehrt, sondern als Plain-Text an den Provider geschickt.
- Kein Persistieren des Stream-Buffers ausserhalb der Editor-Session; bei Cancel werden Buffer und Decorations sofort GC-faehig.

### Scalability
- Rewrite-Selection bis 8000 Zeichen, daueber Warnhinweis im Floating-Menu (Selection zu lang, in Sidebar verschieben).
- Maximal ein aktiver Rewrite-Stream pro Editor-View; Re-Trigger waehrend laufendem Stream cancelt den alten und startet neu.

### Availability
- Provider-Fehler (Rate-Limit, Network) zeigt sich als Inline-Toast plus Editor-State-Rollback, nicht als zerschossener Diff-State.
- Bei Plugin-Reload waehrend Stream wird der Diff verworfen, das Original bleibt unveraendert.

### Tier-Routing
- Default-Tier (nicht Haiku-Downgrade). Rewrite-Qualitaet ist kritisch, TaskRouter klassifiziert Rewrite als Rewrite-Tier und routet zum Default-Modell aus Settings-Snapshot (FEAT-33-01).

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR-EPIC-33-02: CodeMirror-6 Diff-Renderer**
- Why ASR: Inline-Diff im CodeMirror-Editor ist die Kern-Output-Modalitaet, nicht ein Side-Channel. Falsche Wahl der Decoration-API blockiert Streaming, Per-Hunk-Buttons und konsistentes Cleanup.
- Impact: Bestimmt, ob Diff-Hunks als CodeMirror-Decorations, als Inline-Widgets oder als Editor-Overlay implementiert werden. Beeinflusst Vorbild-Pflege aus refreshOpenMarkdownViewsFor (FIX-01-07-03) fuer State-Cleanup.
- Quality Attribute: Performance plus Usability plus Maintainability.

**CRITICAL ASR-EPIC-33-RW-01: Streaming-Diff State-Maschine**
- Why ASR: Der Diff muss waehrend Stream-Ankunft hunk-weise wachsen und gleichzeitig per Cancel sauber abgeraeumt werden. Eine naive Implementierung wuerde bei Cancel Diff-Artefakte hinterlassen oder Per-Hunk-Buttons in inkonsistenten Zustand bringen.
- Impact: Erfordert eine explizite State-Maschine mit Phasen (idle, streaming, complete, cancelled, error) und atomarem Cleanup-Pfad. Vorbild ist die refreshOpenMarkdownViewsFor-Mechanik aus FIX-01-07-03.
- Quality Attribute: Reliability plus Maintainability.

**MODERATE ASR-EPIC-33-RW-02: Per-Hunk Accept/Reject Persistenz im Editor-Buffer**
- Why ASR: Accept eines Hunks muss den Editor-Buffer atomar so aendern, dass Vault-File und Diff-State konsistent bleiben. Bei Multi-Hunk-Diff darf Accept von Hunk 2 die Positionen von Hunk 1 und 3 nicht verschieben (oder muss korrekt re-mappen).
- Impact: Bestimmt, ob Hunks als ChangeSet vorberechnet werden (mit Re-Mapping bei jedem Accept) oder ob jeder Hunk seinen eigenen kleinen ChangeSet bekommt.
- Quality Attribute: Reliability.

### Constraints
- Bot-Compliance: Keine Style-Mutation direkt am Element, sondern CSS-Klassen oder style.setProperty. Kein innerHTML; Decorations und Widgets via CodeMirror-API.
- Sidebar-Independence: Rewrite muss komplett ohne offenen Chat-Sidebar funktionieren (siehe Cross-FEAT-Constraint 1 in EPIC-33).
- Settings-Snapshot zum Trigger-Zeitpunkt: Modell-Wahl, Skills-Aktivitaet, Custom-Prompts werden aus Main-Chat-State (Snapshot via FEAT-33-01) gelesen. Optional Per-Action-Pin aus FEAT-33-10 ueberschreibt.

### Open Questions fuer Architekt
- CodeMirror-Decoration vs. Widget vs. Overlay als primaere Diff-Render-Strategie? Empfehlung aus InlineAI-Plugin-Quelltext pruefen.
- Wo wird der Stream-Buffer gehalten (View-State, Plugin-Service, Editor-State-Field)? Welche Variante ueberlebt Editor-Re-Render, welche nicht?
- Per-Hunk-ChangeSet-Re-Mapping vs. einmalige ChangeSet-Berechnung beim Accept-All? Welche Variante skaliert auf 5+ Hunks?
- Hotkey-Konflikte: Cmd+Return, Cmd+Backspace, Cmd+Opt+Y/N gegen bestehende Obsidian-Hotkeys pruefen.

---

## Definition of Done

### Activation Path (mandatory)

| Attribut | Wert |
|---|---|
| Type | Floating-Menu-Eintrag plus Hotkey |
| Identifier | Floating-Menu-Eintrag "Rewrite"; Hotkey-Variante konfigurierbar in Obsidian-Hotkeys-Settings unter "Vault Operator: Rewrite Selection" |
| Where | Editor-Floating-Menu auf jeder Markdown-Selection; Hotkey global im Markdown-Editor |
| How | Selection setzen, Floating-Menu erscheint -> "Rewrite" klicken, optional Freitext-Prompt eingeben, Enter; alternativ Hotkey -> Default-Prompt "Improve this passage"; Stream startet, Diff-Hunks erscheinen inline; Accept/Reject pro Hunk via Inline-Button oder Cmd+Opt+Y/N; Accept-all via Cmd+Return, Reject-all via Cmd+Backspace |

### Functional checklist

- [ ] Floating-Menu-Eintrag "Rewrite" erscheint auf jeder Markdown-Selection.
- [ ] Hotkey-Befehl "Vault Operator: Rewrite Selection" ist in Obsidian-Hotkeys konfigurierbar.
- [ ] Freitext-Prompt-Modal erlaubt Eingabe oder direkten Default-Prompt (Enter ohne Eingabe).
- [ ] Inline-Diff rendert im Editor mit roten (removed) und gruenen (added) Markern.
- [ ] Per-Hunk Accept-Button uebernimmt nur den jeweiligen Hunk in den Vault-File-Buffer.
- [ ] Per-Hunk Reject-Button verwirft den jeweiligen Hunk, Original-Text bleibt stehen.
- [ ] Cmd+Return akzeptiert alle Hunks, Cmd+Backspace verwirft alle Hunks.
- [ ] Cmd+Opt+Y / Cmd+Opt+N akzeptieren bzw. verwerfen den jeweils naechsten Hunk.
- [ ] Stream zeigt Diff-Hunks live, nicht erst nach voller Antwort.
- [ ] Cancel waehrend Stream (Escape) raeumt Diff-State sauber ab, Original bleibt unveraendert.

### Quality checklist

- [ ] Sidebar-Independence verifiziert: Rewrite funktioniert vollstaendig mit geschlossener Chat-Sidebar (Smoke-Test in DoD dokumentiert).
- [ ] State-Cleanup bei Stream-Cancel, Page-Switch, File-Close: keine Diff-Artefakte (Vorbild refreshOpenMarkdownViewsFor aus FIX-01-07-03).
- [ ] Latenz Token-zu-Render: gemessen unter 100 Millisekunden im 95. Perzentil.
- [ ] TaskRouter-Tier-Routing: Default-Tier, kein Haiku-Downgrade (Code-Test in TaskRouter-Tier-Mapping).
- [ ] Bot-Compliance: Kein innerHTML, keine direkte Style-Mutation am Element, kein fetch, CSS-Klassen ueber Stylesheet.
- [ ] Unit-Tests fuer Diff-State-Maschine (idle/streaming/complete/cancelled/error).
- [ ] Unit-Tests fuer Per-Hunk-Accept mit Re-Mapping bei Multi-Hunk-Diffs.
- [ ] Integration-Test mit gemocktem Provider-Stream und CodeMirror-Editor.

### Documentation checklist

- [ ] Feature-Spec aktualisiert (Status: Implemented).
- [ ] Backlog aktualisiert (FEAT-33-03 von Planned -> Done).
- [ ] User-facing Doc-Seite (docs/guides/inline-rewrite.md) mit Hotkey-Tabelle.
- [ ] arc42 Section 8 (Concepts): Inline-Diff-Renderer als neues Konzept eingetragen.

---

## Hypothesis validation

Validiert H-02 (CodeMirror-6 Inline-Diff Tech-Feasible) aus EPIC-33-BA. Beweis durch lauffaehige Implementierung mit Streaming-Diff plus Per-Hunk-Accept/Reject und gemessener Latenz unter 100 Millisekunden Token-zu-Render. Falsifikation, wenn CodeMirror-Decoration-API kein Streaming-Diff erlaubt oder Per-Hunk-Buttons im Editor-Buffer Positions-Konsistenz brechen.

---

## Dependencies

- **FEAT-33-01 (Floating-Menu plus Settings-Snapshot):** Liefert Trigger-Layer und Modell-/Provider-Snapshot zum Trigger-Zeitpunkt. Blockiert FEAT-33-03 bis Floating-Menu plus Snapshot stehen.

## Assumptions

- CodeMirror-6 Decoration- und Widget-API erlauben Streaming-Diff mit akzeptabler Latenz (Annahme aus InlineAI-Plugin-Vorbild, in Spike zu bestaetigen).
- Default-Tier-Modell aus Settings-Snapshot reicht qualitativ fuer Rewrite-Tasks (kein dediziertes Rewrite-Modell noetig).
- Selection ist immer ein zusammenhaengender Textbereich, keine Multi-Selection (Obsidian-Editor-Default).

## Out of scope

- Per-Action-Pin fuer Modell-Override (siehe FEAT-33-10).
- Send-to-Main-Chat als Fallback fuer lange Selections (siehe FEAT-33-04).
- Rewrite-History oder Undo ueber Editor-Buffer-History hinaus (Cmd+Z deckt es ab).
- Rewrite auf mehrere Selections gleichzeitig.
- Custom-Skill-Auswahl pro Rewrite (Snapshot uebernimmt Sidebar-State, siehe FEAT-33-01).

---

## Code Pointer

- Editor-State-Cleanup-Vorbild: `src/core/utils/refreshMarkdownView.ts` (FIX-01-07-03).
- TaskRouter-Tier-Mapping: `src/services/TaskRouter.ts`.
- Settings-Snapshot-Konsument: FEAT-33-01 Snapshot-Service (Pfad in FEAT-33-01 definiert).
- ARCHITECTURE.map concept: `inline-rewrite-diff-renderer` (neu anzulegen).
