/**
 * FEAT-29-04 unit tests for ExecuteCommandTool.
 *
 * Focus: verify the BREAKING-CHANGE in tool_result format (FEAT-29-04
 * Risk-Szenario 6 from /coding-Handoff). The tool used to return a
 * free-text "Executed command: name (id)" string. After Welle 3 it
 * returns a JSON envelope with notices[]. Any downstream consumer
 * parsing the old format would break -- this test pins the new shape so
 * we notice if the contract regresses.
 */

import { describe, it, expect } from 'vitest';
import { ExecuteCommandTool } from '../ExecuteCommandTool';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';

function makePluginStub(opts: {
    commands: Record<string, { id: string; name?: string; callback?: () => void }>;
    notices?: string[];
}) {
    const calls: string[] = [];
    const noticeCalls: string[] = [];

    // Wire a Notice constructor onto globalThis so withNoticeCapture has
    // something to patch. The constructor records each message; the
    // ExecuteCommandTool harness will see these as captured notices.
    const globalRef = globalThis as { Notice?: unknown };
    const OriginalNotice = globalRef.Notice;
    class StubNotice {
        constructor(public msg: string) { noticeCalls.push(msg); }
    }
    globalRef.Notice = StubNotice;

    const app = {
        commands: {
            commands: opts.commands,
            executeCommandById: (id: string) => {
                calls.push(id);
                // Simulate plugin-emitted notices on execute. The stub
                // Notice constructor lives on globalThis right now (patched
                // by withNoticeCapture by the time we get called).
                for (const text of opts.notices ?? []) {
                    new (globalRef.Notice as new (msg: string) => unknown)(text);
                }
                return true;
            },
        },
    };

    const plugin = { app } as unknown as ObsidianAgentPlugin;
    const cleanup = () => {
        globalRef.Notice = OriginalNotice;
    };
    return { plugin, calls, noticeCalls, cleanup };
}

function makeContext(): {
    context: ToolExecutionContext;
    results: string[];
} {
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

function parseToolResult(raw: string): unknown {
    // formatSuccess wraps the string; strip a leading "[OK]" or similar
    // prefix if it exists, otherwise pull the JSON object out of the body.
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) throw new Error(`No JSON found in: ${raw}`);
    return JSON.parse(match[0]);
}

describe('ExecuteCommandTool (FEAT-29-04)', () => {
    it('returns structured JSON tool_result with notices array', async () => {
        const stub = makePluginStub({
            commands: {
                'daily-notes:open': { id: 'daily-notes:open', name: "Open today's daily note" },
            },
            notices: ['Daily note created'],
        });
        try {
            const tool = new ExecuteCommandTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({ command_id: 'daily-notes:open' }, context);

            expect(results).toHaveLength(1);
            const payload = parseToolResult(results[0]) as Record<string, unknown>;
            expect(payload.executed).toBe(true);
            expect(payload.command_id).toBe('daily-notes:open');
            expect(payload.command_name).toBe("Open today's daily note");
            expect(Array.isArray(payload.notices)).toBe(true);
            // Capture window is 250 ms default, the notice fires synchronously,
            // so it lands in notices[].
            const notices = payload.notices as Array<Record<string, unknown>>;
            expect(notices.length).toBeGreaterThanOrEqual(1);
            expect(notices[0].text).toBe('Daily note created');
            expect(notices[0].severity).toBe('success');
        } finally {
            stub.cleanup();
        }
    });

    it('reports executed=true even when the command emits no notice', async () => {
        const stub = makePluginStub({
            commands: { 'app:noop': { id: 'app:noop', name: 'No-op' } },
            notices: [],
        });
        try {
            const tool = new ExecuteCommandTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({ command_id: 'app:noop' }, context);

            const payload = parseToolResult(results[0]) as Record<string, unknown>;
            expect(payload.executed).toBe(true);
            expect(payload.notices).toEqual([]);
        } finally {
            stub.cleanup();
        }
    });

    it('errors cleanly when command_id is missing', async () => {
        const stub = makePluginStub({ commands: {} });
        try {
            const tool = new ExecuteCommandTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({}, context);
            expect(results).toHaveLength(1);
            expect(results[0]).toMatch(/command_id parameter is required/i);
        } finally {
            stub.cleanup();
        }
    });

    it('errors cleanly when command id does not exist, with prefix hint', async () => {
        const stub = makePluginStub({
            commands: {
                'dataview:rebuild': { id: 'dataview:rebuild', name: 'Rebuild' },
                'dataview:run': { id: 'dataview:run', name: 'Run' },
            },
        });
        try {
            const tool = new ExecuteCommandTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({ command_id: 'dataview:no-such' }, context);
            expect(results[0]).toMatch(/Command not found/i);
            expect(results[0]).toMatch(/dataview:rebuild/);
            expect(results[0]).toMatch(/dataview:run/);
        } finally {
            stub.cleanup();
        }
    });

    it('captures multiple notices and tags severity heuristically', async () => {
        const stub = makePluginStub({
            commands: { 'p:cmd': { id: 'p:cmd', name: 'Cmd' } },
            notices: ['Error: file not found', 'Saved successfully', 'Pasta on the stove'],
        });
        try {
            const tool = new ExecuteCommandTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({ command_id: 'p:cmd' }, context);

            const payload = parseToolResult(results[0]) as Record<string, unknown>;
            const notices = payload.notices as Array<Record<string, unknown>>;
            expect(notices).toHaveLength(3);
            expect(notices[0].severity).toBe('error');
            expect(notices[1].severity).toBe('success');
            expect(notices[2].severity).toBe('unknown');
        } finally {
            stub.cleanup();
        }
    });
});
