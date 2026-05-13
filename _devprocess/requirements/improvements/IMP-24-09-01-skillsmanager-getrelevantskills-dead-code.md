---
id: IMP-24-09-01
feature: FEAT-24-09
epic: EPIC-24
adr-refs: [ADR-116, ADR-62]
plan-refs: []
audit-refs: [AUDIT-019]
depends-on: []
created: 2026-05-13
---

# IMP-24-09-01: SkillsManager.getRelevantSkills Dead Code entfernen

## Motivation

Info-Finding F-1 aus AUDIT-019 (FEAT-24-09 Per-Item-Audit). Nach Entfernung von
`classifySkillsWithLlm` und `matchSkillsByKeywordAndTrigger` aus `AgentSidebarView` ist
`SkillsManager.getRelevantSkills(userMessage, toggles?)` aus dem `src/`-Tree nicht mehr
aufgerufen (`grep -rn "getRelevantSkills" src/` liefert nur die Definition).

Die Methode liest Skill-Bodies aus dem Vault, inlined sie XML-escaped im
`<available_skills>`-Format und ist Teil eines Pfads, der bei versehentlicher
Re-Aktivierung wieder pro User-Message Skill-Bodies in den System-Prompt-Tail
injizieren wuerde -- damit waeren ADR-62-Amendment (Cache-Praefix-Stabilitaet) und
ADR-116 (Active Skills on-demand) unterminiert.

Kein direkter Sicherheitsimpact heute (Methode wird nicht aufgerufen). Mittelbares
Drift-Risiko + Code-Hygiene-Item.

## Aenderung

- `SkillsManager.getRelevantSkills(userMessage, toggles?)` entfernen.
- Pruefen, ob `xmlEscape` nur dort genutzt wird; wenn ja, ebenfalls entfernen.
- Pruefen, ob `safeRegex`-Import nach der Entfernung noch noetig ist
  (`getRelevantSkills` nutzt `safeRegex(s.trigger, 'i')`; andere Methoden im
  `SkillsManager` rufen `safeRegex` nicht).
- Tests: vorhandene Tests fuer `SkillsManager` durchgehen, ggf. Aufrufer-Tests
  (sollten keine sein) anpassen.

## Verifikation

- `npm test` gruen.
- `grep -rn "getRelevantSkills" src/` liefert keine Treffer.
- `npm run lint` 0 errors.

## Abgrenzung

Dies ist Code-Hygiene; **kein** Bugfix und kein Security-Fix im engeren Sinne. Bewusst
kein FIX, weil es weder einen beobachtbaren Fehler noch ein aktiv ausnutzbares Risiko
gibt. Eigenes V-Model-Item (PLAN -> /coding -> /testing); kein /security-audit-Re-Run
noetig (keine neue Vertrauensgrenze).

## Status

Ready (Backlog).
