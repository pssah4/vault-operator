# Feature: Cross-Platform TMP-Pfade fuer Context Externalization

> **Feature ID**: FEATURE-1803
> **Epic**: EPIC-018 (Token-Kostenreduktion)
> **Priority**: P1
> **Effort Estimate**: S
> **Status**: Geplant
> **Bug-Bezug**: BUG-014, Issue #29
> **Bezogene Features**: FEATURE-1802 (Context Externalization)
> **Bezogene ADRs**: ADR-063 (Context Externalization)

## Feature Description

Context Externalization (FEATURE-1802) schreibt grosse Tool-Results nach `tmp/<task-id>/<tool>-<n>.md`. Auf Windows funktioniert das Schreiben, aber das Folge-`read_file` schlaegt fehl. Ursache: implizite Forward-Slash-Annahme, fehlendes rekursives mkdir, kein Aufruf von `normalizePath` aus dem Obsidian-API. Das Feature macht das Pfad-Handling cross-platform-tauglich.

## User Story

**Als** Obsidian-User auf Windows mit MCP-Connector
**moechte ich** dass der Agent grosse Tool-Results in tmp-Files schreibt und sie nachher wieder lesen kann
**um** die gleichen Workflows zu haben wie macOS- und Linux-User.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | tmp-Verzeichnis wird auf Windows beim ersten Aufruf korrekt erstellt | 100% | Smoke-Test in Windows-VM |
| SC-02 | Geschriebene tmp-Dateien lassen sich vom Agent ueber `read_file` re-lesen | 100% | Integration-Test |
| SC-03 | Cleanup-Routine entfernt tmp-Verzeichnisse auf Windows korrekt | 100% | Manueller Test |
| SC-04 | macOS- und Linux-Verhalten unveraendert | Kein Regress | Bestehende Tests gruen |
| SC-05 | Pfad-Empfehlung im Reference-String nutzt forward-slashes konsistent | 100% | Code-Review |

## Out of Scope

- Migration aller File-Operationen auf einen einheitlichen Pfad-Adapter (eigenes Refactor-Feature).
- File-System Performance Tuning.
- Extended Cleanup-Strategien (z.B. nach Plugin-Reload).

## Verifikation

1. Build: `npm run build` ohne Fehler.
2. Unit-Test mit Mock-FileAdapter, der prueft dass mkdir rekursiv (oder Parent-First) aufgerufen wird.
3. Live-Test in einer Windows-VM oder GitHub Actions Windows-Runner: grosses search_files-Result, dann read_file darauf.
4. Regression: macOS-Setup, gleiche Sequenz, kein Verhaltensunterschied.
