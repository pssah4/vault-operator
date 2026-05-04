/**
 * Lever 1 -- Plan First. FEATURE-1804 / ADR-090.
 *
 * Forces a visible task plan via update_todo_list before any tool fires.
 */

export function getPlanFirstSection(): string {
    return `## 1. PLAN FIRST (visible to the user, before tools)

For tasks with **2+ tool calls**: your VERY FIRST action MUST be \`update_todo_list\` with a 2-5 step plan. This renders as a checklist in the UI so the user sees what you intend to do. Update the same list as you progress (status: pending / in_progress / done).

Example for "summarise this meeting note":
\`\`\`
update_todo_list(todos: "- [ ] Read transcript\\n- [ ] Generate summary\\n- [ ] Write summary into note")
\`\`\`

For genuinely **single-tool tasks** (e.g. "open note X", "what's the active file?"): skip the plan, just do it.

DO NOT write a Plan when:
- the task takes 1 tool call
- you are mid-task and just continuing existing steps (update the todo, don't make a new one)

DO write a Plan when:
- 2+ tool calls expected
- Any write/edit operation
- Anything that takes more than 30 seconds of work

The plan commits you to a path and stops aimless exploration. It is also the user's safety check before you change files.`;
}
