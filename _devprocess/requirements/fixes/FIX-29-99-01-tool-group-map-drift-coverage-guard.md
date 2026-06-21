---
id: FIX-29-99-01
epic: EPIC-29
feature: FEAT-29-03
adr-refs: [ADR-116, ADR-124, ADR-126]
plan-refs: []
depends-on: []
audit-refs: [STABILITY-AUDIT-v2.14.0-2026-06-21]
created: 2026-06-21
---

# FIX-29-99-01: TOOL_GROUP_MAP drift strukturell schliessen

## Symptom

Stabilitaets-Audit 2026-06-21 hat acht Tools identifiziert, die im
ToolRegistry registriert sind, aber in `TOOL_GROUP_MAP` (`builtinModes.ts`)
nicht eingetragen waren. Folge: das Built-in-Agent-Schema filtert sie
heraus, das LLM sieht sie nicht im Tool-Schema und kann sie nur per
Halluzination treffen. Released-Features funktionierten unsichtbar.

Betroffene Tools:
- `anti_echo_search` (FEAT-19-14, Released)
- `mark_note_as_memory_source` (FEAT-03-25)
- `unmark_note_as_memory_source` (FEAT-03-25)
- `list_memory_source_notes` (FEAT-03-25)
- `find_tool` (FEATURE-1600)
- `read_skill` (FEAT-24-09 / ADR-116, "always-available" claim)
- `probe_plugin` (FEAT-29-03 / ADR-124)
- `run_skill_script` (FEAT-29-06 / ADR-126)

Das Pattern hat sich bereits **fuenfmal** wiederholt: vault_health_check,
ingest_*, read_mcp_tool, weak_clusters/orphans-Tools und jetzt diese acht.
Manuelle Whitelist (`MUST_BE_REACHABLE` im Coverage-Test) hat die Drift
nicht verhindert.

## Root Cause

`MUST_BE_REACHABLE` musste bisher per Hand gepflegt werden. Wenn ein
neues Tool zur `ToolName`-Union hinzukommt, war kein automatischer
Mechanismus, der die fehlende Zuordnung erzwingt. Das ist genau der
BUG-021-Drift.

## Fix

Zwei Aenderungen:

1. **Acht fehlende Tools in passende Gruppen einsortiert** in
   `src/core/modes/builtinModes.ts`:
   - `anti_echo_search` -> `web`
   - drei Memory-Source-Tools -> `vault` (analog zu `list_pinned_conversations`)
   - `find_tool`, `read_skill` -> `agent` (meta-Tools, vorher in
     `INTENTIONALLY_NOT_REACHABLE`, was die Halluzinations-Aufrufe
     erklaerte)
   - `probe_plugin`, `run_skill_script` -> `skill`

2. **Auto-Discovery-Coverage-Test** in
   `src/core/modes/__tests__/builtinModes.coverage.test.ts`:
   - Neuer `extractToolNamesFromTypesSource()`-Helper parst
     `src/core/tools/types.ts` per regex `/\|\s*'([a-z_][a-z_0-9]*)'/g`.
   - Neuer Test `auto-discovers every ToolName from types.ts` prueft, dass
     jeder Eintrag in `ToolName` entweder in `MUST_BE_REACHABLE` oder
     `INTENTIONALLY_NOT_REACHABLE` oder `INTERNAL_TOOLS` klassifiziert ist.
   - Neuer `INTERNAL_TOOLS = ['_memory_atomize', '_memory_single_call']`
     fuer Engine-only Tools, die zwar im ToolName-Type stehen (fuer
     ApiHandler-Type-Check), aber nie im Agent-Registry landen.
   - Neuer Test `keeps engine-internal tools out of TOOL_GROUP_MAP`
     verhindert das Gegenteil.

Damit ist die Drift strukturell geschlossen: jeder neue ToolName-Eintrag
ohne explizite Klassifikation laesst den Build sofort fallen.

## Akzeptanzkriterien

- Coverage-Test 8/8 GREEN.
- Volle Vitest-Suite 2962 passing + 1 expected fail.
- TypeScript clean.
- Build clean.
- Manuelle Verifikation (live): das Agent-Schema enthaelt nach Reload die
  acht zuvor unsichtbaren Tools (im `[InputBreakdown]`-Log: toolSchemas
  steigt entsprechend).
