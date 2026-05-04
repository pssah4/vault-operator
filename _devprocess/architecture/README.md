# architecture/ - ADRs und arc42

Abstrakte Architekturentscheidungen plus arc42-Snapshot.

## Inhalt

| Datei                                | Zweck                                            |
|--------------------------------------|--------------------------------------------------|
| `ADR-{nnn}-{slug}.md`                | Eine Architekturentscheidung im MADR-Format      |
| `arc42.md`                           | arc42-Architekturdokumentation (12 Sektionen)    |
| `SPECIALIST-OVERLAY-ARCHITECTURE.md` | Sub-Architektur-Doku Specialist-Overlay-System   |

## ADR-Disziplin (verbindlich)

ADRs sind abstrakt. Kern-Sektionen (Context, Decision Drivers,
Considered Options, Decision, Consequences) enthalten:

- **KEINE** konkreten Code-Pfade (`src/...`)
- **KEINE** Datei-Namen oder Klassen-Namen
- **KEINE** Zeilen-Nummern oder Datei-Groessen
- **KEINE** Status-Felder

Code-Pointer leben in einer optionalen `## Implementation Notes`-
Sektion am Ende des ADRs, die explizit "may go stale" markiert ist.
Der Wegweiser (`src/ARCHITECTURE.map` plus JSDoc-Header in der
Entry-File) ist die Single Source fuer aktuelle Pfade.

Status, Phase und Last-change leben in der Backlog-Zeile, nicht im
Frontmatter.

## Globale Numerierung

ADRs werden global durchnummeriert (2-stellig), nicht epic-scoped, weil
sie haeufig uebergreifend sind. ADR-01 (zentrale ToolExecutionPipeline)
betrifft jedes Tool aller Epics; ADR-79 (Knowledge-DB-Haertung)
spannt EPIC-03 plus Cross-cutting.

Wenn die Anzahl der ADRs `99` ueberschreitet, wird die gesamte Klasse
auf 3-stellig erweitert. Vorher nicht.

## ADR-Catalog

Alle ADRs sind in `src/ARCHITECTURE.map` Section 2 (ADR CATALOG)
gelistet mit ID, Topic und Titel. Ein `grep "ADR-79" src/ARCHITECTURE.map`
liefert die Catalog-Zeile UND alle Concept-Zeilen, die das ADR
referenzieren.

## Wer schreibt hier?

- `/architecture` erzeugt neue ADRs und arc42-Sektionen
- `/coding` aktualisiert ADR-Implementation-Notes nach Code-Edits,
  Mid-course Design Trigger superseded ADRs
- `/reverse-engineering` erzeugt ADR-Drafts (Status: Inferred)

## Lifecycle

Done-ADRs (Accepted, Released) bleiben am Platz. Superseded-ADRs
ebenfalls (Audit-Trail der Entscheidungs-Historie). Veraltete oder
fehlerhafte ADRs werden geloescht, nicht archiviert.

## Konsolidierung

Bei neuem ADR immer pruefen, ob ein existierendes ADR gemerged oder
ergaenzt werden kann. Ziel: eher 30 thematische ADRs als 90
Detail-ADRs. ADR-Inflation ist ein Warnsignal.
