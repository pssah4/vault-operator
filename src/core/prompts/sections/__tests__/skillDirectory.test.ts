import { describe, it, expect } from 'vitest';
import { getSkillDirectorySection } from '../skillDirectory';

/**
 * Tests for the SKILLS directory section (ADR-116, FEAT-24-09).
 *
 * The directory is rendered into the stable system-prompt prefix and tells
 * the model how to load a skill body on demand via the read_skill tool.
 */

describe('getSkillDirectorySection', () => {
    it('returns empty string when no directory is provided', () => {
        expect(getSkillDirectorySection()).toBe('');
        expect(getSkillDirectorySection('')).toBe('');
        expect(getSkillDirectorySection('   ')).toBe('');
    });

    it('renders the directory verbatim inside an <available_skills> block', () => {
        const directory = '- office-workflow: Build presentations from a template';
        const out = getSkillDirectorySection(directory);
        expect(out).toContain('SKILLS');
        expect(out).toContain('<available_skills>');
        expect(out).toContain(directory);
        expect(out).toContain('</available_skills>');
    });

    it('instructs the model to use the read_skill tool', () => {
        const out = getSkillDirectorySection('- foo: bar');
        expect(out).toContain('read_skill');
    });

    it('keeps the directory inline so it stays in the cached prefix', () => {
        // The whole purpose of ADR-116 is that the directory does not
        // bring per-message LLM classifier output into the prompt. The
        // section text itself must therefore not contain any per-message
        // markers (timestamps, message ids, etc.).
        const out = getSkillDirectorySection('- foo: bar');
        expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // no ISO timestamps
        expect(out).not.toContain('User message');
    });
});
