/**
 * FEAT-29-06 back-compat tests for ManageSkillTool.
 *
 * After the FEAT-29-06 refactor the `code_modules` input parameter is
 * gone -- helper scripts move to `scripts/`-folders and are called via
 * run_skill_script. These tests pin three behaviours:
 *
 * 1. Create + Update succeed without any code_modules input
 *    (positive path, the common case after Welle 4).
 * 2. A skill that ALREADY has codeModules in its frontmatter (Bestand
 *    from before FEAT-29-06) is preserved on update -- we do not
 *    silently strip them, so the still-loaded custom_*-tools keep
 *    working.
 * 3. The tool definition no longer advertises code_modules in its
 *    input_schema (clean drop from the agent's surface).
 */

import { describe, it, expect } from 'vitest';
import { ManageSkillTool } from '../ManageSkillTool';
import type ObsidianAgentPlugin from '../../../../main';
import type { SelfAuthoredSkillLoader } from '../../../skills/SelfAuthoredSkillLoader';
import type { ToolExecutionContext } from '../../types';

interface AdapterCall {
    op: 'mkdir' | 'write';
    path: string;
    content?: string;
}

function makeStubPlugin(opts: {
    existingSkills?: Map<string, { name: string; description: string; triggerSource: string; requiredTools: string[]; body: string; source: string; codeModules: string[]; filePath: string }>;
    existingFiles?: Set<string>;
} = {}) {
    const files = new Set<string>(opts.existingFiles ?? []);
    const calls: AdapterCall[] = [];
    const skills = opts.existingSkills ?? new Map();

    const adapter = {
        async exists(p: string): Promise<boolean> { return files.has(p); },
        async mkdir(p: string): Promise<void> { calls.push({ op: 'mkdir', path: p }); files.add(p); },
        async write(p: string, content: string): Promise<void> {
            calls.push({ op: 'write', path: p, content });
            files.add(p);
        },
        async read(p: string): Promise<string> {
            const sk = [...skills.values()].find((s) => s.filePath === p);
            if (sk) return sk.body;
            throw new Error(`ENOENT: ${p}`);
        },
    };

    const plugin = {
        app: { vault: { adapter } },
        skillsManager: null,
    } as unknown as ObsidianAgentPlugin;

    const skillLoader = {
        getSkillsDir: () => '.vault-operator/data/skills',
        getSkill: (name: string) => skills.get(name) ?? undefined,
        loadAll: async () => undefined,
        removeSkill: (_name: string) => undefined,
    } as unknown as SelfAuthoredSkillLoader;

    return { plugin, skillLoader, calls, files, skills };
}

function makeContext(): { context: ToolExecutionContext; results: string[] } {
    const results: string[] = [];
    const context = {
        callbacks: {
            pushToolResult: (content: string | unknown[]) => {
                results.push(typeof content === 'string' ? content : JSON.stringify(content));
            },
            handleError: () => undefined,
            log: () => undefined,
        },
    } as unknown as ToolExecutionContext;
    return { context, results };
}

describe('ManageSkillTool back-compat after FEAT-29-06 code_modules-removal', () => {
    it('creates a skill without any code_modules input', async () => {
        const stub = makeStubPlugin();
        const tool = new ManageSkillTool(stub.plugin, stub.skillLoader);
        const { context, results } = makeContext();
        await tool.execute({
            action: 'create',
            name: 'my-workflow',
            description: 'A reusable workflow',
            trigger: 'workflow',
            body: '1. Read file\n2. Transform\n3. Write back',
        }, context);

        // Skill was written
        const writeCall = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'));
        expect(writeCall).toBeDefined();
        // Success message references the new run_skill_script path
        expect(results[0]).toMatch(/run_skill_script/);
    });

    it('preserves existing codeModules in frontmatter on update (back-compat for Bestand)', async () => {
        const skills = new Map();
        skills.set('legacy-skill', {
            name: 'legacy-skill',
            description: 'A pre-FEAT-29-06 skill with custom_* modules',
            triggerSource: 'legacy',
            requiredTools: [],
            body: 'old body',
            source: 'user',
            codeModules: ['custom_xlsx.ts', 'custom_pdf.ts'],
            filePath: '.vault-operator/data/skills/legacy-skill/SKILL.md',
        });
        const stub = makeStubPlugin({
            existingSkills: skills,
            existingFiles: new Set(['.vault-operator/data/skills/legacy-skill/SKILL.md']),
        });
        const tool = new ManageSkillTool(stub.plugin, stub.skillLoader);
        const { context, results } = makeContext();
        await tool.execute({
            action: 'update',
            name: 'legacy-skill',
            body: 'new body',
        }, context);

        // The written SKILL.md keeps the codeModules frontmatter line so the
        // already-deployed custom_*-tools keep loading.
        const writeCall = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'));
        expect(writeCall).toBeDefined();
        expect(writeCall!.content).toContain('codeModules: [custom_xlsx.ts, custom_pdf.ts]');
        // And the body is updated
        expect(writeCall!.content).toContain('new body');
    });

    it('does not advertise code_modules in the input schema', () => {
        const stub = makeStubPlugin();
        const tool = new ManageSkillTool(stub.plugin, stub.skillLoader);
        const def = tool.getDefinition();
        const schema = def.input_schema as { properties?: Record<string, unknown> };
        expect(schema.properties).toBeDefined();
        expect(schema.properties).not.toHaveProperty('code_modules');
    });

    it('silently ignores a stray code_modules input from a legacy caller', async () => {
        const stub = makeStubPlugin();
        const tool = new ManageSkillTool(stub.plugin, stub.skillLoader);
        const { context, results } = makeContext();
        // A pre-FEAT-29-06 caller might still pass code_modules; the tool
        // should treat it as ignored extra input rather than error.
        await tool.execute({
            action: 'create',
            name: 'stray-call',
            description: 'caller still passes code_modules',
            body: 'body',
            // unknown extra prop -- must not break create
            code_modules: [{ name: 'custom_xyz', source_code: '', description: '', input_schema: {} }],
        } as Record<string, unknown>, context);

        const writeCall = stub.calls.find((c) => c.op === 'write' && c.path.endsWith('SKILL.md'));
        expect(writeCall).toBeDefined();
        expect(results[0]).toMatch(/created/i);
    });
});
