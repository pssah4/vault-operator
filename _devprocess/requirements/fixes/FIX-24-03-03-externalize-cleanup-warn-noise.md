---
id: FIX-24-03-03
feature: FEAT-24-03
epic: EPIC-24
adr-refs: [ADR-63]
plan-refs: []
depends-on: []
created: 2026-05-21
---

# FIX-24-03-03: EPERM-Warning-Flood beim tmp-Cleanup auf iCloud

## Symptom

Live-Test 2026-05-21 (FEAT-29-10 meeting-summary Subskill) erzeugte 2x:

```
[Externalize] Cleanup failed after retries (non-fatal, will retry on next plugin start):
Error: EPERM: operation not permitted, unlink '/Users/.../iCloud~md~obsidian/Documents/NexusOS/.vault-operator/cache/tmp/task-1779367033352-sub-...'
```

Tritt zuverlaessig bei iCloud-synced Vaults auf, weil der iCloud-File-Provider waehrend Sync-Windows einen transienten Lock auf das Directory haelt. Die tmp-Files bleiben liegen, aber `ResultExternalizer.cleanupOrphaned` raeumt sie beim naechsten Plugin-Start ab. Das Warning ist nicht actionable und floodet die Konsole.

## Cause

`src/core/tool-execution/ResultExternalizer.ts` Zeile ~290:

```ts
const delays = [0, 150, 500];
```

700ms-Fenster ist fuer iCloud-Sync zu kurz. Wenn alle 3 Versuche EPERM zurueckgeben, faellt der Code auf `console.warn`. Aber Warn ist die falsche Severity: das Verhalten ist erwartet, der Orphan-Sweeper handhabt es, der User kann nichts tun.

## Fix

Zwei kleine Aenderungen in ResultExternalizer.ts:

1. Retry-Schedule auf `[0, 150, 500, 1500]` erweitern. 2200ms-Fenster faengt mehr iCloud-Sync-Windows ab. Nicht laenger weil sonst der `cleanup()`-Call selbst zu langsam wird.
2. Wenn ALLE Retries mit transient errors (EPERM/EBUSY/ETXTBSY) endeten, log das Cleanup-Failure als `console.debug` statt `console.warn`. Echte Fehler (ENOENT, permission anders, etc.) bleiben Warn.

Keine Verhaltensaenderung -- nur weniger Console-Noise und ein leicht laengeres Retry-Fenster.

## Regression test

`ResultExternalizer.test.ts` hat schon Tests fuer `removeWithRetry` (BUG-023). Neue Tests:

- Wenn cleanup mit anhaltendem EPERM endet -> `console.debug` getriggert, nicht `console.warn`.
- Wenn cleanup mit ENOENT endet -> `console.warn` getriggert (Verhalten unveraendert).
- Retry-Schedule hat 4 Versuche statt 3 (Zaehlen der Mock-Calls).

## How tested

1. Vitest gruen.
2. Live-Smoke: erneuter FEAT-29-10-Subskill-Run im iCloud-Vault, beobachten ob der Warn-Flood verschwunden ist.
