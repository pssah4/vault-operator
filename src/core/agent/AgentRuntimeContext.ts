/**
 * AgentRuntimeContext -- shared pre-run assembly for the agent loop (EPIC-33 parity).
 *
 * Extracted from AgentSidebarView.handleSendMessage (lines 1268-2772)
 * so the Sidebar AND the InlineChatPanel produce IDENTICAL runtime
 * context for AgentTask.run. The user's insight: "es ist der SELBE
 * LOOP, nur aus einer anderen Stelle / UI angesprochen." This
 * module is that shared loop's input builder.
 *
 * Produces all the optional AgentTaskRunConfig fields the Sidebar
 * builds inline today:
 *   - rulesContent       (RulesLoader.loadEnabledRules)
 *   - skillDirectorySection (self-authored + user skills, mode-filtered)
 *   - pluginSkillsSection (SkillRegistry.getPluginSkillsPromptSection)
 *   - memoryContext      (Memory-v2 ContextComposer + SoulView + session
 *                          retrieval on first message + onboarding prompt)
 *   - recipesSection     (RecipeMatchingService.match -> buildPromptSection)
 *   - recipeMatches      (same matches, handed through so AgentTask's
 *                          FastPath gate sees the same result)
 *
 * Defensive: every section is wrapped in try/catch and degrades to
 * undefined, so a missing service NEVER blocks the loop.
 */

import type ObsidianAgentPlugin from '../../main';
import type { ModeConfig } from '../../types/settings';
import { MemoryRetriever } from '../memory/MemoryRetriever';
import { OnboardingService } from '../memory/OnboardingService';
import { isActiveOnboardingFlow } from '../onboarding-status';

export interface RuntimeContextArgs {
    /** Raw user text (pre-expansion) used for embedding + recipe match. */
    userText: string;
    /** Resolved mode for this turn. */
    mode: ModeConfig;
    /** True when no prior history exists -- gates session retrieval. */
    isFirstMessage: boolean;
    /** Active conversation id (memory composer uses it for sessionId). */
    activeConversationId?: string;
}

export interface RuntimeContext {
    rulesContent?: string;
    skillDirectorySection?: string;
    pluginSkillsSection?: string;
    memoryContext?: string;
    recipesSection?: string;
    recipeMatches?: import('../mastery/RecipeMatchingService').RecipeMatchResult[];
    allowedMcpServers?: string[];
}

export async function buildAgentRuntimeContext(
    plugin: ObsidianAgentPlugin,
    args: RuntimeContextArgs,
): Promise<RuntimeContext> {
    const ctx: RuntimeContext = {};
    const isOnboarding = isActiveOnboardingFlow(plugin.settings);

    // --- rules ----------------------------------------------------
    try {
        const rulesLoader = (plugin as unknown as { rulesLoader?: { loadEnabledRules: (toggles: Record<string, boolean>) => Promise<string | undefined> } }).rulesLoader;
        if (rulesLoader !== undefined) {
            const loaded = await rulesLoader.loadEnabledRules((plugin.settings as { rulesToggles?: Record<string, boolean> }).rulesToggles ?? {});
            if (typeof loaded === 'string' && loaded.length > 0) ctx.rulesContent = loaded;
        }
    } catch (e) {
        console.debug('[AgentRuntimeContext] rules failed (non-fatal):', e);
    }

    // --- skill directory (FEAT-24-09 / ADR-116) ------------------
    if (isOnboarding === false) {
        try {
            ctx.skillDirectorySection = await buildSkillDirectory(plugin);
        } catch (e) {
            console.debug('[AgentRuntimeContext] skillDirectory failed:', e);
        }
    }

    // --- plugin skills (PAS-1) -----------------------------------
    if (isOnboarding === false) {
        try {
            const reg = (plugin as unknown as { skillRegistry?: { getPluginSkillsPromptSection?: () => string | undefined } }).skillRegistry;
            const section = reg?.getPluginSkillsPromptSection?.();
            if (typeof section === 'string' && section.length > 0) ctx.pluginSkillsSection = section;
        } catch (e) {
            console.debug('[AgentRuntimeContext] pluginSkills failed:', e);
        }
    }

    // --- memory context (Memory v2) ------------------------------
    ctx.memoryContext = await buildMemoryContext(plugin, args);

    // --- recipes (ADR-017, FEAT-32-01 PR 1.3 / ADR-131) ---------
    try {
        const masteryEnabled = (plugin.settings as { mastery?: { enabled?: boolean } }).mastery?.enabled === true;
        const svc = (plugin as unknown as { recipeMatchingService?: { match: (text: string, modeSlug: string) => import('../mastery/RecipeMatchingService').RecipeMatchResult[]; buildPromptSection: (matches: import('../mastery/RecipeMatchingService').RecipeMatchResult[]) => string } }).recipeMatchingService;
        if (masteryEnabled && svc !== undefined) {
            const matches = svc.match(args.userText, args.mode.slug);
            ctx.recipeMatches = matches;
            if (matches.length > 0) {
                ctx.recipesSection = svc.buildPromptSection(matches);
            }
        }
    } catch (e) {
        console.debug('[AgentRuntimeContext] recipes failed:', e);
    }

    // --- MCP allow-list ------------------------------------------
    // 2026-05-18: per-mode allow-list removed; activeMcpServers is the
    // global source of truth via McpBridge. Passing undefined means
    // "no per-agent restriction".
    ctx.allowedMcpServers = undefined;

    return ctx;
}

/** Mirrors AgentSidebarView.buildSkillDirectory (sidebar:1268-1293). */
async function buildSkillDirectory(plugin: ObsidianAgentPlugin): Promise<string | undefined> {
    const skillsManager = (plugin as unknown as { skillsManager?: { discoverSkills: () => Promise<Array<{ name: string; description: string; path: string }>> } }).skillsManager;
    const selfLoader = (plugin as unknown as { selfAuthoredSkillLoader?: { getMetadataSummary?: () => string; getAllSkills?: () => Array<{ name: string }> } }).selfAuthoredSkillLoader;

    const toggles = (plugin.settings as { manualSkillToggles?: Record<string, boolean> }).manualSkillToggles ?? {};
    const userSkills = skillsManager !== undefined ? await skillsManager.discoverSkills() : [];
    const filteredUserSkills = Object.keys(toggles).length > 0
        ? userSkills.filter(s => toggles[s.path] !== false)
        : userSkills;

    const selfAuthoredBlock = selfLoader?.getMetadataSummary?.() ?? '';
    const selfAuthoredNames = new Set((selfLoader?.getAllSkills?.() ?? []).map(s => s.name));

    const userLines = filteredUserSkills
        .filter(s => selfAuthoredNames.has(s.name) === false)
        .map(s => `- ${s.name}: ${s.description}`);

    const blocks = [selfAuthoredBlock, userLines.join('\n')].filter(b => b.length > 0);
    if (blocks.length === 0) return undefined;
    return blocks.join('\n');
}

/** Mirrors AgentSidebarView memory-context assembly (sidebar:2652-2749). */
async function buildMemoryContext(
    plugin: ObsidianAgentPlugin,
    args: RuntimeContextArgs,
): Promise<string | undefined> {
    let memoryContext: string | undefined;
    const memorySettings = (plugin.settings as { memory?: { enabled?: boolean } }).memory;
    if (memorySettings?.enabled !== true) return undefined;

    const memoryDB = (plugin as unknown as { memoryDB?: { isOpen?: () => boolean } }).memoryDB;
    const embeddingService = (plugin as unknown as { embeddingService?: { isReady?: () => boolean; embed: (texts: string[]) => Promise<Float32Array[]> } }).embeddingService;

    if (memoryDB?.isOpen?.() === true && embeddingService?.isReady?.() === true) {
        try {
            const memModule = await import('../memory/TopicInference');
            const profileModule = await import('../memory/UserProfileView');
            const composerModule = await import('../memory/ContextComposer');
            const soulModule = await import('../memory/SoulView');
            const inference = new memModule.TopicInference(memoryDB as never);
            const profileView = new profileModule.UserProfileView(memoryDB as never);
            const driftBus = (plugin as unknown as { driftBus?: unknown }).driftBus;
            const tokenBudget = (plugin as unknown as { tokenBudget?: { blockReason: () => string | null; snapshot: () => { day: string } } }).tokenBudget;
            const composer = new composerModule.ContextComposer(
                memoryDB as never,
                inference,
                profileView,
                driftBus as never,
                () => {
                    if (tokenBudget === undefined) return null;
                    const reason = tokenBudget.blockReason();
                    if (reason === null || reason === undefined) return null;
                    return { reason, dayKey: tokenBudget.snapshot().day };
                },
            );
            let userEmbedding: Float32Array | null = null;
            if (args.userText.trim().length > 0) {
                const vectors = await embeddingService.embed([args.userText]);
                userEmbedding = vectors[0] ?? null;
            }
            const topHubBlock = (plugin.settings as { vaultIngest?: { topHubBlock?: { enabled?: boolean } } }).vaultIngest?.topHubBlock?.enabled === true
                ? (plugin as unknown as { topHubBlockMarkdown?: string }).topHubBlockMarkdown
                : undefined;
            const composed = composer.compose({
                sessionId: args.activeConversationId ?? 'transient',
                userMessageEmbedding: userEmbedding,
                topHubBlockMarkdown: topHubBlock,
            });
            const soulMarkdown = new soulModule.SoulView(memoryDB as never).renderMarkdown();
            const parts: string[] = [];
            if (typeof soulMarkdown === 'string' && soulMarkdown.length > 0) parts.push(soulMarkdown);
            if (typeof composed.markdown === 'string' && composed.markdown.length > 0) parts.push(composed.markdown);
            if (parts.length > 0) memoryContext = parts.join('\n\n');
        } catch (e) {
            console.warn('[AgentRuntimeContext] Memory v2 ContextComposer failed:', e);
        }
    }

    // Session retrieval + onboarding (independent of v1/v2).
    const memoryService = (plugin as unknown as { memoryService?: { getStats: () => Promise<{ sessionCount: number }> } }).memoryService;
    if (memoryService !== undefined) {
        try {
            const parts: string[] = memoryContext !== undefined ? [memoryContext] : [];
            const onboarding = new OnboardingService(memoryService as never, plugin);
            const onboardingPrompt = onboarding.getOnboardingPrompt();
            if (typeof onboardingPrompt === 'string' && onboardingPrompt.length > 0) parts.unshift(onboardingPrompt);

            if (args.isFirstMessage === true && args.userText.trim().length > 0) {
                const stats = await memoryService.getStats();
                if (stats.sessionCount > 0) {
                    const globalFs = (plugin as unknown as { globalFs?: unknown }).globalFs;
                    const semanticIndex = (plugin as unknown as { semanticIndex?: unknown }).semanticIndex;
                    const retriever = new MemoryRetriever(
                        globalFs as never,
                        memoryService as never,
                        () => semanticIndex as never,
                        (plugin as unknown as { memoryDB?: unknown }).memoryDB as never,
                    );
                    const sessionContext = await retriever.retrieveSessionContext(args.userText);
                    if (typeof sessionContext === 'string' && sessionContext.length > 0) parts.push(sessionContext);
                }
            }
            if (parts.length > 0) memoryContext = parts.join('\n\n');
        } catch (e) {
            console.warn('[AgentRuntimeContext] Session retrieval failed:', e);
        }
    }

    return memoryContext;
}
