import { describe, it, expect, beforeEach } from 'vitest';
import { ReadSkillTool } from '../ReadSkillTool';
import type { SelfAuthoredSkill, SelfAuthoredSkillLoader } from '../../../skills/SelfAuthoredSkillLoader';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';

/**
 * Tests for ReadSkillTool (FEAT-24-09 / ADR-116).
 */

function makeSelfAuthoredSkill(overrides: Partial<SelfAuthoredSkill> = {}): SelfAuthoredSkill {
    return {
        name: 'office-workflow',
        description: 'Build presentations from a template',
        trigger: /office/i,
        triggerSource: 'office',
        source: 'bundled',
        requiredTools: [],
        allowedTools: [],
        codeModules: [],
        codeModuleInfos: [],
        createdAt: new Date('2026-01-01'),
        successCount: 0,
        body: '## Step 1\nLoad the template.\n\n## Step 2\nFill the slides.',
        filePath: 'plugins/vault-operator/skills/office-workflow/SKILL.md',
        inventory: {
            scripts: [{ path: 'scripts/build.ts', language: 'ts', sizeBytes: 0 }],
            references: ['references/style.md'],
            assets: [],
            subRoles: [],
        },
        isCoordinator: false,
        ...overrides,
    };
}

function makeLoader(skills: SelfAuthoredSkill[]): SelfAuthoredSkillLoader {
    const map = new Map(skills.map(s => [s.name, s]));
    return {
        getSkill: (name: string) => map.get(name),
        getAllSkills: () => [...map.values()],
    } as unknown as SelfAuthoredSkillLoader;
}

interface UserSkillStub { path: string; name: string; description: string }

function makePlugin(opts: { userSkills?: UserSkillStub[]; readContents?: Record<string, string> } = {}): ObsidianAgentPlugin {
    const userSkills = opts.userSkills ?? [];
    const reads = opts.readContents ?? {};
    return {
        skillsManager: userSkills.length > 0 ? {
            discoverSkills: () => Promise.resolve(userSkills),
            readFile: (p: string) => Promise.resolve(reads[p] ?? ''),
        } : null,
        app: { vault: { adapter: {} } },
    } as unknown as ObsidianAgentPlugin;
}

interface CapturedResult { content: string }

function makeContext(): { ctx: ToolExecutionContext; results: CapturedResult[] } {
    const results: CapturedResult[] = [];
    const ctx = {
        callbacks: {
            pushToolResult: (content: string) => { results.push({ content }); },
            log: () => undefined,
        },
    } as unknown as ToolExecutionContext;
    return { ctx, results };
}

describe('ReadSkillTool', () => {
    let plugin: ObsidianAgentPlugin;

    beforeEach(() => {
        plugin = makePlugin();
    });

    it('returns an error when name is missing', async () => {
        const tool = new ReadSkillTool(plugin, makeLoader([]));
        const { ctx, results } = makeContext();
        await tool.execute({ name: '' }, ctx);
        expect(results).toHaveLength(1);
        expect(results[0].content).toMatch(/name is required/i);
    });

    it('renders a self-authored skill body with a steering header and inventory', async () => {
        const skill = makeSelfAuthoredSkill();
        const tool = new ReadSkillTool(plugin, makeLoader([skill]));
        const { ctx, results } = makeContext();

        await tool.execute({ name: 'office-workflow' }, ctx);

        expect(results).toHaveLength(1);
        const out = results[0].content;
        expect(out).toContain('SKILL: office-workflow');
        expect(out).toContain('OVERRIDES default tool selection');
        expect(out).toContain('Build presentations from a template');
        expect(out).toContain('scripts/build.ts');
        expect(out).toContain('references/style.md');
        expect(out).toContain('## Step 1');
        expect(out).toContain('## Step 2');
    });

    it('reads a user skill from SkillsManager and strips its frontmatter', async () => {
        const userPlugin = makePlugin({
            userSkills: [{ path: 'skills/my-skill/SKILL.md', name: 'my-skill', description: 'A user skill' }],
            readContents: {
                'skills/my-skill/SKILL.md': '---\nname: my-skill\ndescription: A user skill\n---\nDo the thing.',
            },
        });
        const tool = new ReadSkillTool(userPlugin, makeLoader([]));
        const { ctx, results } = makeContext();

        await tool.execute({ name: 'my-skill' }, ctx);

        expect(results).toHaveLength(1);
        const out = results[0].content;
        expect(out).toContain('SKILL: my-skill');
        expect(out).toContain('Do the thing.');
        expect(out).not.toContain('---\nname: my-skill');
    });

    it('caps an oversized skill body and points to read_file for references', async () => {
        const big = 'X'.repeat(30_000);
        const skill = makeSelfAuthoredSkill({ body: big });
        const tool = new ReadSkillTool(plugin, makeLoader([skill]));
        const { ctx, results } = makeContext();

        await tool.execute({ name: 'office-workflow' }, ctx);

        expect(results).toHaveLength(1);
        const out = results[0].content;
        expect(out).toContain('truncated');
        expect(out).toContain('30000 chars total');
        expect(out).toContain('read_file');
    });

    it('returns an error with the list of available skills when the name is unknown', async () => {
        const skill = makeSelfAuthoredSkill({ name: 'office-workflow' });
        const tool = new ReadSkillTool(plugin, makeLoader([skill]));
        const { ctx, results } = makeContext();

        await tool.execute({ name: 'does-not-exist' }, ctx);

        expect(results).toHaveLength(1);
        const out = results[0].content;
        expect(out).toMatch(/not found/i);
        expect(out).toContain('office-workflow');
        expect(out).toContain('SKILLS directory');
    });

    it('handles a missing skillsManager gracefully (only self-authored available)', async () => {
        const skill = makeSelfAuthoredSkill({ name: 'office-workflow' });
        const tool = new ReadSkillTool(plugin, makeLoader([skill]));
        const { ctx, results } = makeContext();

        // Unknown name with no skillsManager -> still returns the not-found error.
        await tool.execute({ name: 'other' }, ctx);
        expect(results[0].content).toMatch(/not found/i);
        expect(results[0].content).toContain('office-workflow');
    });
});
