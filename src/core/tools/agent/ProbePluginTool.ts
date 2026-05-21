/**
 * ProbePluginTool -- Live probe of a plugin's commands and API methods.
 *
 * FEAT-29-03 / ADR-124: replaces the polling-snapshot view that the
 * `.skill.md` file held. The agent calls this tool when it needs the
 * authoritative current state of a plugin (just-enabled lazy plugins,
 * post-update command rename, plugin that registered no commands at
 * boot time but does so on demand). Read-only: never modifies plugin
 * state, never triggers approvals.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

interface ProbeResult {
    plugin_id: string;
    found: boolean;
    enabled: boolean;
    commands: { id: string; name: string }[];
    api_methods: string[];
    notice?: string;
}

export class ProbePluginTool extends BaseTool<'probe_plugin'> {
    readonly name = 'probe_plugin' as const;
    readonly isWriteOperation = false; // pure read

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'probe_plugin',
            description:
                'Probe the live state of an installed Obsidian plugin: returns the '
                + 'current command IDs and detected API methods. Use this when the '
                + 'PLUGIN SKILLS section looks stale, when a freshly enabled plugin '
                + 'is not yet listed, or before the first call to call_plugin_api '
                + 'for a plugin you have not used in this session. Read-only.',
            input_schema: {
                type: 'object',
                properties: {
                    plugin_id: {
                        type: 'string',
                        description:
                            'The plugin id to probe (e.g., "dataview", "templater-obsidian", '
                            + '"obsidian-tasks-plugin").',
                    },
                },
                required: ['plugin_id'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const pluginId = (input.plugin_id as string ?? '').trim();
        if (!pluginId) {
            callbacks.pushToolResult(this.formatError(new Error('plugin_id parameter is required')));
            return;
        }

        try {
            const result = this.probe(pluginId);
            callbacks.pushToolResult(this.formatSuccess(JSON.stringify(result, null, 2)));
            callbacks.log(
                `probe_plugin: ${pluginId} -> ${result.found ? 'found' : 'not found'}, `
                + `commands=${result.commands.length}, api=${result.api_methods.length}`,
            );
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
        }
    }

    /**
     * Pure function exposed for unit tests. Reads `app.plugins.plugins[id]`
     * and filters `app.commands.commands` by the plugin id prefix.
     */
    probe(pluginId: string): ProbeResult {
        const app = this.app as unknown as {
            plugins?: {
                plugins?: Record<string, unknown>;
                manifests?: Record<string, { id: string; name?: string }>;
                enabledPlugins?: Set<string>;
            };
            commands?: { commands?: Record<string, { id: string; name?: string }> };
        };

        const pluginInstance = app.plugins?.plugins?.[pluginId];
        const enabled = app.plugins?.enabledPlugins?.has(pluginId) ?? false;
        const installed = pluginInstance !== undefined || (app.plugins?.manifests?.[pluginId] !== undefined);

        if (!installed) {
            return {
                plugin_id: pluginId,
                found: false,
                enabled: false,
                commands: [],
                api_methods: [],
                notice: `Plugin "${pluginId}" is not installed.`,
            };
        }

        const allCommands = app.commands?.commands ?? {};
        const prefix = `${pluginId}:`;
        const commands = Object.values(allCommands)
            .filter((c): c is { id: string; name?: string } => typeof c?.id === 'string' && c.id.startsWith(prefix))
            .map((c) => ({ id: c.id, name: c.name ?? c.id }));

        const apiMethods = pluginInstance ? reflectApiMethods(pluginInstance) : [];

        return {
            plugin_id: pluginId,
            found: true,
            enabled,
            commands,
            api_methods: apiMethods,
            ...(enabled ? {} : { notice: `Plugin is installed but disabled. Use enable_plugin to activate.` }),
        };
    }
}

/**
 * Reflection-based discovery of public API method names on a plugin
 * instance. Mirrors the heuristic VaultDNAScanner uses: skip private
 * (`_`-prefixed), skip Obsidian-Plugin base-class methods, skip props
 * that are not functions. The result is the set of names the agent
 * could plausibly pass to `call_plugin_api`. Allowlist enforcement
 * still happens at call_plugin_api time -- this is just discovery.
 */
function reflectApiMethods(pluginInstance: unknown): string[] {
    if (typeof pluginInstance !== 'object' || pluginInstance === null) return [];
    const obj = pluginInstance as Record<string, unknown>;
    const apiHolder = (obj.api as Record<string, unknown> | undefined) ?? obj;
    const PLUGIN_BASE_METHODS = new Set([
        'onload', 'onunload', 'addCommand', 'removeCommand', 'addRibbonIcon',
        'addStatusBarItem', 'addSettingTab', 'registerView', 'registerExtensions',
        'registerHoverLinkSource', 'registerMarkdownPostProcessor',
        'registerMarkdownCodeBlockProcessor', 'registerCodeMirror',
        'registerEditorExtension', 'registerObsidianProtocolHandler',
        'registerEditorSuggest', 'loadData', 'saveData', 'registerInterval',
        'registerEvent', 'register', 'register2',
    ]);
    const out: string[] = [];
    for (const key of Object.keys(apiHolder)) {
        if (key.startsWith('_')) continue;
        if (PLUGIN_BASE_METHODS.has(key)) continue;
        // AUDIT-FEAT-29-03+04 L-1: a plugin can implement a property as a
        // getter with side effects (state init, lazy compute) and the
        // getter may throw. Skip such properties so the whole probe does
        // not abort on one bad property.
        let value: unknown;
        try {
            value = apiHolder[key];
        } catch {
            continue;
        }
        if (typeof value !== 'function') continue;
        out.push(key);
    }
    return out.sort();
}
