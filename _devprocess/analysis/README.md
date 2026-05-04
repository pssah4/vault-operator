# analysis/ - Business Analyse, Exploration, Research, Audits

Flach. Vier verbindliche Praefixe. Keine Sub-Ordner.

## Praefix-Konvention (verbindlich)

| Praefix      | Pattern                              | Wer schreibt        |
|--------------|--------------------------------------|---------------------|
| `BA-`        | `BA-{nn}-{slug}.md`                  | /business-analysis   |
| `EXPLORE-`   | `EXPLORE-{nn}-{slug}.md`             | /business-analysis   |
| `RESEARCH-`  | `RESEARCH-{nn}-{slug}.md`            | alle Skills, ad-hoc |
| `AUDIT-`     | `AUDIT-{slug}-{date}.md`             | /security-audit     |

`{nn}` = 2-stellige globale Nummer, monoton, nie wiederverwendet.
Bei Ueberschreiten von `99` wird auf 3-stellig erweitert.

## Wofuer ist welcher Praefix

- **`BA-`** -- formale Business-Analyse-Dokumente (Personas, Problem-
  Statement, Stakeholder, Hypothesen, Value Proposition). Eine
  pro analysiertem Themenbereich.
- **`EXPLORE-`** -- Exploration Boards (Output des BA-Skill /explore-
  Modus). Brainstorm- oder Discovery-Phase, weniger formal als BA-.
- **`RESEARCH-`** -- alles andere: Technische Spikes, Codebase-
  Analysen, Design-Vorschlaege, Vergleichs-Studien, Root-Cause-
  Recherchen, Markt-Recherche, Drittquellen-Auswertungen. Ein
  Praefix fuer alle ad-hoc-Analysen, der Slug differenziert.
- **`AUDIT-`** -- Security-Audit-Berichte mit Datum. Format z.B.
  `AUDIT-obsilo-2026-04-29.md`.

## Status / Phase / Last-change

Lebt im Backlog. NICHT im Frontmatter dieser Dateien.

`grep "BA-13" _devprocess/context/BACKLOG.md` liefert Status.

## Was hier NICHT hingehoert

- **FIX-NN-NN-NN** (Bug-Detail) -> `_devprocess/requirements/fixes/`
- **IMP-NN-NN-NN** (Improvement-Detail) -> `_devprocess/requirements/improvements/`
- **PLAN-NN** (Implementierungs-Plan) -> `_devprocess/implementation/plans/`
- **ADR-NN** (Architektur-Entscheidung) -> `_devprocess/architecture/`
- **EPIC-NN / FEAT-NN-NN** -> `_devprocess/requirements/`

## Konsistenz-Pruefung

`/consistency-check` Mode A prueft, dass jede Datei in `analysis/`
einen der vier erlaubten Praefixe traegt. Andere Praefixe werden als
Drift gemeldet und muessen umbenannt oder verschoben werden.
