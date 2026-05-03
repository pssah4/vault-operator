---
id: FIX-03-18-01
feature: FEAT-03-18
epic: EPIC-03
adr-refs: []
plan-refs: [PLAN-07]
depends-on: []
created: 2026-05-03
---

# FIX-03-18-01: SingleCallProcessor budget-exhausted Test schlaegt fehl wegen Mock-Setup

## Symptom

`npx vitest run src/core/memory/__tests__/SingleCallProcessor.test.ts` zeigt 1 Fehler:

```
FAIL  src/core/memory/__tests__/SingleCallProcessor.test.ts > SingleCallProcessor (PLAN-007 task C.1) > skips extraction when the token budget is exhausted
Error: test setup forgot to assign nextMockApi
 ❯ buildApiHandlerForModel src/core/memory/__tests__/SingleCallProcessor.test.ts:115:33
```

**Pre-existing**, nicht von BA-25 verursacht. Beim BA-25-Test-Pass am 2026-05-03 entdeckt im Final-Sync von PLAN-14 (`npx vitest run` 1112/1113 gruen).

## Root Cause (vermutet, zu verifizieren)

Der Test "skips extraction when the token budget is exhausted" hat in `nextMockApi = ...` keine Zuweisung. Vermutlich wurde der Test mit der Annahme geschrieben, dass `process()` bei erschoepftem Budget gar nicht erst `buildApiHandlerForModel()` aufruft. Wenn das aber doch passiert (z.B. wegen Aenderung in der Reihenfolge der Budget-Checks im SingleCallProcessor), wird der Mock-Throw getriggert.

Causal-chain (zu verifizieren):
1. Test gibt `tokenBudget` mit Limit reached an Processor.
2. Processor ruft `buildApiHandlerForModel()` auf BEVOR Budget gecheckt wird (oder umgekehrt).
3. Mock wirft 'test setup forgot to assign nextMockApi'.
4. Test failt mit confusing-message statt expected `budget-exhausted` event.

## Fix (offen)

Entweder:
- (a) Test-Setup ergaenzen: `nextMockApi = mockApi({...})` vor `proc.process(...)`, damit der Processor den Budget-Check intern macht.
- (b) Processor-Reihenfolge umstellen: Budget-Check VOR Mock-Bau.

Welche Option richtig ist haengt vom intended Behavior von SingleCallProcessor ab. Pruefen welcher Pfad Phase-4-Spec entspricht.

## Regression test

(noch zu schreiben)

Zwei Test-Cases:
- Budget exhausted vor LLM-Call: kein `buildApiHandlerForModel`-Aufruf, `budget`-Event gefeuert.
- Budget OK: normaler Flow.
