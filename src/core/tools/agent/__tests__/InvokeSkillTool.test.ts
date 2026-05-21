/**
 * FEAT-29-10 Step B: tests for InvokeSkillTool.
 *
 * The tool reads a sub-skill body via SelfAuthoredSkillLoader,
 * pushes a stack entry, then spawns a subtask with the sub-skill body
 * + args. The subtask runs in its own AgentTask (own message buffer,
 * own attempt_completion). The result string is returned to the caller.
 *
 * Stack-tracking via the shared CompositionStackService on the
 * ToolExecutionContext catches cycles and runaway depth before the
 * spawn happens.
 */

import { describe, it, expect, vi } from 'vitest';
import { InvokeSkillTool } from '../InvokeSkillTool';
import {
    CompositionStackService,
    CompositionCycleError,
    CompositionDepthExceededError,
} from '../../../skills/CompositionStackService';
import type { ToolExecutionContext } from '../../types';

interface FakeSkill {
    name: string;
    description: string;
    body: string;
}

function makePlugin(skills: FakeSkill[]) {
    return {
        selfAuthoredSkillLoader: {
            getSkill(name: string): FakeSkill | undefined {
                return skills.find((s) => s.name === name);
            },
        },
    } as unknown as import('../../../../main').default;
}

function makeContext(opts: {
    stack?: CompositionStackService;
    spawnResult?: string;
    spawnError?: Error;
}) {
    const pushed: string[] = [];
    const spawnCalls: Array<{ mode: string; message: string }> = [];
    const ctx = {
        callbacks: {
            pushToolResult: (s: string) => pushed.push(s),
            log: (_: string) => {},
            handleError: async (_t: string, _e: unknown) => {},
        },
        compositionStack: opts.stack ?? new CompositionStackService(5),
        spawnSubtask: async (mode: string, message: string) => {
            spawnCalls.push({ mode, message });
            if (opts.spawnError) throw opts.spawnError;
            return opts.spawnResult ?? 'sub-skill result text';
        },
    } as unknown as ToolExecutionContext;
    return { ctx, pushed, spawnCalls };
}

describe('InvokeSkillTool', () => {
    describe('happy path', () => {
        it('reads skill, spawns subtask, returns the subtask result', async () => {
            const plugin = makePlugin([
                { name: 'meeting-summary', description: 'Summarises a meeting.', body: '# Workflow\nDo X then Y.' },
            ]);
            const tool = new InvokeSkillTool(plugin);
            const { ctx, pushed, spawnCalls } = makeContext({ spawnResult: 'summary written' });

            await tool.execute({ skill_name: 'meeting-summary', args: { note: 'foo.md' } }, ctx);

            expect(spawnCalls).toHaveLength(1);
            expect(spawnCalls[0].mode).toBe('agent');
            expect(spawnCalls[0].message).toContain('meeting-summary');
            expect(spawnCalls[0].message).toContain('# Workflow');
            expect(spawnCalls[0].message).toContain('foo.md');

            const result = pushed.join('\n');
            expect(result).toMatch(/<success>/);
            expect(result).toContain('summary written');
        });

        it('passes args as JSON in the subtask message', async () => {
            const plugin = makePlugin([{ name: 'foo', description: 'x', body: 'body' }]);
            const tool = new InvokeSkillTool(plugin);
            const { ctx, spawnCalls } = makeContext({});

            await tool.execute({ skill_name: 'foo', args: { keys: 'value', n: 42 } }, ctx);

            expect(spawnCalls[0].message).toContain('"keys": "value"');
            expect(spawnCalls[0].message).toContain('"n": 42');
        });

        it('works without args (empty input map)', async () => {
            const plugin = makePlugin([{ name: 'foo', description: 'x', body: 'body' }]);
            const tool = new InvokeSkillTool(plugin);
            const { ctx, spawnCalls } = makeContext({});

            await tool.execute({ skill_name: 'foo' }, ctx);

            expect(spawnCalls).toHaveLength(1);
        });
    });

    describe('validation', () => {
        it('rejects empty skill_name', async () => {
            const tool = new InvokeSkillTool(makePlugin([]));
            const { ctx, pushed } = makeContext({});
            await tool.execute({ skill_name: '' }, ctx);
            expect(pushed.join('\n')).toMatch(/skill_name/);
        });

        it('rejects skill_name with path traversal segments', async () => {
            const tool = new InvokeSkillTool(makePlugin([]));
            const { ctx, pushed } = makeContext({});
            await tool.execute({ skill_name: '../escape' }, ctx);
            expect(pushed.join('\n')).toMatch(/Unsafe|path-traversal|invalid/i);
        });

        it('reports "skill not found" when skill is missing', async () => {
            const tool = new InvokeSkillTool(makePlugin([]));
            const { ctx, pushed } = makeContext({});
            await tool.execute({ skill_name: 'missing' }, ctx);
            expect(pushed.join('\n')).toMatch(/not found|unknown skill/i);
        });
    });

    describe('cycle detection', () => {
        it('refuses to spawn when the skill is already in the composition stack', async () => {
            const plugin = makePlugin([
                { name: 'a', description: '', body: 'body-a' },
            ]);
            const tool = new InvokeSkillTool(plugin);
            const stack = new CompositionStackService(5);
            stack.push({ type: 'skill', id: 'a' });
            const { ctx, pushed, spawnCalls } = makeContext({ stack });

            await tool.execute({ skill_name: 'a' }, ctx);

            expect(spawnCalls).toHaveLength(0);
            expect(pushed.join('\n')).toMatch(/cycle/i);
        });
    });

    describe('depth limit', () => {
        it('refuses to spawn when the stack is full', async () => {
            const plugin = makePlugin([{ name: 'a', description: '', body: 'b' }]);
            const tool = new InvokeSkillTool(plugin);
            const stack = new CompositionStackService(2);
            stack.push({ type: 'skill', id: 'parent-1' });
            stack.push({ type: 'skill', id: 'parent-2' });
            const { ctx, pushed, spawnCalls } = makeContext({ stack });

            await tool.execute({ skill_name: 'a' }, ctx);

            expect(spawnCalls).toHaveLength(0);
            expect(pushed.join('\n')).toMatch(/depth|limit/i);
        });
    });

    describe('stack hygiene', () => {
        it('pops the entry after a successful spawn', async () => {
            const plugin = makePlugin([{ name: 'a', description: '', body: 'b' }]);
            const tool = new InvokeSkillTool(plugin);
            const stack = new CompositionStackService(5);
            const { ctx } = makeContext({ stack });
            await tool.execute({ skill_name: 'a' }, ctx);
            expect(stack.depth()).toBe(0);
        });

        it('pops the entry even when the spawned task throws', async () => {
            const plugin = makePlugin([{ name: 'a', description: '', body: 'b' }]);
            const tool = new InvokeSkillTool(plugin);
            const stack = new CompositionStackService(5);
            const { ctx } = makeContext({ stack, spawnError: new Error('subtask boom') });
            await tool.execute({ skill_name: 'a' }, ctx);
            expect(stack.depth()).toBe(0);
        });
    });

    it('requires spawnSubtask on the context (rejects when subtasks are disabled)', async () => {
        const plugin = makePlugin([{ name: 'a', description: '', body: 'b' }]);
        const tool = new InvokeSkillTool(plugin);
        const { pushed } = makeContext({});
        const ctx = {
            callbacks: {
                pushToolResult: (s: string) => pushed.push(s),
                log: () => {},
                handleError: async () => {},
            },
            compositionStack: new CompositionStackService(5),
            // No spawnSubtask -- e.g. parent already at max nesting depth
        } as unknown as ToolExecutionContext;

        await tool.execute({ skill_name: 'a' }, ctx);
        expect(pushed.join('\n')).toMatch(/spawnSubtask|subtask|depth/i);
    });
});
