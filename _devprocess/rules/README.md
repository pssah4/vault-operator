# rules/ - Stabile Regelsets

Drei Dateien, kompakt, max 500 Zeilen total.

## Inhalt

| Datei            | Zweck                                                  | Max Zeilen |
|------------------|--------------------------------------------------------|------------|
| `technical.md`   | Stack, Build-Befehle, Konventionen, Test-Patterns      | 150        |
| `design.md`      | UI-Regeln, Farben, Spacing, Komponenten, Accessibility | 100        |
| `domain.md`      | Glossar, Geschaeftsregeln, Domaenenmodell, Invarianten | 100        |

## Wann welches Regelset laden

- **Immer:** `technical.md` (Konventionen gelten projektweit)
- **UI-Aenderung:** plus `design.md`
- **Fachlogik:** plus `domain.md`

## Wer schreibt hier?

- `/architecture` -- Owner aller drei Dateien. Aktualisiert sie wenn
  sich eine stabile Konvention aendert.
- `/coding` -- darf bei Mid-course-Discoveries Vorschlaege aus dem
  Code in die Rule-Sets ueberfuehren (mit Architect-Approval).

## Was hier NICHT hingehoert

- Modul-spezifische Details -> Modul-README in `src/{module}/README.md`
- Architektur-Entscheidungen -> ADRs in `_devprocess/architecture/`
- Code-Pfade -> ARCHITECTURE.map plus JSDoc-Header
- Kurzfristige Plaene -> PLAN-NNN
- Bug-Fixes -> FIX-NNN

## Budget-Kontrolle

Wenn die Summe ueber 500 Zeilen waechst:

1. Pruefen ob in Code ueberfuehrbar (Linter-Regel, Type-Constraint, Test)
2. Pruefen ob in eine ADR-Decision konsolidierbar
3. Komprimieren oder Dopplungen entfernen
4. Im Notfall: archivieren nach `_devprocess/architecture/legacy-tech-docs/`
