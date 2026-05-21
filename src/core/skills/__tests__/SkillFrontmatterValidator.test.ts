/**
 * FEAT-29-05 Step 2: tests for SkillFrontmatterValidator.
 *
 * The validator runs in the SelfAuthoredSkillLoader discovery layer.
 * Skills whose SKILL.md fails the hard rules are rejected outright with
 * a clear error message; skills that trigger soft warnings still load
 * but surface the warnings so the user can clean them up via the
 * skill-creator-Skill.
 *
 * Hard rules mirror Anthropic's canonical skill-creator validation:
 *   - frontmatter must parse as YAML-ish key/value
 *   - `name` required, kebab-case `[a-z0-9][a-z0-9-]*[a-z0-9]`, max 64
 *   - `name` cannot contain "anthropic" or "claude"
 *   - `description` required, max 1024 chars, no angle brackets
 *
 * Soft warnings (skill still loads):
 *   - unexpected frontmatter keys (logged, ignored at discovery)
 *   - description still contains "[TODO" placeholder
 */

import { describe, it, expect } from 'vitest';
import {
    validateSkillFrontmatter,
    type SkillValidationResult,
} from '../SkillFrontmatterValidator';

describe('validateSkillFrontmatter', () => {
    describe('happy path', () => {
        it('accepts a minimal valid skill', () => {
            const fm = { name: 'my-skill', description: 'Does something useful.' };
            const result: SkillValidationResult = validateSkillFrontmatter(fm);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.warnings).toEqual([]);
        });

        it('accepts known-tolerated extra fields (source, trigger, license) without errors', () => {
            const fm = {
                name: 'humanizer',
                description: 'Cleanup AI patterns.',
                source: 'builtin',
                trigger: 'humanize|slop',
                license: 'MIT',
            };
            const result = validateSkillFrontmatter(fm);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('accepts common community-skill metadata silently (version, author, keywords, ...)', () => {
            const fm = {
                name: 'enbw-slides',
                description: 'Workflow guide for EnBW slide deck generation.',
                version: '2.1.0',
                author: 'Sebastian Hanke',
                keywords: 'slides, presentation, enbw',
                aliases: 'enbw, slides',
                priority: 'high',
                'when-to-use': 'When the user asks for an EnBW presentation.',
                'argument-hint': '{topic} {audience}',
                context: 'consulting',
                tags: 'work, slides',
            };
            const result = validateSkillFrontmatter(fm);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.warnings).toEqual([]);
        });
    });

    describe('name rules', () => {
        it('rejects missing name', () => {
            const fm = { description: 'x' };
            const result = validateSkillFrontmatter(fm);
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('name'))).toBe(true);
        });

        it('rejects non-kebab-case names', () => {
            const cases = ['MySkill', 'my_skill', 'my skill', 'MY-SKILL', 'my.skill'];
            for (const name of cases) {
                const result = validateSkillFrontmatter({ name, description: 'x' });
                expect(result.valid, `name=${name}`).toBe(false);
            }
        });

        it('rejects leading/trailing hyphens and double hyphens', () => {
            for (const name of ['-bad', 'bad-', 'a--b']) {
                const result = validateSkillFrontmatter({ name, description: 'x' });
                expect(result.valid, `name=${name}`).toBe(false);
            }
        });

        it('rejects names containing the reserved words anthropic or claude', () => {
            for (const name of ['anthropic-helper', 'helper-claude', 'claude', 'my-anthropic-skill']) {
                const result = validateSkillFrontmatter({ name, description: 'x' });
                expect(result.valid, `name=${name}`).toBe(false);
                expect(result.errors.join(' ')).toMatch(/reserved/);
            }
        });

        it('rejects names longer than 64 characters', () => {
            const name = 'a' + '-b'.repeat(40);
            const result = validateSkillFrontmatter({ name, description: 'x' });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => /max|long/i.test(e))).toBe(true);
        });

        it('accepts single-character names', () => {
            const result = validateSkillFrontmatter({ name: 'a', description: 'x' });
            expect(result.valid).toBe(true);
        });
    });

    describe('description rules', () => {
        it('rejects missing description', () => {
            const result = validateSkillFrontmatter({ name: 'my-skill' });
            expect(result.valid).toBe(false);
            expect(result.errors.some((e) => e.includes('description'))).toBe(true);
        });

        it('rejects descriptions containing angle brackets', () => {
            for (const desc of ['Use <html> tags', 'Note > 100 lines']) {
                const result = validateSkillFrontmatter({ name: 'my-skill', description: desc });
                expect(result.valid, `desc=${desc}`).toBe(false);
            }
        });

        it('rejects descriptions longer than 1024 characters', () => {
            const desc = 'a'.repeat(1025);
            const result = validateSkillFrontmatter({ name: 'my-skill', description: desc });
            expect(result.valid).toBe(false);
        });

        it('warns but does not reject when description starts with [TODO placeholder', () => {
            const desc = '[TODO: explain what this skill does]';
            const result = validateSkillFrontmatter({ name: 'my-skill', description: desc });
            expect(result.valid).toBe(true);
            expect(result.warnings.some((w) => w.includes('TODO'))).toBe(true);
        });
    });

    describe('unexpected keys', () => {
        it('warns (does not error) on unknown frontmatter keys', () => {
            const fm = {
                name: 'my-skill',
                description: 'x',
                bogusKey: 'whatever',
                anotherBogus: 42,
            };
            const result = validateSkillFrontmatter(fm);
            expect(result.valid).toBe(true);
            expect(result.warnings.some((w) => w.includes('bogusKey'))).toBe(true);
            expect(result.warnings.some((w) => w.includes('anotherBogus'))).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('rejects when frontmatter is not an object', () => {
            const result = validateSkillFrontmatter(null as unknown as Record<string, unknown>);
            expect(result.valid).toBe(false);
        });

        it('rejects when name is not a string', () => {
            const result = validateSkillFrontmatter({ name: 42 as unknown as string, description: 'x' });
            expect(result.valid).toBe(false);
        });
    });
});
