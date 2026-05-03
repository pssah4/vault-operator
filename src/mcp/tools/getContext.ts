/**
 * get_context -- Returns user profile, memory, vault stats, skills, and rules.
 * ALWAYS called first by Claude to understand the user and vault context.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import { AGENT_INTERNAL_TOOLS } from '../McpBridge';
import { validateSourceInterface } from '../../core/memory/SourceInterface';

export async function handleGetContext(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown> = {},
): Promise<McpToolResult> {
    const sections: string[] = [];

    // AUDIT-016 M-3: strictSourceIsolation gating fuer Memory + Soul +
    // Skills + Rules. Wenn Setting an UND source_interface != obsilo
    // (also externer Connector), liefern wir NUR Vault-Stats statt
    // Memory-Inhalt. Vermeidet, dass ChatGPT-Connector (familien-shared)
    // Sebastians persoenlichen Memory-Kontext einholt.
    const crossSurface = plugin.settings?.memory?.crossSurface;
    const sourceInterface = args.source_interface !== undefined
        ? validateSourceInterface(args.source_interface)
        : 'unknown';
    const strictMode = (crossSurface?.strictSourceIsolation ?? false)
        && sourceInterface !== 'obsilo';

    // Memory context (user-profile, patterns, soul, projects).
    // Skipped under strictSourceIsolation for non-obsilo callers.
    if (plugin.memoryService && !strictMode) {
        try {
            const files = await plugin.memoryService.loadMemoryFiles();
            const ctx = plugin.memoryService.buildMemoryContext(files);
            if (ctx) sections.push(ctx);
        } catch { /* non-fatal */ }
    } else if (strictMode) {
        sections.push(
            `--- Memory + Soul context omitted ---\n`
            + `strictSourceIsolation is enabled in Settings; personal memory context `
            + `is only exposed to source_interface='obsilo' (the plugin itself). `
            + `Pass source_interface in get_context arguments to opt into shared mode.`,
        );
    }

    // Available vault operations (via execute_vault_op)
    const availableOps = plugin.toolRegistry.getAllTools()
        .map(t => t.name)
        .filter(name => !AGENT_INTERNAL_TOOLS.has(name))
        .sort();
    sections.push([
        '--- Available Vault Operations (via execute_vault_op) ---',
        `Use execute_vault_op with operation parameter set to any of: ${availableOps.join(', ')}`,
        'Pass tool-specific parameters via the params object.',
    ].join('\n'));

    // Vault stats
    const vault = plugin.app.vault;
    const files = vault.getMarkdownFiles();
    const graphStore = plugin.graphStore;
    sections.push([
        '--- Vault Stats ---',
        `Notes: ${files.length}`,
        `Folders: ${vault.getAllFolders().length}`,
        `Graph edges: ${graphStore?.getEdgeCount() ?? 0}`,
        `Graph tags: ${graphStore?.getTagCount() ?? 0}`,
        `Semantic index: ${plugin.semanticIndex?.isIndexed ? 'built' : 'not built'}`,
        `Implicit connections: ${plugin.implicitConnectionService?.getCount() ?? 0}`,
    ].join('\n'));

    // Available skills + Rules: skipped under strictSourceIsolation.
    // Sebastians lokale Skills + Rules sind keine direkten Memory-Inhalte,
    // koennen aber Personalisierungs-Hints (Tonfall, Sprach-Praeferenzen)
    // enthalten. Konservativ behandeln.
    if (!strictMode) {
        if (plugin.skillsManager) {
            try {
                const skills = await plugin.skillsManager.discoverSkills();
                if (skills.length > 0) {
                    sections.push('--- Available Skills ---');
                    for (const s of skills) {
                        sections.push(`- ${s.name}: ${s.description ?? ''}`);
                    }
                }
            } catch { /* non-fatal */ }
        }

        if (plugin.rulesLoader) {
            try {
                const rules = await plugin.rulesLoader.discoverRules();
                if (rules.length > 0) {
                    sections.push('--- User Rules ---');
                    for (const r of rules) {
                        sections.push(`- ${r}`);
                    }
                }
            } catch { /* non-fatal */ }
        }
    }

    return {
        content: [{ type: 'text', text: sections.join('\n\n') }],
    };
}
