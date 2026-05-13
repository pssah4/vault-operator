import { describe, it, expect } from 'vitest';
import { validateNewTaskInput } from '../newTaskValidation';

describe('validateNewTaskInput (FEATURE-1804 / ADR-090 Lever 4+7)', () => {
    const validInput = {
        mode: 'agent',
        message: 'Compare the findings of three meeting notes',
        justification_category: 'PARALLEL',
        justification_reason: 'Comparing 3 independent meeting notes for synthesis',
    };

    it('accepts a well-formed PARALLEL spawn', () => {
        const result = validateNewTaskInput(validInput);
        expect(result.ok).toBe(true);
    });

    it('rejects empty mode', () => {
        const result = validateNewTaskInput({ ...validInput, mode: '' });
        expect(result).toEqual({ ok: false, error: 'mode parameter is required' });
    });

    it('rejects empty message', () => {
        const result = validateNewTaskInput({ ...validInput, message: '   ' });
        expect(result).toEqual({ ok: false, error: 'message parameter is required' });
    });

    it('rejects unknown mode', () => {
        const result = validateNewTaskInput({ ...validInput, mode: 'researcher' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('Unknown sub-agent mode');
    });

    it('rejects missing justification_category', () => {
        const result = validateNewTaskInput({ ...validInput, justification_category: '' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('justification_category must be');
    });

    it('rejects unknown justification_category', () => {
        const result = validateNewTaskInput({ ...validInput, justification_category: 'EXPLORATION' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('PARALLEL, SPECIALIST, ESCALATION');
    });

    it('uppercases lowercase category before matching', () => {
        const result = validateNewTaskInput({ ...validInput, justification_category: 'parallel' });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.justificationCategory).toBe('PARALLEL');
    });

    it('rejects justification reason shorter than 20 chars', () => {
        const result = validateNewTaskInput({ ...validInput, justification_reason: 'short reason' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('concrete sentence');
    });

    it.each([
        'I want better context for this task',
        'we need a fresh perspective on the problem',
        'looking for deeper understanding of the system',
        'requires further analysis of all the things',
    ])('rejects generic justification: %s', (reason) => {
        const result = validateNewTaskInput({ ...validInput, justification_reason: reason });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('looks generic');
    });

    it('accepts SPECIALIST with concrete reason', () => {
        const result = validateNewTaskInput({
            ...validInput,
            justification_category: 'SPECIALIST',
            justification_reason: 'sub-task needs the ask-mode toolset for read-only research',
        });
        expect(result.ok).toBe(true);
    });

    it('accepts ESCALATION with concrete reason', () => {
        const result = validateNewTaskInput({
            ...validInput,
            justification_category: 'ESCALATION',
            justification_reason: 'main loop has been retrying edit_file for 4 iterations on the same line',
        });
        expect(result.ok).toBe(true);
    });
});

describe('validateNewTaskInput profile path (FEAT-24-04 / ADR-113)', () => {
    const baseProfileInput = {
        mode: 'agent',
        message: 'Find every meeting note that mentions Q3 and summarise the decisions',
        profile: 'research',
    };

    it('accepts profile="research" without any justification fields', () => {
        const result = validateNewTaskInput(baseProfileInput);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.profile).toBe('research');
            expect(result.value.justificationCategory).toBe('');
            expect(result.value.justificationReason).toBe('');
        }
    });

    it('still requires mode and message even with profile', () => {
        const noMode = validateNewTaskInput({ ...baseProfileInput, mode: '' });
        expect(noMode.ok).toBe(false);
        const noMessage = validateNewTaskInput({ ...baseProfileInput, message: '   ' });
        expect(noMessage.ok).toBe(false);
    });

    it('rejects an unknown profile name with the list of known profiles', () => {
        const result = validateNewTaskInput({ ...baseProfileInput, profile: 'planner' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain('Unknown subagent profile');
            expect(result.error).toContain('research');
        }
    });

    it('treats whitespace-only profile as no profile (falls back to Tier-4 path)', () => {
        const result = validateNewTaskInput({ ...baseProfileInput, profile: '   ', justification_category: '', justification_reason: '' });
        // Without a real profile, the Tier-4 path kicks in and demands a justification.
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('justification_category must be');
    });

    it('mentions profile="research" as an alternative in the Tier-4 missing-category error', () => {
        const result = validateNewTaskInput({ mode: 'agent', message: 'do a thing' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error).toContain('PARALLEL, SPECIALIST, ESCALATION');
            expect(result.error).toContain('profile="research"');
        }
    });
});
