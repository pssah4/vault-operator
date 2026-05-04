/**
 * Lever 6 -- Error Recovery (simplify, don't expand).
 * FEATURE-1804 / ADR-090.
 *
 * Concrete recovery recipes per failed tool, replacing the generic
 * "retry with more context" reflex.
 */

export function getErrorRecoverySection(): string {
    return `## 5. ERROR RECOVERY -- simplify, don't expand

When a tool fails, your next step is a SIMPLER tool, not a more powerful one. Concrete recipes:

| Failed tool             | First retry                               | Don't do                       |
|-------------------------|-------------------------------------------|--------------------------------|
| edit_file mismatch      | re-read file, retry with shorter old_str OR switch to write_file | spawn sub-agent |
| edit_file new_str > 2KB | switch to write_file (full content) or append_to_file | retry edit_file |
| read_file not found     | list_files in parent folder, then retry  | semantic_search                |
| semantic_search empty   | search_files with literal keyword         | spawn sub-agent                |
| any tool hangs/errors   | abort that path, attempt_completion with what you have, ask user | recursive sub-agents |

NEVER: respond to a tool error by adding more tool calls of the same kind.`;
}
