---
id: IMP-24-04-01
feature: FEAT-24-04
epic: EPIC-24
adr-refs: [ADR-113]
plan-refs: []
audit-refs: []
depends-on: []
created: 2026-05-13
---

# IMP-24-04-01: research-Profile Completion-Disziplin -- Subagent liefert Meta statt Inhalt

## Motivation

MESSLAUF Test 3 Aktion A (Live, 2026-05-13):

Parent ruft Subagent mit klarer Output-Spezifikation:

> "Liste die 5 wichtigsten Notizen mit Pfad + 2-Satz-Kurzfassung jeweils.
> Gib das Ergebnis kompakt zurueck."

Subagent fuehrt 1 semantic_search + 2 search_files + 4 read_file aus
(~$0.48 Cost) und ruft `attempt_completion` mit:

> "Recherche abgeschlossen. 5 relevanteste Notizen zu Innovation/Strategie
>  identifiziert aus semantic_search (26 Treffer) und search_files (50+
>  Treffer je Pattern)."

Das ist Meta-Acknowledgement, NICHT die geforderte Top-5-Liste mit
Pfad + Kurzfassung. Der Parent merkt das und fuehrt das gleiche
Recherche-Programm NOCHMAL aus (~$1.11 Cost) um die echte Liste zu
generieren.

**Cost-Schaden:** $0.48 Subagent + $1.11 Parent-Followup = **$1.59
total** fuer eine Aufgabe die der Subagent allein loesen sollte
(~$0.50 erwartet). Untergraebt die FEAT-24-04 Kostenmotivation.

## Root cause

`src/core/agent/subagent-profiles.ts:51-65` (RESEARCH_PROFILE.roleDefinition):

```
'- When the question is answered, call attempt_completion with a',
'  short summary that cites the sources you read. The parent only',
'  sees this summary, not your intermediate tool calls.',
```

Das Modell liest "short summary" als "Meta-Bericht" statt als
"konkreter Output den der Parent angefragt hat". Die roleDefinition
betont Kompaktheit, aber nicht Vollstaendigkeit der Antwort.

## Vorschlag

`RESEARCH_PROFILE.roleDefinition` umformulieren -- den
Completion-Schritt staerker an die Parent-Anfrage binden:

```
'- The attempt_completion call MUST contain the actual answer the',
'  parent asked for, not a meta-acknowledgement. If the parent asked',
'  for a list of N items with field A and B, return that exact list',
'  in the completion. The parent NEVER sees your intermediate tool',
'  calls, so the completion must stand on its own.',
'- "Short" means concise, NOT abbreviated -- if the parent asks for',
'  5 items with 2-sentence summaries each, deliver all 5 with their',
'  summaries.',
'- Cite sources by vault path (e.g. "Notes/Innovationsmanagement.md")',
'  inline with each item.',
```

Plus optional ein konkretes Anti-Pattern Beispiel im Prompt:

```
'Anti-pattern: do NOT write "Found 5 relevant notes" -- write the',
'5 notes themselves with the requested fields.',
```

## Success Criteria

- SC-1: research-Profile-Spawn fuer die Test-3-Anfrage liefert die
  Top-5-Liste DIREKT als attempt_completion-Inhalt.
- SC-2: Parent fuegt keine eigenen Folge-Tool-Calls hinzu -- die
  Antwort steht in der Subtask-Summary komplett da.
- SC-3: Cost pro Run < $0.80 (vs aktuell $1.59 mit Doppel-Suche).

## Status

Done 2026-05-13. roleDefinition in `subagent-profiles.ts` umformuliert
(11 neue/aenderte Zeilen): explizite Forderung dass attempt_completion
den konkreten Output enthalten muss, Anti-Pattern-Beispiel, "compact"
= "concise wording, NOT abbreviated content" Klarstellung. Regression-
Test in `subagent-profiles.test.ts` pinnt die drei Eigenschaften
(actual-answer, anti-pattern, compactness-meaning). 1479 Tests gruen
(+1), tsc clean, build+deploy gruen. Manuelle Live-Verifikation via
Re-Run von MESSLAUF Test 3 Aktion A ausstehend -- Erwartung: Subagent
liefert Top-5-Liste direkt in attempt_completion, Parent macht keinen
Doppel-Lauf.
