---
id: FEAT-33-11
title: Find-Action-Items-Action (Tasks aus Selection extrahieren)
epic: EPIC-33
subtype: user-facing
priority: P2
effort: S
asr-refs: []
adr-refs: []
depends-on: [FEAT-33-01]
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# FEAT-33-11: Find-Action-Items-Action (Tasks aus Selection extrahieren)

## Feature description

Der User markiert einen Block (Meeting-Notes, Brainstorm-Notiz, Source-Highlight, Recherche-Auszug) und ruft die Action "Find action items" auf. Das Modell liest die Selection, extrahiert implizite und explizite TODOs und liefert eine Markdown-Checklist im Format `- [ ] item`. Die Liste erscheint in einem Preview-Block unterhalb der Selection mit einem "Insert below"-Button, der die Checklist als neuen Block in der aktiven Note einfuegt. Der Originaltext bleibt unveraendert.

Der Anwendungsfall trifft drei wiederkehrende Situationen im VO-Vault: lange Meeting-Mitschriften ohne saubere Task-Trennung, Brainstorm-Bloecke in denen "wir muessten noch X" steht, und Recherche-Highlights mit impliziten Follow-up-Schritten. Bisher fordert die Tasks-Extraktion einen manuellen Chat-Wechsel plus copy-paste. Die Inline-Action verkuerzt den Pfad auf zwei Klicks (Selection plus Menu-Eintrag).

Realisierungs-Ebene wird in der Architektur-Phase entschieden. Zwei Pfade stehen zur Wahl: (A) eigenes Action-Modul mit dediziertem Prompt-Template, registriert in der Floating-Menu-Registry aus FEAT-33-01; (B) als Skill "extract-action-items" mit Capability `inline-action-eligible`, sichtbar gemacht durch FEAT-33-08. Bei Variante B ist FEAT-33-11 als Anforderungs-Anker erfuellt sobald der Skill in der Library liegt und im Floating-Menu auftaucht. Diese Spec ist Realisierungs-neutral und beschreibt nur das Outcome.

## Benefits hypothesis

We believe that ein dedizierter Floating-Menu-Eintrag fuer Task-Extraktion aus markierten Bloecken
delivers messbare Zeitersparnis bei Meeting-Notes-Nachbereitung und einen niedrigeren mentalen Aufwand beim Vault-Cleanup
for Power-User-Wissensarbeiter mit hohem Aufkommen an unstrukturierten Notiz-Bloecken.
We will know we are successful when mindestens 30 Prozent der aktiven Inline-Action-Nutzer die Action "Find action items" im ersten Monat nach Release mindestens einmal aufrufen und die Insert-Quote ueber alle Aufrufe ueber 60 Prozent liegt.

## Jobs to be Done

Aus BA-EPIC-33 Section 5.4, gefiltert auf den Task-Extraction-Kontext.

| Job-Typ | Job |
|---------|-----|
| Functional | Wenn ich einen Meeting-Block markiere, will ich daraus eine saubere Checklist erzeugen, ohne die Notiz mental nochmal durchzulesen, damit ich Follow-ups nicht vergesse |
| Functional | Wenn ich einen Brainstorm-Block markiere, will ich implizite "wir muessten"-Stellen als TODOs sichtbar machen, damit ich am Ende des Tages eine konkrete Action-Liste habe |
| Emotional | Wenn ich Notizen aufraeume, will ich das Gefuehl haben, dass nichts unter den Tisch faellt, damit ich die Notiz mit ruhigem Kopf schliessen kann |
| Social | Wenn ich Meeting-Notes mit Kollegen teile, will ich eine klare Task-Liste am Ende haben, damit das Team sofort weiss wer was uebernimmt |

Address-in-Story: US-1 deckt Functional-1 und Functional-2 ab, US-2 deckt Emotional, US-3 deckt Social.

## User stories

- **US-1 (Functional, P2):** Als Wissensarbeiter mit Meeting-Notes will ich einen markierten Block per Inline-Action in eine Markdown-Checklist umwandeln, so dass implizite und explizite Tasks als `- [ ]`-Items unter dem Originalblock erscheinen.
- **US-2 (Emotional, P2):** Als Power-User will ich die extrahierte Liste in einer Preview vor dem Einfuegen sehen koennen, so dass ich Falsch-Extraktionen verwerfen kann ohne die Note zu beruehren.
- **US-3 (Social, P2):** Als Team-Member will ich die generierte Checklist mit einem Klick unter den Originalblock einfuegen, so dass die Notiz teilbar wird ohne dass ich das Markdown von Hand baue.

## Success criteria

Tech-agnostisch. Latenz-Konkretisierung steht in den Technical NFRs.

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Action erscheint im Floating-Menu, wenn eine Selection ueber mindestens einer Zeile aktiv ist | 100 Prozent der Aufrufe mit gueltiger Selection zeigen den Eintrag | Manueller Smoke-Test mit fuenf Selection-Varianten plus automatisierter UI-Test in der Test-Suite |
| SC-02 | Extrahierte Liste verwendet ausschliesslich das Markdown-Format `- [ ] item` ohne Nummerierung, Bullets oder freien Prosa-Anteil | 100 Prozent der Outputs validieren gegen Regex `^- \[ \] .+$` pro Zeile | Output-Validator im Smoke-Test plus Schema-Check im Unit-Test mit zehn Beispiel-Selections |
| SC-03 | Preview-Block zeigt das Ergebnis vor dem Einfuegen mit sichtbarem Insert-Button und Reject-Mechanik | Preview ist Pflichtschritt, kein direkter Append ohne Bestaetigung | Manueller Test, UI-Test mit Reject-Pfad, plus Beleg in DoD |
| SC-04 | Insert-Button fuegt die Liste als neuen Markdown-Block unter den Originalblock ein, ohne den Originaltext zu mutieren | Originalblock bleibt byte-identisch | Diff-Test pre/post-Insert auf einer Test-Note mit zehn Selection-Szenarien |
| SC-05 | Action funktioniert bei geschlossener Chat-Sidebar | 100 Prozent der Aufrufe mit Sidebar `closed` liefern denselben Output wie mit Sidebar `open` | Headless-Test mit beiden Sidebar-States plus manueller Smoke-Test |

## Technical NFRs

| Kategorie | Ziel | Notizen |
|-----------|------|---------|
| Performance | First-Token unter 1500 ms bei Selections bis 500 Woerter; Full-Response unter 8000 ms bei bis zu 2000 Woertern | Lookup-aehnliches Profil. TaskRouter routet auf Haiku-Tier (Cost-aware Tier-Routing per Action, EPIC-Constraint 4) |
| Token-Budget | Output limitiert auf 1500 Tokens; Truncation bei Ueberschreitung mit kompakter Fehlermeldung im Preview | Lange Brainstorm-Bloecke (3000+ Woerter) werden in Selection-Vorverarbeitung auf 8000 Zeichen gekappt mit Hinweis im Preview |
| Tier-Routing | Default Haiku-Tier via TaskRouter mit Klassifikation `extract` | Bei Per-Action-Pin aus FEAT-33-10 ueberschreibt das gepinnte Modell |
| Security | Selection-Inhalt geht durch denselben Prompt-Injection-Filter wie andere Inline-Actions; Tool-Calls werden in dieser Action unterdrueckt (read-only-Modus) | Konsistent mit EPIC-33 H-01 Mitigation |
| Output-Validation | Generierte Liste wird per Regex gegen `^- \[ \] .+$` validiert; ungueltige Zeilen werden im Preview als "non-task line: skipped" markiert | Verhindert Prosa-Drift im finalen Insert |
| Bot-Compliance | Insert via Obsidian-Editor-API (CodeMirror-Transaction); kein innerHTML, kein direkter Style-Mutation; Preview-Widget via `createEl`/`createDiv` | EPIC-Constraint 5 |
| Sidebar-Independence | Action und Preview-Renderpfad sind editor-lokal; AgentTask oder leichtgewichtiger Provider-Call wird ohne SidebarView-Instanz aufgesetzt | EPIC-Constraint 1 und 3 |

## Architecture considerations

### ASRs

| ID | Klassifizierung | Constraint | Why-ASR / Impact | Quality Attribute |
|----|----------------|------------|------------------|-------------------|
| ASR-33-11-01 | Moderate | Output-Format MUSS reines Markdown-Checklist-Format `- [ ]` sein, ohne Prosa, Headings oder Nummerierung | Falsches Format bricht Obsidian-Task-Plugins und Vault-Tasks-Workflows. Wirkt direkt auf User-Trust und Insert-Quote (Benefits-Hypothesis) | Usability, Interoperabilitaet |
| ASR-33-11-02 | Moderate | Originalblock darf nicht mutiert werden; Insert haengt ausschliesslich unter den Originalblock an | Mutation wuerde Vault-History und Checkpoint-Snapshots verschmutzen. Vertrauen in non-destructive Actions ist EPIC-weites Versprechen | Datensicherheit, User-Trust |
| ASR-33-11-03 | Moderate | Tool-Calls werden in dieser Action unterdrueckt (kein vault-write, kein semantic_search, kein web_fetch) | Find-Action-Items ist eine reine Text-Transformation. Tool-Calls oeffnen Angriffsflaeche fuer Prompt-Injection aus Selection-Inhalt (H-01) | Security |

### Constraints

- Reuse der Floating-Menu-Registry aus FEAT-33-01 (kein neuer Trigger-Pfad).
- Reuse der Settings-Snapshot-Logik (Modell, Skills, Prompts aus Main-Chat-State zum Trigger-Zeitpunkt; EPIC-Constraint 2).
- Output-Renderpfad: Inline-Preview im Editor via CodeMirror-Decoration oder Widget (EPIC-Constraint 3).
- Refresh-Helper `refreshOpenMarkdownViewsFor` aus src/core/utils/refreshMarkdownView.ts beim Insert verwenden (FIX-01-07-03-Pattern).

### Open questions for architect

1. Variante A (eigenes Action-Modul mit dediziertem Prompt) versus Variante B (Skill "extract-action-items" mit Capability `inline-action-eligible` plus FEAT-33-08-Sichtbarkeit). Architektur-Phase entscheidet anhand der Skill-Integration-Tiefe aus FEAT-33-08. Wenn B greift, kann FEAT-33-11 ohne eigenen Code geschlossen werden.
2. Soll der Insert-Button die Liste am Selection-Ende oder am Block-Ende anhaengen, wenn die Selection nur einen Teil-Block markiert? Default-Empfehlung: Block-Ende.
3. Wie verhaelt sich die Action bei Selections, die bereits Checklist-Items enthalten? Skip bestehender Items? Dedupe? Frage an Implementierungs-Phase.

## Definition of Done

### Activation Path (mandatory)

- **Type:** UI-element (Floating-Menu-Eintrag) plus Command-Palette-Command
- **Identifier:** Floating-Menu-Eintrag `"Find action items"`; Command-Palette `"Vault Operator: Extract action items from selection"`
- **Where it lives:** Floating-Menu-Registry aus FEAT-33-01 (Variante A) oder Skill-Library als `extract-action-items` mit Capability `inline-action-eligible` (Variante B, sichtbar via FEAT-33-08)
- **How a user reaches it:** Selection im Editor anlegen, Floating-Menu erscheint, "Find action items" anklicken; alternativ Command-Palette oeffnen und Command starten

### Functional checklist

- [ ] Floating-Menu-Eintrag erscheint bei aktiver Selection von mindestens einer Zeile
- [ ] Command-Palette-Eintrag ist registriert und funktioniert bei aktiver Selection
- [ ] Selection-Inhalt wird an den LLM-Call mit Prompt-Template "extract action items as Markdown checklist" weitergegeben
- [ ] Output wird per Regex gegen `^- \[ \] .+$` validiert; non-matching Zeilen werden gefiltert oder markiert
- [ ] Preview-Block erscheint unterhalb der Selection mit Liste und Buttons "Insert below" plus "Reject"
- [ ] Insert-Button fuegt Liste als neuen Markdown-Block unter den Originalblock ein
- [ ] Reject-Button entfernt Preview ohne Edit
- [ ] Originalblock bleibt byte-identisch nach Insert
- [ ] Action laeuft im read-only-Modus ohne Tool-Calls

### Quality checklist

- [ ] **Sidebar-Independence-Check:** Action funktioniert verifiziert mit geschlossener Chat-Sidebar (manueller Smoke-Test plus automatisierter Test in beiden Sidebar-States)
- [ ] Settings-Snapshot zum Trigger-Zeitpunkt: Modell, Provider und Prompt-Template werden aus Main-Chat-State gelesen
- [ ] TaskRouter routet auf Haiku-Tier bei Default-Settings (Tier-Routing-Trace im Debug-Log nachpruefbar)
- [ ] Token-Budget Output 1500 Tokens, Selection-Vorverarbeitung kappt bei 8000 Zeichen
- [ ] Performance: First-Token unter 1500 ms bei 500-Woerter-Selection in lokalem Smoke-Test
- [ ] Output-Format validiert: 10/10 Test-Selections liefern saubere `- [ ]`-Lines
- [ ] Bot-Compliance: kein innerHTML, kein direkter Style-Mutation, kein fetch, kein require ausser Allowlist
- [ ] Prompt-Injection-Filter aktiv auf Selection-Inhalt
- [ ] Tests: Unit-Test fuer Output-Validator, Integration-Test fuer Insert-Pfad mit Diff-Check auf Originalblock
- [ ] Build plus Deploy clean, tsc clean, ESLint clean

### Documentation checklist

- [ ] FEAT-33-11 in BACKLOG.md auf Done mit Commit-SHA
- [ ] Falls Variante A: ARCHITECTURE.map mit neuem Action-Modul-Eintrag
- [ ] Falls Variante B: Skill "extract-action-items" in Skill-Library mit Manifest dokumentiert
- [ ] docs/guides Eintrag zu Inline-Actions ergaenzt um Find-Action-Items-Beispiel
- [ ] Release-Note in docs/releases mit User-Beispiel (Meeting-Notes-Block)

## Hypothesis validation

Diese Feature-Spec validiert keine direkte BA-Hypothese aus BA-EPIC-33. Sie deckt die Cross-FEAT-Constraints aus EPIC-33 (Sidebar-Independence, Settings-Snapshot, Tier-Routing, Bot-Compliance, sidebar-unabhaengiger Output-Renderpfad) und liefert Tool-Parity gegenueber bekannten Marktreferenzen (Notion AI "Find action items"). Erfolgsmessung erfolgt ueber Adoption-Rate (siehe Benefits hypothesis), nicht ueber Hypothesen-Test.

## Dependencies

- **FEAT-33-01** (Trigger-Layer / Floating-Menu-Registry): Pflicht. Ohne Trigger-Layer kein Menu-Eintrag.
- **FEAT-33-08** (Skills als Inline-Actions, optional): Wenn Variante B gewaehlt wird, ist FEAT-33-08 die Realisierungs-Schicht.
- **FEAT-33-10** (Per-Action-Pin, optional): Wenn vorhanden, ueberschreibt der Pin den TaskRouter-Default fuer diese Action.
- **TaskRouter** in src/services/TaskRouter.ts: Default-Routing auf Haiku-Tier.
- **refreshMarkdownView-Helper** in src/core/utils/refreshMarkdownView.ts: Insert-Pfad.

## Assumptions

- FEAT-33-01 stellt eine Selection-aware Floating-Menu-Registry bereit, in die ein neuer Eintrag einklinkbar ist.
- AgentTask oder ein leichtgewichtiger Provider-Call ist sidebar-unabhaengig instanziierbar (in EPIC-33-Spec als zu pruefen markiert, gilt als gegeben fuer diese FEAT).
- Haiku-Tier-Modell ist im User-Setup verfuegbar; Fallback-Verhalten bei fehlendem Haiku-Modell wird durch TaskRouter-Default-Logik abgedeckt.
- Selection-Bloecke ueber 8000 Zeichen sind im VO-Vault selten genug, dass die Truncation-Behandlung akzeptabel ist.

## Out of scope

- Automatisches Anlegen der extrahierten Tasks in einem Task-Manager (Todoist, Tasks-Plugin Inbox). Insert begrenzt sich auf den aktuellen Note-Block.
- Multi-Selection-Extraktion (mehrere markierte Bloecke gleichzeitig). Eine Selection pro Aufruf.
- Task-Deduplikation gegenueber bestehenden Tasks in der Note oder im Vault. Reine Extraktion aus der Selection.
- Zuordnung von Verantwortlichen (`@name`-Tagging) oder Due-Dates. Reine Item-Extraktion.
- Synchronisation mit externen Task-Systemen.
- Erkennung impliziter Tasks ausserhalb der Selection (z.B. aus Backlinks oder Kontext-Notizen).

## Code Pointer

ARCHITECTURE.map Konzepte:

- `inline-action-floating-menu` (aus FEAT-33-01, neuer Eintrag bei Variante A)
- `skills.inline-action-eligible` (aus FEAT-33-08, neuer Skill bei Variante B)
- `task-router.tier=haiku.action=extract`
- `editor-preview-widget` (aus FEAT-33-01)
- `refreshMarkdownView-helper` (bereits in src/core/utils/refreshMarkdownView.ts)
