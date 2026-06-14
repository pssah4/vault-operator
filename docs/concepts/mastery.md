---
title: Mastery and recipes
description: How Vault Operator learns from repeated workflows and promotes them into reusable recipes.
---

# Mastery and recipes

Vault Operator watches the tasks you ask it to do. After the same kind of task succeeds three times, it generates a **recipe**: a short procedure that captures the intent and the rough plan. Next time you ask for something similar, the recipe steers the agent toward the same approach, saving tokens and reducing variance.

## How a recipe gets born

Every successful conversation is recorded as an **episode**: the user message, the tools that ran, the outcome. Episodes are embedded as vectors and stored in the memory database.

After each successful episode, `RecipePromotionService` checks whether two or more past episodes share the same intent (combined with the current episode, that yields the `PROMOTION_THRESHOLD = 3` triplet). Intent similarity comes from `EpisodicExtractor.findSimilarEpisodes`, which ranks past episodes by semantic search over their user-message embeddings. If enough similar episodes exist and no recipe already covers that intent, a single LLM call generates a recipe and saves it.

This is intent-based by default. Two episodes count as similar even if the agent used different tools to solve the same problem.

There is a second promotion path: when the Stigmergy substrate has pinned a tool sequence (FEAT-32-02 / ADR-132), a single successful run on that pinned path is enough to promote a learned recipe directly. The classic semantic triplet remains the fallback when no pinned path is in play.

## How recipes get used

Recipe matching runs in two phases (`src/core/mastery/RecipeMatchingService.ts`):

1. **Keyword match.** The user message is compared against each recipe's trigger keywords. A trigger-recall score of at least `MIN_TRIGGER_RECALL = 0.10` is required, so one specific keyword (for example "excalidraw") can be enough to pick the right recipe.
2. **Description fallback.** If keyword matching returns fewer than three hits, recipe names and descriptions are scanned for overlapping tokens to fill the remaining slots.

When a recipe matches, the agent prepends its procedure to the system prompt for that turn. The recipe is a steer, not a constraint: the agent may deviate if the current task differs in ways the recipe did not anticipate.

The `execute_recipe` tool is a different thing entirely. That one runs pre-validated CLI recipes (Pandoc PDF export, for example), not learned mastery recipes.

## Two kinds of recipes

- **Static recipes** ship with the plugin. They cover stable patterns that are language- and vault-independent.
- **Learned recipes** come from your own episodes. They are stored per vault in the knowledge database. A dedicated settings panel for browsing them is not shipped yet (FIX-10); the `learnedRecipesEnabled` flag is force-enabled at plugin load so promotion always runs.

A hard cap of 50 learned recipes prevents unbounded growth (see `MAX_LEARNED_RECIPES` in `src/core/mastery/RecipePromotionService.ts`). When the cap is hit, the oldest unused recipe is evicted on the next promotion.

## Limits

- Three repetitions are needed before promotion. Rare-but-useful patterns will not be learned until they repeat.
- Recipe learning depends on a working embedding model. If embeddings are disabled or the model is offline, no new recipes are promoted (existing ones still match by keyword).
- Recipe generation is a fire-and-forget background call. If the call fails, the failure is not surfaced.
- Recipes capture intent, not exact tool choice. The same recipe may map to slightly different tool sequences across runs.
- The retired `SuggestionService` is dead code; ignore any internal references to it.

## Related decisions

- ADR-058: intent-based semantic promotion (replaces the old pattern-key approach)
- ADR-059 and ADR-060: budget-aware extraction and database-backed memory retrieval
- ADR-018: original episode recording format (still used for the on-disk layout)
- ADR-131, ADR-132, ADR-133: VO-selector precedence, Stigmergy pinned-sequence direct promotion, and episode recording in finally blocks

See also: [Skills, rules, and workflows](/guides/skills-rules-workflows), [Tools reference: execute_recipe](/reference/tools#plugin-integration-tools).
