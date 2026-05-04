# requirements/ - Was-Anforderungen (Epics, Features, Fixes, Improvements, Handoffs)

Dieser Bereich traegt alle **WAS**-Anforderungen des Projekts: Strategische
Buendel (Epics), Capability-Specs (Features), Bug-Detail (Fixes),
Verbesserungen an existierenden Features (Improvements), und die
Phase-Handoffs zwischen RE/Architecture/Coding.

## Struktur

```
requirements/
  epics/
    EPIC-{nn}-{slug}.md                 Strategische Capability-Buendel
  features/
    FEAT-{ee}-{ff}-{slug}.md            Feature-Specs (Epic 2-stellig + Feature 2-stellig)
  fixes/
    FIX-{ee}-{ff}-{nn}-{slug}.md        Bug-Detail (Parent-Feature + lokale Fix-Nr)
  improvements/
    IMP-{ee}-{ff}-{nn}-{slug}.md        Improvement-Detail
  handoff/
    architect-handoff-FEAT-{ee}-{ff}.md Aktueller RE -> Architecture Handoff
    plan-context-FEAT-{ee}-{ff}.md      Aktueller Architecture -> Coding Handoff
```

## Filename-Konventionen

**Intuition:** Jeder Filename traegt sein Parent-Epic plus Parent-Feature
im Praefix. Ein Blick reicht, um Zugehoerigkeit zu erkennen.

- Epic 03, Feature 14 -> `FEAT-03-14-knowledge-db-hardening.md`
- Erster FIX zu diesem Feature -> `FIX-03-14-01-writerlock-not-wired.md`
- Zweiter FIX dazu -> `FIX-03-14-02-icloud-vault-rename-not-cascaded.md`
- Erstes IMP zu diesem Feature -> `IMP-03-14-01-soak-report-modal.md`
- Handoff fuer dieses Feature -> `architect-handoff-FEAT-03-14.md`

## Numerierung

Alle Counter sind 2-stellig mit fuehrender Null (`01`-`99`). Wenn ein
Counter die `99` ueberschreitet, wird die gesamte Klasse auf 3-stellig
erweitert. Vorher nicht.

## Frontmatter (verbindlich)

Alle Artefakte unter requirements/ tragen Frontmatter mit Identitaet
und Beziehungen:

```yaml
---
id: FEAT-03-14
title: Knowledge-DB-Haertung
epic: EPIC-03
priority: P0
effort: M
adr-refs: [ADR-79]
depends-on: []
created: 2026-04-26
---
```

**Kein** `status:` Feld. Status lebt im Backlog
(`context/BACKLOG.md`).

FIX und IMP brauchen zusaetzlich `feature:` und `epic:`:

```yaml
---
id: FIX-03-14-01
feature: FEAT-03-14
epic: EPIC-03
adr-refs: [ADR-79]
plan-refs: [PLAN-03]
created: 2026-04-26
---
```

## Code-Pointer

Code-Pfade sind in den Specs **verboten** (auser im optionalen
`## Code Pointer`-Anhang am Ende, der auf einen ARCHITECTURE.map-
Concept-Namen verweist, nicht auf einen konkreten Pfad).

## Handoffs (per Feature)

Konvention: pro aktivem Feature-Stream ein Handoff-Pair.

- `architect-handoff-FEAT-{ee}-{ff}.md` -- Output von
  /requirements-engineering, Input fuer /architecture
- `plan-context-FEAT-{ee}-{ff}.md` -- Output von /architecture, Input
  fuer /coding

Beim Phase-Uebergang wird der naechste Handoff geschrieben. Der
Vorgaenger-Handoff kann geloescht werden, sobald das Feature Status
Done erreicht hat (Substanz steckt dann im Code, im PLAN-Change-Log
und in den ADRs). Backlog dokumentiert die Transition.

Templates:
- `skills/requirements-engineering/templates/ARCHITECT-HANDOFF-TEMPLATE.md`
- `skills/architecture/templates/plan-context-TEMPLATE.md`

## Wer schreibt hier?

| Skill                        | Erzeugt                                                    |
|------------------------------|------------------------------------------------------------|
| `/requirements-engineering`  | `EPIC-`, `FEAT-`, `architect-handoff-FEAT-...`             |
| `/architecture`              | `plan-context-FEAT-...`                                    |
| `/coding`                    | `FIX-` (Mid-course Bug Trigger), `IMP-`                    |
| `/testing`                   | `IMP-` (Coverage-Improvements)                             |

## Was hier NICHT hingehoert

- **PLAN-NN** (Implementation-Plan) -> `_devprocess/implementation/plans/`
- **ADR-NN** (Architektur-Entscheidung) -> `_devprocess/architecture/`
- **BA-NN, RESEARCH-NN, AUDIT-...** -> `_devprocess/analysis/`
- **Status-Tracking** -> `_devprocess/context/BACKLOG.md`
