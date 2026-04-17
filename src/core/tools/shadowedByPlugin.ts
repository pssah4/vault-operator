/**
 * shadowedByPlugin
 *
 * BUG-018 follow-up (hard tool-filter): when a community plugin does the same
 * job as a built-in tool AND does it better, the built-in must disappear from
 * the tool schema so the LLM cannot pick it. Description-only redirects (as
 * shipped in v2.5.0) got ignored by strong models in rare cases; a hard filter
 * is robust.
 *
 * Only add entries here where the plugin is unambiguously superior and always
 * available when enabled. Do NOT add built-ins whose plugin equivalent merely
 * opens an empty editor (e.g. drawio: `drawio-obsidian:create-new-diagram`
 * only opens a blank canvas — the agent cannot deliver a finished diagram
 * through it, so create_drawio stays as the preferred path even with the
 * plugin installed).
 */

import type { ToolDefinition } from './types';

/**
 * Mapping: built-in tool name -> list of plugin ids that supersede it.
 * The built-in is filtered out if ANY of the listed plugins is enabled.
 */
const SHADOW_MAP: Record<string, string[]> = {
    // The built-in create_excalidraw draws only rectangles + labels.
    // The Excalidraw community plugin supports arrows, freehand, layers,
    // palettes, and custom shapes — strictly superior.
    create_excalidraw: ['obsidian-excalidraw-plugin'],
};

/** Return the set of built-in tool names that should be hidden from the LLM. */
export function getShadowedBuiltinTools(enabledPluginIds: Set<string>): Set<string> {
    const shadowed = new Set<string>();
    for (const [toolName, pluginIds] of Object.entries(SHADOW_MAP)) {
        if (pluginIds.some((id) => enabledPluginIds.has(id))) {
            shadowed.add(toolName);
        }
    }
    return shadowed;
}

/** Remove shadowed built-in tools from a ToolDefinition list. */
export function filterShadowedBuiltins(
    tools: ToolDefinition[],
    enabledPluginIds: Set<string>,
): ToolDefinition[] {
    const shadowed = getShadowedBuiltinTools(enabledPluginIds);
    if (shadowed.size === 0) return tools;
    return tools.filter((t) => !shadowed.has(t.name));
}
