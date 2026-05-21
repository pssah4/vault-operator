/**
 * AUDIT-013 C-1 regression tests (proper fix).
 *
 * The handler now routes through ToolExecutionPipeline. We test the
 * MCP-boundary contract:
 *   - AGENT_INTERNAL_TOOLS denied at handler before pipeline runs
 *   - Unknown operation denied with helpful list
 *   - Real registered read tool reaches the pipeline (tested via the
 *     plugin-internal pipeline behaviour: the tool's pushToolResult must
 *     be observed)
 *   - Real write tool reaches the pipeline and fails-closed because no
 *     approval callback is wired
 */

import { describe, it, expect, vi } from 'vitest';
import { handleExecuteVaultOp } from '../executeVaultOp';
import type { ToolDefinition, ToolExecutionContext } from '../../../core/tools/types';

interface FakeTool {
    name: string;
    isWriteOperation: boolean;
    getDefinition(): ToolDefinition;
    execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void>;
}

function makeReadTool(name: string, response = 'OK'): FakeTool {
    return {
        name,
        isWriteOperation: false,
        getDefinition: () => ({
            // ToolDefinition.name is the strict ToolName union; cast is fine in tests.
            name: name as ToolDefinition['name'],
            description: 'fake read',
            input_schema: { type: 'object', properties: {}, required: [] },
        }),
        execute: vi.fn(async (_input, ctx) => {
            ctx.callbacks.pushToolResult(response);
        }),
    };
}

function makeWriteTool(name: string): FakeTool {
    return {
        name,
        isWriteOperation: true,
        getDefinition: () => ({
            name: name as ToolDefinition['name'],
            description: 'fake write',
            input_schema: { type: 'object', properties: {}, required: [] },
        }),
        execute: vi.fn(async (_input, ctx) => {
            ctx.callbacks.pushToolResult('should not run');
        }),
    };
}

interface PluginStub {
    toolRegistry: {
        getTool: (name: string) => FakeTool | undefined;
        getAllTools: () => FakeTool[];
    };
    settings: Record<string, unknown>;
    app: { vault: { adapter: Record<string, unknown> } };
    operationLogger?: undefined;
    ignoreService?: undefined;
}

function makePlugin(tools: FakeTool[]): PluginStub {
    const map = new Map(tools.map((t) => [t.name, t]));
    return {
        toolRegistry: {
            getTool: (n: string) => map.get(n),
            getAllTools: () => [...map.values()],
        },
        settings: {
            // Pipeline reads settings.autoApproval and settings.enableCheckpoints.
            autoApproval: { enabled: true, read: true, noteEdits: false, vaultChanges: false, mcp: false, sandbox: false, web: false, subtasks: false, skills: false, recipes: false, pluginApiRead: false, pluginApiWrite: false },
            enableCheckpoints: false,
        },
        app: { vault: { adapter: {} } },
    };
}

describe('handleExecuteVaultOp -- pipeline-routed (AUDIT-013 C-1 proper)', () => {
    it.each([
        'switch_mode',
        'new_task',
        'update_todo_list',
        'update_settings',
        // manage_skill removed in FEAT-29-05 (skill-creator builtin took
        // over). The tool no longer exists, so it falls through the
        // "agent-internal" filter into "Unknown operation".
        'enable_plugin',
        'call_plugin_api',
    ])('rejects agent-internal tool %s before pipeline', async (op) => {
        const plugin = makePlugin([]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await handleExecuteVaultOp(plugin as any, { operation: op });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('agent-internal');
    });

    it('returns error when operation is missing', async () => {
        const plugin = makePlugin([]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await handleExecuteVaultOp(plugin as any, {});
        expect(result.isError).toBe(true);
    });

    it('returns "Unknown operation" with list of available tools (excluding internal)', async () => {
        const plugin = makePlugin([makeReadTool('list_files')]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await handleExecuteVaultOp(plugin as any, { operation: 'totally_unknown' });
        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('Unknown operation');
        expect(text).toContain('list_files');
        expect(text).not.toContain('switch_mode');
    });

    it('routes a registered read tool through the pipeline and returns its output', async () => {
        const tool = makeReadTool('list_files', 'three files found');
        const plugin = makePlugin([tool]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await handleExecuteVaultOp(plugin as any, { operation: 'list_files' });
        expect(result.isError).toBe(false);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('three files found');
        expect(tool.execute).toHaveBeenCalled();
    });

    it('blocks a write tool via pipeline fail-closed approval', async () => {
        const tool = makeWriteTool('write_file');
        const plugin = makePlugin([tool]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await handleExecuteVaultOp(plugin as any, { operation: 'write_file', params: { path: 'a.md', content: 'x' } });
        expect(result.isError).toBe(true);
        // The execute body must NOT have been called -- approval rejected first.
        expect(tool.execute).not.toHaveBeenCalled();
        const text = (result.content[0] as { text: string }).text;
        // The pipeline returns "Operation denied by user" for fail-closed rejection.
        expect(text).toMatch(/denied/i);
    });
});
