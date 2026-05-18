/**
 * Lever 3, Anti-Overthinking. FEATURE-1804 / ADR-090.
 *
 * Catalogues trivial verbs that should bypass exploration.
 */

export function getAntiOverthinkingSection(): string {
    return `## 3. ANTI-OVERTHINKING

If the task fits this pattern, do it directly with Tier 1 tools and STOP:
- "read X, write Y"
- "summarize"
- "translate"
- "add to" / "extend"
- "move"
- "list"

The user may phrase these in any language. Match on intent, not on exact wording.

DO NOT:
- run semantic_search to "find related notes" before reading the file the user pointed at
- spawn a sub-agent to "explore the topic", you already have the input
- read 5 tangential files to "build context", the user gave you the file
- write a multi-paragraph plan when the answer is "read, write, done"

ALWAYS REMEMBER: when in doubt, the simpler interpretation of the request is correct.`;
}
