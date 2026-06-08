/**
 * RunSkillScriptTool -- Generic executor for `scripts/{name}.js` inside a
 * self-authored skill folder. Replaces the previous `code_modules` /
 * `custom_*`-tool pattern (deprecated by FEAT-29-06 / ADR-126).
 *
 * Layout (FEAT-29-02 folder format):
 *   {agent-folder}/data/skills/{skill_name}/
 *     SKILL.md
 *     scripts/{script_name}.js   <-- this tool loads from here
 *
 * The script exports `async function execute(args) { ... }`. Return value
 * is JSON-serialized and pushed as tool_result.
 *
 * Path-traversal guard: skill_name and script_name are validated against an
 * alphanumeric-plus-dash whitelist before the path is joined. A malicious
 * `../` or `/` segment is rejected with a clear error.
 *
 * isWriteOperation=true because the script can mutate vault state, hit
 * external HTTP via the sandbox bridge, or write files. The approval gate
 * runs even for read-only scripts; that is the conservative default.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { getSelfAuthoredSkillsDir } from '../../utils/agentFolder';
import { RunSkillScriptCache } from '../../sandbox/RunSkillScriptCache';
import { isSafePathSegment } from '../../utils/safePathName';

export class RunSkillScriptTool extends BaseTool<'run_skill_script'> {
    readonly name = 'run_skill_script' as const;
    // Scripts can mutate state, do HTTP, write files. Treat as write op so
    // the approval gate is conservative.
    readonly isWriteOperation = true;

    // FEAT-29-06 Task B: shared per-tool-instance cache. EsbuildWasm
    // compile is the expensive step (transform: ~100 ms for small scripts,
    // build: ~500-2000 ms for bundles with deps). Caching by source-hash
    // means a script that runs in a loop pays the bundler cost once.
    private readonly cache: RunSkillScriptCache;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
        this.cache = new RunSkillScriptCache();
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'run_skill_script',
            description:
                'Execute a JavaScript helper script that lives in a self-authored skill folder. '
                + 'Path: {agent-folder}/data/skills/{skill_name}/scripts/{script_name}.js. '
                + 'The script must export `async function execute(args)`; its return value is JSON-serialized '
                + 'back to the tool_result. Use this for deterministic, repeatable steps the agent should '
                + 'not have to hallucinate each time (data aggregation, API calls, format conversion).',
            input_schema: {
                type: 'object',
                properties: {
                    skill_name: {
                        type: 'string',
                        description: 'Folder name of the self-authored skill that owns the script.',
                    },
                    script_name: {
                        type: 'string',
                        description: 'File-name of the script inside scripts/, without the .js extension.',
                    },
                    args: {
                        type: 'object',
                        description: 'JSON-serializable arguments handed to the script\'s execute(args) function. Defaults to {}.',
                        additionalProperties: true,
                    },
                },
                required: ['skill_name', 'script_name'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const skillName = (input.skill_name as string ?? '').trim();
        const scriptName = (input.script_name as string ?? '').trim();
        const args = (input.args as Record<string, unknown> | undefined) ?? {};

        if (!skillName) {
            callbacks.pushToolResult(this.formatError(new Error('skill_name parameter is required')));
            return;
        }
        if (!scriptName) {
            callbacks.pushToolResult(this.formatError(new Error('script_name parameter is required')));
            return;
        }
        if (!isSafePathSegment(skillName)) {
            callbacks.pushToolResult(
                this.formatError(new Error(`invalid skill_name (path-traversal guard): ${JSON.stringify(skillName)}`)),
            );
            return;
        }
        if (!isSafePathSegment(scriptName)) {
            callbacks.pushToolResult(
                this.formatError(new Error(`invalid script_name (path-traversal guard): ${JSON.stringify(scriptName)}`)),
            );
            return;
        }

        const skillsDir = getSelfAuthoredSkillsDir(this.plugin);
        const scriptPath = `${skillsDir}/${skillName}/scripts/${scriptName}.js`;

        // Load script source
        let source: string;
        try {
            const adapter = this.plugin.app.vault.adapter;
            if (!(await adapter.exists(scriptPath))) {
                callbacks.pushToolResult(
                    this.formatError(new Error(`Script not found: ${scriptPath}`)),
                );
                return;
            }
            source = await adapter.read(scriptPath);
        } catch (e) {
            callbacks.pushToolResult(this.formatError(e));
            return;
        }

        // Compile via EsbuildWasm
        const esbuild = this.plugin.esbuildWasmManager;
        const sandbox = this.plugin.sandboxExecutor;
        if (!esbuild || !sandbox) {
            callbacks.pushToolResult(
                this.formatError(new Error('Sandbox executor or bundler unavailable in this build')),
            );
            return;
        }

        let compiled: string;
        // FEAT-29-06 Task B: cache lookup by skill+script+source-hash.
        // A second invocation with identical source skips the bundler.
        const cached = this.cache.get(skillName, scriptName, source);
        if (cached !== null) {
            compiled = cached;
        } else {
            try {
                // Use transform (no deps) for simple scripts. A future hint
                // could parse `// @deps: [...]` from the source header and
                // call build() instead. For now transform handles all current
                // scripts in production skills.
                compiled = await esbuild.transform(source);
            } catch (e) {
                callbacks.pushToolResult(
                    this.formatError(new Error(`Script bundler error: ${(e as Error).message ?? String(e)}`)),
                );
                return;
            }
            this.cache.set(skillName, scriptName, source, compiled);
        }

        // Execute in sandbox
        try {
            const result = await sandbox.execute(compiled, args);
            callbacks.pushToolResult(this.formatSuccess(JSON.stringify(result, null, 2)));
            callbacks.log(`Executed skill-script: ${skillName}/${scriptName}`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            callbacks.pushToolResult(
                this.formatError(new Error(`Script execution error: ${msg}`)),
            );
        }
    }
}
