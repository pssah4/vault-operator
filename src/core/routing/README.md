# src/core/routing/

Model and task routing utilities. Two concepts share this module:

1. **Task routing** (v2.10.0): `TaskRouter` classifies a user prompt
   into `simple` vs `complex` so the AgentTask can route simple work
   onto the cheaper helper model. Heuristic-first (regex), one-shot
   LLM fallback. Independent of any provider/tier concept.
2. **Tier routing** (EPIC-26 / FEAT-26-01 / FEAT-26-02): the
   Advisor-Pattern. The main loop runs on the mid tier; the agent
   escalates one synthesis step to the flagship tier via the
   `consult_flagship` tool. `ModelTierClassifier` decides which tier
   a discovered model belongs to, and `ModelDiscoveryService` keeps
   the per-provider model list fresh with a 24h cache.

## Files

| File | Role |
|---|---|
| `TaskRouter.ts` | Simple/complex prompt classifier (regex + LLM fallback). |
| `ModelTierClassifier.ts` | Pure function `classifyModelTier(id, opts)` returning `{ tier, source }` (or null). Pattern-first, OpenRouter pricing, capability fallback. Local providers return null. |
| `ModelDiscoveryService.ts` | Wraps a provider model-list fetcher, enriches with `autoTier`, persists to `ProviderConfig.discoveredModels` with 24h TTL. Tests inject a `ModelFetcher`. |

## Extending the tier classifier

When a new model family ships (Anthropic Claude 5, GPT-6 etc.):

1. Add a regex to the matching tier in `ModelTierClassifier.ts`. Use a
   family prefix (`/\bclaude.*opus\b/i`), not a full id - provider
   suffixes change.
2. Test against the live provider id (Anthropic direct AND OpenRouter
   form AND Bedrock form). `normalizeModelId()` in
   `src/types/model-registry.ts` strips the wrappers first.
3. The capability fallback uses `contextWindow` and `maxTokens` from
   `ModelInfo`. If you add a known model with no `ModelInfo` entry,
   classification only works via pattern.
4. OpenRouter pricing thresholds (`PRICING_THRESHOLDS`) are USD per
   million completion tokens; adjust when market prices shift.

## Extending discovery

`ModelDiscoveryService` accepts a `ModelFetcher` function via its
constructor. The production wiring (in `src/main.ts` once the Welle 2
UI lands) builds the fetcher from the existing
`fetchProviderModels()` in `src/ui/settings/testModelConnection.ts`.
For tests: pass a mock fetcher that resolves the raw list.

A `RawDiscoveredModel` carries the id plus optional metadata. When
the provider exposes pricing (OpenRouter), set
`pricingPromptUsd` / `pricingCompletionUsd` (USD per million tokens)
so the classifier's pricing path can pick up unknown models. For
local providers (`ollama`, `lmstudio`, `custom`) the service still
discovers the list, but `autoTier` stays undefined and the user
assigns slots manually via `tierOverrides`.

## Related

- ADR-115 (Helper model + tier semantics) -- extended by EPIC-26 to
  resolve the helper from `tierMapping.fast`.
- ADR-120 (Advisor-Pattern) -- consumes the tier slots.
- ADR-121 (Tier-Klassifikator) -- pattern + capability + pricing
  strategy.
- ADR-122 (Provider-only settings schema) -- where the discovered
  models live (`ProviderConfig.discoveredModels`).
