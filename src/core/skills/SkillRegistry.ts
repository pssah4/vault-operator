/**
 * SkillRegistry — Unified registry for VaultDNA plugin skills (PAS-1)
 *
 * Combines auto-discovered VaultDNA skills with user toggle settings.
 * Provides a compact system prompt section listing active plugin skills
 * so the agent knows which execute_command IDs are available.
 *
 * ADR-104: Only a compact list goes into the system prompt.
 * Full .skill.md content is read on-demand via read_file.
 */

import type { VaultDNAScanner } from './VaultDNAScanner';
import type { PluginSkillMeta } from './types';

export class SkillRegistry {
    private scanner: VaultDNAScanner;
    private skillToggles: Record<string, boolean>;
    /** FEATURE-0507: vault-relative dir (default ".obsidian-agent/plugin-skills") for the prompt hint. */
    private skillsDir: string;

    constructor(scanner: VaultDNAScanner, skillToggles: Record<string, boolean>, skillsDir = '.obsidian-agent/plugin-skills') {
        this.scanner = scanner;
        this.skillToggles = skillToggles;
        this.skillsDir = skillsDir;
    }

    /**
     * FEATURE-0508: re-target the registry to a new agent folder without a
     * plugin reload. Changes only the string used in prompt hints
     * (`read_file("{dir}/...")`); the underlying scanner is notified
     * separately so `.skill.md` files move to the new location on the next
     * scan.
     */
    setSkillsDir(newDir: string): void {
        this.skillsDir = newDir;
    }

    /**
     * Get all active plugin skills (enabled + not toggled off by user).
     */
    getActivePluginSkills(): PluginSkillMeta[] {
        return this.scanner.getEnabledPluginSkills().filter(
            (s) => this.skillToggles[s.id] !== false,
        );
    }

    /**
     * Get all disabled plugin skills.
     */
    getDisabledPluginSkills(): PluginSkillMeta[] {
        return this.scanner.getDisabledPluginSkills();
    }

    /**
     * BUG-018 follow-up: get every enabled plugin that exists in the vault but
     * was classified as NONE by VaultDNA (no agentifiable commands at scan
     * time). The agent still needs to know these exist — many plugins register
     * their commands lazily, so a "NONE" today might have commands at runtime.
     * Listed in the system prompt under "OTHER ENABLED PLUGINS" so the model
     * doesn't claim a plugin doesn't exist when it does.
     */
    private getOtherEnabledPlugins(): { id: string; name: string; description: string }[] {
        const dna = this.scanner.getVaultDNA();
        if (!dna) return [];
        const known = new Set([
            ...this.getActivePluginSkills().map((s) => s.id),
            ...this.getDisabledPluginSkills().map((s) => s.id),
        ]);
        return dna.plugins
            .filter((p) => p.status === 'enabled' && !known.has(p.id))
            .map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description ?? '',
            }));
    }

    /**
     * Build a compact PLUGIN SKILLS section for the system prompt.
     *
     * Lists active plugins with their commands so the agent knows
     * what execute_command IDs are available without reading .skill.md files.
     */
    getPluginSkillsPromptSection(): string {
        const active = this.getActivePluginSkills();
        const disabled = this.getDisabledPluginSkills();
        const others = this.getOtherEnabledPlugins();

        if (active.length === 0 && disabled.length === 0 && others.length === 0) return '';

        const lines: string[] = [
            'PLUGIN SKILLS',
            '',
            'CRITICAL RULE: When the user names a plugin, use the right tool for its type:',
            '- Plugin wraps CLI tool (Pandoc, Mermaid, ffmpeg, LaTeX): use execute_recipe — no UI dialog, verified output.',
            '- Plugin provides Obsidian-native commands (Templater, Daily Notes): use execute_command.',
            '- Plugin exposes JS API (Dataview, Omnisearch, MetaEdit): use call_plugin_api.',
            'For file export: prefer native Obsidian commands (execute_command) over CLI recipes (execute_recipe). Use recipes only for advanced features (custom templates, DOCX, LaTeX).',
            'NEVER substitute a built-in tool (like create_base, write_file) for a plugin the user requested.',
            '',
            'Before using a plugin, ALWAYS read its skill file first:',
            `  read_file("${this.skillsDir}/{plugin-id}.skill.md")`,
            'This tells you what the plugin does, its commands, its configuration, and how to use it.',
            '',
        ];

        // Active plugins with descriptions + commands
        if (active.length > 0) {
            lines.push('ACTIVE PLUGINS:');
            for (const skill of active) {
                const cmdList = skill.commands.map((c) => `${c.id}`).join(', ');
                const type = skill.source === 'core' ? 'Core' : 'Community';
                lines.push(`- ${skill.name} [${type}] -- ${skill.description}`);
                if (cmdList) {
                    lines.push(`  Commands: ${cmdList}`);
                }
                if (skill.needsSetup) {
                    lines.push('  [NEEDS SETUP -- read .skill.md for details]');
                }
            }
            lines.push('');
            lines.push('PLUGIN SETTINGS: Each .skill.md includes the plugin\'s current configuration');
            lines.push('under "## Current Configuration". Use this to understand how the plugin works');
            lines.push('in this vault. When settings are missing, guide the user to configure the plugin');
            lines.push('via Obsidian Settings. Do NOT guess default values -- check .skill.md first.');
            lines.push('');
        }

        // Disambiguation examples — prevent common tool confusion
        lines.push('COMMON MISTAKES TO AVOID:');
        lines.push('- WRONG: User says "export as PDF" -> you use execute_recipe even though workspace:export-pdf exists');
        lines.push('  RIGHT: User says "export as PDF" -> execute_command("workspace:export-pdf") -- native, zero dependencies');
        lines.push('  ALSO RIGHT: User needs custom template or DOCX -> execute_recipe("pandoc-pdf", {input, output})');
        lines.push('- WRONG: User says "DB Folder Tabelle" -> you use create_base');
        lines.push('  RIGHT: User says "DB Folder Tabelle" -> read .skill.md then execute_command("dbfolder:create-new-database-folder")');
        lines.push('- WRONG: User says "Dataview query" -> you use query_base');
        lines.push('  RIGHT: User says "Dataview query" -> use call_plugin_api("dataview", "query", ...)');
        lines.push('- WRONG: User says "Excalidraw" or "Skizze" -> you use create_excalidraw built-in');
        lines.push('  RIGHT: Excalidraw plugin installed -> execute_command("obsidian-excalidraw-plugin:excalidraw-autocreate-newtab") (or read plugin .skill.md for the exact command). The built-in only draws boxes.');
        lines.push('- WRONG: User says "Draw.io diagram" -> you use write_file with a .drawio.svg file (the plugin will reject it as "Not a diagram file")');
        lines.push('  RIGHT: Use the built-in create_drawio tool. It emits a valid .drawio file with mxfile wrapper that the drawio-obsidian / obsidian-diagrams-net plugin opens and lets the user extend.');
        lines.push('- WRONG: User mentions a disabled plugin -> you ask the user to enable it manually');
        lines.push('  RIGHT: User mentions a disabled plugin -> enable_plugin(plugin_id) yourself, then use the plugin');
        lines.push('');

        // BUG-018 follow-up: list every other ENABLED plugin even when VaultDNA
        // could not derive agentifiable commands at scan time. Many plugins
        // register commands lazily, and a flat-out "this plugin doesn't exist"
        // hallucination is the worst possible answer.
        if (others.length > 0) {
            lines.push('OTHER ENABLED PLUGINS (no agentifiable commands found at scan time, but installed and enabled):');
            for (const p of others) {
                const desc = p.description ? ` -- ${p.description}` : '';
                lines.push(`- ${p.name} (${p.id})${desc}`);
            }
            lines.push('');
            lines.push('IMPORTANT: NEVER tell the user "this plugin does not exist" or "I cannot create that format" when one of these plugins is listed above. Instead:');
            lines.push('1. Try execute_command("<plugin-id>:<some-command>") with a sensible command name. Many plugin commands like "<id>:new-diagram" or "<id>:create-new" follow this pattern.');
            lines.push('2. Or list the command palette via the Obsidian UI naming and try the most plausible command id.');
            lines.push('3. If the call returns "command not found", ask the user for the exact command name OR call enable_plugin to force a fresh skill scan.');
            lines.push('');
        }

        // Disabled plugins — agent can enable them via enable_plugin tool
        if (disabled.length > 0) {
            lines.push('DISABLED PLUGINS (installed but not active):');
            for (const skill of disabled) {
                lines.push(`- ${skill.name} (${skill.id}) -- ${skill.description}`);
            }
            lines.push('');
            lines.push('When a disabled plugin matches the user\'s request:');
            lines.push('1. Tell the user the plugin is installed but disabled');
            lines.push('2. Call enable_plugin(plugin_id) to activate it — do NOT ask the user to enable it manually');
            lines.push('3. After enabling, read its .skill.md file to learn the available commands');
            lines.push('4. Use the appropriate tool (execute_recipe for CLI tools, execute_command for native, call_plugin_api for APIs)');
            lines.push('NEVER ask the user to manually enable a plugin. NEVER fall back to a built-in tool.');
        }

        return lines.join('\n');
    }

    /**
     * Update skill toggles (called when settings change).
     */
    updateToggles(toggles: Record<string, boolean>): void {
        this.skillToggles = toggles;
    }
}
