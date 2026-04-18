/**
 * EPIC-022 beta-2 feedback: some real-world Anthropic skills ship SKILL.md
 * with an HTML-comment metadata block instead of YAML frontmatter. The
 * loader must accept both shapes so the zip-imported skill actually lights up.
 */

import { describe, it, expect } from 'vitest';
import { SelfAuthoredSkillLoader } from '../SelfAuthoredSkillLoader';

// `parseSkillMd` is private; we reach for it via the class prototype. This
// is stable because the method's signature is the test's own contract.
type ParsedSkill = {
    name: string;
    description: string;
    body: string;
    filePath: string;
};

function parse(content: string, filePath = 'foo/bar/SKILL.md'): ParsedSkill | null {
    // The constructor reads `plugin.app.vault.configDir` and `plugin.manifest.id`.
    // parseSkillMd itself is content-only, so a minimal stub is enough.
    const stub = {
        app: { vault: { configDir: 'plugin-config-dir-stub' } },
        manifest: { id: 'obsilo-agent' },
        settings: { agentFolderPath: '.obsidian-agent' },
    } as unknown as ConstructorParameters<typeof SelfAuthoredSkillLoader>[0];
    const loader = new SelfAuthoredSkillLoader(stub);
    const fn = (loader as unknown as {
        parseSkillMd: (content: string, filePath: string) => ParsedSkill | null;
    }).parseSkillMd.bind(loader);
    return fn(content, filePath);
}

describe('SelfAuthoredSkillLoader.parseSkillMd', () => {
    it('parses YAML frontmatter (Obsilo + Anthropic spec)', () => {
        const md = '---\nname: my-skill\ndescription: says hi\n---\nHello body';
        const parsed = parse(md);
        expect(parsed?.name).toBe('my-skill');
        expect(parsed?.description).toBe('says hi');
        expect(parsed?.body).toBe('Hello body');
    });

    it('parses HTML-comment metadata (real-world Anthropic skill variant)', () => {
        const md = [
            '# Title',
            '',
            '<!-- Metadata',
            'name: my-skill',
            'description: says hi',
            '-->',
            '',
            'Body paragraph.',
        ].join('\n');
        const parsed = parse(md);
        expect(parsed?.name).toBe('my-skill');
        expect(parsed?.description).toBe('says hi');
        // Body keeps the surrounding markdown, only the metadata block is stripped.
        expect(parsed?.body).toContain('# Title');
        expect(parsed?.body).toContain('Body paragraph.');
        expect(parsed?.body).not.toContain('<!-- Metadata');
    });

    it('returns null when neither shape is present', () => {
        expect(parse('Just a markdown file without metadata.')).toBeNull();
    });

    it('returns null when required fields are missing', () => {
        const md = '<!-- Metadata\nname: foo\n-->\nBody';
        expect(parse(md)).toBeNull(); // no description
    });
});
