---
title: System Prompt
description: How the agent's system prompt is assembled from modular sections, skills, memory, and mode context.
---

# System prompt

The system prompt is the first thing the model sees. It tells the agent who it is, what tools it has, what rules to follow, and what the user's vault looks like. The prompt is not a static string. It is assembled from 16 independent section modules, filtered by the active mode, and enriched with runtime context like skills and memory.

The orchestrator is `buildSystemPromptForMode()` in `src/core/systemPrompt.ts`. The sections live in `src/core/prompts/sections/`.

## Why modular?

A monolithic prompt becomes unworkable past a few hundred lines. Obsilo's prompt routinely exceeds 5,000 tokens because the agent needs to understand 60+ tools, safety rules, vault conventions, and user-specific context. Modules solve two real problems. First, different modes need different prompts: a read-only mode shouldn't include write-tool descriptions, and subtasks should skip skills and memory to stay lean. With modules, you toggle sections on or off. Second, adding a skill or a new tool group shouldn't require editing a monolithic template. Each concern lives in its own file.

## Assembly order

Position matters. LLMs pay more attention to content near the top (primacy effect) and the bottom (recency effect). A second constraint turned out to be more important than primacy though: KV-cache efficiency.

Modern LLM APIs cache the key-value state of the prompt prefix. As long as the beginning of the prompt stays identical across calls, the cached tokens don't need to be recomputed. Anthropic's API offers this explicitly with a cache control parameter, while OpenAI and DeepSeek do automatic prefix caching. A single changed token at the start invalidates the entire cache for everything after it.

The original prompt had the current timestamp at position 1. Every API call has a different timestamp, so we got zero cache hits across iterations. Moving the timestamp to the end and sorting all sections by stability made the first ~20,000 tokens cacheable across an entire task session. Over eight iterations, actual computation drops from 8 x 25,000 = 200,000 tokens to roughly 25,000 + 7 x 5,000 = 60,000 tokens.

The sections are now ordered by stability, with the stable prefix first and dynamic content last:

**Stable prefix (cached across iterations within a session):**

| # | Section | What it does |
|---|---------|-------------|
| 1 | Mode Definition | Sets the role, shaping everything that follows |
| 2 | Capabilities | Compact summary of what the agent can do |
| 3 | Obsidian Conventions | Vault-specific rules: frontmatter, wikilinks, etc. |
| 4 | Tools | Tool list, filtered by the mode's `toolGroups` (~8,000 tokens) |
| 5 | Tool Routing | Tool selection rules and decision guidelines |
| 6 | Objective | Task decomposition strategy |
| 7 | Response Format | Output structure rules (skipped in subtasks) |
| 8 | Security Boundary | Prompt injection defense, permission boundaries |

**Dynamic suffix (can change per message or session, not cached):**

| # | Section | What it does |
|---|---------|-------------|
| 9 | Plugin Skills | Skills from installed Obsidian plugins |
| 10 | Active Skills | High-priority workflow instructions (skipped in subtasks) |
| 11 | Memory | User memory context (skipped in subtasks) |
| 12 | Procedural Recipes | Learned and static recipes for known task patterns |
| 13 | Self-Authored Skills | Skills the agent created via `manage_skill` |
| 14 | Custom Instructions + Rules | User's global + per-mode instructions, rules from `.obsilo/rules/` |
| 15 | Vault Context | Current vault state and structure |
| 16 | Date/Time | Current timestamp (must be last, changes every call) |

Empty sections are filtered out before joining. If there's no memory context, the memory section is absent. No hollow headers, no wasted tokens.

Moving skills from position 3 to position 10 loses some primacy effect. To compensate, the system appends the current task list as the final user message before every LLM call, exploiting the model's recency bias. This technique is borrowed from Manus' context engineering approach.

## How skills get injected

Skills are markdown files that contain workflow instructions. They activate when a user message matches their trigger keywords:

1. `SkillLoader` reads skills from `.obsilo/skills/` and the bundled skill directory.
2. The user's message is compared against each skill's trigger patterns.
3. Matching skills are concatenated into the active skills section at position 10.

Skills sit in the dynamic block because different messages activate different skills. Placing them in the stable prefix would invalidate the KV cache whenever the active skill set changes. To compensate for the reduced primacy, skills are marked with a `SKILL PRECEDENCE (MANDATORY)` header that the model treats as a strong instruction signal. The recency anchor (task list as last user message) provides additional reinforcement.

Self-authored skills (ones the agent created via `manage_skill`) land at position 13, after active skills and memory. They supplement the primary skills rather than replacing them.

## How memory gets injected

The memory section pulls relevant entries from the user's memory database and injects them as context. Subtasks skip memory entirely to keep child prompts focused.

## Token budget

The system prompt cannot exceed the model's context window. When you add a long custom instruction or load several skills, the prompt grows. Core sections (tools, security boundary) are always present. Optional sections (memory, skills, custom instructions) can be trimmed or skipped based on available context.

Subtasks trim the hardest. A child task skips skills, memory, response format, recipes, self-authored skills, and custom instructions. It gets the tools, the rules, and the job, nothing more.

## Per-mode customization

Each mode provides a `roleDefinition` that goes into the mode definition section, and optional `customInstructions` appended to the custom instructions section. The `toolGroups` field controls which tools appear in the tools section.

Two modes can produce very different system prompts from the same set of section modules. Ask mode gets a read-only role definition and no write tools. Agent mode gets the full set.

## Prompt caching

The system prompt has two levels of caching. At the application level, `AgentTask` caches the assembled prompt per mode and rebuilds it only when the active mode changes, when a settings change affects tool availability, or when an explicit invalidation is triggered.

At the API level, the stable prefix (positions 1-8) benefits from provider-level KV-cache. Anthropic's API receives a `cache_control` marker on the system prompt, and OpenAI and DeepSeek do automatic prefix caching. Because all dynamic content sits after the stable block, the first ~20,000 tokens are computed once per session and served from cache on subsequent iterations. This is the single biggest cost optimization in the system: it turns the system prompt from the second-largest cost block into a near-zero marginal cost per iteration.

## Power steering

During long-running tasks, `AgentTask` injects a synthetic user message every N iterations. It contains the active mode's role definition, active skill names, and a reminder to stay on task. This isn't a system prompt change, it's a user-role message appended to the conversation history. The model treats it as a redirect.
