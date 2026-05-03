# Feature: Output-Modus-Auswahl

> **Feature ID**: FEAT-19-24
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.6
> **Priority**: P0
> **Effort Estimate**: M

## Feature Description

Drei konfigurierbare Output-Modi steuern wie Ingest-Resultate im Vault manifest werden:

- **Modus 1 Source-only:** Nur Original-Source als Note, kein Sense-Making-Note.
- **Modus 2 Source plus Summary-Note (Karpathy-Default):** Eine konsolidierte Sense-Making-Note pro Source.
- **Modus 3 Source plus Multi-Zettel (Zettelkasten):** Mehrere atomare Zettel-Notes pro Source plus bibliographische Summary-Note (FEAT-19-30).

Settings-Default: Modus 2. Pro Ingest ueberschreibbar (in Dialog-Modus explizit Teil des Plans). System-Default-Empfehlung weil Karpathy-Standard.

## Benefits Hypothesis

Wir glauben, dass User selbst bestimmt, wie sein Vault wachsen soll. Folgende messbare Outcomes liefert: > 70% der User waehlen Modus 2 als Default; Modus 3 wird primaer von Zettelkasten-Praktikern aktiviert (BA-25 H-17).

Wir wissen, dass wir erfolgreich sind, wenn Adoption der Modi der Schaetzung entspricht und kein User durch Fehl-Defaults frustriert ist.

## User Stories

**Story 1:** Als Casual-User moechte ich, dass das System mit einem sinnvollen Default startet, ohne dass ich Vault-Pattern-Wissen brauche.

**Story 2:** Als Sebastian moechte ich Modus 3 (Multi-Zettel) waehlen koennen, weil das meiner Zettelkasten-Praxis entspricht.

**Story 3:** Als User moechte ich pro Ingest entscheiden, welcher Modus passt, weil eine technische Source anders behandelt werden sollte als eine philosophische.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Default ist Modus 2 | System-Default | Manueller Test |
| SC-02 | Pro Ingest kann Modus ueberschrieben werden | Per-Action-Override | UI-Test |
| SC-03 | Modus-Wechsel verarbeitet keine bestehenden Sources retroaktiv | Idempotenz | Unit-Test |
| SC-04 | Jeder Modus erzeugt korrekte Note-Struktur | Modus-spezifischer Output | Integration-Test |
| SC-05 | Settings-UI zeigt Modus-Beschreibung mit Use-Case | UI-Test | Manueller Test |

## Technical NFRs

- **Performance:** Modus-Auswahl ist Settings-Lookup, < 1ms.
- **State:** Modus-Decision wird mit Triage-Action verbunden, persistiert in DB.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Output-Modus-Architektur (Note-Generierung pro Modus, Folder-Konfiguration, Frontmatter-Konventionen) ist ADR-Bedarf.
- **ASR-2 (Moderate):** Modus-Wechsel ohne Re-Verarbeitung ist Default; explizite "Re-process"-Action separat.

## Definition of Done

- Settings-Schema fuer Default-Modus.
- Per-Ingest-Override-UI im Triage-Karte.
- Modus-spezifische Generator-Pipelines.
- Test-Suite mit allen drei Modi.
- Settings-UI mit Modus-Beschreibung und Use-Case-Hint.
