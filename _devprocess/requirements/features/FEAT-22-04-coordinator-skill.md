# Feature: Coordinator-Skill (Multi-Rolle in einem Ordner)

> **Feature ID**: FEAT-22-04
> **Epic**: EPIC-22 (Skill-Package Ecosystem)
> **Priority**: P1
> **Effort Estimate**: M
> **Obsilo-Extension**: Ueber Anthropic-Spec hinaus — dort gibt es keinen formalen Coordinator-Pattern.

## Feature Description

Ein Skill-Ordner kann neben der Haupt-`SKILL.md` zusaetzlich
mehrere `*.skill.md` Sub-Files enthalten (z.B.
`writer.skill.md`, `reviewer.skill.md`, `summarizer.skill.md`).
Die Haupt-`SKILL.md` ist dann ein **Coordinator** — er erklaert dem
Agent wann welche Sub-Rolle aktiviert werden soll, und delegiert per
Text-Instruktion ("Activate writer role, then pass to reviewer for
feedback"). Die Sub-Skill-Inhalte werden bei Bedarf via `read_file`
gelesen.

Das ist eine **Obsilo-Erweiterung** zur Anthropic-Spec: Anthropic-Skills
sind self-contained, haben kein Cross-Skill-Dispatch. Fuer Obsilos
Agent-Loop (der `new_task` und Mode-Switching schon kennt) ist dieses
Muster eine natuerliche Ergaenzung.

## User Stories

### Story 1: Writer / Reviewer Workflow
**Als** User
**moechte ich** einen Skill "research-synthesis" anlegen der:
1. Als "writer" einen Entwurf aus Quellen erstellt
2. Als "reviewer" den Entwurf auf Fact-Check + Klarheit prueft
3. Als "editor" die finale Version konsolidiert

**um** eine mehrphasige Wissensarbeit durch einen Skill zu bekommen ohne
pro Phase ein eigenes `new_task` zu starten.

### Story 2: Rolle per Kontext
**Als** User
**moechte ich** dass der Coordinator automatisch entscheidet welche Sub-Rolle
am besten passt
**um** nicht manuell delegieren zu muessen.

### Story 3: Rueckwaerts-Kompatibilitaet
**Als** User mit bestehenden Single-Role-Skills
**moechte ich** dass diese ohne Aenderung weiter funktionieren
**um** keine Migration zu brauchen.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Ein Ordner mit `SKILL.md` und 2+ `*.skill.md` Sub-Files wird als Coordinator erkannt | 100% | Loader-Test |
| SC-02 | Coordinator-Skill erscheint im System-Prompt mit Sub-Rollen-Liste (Name + Kurzbeschreibung jeder Sub-Rolle) | 100% | Prompt-Inspection |
| SC-03 | Agent kann per `read_file("scripts/role.skill.md")` die Sub-Rolle voll lesen | 100% | Integration-Test |
| SC-04 | Bestehende Single-Role-Skills funktionieren unveraendert | 100% | Regression |
| SC-05 | Sub-Skill-Files werden nicht als eigenstaendige Top-Level-Skills geladen (kein Doppel-Eintrag im Skill-Index) | 100% | Loader-Test |

## Architektur-Hinweise

- Frontmatter-Feld in Haupt-SKILL.md: `type: coordinator` (optional; wenn
  fehlt, verhaelt es sich wie heute).
- Bei `type: coordinator`: Loader sammelt alle `*.skill.md` aus demselben
  Ordner als Sub-Rollen ein (nur name + description aus deren Frontmatter).
- Sub-Rollen werden im System-Prompt unter dem Coordinator als
  Bullet-Liste aufgefuehrt ("Available sub-roles: writer — ...").
- Voller Sub-Rollen-Content wird on-demand geladen via `read_file`.
- `*.skill.md` Files ausserhalb eines Coordinator-Ordners bleiben
  eigenstaendige Skills (Backward-Compat).

## Out of Scope

- Automatische Rollen-Dispatch-Logik ueber eigenes Tool
- Parallele Sub-Rollen-Ausfuehrung
- Sub-Rollen-Ketten-Logging / Metriken

## Verifikation

1. Unit: Loader erkennt Coordinator + Sub-Rollen.
2. Integration: Agent-Task mit Coordinator, User-Anfrage "Create a synthesis"
   loest Writer + Reviewer Sub-Rollen-Usage aus.
3. Regression: alle bestehenden Skills ohne `type: coordinator` laufen weiter.
