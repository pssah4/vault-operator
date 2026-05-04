# context/ - Aggregierter Kontext (drei Dateien)

Drei Dateien, jede mit einem klaren Zweck. Hier landet **aggregierter
Kontext** ueber Artefakte, NICHT Status oder Detail-Inhalte einzelner
Artefakte.

## Dateien

### `BACKLOG.md` -- Single Source of Truth

**Was:** EINE Zeile pro Artefakt (Feature, Epic, ADR, Plan, Fix, IMP),
mit Status, Phase, Refs (Beziehungs-Graph), Claim, Last-change und
Commit-SHA. Aufgeteilt in Sektionen pro Epic plus eine Cross-cutting-
Items-Sektion.

**Wann pflegen:** VOR jedem Edit der Artefakt-Datei. Reihenfolge:

1. Backlog-Zeile aktualisieren
2. Artefakt-Body aendern
3. Commit mit `Refs: FEAT-EE-FF, FIX-EE-FF-NN, ...`
4. Commit-SHA in Backlog-Zeile nachtragen

**Wer schreibt:** Jede Phase-skill.

**Format:** siehe `skills/requirements-engineering/templates/BACKLOG-TEMPLATE.md`.

### `HANDOFFS.md` -- Phase-zu-Phase-Uebergaben

**Was:** Append-only Log der Handoffs zwischen V-Model-Phasen. Jede
Phase-skill schreibt am Ende einen Eintrag mit: Artefakte produziert,
Open Questions, Annahmen, naechste Phase. Pro Eintrag wird das
betroffene Feature genannt (Triage-Block am Anfang).

**Wann pflegen:** Am Ende jeder Phase, im Handoff Ritual der
Phase-skill. Append-only, niemals frueheren Eintrag aendern.

**Wer schreibt:** Alle Phase-skills im Rahmen ihres Handoff Rituals.

**Wofuer braucht man das?** Agent-Sessions haben kein Gedaechtnis.
Wenn die naechste Phase-skill spaeter wieder einsteigt, liefert der
letzte Handoff-Eintrag den noetigen Kontext.

### `METRICS.md` -- Signal-Layer

**Was:** Append-additive Tabellen mit Cycle-Time pro Feature, Drift-
Count zwischen Code und Doku, Hypothesis-Validierung, Phase-
Transition-Counts, Cross-phase-Trigger-Counts.

**Wann pflegen:** Inside existing phase actions (Handoff Ritual,
Codebase-Reconciliation, Mid-course-Trigger).

**Wer schreibt:** `/coding` (Cycle-Time, Drift-Count),
`/business-analysis` (Hypothesis-Validierung), `/dia-orchestrator`
(Phase-Transitions), jede Phase-skill (Mid-course-Trigger-Counts).

## Was hier NICHT hingehoert

- **Detail-Inhalt eines einzelnen Artefakts.** FIX-Substanz, IMP-
  Substanz, Feature-Substanz leben in `requirements/`. Hier nur
  aggregierte Sicht.
- **Code-Pfade.** Die leben in `src/ARCHITECTURE.map`.

## Welche Dateien brauche ich wirklich?

- **`BACKLOG.md`** ist Pflicht. Ohne es gibt es keine Single
  Source of Truth.
- **`HANDOFFS.md`** ist wichtig fuer Multi-Session-Arbeit und
  Multi-Agent-Setups. Bei Solo-Agent-Single-Stream verzichtbar.
- **`METRICS.md`** ist optional. Sinnvoll wenn Drift beobachtet
  werden soll. Bei kleinen Projekten verzichtbar.
