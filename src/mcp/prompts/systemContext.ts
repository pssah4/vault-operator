/**
 * MCP Prompt Builder -- Generates the obsilo-system-context prompt
 * that replaces the System Prompt in Connector mode.
 *
 * Claude receives this prompt at connection time and uses it
 * as its operating context when working with the Vault Operator vault.
 */

import type ObsidianAgentPlugin from '../../main';
import type { McpPromptMessage } from '../types';

export async function buildPrompts(plugin: ObsidianAgentPlugin): Promise<McpPromptMessage[]> {
    const sections: string[] = [];

    // Role definition
    sections.push([
        '# Vault Operator Vault Intelligence',
        '',
        'You are working with Vault Operator, an intelligence backend for an Obsidian vault.',
        'Your role: You think, plan, and decide. Vault Operator searches, reads, writes, and remembers.',
        '',
        '## Rules',
        '- ALWAYS call `get_context` first to load user profile, memory, and vault context.',
        '- Use `search_vault` for any vault research (it runs a full 4-stage pipeline internally).',
        '- Use `read_notes` to read specific files when you know the path.',
        '- Use `write_vault` to create or modify files.',
        '- When you learn something about the user, call `update_memory`.',
        '',
        '## CRITICAL: Conversation Sync',
        'At the END of EVERY conversation where you used ANY Vault Operator tool, you MUST call `sync_session`.',
        'This is NON-NEGOTIABLE. The user reviews conversations in Obsidian and needs the full history.',
        'Include the COMPLETE transcript: every user message (verbatim), your responses, and tool calls.',
        'Without sync_session, the conversation is LOST from the user\'s Obsidian history.',
        'Do this as your FINAL action before ending the conversation, even if the user says goodbye.',
    ].join('\n'));

    // Soul / Identity
    if (plugin.memoryService) {
        try {
            const soul = await plugin.memoryService.readFile('soul.md');
            if (soul.trim()) {
                sections.push(`## Agent Identity\n${soul.trim()}`);
            }
        } catch { /* non-fatal */ }
    }

    // Memory context (profile, patterns)
    if (plugin.memoryService) {
        try {
            const files = await plugin.memoryService.loadMemoryFiles();
            const ctx = plugin.memoryService.buildMemoryContext(files);
            if (ctx.trim()) {
                sections.push(`## User Memory\n${ctx.trim()}`);
            }
        } catch { /* non-fatal */ }
    }

    // User rules
    if (plugin.rulesLoader) {
        try {
            const rules = await plugin.rulesLoader.discoverRules();
            if (rules.length > 0) {
                const ruleTexts = rules.map((r: string) => `- ${r}`).join('\n');
                sections.push(`## User Rules\n${ruleTexts}`);
            }
        } catch { /* non-fatal */ }
    }

    // Skills overview
    if (plugin.skillsManager) {
        try {
            const skills = await plugin.skillsManager.discoverSkills();
            if (skills.length > 0) {
                const skillTexts = skills.map((s: { name: string; description?: string }) => `- ${s.name}: ${s.description ?? ''}`).join('\n');
                sections.push(`## Available Skills\nUse these as workflow guides:\n${skillTexts}`);
            }
        } catch { /* non-fatal */ }
    }

    return [{
        role: 'user',
        content: { type: 'text', text: sections.join('\n\n') },
    }];
}
