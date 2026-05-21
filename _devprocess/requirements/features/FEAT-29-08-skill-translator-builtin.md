---
id: FEAT-29-08
title: Skill-Translator-Builtin-Skill
epic: EPIC-29
priority: P1
effort: M
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-02, FEAT-29-05, FEAT-29-06]
created: 2026-05-20
---

# Feature: Skill-Translator-Builtin-Skill

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-08
> (status, phase, claim, last-change leben dort).

## Feature description

Anthropic veroeffentlicht Skills im offiziellen Repo (z.B. pdf, pptx, docx, xlsx, skill-creator selbst). Diese nutzen Python-Skripte in `scripts/`. Unser Vault Operator hat keine Python-Runtime, aber eine JavaScript-Sandbox. Dieses Feature liefert einen Builtin-Skill `skill-translator`, der einen Anthropic-Skill liest, die Python-Skripte ueber das Frontier-Modell in funktional aequivalentes JavaScript uebersetzt, die SKILL.md-Body-Referenzen auf die neuen JS-Dateien anpasst und das Ganze als nativer Vault-Operator-Skill persistiert. Bevor irgendetwas geschrieben wird, laeuft ein **Dry-Run-Pass**: alle Python-Imports und Bash-Aufrufe werden gegen eine Mapping-Tabelle gepruft. Wenn alles mappbar ist, laeuft die Konversion durch. Wenn etwas nicht oder nur teilweise mappbar ist (z.B. `scipy.signal`), wird **vor jedem Schreiben** ein User-Modal gezeigt: "Diese Faehigkeiten koennen wir nicht abbilden: [Liste]. Optionen: 1) Trotzdem importieren als partial translation, 2) Translation abbrechen und stattdessen den skill-creator nutzen um einen aehnlichen Skill from-scratch zu bauen." User entscheidet bewusst.

## Benefits hypothesis

**Wir glauben dass** ein Skill-Translator mit Dry-Run-Check und expliziter User-Entscheidung
**folgende messbare Wirkung erzielt:**

- Anthropic-Skills aus dem offiziellen Repo werden im Vault Operator nutzbar
- User wird nie von einem stillen partial-translation ueberrascht
- skill-creator wird als natuerliche Alternative positioniert wenn Translation nicht klappt

**Wir wissen dass wir erfolgreich sind, wenn:**

- Mindestens 5 prominente Anthropic-Skills (pdf, pptx, docx, xlsx, json) konvertieren vollstaendig
- Bei nicht-mappbaren Skills wird der User immer vor Schreiben gefragt
- Konvertierte Skills funktionieren bei erstem Trigger ohne manuellen Edit

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will Anthropic-Skills aus dem Repo importieren | Story 1 |
| Emotional | User will Klarheit ob ein Skill nach Import wirklich funktioniert | Story 2 |
| Social | User will von der Anthropic-Community profitieren (geteilte Skills nutzen) | Story 3 |

## User stories

### Story 1: Anthropic-Skill in den Vault holen (Functional Job)

**Als** Power-User der die offiziellen Anthropic-Skills (pdf, pptx, etc.) kennt
**moechte ich** den Agent bitten "Hol mir den pdf-Skill von Anthropic",
**damit** ich diese Capabilities im Vault Operator nutzen kann ohne sie selbst zu bauen.

### Story 2: Klare Sicht auf partial translation (Emotional Job)

**Als** User der einen externen Skill importiert
**moechte ich** vor dem Schreiben sehen, ob die Translation vollstaendig ist oder ob Faehigkeiten fehlen,
**damit** ich entscheiden kann ob ich den Skill annehme oder doch lieber neu baue.

### Story 3: Community-Pool nutzen (Social Job)

**Als** Teil der Anthropic-Skill-Community
**moechte ich** an geteilten Skills teilhaben,
**damit** ich mein Setup von der Arbeit anderer profitieren lasse.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Top-5-Anthropic-Skills (pdf, pptx, docx, xlsx, json) konvertieren vollstaendig | 5 von 5 ohne partial-translation-Warnung | Test mit echten Anthropic-Skill-Repo-Inhalten |
| SC-02 | Bei nicht-mappbaren Imports erscheint vor Schreiben ein User-Modal | 100% der nicht-mappbaren Faelle triggern Modal | Test mit synthetischem Python-Skript |
| SC-03 | User-Modal bietet "Partial annehmen" und "Abbrechen plus skill-creator" als Optionen | beide Buttons vorhanden, leiten in richtige Pfade | Manueller Test |
| SC-04 | Konvertierter Skill funktioniert bei erstem Trigger ohne manuellen Edit | mindestens 80% der konvertierten Skills | Test mit den Top-5 |
| SC-05 | TRANSLATION.json-Manifest wird im konvertierten Skill-Folder erzeugt mit Audit-Info | Datei vorhanden, enthaelt Source-Repo, Original-Version, Konvertierungs-Datum, partial-Markers | Filesystem-Inspection |

---

## Technical NFRs

### Performance

- Dry-Run-Pass unter 2 Sekunden fuer typische Skills (5-10 Skripte).
- Konversion eines Skripts unter 30 Sekunden (LLM-Call gegen Frontier-Modell).
- Smoke-Test pro konvertierter Skript unter 5 Sekunden.

### Security

- Konvertierter Code wird vor Schreiben validiert (kein eval, kein Filesystem-Bypass ausserhalb Skill-Folder).
- TRANSLATION.json-Audit-Log dokumentiert wer wann was konvertiert hat.

### Scalability

- Konversion von Skills mit bis zu 20 Skripten und 5000 Code-Zeilen.

### Availability

- Bei LLM-Fehler oder Timeout klare Fehlerbericht an User, partial-Konversion wird nicht stillschweigend gespeichert.
- Bei Sandbox-Smoke-Test-Fehler: User-Warnung vor Annahme.

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Dry-Run-Pass vor Schreiben

- Begruendung: Verhindert dass User mit unvollstaendigem Skill ueberrascht wird.
- Impact: Translator-Workflow muss strikt Dry-Run-First sein.
- Qualitaetsattribut: Transparency, User-Trust.

**CRITICAL ASR #2:** Mapping-Tabelle als versionierter Datenbestand

- Begruendung: Python-zu-JS-Mappings (pdfplumber -> pdf-lib, etc.) muessen pflegbar und erweiterbar sein.
- Impact: Eigene Mapping-Datei im skill-translator-Skill-Folder.
- Qualitaetsattribut: Maintainability.

**MODERATE ASR #3:** TaskRouter-Eskalation auf Flagship

- Begruendung: Code-Konversion erfordert das beste verfuegbare Modell.
- Impact: TaskRouter wird um Translation-Trigger erweitert.
- Qualitaetsattribut: Quality of translation.

### Constraints

- Sandbox kann nicht alle Python-Faehigkeiten abdecken (kein scipy, keine native Binaries). Diese sind hard-stop fuer Translation.
- HTTP-Calls in konvertierten Skripten laufen ueber die bestehende Sandbox-Bridge.
- Binaere Formate (PDF, DOCX, PPTX, XLSX) werden ueber bestehende built-in Tools des Vault Operators gehandhabt, nicht in Sandbox neu implementiert (das wuerde scheitern).

### Open questions for architect

- Wo lebt die Python-zu-JS-Mapping-Tabelle? Im skill-translator-Skill-Folder (`references/mapping.json`) oder als Plugin-internes Asset?
- Wie wird das User-Modal angezeigt? Existierender Modal-Mechanismus oder spezifisch fuer Translation?
- Was passiert bei einem Anthropic-Skill der mehrere Skripte hat, von denen einige mappbar und einige nicht? Granular pro Skript Entscheidung, oder ganz oder gar nicht?
- Wie wird die Quelle (Anthropic-Repo-URL und Commit-SHA) im TRANSLATION.json erfasst?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer Dry-Run-Pass (alle Python-Patterns getestet)
- [ ] Unit-Tests fuer Mapping-Tabellen-Lookup
- [ ] Integrations-Test: Top-5-Anthropic-Skills werden konvertiert und funktionieren
- [ ] Edge-Case-Tests: Nicht-mappbare Skill (z.B. scipy-User) loest User-Modal aus

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] Mapping-Tabelle dokumentiert und versioniert
- [ ] User-Modal-UX dokumentiert

---

## Hypothesis validation

| Hypothese | Test-Methode | Erfolgs-Kriterium | Resultat |
|---|---|---|---|
| H-03: Python-zu-JS-Konversion liefert fuer Top-5 Anthropic-Skills voll funktionale JS-Version | Konvertierung der 5 Skills, Smoke-Test, manuelle Validierung der Outputs | 5 von 5 vollstaendig konvertiert, alle Smoke-Tests gruen | Open |

---

## Dependencies

- **FEAT-29-02 Plugin-Skill-Format-Migration**: Translator schreibt im selben Folder-Format.
- **FEAT-29-05 Skill-Creator-Builtin**: User-Modal bei partial translation verweist auf skill-creator.
- **FEAT-29-06 Sandbox-JS-First-Class**: Konvertierte Skripte laufen ueber run_skill_script.
- **EPIC-22 Skill-Zip-Import (FEAT-22-02)**: Translator kann auch Anthropic-Skill-Zips als Input nehmen.

## Assumptions

- Frontier-Modell ist in der Lage Python-zu-JS-Konversion fuer gaengige Patterns zu liefern (validiert mit manuellen Pilot-Konversionen).
- User akzeptiert dass nicht alle Python-Bibliotheken mappbar sind.

## Out of scope

- Umgekehrte Konversion (JS zu Python).
- Konversion zwischen verschiedenen JS-Frameworks.
- Auto-Update bei neuen Versionen von Anthropic-Skills.

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `skill-translator` (neu in dieser Implementierung).
