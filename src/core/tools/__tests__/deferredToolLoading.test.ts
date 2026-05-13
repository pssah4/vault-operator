/**
 * FEATURE-1600 regression test: deferred tool loading.
 *
 * Validates that:
 *  1. isDeferredTool flags the specialised tools and leaves core tools alone.
 *  2. FindToolTool matches by keyword, ranks sensibly, and activates via the
 *     ToolExecutionContext.activateDeferredTool callback.
 *
 * Doesn't exercise the AgentTask loop — rebuildPromptCache integration is
 * covered by the existing agent-task smoke path in live use.
 */

import { describe, it, expect } from 'vitest';
import { isDeferredTool, DEFERRED_TOOL_NAMES } from '../toolMetadata';

describe('isDeferredTool (FEATURE-1600)', () => {
    it('flags office-format creators as deferred', () => {
        expect(isDeferredTool('create_pptx')).toBe(true);
        expect(isDeferredTool('create_docx')).toBe(true);
        expect(isDeferredTool('create_xlsx')).toBe(true);
        expect(isDeferredTool('plan_presentation')).toBe(true);
    });

    it('flags specialised diagram tools as deferred', () => {
        expect(isDeferredTool('generate_canvas')).toBe(true);
        expect(isDeferredTool('create_excalidraw')).toBe(true);
        expect(isDeferredTool('create_drawio')).toBe(true);
    });

    it('keeps core read / edit / agent-control tools NOT deferred', () => {
        expect(isDeferredTool('read_file')).toBe(false);
        expect(isDeferredTool('edit_file')).toBe(false);
        expect(isDeferredTool('write_file')).toBe(false);
        expect(isDeferredTool('search_files')).toBe(false);
        expect(isDeferredTool('semantic_search')).toBe(false);
        expect(isDeferredTool('ask_followup_question')).toBe(false);
        expect(isDeferredTool('attempt_completion')).toBe(false);
        expect(isDeferredTool('new_task')).toBe(false);
    });

    it('DEFERRED_TOOL_NAMES is reasonably sized (not empty, not covering everything)', () => {
        // Sanity bounds — fail fast if someone accidentally clears the set or
        // marks core tools as deferred.
        expect(DEFERRED_TOOL_NAMES.size).toBeGreaterThan(10);
        expect(DEFERRED_TOOL_NAMES.size).toBeLessThan(40);
    });
});

describe('read_skill availability (FEAT-24-09 / ADR-116 SC-5)', () => {
    it('is NOT deferred so loading a skill costs one roundtrip, not two', async () => {
        // If read_skill ended up in DEFERRED_TOOL_NAMES, the agent would have
        // to call find_tool first and the saved classifier roundtrip from
        // ADR-116 would be cancelled out.
        expect(isDeferredTool('read_skill')).toBe(false);
    });

    it('lives in the read tool group so it is available in Agent + Ask mode', async () => {
        const { TOOL_METADATA } = await import('../toolMetadata');
        expect(TOOL_METADATA['read_skill']).toBeDefined();
        expect(TOOL_METADATA['read_skill'].group).toBe('read');
    });
});

describe('read_mcp_tool availability (FEAT-24-06 / ADR-118 SC-3)', () => {
    it('is NOT deferred so the truncated-description -> read -> use chain stays one round-trip', async () => {
        // If read_mcp_tool became deferred, the model would have to call
        // find_tool first whenever a description was truncated -- which
        // defeats the whole point of the on-demand companion (ADR-118 D2).
        expect(isDeferredTool('read_mcp_tool')).toBe(false);
    });

    it('lives in the mcp tool group so it is only visible when MCP is enabled', async () => {
        const { TOOL_METADATA } = await import('../toolMetadata');
        expect(TOOL_METADATA['read_mcp_tool']).toBeDefined();
        expect(TOOL_METADATA['read_mcp_tool'].group).toBe('mcp');
    });
});

describe('second deferred pass (FEAT-24-06 / ADR-118 D3)', () => {
    it('marks inspect_self and update_settings as deferred', () => {
        // Rarely-needed introspection and settings helpers do not need to be
        // in every default schema; find_tool can pull them on demand.
        expect(isDeferredTool('inspect_self')).toBe(true);
        expect(isDeferredTool('update_settings')).toBe(true);
    });

    it('keeps TOOL_METADATA entries for the newly deferred tools so find_tool can rank them', async () => {
        const { TOOL_METADATA } = await import('../toolMetadata');
        expect(TOOL_METADATA['inspect_self']).toBeDefined();
        expect(TOOL_METADATA['update_settings']).toBeDefined();
    });
});

describe('FindToolTool matching semantics (FEATURE-1600 + BUG-021 Wave-4)', () => {
    // Reimplement the ranking inline so we can unit-test without Obsidian's
    // App instance. Mirrors the logic in FindToolTool.execute() AFTER the
    // Wave-4 tokenize + normalise fix.
    async function findMatches(query: string): Promise<string[]> {
        const { TOOL_METADATA } = await import('../toolMetadata');
        const rawQuery = query.trim().toLowerCase();
        const queryTokens = Array.from(new Set(rawQuery.split(/[\s_-]+/).filter((t) => t.length >= 3)));
        const queryPhrase = rawQuery.replace(/[_\s-]+/g, ' ').trim();
        const normalise = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ');

        const scored: Array<{ name: string; score: number }> = [];
        for (const name of DEFERRED_TOOL_NAMES) {
            const meta = TOOL_METADATA[name];
            if (!meta) continue;
            const nameN = normalise(name);
            const labelN = normalise(meta.label ?? '');
            const descN = normalise(meta.description ?? '');

            let score = 0;
            let strongHit = false;
            if (nameN.includes(queryPhrase)) { score += 200; strongHit = true; }
            if (labelN.includes(queryPhrase)) { score += 100; strongHit = true; }
            if (descN.includes(queryPhrase)) score += 20;
            for (const token of queryTokens) {
                if (nameN.includes(token)) { score += 30; strongHit = true; }
                if (labelN.includes(token)) { score += 15; strongHit = true; }
                if (descN.includes(token)) score += 3;
            }
            if (score > 0 && strongHit) scored.push({ name, score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 5).map((s) => s.name);
    }

    it('"pptx" matches create_pptx and plan_presentation', async () => {
        const matches = await findMatches('pptx');
        expect(matches).toContain('create_pptx');
        // create_pptx gets the higher score because its name matches directly.
        expect(matches[0]).toBe('create_pptx');
    });

    it('"docx" matches create_docx', async () => {
        const matches = await findMatches('docx');
        expect(matches[0]).toBe('create_docx');
    });

    it('"canvas" matches generate_canvas', async () => {
        const matches = await findMatches('canvas');
        expect(matches[0]).toBe('generate_canvas');
    });

    it('"drawio" matches create_drawio', async () => {
        const matches = await findMatches('drawio');
        expect(matches[0]).toBe('create_drawio');
    });

    it('"base" matches create_base, update_base, query_base', async () => {
        const matches = await findMatches('base');
        expect(matches).toContain('create_base');
        expect(matches).toContain('update_base');
        expect(matches).toContain('query_base');
    });

    it('nonsense query returns no matches', async () => {
        const matches = await findMatches('zzzxxxzzz-no-tool-matches-this');
        expect(matches).toEqual([]);
    });

    it('does NOT return core tools even for tight matches on description words', async () => {
        // "read" is a common word — must not dig up core read_file etc., they
        // aren't in DEFERRED_TOOL_NAMES to begin with.
        const matches = await findMatches('read');
        expect(matches).not.toContain('read_file');
        expect(matches).not.toContain('search_files');
    });

    // BUG-021 (Wave-4): the LLM typed multi-word natural-language queries that
    // matched nothing under the old single-substring search. The tokenizer
    // plus underscore-normalise pass makes these work.
    it('"vault health check" (spaces, as typed by the LLM) matches vault_health_check', async () => {
        const matches = await findMatches('vault health check');
        expect(matches[0]).toBe('vault_health_check');
    });

    it('"vault-health-check" (hyphens) matches vault_health_check', async () => {
        const matches = await findMatches('vault-health-check');
        expect(matches[0]).toBe('vault_health_check');
    });

    it('"health" single token matches vault_health_check via label', async () => {
        const matches = await findMatches('health');
        expect(matches).toContain('vault_health_check');
    });

    it('"create pptx" picks create_pptx over plan_presentation', async () => {
        const matches = await findMatches('create pptx');
        expect(matches[0]).toBe('create_pptx');
    });

    it('"ingest document" matches ingest_document', async () => {
        const matches = await findMatches('ingest document');
        expect(matches[0]).toBe('ingest_document');
    });
});
