# FEATURE: Tool Execution Pipeline

**Source:** `src/core/tool-execution/ToolExecutionPipeline.ts`

## Summary
Central governance layer that ALL tool calls must pass through. Enforces path access rules, manages approval flow, triggers checkpoints before writes, and logs every operation.

## How It Works

### Execution Steps (in order)
1. **Tool lookup** — `toolRegistry.getTool(name)`. Returns `<error>Unknown tool</error>` if not found.
2. **Path validation** — `IgnoreService.isIgnored(path)` and `isProtected(path)`. Blocks access to `.obsidian-agentignore`-listed files and write-protected files.
3. **Approval check** — For write, web, and MCP tools: checks `autoApproval` config, then calls `onApprovalRequired` callback. Fail-closed: if no callback is wired (e.g. subtasks without parent forwarding), write tools are denied.
4. **Checkpoint** — Before the FIRST write to each unique path per task, calls `checkpointService.snapshot(taskId, [path])`. Tracked via `snapshotedPaths: Set<string>` to ensure each file is snapshotted at most once per task.
5. **Execute** — Calls `tool.execute(input, context)` where `context` includes `askQuestion`, `signalCompletion`, `switchMode`, `spawnSubtask`, `updateTodos`.
6. **Log** — `OperationLogger.log()` with tool name, params, success, duration.

### Tool Group Classification

The pipeline classifies every tool into exactly one approval group. The
canonical source is the `TOOL_GROUPS` map and `ApprovalGroup` union in
`ToolExecutionPipeline.ts` -- do not hardcode the per-tool list here, it
grows when new tools are added. Run `grep "TOOL_GROUPS" src/core/tool-execution/ToolExecutionPipeline.ts` for the current map.

Group rationale (stable):

| Group | Purpose | Approval default |
|-------|---------|------------------|
| `read` | Side-effect-free vault and search reads | settings `autoApproval.read` (default true) |
| `note-edit` | Content writes inside an existing note | settings `autoApproval.noteEdits` (default false) |
| `vault-change` | Structural vault mutations (create, delete, move, base, canvas) | settings `autoApproval.vaultChanges` |
| `web` | Outbound HTTP (`web_fetch`, `web_search`) | settings `autoApproval.web` |
| `agent` | Agent-internal control (ask, completion, todo, mode) | always auto, except `update_settings` touching `autoApproval.*` (AUDIT-006 H-3) |
| `subtask` | Spawning a child AgentTask (`new_task`) | settings `autoApproval.subtasks` |
| `mcp` | External MCP tool calls (`use_mcp_tool`) | settings `autoApproval.mcp` |
| `skill` | PAS-1 skill execution (`execute_command`, `enable_plugin`, `resolve_capability_gap`) | settings `autoApproval.skills` |
| `plugin-api` | PAS-1.5 plugin API bridge (`call_plugin_api`) | split read/write via `autoApproval.pluginApiRead` / `pluginApiWrite` |
| `recipe` | Recipe shell execution (`execute_recipe`) | settings `autoApproval.recipes` |
| `sandbox` | Sandboxed code (`evaluate_expression`) | settings `autoApproval.sandbox`, default off |
| `self-modify` | `manage_skill`, `manage_source` | always requires user approval, no bypass (M-7) |

### Approval Logic
```
group = 'agent'               → auto (with update_settings gate for autoApproval.* paths)
group = 'sandbox'             → cfg.sandbox?       auto : ask (or rejected if no callback)
group = 'self-modify'         → always ask (rejected if no callback)
cfg.enabled && cfg.<group>    → auto for that group
no callback                   → rejected (fail-closed)
else                          → onApprovalRequired(toolName, input)
```

### Context Extensions (ContextExtensions interface)
Passed to `executeTool()` by `AgentTask.run()`:
- `askQuestion` — promise-based: pauses loop, waits for UI answer card
- `signalCompletion` — sets a flag, loop breaks after current tool batch
- `switchMode` — schedules mode change for next iteration start
- `spawnSubtask` — creates child AgentTask, returns its output text
- `updateTodos` — publishes todo list to UI sidebar
- `onApprovalRequired` — forwards to parent's approval callback

### ToolExecutionContext (passed to each tool)
```typescript
{
  taskId: string,
  mode: string,
  callbacks: ToolCallbacks,
  askQuestion?,
  signalCompletion?,
  updateTodos?,
  switchMode?,
  spawnSubtask?,
}
```

## Key Files
- `src/core/tool-execution/ToolExecutionPipeline.ts`
- `src/core/governance/IgnoreService.ts` — path access rules
- `src/core/governance/OperationLogger.ts` — audit logging
- `src/core/checkpoints/GitCheckpointService.ts` — pre-write snapshots

## Dependencies
- `IgnoreService` (via `plugin.ignoreService`) — loaded on plugin init
- `OperationLogger` (via `plugin.operationLogger`) — loaded on plugin init
- `GitCheckpointService` (via `plugin.checkpointService`) — loaded on plugin init
- `ObsidianAgentPlugin.settings.autoApproval` — live settings read on each call
- `ObsidianAgentPlugin.settings.enableCheckpoints`

## Configuration
| Key | Default | Effect |
|-----|---------|--------|
| `autoApproval.enabled` | false | Master auto-approval toggle |
| `autoApproval.read` | true | Auto-approve read tools |
| `autoApproval.noteEdits` | false | Auto-approve note content writes |
| `autoApproval.vaultChanges` | false | Auto-approve structural changes |
| `autoApproval.web` | false | Auto-approve web tools |
| `autoApproval.mcp` | false | Auto-approve MCP tools |
| `autoApproval.subtasks` | false | Auto-approve `new_task` subtask spawning |
| `autoApproval.skills` | false | Auto-approve PAS-1 skill execution |
| `autoApproval.pluginApiRead` | false | Auto-approve read-only plugin API calls |
| `autoApproval.pluginApiWrite` | false | Auto-approve writing plugin API calls |
| `autoApproval.recipes` | false | Auto-approve recipe shell execution |
| `autoApproval.sandbox` | false | Auto-approve sandboxed code (default off, prompt-injection risk) |
| `enableCheckpoints` | true | Checkpoint before writes |
(`self-modify` has no auto-approve flag -- always asks.)

## Extension Points for Future Features
- Parallel read execution optimization already in `AgentTask` (not pipeline)
- Per-tool rate limiting could be added in step 2.5
- Audit export / streaming log viewing uses `OperationLogger`

## Known Limitations
- `snapshotedPaths` is per-pipeline-instance (per task) — correct, but means a file re-opened in a new task needs a new snapshot.
- Path validation only applies to tools with a `path` input field; tools with multiple path inputs (e.g. `move_file` with `source` and `destination`) only check `input.path` (i.e. `source`). Destination path is not separately validated.
- Approval check for `subtasks` requires parent to explicitly forward `onApprovalRequired` to child `AgentTask`. Already done in current implementation but must be maintained when adding new delegation patterns.
