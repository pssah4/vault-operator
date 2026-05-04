# BUG-027: SandboxBridge circuit-breaker stays open, permanently blocks evaluate_expression

> **Priority:** P1 (once tripped, whole agent session can't run sandbox code)
> **Epic:** EPIC-05 (Sandbox)
> **Date:** 2026-04-19
> **Discovered:** Beta-10 BRAT test

## Problem

During a Fast-Path recipe run (orphan analysis), the agent made a series
of `ctx.vault.list('Notes/')` calls that all failed with "Not a folder:
Notes/" (trailing slash, see BUG-028). Each failure flipped the
consecutive-error counter; after 20 failures the circuit breaker
tripped:

```
<error>SandboxBridge circuit open — too many consecutive errors. Reset the sandbox.</error>
```

From that point on, every subsequent sandbox call -- including trivial
`return 1 + 1` expressions -- returned the same error. The breaker
never reset. The agent could not recover for the rest of the session.

## Causal Chain

1. Agent hallucinates a folder path with a trailing slash (`'Notes/'`).
2. Sandbox forwards to `SandboxBridge.vaultList`, which throws
   `Not a folder: Notes/` because `getAbstractFileByPath('Notes/')`
   returns null in Obsidian (BUG-028).
3. The sandbox worker side catches the rejection and calls
   `bridge.recordError()`, bumping `consecutiveErrors`.
4. Agent retries with a slightly different shape, 20+ times.
5. `recordError` trips `circuitOpen = true` on the 20th hit.
6. `checkCircuitBreaker` now throws `"circuit open"` on every call,
   including unrelated ones like `return "ping"`.
7. The message says "Reset the sandbox" but there is no user-facing
   reset affordance; only `resetCircuitBreaker()` exists on the
   class, not wired anywhere.

## Root Cause

The circuit was designed as a one-shot trip with manual reset, but
nothing calls `resetCircuitBreaker()` in practice. Once tripped, the
bridge is effectively dead for the session.

## Fix

- New `CIRCUIT_COOLDOWN_MS = 30_000` and `lastErrorAt` timestamp.
- `checkCircuitBreaker()` now auto-resets when the cooldown has
  elapsed since the last `recordError()`. The caller then attempts
  the operation; success clears the counter, failure re-trips the
  breaker and restarts the cooldown.
- `recordSuccess()` also sets `circuitOpen = false` explicitly, so a
  probe that lands in the recovery window closes the circuit for
  good.
- Error message now tells the user how many ms remain before the
  auto-reset.

## Risk

- Very low. 30 s is long enough that a true abuse pattern (tight
  loop hammering a non-existent path) still gets throttled for a
  meaningful window. A legitimate burst of short-lived errors followed
  by recovery (the typical agent pattern) now resolves without manual
  intervention.
- The probe-and-reset behaviour is deterministic: one test-probe per
  cooldown window, success/fail updates state the same way the
  original breaker did.

## Test Plan

Two new unit tests in `SandboxBridge.vaultList.test.ts`:

- Trip the breaker with 20 recordError calls, rewind `lastErrorAt`
  31 s, verify the next call succeeds.
- After the successful probe, verify `circuitOpen === false` and
  `consecutiveErrors === 0` so follow-up calls are fast.

## References

- Console trace from Beta-10 BRAT test (2026-04-19).
- BUG-028: trailing-slash path normalisation, removes the common
  upstream trigger that caused the breaker to trip in the first place.
