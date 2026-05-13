---
title: Mastery and recipes
description: How Vault Operator learns from repeated workflows and promotes them into reusable recipes.
---

# Mastery and recipes

Vault Operator watches the tasks you ask it to do. After the same kind of task succeeds three times, it generates a **recipe**: a short procedure that captures the intent and the rough plan. Next time you ask for something similar, the recipe steers the agent toward the same approach, saving tokens and reducing variance.

## How a recipe gets born

Every successful conversation is recorded as an **episode**: the user message, the tools that ran, the outcome. Episodes are embedded as vectors and stored in the memory database.

After each successful episode, `RecipePromotionService` checks whether three or more past episodes share the same intent. Intent similarity is measured by cosine distance between the user-message embeddings, with a 0.75 threshold. If a triplet of similar episodes exists and no recipe already covers that intent, a single LLM call generates a recipe and saves it.

This is intent-based, not sequence-based. Two episodes count as similar even if the agent used different tools to solve the same problem. The old "pattern-key" approach that matched tool sequences was retired with ADR-58.

## How recipes get used

Recipe matching runs in two phases (`src/core/mastery/RecipeMatchingService.ts`):

1. **Keyword match.** The user message is compared against recipe titles and descriptions.
2. **Semantic fallback.** If keyword matching finds nothing, a description-keyword pass runs as a secondary signal.

When a recipe matches, the agent prepends its procedure to the system prompt for that turn. The recipe is a steer, not a constraint: the agent may deviate if the current task differs in ways the recipe did not anticipate.

The `execute_recipe` tool is a different thing entirely. That one runs pre-validated CLI recipes (Pandoc PDF export, for example), not learned mastery recipes.

## Two kinds of recipes

- **Static recipes** ship with the plugin. They cover stable patterns that are language- and vault-independent.
- **Learned recipes** come from your own episodes. They are stored per vault and visible in **Settings > Workflows & prompts > Recipes**.

A hard cap of 50 learned recipes prevents unbounded growth (see `MAX_LEARNED_RECIPES` in `src/core/mastery/RecipePromotionService.ts`). When the cap is hit, the oldest unused recipe is evicted on the next promotion.

## Limits

- Three repetitions are needed before promotion. Rare-but-useful patterns will not be learned until they repeat.
- Recipe learning depends on a working embedding model. If embeddings are disabled or the model is offline, no new recipes are promoted (existing ones still match by keyword).
- Recipe generation is a fire-and-forget background call. If the call fails, the failure is not surfaced.
- Recipes capture intent, not exact tool choice. The same recipe may map to slightly different tool sequences across runs.
- The retired `SuggestionService` is dead code; ignore any internal references to it.

## Related decisions

- ADR-58: intent-based promotion design
- ADR-59 and ADR-60: budget-aware extraction and database-backed memory retrieval
- ADR-18: original episode recording format (still in use for the on-disk layout)

See also: [Skills, rules, and workflows](/guides/skills-rules-workflows), [Tools reference: execute_recipe](/reference/tools#plugin-integration-tools).
