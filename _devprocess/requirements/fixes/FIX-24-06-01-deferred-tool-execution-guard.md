---
id: FIX-24-06-01
feature: FEAT-24-06
epic: EPIC-24
adr-refs: [ADR-118]
plan-refs: []
audit-refs: []
depends-on: []
created: 2026-05-13
---

# FIX-24-06-01: Deferred-Tool-Execution-Guard fehlt -- Modell halluziniert Tool-Aufrufe

## Symptom

Im MESSLAUF Test 2 Teil C versuchte der Agent das Auto-Approval-Setting
zu setzen. Statt erst `find_tool({query: "settings"})` zu rufen (um
`update_settings` zu aktivieren), rief er das Tool DIREKT:

```
update_settings({path: "permissions.autoApproveNoteEdits", value: "false"})
-> <error>Setting path "permissions.autoApproveNoteEdits" is not writable...</error>
update_settings({path: "autoApproveNoteEdits", value: "false"})
-> <error>...is not writable...</error>
inspect_self({area: "settings"})  // auch deferred
-> <8000 chars JSON dump>
update_settings({path: "permissions.noteEdits", value: "false"})
update_settings({path: "autoApprove.noteEdits", value: "false"})
update_settings({path: "approvals.noteEdits", value: "false"})
-> alle Fehler, korrektes "autoApproval.noteEdits" nie versucht
```

Der Agent verbrannte ~77 cents (Sub-Pricing) auf Pfad-Raterei. Die
korrekte Path-Description (`'e.g. "autoApproval.noteEdits"'`) steht in
der `update_settings`-Schema-Description -- aber das Schema ist nicht im
Prompt, weil `update_settings` deferred ist.

## Root cause

ADR-118 FEAT-24-06 zweite Welle deferred-te `update_settings` und
`inspect_self` -- d.h. sie werden aus dem Tool-Schema-Block des
System-Prompts gefiltert. **Filter-Logik (`AgentTask.ts:548`) funktioniert
korrekt** (33 Schemas statt 57+ in `toolSchemas=6707t/33`).

ABER: die Execution-Pipeline hatte **keinen Guard**. Wenn das Modell
die Tool-Namen aus dem Training oder aus einer injizierten Recipe
(`[Mastery] Recipe section injected (1616 chars)`) hallucinierte,
wurde der Call trotzdem ausgefuehrt. Der Agent kannte den NAMEN aus
Vorwissen, aber nicht das SCHEMA (mit der `autoApproval.noteEdits`
Path-Example).

Folge: deferred-Filter spart Prompt-Tokens, verliert aber Schema-
Guidance fuer halluzinierte Calls -> mehr Cost (Pfad-Raterei) statt
weniger.

## Fix

`src/core/AgentTask.ts` -- in `runTool` direkt nach der Repetition-
Detection-Pruefung neuer Guard:

```ts
if (isDeferredTool(toolUse.name) && !activatedDeferredTools.has(toolUse.name)) {
    const msg =
        `Tool "${toolUse.name}" is deferred and must be activated before use. ` +
        `Call find_tool({ query: "<what you want to do>" }) first to discover and activate it.`;
    return { content: `<error>${msg}</error>`, is_error: true as const };
}
```

Effekt: halluzinierte Calls auf deferred Tools schlagen sofort fehl
mit einer klaren Handlungsanweisung. Der Agent wird zum `find_tool`-
Call gefuehrt, wo er das echte Schema mit Pfad-Examples bekommt.

## Regression test

Manueller Live-Check (MESSLAUF Test 2 Teil C nach Plugin-Reload):

1. Neuer Chat, Prompt "Schalte das Auto-Approval fuer Note-Edits aus."
2. Erwartet: erster Tool-Call ist `find_tool({query: "..."}`. Wenn
   dennoch `update_settings` direkt: tool_result enthaelt die
   Aktivierungs-Aufforderung mit `find_tool`.
3. Nach `find_tool`-Call: Agent ruft `update_settings({path:
   "autoApproval.noteEdits", value: false})` mit dem korrekten Pfad.

Kein automatischer Unit-Test: der Guard ist eine Closure innerhalb
von `AgentTask.run()`. Die deferred-Set-Membership ist bereits in
`toolMetadataConsistency.test.ts` (IMP-24-06-01) getestet.

## Status

Done 2026-05-13. 1477 Tests gruen (kein Test-Delta -- defensive Closure-
Guard ist nicht direkt isoliert testbar). lint 0 errors (nur pre-
existing security/detect-object-injection-Warnings unbeeinflusst), tsc
clean, build + deploy gruen.
