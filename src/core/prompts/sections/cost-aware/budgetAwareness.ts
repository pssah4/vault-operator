/**
 * Lever 5 (prompt-side) -- Budget Awareness. FEATURE-1804 / ADR-090.
 *
 * The numeric live cost is shown to the user via the UI footer (see
 * AgentSidebarView). This section makes the targets visible to the
 * agent itself so it knows when to stop and reconsider.
 */

export function getBudgetAwarenessSection(): string {
    return `## 7. BUDGET AWARENESS

The UI shows live token + EUR cost to the user. Internalise these targets:
- A "lies, schreibe" task should cost <= 5 cents (≤30k input tokens)
- A search-and-summarise task should cost <= 10 cents (≤60k input tokens)
- A multi-step research task should cost <= 30 cents (≤200k input tokens)

If your token budget for the current task is already past these thresholds, your plan is wrong. Stop and reconsider before continuing.`;
}
