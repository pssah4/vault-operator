# implementation/ - Implementierungs-Plaene

Dieser Bereich traegt **PLAN-NNN-Dateien** des V-Model-Workflows.

## Struktur

```
implementation/
  plans/
    PLAN-{nn}-{slug}.md     Implementation-Plan (global, 2-stellig)
```

PLANs werden global durchnummeriert (2-stellig), weil sie haeufig
epic-uebergreifend sind. Memory v2 (PLAN-01) spannt z.B. mehrere
Features in EPIC-03. ChatGPT OAuth (PLAN-09) spannt mehrere Features
in EPIC-21.

Wenn die Anzahl der PLANs `99` ueberschreitet, wird die Klasse auf
3-stellig erweitert. Vorher nicht.

## Frontmatter (verbindlich)

```yaml
---
id: PLAN-09
title: ChatGPT OAuth Provider
date: 2026-04-29
feature-refs: [FEAT-21-01, FEAT-21-02, FEAT-21-03]
adr-refs: [ADR-88, ADR-89]
fix-refs: []
imp-refs: []
pair-id: sebastian-opus-4.7
---
```

**Kein** `status:` Feld. Status, Phase, Claim, Commit-SHA leben in der
Backlog-Zeile (`context/BACKLOG.md`).

## Coverage Gate

Vor Status `Active` muss der Coverage Gate gruen sein:

- [ ] Jedes Success Criterion eines referenzierten FEATURE ist einem
      Task zugeordnet oder als "Deferred: {Grund}" markiert
- [ ] Jedes referenzierte ADR hat mindestens einen Task
- [ ] Jeder Task benennt mindestens eine konkrete Datei
- [ ] Mindestens ein Build- und ein Test-Befehl ist definiert

Details in `skills/coding/templates/PLAN-TEMPLATE.md`.

## Lifecycle

PLANs mit Status `Done` oder `Superseded` bleiben am Platz. Es gibt
keinen `archive/`-Ordner. Veraltete Plans (z.B. ein PLAN, der durch
einen Folge-PLAN komplett ersetzt wurde) werden geloescht; die
Substanz lebt im neuen PLAN, im Code (Commits) und in den FEATURE-
Specs weiter. Die Backlog-Zeile bleibt mit dem letzten Status erhalten.

## Wer schreibt hier?

- `/coding` erzeugt PLAN-NNN-Dateien
- `/architecture` referenziert sie ueber `adr-refs`
- Mid-course-Trigger (Bug, Design, Requirements, Capability) schreiben
  in `## Change Log` des PLAN
