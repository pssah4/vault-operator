---
id: PLAN-33
title: FEAT-29-10 Composability -- Skill-to-Skill + Skill-to-MCP mit Context-Frame-Isolation
date: 2026-05-21
feature-refs: [FEAT-29-10]
adr-refs: [ADR-129]
plan-refs: [PLAN-32]
bug-refs: []
pair-id: epic-29-welle-4-d
---

# PLAN-33 -- Skill-Composability mit Context-Frame-Isolation

## Kontext

Bisher arbeiten Skills voneinander isoliert. Ein User-Workflow ("Wochenreport") muss alle Schritte in einer monolithischen SKILL.md packen oder der Agent springt zwischen Skills hin- und her ohne expliziten Trace. EPIC-22's Coordinator-Pattern hat das Konzept skizziert aber nicht systematisch verankert.

**Decision (per user 2026-05-21):** Voller Scope mit Context-Frame-Isolation. Zwei neue Tools (`invoke_skill`, `invoke_mcp_server`), Composition-Stack-Tracking pro AgentTask, Cycle-Detection, Max-Depth-Limit (Default 5).

**Architektur-Entscheidungen:**

- **invoke_skill** spawnt einen Subtask mit dem Sub-Skill-Body als Instruction-Prompt + den uebergebenen args. Eigener Message-Buffer, isoliert vom Parent. Bei attempt_completion des Subtasks wird das Resultat ans Parent zurueckgegeben.
- **invoke_mcp_server** wrappt den existing `McpClient.execute`-Pfad. Approval-Kette unveraendert. Trennung von `use_mcp_tool` ist nur fuer Audit-Logging und Stack-Tracking sinnvoll (Stack-Entry: `mcp:{server-id}:{tool-name}`).
- **CompositionStackService** trackt pro AgentTask einen string[]-Stack. Bei jedem invoke_*-Aufruf wird gestackt, pre-check fuer Cycle (skill schon im Stack) und Depth (Stack.length >= maxDepth) erfolgt vor dem spawn.
- **Subtask inherits**: ToolRegistry, MCP-Client, settings, approval-callbacks. Eigener: messages-buffer, todos, prompt.
- **maxDepth**: settings.composability.maxDepth, Default 5. Reset auf 1 wenn Subtask-Hierarchy startet.

## Tasks (TDD-strict)

### Step A: CompositionStackService

Pure logic, kein Side-Effect.

**Files:**
- `src/core/skills/CompositionStackService.ts` (NEU)
- `src/core/skills/__tests__/CompositionStackService.test.ts` (NEU)

**API:**
```typescript
class CompositionStackService {
  push(entry: CompositionEntry): void;        // throws on cycle, throws on depth-exceeded
  pop(): CompositionEntry | undefined;
  current(): readonly CompositionEntry[];
  contains(entry: CompositionEntry): boolean;
  depth(): number;
}

interface CompositionEntry {
  type: 'skill' | 'mcp';
  id: string;                                  // skill-name or `{server-id}:{tool-name}`
}
```

**RED-First-Tests:**
- push + pop, FIFO basic
- contains() finds matching entry
- push() throws when entry equals an existing stack entry (cycle)
- push() throws when stack.length >= maxDepth
- depth() returns current stack size
- new instance starts empty

### Step B: invoke_skill Tool

**Files:**
- `src/core/tools/agent/InvokeSkillTool.ts` (NEU)
- `src/core/tools/agent/__tests__/InvokeSkillTool.test.ts` (NEU)
- `src/core/tools/types.ts` (Modify, add 'invoke_skill')
- `src/core/tools/toolMetadata.ts` (Modify, add entry)
- `src/core/tools/ToolRegistry.ts` (Modify, register)

**Logic:**
- Input: `{ skill_name: string, args?: Record<string, unknown> }`
- Validate skill_name via `isSafePathSegment`
- Look up skill via SelfAuthoredSkillLoader (must exist)
- Compose subtask-prompt: skill body + args as JSON in a `## Inputs` section
- spawnSubtask({ instructions, mode, parentStack: [..., new entry] }) via existing AgentTask-spawn
- Wait for subtask completion (attempt_completion result)
- Return result as JSON: `{ ok: true, skill: name, result: <string>, depth: N }`
- On Cycle/Depth-Exceeded: throw early with structured error including stack

**RED-First-Tests:**
- skill_name validation (rejects path traversal)
- "skill not found" error
- depth limit hit -> structured error with stack
- cycle detection -> structured error
- happy path: spawnSubtask called with correct instructions including args

### Step C: invoke_mcp_server Tool

**Files:**
- `src/core/tools/agent/InvokeMcpServerTool.ts` (NEU)
- `src/core/tools/agent/__tests__/InvokeMcpServerTool.test.ts` (NEU)
- `src/core/tools/types.ts` (Modify, add 'invoke_mcp_server')
- `src/core/tools/toolMetadata.ts` (Modify, add entry)
- `src/core/tools/ToolRegistry.ts` (Modify, register)

**Logic:**
- Input: `{ server_id: string, tool_name: string, args?: Record<string, unknown> }`
- Validate inputs via `isSafePathSegment`
- Push stack entry `mcp:{server-id}:{tool-name}` (cycle/depth-check applies)
- Call existing `McpClient.execute(server_id, tool_name, args)` -- approval-chain unchanged
- Pop stack entry on return
- Return JSON: `{ ok: true, result: <string>, depth: N }`

**RED-First-Tests:**
- server_id + tool_name validation
- "server not found" error
- depth/cycle protection applied
- happy path: McpClient.execute called once

### Step D: skill-creator references doc

**Files:**
- `bundled-skills/skill-creator/references/composability.md` (NEU)
- `bundled-skills/skill-creator/SKILL.md` (Modify, link to new reference)

### Step E: Settings + Wiring + V-Model close

**Files:**
- `src/types/settings.ts` (Modify, add `composability.maxDepth`)
- `src/main.ts` (Modify, instantiate CompositionStackService per AgentTask)
- `src/core/AgentTask.ts` (Modify, attach stack)
- /testing/audit/merge

## Coverage Gate

| SC | Beschreibung | Task |
|---|---|---|
| SC-01 | Skill->Skill->Skill funktioniert | Step B + Live-Test |
| SC-02 | Cycle-Detection bei Ebene 6 | Step A + B Tests |
| SC-03 | MCP-Approval unbypassbar | Step C |
| SC-04 | maxDepth-Setting respektiert | Step A + E Setting |
| SC-05 | Anteil-Metrik | Out of scope (Adoption-Telemetrie) |

## Change Log

### 2026-05-21 -- initial draft

PLAN-33 angelegt. Full scope per user. invoke_skill spawnSubtask-based, invoke_mcp_server wraps McpClient, CompositionStackService als shared Cycle/Depth-Tracker.
