---
id: FEAT-29-11
title: Customize-Section Refinement und Lucide Toolbox Icon
epic: EPIC-29
priority: P2
effort: S
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-05]
created: 2026-05-20
---

# Feature: Customize-Section Refinement und Lucide Toolbox Icon

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-11
> (status, phase, claim, last-change leben dort).

## Feature description

In der heutigen Settings-Ansicht hat der "Skills"-Bereich einen Edit-Button, der die SKILL.md-Datei direkt zum Editieren oeffnet. Mit dem neuen Folder-Format (Folder mit SKILL.md plus scripts/, references/, assets/) ist das aber unzureichend: der User will den ganzen Skill-Folder sehen, nicht nur die Markdown-Hauptdatei. Dieses Feature aendert den Edit-Button so, dass er den Skill-Folder im Filesystem-Browser oeffnet (oder in einer in-Plugin-Folder-Anzeige). Zusaetzlich bekommt der Customize-Bereich das Lucide-Icon `toolbox` als visuelle Klammer fuer "Skills, Workflows und Anpassungen". Weitere Verfeinerungen im Customize-Bereich folgen dem Anthropic-Pattern: kurze Beschreibungen pro Skill, Versions-Link (zu FEAT-29-09), Inline-Trigger-Button.

## Benefits hypothesis

**Wir glauben dass** Edit-Button-Redirect auf Folder und passende Icon-Wahl
**folgende messbare Wirkung erzielt:**

- User sieht alle Skill-Bestandteile auf einmal
- Customize-Bereich wirkt visuell als zusammenhaengende Einheit

**Wir wissen dass wir erfolgreich sind, wenn:**

- Edit-Button oeffnet den Skill-Folder, nicht die SKILL.md
- Customize-Tab hat das Toolbox-Icon, klar von anderen Settings-Tabs unterscheidbar

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will alle Bestandteile eines Skills auf einmal sehen | Story 1 |
| Emotional | User will dass der Customize-Bereich wie ein "Werkzeugkasten" wirkt | Story 2 |
| Social | User will einem Kollegen sagen "klick auf das Toolbox-Icon" und der findet es sofort | Story 3 |

## User stories

### Story 1: Folder oeffnen statt SKILL.md (Functional Job)

**Als** User der einen Skill editieren moechte
**moechte ich** den ganzen Skill-Folder sehen mit allen Sub-Files,
**damit** ich auch Skripte und References ohne Umweg editieren kann.

### Story 2: Werkzeugkasten-Metapher (Emotional Job)

**Als** User der seine Anpassungen findet
**moechte ich** ein Icon das nach "Werkzeugkasten" aussieht,
**damit** ich intuitiv erkenne wo meine eigenen Erweiterungen leben.

### Story 3: Schnelle Navigation (Social Job)

**Als** User der Kollegen das Plugin zeigt
**moechte ich** dass das Customize-Tab visuell hervorstechend ist,
**damit** ich nicht beschreiben muss "scroll runter, das vierte oder fuenfte Icon".

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Edit-Button im SkillsTab oeffnet Skill-Folder | klickbare Aktion, oeffnet richtigen Pfad | Manueller Test |
| SC-02 | Customize-Tab nutzt lucide toolbox als Icon | sichtbar im Settings-Tab-Header | Manueller Test |
| SC-03 | Folder-Oeffnen funktioniert auf macOS, Windows, Linux | 3 von 3 Plattformen erfolgreich | Cross-Platform-Test |
| SC-04 | Wenn kein system-default Filesystem-Browser verfuegbar, fallback auf in-Plugin-Folder-Anzeige | Fallback aktiv | Test ohne system-default-FS-Browser |

---

## Technical NFRs

### Performance

- Folder-Oeffnen unter 500 ms Klick-zu-Visibility.
- Icon-Render unter 16 ms (single frame).

### Security

- Folder-Oeffnen umgeht keine Permissions, oeffnet nur was der User ohnehin sehen kann.

### Scalability

- Funktioniert mit Skill-Foldern beliebiger Groesse (system-default-FS-Browser handhabt das selbst).

### Availability

- Fail-soft wenn kein system-default-FS-Browser verfuegbar.

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

Keine kritischen ASRs, alles sind UI- und kleine Integrationsentscheidungen.

### Constraints

- Lucide-Icon-Library ist bereits im Plugin verwendet, kein neuer Dependency-Pfad.
- Filesystem-Browser-Aufruf via Electron `shell.openPath` (Standard fuer Obsidian-Plugins).

### Open questions for architect

- Soll der Folder im system-default-FS-Browser geoeffnet werden oder in einer in-Plugin-Anzeige?
- Was passiert wenn der Skill-Folder nicht existiert (theoretisch unmoeglich, aber Edge-Case)? Klare Fehlermeldung statt Crash.

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Manueller Test auf macOS, Windows, Linux
- [ ] Visual-Regression-Test fuer Icon

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded

---

## Hypothesis validation

Nicht anwendbar.

---

## Dependencies

- **FEAT-29-05 Skill-Creator-Builtin**: liefert die Folder-Struktur die der Edit-Button anzeigt.

## Assumptions

- Obsidian-Plugin-API erlaubt `shell.openPath` ueber Electron.
- Lucide-Icon-Library hat das `toolbox`-Icon (verifiziert).

## Out of scope

- In-Plugin-Code-Editor fuer Skill-Files.
- Drag-and-Drop von Skill-Files.

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `skills-tab` (SettingsUI).
