# Feature: Scripts-im-Skill (Sandbox-Aufruf)

> **Feature ID**: FEAT-22-03
> **Epic**: EPIC-22 (Skill-Package Ecosystem)
> **Priority**: P1
> **Effort Estimate**: M

## Feature Description

Ein Skill-Ordner kann ausfuehrbare Scripts unter `scripts/` enthalten. Das
Skill-Markdown referenziert sie symbolisch (z.B. "Run
`scripts/extract.ts`"). Der Agent-Loop erkennt diese Verweise und bietet dem
LLM die Scripts als Sandbox-Artefakte an — aufrufbar ueber das bestehende
`evaluate_expression` Tool (ADR-21). Ausfuehrung passiert NIE automatisch;
jeder Script-Call braucht wie bisher User-Approval.

## User Stories

### Story 1: Skill mit Datenextraktion
**Als** Skill-Autor (Obsidian-Vault-Besitzer)
**moechte ich** in einem Skill "Bulk-PDF-Convert" ein Python-Script bundeln
das die Konvertierung durchfuehrt
**um** nicht die Logik inline im Markdown ausbreiten zu muessen.

### Story 2: Modulare Skill-Logik
**Als** Skill-Autor
**moechte ich** ein Script `scripts/helpers.ts` haben das von mehreren
Stellen im Skill-Markdown referenziert wird
**um** DRY zu bleiben.

### Story 3: Sicherer Default
**Als** User
**moechte ich** dass Skripts aus einem frisch importierten Skill nicht
automatisch laufen
**um** keine ungewollten Vault-Modifikationen zu erleiden.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Scripts im `scripts/` Ordner sind dem Agent ueber eine kompakte Liste bekannt (Filenames + erste Docstring-Zeile) | 100% | Loader-Inspection |
| SC-02 | Agent kann Script via `evaluate_expression(content)` aufrufen — Content wird aus Skill-Ordner gelesen | 100% | Integration-Test |
| SC-03 | Skript-Aufruf triggert immer die Sandbox-Approval (ADR-21) | 100% | Approval-Test |
| SC-04 | Supported Languages: .ts, .js (Sandbox-nativ). Python / Bash / .sh klingen durch, aber ohne Ausfuehrung — werden nur als Text gelistet, nicht ausgefuehrt | 100% | Doku + Test |
| SC-05 | Script-Dateien > 500KB werden mit klarer Warnung abgelehnt (Context-Limit) | 100% | Size-Test |

## Architektur-Hinweise

- `SelfAuthoredSkillLoader` listet Scripts nur (ausgefuehrt wird nicht er).
- Neuer optionaler Agent-Helper: wenn der LLM ein Script referenziert,
  wird der Script-Content via `read_file` / `evaluate_expression` eingereicht.
- **Supported script types im MVP:** TypeScript und JavaScript (werden vom
  bestehenden Sandbox-Executor ausgefuehrt). Python und Bash-Scripts bleiben
  als _Referenz-Text_ im Skill — der User muss sie selber ausfuehren oder
  in TS portieren.
- Security: kein `shell: true`, keine `child_process`-Execution. Alles ueber
  die bestehende Sandbox.

## Out of Scope

- Python/Bash Runtime im Plugin (waere echtes Security-Risiko + neue
  Dependency)
- Precompiled Binaries aus Skills
- Background-Scripts ohne User-Prompt

## Verifikation

1. Unit: Loader sammelt Script-Liste korrekt.
2. Integration: Agent ruft Script via `evaluate_expression`, Approval feuert.
3. Regression: Skills ohne Scripts funktionieren weiter.
