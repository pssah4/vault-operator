---
id: AUDIT-026
project: vault-operator
date: 2026-05-14
scope: v2.10.0 -- v2.10.2 Delta (TaskRouter regex+LLM-fallback, resolveOutputPath, AgentTask api-swap, TaskMonitor provider-lookup, formatEur, defaultOutputFolder)
overall-risk: Low
predecessor: AUDIT-025 (v2.9.0, 2026-05-14, Green, 3 High Findings resolved)
release-recommendation: Green
fix-status: 0 Critical, 0 High, 0 Medium, 1 Low, 2 Info. L-1 is cosmetic-not-security; both Info entries are documented behaviour. No fixes triggered, release v2.10.2 proceeds.
---

# AUDIT-026: v2.10.0 -- v2.10.2 Cost-Reduction Wave Delta

## Executive Summary

Three back-to-back releases (v2.10.0, v2.10.1, v2.10.2) shipped the cost-reduction wave: TaskRouter for automatic model-routing, defaultOutputFolder for file-write targets, locale-correct EUR cost display, and a cost-display follow-up that aligns the displayed price with the actually-used model when the router swaps the handler.

Audit scope is the delta files (8 source files plus settings + UI hooks). The new attack surfaces are: (1) regex classification of user-prompts (potential ReDoS), (2) path manipulation in resolveOutputPath (potential path traversal), (3) LLM-based fallback classification (potential prompt injection toward a less-capable model), (4) provider-lookup via substring match (potential label spoofing in the cost display).

All four were assessed. No exploitable issues found. One low-severity cosmetic finding (provider lookup first-match ambiguity) and two informational notes (ReDoS theoretical, defense-in-depth at the path-write boundary). npm audit clean across all severities.

Release-Empfehlung: **Green**. v2.10.2 ready to ship.

## Scope of the Delta since AUDIT-025

Eight source files changed or added across the three releases:

- `src/core/routing/TaskRouter.ts` (new, 131 LOC) -- regex-based and LLM-fallback prompt classifier.
- `src/core/tools/vault/resolveOutputPath.ts` (new, 30 LOC) -- path-resolution helper for the five create-tools.
- `src/core/AgentTask.ts` -- TaskRouter integration at run() start (api swap + escalation), `onUsage` callback signature gains optional `modelId` argument.
- `src/core/telemetry/TaskTelemetry.ts` -- `formatTelemetryFooter` doc-comment update; behaviour unchanged.
- `src/ui/sidebar/TaskMonitor.ts` -- `onUsage` accepts actualModelId, new `providerFor(id)` resolves provider from concrete model id via substring match against `activeModels`.
- `src/core/pricing/ModelPricing.ts` -- `formatEur` switched to `Intl.NumberFormat('de-DE', currency)`, added `PRICING_LAST_UPDATED` constant and `getPricingAgeWarning()` reminder.
- `src/core/tools/toolMetadata.ts` -- removed `create_xlsx`, `create_docx`, `create_pptx` from `DEFERRED_TOOL_NAMES`.
- `src/types/settings.ts` -- added `defaultOutputFolder` and `autoTaskRouter` settings.

Five create-tools (xlsx, docx, pptx, drawio, excalidraw) gained a single line that pipes their `output_path` input through resolveOutputPath. Settings UI added a text-input in VaultTab and a toggle in LoopTab.

## Findings

### L-1 providerFor first-match substring lookup can mismatch overlapping model names

- **Status:** Confirmed (cosmetic, not fixed)
- **Severity:** Low
- **CWE:** none -- UI label only, no security boundary
- **Location:** `src/ui/sidebar/TaskMonitor.ts:159-170` (providerFor)
- **Risk:** The new `providerFor(modelId)` resolves a provider by scanning `plugin.settings.activeModels` and matching the first entry whose `name` field overlaps with the supplied modelId in either direction (`endsWith` or `includes`). When two configured models have substring-overlapping names, e.g. one called `"claude"` and one called `"claude-haiku-4.5"`, a lookup for `"claude-haiku-4.5"` would match the shorter `"claude"` entry first and return its provider, mislabelling the [Cost] log and footer. The dollar/euro amount is unaffected because that comes from `computeCost(modelId, ...)`, which keys on the full modelId.

  In Sebastian's actual configuration the model names are unique and provider-prefixed (`eu.anthropic.claude-opus-4-6-v1`, `claude-haiku-4.5`), so the issue does not surface. A future user with multiple Claude variants named loosely could see a stale provider label and, by extension, a wrong `isSubscription` flag. The wrong flag would only change whether the `(~ via Sub)` suffix appears; cost amount and routing are not affected.

- **Remediation (deferred):** Either sort `activeModels` by name-length descending before `find`, or change the match to prefer exact equality and only fall back to substring when no exact match exists. Add a unit test that two overlapping names (`claude` plus `claude-haiku-4.5`) resolve correctly. Tracked as IMP for a future iteration; no exploit path today.

### I-1 TaskRouter regexes have O(n^2) worst-case backtracking

- **Status:** Informational (no action)
- **Severity:** Info
- **CWE:** CWE-1333 (theoretical, not exploitable here)
- **Location:** `src/core/routing/TaskRouter.ts:35-58` (four regex constants)
- **Risk:** `SIMPLE_OFFICE_RE`, `COMPLEX_RESEARCH_RE`, and `COMPLEX_MULTISTEP_RE` all use a greedy `.*` between two word-boundary anchors. On a pathological input where the trailing anchor is missing, the engine retries every position. For an n-character prompt the work is O(n^2), not exponential. The user prompt is also already capped: classifyByRegex receives the user-message text, which is at most a few hundred to a few thousand characters (the prompt is the human typing the request, not vault content). classifyWithFallback also slices the prompt to 1000 chars before sending it to the helper LLM. Worst-case work is below 1M regex ops, finishes in microseconds.

  No mitigation needed. Documented so a future contributor does not introduce nested quantifiers that would change the complexity class.

### I-2 resolveOutputPath relies on writeBinaryToVault for path-traversal defense

- **Status:** Informational (intentional layering)
- **Severity:** Info
- **CWE:** CWE-22 (mitigated downstream)
- **Location:** `src/core/tools/vault/resolveOutputPath.ts` (no checks); `src/core/tools/vault/writeBinaryToVault.ts:31-42` (checks land here)
- **Risk:** resolveOutputPath does pure string manipulation: it concatenates `defaultOutputFolder` (from settings) with the requested filename when the requested path has no slash, otherwise it passes the requested path through unchanged. It performs no traversal validation. If `defaultOutputFolder` is set to `"../evil"` via the settings UI, the resolved path would be `"../evil/file.xlsx"` and would be passed down to writeBinaryToVault.

  writeBinaryToVault explicitly rejects:
  - leading `/` (absolute path),
  - any occurrence of `..` (traversal),
  - any path that does not end with the expected extension.

  Defence is layered: the helper trusts the writer, the writer is strict. This is the correct shape (helpers stay pure, security checks live at the file-system boundary). I-2 documents it so we do not later move checks out of writeBinaryToVault without compensation.

  Sebastian's `defaultOutputFolder` default is `"Inbox/"`. Settings-UI is a free-text input; a user who deliberately types `"../"` would simply see the next file-write fail with `output_path must not contain ".."` -- self-inflicted, not exploitable from outside.

## Was bereits gut implementiert ist

- **TaskRouter trust boundaries:** the LLM fallback only reads single-token answers (`simple` or `complex`). On any error the fallback defaults to `complex` so the safe side (main model) wins. There is no path where a hostile LLM response causes code execution or escalates privileges.
- **AgentTask api swap is bounded:** the swap happens once at task start, the original `mainApi` reference is preserved, and `escalateToMain()` switches back deterministically after `consecutiveMistakes >= 2`. A weak helper cannot get stuck in the loop.
- **Subtask api inheritance:** subtasks inherit the parent's swapped api, so cost reporting in the parent already covers them. No leakage of the helper api outside the intended task scope.
- **Settings UI for defaultOutputFolder is sanitised:** the input is trimmed and falls back to `"Inbox/"` when empty. A user-set traversal string still has to pass writeBinaryToVault.
- **modelId is sourced from trusted internals:** `this.api.getModel().id` comes from the SDK / provider config, not from user input. No log-injection vector.
- **PRICING_LAST_UPDATED has no input:** static const, console.warn-only path.
- **npm audit clean:** 0 vulnerabilities across all severities. Same as AUDIT-025.

## SCA Status

```json
{"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0}}
```

22 runtime deps, 20 dev deps. No changes to dependencies in this delta.

## Zero-Trust Validation

The two trust boundaries that v2.10.x touches:

- **User -> Settings -> defaultOutputFolder:** settings input is text. Validation lives downstream at writeBinaryToVault (path-traversal + extension). Helper resolveOutputPath is pure; it trusts the writer to validate.
- **Plugin -> Helper LLM (TaskRouter fallback):** plugin sends a 1000-char-capped prompt to the helper api, parses the first 50 chars of the streamed answer as `simple` or `complex` (and defaults to `complex` on any error). Helper api itself is the user's own configured handler.

Both boundaries are sound.

## OWASP LLM Top 10 Status

- **LLM01 Prompt Injection:** The TaskRouter LLM-fallback puts the user prompt into the helper-LLM context. A hostile prompt cannot escalate privileges -- the answer is parsed as a binary token (`simple`|`complex`), failure defaults to the safer side. Any vault-content prompt injection (the long-standing one in the main agent) is unchanged and remains in-scope by design.
- **LLM02 Insecure Output:** Tool writes are still guarded by writeBinaryToVault path validation plus the existing tool-approval modal.
- **LLM05 Supply Chain:** SCA clean; no new dependencies. The optional-asset SHA pinning from AUDIT-025 remains.
- **LLM06 Sensitive Info Disclosure:** [Cost] log line now includes modelId. modelId is from the SDK config (no PII / no API key). Safe.
- **LLM07 Insecure Plugin Design:** TaskRouter does not change which tools are available, only which model serves the call. Tool-approval gates remain.
- **LLM08 Excessive Agency:** Escalation hook (consecutiveMistakes >= 2 -> back to main) prevents a weaker helper from grinding through repeated bad calls.

## Release Recommendation

**Green** for v2.10.2. The cost-display follow-up (which is what triggered this audit cycle) is a UX correctness fix, not a security fix. The audit found no security blockers in any of the three v2.10.x releases.

L-1 (provider-lookup substring overlap) is acceptable cosmetic; tracked as IMP for a later iteration if user reports a mislabel. Both Info entries are documented behaviour, no fixes required.
