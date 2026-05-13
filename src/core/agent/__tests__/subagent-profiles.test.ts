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
});
