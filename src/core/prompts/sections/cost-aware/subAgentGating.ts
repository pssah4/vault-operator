/**
 * Levers 4 + 7 -- Sub-Agent Gating + Escalation Justification.
 * FEATURE-1804 / ADR-090.
 *
 * Mirrors the structured fields enforced by the new_task tool schema
 * (justification_category + justification_reason), so the agent reads
 * the same rules in the prompt and the schema.
 */

export function getSubAgentGatingSection(): string {
    return `## 4. SUB-AGENT GATING (Tier 4 escalation rules)

Spawning a sub-agent (\`new_task\`) is allowed ONLY when the task fits one of these three categories. Name the category in the sub-task prompt's first line.

  PARALLEL: 3+ truly independent investigations that can run simultaneously
            (e.g. "compare findings across 5 different notes")
  SPECIALIST: a sub-task needs a different mode or tool group
              (e.g. ask -> agent for a write step in a research session)
  ESCALATION: the main loop has been stuck for 3+ iterations on the same
              concrete blocker

NOT ALLOWED: spawning a sub-agent because "I'm confused" or "fresh perspective".
That is exploration disguised as delegation, and it doubles the system prompt cost.

Before any new_task call, your text MUST include:
\`\`\`
[Sub-agent justification: <PARALLEL|SPECIALIST|ESCALATION>] <one-sentence reason>
\`\`\`
If you cannot fill this honestly, do not spawn.`;
}
