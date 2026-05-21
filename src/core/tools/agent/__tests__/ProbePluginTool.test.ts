/**
 * FEAT-29-03 unit tests for ProbePluginTool.probe().
 *
 * The public `execute()` path needs a full ToolExecutionContext stub which
 * is heavyweight; we instead test the pure `probe(pluginId)` method by
 * casting through `as unknown as { probe: ... }`. Inputs are App and Vault
 * stubs with controllable `plugins` and `commands` shapes.
 */

import { describe, it, expect } from 'vitest';
import { ProbePluginTool } from '../ProbePluginTool';
import type ObsidianAgentPlugin from '../../../../main';

function makePluginStub(overrides: {
    plugins?: Record<string, unknown>;
    manifests?: Record<string, { id: string; name?: string }>;
    enabledPlugins?: string[];
    commands?: Record<string, { id: string; name?: string }>;
} = {}) {
    const app = {
        plugins: {
            plugins: overrides.plugins ?? {},
            manifests: overrides.manifests ?? {},
            enabledPlugins: new Set(overrides.enabledPlugins ?? []),
        },
        commands: {
            commands: overrides.commands ?? {},
        },
    };
    return { app } as unknown as ObsidianAgentPlugin;
}

describe('ProbePluginTool.probe (FEAT-29-03)', () => {
    it('reports not found when plugin id is unknown', () => {
        const plugin = makePluginStub();
        const tool = new ProbePluginTool(plugin);
        const result = tool.probe('does-not-exist');
        expect(result.found).toBe(false);
        expect(result.enabled).toBe(false);
        expect(result.commands).toEqual([]);
        expect(result.api_methods).toEqual([]);
        expect(result.notice).toMatch(/not installed/i);
    });

    it('reports enabled + commands for an enabled plugin', () => {
        const plugin = makePluginStub({
            plugins: { dataview: { api: { pages: () => [], query: () => [] } } },
            manifests: { dataview: { id: 'dataview', name: 'Dataview' } },
            enabledPlugins: ['dataview'],
            commands: {
                'dataview:rebuild': { id: 'dataview:rebuild', name: 'Rebuild index' },
                'dataview:run': { id: 'dataview:run', name: 'Run query' },
                'unrelated:thing': { id: 'unrelated:thing', name: 'X' },
            },
        });
        const tool = new ProbePluginTool(plugin);
        const result = tool.probe('dataview');

        expect(result.found).toBe(true);
        expect(result.enabled).toBe(true);
        expect(result.commands).toHaveLength(2);
        expect(result.commands.map((c) => c.id).sort()).toEqual([
            'dataview:rebuild', 'dataview:run',
        ]);
        // unrelated command must NOT leak in
        expect(result.commands.find((c) => c.id === 'unrelated:thing')).toBeUndefined();
        // API methods extracted from `api` holder
        expect(result.api_methods.sort()).toEqual(['pages', 'query']);
    });

    it('reports disabled-but-installed when the manifest exists but plugin is off', () => {
        const plugin = makePluginStub({
            manifests: { kanban: { id: 'kanban', name: 'Kanban' } },
            // Not in `plugins.plugins`, not in `enabledPlugins`
        });
        const tool = new ProbePluginTool(plugin);
        const result = tool.probe('kanban');

        expect(result.found).toBe(true);
        expect(result.enabled).toBe(false);
        expect(result.commands).toEqual([]);
        expect(result.api_methods).toEqual([]);
        expect(result.notice).toMatch(/disabled/i);
    });

    it('falls back to the plugin instance when there is no `api` property', () => {
        // Some plugins expose methods directly on the plugin instance.
        const plugin = makePluginStub({
            plugins: { foo: { search: () => 0, filter: () => 0, _private: () => 0 } },
            manifests: { foo: { id: 'foo' } },
            enabledPlugins: ['foo'],
        });
        const tool = new ProbePluginTool(plugin);
        const result = tool.probe('foo');
        // _private is filtered out (private convention)
        expect(result.api_methods.sort()).toEqual(['filter', 'search']);
    });

    it('strips Obsidian Plugin base-class methods from api list', () => {
        const plugin = makePluginStub({
            plugins: {
                'noisy-plugin': {
                    api: {
                        // legit api method
                        run: () => 0,
                        // base-class methods that should be filtered
                        loadData: () => 0,
                        saveData: () => 0,
                        addCommand: () => 0,
                        registerEvent: () => 0,
                    },
                },
            },
            manifests: { 'noisy-plugin': { id: 'noisy-plugin' } },
            enabledPlugins: ['noisy-plugin'],
        });
        const tool = new ProbePluginTool(plugin);
        const result = tool.probe('noisy-plugin');
        expect(result.api_methods).toEqual(['run']);
    });

    it('does not include non-function api properties', () => {
        const plugin = makePluginStub({
            plugins: {
                'config-plugin': {
                    api: {
                        version: '1.2.3',
                        enabled: true,
                        run: () => 0,
                    },
                },
            },
            manifests: { 'config-plugin': { id: 'config-plugin' } },
            enabledPlugins: ['config-plugin'],
        });
        const tool = new ProbePluginTool(plugin);
        const result = tool.probe('config-plugin');
        expect(result.api_methods).toEqual(['run']);
    });

    it('skips properties whose getter throws instead of crashing (AUDIT L-1)', () => {
        const apiObj: Record<string, unknown> = {
            run: () => 0,
            // safe normal method
            stop: () => 0,
        };
        // Define a getter that throws when read. probe_plugin must skip
        // this property, NOT abort the whole api scan.
        Object.defineProperty(apiObj, 'lazy', {
            get() { throw new Error('not initialized'); },
            enumerable: true,
            configurable: true,
        });

        const plugin = makePluginStub({
            plugins: { 'getter-plugin': { api: apiObj } },
            manifests: { 'getter-plugin': { id: 'getter-plugin' } },
            enabledPlugins: ['getter-plugin'],
        });
        const tool = new ProbePluginTool(plugin);
        const result = tool.probe('getter-plugin');
        // run + stop survive; the throwing getter is silently skipped.
        expect(result.api_methods.sort()).toEqual(['run', 'stop']);
        expect(result.api_methods).not.toContain('lazy');
    });

    it('handles a large plugin instance (200 props) without runaway latency', () => {
        // Risk-Szenario 5 from /coding-Handoff: probe iterates over the
        // plugin instance via Object.keys when there is no `api` property.
        // A "kitchen sink" plugin with 200 own properties must still probe
        // in single-digit milliseconds.
        const largePluginInstance: Record<string, unknown> = {};
        for (let i = 0; i < 200; i++) {
            largePluginInstance[`method_${i}`] = () => 0;
        }
        // Some legit Plugin-base methods sprinkled in -- these must still
        // be filtered out.
        largePluginInstance.loadData = () => 0;
        largePluginInstance.saveData = () => 0;
        largePluginInstance._privateThing = () => 0;
        largePluginInstance.constant = 'not a function';

        const plugin = makePluginStub({
            plugins: { 'large-plugin': largePluginInstance },
            manifests: { 'large-plugin': { id: 'large-plugin' } },
            enabledPlugins: ['large-plugin'],
        });
        const tool = new ProbePluginTool(plugin);
        const t0 = Date.now();
        const result = tool.probe('large-plugin');
        const elapsed = Date.now() - t0;

        // 200 method_* survive, the two base methods + the private one + the
        // non-function are stripped.
        expect(result.api_methods.length).toBe(200);
        expect(result.api_methods).not.toContain('loadData');
        expect(result.api_methods).not.toContain('saveData');
        expect(result.api_methods).not.toContain('_privateThing');
        expect(result.api_methods).not.toContain('constant');
        // 50 ms is generous; on a healthy laptop this completes in single
        // digits. The bound exists so a future quadratic regression shows up.
        expect(elapsed).toBeLessThan(50);
    });
});
