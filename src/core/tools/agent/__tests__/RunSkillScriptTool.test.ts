/**
 * FEAT-29-06 unit tests for RunSkillScriptTool.
 *
 * RED-GREEN-REFACTOR cycle (TDD-strict per feedback_tdd_default.md).
 *
 * The tool exposes a single function: `run_skill_script(skill_name,
 * script_name, args)`. It reads the script from
 * `{getSelfAuthoredSkillsDir(plugin)}/{skill_name}/scripts/{script_name}.js`,
 * compiles it with EsbuildWasmManager, executes it via ISandboxExecutor,
 * and returns the JSON-serialized result.
 *
 * Tests use a stub plugin with an in-memory vault adapter and a stub
 * Sandbox/Bundler so we never touch real disk or fire up the real
 * esbuild-wasm during a unit run.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RunSkillScriptTool } from '../RunSkillScriptTool';
import type ObsidianAgentPlugin from '../../../../main';
import type { ToolExecutionContext } from '../../types';

interface StubPlugin {
    plugin: ObsidianAgentPlugin;
    files: Map<string, string>;
    sandboxCalls: Array<{ code: string; input: unknown }>;
    sandboxResult: unknown;
    sandboxError: Error | null;
    bundlerError: Error | null;
}

function makePluginStub(opts: {
    files?: Record<string, string>;
    sandboxResult?: unknown;
    sandboxError?: Error;
    bundlerError?: Error;
} = {}): StubPlugin {
    const files = new Map<string, string>(Object.entries(opts.files ?? {}));
    const sandboxCalls: Array<{ code: string; input: unknown }> = [];

    const plugin = {
        settings: { agentFolderPath: '.vault-operator', _layoutMigrationStatus: 'complete' as const },
        app: {
            vault: {
                adapter: {
                    async exists(p: string): Promise<boolean> { return files.has(p); },
                    async read(p: string): Promise<string> {
                        const v = files.get(p);
                        if (v === undefined) throw new Error(`ENOENT: ${p}`);
                        return v;
                    },
                },
            },
        },
        sandboxExecutor: {
            async ensureReady(): Promise<void> { /* no-op */ },
            async execute(code: string, input: Record<string, unknown>): Promise<unknown> {
                sandboxCalls.push({ code, input });
                if (opts.sandboxError) throw opts.sandboxError;
                return opts.sandboxResult ?? null;
            },
            destroy(): void { /* no-op */ },
        },
        esbuildWasmManager: {
            async ensureReady(): Promise<void> { /* no-op */ },
            async transform(source: string): Promise<string> {
                if (opts.bundlerError) throw opts.bundlerError;
                return `__compiled__(${source.length} chars)`;
            },
            async build(source: string, _deps: string[]): Promise<string> {
                if (opts.bundlerError) throw opts.bundlerError;
                return `__compiled_with_deps__(${source.length} chars)`;
            },
        },
    } as unknown as ObsidianAgentPlugin;

    return {
        plugin,
        files,
        sandboxCalls,
        sandboxResult: opts.sandboxResult ?? null,
        sandboxError: opts.sandboxError ?? null,
        bundlerError: opts.bundlerError ?? null,
    };
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

describe('RunSkillScriptTool (FEAT-29-06)', () => {
    describe('input validation', () => {
        it('reports an error when skill_name is missing', async () => {
            const stub = makePluginStub();
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({ script_name: 'foo' }, context);
            expect(results[0]).toMatch(/skill_name parameter is required/i);
        });

        it('reports an error when script_name is missing', async () => {
            const stub = makePluginStub();
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({ skill_name: 'my-skill' }, context);
            expect(results[0]).toMatch(/script_name parameter is required/i);
        });

        it('rejects path-traversal in skill_name (defense in depth)', async () => {
            const stub = makePluginStub();
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute(
                { skill_name: '../malicious', script_name: 'foo' },
                context,
            );
            expect(results[0]).toMatch(/invalid skill_name|path-traversal/i);
        });

        it('rejects path-traversal in script_name', async () => {
            const stub = makePluginStub();
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute(
                { skill_name: 'my-skill', script_name: '../leak' },
                context,
            );
            expect(results[0]).toMatch(/invalid script_name|path-traversal/i);
        });
    });

    describe('file loading', () => {
        it('reports an error when the skill folder script does not exist', async () => {
            const stub = makePluginStub();
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({ skill_name: 'my-skill', script_name: 'doesnt-exist' }, context);
            expect(results[0]).toMatch(/script not found|does not exist/i);
        });

        it('loads a script from .vault-operator/data/skills/{skill}/scripts/{name}.js', async () => {
            const stub = makePluginStub({
                files: {
                    '.vault-operator/data/skills/my-skill/scripts/hello.js':
                        'export async function execute(args) { return { ok: true, args }; }',
                },
                sandboxResult: { ok: true, args: { who: 'world' } },
            });
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute(
                { skill_name: 'my-skill', script_name: 'hello', args: { who: 'world' } },
                context,
            );
            expect(results[0]).toContain('"ok": true');
        });
    });

    describe('execution', () => {
        it('passes args to the sandbox executor', async () => {
            const stub = makePluginStub({
                files: {
                    '.vault-operator/data/skills/my-skill/scripts/echo.js':
                        'export async function execute(args) { return args; }',
                },
                sandboxResult: { received: true },
            });
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context } = makeContext();
            await tool.execute(
                { skill_name: 'my-skill', script_name: 'echo', args: { foo: 42, bar: 'baz' } },
                context,
            );
            expect(stub.sandboxCalls).toHaveLength(1);
            expect(stub.sandboxCalls[0].input).toEqual({ foo: 42, bar: 'baz' });
        });

        it('treats args as empty object when omitted', async () => {
            const stub = makePluginStub({
                files: {
                    '.vault-operator/data/skills/my-skill/scripts/noargs.js':
                        'export async function execute() { return "ran"; }',
                },
                sandboxResult: 'ran',
            });
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context } = makeContext();
            await tool.execute({ skill_name: 'my-skill', script_name: 'noargs' }, context);
            expect(stub.sandboxCalls[0].input).toEqual({});
        });

        it('returns the sandbox result as JSON in tool_result', async () => {
            const stub = makePluginStub({
                files: {
                    '.vault-operator/data/skills/my-skill/scripts/sum.js': 'export async function execute(args) { return args.a + args.b; }',
                },
                sandboxResult: 42,
            });
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute(
                { skill_name: 'my-skill', script_name: 'sum', args: { a: 20, b: 22 } },
                context,
            );
            expect(results[0]).toContain('42');
        });

        it('catches a sandbox throw and reports it in tool_result', async () => {
            const stub = makePluginStub({
                files: {
                    '.vault-operator/data/skills/my-skill/scripts/boom.js': 'export async function execute() { throw new Error("script blew up"); }',
                },
                sandboxError: new Error('script blew up'),
            });
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({ skill_name: 'my-skill', script_name: 'boom' }, context);
            expect(results[0]).toMatch(/script blew up/i);
        });

        it('catches a bundler error and reports it', async () => {
            const stub = makePluginStub({
                files: {
                    '.vault-operator/data/skills/my-skill/scripts/badsyntax.js':
                        'export async function execute() { invalid syntax here }',
                },
                bundlerError: new Error('Unexpected identifier'),
            });
            const tool = new RunSkillScriptTool(stub.plugin);
            const { context, results } = makeContext();
            await tool.execute({ skill_name: 'my-skill', script_name: 'badsyntax' }, context);
            expect(results[0]).toMatch(/Unexpected identifier|bundler|compile/i);
        });
    });

    describe('tool definition', () => {
        it('declares itself as a write operation (scripts can mutate state)', () => {
            const stub = makePluginStub();
            const tool = new RunSkillScriptTool(stub.plugin);
            expect(tool.isWriteOperation).toBe(true);
        });

        it('exposes the run_skill_script name', () => {
            const stub = makePluginStub();
            const tool = new RunSkillScriptTool(stub.plugin);
            expect(tool.name).toBe('run_skill_script');
        });
    });

    describe('bundle cache (Task B)', () => {
        it('skips the bundler on a second call with identical source', async () => {
            const stub = makePluginStub({
                files: {
                    '.vault-operator/data/skills/my-skill/scripts/echo.js':
                        'export async function execute(args) { return args; }',
                },
                sandboxResult: { ok: true },
            });
            // Spy on the bundler so we count transform-calls.
            let transformCount = 0;
            const tool = new RunSkillScriptTool(stub.plugin);
            const origTransform = stub.plugin.esbuildWasmManager!.transform.bind(
                stub.plugin.esbuildWasmManager,
            );
            stub.plugin.esbuildWasmManager!.transform = async (src: string) => {
                transformCount += 1;
                return origTransform(src);
            };

            const { context } = makeContext();
            await tool.execute({ skill_name: 'my-skill', script_name: 'echo', args: {} }, context);
            await tool.execute({ skill_name: 'my-skill', script_name: 'echo', args: {} }, context);

            // First call hits the bundler. Second hit is a cache lookup so
            // transform should NOT run a second time.
            expect(transformCount).toBe(1);
        });

        it('re-bundles when the script source changes', async () => {
            const stub = makePluginStub({
                files: {
                    '.vault-operator/data/skills/my-skill/scripts/echo.js':
                        'export async function execute(args) { return args; }',
                },
                sandboxResult: { ok: true },
            });
            let transformCount = 0;
            const tool = new RunSkillScriptTool(stub.plugin);
            const origTransform = stub.plugin.esbuildWasmManager!.transform.bind(
                stub.plugin.esbuildWasmManager,
            );
            stub.plugin.esbuildWasmManager!.transform = async (src: string) => {
                transformCount += 1;
                return origTransform(src);
            };

            const { context } = makeContext();
            await tool.execute({ skill_name: 'my-skill', script_name: 'echo' }, context);

            // Simulate the user editing the script on disk between calls.
            stub.files.set(
                '.vault-operator/data/skills/my-skill/scripts/echo.js',
                'export async function execute(args) { return { changed: true, args }; }',
            );

            await tool.execute({ skill_name: 'my-skill', script_name: 'echo' }, context);

            expect(transformCount).toBe(2);
        });
    });
});
