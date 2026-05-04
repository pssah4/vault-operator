# _devprocess - V-Model Artefakt-Archiv (intern)

> AI-lesbares Wissensarchiv des Obsilo-Projekts. Nicht public.
> Der Public-Sync (`sync-public` CI) entfernt diesen Ordner vor jedem
> Public-Push.

## Struktur

```
_devprocess/
  analysis/           BAs, Explore-Boards, Research-Notes, Audit-Reports
  architecture/       ADRs, arc42
  articles/           Externe Inhalte (Blog-Posts, Reddit, Tutorials)
  context/            Aggregierter Kontext (Backlog, Handoffs, Metrics)
  implementation/     PLAN-NNN-Dateien
  requirements/       Epics, Features, Fixes, Improvements, Handoffs
  rules/              Stabile Regelsets (technical/design/domain.md, max 500 Zeilen total)
```

## Verbindliche Praefix-Konvention

| Praefix          | Wo                              | Pattern                                  | Wer schreibt              |
|------------------|----------------------------------|-------------------------------------------|---------------------------|
| `EPIC-`          | `requirements/epics/`            | `EPIC-{nn}-{slug}.md`                     | /requirements-engineering |
| `FEAT-`          | `requirements/features/`         | `FEAT-{ee}-{ff}-{slug}.md`                | /requirements-engineering |
| `FIX-`           | `requirements/fixes/`            | `FIX-{ee}-{ff}-{nn}-{slug}.md`            | /coding (Mid-course Bug)  |
| `IMP-`           | `requirements/improvements/`     | `IMP-{ee}-{ff}-{nn}-{slug}.md`            | /coding, /testing         |
| `ADR-`           | `architecture/`                  | `ADR-{nn}-{slug}.md`                      | /architecture             |
| `PLAN-`          | `implementation/plans/`          | `PLAN-{nn}-{slug}.md`                     | /coding                   |
| `BA-`            | `analysis/`                      | `BA-{nn}-{slug}.md`                       | /business-analysis         |
| `EXPLORE-`       | `analysis/`                      | `EXPLORE-{nn}-{slug}.md`                  | /business-analysis         |
| `RESEARCH-`      | `analysis/`                      | `RESEARCH-{nn}-{slug}.md`                 | alle Skills, ad-hoc       |
| `AUDIT-`         | `analysis/`                      | `AUDIT-{slug}-{date}.md`                  | /security-audit           |
| Handoff (Arch)   | `requirements/handoff/`          | `architect-handoff-FEAT-{ee}-{ff}.md`     | /requirements-engineering |
| Handoff (Coding) | `requirements/handoff/`          | `plan-context-FEAT-{ee}-{ff}.md`          | /architecture             |

**Numbering:** alle Counter sind 2-stellig mit fuehrender Null
(`01`-`99`). Wenn ein Counter die `99` ueberschreitet, wird die
gesamte Klasse auf 3-stellig erweitert. Vorher nicht.

- `nn` (Epic): `01`-`99`
- `ee-ff` (Feature): Epic `01`-`99`, Feature lokal pro Epic `01`-`99`
- `ee-ff-nn` (FIX/IMP): Epic + Feature + lokale Nummer pro Feature
- ADR und PLAN sind global durchgezaehlt (`01`-`99`).

## Lookup-Quellen (Single Source of Truth)

| Frage                              | Quelle                                                      |
|------------------------------------|-------------------------------------------------------------|
| Status eines Artefakts             | `context/BACKLOG.md` (Backlog-Zeile)                     |
| Beziehungen / Graph                | `context/BACKLOG.md` (Refs-Spalte)                       |
| Wo lebt Konzept X im Code?         | `src/ARCHITECTURE.map` Section 1                            |
| Welche ADR ist relevant?           | `src/ARCHITECTURE.map` Section 2 (ADR Catalog)              |
| Stabile technische Regeln          | `rules/technical.md`                                        |
| Architektur-Entscheidung im Detail | `architecture/ADR-{nn}-{slug}.md`                           |
| Bug-Detail                         | `requirements/fixes/FIX-{ee}-{ff}-{nn}-{slug}.md`           |
| Improvement-Detail                 | `requirements/improvements/IMP-{ee}-{ff}-{nn}-{slug}.md`    |
| Phase-Uebergang                    | `context/HANDOFFS.md` (append-only Log)                  |
| Cycle-Time / Drift                 | `context/METRICS.md` (Signal-Layer)                      |

## Single Source of Truth Regel

Status, Phase, Last-change, Claim und Commit-SHA aller Artefakte
leben in der Backlog-Zeile (`context/BACKLOG.md`), NICHT im
Frontmatter oder Body der Artefakt-Dateien.

Code-Pfade leben in `src/ARCHITECTURE.map` plus JSDoc-Header in
Entry-Files. ADR-Kern-Sektionen (Context, Decision, Consequences)
fuehren KEINE Code-Pfade.

## Lifecycle und Loeschung

Done-Artefakte bleiben am Platz (Audit-Trail des Substanz-Inhalts).
Veraltete Artefakte werden geloescht, nicht archiviert. Es gibt
keinen `archive/`-Ordner irgendwo in `_devprocess/`. Die Git-Historie
ist der Forensik-Kanal.

## Enforcement

`/consistency-check` (Mode A, syntactic) prueft die Praefix-Konvention
am Ende jeder Phase. Dateien in `analysis/` ohne erlaubten Praefix
werden als Drift gemeldet. Skills schreiben nur in ihre erlaubten
Verzeichnisse mit ihren erlaubten Praefixen.
