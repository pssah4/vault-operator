/**
 * BUG-018 Wave 2 regression test: hard tool-filter for plugin-shadowed built-ins.
 *
 * When a community plugin supersedes a built-in, the built-in must not appear
 * in the tool schema the LLM sees. Description-only redirects (v2.5.0 mitigation)
 * can be ignored by some models; the hard filter is robust.
 */

import { describe, it, expect } from 'vitest';
import { filterShadowedBuiltins, getShadowedBuiltinTools } from '../shadowedByPlugin';
import type { ToolDefinition } from '../types';

function td(name: string): ToolDefinition {
    return {
        name,
        description: `${name} description`,
        input_schema: { type: 'object', properties: {}, required: [] },
    } as unknown as ToolDefinition;
}

describe('shadowedByPlugin (BUG-018 Wave 2)', () => {
    it('returns no shadowed tools when no relevant plugin is enabled', () => {
        const shadowed = getShadowedBuiltinTools(new Set(['dataview', 'templater-obsidian']));
        expect(shadowed.size).toBe(0);
    });

    it('shadows create_excalidraw when obsidian-excalidraw-plugin is enabled', () => {
        const shadowed = getShadowedBuiltinTools(new Set(['obsidian-excalidraw-plugin']));
        expect(shadowed.has('create_excalidraw')).toBe(true);
    });

    it('filterShadowedBuiltins removes only the shadowed tool, leaves the rest intact', () => {
        const tools = [td('read_file'), td('create_excalidraw'), td('write_file'), td('generate_canvas')];
        const filtered = filterShadowedBuiltins(tools, new Set(['obsidian-excalidraw-plugin']));
        expect(filtered.map((t) => t.name)).toEqual(['read_file', 'write_file', 'generate_canvas']);
    });

    it('passes through when no plugin is enabled (identity)', () => {
        const tools = [td('read_file'), td('create_excalidraw')];
        const filtered = filterShadowedBuiltins(tools, new Set());
        expect(filtered).toHaveLength(2);
    });

    it('does NOT shadow create_drawio (drawio plugin only opens empty editor, built-in stays superior)', () => {
        const shadowed = getShadowedBuiltinTools(new Set(['drawio-obsidian', 'obsidian-diagrams-net']));
        expect(shadowed.has('create_drawio')).toBe(false);
    });
});
