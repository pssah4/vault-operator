# FIX-32-03-03: ExtractionQueue failureCount + parkedItems Backoff

**Prioritaet:** P3 (Transient extraction errors fluten heute den Retry-Loop ohne Backoff)
**Datei:** ExtractionQueue + SingleCallProcessor (typed EmptyExtractionError)
**Feature-Bezug:** EPIC-32, FEAT-32-03 (Welle 3 Robustheit)
**Entdeckt:** Hardening-Audit 2026-06-07 (Audit-Finding 20)
**Status:** Deferred (Phase: Candidates)

---

## Problem

Bei transient errors (Provider Rate-Limit, kurzfristiger Netzwerk-Fehler, EmptyExtractionError) versucht die ExtractionQueue sofort wieder -- kein Backoff, kein Failure-Counter, keine Drop-Schwelle. Permanent-Errors werden nicht von transienten unterschieden.

## Vorgeschlagene Loesung

1. `PendingExtraction.failureCount: number` (persist round-trip, default 0 fuer v1-Items).
2. On transient error: shift in `parkedItems[]`, sleep 60s*N, weiter mit next item.
3. Hard-stop nur bei `isPermanentProviderError`.
4. Neuer `getQueueHealth(): { pending, parked, lastError? }` fuer Telemetry/UI.
5. `SingleCallProcessor` wirft typed `EmptyExtractionError` wenn weder facts noch errors -> `failureCount` bump.
6. Telemetry-Counter `memory.extraction.dropped` bei `failureCount >= 3`.

## Akzeptanzkriterien

- Transient error -> `failureCount=1`, retry next cycle.
- `failureCount=3` -> drop + telemetry.
- Permanent error -> hard-stop, kein Retry.
- `getQueueHealth` liefert konsistente Zaehler.
- Queue-State persistiert Reload-fest.

## Out-of-Scope

- AbortController-Plumbing (FIX-32-03-02).
- ContextComposer Pause-Notice (FIX-32-03-01).
- Re-Design der SingleCallExtractor-Pipeline.
