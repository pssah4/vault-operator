import { describe, it, expect } from 'vitest';
import { getSubagentProfile, listSubagentProfileNames } from '../subagent-profiles';

/**
 * Tests for the subagent profile registry (FEAT-24-04 / ADR-113).
 */

describe('subagent profiles', () => {
    it('lists the research profile', () => {
        const names = listSubagentProfileNames();
        expect(names).toContain('research');
    });

    it('returns the research profile by name', () => {
        const profile = getSubagentProfile('research');
        expect(profile).toBeDefined();
        expect(profile?.name).toBe('research');
    });

    it('research profile is read-only and bounded', () => {
        const profile = getSubagentProfile('research');
        expect(profile).toBeDefined();
        const allowed = profile?.allowedTools ?? [];
        // Read + search + ask + attempt -- the lean read-only set.
        expect(allowed).toContain('read_file');
        expect(allowed).toContain('search_files');
        expect(allowed).toContain('semantic_search');
        expect(allowed).toContain('attempt_completion');
        // No write/edit/delete tools in the research allowlist.
        for (const writeName of ['edit_file', 'write_file', 'append_to_file', 'create_pptx', 'create_docx', 'use_mcp_tool', 'new_task']) {
            expect(allowed).not.toContain(writeName);
        }
    });

    it('research profile roleDefinition forbids writes, mode-switching, and further subagents', () => {
        const profile = getSubagentProfile('research');
        expect(profile).toBeDefined();
        const role = profile?.roleDefinition ?? '';
        expect(role).toMatch(/do not write|read-only|no writes/i);
        expect(role).toMatch(/do not switch modes|switch modes/i);
        expect(role).toMatch(/spawn further subagents|further subagents/i);
        expect(role).toMatch(/attempt_completion/);
    });

    it('returns undefined for unknown profile names + empty/whitespace input', () => {
        expect(getSubagentProfile('planner')).toBeUndefined();
        expect(getSubagentProfile('')).toBeUndefined();
    });

    // IMP-24-04-01: completion-discipline -- subagent MUST return the
    // concrete output the parent asked for, not a meta-acknowledgement.
    it('research profile roleDefinition enforces concrete-output completion (IMP-24-04-01)', () => {
        const profile = getSubagentProfile('research');
        const role = profile?.roleDefinition ?? '';
        // Tells the model that completion must contain the actual answer
        expect(role).toMatch(/actual answer the\s*parent asked for|MUST contain the actual answer/i);
        // Anti-pattern guard
        expect(role).toMatch(/anti-pattern|do NOT write "Found/i);
        // Compactness means concise wording, NOT content abbreviation
        expect(role).toMatch(/concise wording, NOT abbreviated|all N items, with/i);
    });

    // EPIC-26 / FEAT-26-01 / ADR-120: research profile pinned to fast tier.
    it('research profile pins the subagent to the fast tier', () => {
        const profile = getSubagentProfile('research');
        expect(profile?.tierOverride).toBe('fast');
        // No hard output cap on research -- it inherits subtaskTokenBudget.
        expect(profile?.maxOutputTokens).toBeUndefined();
    });
});

// EPIC-26 / FEAT-26-01 / ADR-120: advisor profile registration + caps.
describe('advisor profile (EPIC-26 / FEAT-26-01 / ADR-120)', () => {
    it('is listed in the registry', () => {
        const names = listSubagentProfileNames();
        expect(names).toContain('advisor');
    });

    it('pins to the flagship tier with a hard 3000-token output cap', () => {
        const profile = getSubagentProfile('advisor');
        expect(profile).toBeDefined();
        expect(profile?.tierOverride).toBe('flagship');
        expect(profile?.maxOutputTokens).toBe(3000);
    });

    it('is read-only -- no writes, no spawning, no MCP', () => {
        const profile = getSubagentProfile('advisor');
        const allowed = profile?.allowedTools ?? [];
        // Read + search + web + completion -- the synthesis-pass surface.
        expect(allowed).toContain('read_file');
        expect(allowed).toContain('semantic_search');
        expect(allowed).toContain('attempt_completion');
        for (const writeName of [
            'edit_file', 'write_file', 'append_to_file',
            'create_pptx', 'create_docx', 'create_xlsx',
            'use_mcp_tool', 'new_task', 'consult_flagship',
        ]) {
            expect(allowed).not.toContain(writeName);
        }
    });

    it('roleDefinition is direction-giving (concrete answer, not meta-acknowledgement)', () => {
        const profile = getSubagentProfile('advisor');
        const role = profile?.roleDefinition ?? '';
        // Names the synthesis nature of the call.
        expect(role).toMatch(/synthesis|advisor/i);
        // Tells the agent the completion contains the actual answer.
        expect(role).toMatch(/actual decision|MUST contain the actual|recommended path/i);
        // Spells out the 3000-token output budget so the agent is aware
        // even if the harness fails to enforce the cap.
        expect(role).toMatch(/3000 tokens/);
    });
});
