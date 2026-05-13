/**
 * Helper-Model Routing -- FEAT-24-07 / ADR-115.
 *
 * Returns an `ApiHandler` bound to the user-configured helper model, or
 * the provided fallback. Used by agent-internal LLM calls (context
 * condensing, fast-path planner/presenter, plan_presentation,
 * recipe-promotion) to route those calls onto a cheaper mid-tier model
 * (typically Haiku / GPT-5-mini / Gemini Flash) without forcing the user
 * to maintain two main-model slots.
 *
 * Fail-closed: any build failure falls back to the main handler with a
 * console warning. Never throws.
 *
 * Out-of-scope (kept on the main model or routed via their own keys):
 * the ReAct main loop, hard-limit-recovery, any user-facing output,
 * memory-extractor (uses memoryModelKey), chat-link titling
 * (titlingModelKey), classifyText hooks.
 */

import type { ApiHandler } from '../api/types';
import { buildApiHandlerForModel } from '../api/index';
import type ObsidianAgentPlugin from '../main';

export function getHelperApi(plugin: ObsidianAgentPlugin, fallback: ApiHandler): ApiHandler {
    const model = plugin.getHelperModel();
    if (!model) return fallback;
    try {
        return buildApiHandlerForModel(model);
    } catch (e) {
        console.warn('[helper-api] Failed to build helper handler; falling back to main:', e);
        return fallback;
    }
}
