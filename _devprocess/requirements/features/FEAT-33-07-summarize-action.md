---
id: FEAT-33-07
title: Summarize-Action mit Sub-Menu fuer Laenge
epic: EPIC-33
subtype: user-facing
priority: P1
effort: S
asr-refs: []
adr-refs: []
depends-on: [FEAT-33-01]
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# FEAT-33-07: Summarize-Action mit Sub-Menu fuer Laenge

## Feature description

Die Summarize-Action fasst markierten Text im Editor zusammen und zeigt das Ergebnis als Preview-Block direkt unterhalb der Selection. Der User waehlt im Floating-Menu unter "Summarize" eine Ziel-Laenge (Kurz, Mittel, Lang) und entscheidet nach dem Lesen, ob die Zusammenfassung die Selection ersetzt, darunter eingefuegt wird oder verworfen bleibt. Die Selection selbst bleibt waehrend des gesamten Vorgangs unveraendert.

Die Action loest das wiederkehrende Problem, dass Power-User lange Notizen oder externe Texte (zitierte Abschnitte, Rechercheauszuege, Meeting-Notizen) komprimieren wollen, ohne den Editor zu verlassen oder die Chat-Sidebar zu oeffnen. Tier-Routing schickt diese Aufgabe an ein Haiku-Modell, weil Summarization eine klassische Lookup-/Transform-Aufgabe ist, die kein Default-Tier-Modell braucht.

## Benefits hypothesis

We believe Power-User-Wissensarbeiter haben taeglich 3 bis 8 Selections, die sie verdichten wollen, und schicken diese aktuell entweder manuell in die Chat-Sidebar oder kopieren in externe AI-Tools. Eine Inline-Summarize-Action mit Laengenwahl liefert Reduzierung dieser Context-Switches auf null und konsistente Output-Qualitaet ueber drei Granularitaeten. We know we are successful when User in der Telemetrie ueber 60 Prozent ihrer "Summarize"-Trigger ohne Wechsel zur Sidebar abschliessen und die Insert-Quote (Replace plus Insert-below) ueber 70 Prozent liegt.

## Jobs to be Done

| Job-Type | Job Statement | Address-in-Story |
|---|---|---|
| Functional | Wenn ich eine lange Textselektion habe, will ich sie schnell auf eine waehlbare Laenge komprimieren, damit ich den Kern erfasse, ohne den Editor zu verlassen. | US-33-07-01 |
| Functional | Wenn ich eine Summary erhalten habe, will ich entscheiden koennen, ob sie die Original-Selection ersetzt oder darunter steht, damit ich Quelle und Verdichtung im richtigen Verhaeltnis im Dokument halte. | US-33-07-02 |
| Emotional | Wenn ich eine sehr lange Selection markiert habe, will ich vor dem Modell-Call gewarnt werden, damit ich keine unerwarteten Token-Kosten produziere. | US-33-07-03 |

## User stories

- **US-33-07-01 (P1, Power-User):** Als Wissensarbeiter will ich eine markierte Passage ueber Floating-Menu "Summarize" mit Sub-Menu Kurz/Mittel/Lang zusammenfassen lassen, so dass ich eine Preview unter der Selection sehe und nicht in die Sidebar wechseln muss.
- **US-33-07-02 (P1, Power-User):** Als Wissensarbeiter will ich nach Erhalt der Summary die Buttons "Replace selection", "Insert below" und "Discard" haben, so dass ich die Verdichtung kontrolliert ins Dokument bringe oder verwerfe.
- **US-33-07-03 (P2, Power-User):** Als Wissensarbeiter will ich bei sehr langen Selections eine Warnung erhalten, bevor das Modell aufgerufen wird, so dass ich Token-Kosten bewusst akzeptiere oder den Trigger abbreche.

## Success criteria

| ID | Criterion | Target | Measurement |
|---|---|---|---|
| SC-01 | Floating-Menu-Eintrag "Summarize" mit Sub-Menu drei Laengen erscheint bei Selection und triggert die Action ohne Sidebar-Oeffnung. | 100 Prozent der Trigger | Manueller Test plus Telemetrie-Counter sidebar_state_at_trigger=closed |
| SC-02 | Summary erscheint als Preview-Block unterhalb der Selection, Selection bleibt unveraendert bis der User entscheidet. | 100 Prozent der erfolgreichen Calls | Manueller Test, Editor-State-Vergleich vor und nach Preview |
| SC-03 | User entscheidet via drei Optionen ueber den Verbleib der Summary (Replace, Insert below, Discard). | Alle drei Optionen funktional | Manueller Test pro Option, Document-State-Diff |
| SC-04 | Laengen-Sub-Menu liefert spuerbar unterschiedliche Output-Granularitaeten (Kurz: 1-2 Saetze, Mittel: 1 Absatz, Lang: 3-5 Absaetze). | 80 Prozent der Calls treffen die Granularitaet | Stichprobe ueber 20 Calls pro Laenge, manuelle Bewertung |
| SC-05 | Bei Selection-Laenge oberhalb eines konfigurierten Schwellwerts erscheint eine Cost-Warnung vor dem Modell-Call. | 100 Prozent der Trigger oberhalb Schwellwert | Manueller Test mit Test-Selection ueber Schwellwert |

## Technical NFRs

- **Performance:** Time-to-first-token unter 800 ms bei Haiku-Tier-Routing. Vollstaendige Summary unter 4 s bei Selections bis 2000 Zeichen.
- **Tier-Routing:** Summarize wird in TaskRouter als Lookup-Tier klassifiziert und an das Haiku-konfigurierte Modell des aktiven Providers gesendet (Anthropic Haiku, OpenAI gpt-4o-mini, Bedrock claude-haiku-* oder Provider-Default fuer Lookup-Tier).
- **Token-Budget:** Maximal die Selection plus 200 Tokens System-Prompt-Overhead. Output-max-tokens dynamisch je Laenge (Kurz: 200, Mittel: 600, Lang: 1500).
- **Cost-Schutz:** Selections oberhalb defaultSummaryWarnThreshold (Default 5000 Zeichen) loesen einen Confirm-Dialog aus, der die geschaetzten Input-Tokens und die gewaehlte Output-Bandbreite zeigt.
- **Settings:** Neuer Setting-Eintrag defaultSummaryLength (Werte kurz, mittel, lang, Default mittel) plus defaultSummaryWarnThreshold (Default 5000). Die Sub-Menu-Auswahl ueberschreibt den Default fuer den aktuellen Trigger.
- **Bot-Compliance:** Kein fetch, kein innerHTML, kein direkter Style-Mutation. Preview-Block ueber CodeMirror-Decoration plus CSS-Klassen (agent-summary-preview).

## Architecture considerations

**ASRs:**

| ID | ASR | Why-ASR | Impact | Quality-Attribute |
|---|---|---|---|---|
| ASR-MOD-01 | Preview-Renderpfad sidebar-unabhaengig | Cross-FEAT-Constraint 3 verlangt Editor-Output-Pfad ohne Sidebar-Abhaengigkeit. Preview muss als Inline-Widget am Selection-Ende sitzen, nicht in einer Hover-Card oder im Sidebar-Panel. | Architektur des Preview-Widgets bestimmt Wiederverwendbarkeit fuer andere Actions (Translate, Lookup). | Modifiability, Usability |
| ASR-MOD-02 | Tier-Klassifikation via TaskRouter | Cross-FEAT-Constraint 4 verlangt Haiku-Routing fuer Summarize. TaskRouter muss eine stabile Lookup-Tier-Klassifikation fuer "summarize"-Intent kennen. | Aenderung am TaskRouter-Mapping wirkt auf alle Lookup-Actions. | Cost-Effectiveness, Performance |

**SOTA-Kontext:** Notion AI bietet Summarize als Slash-Command mit drei Granularitaeten, Obsidian Copilot hat Summarize als Built-in mit fester Laenge, Smart Composer und ChatGPT Canvas via Ask-Pattern. Markt-Verbreitung 6 von 8 untersuchten Tools. Tool-Parity-Erwartung fuer GA-Release.

**Constraints:**

- Selection bleibt waehrend des gesamten Vorgangs unveraendert (kein optimistic replace).
- Preview-Block muss visuell vom Selection-Block unterscheidbar sein (eigene CSS-Klasse, dezenter Rahmen).
- Sub-Menu-Aufruf erfolgt direkt nach Klick auf "Summarize" im Floating-Menu (kein zweiter Trigger noetig).

**Open questions for architect:**

- Soll der Preview-Block per Escape oder Klick ausserhalb automatisch verworfen werden, oder bleibt er bis zur expliziten Entscheidung sichtbar?
- Wie verhaelt sich die Preview, wenn der User waehrend des Streaming an anderer Stelle im Dokument tippt? (Sperrung der Selection-Position vs. Mitziehen)
- Soll die Cost-Warnung pro Session per "Nicht mehr fragen" deaktivierbar sein?

## Definition of Done

**Activation Path (mandatory):**

| Field | Value |
|---|---|
| Type | Floating-Menu plus Command-Palette |
| Identifier | Floating-Menu-Eintrag "Summarize" (Sub-Menu Kurz/Mittel/Lang), Command-ID `vault-operator:summarize-selection` |
| Where | Auf jeder Selection im Markdown-Editor (Edit-Mode und Source-Mode) |
| How | Selection markieren -> Floating-Menu erscheint (aus FEAT-33-01) -> "Summarize" anklicken -> Sub-Menu oeffnet sich -> Laenge waehlen -> Preview-Block erscheint unter Selection mit drei Buttons "Replace selection", "Insert below", "Discard". Alternativ ueber Command-Palette "Vault Operator: Summarize selection" (nutzt defaultSummaryLength). |

**Functional checklist:**

- [ ] Floating-Menu-Eintrag "Summarize" mit Sub-Menu drei Laengen implementiert
- [ ] Command-Palette-Eintrag "Vault Operator: Summarize selection" implementiert
- [ ] Preview-Block als CodeMirror-Decoration unter Selection
- [ ] Buttons "Replace selection", "Insert below", "Discard" funktional
- [ ] Tier-Routing via TaskRouter auf Haiku-Lookup-Tier
- [ ] Output-max-tokens dynamisch je Laenge gesetzt
- [ ] Cost-Warnung bei Selection ueber defaultSummaryWarnThreshold
- [ ] Settings-Eintraege defaultSummaryLength und defaultSummaryWarnThreshold

**Quality checklist:**

- [ ] **Sidebar-Independence-Check:** Action funktioniert mit geschlossener Chat-Sidebar. Preview, Buttons und Cost-Warnung erscheinen ohne Sidebar-Oeffnung. Manueller Test mit explizit geschlossener Sidebar dokumentiert.
- [ ] Bot-Compliance: kein fetch, kein innerHTML, kein direkter Style-Mutation, Preview-Klasse ueber CSS
- [ ] Streaming-Token-Output im Preview-Block sichtbar (Time-to-first-token <800 ms)
- [ ] Selection bleibt waehrend des gesamten Vorgangs unveraendert
- [ ] Settings-Snapshot zum Trigger-Zeitpunkt: aktives Modell und Tier-Mapping aus Main-Chat-State

**Documentation checklist:**

- [ ] Settings-Doku in docs/reference/settings.md aktualisiert (defaultSummaryLength, defaultSummaryWarnThreshold)
- [ ] User-Guide-Eintrag in docs/guides/inline-actions.md mit Screenshot
- [ ] Backlog-Update FEAT-33-07 auf Done

## Hypothesis validation

Keine direkte BA-Hypothese. Cross-Constraint-Validierung ueber Telemetrie aus EPIC-33: sidebar_state_at_trigger=closed bei ueber 60 Prozent der Summarize-Trigger, Insert-Quote (Replace plus Insert-below) ueber 70 Prozent der erfolgreichen Calls.

## Dependencies

- FEAT-33-01 (Floating-Menu-Infrastruktur, liefert den Eintrags-Slot inklusive Sub-Menu-Mechanik)
- TaskRouter mit Lookup-Tier-Mapping fuer "summarize"-Intent (bestehend, ggf. Mapping-Eintrag ergaenzen)
- Aktiver Provider mit konfiguriertem Haiku-Tier-Modell

## Assumptions

- User akzeptieren das Notion-Pattern (Preview unter Selection plus Insert-Buttons) ohne Erklaerung, weil sie es aus FEAT-33-02 (Lookup) bereits kennen.
- Drei Laengenstufen reichen fuer 80 Prozent der Anwendungsfaelle. Custom-Laenge wird nicht angeboten.
- Cost-Warnung ueber 5000 Zeichen wird als sinnvoller Default akzeptiert, ohne dass User die Schwelle haeufig aendern.

## Out of scope

- Multi-Selection-Summarize (nur eine zusammenhaengende Selection pro Trigger)
- Summarize ueber mehrere Notizen hinweg (das ist FEAT-33-04 Send-to-Main-Chat-Pfad)
- Per-Action-Pin fuer Modell oder Skill (Cross-FEAT-Constraint 2, abgebildet in FEAT-33-10)
- Custom-Length-Prompt (User-definierte Wortzahl)
- History der erzeugten Summaries (Chat-History-Pfad, nicht Inline-Pfad)
- Re-Summarize auf bereits eingefuegte Summary (im aktuellen Scope kein Sonderfall, Selection bleibt Selection)

## Code Pointer

ARCHITECTURE.map concept name: `inline-action-summarize`. Beruehrt voraussichtlich `src/ui/inline-actions/` (neu), `src/services/TaskRouter.ts` (Lookup-Tier-Mapping), `src/core/utils/refreshMarkdownView.ts` (Editor-Mutation nach Replace/Insert), Settings-Schema in `src/settings.ts`.
