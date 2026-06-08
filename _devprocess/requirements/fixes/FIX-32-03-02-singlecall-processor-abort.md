# FIX-32-03-02: SingleCallProcessor AbortController + cancelInFlight bei Plugin-Reload

**Prioritaet:** P3 (Reload-mid-Extraction wirft closed-DB Errors, Retry-Spam in Console)
**Datei:** SingleCallProcessor + ExtractionQueue + main.ts.onunload
**Feature-Bezug:** EPIC-32, FEAT-32-03 (Welle 3 Robustheit)
**Entdeckt:** Hardening-Audit 2026-06-07 (Audit-Finding 18)
**Status:** Deferred (Phase: Candidates)

---

## Problem

Wenn Sebastian Obsidian reloadet waehrend eine Memory-Extraktion laeuft, wirft das Plugin closed-DB Errors und der ExtractionQueue-Catch produziert Retry-Warn-Spam. Saubere Cancellation gibt es nicht.

## Vorgeschlagene Loesung

1. `SingleCallProcessor.process(item, signal?)` akzeptiert ein optionales `AbortSignal`.
2. `ExtractionQueue.processQueue` speist einen `AbortController` an `process`.
3. `main.ts.onunload` ruft `extractionQueue.cancelInFlight()` VOR `memoryDB.close()` auf.
4. Post-extract: re-check `memoryDB.isOpen()` umschliesst den Post-Extract-Block (budget.record, telemetry, integrator.integrate, writeSessionSummary, deltaStore.save).
5. AbortError im processQueue-catch -> kein retry-warn-spam, AbortError flippt `sessionDisabledReason` nicht.

## Akzeptanzkriterien

- Reload mid-Extract wirft keine closed-DB-Errors in der Console.
- Kein Retry-Spam nach Reload.
- AbortError flippt `sessionDisabledReason` nicht.
- Normaler Run ohne Reload bleibt unveraendert.

## Out-of-Scope

- Aenderung am ExtractionQueue Retry-Backoff (FIX-32-03-03).
- Aenderung am SingleCallExtractor-Tool-Schema.
