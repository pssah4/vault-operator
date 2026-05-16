/**
 * ManageSourceTool — Read, search, edit, build, reload, and rollback plugin source
 *
 * Actions:
 * - 'list': List all embedded source files
 * - 'read': Read an embedded source file
 * - 'search': Search across embedded source files
 * - 'edit': Modify an embedded source file in memory
 * - 'build': Compile the modified source into a new main.js
 * - 'reload': Deploy the built bundle and hot-reload the plugin
 * - 'rollback': Restore main.js from backup
 *
 * Part of Self-Development Phase 4: Core Self-Modification.
 *
 * SECURITY (M-7/CWE-269): This tool is classified as 'self-modify' in
 * ToolExecutionPipeline, which ALWAYS requires manual user approval.
 * There is no auto-approve bypass. Only available in Agent mode.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext, ToolCallbacks } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { EmbeddedSourceManager } from '../../self-development/EmbeddedSourceManager';
import type { PluginBuilder } from '../../self-development/PluginBuilder';
import type { PluginReloader } from '../../self-development/PluginReloader';
import { BUNDLE_FILENAME, BUNDLE_BACKUP_FILENAME } from '../../../util/pluginFiles';

export class ManageSourceTool extends BaseTool<'manage_source'> {
    readonly name = 'manage_source' as const;
    readonly isWriteOperation = true; // Modifying source is a write operation

    constructor(
        plugin: ObsidianAgentPlugin,
        private sourceManager: EmbeddedSourceManager,
        private pluginBuilder: PluginBuilder,
        private pluginReloader: PluginReloader,
    ) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'manage_source',
            description:
                'Read, search, edit, build, reload, and rollback the plugin\'s own source code. ' +
                'Use for core self-modification when a bug cannot be fixed by a dynamic module. ' +
                'Actions: list (show all source files), read (read a file), search (find pattern), ' +
                'edit (modify in memory), build (compile modified source), reload (deploy + hot-reload), ' +
                'rollback (restore backup). Always list/read/search before editing. ' +
                'CAUTION: Core self-modification can break the plugin. Always test carefully.',
            input_schema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['list', 'read', 'search', 'edit', 'build', 'reload', 'rollback'],
                        description: 'Action to perform',
                    },
                    path: {
                        type: 'string',
                        description: 'Source file path (for read/edit), e.g. "src/main.ts"',
                    },
                    pattern: {
                        type: 'string',
                        description: 'Search pattern (regex) for search action',
                    },
                    content: {
                        type: 'string',
                        description: 'New file content for edit action',
                    },
                },
                required: ['action'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const action = (input.action as string ?? '').trim();

        try {
            switch (action) {
                case 'list':
                    await this.handleList(callbacks);
                    break;
                case 'read':
                    await this.handleRead(input, callbacks);
                    break;
                case 'search':
                    await this.handleSearch(input, callbacks);
                    break;
                case 'edit':
                    await this.handleEdit(input, callbacks);
                    break;
                case 'build':
                    await this.handleBuild(callbacks);
                    break;
                case 'reload':
                    await this.handleReload(callbacks);
                    break;
                case 'rollback':
                    await this.handleRollback(callbacks);
                    break;
                default:
                    callbacks.pushToolResult(this.formatError(new Error(
                        `Unknown action: "${action}". Use list, read, search, edit, build, reload, or rollback.`
                    )));
            }
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('manage_source', error);
        }
    }

    private async ensureLoaded(callbacks: ToolCallbacks): Promise<boolean> {
        if (!this.sourceManager.isLoaded) {
            const loaded = await this.sourceManager.load();
            if (!loaded) {
                callbacks.pushToolResult(this.formatError(new Error(
                    'Self-Development source bundle not installed. ' +
                    'Install it from Settings > Advanced > Self-Development (one-time download from this plugin\'s GitHub release).'
                )));
                return false;
            }
        }
        return true;
    }

    private async handleList(callbacks: ToolCallbacks): Promise<void> {
        if (!await this.ensureLoaded(callbacks)) return;

        const files = this.sourceManager.listFiles();
        const version = this.sourceManager.getVersion();

        callbacks.pushToolResult(this.formatSuccess(
            `Embedded source v${version} — ${files.length} files:\n\n` +
            files.map((f) => `- ${f}`).join('\n')
        ));
        callbacks.log(`manage_source: listed ${files.length} files`);
    }

    private async handleRead(input: Record<string, unknown>, callbacks: ToolCallbacks): Promise<void> {
        if (!await this.ensureLoaded(callbacks)) return;

        const path = (input.path as string ?? '').trim();
        if (!path) {
            callbacks.pushToolResult(this.formatError(new Error('path is required for read action')));
            return;
        }

        const content = this.sourceManager.readFile(path);
        if (content === undefined) {
            const allFiles = this.sourceManager.listFiles();
            const suggestions = allFiles
                .filter((f) => f.includes(path.split('/').pop() ?? ''))
                .slice(0, 5);
            callbacks.pushToolResult(this.formatError(new Error(
                `File "${path}" not found in embedded source.` +
                (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '')
            )));
            return;
        }

        callbacks.pushToolResult(this.formatSuccess(
            `--- ${path} ---\n${content}`
        ));
        callbacks.log(`manage_source: read ${path}`);
    }

    private async handleSearch(input: Record<string, unknown>, callbacks: ToolCallbacks): Promise<void> {
        if (!await this.ensureLoaded(callbacks)) return;

        const pattern = (input.pattern as string ?? '').trim();
        if (!pattern) {
            callbacks.pushToolResult(this.formatError(new Error('pattern is required for search action')));
            return;
        }

        const results = this.sourceManager.searchFiles(pattern);
        if (results.length === 0) {
            callbacks.pushToolResult(this.formatSuccess(
                `No matches found for pattern: ${pattern}`
            ));
            return;
        }

        const maxResults = 50;
        const truncated = results.length > maxResults;
        const shown = truncated ? results.slice(0, maxResults) : results;

        callbacks.pushToolResult(this.formatSuccess(
            `Found ${results.length} matches for "${pattern}"` +
            (truncated ? ` (showing first ${maxResults}):` : ':') +
            '\n\n' +
            shown.map((r) => `${r.path}:${r.line} — ${r.text}`).join('\n')
        ));
        callbacks.log(`manage_source: search "${pattern}" → ${results.length} matches`);
    }

    private async handleEdit(input: Record<string, unknown>, callbacks: ToolCallbacks): Promise<void> {
        if (!await this.ensureLoaded(callbacks)) return;

        const path = (input.path as string ?? '').trim();
        const content = input.content as string | undefined;

        if (!path) {
            callbacks.pushToolResult(this.formatError(new Error('path is required for edit action')));
            return;
        }
        if (content === undefined) {
            callbacks.pushToolResult(this.formatError(new Error('content is required for edit action')));
            return;
        }

        // Get original for diff preview
        const original = this.sourceManager.readFile(path);
        this.sourceManager.editFile(path, content);

        if (original) {
            const diff = this.pluginBuilder.getDiff(path, original, content);
            callbacks.pushToolResult(this.formatSuccess(
                `File "${path}" modified in memory.\n\nDiff preview:\n${diff}\n\n` +
                'Use action "build" to compile the modified source.'
            ));
        } else {
            callbacks.pushToolResult(this.formatSuccess(
                `New file "${path}" created in memory (${content.length} chars).\n` +
                'Use action "build" to compile the modified source.'
            ));
        }
        callbacks.log(`manage_source: edited ${path}`);
    }

    private lastBuildResult: string | null = null;

    private async handleBuild(callbacks: ToolCallbacks): Promise<void> {
        if (!await this.ensureLoaded(callbacks)) return;

        callbacks.pushToolResult(this.formatSuccess('Building modified source... This may take 20-30 seconds.'));

        try {
            const result = await this.pluginBuilder.build();
            this.lastBuildResult = result;
            callbacks.pushToolResult(this.formatSuccess(
                `Build successful! Output: ${result.length} bytes.\n` +
                'Use action "reload" to deploy and hot-reload the plugin.'
            ));
            callbacks.log(`manage_source: build succeeded (${result.length} bytes)`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.lastBuildResult = null;
            callbacks.pushToolResult(this.formatError(new Error(
                `Build failed: ${msg}\n\nFix the error in the source and try again.`
            )));
        }
    }

    private async handleReload(callbacks: ToolCallbacks): Promise<void> {
        if (!this.lastBuildResult) {
            callbacks.pushToolResult(this.formatError(new Error(
                'No build result available. Run action "build" first.'
            )));
            return;
        }

        // Obsidian's review policy forbids the plugin from overwriting
        // its own main.js. Instead, hand the compiled bundle to the user
        // via a modal with a download button + step-by-step apply
        // instructions. Phase 3 of the community-plugin-readiness work.
        const { PluginPatchModal } = await import('../../../ui/modals/PluginPatchModal');
        const summary = `Compiled bundle: ${this.lastBuildResult.length} bytes.\n` +
            `Source files held in memory: ${this.sourceManager.listFiles().length}.`;
        new PluginPatchModal(
            this.plugin.app,
            this.plugin,
            this.lastBuildResult,
            summary,
        ).open();
        this.lastBuildResult = null;

        callbacks.pushToolResult(this.formatSuccess(
            `Patch ready. Opened the apply-patch modal: download the new ${BUNDLE_FILENAME}, replace it in the plugin folder, then reload Vault Operator.`
        ));
        callbacks.log('manage_source: patch modal opened');
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async required by callsite signature; body is synchronous after Phase-3 cleanup
    private async handleRollback(callbacks: ToolCallbacks): Promise<void> {
        // Phase 3: rollback used to restore a plugin-written main.js.bak.
        // The plugin no longer writes into its own folder, so there is no
        // automatic backup to restore from. Surface a clear guidance
        // message instead of pretending to rollback.
        callbacks.pushToolResult(this.formatError(new Error(
            'Automatic rollback is not available in this plugin build. ' +
            'To revert: reinstall Vault Operator via BRAT (Add Beta Plugin -> https://github.com/pssah4/vault-operator) ' +
            `or via the Community Plugins directory. If you kept your own ${BUNDLE_BACKUP_FILENAME} before applying the patch, copy it back into the plugin folder manually and reload.`
        )));
        callbacks.log('manage_source: rollback advised manual restore');
    }
}
