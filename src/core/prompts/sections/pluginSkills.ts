/**
 * Plugin Skills Section — System prompt block for VaultDNA plugin skills (PAS-1)
 *
 * Injects a compact list of active plugin skills + available commands
 * so the agent knows which execute_command IDs are available.
 *
 * Inserted before the manual skills section in the system prompt.
 */

export function getPluginSkillsSection(section?: string): string {
    if (!section?.trim()) return '';

    return '\n====\n\n' + section.trim();
}

/**
 * EPIC-26 / FEAT-26-06 -- lean replacement when no plugin skill has been
 * invoked in this task yet. ~30 tokens instead of the full ~5000-token
 * section. The render decision flips to the full section the moment a
 * plugin-skill tool is invoked or the user @-mentions a plugin.
 */
export function getPluginSkillsSectionLean(): string {
    return '\n====\n\nPLUGIN SKILLS: available on demand via find_tool("<plugin name>"). Ask the user which plugin to use if their request references one.\n';
}
