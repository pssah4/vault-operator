---
id: PLAN-19
title: FEAT-24-05 — Sidebar cost / token / cache-hit display
date: 2026-05-13
feature-refs: [FEAT-24-05]
adr-refs: []
fix-refs: []
imp-refs: []
supersedes: null
superseded-by: null
pair-id: sebastian-opus-4-7
---

# PLAN-19: FEAT-24-05 — Sidebar cost / token / cache-hit display

<!-- Backlog row carries status/phase/SHAs: grep "PLAN-19" _devprocess/context/BACKLOG.md -->

## Context

EPIC-24 Welle 2, RESEARCH-36 Hebel I. After Welle 1 wired `cached_tokens` into the
usage stream (IMP-18-01-02), the sidebar cost footer already shows in/out tokens and
EUR cost but not the cache-hit rate, and there is no signal when a task gets expensive.
Pure UI/telemetry, no ADR. The diagnostic precursor is IMP-24-05-01 (`logCacheStat.ts`).

## Scope

In: cache-hit-rate segment in the footer; `costWarnThresholdEur` setting + a warn style
on the footer when the running cost crosses it; pass `cacheCreationTokens` through to the
footer formatter. Out: OpenTelemetry tool-call spans (deferred, noted in the FEAT spec);
a settings-UI control for `costWarnThresholdEur` (the key exists; surfacing it in the
Advanced settings tab can follow).

## Tasks

1. `src/core/telemetry/TaskTelemetry.ts` — add `cacheHitRate(input, read, write)` (mirrors
   `logCacheStat`: `read / (input + read + write)`, rounded; null when no cache activity);
   `formatTelemetryFooter` gains an optional `cacheCreationTokens` and appends `· N% hit`
   when there is cache activity.
2. `src/ui/sidebar/TaskMonitor.ts` — pass `cacheCreationTokens` through; toggle the
   `agent-cost-warn` class on `footerEl` when `cost.totalEur >= costWarnThresholdEur` (0 disables).
3. `src/types/settings.ts` — `AdvancedApiSettings.costWarnThresholdEur?: number`, default 0.5.
4. `styles.css` — `.message-footer.agent-cost-warn` (warning color + semibold).
5. Tests — `src/core/telemetry/__tests__/TaskTelemetry.test.ts`: `cacheHitRate` (no-activity,
   reads-over-total, pure-write 0%, rounding) and `formatTelemetryFooter` (no-cache, with-cache
   hit segment, pure-write, subscription marker).

## Verification

`npm run build` clean; `npx vitest run` green (1405 -> 1411, +6); `npm run deploy`; manual: a
running task's footer shows `… in · … out · … cached · N% hit · X¢`, and turns the warn style
on once the running cost reaches the threshold.

<!-- ========================================================= -->

## Coverage Gate

- [x] SC coverage: FEAT-24-05 SC is `[AWAITING RE]`; the richtwert (footer shows in/out, cost,
      cache-hit-rate during a task; a visible signal near the warn threshold) maps to tasks 1-4.
- [x] ADR alignment: n/a (no ADR — pure UI).
- [x] Codebase anchoring: TaskTelemetry.ts, TaskMonitor.ts, settings.ts, styles.css, the new test file.
- [x] Verify commands: `npm run build`, `npx vitest run`, `npm run deploy`.

| FEATURE-SC | Task | Status |
|---|---|---|
| FEAT-24-05 (footer shows in/out + cost + cache-hit-rate; warn signal) | Tasks 1-4 | Mapped (richtwert, SC AWAITING RE) |

## Change Log

### 2026-05-13: Plan created and implemented

Tasks 1-5 done in one pass (commit on `feature/feat-24-05-sidebar-kosten-anzeige`). Build clean,
1411 tests green.

## Implementation Notes

- `cacheHitRate` deliberately mirrors `src/api/logCacheStat.ts` so the sidebar number equals the
  `[CacheStat:<provider>]` console line.
- The warn is on cost (EUR), not token count; it applies even on subscription providers (the
  would-be API spend is the meaningful figure to flag). `costWarnThresholdEur: 0` disables it.
- `formatTelemetryFooter` only adds the `· N cached` segment when `cacheReadTokens > 0`, but adds
  `· N% hit` whenever there is *any* cache activity (reads or writes) — so a cache-write turn shows
  `0% hit` without a misleading `0 cached`.
- Not executed: OpenTelemetry tool-call spans (FEAT spec marks it "mittelfristig"); a settings-tab
  control for `costWarnThresholdEur`.
