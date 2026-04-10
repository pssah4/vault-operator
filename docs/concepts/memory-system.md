---
title: Memory
description: How Obsilo remembers things across conversations with three tiers of memory.
---

# Memory

Without memory, every conversation starts from zero. You'd re-explain your preferences, your projects, your writing style. Obsilo persists information across conversations in three tiers, each with a different lifespan and purpose.

## Three tiers

Session memory is automatic. When a conversation ends, the system extracts a summary: what was discussed, what decisions were made, what tools were used. These summaries live in the `sessions` table inside `memory.db` (SQLite, same engine as the knowledge layer). You never need to manage session memory; it accumulates on its own. Over hundreds of conversations, the archive becomes a searchable log of everything you've worked on with the agent.

Long-term memory stores durable facts about you and your work. The `MemoryService` (`src/core/memory/MemoryService.ts`) manages five Markdown files in `~/.obsidian-agent/memory/`:

| File | What it holds | Token budget |
|------|--------------|--------------|
| `user-profile.md` | Your name, role, communication preferences | ~200 tokens |
| `projects.md` | Active projects and their context | ~300 tokens |
| `patterns.md` | Behavioral patterns the agent has learned | ~200 tokens |
| `soul.md` | Agent identity and personality | ~200 tokens |
| `knowledge.md` | Domain knowledge (on-demand only, not in system prompt) | none |

Each file has a hard cap of 800 characters when injected into the system prompt, with a combined maximum of 4,000 characters across all files. This keeps memory useful without eating the context window.

The character budget is enforced at extraction time, not just at injection. The `LongTermExtractor` receives the budget as a hard constraint: "This file may have a maximum of 800 characters. If adding new information would exceed the budget, remove or condense the least relevant existing entries." Each entry carries a `[YYYY-MM]` recency tag so the extractor can decide what to cut. Without budget enforcement, memory files grow indefinitely. After a year, the visible 800 characters would be full of stale entries while newer, more relevant information sits below the cutoff.

Soul is a special case. It defines how the agent communicates: language, tone, values, anti-patterns. The default soul speaks German, avoids filler phrases, and prioritizes usefulness over politeness. You can edit `soul.md` directly to reshape the agent's personality.

Two utility files complement these: `errors.md` tracks known error patterns the agent has encountered, and `custom-tools.md` records dynamic tools and skills the agent has created. Both load on demand rather than appearing in every system prompt.

## How memory flows

```mermaid
flowchart LR
    C[Conversation ends] --> E[Extract summary]
    E --> S[Store in MemoryDB]
    S --> P[Load into system prompt]
    P --> N[Next conversation]
```

At the start of each conversation, the system loads `user-profile.md`, `projects.md`, `patterns.md`, and `soul.md` into the system prompt. `knowledge.md` is excluded from automatic loading and only retrieved on demand via semantic search to avoid wasting context on potentially irrelevant information.

The `MemoryRetriever` (`src/core/memory/MemoryRetriever.ts`) reads each file, truncates to the character budget, and assembles the combined memory block. If a file doesn't exist yet, the system creates it from a template on first access. The templates are minimal: headings and placeholder fields that the agent fills in as it learns about you.

## MemoryDB

The `MemoryDB` (`src/core/knowledge/MemoryDB.ts`) is a SQLite database separate from the knowledge layer. It stores structured data across four tables:

| Table | Purpose |
|-------|---------|
| `sessions` | Conversation summaries with title, source, timestamp |
| `episodes` | Individual task executions: user message, tools used, success/failure |
| `recipes` | Learned and static procedural recipes (promoted from episodes via intent matching) |
| `patterns` | Legacy table from earlier sequence-based matching (no longer written to) |

The database lives at `{vault-parent}/.obsidian-agent/memory.db` and is shared across vaults. The agent remembers you regardless of which vault you open.

Episodes are the most granular unit. Each episode records a single user request, the active mode, the exact sequence of tools called, a ledger of tool outcomes, and whether the task succeeded. This data powers both the recipe system and the analytics in the Debug settings tab.

## Memory updates

The agent updates memory through two paths. Automatic extraction happens at conversation end: the system pulls out key facts and stores them as sessions and episodes. Explicit updates happen when the agent (or you) writes directly to a memory file using the `update_memory` tool.

Both the `update_memory` tool and the MCP server's `update_memory` endpoint write to the same files. If you use Obsilo through Claude Desktop via MCP, your memory still accumulates in the same place.

You can also edit the memory files directly in a text editor. They're plain Markdown. If the agent has learned something incorrect about you, open `user-profile.md` and fix it. The corrected version takes effect on the next conversation.

## Recipes and intent matching

Over time, the `episodes` table reveals patterns. When three or more similar episodes all succeeded, the system promotes them into a recipe: a generalized, reusable procedure that the agent can follow without reasoning from scratch. This is the foundation for fast path execution (see [agent loop](./agent-loop)), which cuts token costs by up to 90% for known task types.

Recipe promotion uses semantic intent matching, not tool sequence matching. An earlier version tried to detect recurring tasks by comparing the exact sequence of tools the agent used (e.g. `search_files` -> `read_file` -> `create_note`). This never worked in practice because LLMs don't choose tools deterministically. Three functionally identical tasks would produce three different tool sequences, resulting in three separate patterns that never reached the promotion threshold.

The current system compares user messages by cosine similarity using the same embedding model as the knowledge layer. "Search my notes on Kant and summarize" and "Find everything on Hegel and create an overview" score high on similarity regardless of which tools the agent happened to use. After three similar successful episodes, the `RecipePromotionService` generates a recipe via a single LLM call that abstracts the concrete examples into a generalized step sequence.

The system ships eight static recipes for common vault operations (creating canvases, reorganizing notes by tag, linking related documents, etc.). Learned recipes are generated automatically and capped at 50 to prevent unbounded growth.

Recipe matching at query time uses a two-phase approach. Phase 1 is keyword scoring against the recipe's trigger field, which is fast and requires no API call. Phase 2, used as a fallback, checks recipe names and descriptions for token overlap. The combined budget is capped at three recipes and 2,000 characters to avoid bloating the system prompt.

Recipes include a `success_count` that tracks how often they've worked. Only recipes with at least three successful uses qualify for fast path execution. Recipes are versioned with a `schema_version` field so old recipes can be migrated when the format changes. Each recipe records which modes it applies to, so a recipe learned in "agent" mode won't be suggested in "ask" mode.

## Onboarding

New users start with empty memory files. The `OnboardingService` (`src/core/memory/OnboardingService.ts`) detects this and triggers a first-run flow that asks a few questions: your name, your preferred language, what you use Obsidian for. The answers populate `user-profile.md` and `soul.md`, giving the agent a baseline. You can skip onboarding and let memory build up organically through conversations.

## Token economics

Memory competes for space in the system prompt alongside rules, tool descriptions, and skills. The 4,000-character budget translates to roughly 1,000-1,200 tokens depending on content. This is a deliberate trade-off: enough to be useful without crowding out other context. You can increase the per-file and total character limits in the source code, but you'll lose space for other system prompt sections.

The `knowledge.md` file sits outside this budget because it's only loaded when the agent calls semantic search. It can grow as large as you like without affecting the system prompt size.
