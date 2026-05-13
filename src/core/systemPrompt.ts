/**
 * System Prompt Builder
 *
 * Orchestrates modular prompt sections into the final system prompt.
 * Each section is a pure function in src/core/prompts/sections/.
 *
 * Section order (ADR-062: KV-Cache-Optimized):
 *
 * STABLE (cached across iterations):
 *   1. Mode definition
 *   2. Capabilities
 *   3. Obsidian conventions
 *   4. Tools (filtered by mode, largest stable block)
 *   5. Tool routing (rules + guidelines)
 *   6. Objective
 *   7. Response format
 *   8. Security boundary
 *   8b. Skill Directory (ADR-116 / FEAT-24-09 — name+description per skill;
 *       full body loaded on demand via the read_skill tool)
 *   ── CACHE BREAKPOINT ──
 * DYNAMIC (can change per message/session):
 *   9. Plugin Skills
 *  10. User memory
 *  11. Procedural Recipes
 *  12. Custom instructions + Rules
 *  13. Explicit instructions
 *  14. Vault context
 *  15. DateTime (MUST be last -- timestamp invalidates cache)
 *
 * Adapted from Kilo Code's src/core/prompts/system.ts — modularized for Obsidian.
 */

import type { ModeConfig } from '../types/settings';
import type { McpClient } from './mcp/McpClient';
import {
    getDateTimeSection,
    getVaultContextSection,
    getCapabilitiesSection,
    getMemorySection,
    getToolsSection,
    getToolRoutingSection,
    getObjectiveSection,
    getResponseFormatSection,
    getExplicitInstructionsSection,
    getSecurityBoundarySection,
    getModeDefinitionSection,
    getCustomInstructionsSection,
    getPluginSkillsSection,
    getSkillDirectorySection,
    getRulesSection,
    getObsidianConventionsSection,
    getCostAwareHeuristicsSection,
} from './prompts/sections';

/**
 * ADR-62 amendment (FEAT-24-01): a real sentinel line that splits the system
 * prompt into the cacheable prefix (sections 1-8) and the volatile tail
 * (sections 9-17, e.g. memory / active skills / vault context / date). Providers
 * with an explicit cache marker (Anthropic `cache_control`, Bedrock `cachePoint`)
 * put the marker only on the prefix; the tail gets no marker. The line is unique,
 * appears on its own line, and is stripped before the prompt is sent.
 *
 * Until 2026-05-12 the "CACHE BREAKPOINT" was only a code comment in this file
 * (never in the rendered string), so the marker landed on the whole prompt incl.
 * the volatile tail -> cache miss + re-write on every call (RESEARCH-36 Befund A).
 */
export const CACHE_BREAKPOINT_MARKER = '<<<OBSILO_CACHE_BREAKPOINT>>>';

/**
 * Split a rendered system prompt at {@link CACHE_BREAKPOINT_MARKER}. Returns the
 * cacheable prefix and the volatile tail with the marker line removed. If the
 * marker is absent (legacy prompt, subtask), `stable` is the whole prompt and
 * `volatile` is empty — callers then fall back to marking the whole thing.
 */
export function splitSystemPromptAtCacheBreakpoint(prompt: string): { stable: string; volatile: string } {
    const idx = prompt.indexOf(CACHE_BREAKPOINT_MARKER);
    if (idx < 0) return { stable: prompt, volatile: '' };
    const stable = prompt.slice(0, idx).replace(/\n+$/, '\n');
    const volatile = prompt.slice(idx + CACHE_BREAKPOINT_MARKER.length).replace(/^\n+/, '\n');
    return { stable, volatile };
}

/**
 * Configuration for building the system prompt.
 * Replaces 15+ positional parameters with a structured config object.
 */
export interface SystemPromptConfig {
    mode: ModeConfig;
    globalCustomInstructions?: string;
    includeTime?: boolean;
    rulesContent?: string;
    /**
     * FEAT-24-09 / ADR-116: stable skill directory (name + description per
     * installed skill, plus inventory lines for self-authored skills). Lives
     * above the cache breakpoint. Replaces the per-message-classified
     * `skillsSection` and the dynamic `selfAuthoredSkillsSection`.
     */
    skillDirectorySection?: string;
    mcpClient?: McpClient;
    allowedMcpServers?: string[];
    memoryContext?: string;
    pluginSkillsSection?: string;
    isSubtask?: boolean;
    webEnabled?: boolean;
    recipesSection?: string;
    configDir: string;
    /**
     * FEAT-24-04 / ADR-113: when set, REPLACES `mode.roleDefinition` in
     * Section 1 so a profile-spawned subagent gets a lean role line
     * instead of the inherited mode role. Only set by spawnSubtask when
     * `new_task` was called with `profile='...'`.
     */
    subagentRoleOverride?: string;
    /**
     * FEAT-24-04 / ADR-113: when set, the TOOLS section is rendered for
     * exactly this allowlist (subset of `mode.toolGroups`). Keeps the
     * subagent's tool surface as small as the profile demands.
     */
    subagentAllowedTools?: string[];
}

/**
 * Build the system prompt for a given mode.
 *
 * Accepts either a SystemPromptConfig object (preferred) or positional
 * parameters (legacy, kept for backwards compatibility during migration).
 */
export function buildSystemPromptForMode(config: SystemPromptConfig): string;
/** @deprecated Use the config object overload instead. */
export function buildSystemPromptForMode(
    mode: ModeConfig,
    allModes?: ModeConfig[],
    globalCustomInstructions?: string,
    includeTime?: boolean,
    rulesContent?: string,
    skillDirectorySection?: string,
    mcpClient?: McpClient,
    allowedMcpServers?: string[],
    memoryContext?: string,
    pluginSkillsSection?: string,
    isSubtask?: boolean,
    webEnabled?: boolean,
    recipesSection?: string,
    configDir?: string,
): string;
export function buildSystemPromptForMode(
    configOrMode: SystemPromptConfig | ModeConfig,
    allModes?: ModeConfig[],
    globalCustomInstructions?: string,
    includeTime?: boolean,
    rulesContent?: string,
    skillDirectorySection?: string,
    mcpClient?: McpClient,
    allowedMcpServers?: string[],
    memoryContext?: string,
    pluginSkillsSection?: string,
    isSubtask = false,
    webEnabled?: boolean,
    recipesSection?: string,
    configDir?: string,
): string {
    // Normalize: if first arg has 'slug' and 'toolGroups', it's a ModeConfig (legacy call)
    // If it has 'mode' property, it's a SystemPromptConfig
    let mode: ModeConfig;
    let subagentRoleOverride: string | undefined;
    let subagentAllowedTools: string[] | undefined;
    if ('mode' in configOrMode && 'slug' in configOrMode.mode) {
        // Config object form
        const cfg = configOrMode;
        mode = cfg.mode;
        globalCustomInstructions = cfg.globalCustomInstructions;
        includeTime = cfg.includeTime;
        rulesContent = cfg.rulesContent;
        skillDirectorySection = cfg.skillDirectorySection;
        mcpClient = cfg.mcpClient;
        allowedMcpServers = cfg.allowedMcpServers;
        memoryContext = cfg.memoryContext;
        pluginSkillsSection = cfg.pluginSkillsSection;
        isSubtask = cfg.isSubtask ?? false;
        webEnabled = cfg.webEnabled;
        recipesSection = cfg.recipesSection;
        configDir = cfg.configDir;
        subagentRoleOverride = cfg.subagentRoleOverride;
        subagentAllowedTools = cfg.subagentAllowedTools;
    } else {
        // Legacy positional form
        mode = configOrMode as ModeConfig;
    }
    // ADR-062: KV-Cache-Optimized Section Order
    // STABLE sections first (cached by KV-cache across iterations),
    // DYNAMIC sections after the breakpoint (change per message/session).
    // A single changed token in the prefix invalidates the entire cache.
    // Reference: Manus Context Engineering (2025)
    const sections: string[] = [
        // ── STABLE (cached, does not change within a task session) ──────
        // 1. Mode role definition (or subagent profile override -- FEAT-24-04 / ADR-113)
        getModeDefinitionSection(mode, subagentRoleOverride),

        // 1b. ADR-090: Cost-Aware Agent Heuristics (plan-first, tool tiers,
        //     anti-overthinking, sub-agent gating, error recovery, stop
        //     condition, budget awareness). Placed early so the agent reads
        //     the cost rules BEFORE the tool catalogue.
        getCostAwareHeuristicsSection(),

        // 2. Capabilities (compact summary)
        getCapabilitiesSection(webEnabled),

        // 3. Obsidian conventions (central, not mode-specific)
        getObsidianConventionsSection(),

        // 4. Tools (filtered by mode -- compact form by default, ~1.5k tokens.
        //    Full docs via find_tool(name). ADR-090 Lever 8.
        //    FEAT-24-04 / ADR-113: subagent profile narrows the allowlist further.
        getToolsSection(mode.toolGroups, mcpClient, allowedMcpServers, webEnabled, false, subagentAllowedTools),

        // 5. Tool Routing (merged rules + guidelines)
        getToolRoutingSection(configDir!),

        // 6. Objective (task decomposition)
        getObjectiveSection(),

        // 7. Response format (omit for subtasks)
        isSubtask ? '' : getResponseFormatSection(),

        // 8. Security boundary
        getSecurityBoundarySection(),

        // 8b. Skill Directory (ADR-116 / FEAT-24-09) — stable, cached.
        // Lists every installed skill (name + description, plus inventory
        // lines for self-authored skills). The model loads the full body
        // on demand via the read_skill tool; the body lives in the message
        // stream and falls under microcompaction (FEAT-24-02). Subtasks
        // skip skills entirely (same as the old behaviour).
        isSubtask ? '' : getSkillDirectorySection(skillDirectorySection),

        // ── CACHE BREAKPOINT ────────────────────────────────────────────
        // Real sentinel line (ADR-62 amendment / FEAT-24-01). Providers with an
        // explicit cache marker put it ONLY on everything ABOVE this line; the
        // volatile tail below gets no marker. The line is stripped before send.
        CACHE_BREAKPOINT_MARKER,

        // 9. Plugin Skills (can change when plugins are enabled/disabled)
        getPluginSkillsSection(pluginSkillsSection),

        // 10. User memory (changes across sessions)
        isSubtask ? '' : getMemorySection(memoryContext),

        // 11. Procedural Recipes (ADR-017, matched per message)
        (isSubtask || !recipesSection) ? '' : recipesSection,

        // 12. Custom instructions + Rules (user-defined, can change)
        isSubtask ? '' : getCustomInstructionsSection(globalCustomInstructions, mode.customInstructions),
        getRulesSection(rulesContent),

        // 13. Explicit instructions
        getExplicitInstructionsSection(),

        // 14. Vault context (file structure can change between tasks)
        getVaultContextSection(),

        // 15. DateTime — MUST be last (timestamp invalidates KV-cache!)
        getDateTimeSection(includeTime),
    ];

    // Token-budget diagnostics: log a section-level char breakdown so the
    // user can see WHICH section dominates the system prompt. ~4 chars
    // per token is a usable rule of thumb (Anthropic / OpenAI tokenisers
    // are close enough for ranking purposes). Disabled when the result
    // is small to avoid noise on subtask prompts.
    const labels = [
        'mode', 'cost-heuristics', 'capabilities', 'obsidian-conv', 'tools', 'tool-routing',
        'objective', 'response-format', 'security', 'skill-directory', 'cache-breakpoint',
        'plugin-skills', 'memory', 'recipes',
        'custom-instructions', 'rules',
        'explicit-instructions', 'vault-context', 'datetime',
    ];
    const merged = sections.filter(Boolean).join('\n');
    if (merged.length > 20_000) {
        const breakdown: Array<{ section: string; chars: number; approxTokens: number }> = [];
        for (let i = 0; i < sections.length; i++) {
            const chars = sections[i]?.length ?? 0;
            if (chars === 0) continue;
            breakdown.push({ section: labels[i] ?? `s${i}`, chars, approxTokens: Math.round(chars / 4) });
        }
        breakdown.sort((a, b) => b.chars - a.chars);
        const totalTok = Math.round(merged.length / 4);
        const top = breakdown.slice(0, 8).map(b => `${b.section}=${b.approxTokens}`).join(' ');
        console.debug(
            `[SystemPrompt] ${merged.length} chars (~${totalTok} tokens). ` +
            `Top sections: ${top}`,
        );
    }
    return merged;
}

