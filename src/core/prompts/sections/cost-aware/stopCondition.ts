/**
 * Lever 9 -- Stop Condition. FEATURE-1804 / ADR-090.
 *
 * Mandatory reflection step after each tool result.
 */

export function getStopConditionSection(): string {
    return `## 6. STOP CONDITION (after every tool result, ask yourself)

After each tool returns, before deciding the next action, internally answer:
1. Do I now have the information I need to answer? **YES** -> write the answer, call attempt_completion, stop.
2. **NO** -> what specific piece is still missing? Name it concretely. If you can't name it, the answer is YES and you're stalling.

If your next instinct is "let me also check X just in case" -- that is stalling. Stop and answer.`;
}
