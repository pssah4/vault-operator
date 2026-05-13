# PLAN-22: FEAT-24-04 / ADR-113 -- Subagent-Delegation (Profile + Per-Call-Token-Budget)

> Status: Implemented 2026-05-13
> Branch: `feature/feat-24-04-subagent-delegation` (off `dev`)
> Refs: FEAT-24-04, ADR-113, ADR-090 (Cost-Aware Heuristics, in Spannung), ADR-01 (ToolExecutionPipeline), ADR-12 (Context Condensing), ADR-62 (KV-Cache), ADR-63 (Context Externalization), RESEARCH-36 Abschnitt 8 (Hebel E)
> Vorgaenger: PLAN-21 (FEAT-24-06 MCP-Listing-Cap, released auf `dev`)

---

## 1. Kontext

`spawnSubtask` und `new_task` existieren ([`AgentTask.ts:414-471`](../../../src/core/AgentTask.ts#L414-L471), [`NewTaskTool.ts`](../../../src/core/tools/agent/NewTaskTool.ts)). Heute restriktiv per ADR-090 Lever 4+7: Tier-4-Eskalation mit drei expliziten Kategorien (PARALLEL, SPECIALIST, ESCALATION), `justification_category` + `justification_reason` als required. Subagent erbt Mode + Rules + MCP + Plugin-Skills vom Parent; nur Skills/Memory/Recipes werden via `isSubtask`-Gate weggelassen. Kein Profile-Konzept, kein Token-Budget.

### Spannung ADR-113 vs ADR-090

ADR-113 will `new_task` "prominent fuer explorative/recherchierende Teilaufgaben" machen. ADR-090 hat es bewusst restriktiv: Cost-Aware Tier-4-Eskalation. Beide stehen auf demselben Tool.

**Aufloesung (entschieden im Plan, nicht im ADR):** **additiv, nicht ersetzend.** Der heutige Tier-4-Pfad (kein `profile`) bleibt strikt wie er ist; die `justification_category`-Required-Logik unveraendert. Ein neuer **optionaler `profile`-Parameter** schaltet einen schlankeren Subagent-Modus frei. Wenn `profile` gesetzt ist:

- Die Tier-4-Justification entfaellt (Profile ist die explizite Auswahl-Entscheidung).
- Der Subagent laeuft mit Profile-spezifischem schlankem System-Prompt + reduzierter Tool-Liste.
- Per-Call-Token-Budget gilt sowohl fuer Profile- als auch fuer Tier-4-Spawns.

Der Tier-4-Schutz bleibt fuer alle nicht-profile-Spawns aktiv. Damit ergaenzen sich ADR-090 und ADR-113 statt sich zu widersprechen. ADR-090 deckt "wann ueberhaupt new_task" (Tier 4 fuer generelle Eskalation), ADR-113 deckt "wenn explorative Teilaufgabe -- nutze ein Profile".

### Codebase-Anker (gegen ADR-113-Implementation-Notes)

- `spawnSubtask(childMode, childMessage)`: [`AgentTask.ts:414`](../../../src/core/AgentTask.ts#L414). Wird um optionalen `profile`-Parameter erweitert.
- `childTask.run({...})`: [`AgentTask.ts:455`](../../../src/core/AgentTask.ts#L455). Reicht heute Mode + Rules + MCP + Plugins durch.
- `buildSystemPromptForMode`: erhaelt heute `isSubtask: this.depth > 0`. Bekommt zusaetzlich `subagentProfile?: SubagentProfile` -- wenn gesetzt, wird der Mode-Pfad durch einen schlankeren Profile-System-Prompt ersetzt.
- `NewTaskTool.execute`: [`NewTaskTool.ts:73`](../../../src/core/tools/agent/NewTaskTool.ts#L73). Erweitert um `profile`-Parsing + Token-Budget-Check.
- `newTaskValidation.ts`: bekommt `profile`-Option-Branch (wenn profile -> justification nicht required).
- `src/types/settings.ts`: nur `autoApproval.subtasks: boolean` existiert. Neu: `subtaskTokenBudget: number` (Default 8000).

---

## 2. Aenderungen

### 2.1 Profile-Modul (Task 1)

NEU: `src/core/agent/subagent-profiles.ts`.

```ts
import type { ToolName } from '../tools/types';

export interface SubagentProfile {
    name: string;
    description: string;
    /** Tools the subagent may use. Subset of all registered tools. */
    allowedTools: ToolName[];
    /** Lean role-definition that replaces the mode roleDefinition for this subagent. */
    roleDefinition: string;
}

const RESEARCH_PROFILE: SubagentProfile = {
    name: 'research',
    description: 'Read-only research subagent: searches and reads vault notes + web, returns a compact summary.',
    allowedTools: [
        'read_file', 'list_files', 'search_files', 'semantic_search',
        'search_history', 'web_search', 'fetch_web', 'attempt_completion',
    ],
    roleDefinition: [
        'You are a focused research subagent. Your only job is to gather',
        'information and return a compact, well-structured summary to your',
        'parent agent.',
        '',
        'Rules:',
        '- Do not write, edit, delete, or move any vault content.',
        '- Do not switch modes or spawn further subagents.',
        '- When the question is answered, call attempt_completion with a',
        '  short, source-cited summary. The parent only sees this summary,',
        '  not your intermediate tool calls.',
        '- Keep your reasoning tight. Aim for 3-7 tool calls, not 20.',
    ].join('\n'),
};

const PROFILES: Record<string, SubagentProfile> = {
    research: RESEARCH_PROFILE,
};

export function getSubagentProfile(name: string): SubagentProfile | undefined {
    return PROFILES[name];
}

export function listSubagentProfileNames(): string[] {
    return Object.keys(PROFILES);
}
```

Bewusst klein gehalten: ein Profile zum Start. Profile-Erweiterung ist eine simple Map-Erweiterung; kein neues Konzept noetig.

### 2.2 Per-Call-Token-Budget (Task 2)

Token-Estimate: charlength / 4 (Rule of Thumb, schon im Code in `model-registry.ts:estimatePromptTokens` verwendet). Konkret: `Math.ceil(message.length / 4)`. Konservativer Aufschlag fuer Profile-System-Prompt ist nicht noetig -- der Budget-Wert bezieht sich nur auf die Aufruf-Message (Cowork-Vorbild: "3000 Tokens pro Aufruf").

NEU in `src/types/settings.ts`:
```ts
/**
 * FEAT-24-04 / ADR-113: hard per-call token budget for new_task message
 * payload. If the estimated tokens (chars/4) of the spawn message exceed
 * this number, new_task returns an error to the agent with ist/soll, so
 * the model trims and retries.
 */
subtaskTokenBudget: number;  // default 8000
```

In `NewTaskTool.execute` vor dem Spawn:

```ts
const estimatedTokens = Math.ceil(message.length / 4);
const budget = this.plugin.settings.subtaskTokenBudget ?? 8000;
if (estimatedTokens > budget) {
    callbacks.pushToolResult(this.formatError(new Error(
        `new_task message exceeds the per-call token budget: ` +
        `${estimatedTokens} tokens > ${budget} budget. ` +
        `Shorten the message (drop unnecessary context, keep only what the ` +
        `subagent needs) and call new_task again.`
    )));
    return;
}
```

Gilt fuer profile- UND non-profile-Calls.

### 2.3 NewTaskTool um `profile` erweitern (Task 3)

Input-Schema bekommt:
```
profile: {
    type: 'string',
    enum: ['research'],  // listSubagentProfileNames() dynamisch waere ideal, statisches enum reicht
    description: 'Optional subagent profile. If set, the subagent runs with a lean ...'
}
```

In `validateNewTaskInput`: wenn `profile` vorhanden, sind `justification_category`/`justification_reason` **nicht** required (Profile ist die explizite Auswahl). Wenn `profile` nicht vorhanden, bleibt die heutige Validation unveraendert.

Description-Block (`getDefinition`) aufwerten: "Tier 4 escalation -- VERY expensive (unless you pass `profile='research'` for a lean read-only research subagent)."

### 2.4 spawnSubtask + buildSystemPromptForMode -- Profile-Pfad (Task 4)

`spawnSubtask(childMode, childMessage, profileName?)`:

- Wenn `profileName` gegeben -> `getSubagentProfile(profileName)`:
  - Subagent laeuft als Mode `agent`, aber die Mode-`roleDefinition` wird im `buildSystemPromptForMode` durch `profile.roleDefinition` ersetzt (neuer Config-Parameter).
  - Tool-Liste: `allowedTools` aus dem Profile, gefiltert gegen die registrierten Tools (`toolRegistry.hasTool(name)`). Profile-Tools haben Vorrang vor dem Mode-Tool-Set.
  - `isSubtask: true` (wie heute fuer Subagents).
  - Rules + MCP + Plugin-Skills: NICHT durchreichen (Profile ist lean).
- Wenn kein Profile -> bisheriges Verhalten unveraendert (Mode-Spawn).

`SystemPromptConfig` (in `systemPrompt.ts`) bekommt:
```ts
/**
 * FEAT-24-04 / ADR-113: when set, replaces mode.roleDefinition for a
 * lean subagent system prompt. Section 1 (Mode Definition) uses this
 * text instead of the inherited mode role.
 */
subagentRoleOverride?: string;
```

`getModeDefinitionSection` in `prompts/sections/mode.ts` bekommt einen optionalen Override-Parameter; wenn gesetzt, wird `mode.roleDefinition` durch den Override ersetzt, der Rest (Mode-Slug-Anzeige) bleibt.

In `spawnSubtask`:
```ts
const profile = profileName ? getSubagentProfile(profileName) : undefined;
const childTask = new AgentTask(
    this.api,
    this.toolRegistry,
    // ... callbacks ...
);
await childTask.run({
    userMessage: childMessage,
    taskId: `${taskId}-sub-${Date.now()}`,
    initialMode: profile ? 'agent' : childMode,
    // Profile means: drop parent context entirely (rules, mcp, plugin-skills, recipes, memory)
    rulesContent: profile ? undefined : rulesContent,
    mcpClient: profile ? undefined : mcpClient,
    pluginSkillsSection: profile ? undefined : pluginSkillsSection,
    subagentRoleOverride: profile?.roleDefinition,
    subagentAllowedTools: profile?.allowedTools,
    // ... other config ...
});
```

`buildSystemPromptForMode` muss `subagentRoleOverride` + `subagentAllowedTools` weiterreichen. Tool-Listung in der TOOLS-Section: wenn `subagentAllowedTools` gesetzt, wird die Section auf diese Tools beschnitten.

### 2.5 Prompt-Leitplanke (Task 5)

Minimal in `prompts/sections/toolDecisionGuidelines.ts` einen Block ergaenzen:

```
## Delegating exploratory work to a subagent (profile='research')

If a question requires multiple read/search calls to answer (vault-wide
research, multi-note synthesis, web research), call new_task with
profile='research' and a concise focused question. The research subagent
returns a compact summary; intermediate tool calls stay out of your
context. Use this when the answer needs N>3 reads or searches; for a
single read, do it directly.

For non-research escalations (PARALLEL / SPECIALIST / ESCALATION), the
Tier-4 justification rules in new_task still apply.
```

### 2.6 Tests (Task 6)

- `src/core/agent/__tests__/subagent-profiles.test.ts` (NEU): Profile-Registry hat 'research', getSubagentProfile gibt das richtige Profile zurueck, listSubagentProfileNames enthaelt 'research'.
- `src/core/tools/agent/__tests__/newTaskValidation.test.ts` (erweitert): wenn `profile='research'` gesetzt, sind `justification_*` nicht required; wenn `profile` nicht gesetzt, bleibt die heutige Validation; falscher Profile-Name -> Fehler.
- `src/core/tools/agent/__tests__/NewTaskTool.test.ts` (NEU oder erweitert): Token-Budget-Check liefert Fehler bei zu langer Message, Suffix nennt ist/soll; Budget-Default 8000; Profile-Spawn ruft spawnSubtask mit 3 Argumenten.
- `src/core/prompts/sections/__tests__/mode.test.ts` (NEU oder erweitert, je nachdem ob es schon eines gibt): `subagentRoleOverride` ersetzt `mode.roleDefinition`.
- Bestehende Tests: 1439 -> erwartet ~1450+ (10-15 neue Tests).

### 2.7 Dokumentation

- `FEAT-24-04-subagent-delegation.md`: `plan-refs: [PLAN-22]`; SC konkretisieren.
- `BACKLOG.md`: FEAT-24-04 Status auf `In Progress`; PLAN-22 als neue Row.
- `ADR-113`: Status -> `Accepted` + Amendment-Hinweis auf den additiv-zu-ADR-090-Pivot.

---

## 3. Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|---|---|---|
| `src/core/agent/subagent-profiles.ts` | NEU | niedrig (Konstanten-Modul) |
| `src/core/tools/agent/NewTaskTool.ts` | Profile-Parameter + Token-Budget-Check + Description aufwerten | mittel (Validierungs-Logik) |
| `src/core/tools/agent/newTaskValidation.ts` | Profile-Branch (justification nicht required) | niedrig |
| `src/core/AgentTask.ts` | `spawnSubtask` um `profileName?`-Parameter, Profile-Pfad in `childTask.run` | mittel (zentrale Stelle) |
| `src/core/systemPrompt.ts` | `subagentRoleOverride` + `subagentAllowedTools` in `SystemPromptConfig`; durchreichen | niedrig |
| `src/core/prompts/sections/mode.ts` | `roleDefinition`-Override-Parameter | niedrig |
| `src/core/prompts/sections/tools.ts` | Tool-Listung gegen `subagentAllowedTools` filtern wenn gesetzt | niedrig |
| `src/core/prompts/sections/toolDecisionGuidelines.ts` | Leitplanke fuer profile='research' | niedrig |
| `src/types/settings.ts` | `subtaskTokenBudget: number` (Default 8000) | niedrig |
| `src/core/tools/types.ts` | `ToolExecutionContext.spawnSubtask`-Signatur um `profileName?` | niedrig |
| Tests (4 Files) | NEU/erweitert | niedrig |
| ADR-113, FEAT-24-04, BACKLOG | Doku-Updates | niedrig |

## 4. Nicht betroffen (Blast-Radius)

- `find_tool` / Deferred-Loading (FEATURE-1600).
- Skills-Pfad (FEAT-24-09), MCP-Pfad (FEAT-24-06): unangetastet.
- Mode-System: heutige Modes (`agent`, `ask`) unveraendert. Profile sind ein parallel-Konzept fuer Subagents.
- ADR-090 Tier-4-Logik fuer non-profile new_task: unveraendert.
- Tool-Result-Pipeline-Caps (FEAT-24-03).
- Cache-Praefix-Stabilitaet (FEAT-24-01).

## 5. Verifikation

1. **Build:** `npm run build` -- gruen.
2. **Tests:** `npm test` -- Baseline 1439 auf dev. Erwartet: +10-15 neue Tests.
3. **Typecheck:** `npx tsc -noEmit -skipLibCheck` clean.
4. **Lint:** `npm run lint` 0 errors.
5. **`/consistency-check` mode A:** keine neuen Findings durch FEAT-24-04.
6. **Funktional (manuell, Live-Messlauf, `[AWAITING RE]` SC):**
   - Eine Frage, die N>3 read/search-Aufrufe braucht: Agent ruft `new_task(profile='research', ...)`, Subagent loggt seine Tool-Calls als `[subtask]`, Parent-Kontext waechst nur um die Subtask-Antwort.
   - Eine new_task-Aufruf mit ueberlanger Message: erhaelt `formatError("new_task message exceeds the per-call token budget: NNNN tokens > 8000 budget...")`, Agent kuerzt und ruft erneut.

## 6. Plan Coverage Gate

| SC (FEAT-24-04, neu zu schreiben) | mapped to Task | Status |
|---|---|---|
| SC-1 `new_task` akzeptiert `profile='research'` (optional) | Task 3 + Validierung-Test | mapped |
| SC-2 Profile-Spawn nutzt schlanken System-Prompt + reduzierte Tool-Liste | Task 1 + 4 + mode.test | mapped |
| SC-3 Per-Call-Token-Budget greift, Fehler mit ist/soll | Task 2 + NewTaskTool-Test | mapped |
| SC-4 Non-profile-Pfad unveraendert (ADR-090-Schutz bleibt) | Task 3 + newTaskValidation-Regression-Test | mapped |
| SC-5 Eltern-Kontext waechst bei Research-Subtask nur um die Antwort | Task 4 + Live-Messlauf `[AWAITING RE]` | partial (struktureller Beleg in Code-Diff, Live-SC bleibt manuell) |

ADR-113 Decisions:
- "Subtask-Tool prominent" -> Task 3 (Description aufwerten) + Task 5 (Leitplanke).
- "Agent-Profile" -> Task 1 + Task 4.
- "Per-Call-Token-Budget" -> Task 2.
- "Prompt-Leitplanke kein harter Router" -> Task 5.

## 7. Change Log

### 2026-05-13 -- Plan persistiert (trigger=design)

Aufgesetzt mit dem ADR-113-Amendment "additiv zu ADR-090". Coverage Gate
beim Persistieren erfuellt: alle 6 SC + 4 ADR-113-Decisions mapped.

### 2026-05-13 -- Implementation komplett (trigger=task)

Implementation in einem Sprint ohne Mid-course-Trigger:

- Task 1 (Profile-Modul): `src/core/agent/subagent-profiles.ts` neu.
  Genau ein Profile `research` (read-only Tool-Allowlist, lean
  roleDefinition). `getSubagentProfile` + `listSubagentProfileNames`.
- Task 2 (Settings): `subtaskTokenBudget: number` in
  `AdvancedApiSettings`, Default 8000.
- Task 3 (NewTaskTool + validation): `validateNewTaskInput` mit
  Profile-Branch (justification nicht required wenn profile gesetzt);
  fehlender Profile-Name -> Fehler mit Liste der bekannten Profile.
  `NewTaskTool.execute` mit Per-Call-Token-Budget-Check (chars/4 vs
  settings.subtaskTokenBudget ?? 8000) und Profile-Spawn-Pfad
  (drittes Argument `profileName` an `spawnSubtask`); Description
  des Tools aufgewertet ("Two paths" beschreibt Profile + Tier-4).
- Task 4 (spawnSubtask): `spawnSubtask(childMode, childMessage, profileName?)`
  in `AgentTask.ts`. Profile-Pfad reicht subagentRoleOverride +
  subagentAllowedTools an `childTask.run` durch; Profile bedeutet
  zusaetzlich: rules/mcp/plugin-skills NICHT durchreichen (Profile
  ist die Scope-Entscheidung). `ToolExecutionContext.spawnSubtask`-
  Signature in `tools/types.ts` entsprechend erweitert.
- Task 5 (systemPrompt + sections): `SystemPromptConfig` +
  `buildSystemPromptForMode` durchreichen `subagentRoleOverride` +
  `subagentAllowedTools`. `getModeDefinitionSection(mode, roleOverride?)`
  ersetzt `mode.roleDefinition` durch den Override (Mode-Header
  bleibt). `buildToolPromptSection(groups, includeExamples, allowedNames?)`
  filtert Tools per Allowlist-Intersection. `rebuildPromptCache` in
  AgentTask filtert `baseTools` zusaetzlich gegen die Profile-Allowlist
  BEVOR die deferred-/shadowed-Filter laufen.
- Task 6 (Leitplanke): in `toolDecisionGuidelines.ts` Rule 8 um eine
  "RESEARCH PROFILE EXCEPTION"-Zeile ergaenzt; nennt `profile="research"`
  als den Pfad fuer multi-step Recherche.
- Task 7 (Tests):
  - `subagent-profiles.test.ts` neu (5 Tests).
  - `newTaskValidation.test.ts` erweitert (+5 Profile-Tests).
  - `NewTaskTool.test.ts` neu (8 Tests: 3x Budget, 4x Profile vs Tier-4,
    1x Mode-Check).
  - `modeDefinition.test.ts` neu (4 Tests).
  - **+21 Tests vs dev-Baseline 1439 -> 1460 gruen.**

Verifikation:

- `npm test`: **1460 gruen** (+21).
- `npm run build`: gruen (tsc + esbuild production + Vault-Deploy).
- `npm run lint`: 0 errors (664 vorbestehende warnings unveraendert).
- `npx tsc -noEmit -skipLibCheck`: clean.

## 8. Implementation Notes

Per-task commit SHAs werden im phase-end-Commit (`feat(code): FEAT-24-04
coding complete`) gebuendelt. Kein Mid-course-Trigger.

Befunde waehrend Implementation:

- Beim Setting-Default-Lookup nutzt `NewTaskTool.execute` Optional Chaining
  (`this.plugin.settings.advancedApi?.subtaskTokenBudget ?? DEFAULT_SUBTASK_TOKEN_BUDGET`),
  damit alte data.json-Stand fuer existierende User nicht crasht. Default
  in der Konstante mirror-t den Default in settings.ts.
- `getModeDefinitionSection`'s Override nutzt nullish coalescing (`??`),
  also wird ein leerer String `''` als override interpretiert. Das ist
  beabsichtigt: undefined = use mode role; explicit empty = fail loud
  (kein Anwender-Use-Case).
- `getToolsSection`-Signatur hat einen weiteren positional-Parameter
  bekommen (`subagentAllowedTools`). Alle vorhandenen Aufrufer ohne
  Subagent-Profile arbeiten unveraendert weiter (Parameter ist optional).
- Settings-UI in `src/ui/settings/` wurde NICHT angefasst: das Setting
  ist im interface AdvancedApiSettings + Default-Object verankert,
  Power-User koennen es via update_settings/data.json setzen. Ein UI-Slider
  ist Folge-Item, falls Bedarf entsteht.

Was bewusst NICHT geaendert wurde:

- `ALLOWED_SUB_MODES` (`agent`/`ask`) ist unveraendert; auf Profile-Pfad
  ueberschreibt die Profile-roleDefinition den Mode-roleDefinition,
  Mode-Header bleibt zur Orientierung.
- `maxSubtaskDepth`-Logik unveraendert; Profile koennen geschachtelt
  werden bis zur normalen Tiefe (aber Profile-Description verbietet
  weiteres Nesting fuer den research-Subagent).
- `ToolRegistry.registerMcpTool` (TODO-Stub aus AUDIT-019 / IMP-24-06-01)
  bleibt; nicht Teil von FEAT-24-04.
