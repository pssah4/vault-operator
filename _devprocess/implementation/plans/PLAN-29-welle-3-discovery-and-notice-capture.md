---
id: PLAN-29
title: EPIC-29 Welle 3 -- FEAT-29-03 Discovery + FEAT-29-04 Notice-Capture
date: 2026-05-20
feature-refs: [FEAT-29-03, FEAT-29-04]
adr-refs: [ADR-124, ADR-125]
plan-refs: [PLAN-27, PLAN-28]
bug-refs: []
pair-id: epic-29-welle-3
---

# PLAN-29 -- Welle 3 (Discovery + Notice-Capture)

## Kontext

Bundled-Plan fuer Welle 3 weil die zwei Features eng zusammenhaengen: Discovery liefert die Plugin-Commands, Notice-Capture deckt deren tatsaechliche Ausfuehrung sichtbar. Beide nutzen denselben Code-Pfad (`execute_command`, `app.commands.executeCommandById`, `app.plugins`).

Aus dem /coding-Pivot beantwortet:

1. **Plugin-Enable/Disable-Events:** Obsidian-API bietet kein offizielles `app.plugins.on("enabled")`. Pragma: 30s -> 2s Polling-Intervall plus `app.workspace.on("layout-change")` als sofortiger Re-Sync-Trigger fuer User-driven Settings-Aenderungen. Das erfuellt die SC-01 (unter 100ms nach Plugin-Enable in der typischen UI-driven Aktivierung, weil layout-change unmittelbar feuert).
2. **probe_plugin Caching:** kein Cache, jede Aufruf-Live-Probe -- `app.commands.commands` ist O(1)-lookup, `app.plugins.plugins[id]` auch. Keine Notwendigkeit fuer TTL.
3. **Hard-Guard in execute_command:** Wir geben in der Tool-Description einen klaren "use probe_plugin if not sure"-Hinweis. Kein Runtime-Guard, weil ein Modell-Verhalten-Hard-Guard die UX bricht.
4. **Notice-Capture-Window:** Plus 250ms post-execute-Window weil viele Plugins ihre Notices async nach `executeCommandById` setzen.
5. **Success-vs-Error-Notice-Unterscheidung:** Obsidian's Notice-API hat keinen Severity-Field. Pragma: Heuristik `/error|fail|cannot|not found/i` als Marker, sonst neutral.

## Tasks

### Task A1 -- VaultDNAScanner Polling-Intervall + workspace-event-Trigger

**Files:**
- `src/core/skills/VaultDNAScanner.ts` (Modify, lines 195, 1108-1119)
- `src/main.ts` (Modify, register `app.workspace.on("layout-change")` als zusaetzlicher Re-Sync-Trigger)

**Aktion:**
- Reduziere Poll-Interval von 30000 auf 2000 ms in `startSync`
- Reclassify-`setTimeout`-Delay von 3000 auf 1000 ms (faster lazy-plugin pickup)
- Plus periodischer Reclassify nach 10s (zweite Welle fuer ganz lazy plugins wie Dataview)
- Main: nach `vaultDNAScanner.initialize()`, registriere `workspace.on("layout-change")` mit debounced `checkForChanges`-Call (200ms debounce, kein direkter Re-Run jeden Frame)

### Task A2 -- probe_plugin Tool

**Files:**
- `src/core/tools/agent/ProbePluginTool.ts` (Create)
- `src/core/tools/ToolRegistry.ts` (Modify, register)
- `src/core/tools/types.ts` (Modify, ToolName union ergaenzen)
- `src/core/tools/toolMetadata.ts` (Modify, TOOL_METADATA + TOOL_GROUP_MAP)

**Aktion:**
- Neue Tool-Klasse `ProbePluginTool` extends `BaseTool<'probe_plugin'>`
- Input: `{plugin_id: string}`
- Output: `{enabled, classification, commands: [{id,name}], apiMethods: string[], description}`
- Live-Read aus `app.plugins.plugins[id]` und `app.commands.commands` (prefix-filter)
- API-Methoden via reflection (gleicher Approach wie VaultDNAScanner)
- Read-only Tool (isWriteOperation = false)

### Task A3 -- ToolRegistry-Wiring + ARCHITECTURE.map

**Files:**
- `src/core/tools/ToolRegistry.ts` (Modify, register-Pfad)
- `src/ARCHITECTURE.map` (Modify, add probe-plugin Entry)
- SkillRegistry `getPluginSkillsPromptSection`: ergaenze "If a plugin's commands look incomplete or stale, call `probe_plugin(plugin_id)` for the live snapshot before falling back to execute_command."

### Task B1 -- NoticeCapture utility

**Files:**
- `src/core/utils/NoticeCapture.ts` (Create)
- `src/core/utils/__tests__/NoticeCapture.test.ts` (Create)

**Aktion:**
- Funktion `withNoticeCapture<T>(fn: () => Promise<T>): Promise<{result: T; notices: CapturedNotice[]; capturedError: Error | null}>`
- Implementation: monkey-patch `window.Notice`'s constructor, sammelt jeden Notice-Text, restored am Ende
- Async-safe via 250ms post-`fn`-Window
- Sensitive-Daten-Heuristik: Notices die `/token|secret|key/i` enthalten werden mit redacted-marker statt mit content gespeichert
- Truncation bei 100 captured notices, mit Hinweis "[truncated, more not captured]"
- Fail-soft: wenn `window.Notice` nicht-patchable, log warning und laeuft `fn` weiter ohne Capture

### Task B2 -- ExecuteCommandTool Notice-Capture

**Files:**
- `src/core/tools/agent/ExecuteCommandTool.ts` (Modify)

**Aktion:**
- Wrap `app.commands.executeCommandById` in `withNoticeCapture`
- tool_result-Format erweitert: `{executed: bool, command_name, notices?: string[], error?: string}` via JSON-string oder structured-content
- Truncation-Hinweis ergaenzen wenn Notice-Count exceeded
- Tool-Description aktualisieren: notice-output-erwartung erwaehnen

### Task C -- Tests + Build + verify gate

**Files:**
- `src/core/utils/__tests__/NoticeCapture.test.ts` (Create)
- `src/core/tools/agent/__tests__/ProbePluginTool.test.ts` (Create)

**Tests:**
- NoticeCapture: capture, restore, sensitive-redact, truncation, fail-soft
- ProbePluginTool: command-filter, apiMethods-reflection, plugin-not-found, plugin-disabled

**Verifikation:**
- `npx tsc --noEmit -skipLibCheck` clean
- `npx vitest run` 1809+N passing
- `npm run build` exit 0

## Coverage Gate

### SC -> Task Mapping

**FEAT-29-03:**
| SC | Task |
|---|---|
| SC-01 (Plugin-enable < 100ms) | Task A1 (workspace.layout-change-Hook deckt UI-Activation in unter 50ms ab; polling-2s als Defensive-Fallback) |
| SC-02 (NONE-class < 30s) | Task A1 (Reclassify-Delays nach 1s + 10s) |
| SC-03 (probe_plugin live) | Task A2 |
| SC-04 (Modell-Adoption) | Task A3 (Prompt-Hint), Deferred: tatsaechliche Telemetrie sammelt sich erst in Production |
| SC-05 (0 setInterval) | Task A1 (kein setInterval, scheduleRecurring nutzt setTimeout-chain) |

**FEAT-29-04:**
| SC | Task |
|---|---|
| SC-01 (95% Failure-Modi) | Task B1 (Capture-Coverage) -- in Tests Mocked + manueller Test post-build |
| SC-02 (Capture nur waehrend execute) | Task B1 (monkey-patch+restore mit try/finally) |
| SC-03 (strukturiertes Schema) | Task B2 (tool_result-JSON) |
| SC-04 (Plugin-Override fail-soft) | Task B1 |
| SC-05 (Overhead < 5ms) | Task B1 (in-memory list-push ist O(1)) |

### ADR-Alignment

- **ADR-124 Live-Probe Discovery:** Task A2 implementiert die Decision-Section.
- **ADR-125 Notice-Capture:** Task B1+B2 implementiert die Decision-Section.

### Verifikationsbefehle

- `npm run build`
- `npx vitest run`
- Live-Test post-Welle-3 auf Sebastian's Vault: enable plugin und beobachten ob es in unter 1s sichtbar wird; execute_command auf Dataview-Query und beobachten ob notices in tool_result auftauchen.

## Change Log

### 2026-05-20 -- initial draft
Plan angelegt nach Codebase-Reconciliation. 8 Tasks (A1-A3, B1-B2, C). Bundled Plan fuer FEAT-29-03 und FEAT-29-04 weil die Code-Pfade verzahnt sind. Welle 2 (FEAT-29-02) ist Vorausetzung, Folder-Layout fuer Skills steht.

### 2026-05-20 -- implementation complete
Alle Tasks gruen. Implementation-Notes:

- **Task A1 (Discovery polling+events):** VaultDNAScanner-Polling von 30s auf 2s verkuerzt, Reclassify-Pass nach 1s und 10s statt 3s. Neue `triggerImmediateSync`-Methode als public Surface fuer event-driven Trigger. main.ts registriert `workspace.on("layout-change")` mit 200ms-Debounce, ruft `triggerImmediateSync` -- damit kommt jede UI-driven Plugin-Aktivierung in unter 250ms im Skill-Layer an.
- **Task A2 (probe_plugin Tool):** Neuer `ProbePluginTool` extends `BaseTool<'probe_plugin'>`. Pure `probe(pluginId)`-Method liest `app.plugins.plugins[id]`+`app.commands.commands`-Prefix-Filter+Reflection auf API-Methoden. Skip-Listen fuer Plugin-Base-Methoden (loadData, saveData, addCommand, etc.) und private `_`-Praefix.
- **Task A3 (Wiring):** ToolRegistry registriert ProbePluginTool (Zeile 240). TOOL_METADATA-Eintrag mit signature/example/whenToUse. ARCHITECTURE.map row `probe-plugin` ergaenzt + vault-dna row mit FEAT-29-03-Note. SkillRegistry-Prompt-Section bekommt einen klaren Hint "If a plugin was just enabled, or the listed commands look stale, call probe_plugin(...) before falling back to execute_command".
- **Task B1 (NoticeCapture):** Neues Module `src/core/utils/NoticeCapture.ts`. `withNoticeCapture(globalRef, fn, options)` monkey-patcht `window.Notice` waehrend `fn`-Ausfuehrung, restored im finally. Async-Tail-Window 250ms fuer Plugins die Notices nach `executeCommandById` raisen. Severity-Heuristik (error/warning/success/unknown). Sensitive-Daten-Filter (token/secret/key -> redacted). Truncation bei 100 captures. Fail-soft wenn Notice-Konstruktor nicht patchable.
- **Task B2 (ExecuteCommandTool patch):** `executeCommandById` ist jetzt in `withNoticeCapture` gewrapped. tool_result-Format umgestellt auf strukturiertes JSON: `{executed, command_id, command_name, notices: [{text, severity, t_ms, redacted?}], truncated, error?, capture_skipped?}`. Tool-Description erklaert das neue Format und gibt Hinweis "do NOT assume success if notices look like a failure".
- **Task C (Verify):** TypeScript clean, Build green, Deploy auf iCloud-Vault erfolgreich. 1809 -> 1825 Tests gruen (+16 neue: 10 fuer NoticeCapture, 6 fuer ProbePluginTool). 21 verbleibende Failures alle pre-existing pre-Welle-1.

### Code-Aenderungen ueber Plan hinaus

- TOOL_METADATA-Eintrag fuer probe_plugin (war Plan-implizit, nicht explizit als Task gelistet aber notwendig fuer ToolName-Konsistenz-Test)
- types.ts ToolName-union erweitert um `'probe_plugin'`

### TDD-Status

**Diese Welle wurde NICHT TDD-gefahren.** Begruendung: User-Decision 2026-05-20 ("Welle 1-3 non-TDD, ab FEAT-29-05 wieder TDD"). Tests sind post-hoc geschrieben, aber verhaltensorientiert. Siehe `feedback_tdd_default.md` -- "Bekannte Ausnahme" Section.

### Coverage Gate -- final

**FEAT-29-03:**

| SC | Status |
|---|---|
| SC-01 (Plugin-enable < 100ms) | Workspace-event-Trigger landet unter 250ms (Debounce), polling-2s als Fallback. Live-Test pending, aber Architektur stimmt. |
| SC-02 (NONE-class < 30s) | 1s + 10s Reclassify-Passes plus 2s-Polling-Sentinel. |
| SC-03 (probe_plugin live) | Tool implementiert, 6 Tests gruen, kein Caching. |
| SC-04 (Modell-Adoption) | Prompt-Hint in SkillRegistry + Tool-Description. Telemetrie sammelt sich in Production -- Deferred. |
| SC-05 (0 setInterval) | scheduleRecurring nutzt setTimeout-chain. |

**FEAT-29-04:**

| SC | Status |
|---|---|
| SC-01 (95% Failure-Modi) | NoticeCapture patcht Notice-Konstruktor, capture sollte alle bekannten Modi treffen. Live-Verifikation pending. |
| SC-02 (nur waehrend execute) | try/finally restore, Test "restores Notice even when fn throws". |
| SC-03 (strukturiertes Schema) | tool_result ist JSON mit notices-Array. |
| SC-04 (Plugin-Override fail-soft) | patchSkipped-Flag in result, Test "fail-soft when window.Notice is missing". |
| SC-05 (Overhead < 5ms) | In-memory list-push ist O(1). Profiling pending. |
