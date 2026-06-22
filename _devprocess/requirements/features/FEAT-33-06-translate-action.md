---
id: FEAT-33-06
title: Translate-Action mit Sub-Menu fuer Zielsprache
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

# FEAT-33-06: Translate-Action mit Sub-Menu fuer Zielsprache

## Feature description

Der User markiert Text im aktiven Markdown-Editor, oeffnet das Floating-Menu (FEAT-33-01) und waehlt "Translate". Ein Sub-Menu listet die verfuegbaren Zielsprachen mit den zuletzt-genutzten oben. Nach der Auswahl uebersetzt eine Inline-Action den markierten Text in die gewaehlte Sprache. Der Output erscheint im Default-Modus als Inline-Diff mit Accept/Reject (Tastenkombination wie in FEAT-33-03 Rewrite), optional als Direct-Replace, wenn der User das in den Settings so eingestellt hat.

Translate-Action laeuft in Welle 2 nach dem Floating-Menu-Fundament. Sie deckt das Need N-09 aus der BA ab und schliesst eine Luecke gegenueber dem Markt: 8 von 8 untersuchten Tools bieten "Translate" als First-Class-Inline-Action. Der zugehoerige Mehrwert im Vault-Operator-Kontext liegt im Mixed-Language-Arbeiten (Sebastian und Community-User wechseln zwischen Deutsch und Englisch innerhalb derselben Notiz).

## Benefits hypothesis

We believe ein dedizierter Translate-Eintrag mit Sprach-Sub-Menu im Floating-Menu fuer den Vault-Operator-User delivers eine spuerbare Reduktion der Context-Switches beim Uebersetzen kurzer Passagen (Pain N-09: 4+ Switches heute, 0 nach FEAT). We know we are successful when ueber zwei Wochen produktivem Use mindestens 70 Prozent aller Translate-Aktionen direkt aus dem Floating-Menu kommen (nicht aus dem Main-Chat als Workaround) und die Akzeptanzrate des Inline-Diffs mindestens 65 Prozent betraegt.

## Jobs to be Done

Aus BA Sektion 5.4 (Need N-09):

| Job-Type | Job-Statement | Address-in-Story |
|----------|---------------|------------------|
| Functional | Markierten Text in eine bestimmte Zielsprache uebersetzen, ohne den Editor zu verlassen | US-33-06-01 |
| Functional | Zwischen mehreren Zielsprachen schnell waehlen, wenn ich regelmaessig in mehreren Sprachen arbeite | US-33-06-02 |
| Emotional | Mich auf den Notizfluss konzentrieren, ohne meinen mentalen Kontext fuer einen Sprachwechsel zu unterbrechen | US-33-06-01 |
| Social | Notizen in der Sprache des Empfaengers teilen koennen, ohne separate Translator-Tools zu oeffnen | US-33-06-03 |

## User stories

- **US-33-06-01 (P1, Functional):** Als Wissensarbeiter im Vault Operator moechte ich markierten Text per Floating-Menu in meine Default-Zielsprache uebersetzen, damit ich ohne Tool-Wechsel weiter in der Notiz arbeiten kann.
- **US-33-06-02 (P1, Functional):** Als mehrsprachiger User moechte ich aus dem Sub-Menu eine andere Zielsprache waehlen koennen (DE, EN, FR, ES, IT plus eigene Sprachen aus den Settings), damit ich nicht fuer jede Sprache eine eigene Default-Einstellung pflegen muss.
- **US-33-06-03 (P2, Social):** Als Notiz-Autor moechte ich den uebersetzten Text als Inline-Diff sehen und gezielt akzeptieren oder verwerfen, damit ich die Uebersetzung pruefen kann, bevor sie meinen Originaltext ueberschreibt.

## Success criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Translate-Eintrag erscheint im Floating-Menu, sobald Text markiert ist | 100 Prozent der Selektionen mit Laenge > 0 | Manuelle Verifikation plus UI-Test mit synthetischer Selection |
| SC-02 | Sub-Menu zeigt mindestens 5 Default-Sprachen plus User-Custom-Sprachen, mit den zuletzt-genutzten oben | Recently-Used-Liste pflegt die letzten 3 Sprachen | UI-Test: 3 Translates in unterschiedliche Sprachen, Reihenfolge im Sub-Menu pruefen |
| SC-03 | Uebersetzungsergebnis erscheint im konfigurierten Output-Modus (Default Inline-Diff, optional Direct-Replace) | 100 Prozent der Aktionen folgen der Settings-Auswahl | Settings-Toggle umstellen, Action triggern, Output-Pfad pruefen |
| SC-04 | Action laeuft mit geschlossener Chat-Sidebar | 100 Prozent der Aktionen liefern Output ohne Sidebar-Oeffnung | Manueller Test: Sidebar geschlossen, Translate triggern, Sidebar bleibt zu, Output erscheint |
| SC-05 | Action ist ueber Command-Palette aufrufbar ("Vault Operator: Translate selection to <Sprache>") | Mindestens ein Command pro Default-Sprache plus dynamische Commands fuer Custom-Sprachen | Command-Palette aufrufen, alle erwarteten Eintraege vorhanden |

## Technical NFRs

- **Performance:** Time-to-first-token <800ms ueber Haiku-Tier (gemessen vom Sub-Menu-Klick bis erster Token im Diff-Widget). Vollstaendige Uebersetzung fuer Texte bis 500 Woerter in <3s end-to-end auf Haiku-3.5.
- **Tier-Routing:** Translate ist im TaskRouter (src/services/TaskRouter.ts) als Haiku-Tier-Action klassifiziert, analog zu Lookup/Summarize. Routing-Override per Settings moeglich (FEAT-33-10), fuer GA aber Default Haiku.
- **Token-Budget:** Prompt-Footprint fuer System + Skill + Selection <2500 Bytes bei 500-Woerter-Selection. Settings-Snapshot wird zum Trigger-Zeitpunkt aus dem Main-Chat-State gelesen und mit dem Tool-Call versendet (kein zusaetzlicher Settings-Round-Trip).
- **Security:** Keine PII oder Vault-Pfade in Tool-Descriptions oder System-Prompt der Translate-Action (Cross-Constraint MCP-wire-neutral aus EPIC-33). Selection-Text wandert direkt in den User-Message-Body, nicht in System-Sektionen.
- **Scalability:** Recently-Used-Liste ist auf 10 Eintraege gecappt, FIFO-Eviction. Custom-Sprachen-Liste (Settings) ohne Hard-Limit, UI-Sub-Menu rendert via virtualisierte Liste ab 15 Eintraegen.
- **Availability:** Bei Provider-Fehler (Network/Auth/Rate-Limit) Inline-Toast-Notification, kein stiller Failure. Selection bleibt unveraendert (kein partieller Diff).

## Architecture considerations

### Critical ASRs

- **ASR-CRIT-01 (Why-ASR: Sidebar-Independence):** Translate muss mit geschlossener Sidebar laufen. Quality-Attribute: Usability + Reliability. Impact: AgentTask oder Light-Weight-Caller muss ohne AgentSidebarView instanziierbar sein. Pruefung mit den Vorbildern aus src/core/AgentTask.ts noetig (Cross-Constraint aus EPIC-33 H-06).
- **ASR-CRIT-02 (Why-ASR: Output-Renderpfad im Editor):** Inline-Diff-Widget muss in CodeMirror-Decorations gerendert werden (analog FEAT-33-03 Rewrite). Quality-Attribute: Usability + Maintainability. Impact: Widget-Komponente wird mit FEAT-33-03 geteilt, daher Architektur-Abhaengigkeit auf das Diff-Widget-Modul aus FEAT-33-03.

### Moderate ASRs

- **ASR-MOD-01 (Why-ASR: Sprach-Inventar-Quelle):** Sprachliste muss aus zwei Quellen kommen: built-in Defaults (DE, EN, FR, ES, IT) plus User-Custom-Sprachen aus settings.translateCustomLanguages. Quality-Attribute: Configurability. Impact: Neuer Settings-Block, kein neuer Provider-Endpoint.
- **ASR-MOD-02 (Why-ASR: Recently-Used-Persistenz):** Recently-Used-Liste muss ueber Plugin-Restart erhalten bleiben. Quality-Attribute: Usability. Impact: settings.recentTranslateLanguages (string[], max 10), Write nach jeder Action.

### Constraints

- Settings-Snapshot zum Trigger-Zeitpunkt (Cross-Constraint EPIC-33 #2): Modell, Skills, Prompts, Provider werden aus Main-Chat-State gelesen, nicht zum Action-Zeitpunkt neu evaluiert. Optional FEAT-33-10 Per-Action-Pin ueberschreibt.
- Bot-Compliance: kein fetch, kein innerHTML, kein direkter Style-Mutation; CodeMirror-Decorations und Obsidian-DOM-API. Sub-Menu via Obsidian `Menu`/`MenuItem`.
- Tier-Routing in TaskRouter erweitern: Translate-Tag in der Classification-Map, Default-Tier Haiku.

### Open questions for architect

- Q1: Teilt Translate sich das Diff-Widget-Modul mit FEAT-33-03 Rewrite (empfohlen) oder bekommt es eine eigene Variante? Antwort blockiert Implementierungsstart.
- Q2: Wo lebt die Sprach-Liste-Resolver-Logik (built-in plus custom plus recently-used)? Kandidat: neuer `TranslateLanguageRegistry` unter src/services/.
- Q3: Wie wird die Action-spezifische Skill-Auswahl gemappt? Generischer Translate-Skill oder Skill-frei mit reinem System-Prompt? Empfehlung Skill-frei fuer GA, Skill-Hook fuer spaeter offenhalten.

## Definition of Done

### Activation path (mandatory)

| Feld | Wert |
|------|------|
| Type | Floating-Menu-Eintrag plus Command-Palette-Commands |
| Identifier | Menu-Eintrag "Translate" mit Sub-Menu; Commands "vault-operator:translate-selection-to-<lang-code>" |
| Where | Aktiver Markdown-Editor mit nicht-leerer Selektion; Command-Palette global |
| How | Selection setzen, Floating-Menu oeffnet automatisch, "Translate" klicken, Zielsprache im Sub-Menu waehlen; oder Command-Palette aufrufen und den gewuenschten Translate-Command auswaehlen |

### Functional checklist

- [ ] Floating-Menu zeigt "Translate"-Eintrag bei nicht-leerer Selektion
- [ ] Sub-Menu listet built-in Sprachen plus Custom-Sprachen plus Recently-Used-Liste oben
- [ ] Auswahl loest Translate-Action mit Settings-Snapshot aus
- [ ] Output erscheint im konfigurierten Modus (Default Inline-Diff mit Accept/Reject, optional Direct-Replace)
- [ ] Recently-Used-Liste wird nach jeder Action aktualisiert und persistiert
- [ ] Command-Palette enthaelt einen Translate-Command pro Sprache
- [ ] Provider-Fehler zeigen Inline-Toast und lassen die Selection unveraendert
- [ ] **Sidebar-Independence-Check:** Aktion funktioniert mit geschlossener Chat-Sidebar verifiziert (manueller Smoke-Test plus automatisierter Test mit Mock-Sidebar-State `closed`)

### Quality checklist

- [ ] tsc clean, ESLint clean, Bot-Compliance-Rules erfuellt
- [ ] Unit-Tests fuer `TranslateLanguageRegistry` (built-in plus custom plus recently-used Merge)
- [ ] Unit-Tests fuer Tier-Routing (Translate -> Haiku)
- [ ] Integration-Test: Selection -> Sub-Menu-Klick -> Diff-Widget rendert
- [ ] Smoke-Test mit geschlossener Sidebar
- [ ] Performance-Messung: Time-to-first-token unter Haiku <800ms an 5 Test-Selektionen

### Documentation checklist

- [ ] Settings-Doku: neue Settings `defaultTranslateTargetLanguage`, `translateCustomLanguages`, `recentTranslateLanguages`
- [ ] User-Doku in docs/guides/ inline-actions.md: Translate-Section mit Sub-Menu-Screenshot
- [ ] Release-Notes-Eintrag im naechsten Release

## Dependencies

- **FEAT-33-01** (Floating-Menu-Fundament) muss released sein. Sub-Menu-Pattern und Selection-Detection werden dort etabliert.
- **FEAT-33-03** (Rewrite-Action mit Inline-Diff) liefert das Diff-Widget-Modul, das Translate im Default-Modus wiederverwendet. Falls FEAT-33-03 nicht vor FEAT-33-06 fertig ist, kann Translate-MVP mit Direct-Replace starten und Inline-Diff nachziehen.
- **TaskRouter** (src/services/TaskRouter.ts) muss Translate-Tag akzeptieren.

## Assumptions

- Settings-Snapshot-Mechanismus aus FEAT-33-01 ist generisch genug, dass Translate ihn ohne Eigenbau wiederverwenden kann.
- Haiku-Tier liefert ausreichende Translate-Qualitaet fuer Texte bis 500 Woerter in den 5 Default-Sprachen. Annahme basiert auf Marktrecherche (Notion AI Translate, Cursor Inline-Translate beide auf Cost-aware-Tier).
- User-Custom-Sprachen werden als freie Strings akzeptiert (z.B. "Schwedisch", "ko"). Der Prompt enthaelt den String 1:1, die LLM-seitige Sprach-Resolution ist ausreichend tolerant.

## Out of scope

- Bulk-Translate ganzer Notiz (separate Action, nicht Teil von FEAT-33-06)
- Sprach-Auto-Detection des Quelltextes (LLM macht das implicit, keine UI-Anzeige)
- Sprach-spezifische Skills oder Glossare (potentielle Phase-2-Erweiterung)
- Per-Action-Pin (FEAT-33-10 deckt das ab)
- Translation-Memory oder Caching der Uebersetzungen (kein Use-Case fuer GA)

## Code Pointer

ARCHITECTURE.map concept: `inline-actions.translate`
