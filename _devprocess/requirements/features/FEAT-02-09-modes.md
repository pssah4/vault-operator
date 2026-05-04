# FEATURE: Modes

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-02-09.
> Code pointer: ARCHITECTURE.map concept `mode-service` and
> `modes-builtin` (run `grep "mode" src/ARCHITECTURE.map`).

## Summary
Mode system that defines the agent's capabilities, persona, and available tools. Two built-in modes (Ask, Agent) plus unlimited user-created custom modes. Each mode has its own role definition, tool groups, optional model override, and per-mode MCP whitelist.

## How It Works

### Built-in Modes

**Ask** (`slug: 'ask'`)
- Tool groups: `read`, `vault`, `agent`
- Role: conversational, read-only vault Q&A. Prioritizes `semantic_search` → `search_by_tag` → `search_files` → `read_file`.
- Cannot create, edit, or delete files.
- Suggests switching to Agent when the user needs to take action.

**Agent** (`slug: 'agent'`)
- Tool groups: `read`, `vault`, `edit`, `web`, `agent`, `mcp`
- Role: fully autonomous. Access to all tools including sub-agent spawning (`new_task`).
- Includes Obsidian conventions (wikilinks, frontmatter format, callout syntax).
- Documents 4 agentic patterns: Prompt Chaining, Orchestrator-Worker, Evaluator-Optimizer, Routing.

### Tool Groups (compact view; canonical source: code)

The TOOL_GROUP_MAP shape is large and grows. Run
`grep "modes-builtin" src/ARCHITECTURE.map` for the entry-point
file and read its current map.

Conceptual structure (groups, not exhaustive tools):

- `read`: pure read-only file/document/list/search tools
- `vault`: read-plus-vault-context (frontmatter, tags, linked notes,
  daily note, semantic search, base queries, vault health)
- `edit`: write/edit/append/move/delete/canvas/create-binary
  (DOCX, PPTX, XLSX, drawio); plan_presentation, ingest_document
- `web`: web_fetch, web_search
- `agent`: ask_followup_question, attempt_completion, todo updates,
  spawning subtasks, settings/config updates, source management
- `mcp`: use_mcp_tool
- `skill`: skill-bundle activation (introduced post-FEAT-02-09)

`switch_mode` is always available regardless of group membership.

The exact tool list per group changes with each release; do not hard-
code it in this spec. Tests against the live TOOL_GROUP_MAP cover
correctness.

### Custom Modes (ModeConfig)
```typescript
{
  slug: string,           // URL-safe, unique
  name: string,           // display name
  icon: string,           // Lucide icon name
  description: string,    // shown in mode selector
  roleDefinition: string, // injected into system prompt
  whenToUse?: string,     // hint for orchestrators
  customInstructions?: string, // user-editable, appended after roleDefinition
  toolGroups: ToolGroup[],
  source: 'built-in' | 'global' | 'vault',
}
```

**Scopes:**
- `vault` — stored in plugin settings (per-vault)
- `global` — stored at `~/.obsidian-agent/modes.json` (all vaults)
- `built-in` — ships with plugin, not user-editable

### Per-Mode Overrides (settings)
| Override | Key | Description |
|----------|-----|-------------|
| Model override | `modeModelKeys[slug]` | Use a different model for this mode |
| Tool override | `modeToolOverrides[slug]` | Restrict to specific tool names (intersection with toolGroups) |
| MCP whitelist | `modeMcpServers[slug]` | Limit which MCP servers are available |
| Forced skills | `forcedSkills[slug]` | Skills always injected regardless of keyword match |
| Forced workflow | `forcedWorkflow[slug]` | Workflow applied to every message (unless message starts with /) |

### Default Tool Override (Agent mode)
`modeToolOverrides.agent` ships pre-configured WITHOUT `delete_file` and `use_mcp_tool` — safe defaults. User must explicitly enable them.

### ModeService
- `getActiveMode()` — returns current `ModeConfig`
- `getAllModes()` — built-in + vault + global custom modes
- `getMode(slug)` — lookup by slug
- `switchMode(slug)` — updates `currentMode` in settings, persists
- `getToolDefinitions(mode, sessionOverride?)` — expands tool groups, applies `modeToolOverrides`, then intersects with `sessionOverride` (per-session chat override)

### Mode Switching
- **From UI**: mode selector dropdown in sidebar
- **From agent**: `switch_mode` tool → sets `pendingModeSwitch` in AgentTask → applied at next iteration start → system prompt rebuilt
- On mode switch: `ToolRepetitionDetector.reset()` (clears loop detection state)

### System Prompt Integration
`buildSystemPromptForMode()` called with `activeMode`. Includes:
1. Tool sections for mode's `toolGroups`
2. Mode's `roleDefinition` under `MODE: {NAME}` header
3. Mode's `customInstructions` (if any)
4. Global custom instructions (if any)

## Code Pointer (may go stale)

Wayfinder concept: `mode-service`, `modes-builtin`. The wayfinder is
the canonical source for current paths.

## Dependencies (conceptual)

- AgentTask receives active mode and rebuilds system prompt on switch
- ToolExecutionPipeline receives mode slug for logging
- systemPrompt builder uses mode.toolGroups plus roleDefinition
- AgentSidebarView renders the mode selector

## Configuration
| Key | Default | Description |
|-----|---------|-------------|
| `currentMode` | `'agent'` | Active mode slug |
| `customModes` | `[]` | User-created vault-scope modes |
| `modeModelKeys` | `{}` | Per-mode model overrides |
| `modeToolOverrides` | `{agent: [...]}` | Per-mode tool restrictions |
| `modeMcpServers` | `{}` | Per-mode MCP server whitelist |
| `forcedSkills` | `{}` | Per-mode always-inject skills |
| `forcedWorkflow` | `{}` | Per-mode default workflow |
| `globalCustomInstructions` | `''` | Appended to all modes |

## Extension Points
- Deprecated modes can be re-activated by adding them back to BUILT_IN_MODES in the modes-builtin entry-point
- `whenToUse` field on ModeConfig is consumed by orchestrator patterns in `new_task` to auto-select sub-agent modes
- New tool groups: extend the map in modes-builtin and the corresponding TOOL_SECTIONS in the prompt builder. ARCHITECTURE.map row `mode-service` documents the extension pattern.

## Known Limitations
- Max iterations (25) not per-mode configurable — could be useful for "safe" low-limit modes
- `switch_mode` during parallel tool execution is deferred to next iteration (correct behavior, but worth noting in multi-tool responses)
