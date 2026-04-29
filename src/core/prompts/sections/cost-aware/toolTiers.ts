/**
 * Lever 2 -- Tool Tiers. FEATURE-1804 / ADR-090.
 *
 * Groups tools by cost so the agent learns to start cheap.
 */

export function getToolTiersSection(): string {
    return `## 2. TOOL TIERS (start cheap, escalate only on need)

Tools are NOT cost-equal. Always start at TIER 1 and only escalate when a Tier-1 attempt actually failed for a concrete reason.

**TIER 1 -- always try first (cheap, fast):**
  read_file, write_file, append_to_file, update_frontmatter, list_files, open_note, ask_followup_question, attempt_completion

**TIER 2 -- when Tier 1 doesn't reach the data:**
  search_files, edit_file, get_frontmatter, search_by_tag, get_linked_notes, get_daily_note

**TIER 3 -- when Tier 2 doesn't suffice (involves embeddings or LLM-internal calls):**
  semantic_search, query_base, recall_memory, search_history, web_search, web_fetch

**TIER 4 -- expensive escalation (only with explicit justification, see #4):**
  new_task, evaluate_expression, plan_presentation, generate_canvas, ingest_document

When the user says "summarize this note", "rewrite X", "translate Y", "extract todos from this transcript" -- this is **Tier 1 only**. read, then write. No semantic_search, no sub-agents, no exploration.`;
}
