---
id: PLAN-36
title: FEAT-29-07 Permission + Latency Polish (adaptive timeouts + auto-promotion)
date: 2026-05-21
feature-refs: [FEAT-29-07]
adr-refs: []
fix-refs: []
imp-refs: []
pair-id: 36
---

# PLAN-36 -- FEAT-29-07 Permission + Latency Polish

> Backlog row: `_devprocess/context/BACKLOG.md` -> PLAN-36

## Context

`call_plugin_api` heute hat zwei Reibungspunkte:

1. Hardcoded 10s timeout (`API_CALL_TIMEOUT = 10_000` in CallPluginApiTool.ts:28). Bei grossen Dataview-Queries oder Omnisearch-Reindex laeuft das in Timeout.
2. Tier-2-Methoden (von VaultDNAScanner dynamisch entdeckt) werden default als `isWrite=true` markiert. Auch lesende Calls (`getTasks()`, `pages()`, `query()`) verlangen Approval. Klick-Friktion.

FEAT-29-07 adressiert beide Achsen ohne breaking changes am existing Allowlist-Mechanismus.

## Tasks

### Task A: settings.pluginApi schema

Files:
- `src/types/settings.ts` -- erweitere `PluginApiSettings`:
  - `defaultTimeoutMs?: number` (default 10000, max 300000)
  - `pluginTimeoutMs?: Record<string, number>` (per-pluginId override)
  - `autoPromotionEnabled?: boolean` (default true)
  - `autoPromotionThreshold?: number` (default 3)
  - `approvalCounts?: Record<string, number>` (key: `pluginId:method`)
- `DEFAULT_SETTINGS.pluginApi` -- defaults setzen

### Task B: pure helpers + tests

Files:
- `src/core/tools/agent/pluginApiAdaptive.ts` (neu):
  - `classifyMethodIsWrite(method: string): boolean` -- `^(get|list|find|query|fetch|read|search|count|has|is|describe)` -> false, sonst true
  - `MAX_TIMEOUT_MS = 300_000` (5 min hard cap)
  - `resolveTimeoutMs(settings, pluginId): number` -- per-plugin override > default > 10000, gekappt auf MAX
  - `recordApprovalAndMaybePromote(settings, pluginId, method): { promoted: boolean, newCount: number }` -- inkrementiert approvalCounts, bei threshold-erreicht: classifyMethodIsWrite -> if false then safeMethodOverrides[key]=true, returns promoted=true. mutiert settings in-place.
- `src/core/tools/agent/__tests__/pluginApiAdaptive.test.ts` -- pinnen jeden Branch der Helpers

### Task C: CallPluginApiTool nutzt resolveTimeoutMs

Files:
- `src/core/tools/agent/CallPluginApiTool.ts`
  - `API_CALL_TIMEOUT` const raus
  - In `execute()`: `const timeoutMs = resolveTimeoutMs(this.plugin.settings.pluginApi, pluginId)`
  - Error-Message: konkrete ms-Zahl

### Task D: ToolExecutionPipeline -- auto-promotion-Hook

Files:
- `src/core/tool-execution/ToolExecutionPipeline.ts`
  - In dem Branch wo `call_plugin_api` ein Approval bekommt (decision === 'approved'), rufe `recordApprovalAndMaybePromote` auf und persistiere settings (this.plugin.saveSettings()) -- aber non-blocking, kein await im Hot-Path

### Task E: ShellTab UI

Files:
- `src/ui/settings/ShellTab.ts`
  - Per-Plugin Timeout-Override-Section
  - Auto-Promotion-Toggle + Threshold-Input
  - Approval-Counts-Readout (sortiert nach count desc)

### Task F: ARCHITECTURE.map + build + commit + merge

- ARCHITECTURE.map row erweitern: `plugin-api-allowlist` referenziert `pluginApiAdaptive.ts`
- Build + full test suite
- Commit + merge to dev + push

## Coverage Gate

- SC-01 (per-plugin timeout) -- Task A + C + E
- SC-02 (3 approvals -> auto-promote) -- Task B recordApprovalAndMaybePromote + Task D wiring
- SC-03 (approval-prompts sinken) -- Live-Test post-merge
- SC-04 (timeouts sinken) -- Live-Test post-merge
- SC-05 (isWrite-Heuristik nachvollziehbar) -- Task B classifyMethodIsWrite + Tests

## Change Log

(Append-only.)
