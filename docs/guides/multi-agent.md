---
title: Multi-Agent & Tasks
description: Sub-tasks, task extraction, and how Obsilo delegates work to child agents.
---

# Multi-agent & tasks

For complex work, a single agent conversation can get unwieldy. Obsilo handles this with sub-agents: child agents that take on specific parts of a larger task independently. It also extracts actionable tasks from conversations and turns them into trackable notes.

## What are sub-agents?

A sub-agent is a separate agent instance spawned by the main agent. It gets its own conversation, its own mode, and its own tool access. The parent agent delegates a specific job, waits for the result, and continues with its own work.

### When sub-agents help

- Research fan-out: search multiple topics in parallel instead of sequentially
- Divide and conquer: break a large task into independent pieces
- Mode isolation: run a read-only analysis in Ask mode while the parent works in Agent mode
- Long tasks: keep the main conversation focused while a sub-agent handles a side task

## How `new_task` works

The agent spawns sub-agents using the `new_task` tool. You don't call this tool directly. The agent decides when delegation makes sense.

### What the agent specifies

| Parameter | Purpose |
|-----------|---------|
| Mode | Which mode the child agent runs in (Ask or Agent) |
| Message | The specific task description for the child |
| Context | Relevant information passed from the parent conversation |

### Depth guard

Sub-agents can spawn their own sub-agents, but Obsilo enforces a maximum depth of 2 levels. This prevents runaway chains:

```
Main Agent (level 0)
  -> Sub-Agent A (level 1)
      -> Sub-Agent A1 (level 2, maximum depth, cannot spawn further)
  -> Sub-Agent B (level 1)
```

### Parallel execution

Read-safe tools (searching, reading files, semantic search) run in parallel using `Promise.all`. A sub-agent researching three topics searches for all three simultaneously, not one after another.

:::tip You don't need to manage this
Sub-agent orchestration is automatic. Describe your goal and the agent decides whether to delegate. For example: *"Research these 5 companies and create a comparison table"* might spawn sub-agents for each company.
:::

## Practical examples

### Research fan-out

Your prompt: *"Compare the note-taking approaches described in my notes about Zettelkasten, PARA, and Johnny Decimal"*

What happens:
1. The main agent spawns 3 sub-agents, one for each system
2. Each sub-agent searches and reads the relevant notes
3. Results return to the parent agent
4. The parent creates the comparison

### Divide and conquer

Your prompt: *"Reorganize my Projects/ folder. Group notes by status (active, completed, on hold) and create an index note"*

What happens:
1. A sub-agent analyzes all notes and classifies them by status
2. The parent agent creates the folder structure and moves files
3. A final sub-agent generates the index note with links

## Task extraction

Obsilo watches for actionable items in agent responses. When the agent produces a list with unchecked checkboxes (`- [ ]`), the TaskExtractor detects them automatically.

### How it works

1. The agent responds with tasks in its message (e.g., a project plan with action items)
2. Obsilo detects the `- [ ]` items
3. A TaskSelectionModal appears, letting you pick which tasks to save
4. Selected tasks become individual notes in your vault

### Task notes

Each extracted task becomes a note with structured frontmatter:

```markdown
---
type: task
status: open
source: agent-conversation
created: 2026-03-31
---

# Review Q1 budget allocations

Compare actual spending against planned budget for each department.
Highlight any variance above 10%.
```

This works with your existing task management: Dataview queries, kanban boards, or any plugin that reads frontmatter.

:::info Not just agent tasks
Task extraction works on any checklist the agent produces: project plans, follow-ups from meeting notes, research next steps. If the agent writes `- [ ]` items, you can capture them.
:::

## Tips for multi-agent work

1. Be ambitious. Multi-step requests like "research, compare, and summarize" are exactly what sub-agents handle well.
2. Provide scope. Mention specific folders, tags, or file names so sub-agents know where to look.
3. Check the activity block. You can see each sub-agent's tool calls in the parent's activity view.
4. Use task extraction. When the agent gives you a plan, let it create task notes so nothing falls through the cracks.
5. Trust the depth limit. Two levels of sub-agents handle most real-world scenarios. If you need more, break the work into separate conversations.

:::warning Model quality matters
Sub-agents consume additional API calls. Each child agent has its own conversation with the model. Use a capable model (Claude Sonnet or better) for multi-agent tasks. Smaller models may struggle with delegation decisions.
:::

## Next steps

- [Skills, Rules & Workflows](/guides/skills-rules-workflows): Create workflows that use sub-agents
- [Office Documents](/guides/office-documents): Delegate document creation to sub-agents
- [Connectors](/guides/connectors): Connect external tools for sub-agents to use
