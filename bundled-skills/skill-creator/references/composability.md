# Composability: invoke_skill and invoke_mcp_server

A skill workflow can call out to another skill or to a configured MCP-server tool as a first-class step. This page is the reference for the two composability tools.

When you reach for a building block in a skill body, name it as a tool call, not as natural language. Natural-language hand-offs ("now run the meeting-summary skill") work but the agent has to translate them back into a tool call every time, so writing the call explicitly in the skill body is more reliable and cheaper.

## invoke_skill

Runs another skill as a sub-skill. The sub-skill executes in a fresh subtask (own conversation history, own attempt_completion). Its final result is returned as the tool_result of `invoke_skill`.

```json
{
  "name": "invoke_skill",
  "input": {
    "skill_name": "meeting-summary",
    "args": { "note": "2026-05-21.md" },
    "max_iterations": 8
  }
}
```

Use when the current skill workflow explicitly names another skill as a building block. The sub-skill sees its own SKILL.md body in its prompt plus the args as a JSON block under `## Inputs`.

### Cost controls

Sub-skills carry two cost-control levers, both designed to fail safe.

`max_iterations` caps the child loop budget per call. Default is 12, hard cap is 25. The agent passes this on the call site when it expects the sub-skill to be fast; lower means a runaway sub-skill cannot quietly multiply parent cost.

`allowedTools` in the sub-skill's SKILL.md frontmatter restricts the child's tool schema. Without it the child sees the full parent tool set (~9000 prompt tokens of schema). With it the schema collapses to just the tools the sub-skill actually needs.

Use the inline-list form. The frontmatter parser is line-based and does not handle multi-line YAML lists; only `[a, b, c]` is read correctly.

```yaml
---
name: meeting-summary
description: Summarise a meeting note into bullet points.
allowedTools: [read_file, edit_file, write_file, search_files, attempt_completion]
---
```

The allowlist must include `attempt_completion`, otherwise the sub-skill cannot return a result.

Do not use for one-off questions the current skill can answer itself. Do not use to "step into" a skill just to read its body, use `read_skill` for that.

## invoke_mcp_server

Calls a tool exposed by a configured MCP server as a first-class step inside a skill workflow. The MCP server's own per-server approval policy still applies.

```json
{
  "name": "invoke_mcp_server",
  "input": {
    "server_id": "notion",
    "tool_name": "search_page",
    "args": { "query": "Q2 OKRs" }
  }
}
```

This is the composition-tracked twin of `use_mcp_tool`. Prefer `invoke_mcp_server` when the MCP call is part of a skill workflow, because the composition guard (see below) sees it. Prefer `use_mcp_tool` for ad-hoc external calls outside a skill workflow.

## Composition guard

Both tools share one cycle-detection and depth-limit service for the task. The guard fires before any subtask is spawned and any MCP call is made.

- Cycle: invoking the same `{type: skill, id: name}` or `{type: mcp, id: server:tool}` twice in the active chain refuses the call and reports the chain.
- Depth: the default chain depth is 5. Reaching the cap refuses the call and reports the chain.
- Stack hygiene: the entry pops on success and on error. A subtask that throws does not leave the chain corrupted.

## Designing for composability

- One job per skill. If a skill needs three other skills to do its work, the three sub-skills each have a single clear purpose and a stable result shape. Big monolithic skills make composition brittle.
- Name args deliberately. The sub-skill sees them as JSON under `## Inputs`. Keep the keys short, the values JSON-serializable, and the surface stable across calls.
- Return a structured result. A sub-skill that ends with `attempt_completion("done")` is useless. Return the artifact path, the summary text, the IDs, whatever the parent skill needs to keep working.
- Avoid recursion. The cycle guard protects against runaway, but it surfaces as an error, not as a feature. If you find yourself wanting a skill to call itself, break it into two skills.

## When NOT to use these tools

- For tools the agent can call directly (file ops, search, fetch). The composition tools are wrappers, not gateways.
- For one-shot orchestration across many tools that does not match a stored skill. Use `new_task` with a custom message, or call the tools inline.
- For "advisor" escalations to a stronger model. Use `consult_flagship` (governed by the per-task advisor budget).
