import { describe, it, expect } from 'vitest';

/**
 * Tests for systemPrompt section ordering (ADR-062).
 *
 * Verifies that the KV-cache-optimized section order is maintained:
 * - Stable sections first (Mode, Capabilities, Tools, Routing, etc.)
 * - Dynamic sections after (Skills, Memory, Recipes, DateTime)
 * - DateTime MUST be last (timestamp invalidates KV-cache)
 */

// We test the section ordering by importing buildSystemPromptForMode
// with minimal config and checking the output structure.

async function buildTestPrompt(overrides: Record<string, unknown> = {}) {
    const { buildSystemPromptForMode } = await import('../systemPrompt');

    const defaultConfig = {
        mode: {
            slug: 'agent',
            name: 'Agent',
            roleDefinition: 'You are a helpful agent.',
            toolGroups: ['read', 'vault', 'edit', 'agent'] as import('../../types/settings').ToolGroup[],
            customInstructions: '',
        },
        includeTime: true,
        configDir: 'test-config-dir',
        ...overrides,
    };

    return buildSystemPromptForMode(defaultConfig as import('../systemPrompt').SystemPromptConfig);
}

describe('systemPrompt section ordering (ADR-062)', () => {
    it('should place DateTime at the end of the prompt', async () => {
        const prompt = await buildTestPrompt();

        // DateTime section contains "TODAY IS:" marker
        const dateTimeMarker = 'TODAY IS:';
        const dateTimeIndex = prompt.lastIndexOf(dateTimeMarker);

        // It should be in the last 500 chars of the prompt
        const distanceFromEnd = prompt.length - dateTimeIndex;
        expect(distanceFromEnd).toBeLessThan(500);
    });

    it('should place Mode Definition before Tools', async () => {
        const prompt = await buildTestPrompt();

        const modeIndex = prompt.indexOf('You are a helpful agent.');
        const toolsIndex = prompt.indexOf('TOOLS');

        expect(modeIndex).toBeGreaterThan(-1);
        expect(toolsIndex).toBeGreaterThan(-1);
        expect(modeIndex).toBeLessThan(toolsIndex);
    });

    it('should place Security Boundary before Skills', async () => {
        const prompt = await buildTestPrompt({
            skillDirectorySection: '- TestSkill: a test skill',
        });

        const securityIndex = prompt.indexOf('SECURITY');
        const skillsIndex = prompt.indexOf('TestSkill');

        if (securityIndex > -1 && skillsIndex > -1) {
            expect(securityIndex).toBeLessThan(skillsIndex);
        }
    });

    it('places the Skill Directory in the cached prefix (above the breakpoint)', async () => {
        const { CACHE_BREAKPOINT_MARKER } = await import('../systemPrompt');
        // The marker is stripped by splitSystemPromptAtCacheBreakpoint before
        // sending; the rendered prompt still contains it raw, which is what
        // we check against.
        const prompt = await buildTestPrompt({
            skillDirectorySection: '- TestSkill: a test skill',
        });

        const skillsIndex = prompt.indexOf('TestSkill');
        const breakpointIndex = prompt.indexOf(CACHE_BREAKPOINT_MARKER);

        expect(skillsIndex).toBeGreaterThan(-1);
        expect(breakpointIndex).toBeGreaterThan(-1);
        expect(skillsIndex).toBeLessThan(breakpointIndex);
    });

    it('always includes the calendar date, and the time-of-day only when includeTime is true (ADR-62 amendment)', async () => {
        const dateOnly = await buildTestPrompt({ includeTime: false });
        expect(dateOnly).toContain('TODAY IS:');
        expect(dateOnly).not.toContain('Local time:');

        const withTime = await buildTestPrompt({ includeTime: true });
        expect(withTime).toContain('TODAY IS:');
        expect(withTime).toContain('Local time:');
    });

    it('should omit Skills and Memory for subtasks', async () => {
        const prompt = await buildTestPrompt({
            isSubtask: true,
            skillDirectorySection: 'SHOULD_NOT_APPEAR',
            memoryContext: 'MEMORY_SHOULD_NOT_APPEAR',
        });

        expect(prompt).not.toContain('SHOULD_NOT_APPEAR');
        expect(prompt).not.toContain('MEMORY_SHOULD_NOT_APPEAR');
    });

    it('should include Recipes in the dynamic section when provided', async () => {
        const prompt = await buildTestPrompt({
            recipesSection: 'PROCEDURAL RECIPES\nTest Recipe',
        });

        expect(prompt).toContain('PROCEDURAL RECIPES');
        expect(prompt).toContain('Test Recipe');
    });

    // EPIC-26 / FEAT-26-01 / ADR-120: advisor reminder
    it('omits the advisor hint when reminder is inactive', async () => {
        const prompt = await buildTestPrompt({
            consultFlagshipReminderActive: false,
            consultFlagshipAvailable: true,
        });
        expect(prompt).not.toContain('Advisor Hint');
    });

    it('omits the advisor hint when consult_flagship is not available', async () => {
        const prompt = await buildTestPrompt({
            consultFlagshipReminderActive: true,
            consultFlagshipAvailable: false,
        });
        expect(prompt).not.toContain('Advisor Hint');
    });

    it('emits the advisor hint when reminder is active and consult_flagship is available', async () => {
        const prompt = await buildTestPrompt({
            consultFlagshipReminderActive: true,
            consultFlagshipAvailable: true,
        });
        expect(prompt).toContain('Advisor Hint');
        expect(prompt).toContain('consult_flagship');
    });

    it('places the advisor hint AFTER the cache breakpoint', async () => {
        const { CACHE_BREAKPOINT_MARKER } = await import('../systemPrompt');
        const prompt = await buildTestPrompt({
            consultFlagshipReminderActive: true,
            consultFlagshipAvailable: true,
        });
        const hintIndex = prompt.indexOf('Advisor Hint');
        const breakpointIndex = prompt.indexOf(CACHE_BREAKPOINT_MARKER);
        expect(hintIndex).toBeGreaterThan(breakpointIndex);
    });

    it('omits the advisor hint for subtasks even when conditions are met', async () => {
        const prompt = await buildTestPrompt({
            isSubtask: true,
            consultFlagshipReminderActive: true,
            consultFlagshipAvailable: true,
        });
        expect(prompt).not.toContain('Advisor Hint');
    });

    // EPIC-26 / FEAT-26-06: prompt-slim cost-heuristics lean variant
    it('renders the full cost-heuristics section by default', async () => {
        const prompt = await buildTestPrompt({});
        expect(prompt).toContain('COST-AWARE EXECUTION (read this BEFORE choosing tools)');
        expect(prompt).not.toContain('COST-AWARE EXECUTION (lean mode)');
    });

    it('renders the lean cost-heuristics section when costHeuristicsLean is true', async () => {
        const prompt = await buildTestPrompt({ costHeuristicsLean: true });
        expect(prompt).toContain('COST-AWARE EXECUTION (lean mode)');
        expect(prompt).not.toContain('COST-AWARE EXECUTION (read this BEFORE choosing tools)');
    });

    it('lean cost-heuristics is materially shorter than the full variant', async () => {
        const full = await buildTestPrompt({});
        const lean = await buildTestPrompt({ costHeuristicsLean: true });
        // The lean variant should remove ~1000+ characters.
        expect(lean.length).toBeLessThan(full.length - 500);
    });

    // EPIC-26 / FEAT-26-06: prompt-slim plugin-skills lean variant
    it('renders the full plugin-skills section when pluginSkillsLean is false', async () => {
        const prompt = await buildTestPrompt({
            pluginSkillsSection: 'FULL_PLUGIN_SKILLS_MARKER',
            pluginSkillsLean: false,
        });
        expect(prompt).toContain('FULL_PLUGIN_SKILLS_MARKER');
    });

    it('renders the lean plugin-skills hint when pluginSkillsLean is true', async () => {
        const prompt = await buildTestPrompt({
            pluginSkillsSection: 'FULL_PLUGIN_SKILLS_MARKER',
            pluginSkillsLean: true,
        });
        expect(prompt).not.toContain('FULL_PLUGIN_SKILLS_MARKER');
        expect(prompt).toContain('PLUGIN SKILLS:');
        expect(prompt).toContain('find_tool');
    });

    it('lean plugin-skills lives below the cache breakpoint', async () => {
        const { CACHE_BREAKPOINT_MARKER } = await import('../systemPrompt');
        const prompt = await buildTestPrompt({ pluginSkillsLean: true });
        const breakIdx = prompt.indexOf(CACHE_BREAKPOINT_MARKER);
        const skillsIdx = prompt.indexOf('PLUGIN SKILLS:');
        expect(breakIdx).toBeGreaterThan(-1);
        expect(skillsIdx).toBeGreaterThan(breakIdx);
    });
});

// ──────────────────────────────────────────────────────────────────────────────
// FEATURE-0315 / PLAN-004 task 6 -- KV-Cache-Layout invariants.
//
// The cache-stability invariant: anything before the dynamic Memory / Skills
// / Recipes / Vault-Context / DateTime block must be byte-identical across
// builds that share the same mode + tools + capabilities. If a future
// refactor leaks a per-message token (e.g. a session id or timestamp) into
// the stable prefix, every Anthropic cache_control hit collapses.
// ──────────────────────────────────────────────────────────────────────────────

describe('systemPrompt KV-cache stability (FEATURE-0315 / ADR-062)', () => {
    it('Memory section sits between the stable prefix and DateTime', async () => {
        const prompt = await buildTestPrompt({ memoryContext: 'USER MEMORY: testdata' });

        const memoryIndex = prompt.indexOf('USER MEMORY: testdata');
        const dateTimeIndex = prompt.lastIndexOf('TODAY IS:');
        // Stable prefix anchor: the security boundary section is the last
        // stable section before the cache breakpoint per systemPrompt.ts.
        const securityIndex = prompt.indexOf('SECURITY');

        expect(memoryIndex).toBeGreaterThan(0);
        expect(dateTimeIndex).toBeGreaterThan(0);
        expect(securityIndex).toBeGreaterThan(0);

        // securityBoundary < memory < dateTime
        expect(securityIndex).toBeLessThan(memoryIndex);
        expect(memoryIndex).toBeLessThan(dateTimeIndex);
    });

    it('changing memoryContext does not change the stable prefix', async () => {
        const a = await buildTestPrompt({
            memoryContext: 'USER MEMORY: alice version',
            includeTime: false, // strip time to make the comparison deterministic
        });
        const b = await buildTestPrompt({
            memoryContext: 'USER MEMORY: bob version with longer text and more detail',
            includeTime: false,
        });

        const securityMarker = 'SECURITY';
        const aPrefix = a.slice(0, a.indexOf(securityMarker) + securityMarker.length);
        const bPrefix = b.slice(0, b.indexOf(securityMarker) + securityMarker.length);

        // The whole stable prefix (up to and including the security marker)
        // must be byte-identical -- otherwise the Anthropic prompt cache
        // breakpoint cannot land cleanly between stable and dynamic.
        expect(aPrefix).toBe(bPrefix);
    });

    it('changing memoryContext changes only the dynamic suffix', async () => {
        const a = await buildTestPrompt({
            memoryContext: 'USER MEMORY: alice',
            includeTime: false,
        });
        const b = await buildTestPrompt({
            memoryContext: 'USER MEMORY: bob',
            includeTime: false,
        });

        expect(a).not.toBe(b);
        // The differing slice must be in the dynamic region (after the
        // security boundary)
        const securityIdx = Math.min(a.indexOf('SECURITY'), b.indexOf('SECURITY'));
        const firstDiff = firstDifferingIndex(a, b);
        expect(firstDiff).toBeGreaterThan(securityIdx);
    });

    it('DateTime never lands in the stable prefix', async () => {
        const prompt = await buildTestPrompt({ includeTime: true });
        const securityIdx = prompt.indexOf('SECURITY');
        const dateTimeIdx = prompt.lastIndexOf('TODAY IS:');
        // Stable prefix ends before SECURITY's full block; any TODAY IS:
        // before that would mean the timestamp invalidates every cached
        // turn -- the scenario ADR-062 was created to prevent.
        expect(dateTimeIdx).toBeGreaterThan(securityIdx);
    });

    it('emits a real cache breakpoint marker between the stable prefix and the volatile tail (ADR-62 amendment)', async () => {
        const { CACHE_BREAKPOINT_MARKER, splitSystemPromptAtCacheBreakpoint } = await import('../systemPrompt');
        const prompt = await buildTestPrompt({ memoryContext: 'USER MEMORY: x', includeTime: true });
        expect(prompt).toContain(CACHE_BREAKPOINT_MARKER);

        const { stable, volatile } = splitSystemPromptAtCacheBreakpoint(prompt);
        // Stable side has the security boundary, not the date/memory.
        expect(stable).toContain('SECURITY');
        expect(stable).not.toContain('TODAY IS:');
        expect(stable).not.toContain('USER MEMORY: x');
        // Volatile side has the date and memory, not the marker.
        expect(volatile).toContain('TODAY IS:');
        expect(volatile).toContain('USER MEMORY: x');
        expect(volatile).not.toContain(CACHE_BREAKPOINT_MARKER);
        expect(stable).not.toContain(CACHE_BREAKPOINT_MARKER);
    });

    it('splitSystemPromptAtCacheBreakpoint falls back to the whole prompt when no marker is present', async () => {
        const { splitSystemPromptAtCacheBreakpoint } = await import('../systemPrompt');
        const { stable, volatile } = splitSystemPromptAtCacheBreakpoint('no marker here');
        expect(stable).toBe('no marker here');
        expect(volatile).toBe('');
    });
});

function firstDifferingIndex(a: string, b: string): number {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) return i;
    }
    return len;
}
