# IMP-19-19-01: Stufe-2 Klick startet Web-Pass direkt

**Prioritaet:** P2
**Feature-Bezug:** FEAT-19-19 (Stufe-2 Activity-Trigger plus Web-Search-Update-Pass), EPIC-19

## Problem

FEAT-19-19 ist als Done markiert, aber der Note-Open/Modify-Hint
zeigt heute nur einen Hinweis auf `@anti_echo_search` -- der User-
Klick startet **nicht** direkt den Web-Search-Pass. BA-25 12.2
spezifiziert: "Bei Klick 'Ja, pruefen': Light-Web-Search-Pipeline
mit 3-5 gezielten Queries, LLM-Synthese, Befunde im Vault-Health-
Modal."

Heute: User klickt -> `@anti_echo_search`-Tool wird beworben, muss
manuell aufgerufen werden. Friction-Stark, der "Ja, pruefen"-Knopf
ist im Spec-Sinne nicht echt.

## Scope

1. Stufe-2-Hint-UI: 2 Buttons "Ja, pruefen" und "Spaeter".
2. "Ja, pruefen": ruft direkt `anti_echo_search` ueber den
   AgentTask-Kanal auf, mit Cluster-Topic + last-external-check-Date
   als Input.
3. Result wird als Update-Vorschlag im Vault-Health-Modal angehaengt.
4. cluster_metadata.last_external_check wird aktualisiert.
5. Cooldown: gleicher Cluster max 1x pro Woche, max 5 Hints pro Tag.

## Akzeptanzkriterien

| ID | Criterion |
|---|---|
| AC-01 | "Ja, pruefen"-Klick startet direkt Web-Search-Pass ohne Tool-Aufruf |
| AC-02 | Result erscheint als Finding im Vault-Health-Modal |
| AC-03 | Cooldown wird respektiert |
| AC-04 | last_external_check wird nach Pass aktualisiert |

## Files

- `src/core/lint/Stufe2ActivityTrigger.ts`: direkter Tool-Call statt
  Hint-only.
- `src/ui/healthModal/Stufe2HintRow.ts`: Buttons + Action-Wiring.
