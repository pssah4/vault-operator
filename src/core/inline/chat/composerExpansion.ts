/**
 * composerExpansion -- shared slash/prompt/workflow expansion for the
 * Sidebar AND the InlineChatPanel free-chat surface (EPIC-33 parity).
 *
 * Extracted from AgentSidebarView.handleSendMessage (lines 1575-1638)
 * so both surfaces get identical behaviour:
 *   '/skill-slug'  -> `<explicit_instructions skill="...">body</...>` + tail user text
 *   '#prompt-slug' -> resolvePromptContent(template, { userInput, activeFile })
 *   '§workflow-slug' -> workflowLoader.processSlashCommand(/slug ...)
 *
 * Returns the expanded text or null when no prefix matched / no
 * resolution succeeded -- caller then sends the raw input.
 */

import type ObsidianAgentPlugin from '../../../main';

export interface ExpansionContext {
    text: string;
    activeFilePath?: string;
    activeFileName?: string;
}

export async function expandComposerPrefix(
    plugin: ObsidianAgentPlugin,
    ctx: ExpansionContext,
): Promise<string | null> {
    const { text } = ctx;
    if (text.length === 0) return null;
    if (/^[/#§]/.test(text) === false) return null;

    const prefix = text[0];
    const spaceIdx = text.indexOf(' ');
    const slug = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
    const rest = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();
    const activeFileTail = ctx.activeFilePath !== undefined && ctx.activeFilePath.length > 0
        ? `\n\n<context>\nActive file in editor: ${ctx.activeFilePath}\n</context>`
        : '';

    if (prefix === '/') {
        const skillLoader = (plugin as unknown as {
            selfAuthoredSkillLoader?: { getAllSkills: () => Array<{ name: string; body: string }> };
        }).selfAuthoredSkillLoader;
        if (skillLoader === undefined) return null;
        const skills = skillLoader.getAllSkills();
        const matched = skills.find(s => slugifySkillName(s.name) === slug);
        if (matched === undefined) return null;
        const parts = [
            `<explicit_instructions skill="${matched.name}">`,
            matched.body,
            '</explicit_instructions>',
        ];
        if (rest.length > 0) parts.push('', rest);
        return parts.join('\n') + activeFileTail;
    }

    if (prefix === '#') {
        const prompt = (plugin.settings.customPrompts ?? []).find(
            (p: { slug: string; enabled?: boolean }) => p.slug === slug && p.enabled !== false,
        );
        if (prompt === undefined) return null;
        try {
            const mod = await import('../../context/SupportPrompts');
            const resolved = mod.resolvePromptContent(prompt.content, {
                userInput: rest,
                activeFile: ctx.activeFileName,
            });
            return resolved + activeFileTail;
        } catch (e) {
            console.debug('[composerExpansion] resolvePromptContent failed:', e);
            return null;
        }
    }

    if (prefix === '§') {
        const workflowLoader = (plugin as unknown as {
            workflowLoader?: { processSlashCommand: (cmd: string, toggles: Record<string, boolean>) => Promise<string> };
        }).workflowLoader;
        if (workflowLoader === undefined) return null;
        const reshaped = `/${slug}${rest.length > 0 ? ' ' + rest : ''}`;
        try {
            const out = await workflowLoader.processSlashCommand(
                reshaped,
                (plugin.settings as { workflowToggles?: Record<string, boolean> }).workflowToggles ?? {},
            );
            if (out !== reshaped) return out + activeFileTail;
        } catch (e) {
            console.debug('[composerExpansion] workflow processSlashCommand failed:', e);
        }
    }

    return null;
}

/** Same slugify rule as AutocompleteHandler.slugifySkillName. */
export function slugifySkillName(name: string): string {
    return name.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}
