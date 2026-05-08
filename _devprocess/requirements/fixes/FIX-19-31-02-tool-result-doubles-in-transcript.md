---
id: FIX-19-31-02
feature: FEAT-19-31
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-08
---

# FIX-19-31-02: Tool-Result-Doubles im Chat-Transkript bei /ingest-deep

## Symptom

Live-Test 2026-05-08 (`/ingest-deep` auf EnBW-PDF). Im
Chat-Transkript erscheint jeder `<content>`-Block des
`read_document`-Tools zweimal hintereinander mit identischem
Inhalt. Beobachtet bei Pages 1-8 und Pages 9-20. Auch die
`<todo_update items="8" done="0">`-Zeilen tauchen doppelt auf.

User-Beobachtung: "Errors habe ich die im Chat Codeblock uebergeben"
-- gemeint sind diese Doppel-Outputs. Keine roten Tool-Error-Boxen,
keine sichtbaren Stack-Traces. Funktional scheint der Skill-Run
nicht beeintraechtigt (Triage, Mirror, Take-Aways laufen durch),
aber Token-Kosten verdoppeln sich pro Tool-Call.

## Root cause

Diagnose-pending nach erstem Pass. Tool-Side ausgeschlossen:
`ReadDocumentTool` macht genau einen `pushToolResult` pro Pfad
(`src/core/tools/vault/ReadDocumentTool.ts:140`/`:143`).

Verbleibende Kandidaten:

1. **ChatView Render-Doppelung**: tool_result wird zweimal in den
   View geschrieben (z.B. einmal beim live-stream-update, einmal beim
   Final-state-flush). Devtools-Inspect des DOM wuerde das zeigen.

2. **AgentTask-Pipeline ruft Tool zweimal**: Skill-Workflow oder
   Power-Steering-Reminder triggert einen erneuten Tool-Call mit
   identischen Args. `[InputBreakdown]` zeigt `33 tools` stabil ueber
   alle messages -- spricht **gegen** Doppel-Calls.

3. **Stream-Concat-Bug im Provider-Adapter**: Bedrock event-stream
   chunks werden bei der Reassembly doppelt appended. User nutzt
   `eu.anthropic.claude-sonnet-4-6` via Bedrock. Differenzialtest mit
   OpenRouter wuerde das eingrenzen.

4. **Skill-Verlauf-Replay**: Doppel-Output kommt vom Skill-Wiedergabe-
   Header, der die letzten Tool-Calls noch einmal als Kontext zeigt.
   Wenig wahrscheinlich, aber pruefbar mit `grep -c "<content"` im
   Transcript-Export.

Vermutung nach Diagnose-Pass: Hypothese 1 (Render-Double) ist am
wahrscheinlichsten, weil Hypothese 2 ist schon am InputBreakdown-Counter
erkennbar ausgeschlossen, und die Doppel-Outputs sind exakt identisch
(kein Drift) was bei einem Stream-Concat-Bug eher ungewoehnlich waere.

Reproducer: ein Tool-Call mit gut sichtbarer Ausgabe (`list_files .`)
absetzen und im DevTools-DOM nachschauen, ob der `<content>`-Block
zweimal im DOM oder nur einmal mit doppeltem Text steht.

Memory-Kontext: BUG-017 (Wave-1 Beta) hatte ein verwandtes
tool_use/tool_result Pairing-Problem, das via `sanitizeHistoryForApi`
in 3 createMessage-Stellen erschlagen wurde. Provider-Adapter sollte
gegen Doppel resistent sein -- falls hier Regression, wuerde es einen
neuen Pfad treffen, nicht die alten drei.

## Fix

Offen, abhaengig von der Diagnose:

1. Reproducer auf zwei Provider (Bedrock vs. OpenRouter) -- wenn nur
   Bedrock: Stream-Concat-Bug.
2. DOM-Inspect waehrend des `/ingest-deep`-Runs -- wenn Doppel im DOM
   aber nicht in der `[InputBreakdown]`-History: Render-Doppel.
3. AgentTask-Logging fuer Tool-Calls aktivieren und zaehlen, wieviele
   `read_document`-Calls real abgesetzt werden.

Implementation pointer: noch offen, abhaengig vom Diagnose-Ergebnis.

## Regression test

Sobald Hypothese bestaetigt: deterministischer Test, der einen
einzelnen `read_document`-Call abfeuert und assertiert, dass genau
ein `<content>`-Block im Transcript landet (nicht zwei).

## Status

See the backlog row for FIX-19-31-02 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).
