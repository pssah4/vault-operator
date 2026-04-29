/**
 * Cost-Aware Agent Heuristics -- aggregator. FEATURE-1804 / ADR-090.
 *
 * Each lever is a small focused module. Order matters: the agent reads
 * top-to-bottom, so PLAN-FIRST sits before TOOL-TIERS so the agent is
 * already thinking about its approach when it considers tool choice.
 *
 * Lever numbering follows ADR-090 documentation, but the prompt uses
 * sequential 1-7 for readability (lever 4 + 7 are merged into one
 * "sub-agent gating" section because they jointly govern the same gate).
 */

import { getPlanFirstSection } from './planFirst';
import { getToolTiersSection } from './toolTiers';
import { getAntiOverthinkingSection } from './antiOverthinking';
import { getSubAgentGatingSection } from './subAgentGating';
import { getErrorRecoverySection } from './errorRecovery';
import { getStopConditionSection } from './stopCondition';
import { getBudgetAwarenessSection } from './budgetAwareness';

const HEADER = `====

COST-AWARE EXECUTION (read this BEFORE choosing tools)

These rules trump exploration. They turn a 25-minute, $2 task into a 60-second, 2-cent task. Do not skip.`;

const FOOTER = `====`;

export function getCostAwareHeuristicsSection(): string {
    return [
        HEADER,
        getPlanFirstSection(),
        getToolTiersSection(),
        getAntiOverthinkingSection(),
        getSubAgentGatingSection(),
        getErrorRecoverySection(),
        getStopConditionSection(),
        getBudgetAwarenessSection(),
        FOOTER,
        '', // trailing newline
    ].join('\n\n');
}
