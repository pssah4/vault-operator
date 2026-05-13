---
id: IMP-24-06-01
feature: FEAT-24-06
epic: EPIC-24
adr-refs: [ADR-08, ADR-118]
plan-refs: []
audit-refs: [AUDIT-020]
depends-on: []
created: 2026-05-13
---

# IMP-24-06-01: TOOL_METADATA / ToolName-Union Drift schliessen

## Motivation

Info-Finding F-1 aus AUDIT-020 (FEAT-24-06 Per-Item-Audit). FEAT-24-06 hat
das Drift-Pattern bei zwei Tools (`inspect_self`, `update_settings`)
aufgedeckt und behoben; ein statischer Scan ergab 16 weitere Tools im
selben Pattern plus einen Spiegelfall in der anderen Richtung.

Bedeutung: Tools in der `ToolName`-Union werden ueber die `ToolRegistry`
registriert und ihre `getDefinition()`-Schemas landen im `tools`-Feld
jeder API-Anfrage. Ohne `TOOL_METADATA`-Eintrag fehlen sie aber in der
zentralen System-Prompt-Tools-Listung (sie sind also unsichtbar im
Tools-Section-Text) UND `find_tool` kann sie nicht ranken, weil
`FindToolTool.execute` ueber die `TOOL_METADATA`-Map iteriert
(`if (!meta) continue;`). Das Pattern wird zur stillen Falle, sobald ein
Tool deferred wird: es ist dann unentdeckbar.

Kein direkter Sicherheitsimpact heute (Tools sind ueber Registry
funktional erreichbar), aber querschnittliches Drift-Risiko.

## Aenderung

### Teil A: Fehlende `TOOL_METADATA`-Eintraege pro Tool entscheiden

Pro Tool aus der unten gelisteten Drift-Menge:

- Ist das Tool aktiv genutzt? -> `TOOL_METADATA`-Eintrag mit
  `group`, `label`, `icon`, `signature`, `description`, optional
  `whenToUse` + `commonMistakes`.
- Ist das Tool legacy oder intern? -> entweder Eintrag mit
  `group: 'agent'` und Hinweis "internal use" (damit `find_tool`
  ranken kann), oder aus der `ToolName`-Union entfernen (dann muss
  auch die `ToolRegistry`-Registrierung weg).

**Drift-Liste (Stand 2026-05-13):**

In Union, fehlt im `TOOL_METADATA`:

- `_memory_atomize`, `_memory_single_call` (Memory v2 internals, Praefix-`_`
  signalisiert intern -- Entscheidung: dokumentieren oder unbeworben halten?)
- `anti_echo_search`
- `configure_model`
- `create_canvas` (Hinweis: `generate_canvas` existiert auch -- klaeren,
  welches der beiden der kanonische Name ist)
- `ingest_deep`, `ingest_triage`
- `list_memory_source_notes`, `mark_for_memory`, `mark_note_as_memory_source`,
  `unmark_note_as_memory_source`, `recall_memory`, `update_soul`
- `read_agent_logs`
- `search_history`
- `switch_mode` (Agent-Control, NICHT deferred -- sollte Eintrag haben)

In `TOOL_METADATA`, fehlt in Union:

- `check_presentation_quality` (laut Drift-Liste; im
  `DEFERRED_TOOL_NAMES` enthalten -- pruefen ob das Tool wirklich
  existiert oder ein toter Eintrag ist)

### Teil B: Drift-Wiederkehr verhindern

Vorschlag (optional, im Pass entscheiden): eine `vitest`-Assertion in
einem neuen oder bestehenden Test, die statisch prueft, dass jeder Eintrag
in `ToolName` einen `TOOL_METADATA`-Schluessel hat und umgekehrt. Erfordert
einen Build-Step der `ToolName`-Union zur Laufzeit verfuegbar macht (z.B.
einen `TOOL_NAMES`-Konstanten-Array, der die einzige Quelle der Union ist
und auch zur Laufzeit lesbar; die Union wird daraus abgeleitet via
`typeof TOOL_NAMES[number]`). Diese Refactor-Variante ist groesser als ein
reiner Drift-Cleanup und kann auch in einem Folge-Item passieren.

## Verifikation

- Statischer Drift-Check ergibt 0 Treffer:
  ```
  python3 -c "
  import re
  types = open('src/core/tools/types.ts').read()
  meta = open('src/core/tools/toolMetadata.ts').read()
  union = set(re.findall(r\"\|\s*'([a-z_]+)'\", types))
  defined = set(re.findall(r'^    ([a-z_]+):\s*\{$', meta, re.M))
  print('missing:', union - defined)
  print('extra:', defined - union)
  "
  ```
  Beide Set-Differences leer.
- `npm test` gruen (keine Regression durch ergaenzte Eintraege).
- `find_tool` kann jedes Tool aus der Drift-Liste ranken (falls deferred).

## Abgrenzung

Kein Bugfix im engeren Sinne, kein Security-Fix. Code-Hygiene auf der
Tool-Registrierungs-Surface. Eigenes V-Model-Item (PLAN -> /coding ->
/testing), `/security-audit` re-run nicht erforderlich.

## Status

Done 2026-05-13 (commit folgt im phase-end auf `chore/imp-24-06-01-toolmetadata-drift`).

**Implementierter Scope:**

- Legacy entfernt:
  - `create_canvas` aus `ToolName`-Union (kein Tool-File, kein Caller).
  - `check_presentation_quality` aus `TOOL_METADATA` + `DEFERRED_TOOL_NAMES`
    + `TOOL_GROUPS` in `ToolExecutionPipeline.ts` (kein Tool-File mehr).
- 13 `TOOL_METADATA`-Eintraege ergaenzt fuer Tools mit echten BaseTool-
  Klassen: `anti_echo_search`, `configure_model`, `ingest_deep`,
  `ingest_triage`, `list_memory_source_notes`, `mark_for_memory`,
  `mark_note_as_memory_source`, `read_agent_logs`, `recall_memory`,
  `search_history`, `switch_mode`, `unmark_note_as_memory_source`,
  `update_soul`. Pro Eintrag: `group`, `label`, `icon`, `signature`,
  `description`, optional `whenToUse` + `commonMistakes`.
- `_memory_atomize` / `_memory_single_call`: bleiben in `ToolName`-Union
  (sind LLM-internal constraint-tool-Schemas, im MemoryAtomizer /
  SingleCallExtractor lokal definiert; kein BaseTool, kein TOOL_METADATA-
  Eintrag noetig). Konvention dokumentiert: `_`-Prefix = LLM-internal,
  nicht in der Registry.
- Drift-Wiederkehr-Schutz: neuer Vitest-Test
  `src/core/tools/__tests__/toolMetadataConsistency.test.ts` mit 3
  Invarianten:
  1. Union-Member -> TOOL_METADATA-Entry (Underscore-Allowlist).
  2. TOOL_METADATA-Key -> Union-Member (kein orphan).
  3. DEFERRED_TOOL_NAMES -> TOOL_METADATA-Entry (sonst kann find_tool
     den deferred-Tool nicht ranken).

**Verifikation:** 1467 Tests gruen (+3 vs 1464 dev nach IMP-24-09-01-Merge).
`npm run lint` 0 errors. `npx tsc -noEmit -skipLibCheck` clean.
`npm run build` gruen.
