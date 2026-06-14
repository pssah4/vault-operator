---
title: Advisor Pattern
description: How Vault Operator splits chat work across three model tiers and escalates hard synthesis steps to the Frontier tier on demand.
---

# Advisor pattern

The advisor pattern is how Vault Operator keeps cost predictable without giving up on quality for hard synthesis steps. Three tiers, one loop, one escalation tool.

Most agent loops use a single model for everything. The user picks Opus, every turn runs on Opus. That works, but it pays Opus pricing for tasks (filename lookups, frontmatter reads, simple appends) that a much smaller model could finish in less time.

Vault Operator splits chat work across three tiers and lets the agent ask for a stronger model only when it actually needs one. The escalation goes through a single tool with a hard budget. Once the budget is exhausted, the loop falls back to the Main tier.

## Three tiers per provider

When you add a provider in Settings > Providers and click **Refresh**, the plugin pulls the model list and classifies every model into one of three tiers:

- **Budget**: cheap fast models. Default helper-model target if no helper model is set.
- **Main**: the default tier for chat.
- **Frontier**: reserved for `consult_flagship`. Never used directly by the loop.

`ModelTierClassifier` (`src/core/routing/ModelTierClassifier.ts`) does the classification. It matches model IDs against family patterns first (claude-opus, gpt-5, gemini-pro, deepseek-r1, ...). Unknown models go through a capability-based fallback that looks at context-window and max-output-tokens. For OpenRouter, pricing thresholds also apply: > 50 USD per million completion tokens classifies as Frontier, 5 to 50 as Main, < 5 as Budget.

Discovery caches results for 24 hours. The Refresh button forces a re-pull.

You can override the auto-classification per slot in the provider modal.

## The chat loop runs on Main

`AgentTask` uses the active provider's Main-tier model by default. The `defaultMainModelTier` setting controls which tier the main loop runs on; default is `mid` (Main). Power users running on Frontier-class budgets can flip it to `flagship` as a rollback if the advisor pattern produces too many calls.

The chat-header "Auto" entry is the default and means: advisor pattern via Main with on-demand Frontier escalation. Pinning a specific model from the chat-header search picker overrides the tier resolution for one task; the cost log shows `mode=override` in that case.

## `consult_flagship` escalation

When the Main-tier model gets stuck (parse error after parse error, half-baked synthesis, no clear next step) it can call `consult_flagship` with a single question. The tool routes that question to the Frontier-tier model with strict limits:

- **Max 3 calls per task.** The fourth call returns `advisor budget exhausted`.
- **Advisor subagent runs read-only.** No write, edit, delete, MCP, or spawn from inside the advisor call. Even if the Frontier model wants to call a tool, the schema is locked.
- **Output hard-capped at 3000 tokens.** Enough for a detailed answer, not enough to be used as a full chat surrogate.
- **Filtered out of the schema entirely** if your active provider has no Frontier-tier model. The agent never sees the tool, so it cannot hallucinate the call.
- **One-line prompt nudge after two consecutive errors.** Only when the tool is available.

`ConsultFlagshipTool` lives at `src/core/tools/agent/ConsultFlagshipTool.ts`. The implementation is a 60-line wrapper that spawns a one-shot LLM call against the Frontier model with the user-supplied question as the only message.

## What the cost log shows

Every turn writes a `mode` tag to the cost log:

- `mode=auto`: normal Main-tier call
- `mode=advisor`: `consult_flagship` escalation to Frontier
- `mode=subagent`: `new_task({profile: 'research'})` spawn
- `mode=override`: user pinned a specific model from the chat header

The cost sidebar aggregates these so you can see at a glance how much of a session was Main vs. Frontier vs. helper.

## Why "advisor" and not just "stronger model"

A single Frontier-only call is much cheaper than running the whole loop on Frontier. The Main-tier model orchestrates the work; the Frontier model just answers a focused question. The Main tier then carries the answer back into the loop and finishes the task.

Concretely:

- A 25-iteration task on Opus burns roughly 25 Opus calls.
- The same task on Sonnet with one `consult_flagship` to Opus burns 25 Sonnet calls plus one Opus call.
- Sonnet is roughly 5x cheaper than Opus for input and output. The total is closer to one quarter of the all-Opus run.

The trade-off: Sonnet might not pick up on the same nuance Opus would on every turn. The pattern bets that almost every turn is straightforward enough for the Main tier, and the rare hard turn gets the Frontier answer it needs through the tool.

## Disabling the advisor

If you want the legacy single-model behaviour, set the `defaultMainModelTier` setting to `flagship`. The loop then runs on the Frontier tier and `consult_flagship` is functionally a no-op (it would route to the same model the loop already uses).

For the opposite extreme (Budget-only), set the active provider's Main slot to a Budget-tier model manually. The Frontier slot is still used by `consult_flagship` when available, so you get a Budget loop with on-demand Frontier escalation.

## Related concepts

- [Agent loop](./agent-loop): the loop that runs on the Main tier.
- [Provider auth](./provider-auth): how the plugin authenticates to each provider.
- [Quality and cost](./quality-and-cost): the broader cost-aware loop story (helper model, prompt slim-down, KV-cache alignment).
- [Token optimization](./token-optimization): the techniques that keep the cached prefix stable.
