import { describe, it, expect } from 'vitest';
import { ConsultFlagshipTool } from '../ConsultFlagshipTool';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';
import type { CustomModel } from '../../../../types/settings';

interface CapturedResult { content: string }

function makePlugin(opts: { advisor?: CustomModel | null } = {}): ObsidianAgentPlugin {
    const advisor = opts.advisor === undefined
        ? ({
            name: 'claude-opus-4-6',
            provider: 'anthropic',
            enabled: true,
            apiKey: 'sk-test',
        } as CustomModel)
        : opts.advisor;
    return {
        getAdvisorModel: () => advisor,
    } as unknown as ObsidianAgentPlugin;
}

function makeContext(opts: {
    spawnResult?: string;
    spawnSpy?: (mode: string, msg: string, profile?: string) => void;
    slot?: { ok: boolean; used: number; limit: number };
    noSpawn?: boolean;
} = {}): { ctx: ToolExecutionContext; results: CapturedResult[]; logs: string[] } {
    const results: CapturedResult[] = [];
    const logs: string[] = [];
    const ctx = {
        mode: 'agent',
        callbacks: {
            pushToolResult: (content: string) => { results.push({ content }); },
            log: (msg: string) => { logs.push(msg); },
            handleError: async () => { /* noop */ },
        },
        spawnSubtask: opts.noSpawn ? undefined : async (mode: string, message: string, profileName?: string) => {
            opts.spawnSpy?.(mode, message, profileName);
            return opts.spawnResult ?? '(advisor synthesis)';
        },
        consumeAdvisorSlot: () => opts.slot ?? { ok: true, used: 1, limit: 3 },
    } as unknown as ToolExecutionContext;
    return { ctx, results, logs };
}

const VALID_INPUT = {
    problem: 'How should I structure the cache invalidation?',
    relevant_context: 'The cache lives on the plugin instance and is read at the start of every turn.',
    failed_attempts: 'Tried per-call invalidation; produced thrashing under burst load.',
    constraints: 'No new dependencies, must work in browser.',
};

describe('ConsultFlagshipTool - validation', () => {
    const plugin = makePlugin();

    it('rejects missing problem', async () => {
        const tool = new ConsultFlagshipTool(plugin);
        const { ctx, results } = makeContext();
        await tool.execute({ ...VALID_INPUT, problem: '' }, ctx);
        expect(results[0].content).toMatch(/required field "problem"/);
    });

    it('rejects oversized relevant_context', async () => {
        const tool = new ConsultFlagshipTool(plugin);
        const { ctx, results } = makeContext();
        await tool.execute({ ...VALID_INPUT, relevant_context: 'X'.repeat(3001) }, ctx);
        expect(results[0].content).toMatch(/relevant_context.*3000-char limit/);
    });

    it('rejects oversized problem', async () => {
        const tool = new ConsultFlagshipTool(plugin);
        const { ctx, results } = makeContext();
        await tool.execute({ ...VALID_INPUT, problem: 'X'.repeat(1501) }, ctx);
        expect(results[0].content).toMatch(/problem.*1500-char limit/);
    });

    it('accepts a valid call', async () => {
        const tool = new ConsultFlagshipTool(plugin);
        let captured: { mode?: string; profile?: string } = {};
        const { ctx, results } = makeContext({
            spawnSpy: (mode, _msg, profile) => { captured = { mode, profile }; },
            spawnResult: 'advisor says: cache by turn id',
        });
        await tool.execute(VALID_INPUT, ctx);
        expect(captured.profile).toBe('advisor');
        expect(captured.mode).toBe('agent');
        expect(results[0].content).toMatch(/Flagship advisor responded/);
        expect(results[0].content).toContain('advisor says: cache by turn id');
    });
});

describe('ConsultFlagshipTool - precondition checks', () => {
    it('returns tool_error when no flagship model is configured', async () => {
        const plugin = makePlugin({ advisor: null });
        const tool = new ConsultFlagshipTool(plugin);
        const { ctx, results } = makeContext();
        await tool.execute(VALID_INPUT, ctx);
        expect(results[0].content).toMatch(/no flagship-tier model configured/);
    });

    it('returns tool_error when advisor budget is exhausted', async () => {
        const tool = new ConsultFlagshipTool(makePlugin());
        const { ctx, results } = makeContext({
            slot: { ok: false, used: 3, limit: 3 },
        });
        await tool.execute(VALID_INPUT, ctx);
        expect(results[0].content).toMatch(/advisor budget exhausted/);
        expect(results[0].content).toContain('3/3');
    });

    it('returns tool_error when spawnSubtask is unavailable (max depth)', async () => {
        const tool = new ConsultFlagshipTool(makePlugin());
        const { ctx, results } = makeContext({ noSpawn: true });
        await tool.execute(VALID_INPUT, ctx);
        expect(results[0].content).toMatch(/subagent spawning is disabled/);
    });
});

describe('ConsultFlagshipTool - definition', () => {
    it('has the expected schema', () => {
        const tool = new ConsultFlagshipTool(makePlugin());
        const def = tool.getDefinition();
        expect(def.name).toBe('consult_flagship');
        const req = (def.input_schema as { required: string[] }).required;
        expect(req).toEqual(['problem', 'relevant_context', 'failed_attempts', 'constraints']);
    });
});
