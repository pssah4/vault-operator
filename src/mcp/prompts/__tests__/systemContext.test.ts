/**
 * FIX-23-09-01 -- guard against indirect prompt-injection on the MCP surface.
 *
 * The buildPrompts() output is what `prompts/get` returns to external MCP
 * clients (Claude Desktop, Claude.ai connector mode). It must stay neutral:
 * no urgency wording, no soul.md persona leak, no user-memory dump, no
 * hardcoded personal names.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildPrompts } from '../systemContext';
import type ObsidianAgentPlugin from '../../../main';

function makePlugin(overrides: Record<string, unknown> = {}): ObsidianAgentPlugin {
    const base = {
        memoryService: {
            readFile: vi.fn(async (name: string) => {
                if (name === 'soul.md') {
                    return '# SOUL\nI am Obsilo. Sebastian likes coffee at 7am.';
                }
                return '';
            }),
            loadMemoryFiles: vi.fn(async () => ({
                'user-profile.md': 'Sebastian prefers German conversations.',
            })),
            buildMemoryContext: vi.fn(() => 'PROFILE: Sebastian prefers German.'),
        },
        rulesLoader: {
            discoverRules: vi.fn(async () => ['Keep answers concise.']),
        },
        skillsManager: {
            discoverSkills: vi.fn(async () => [
                { name: 'office-workflow', description: 'PPTX pipeline.' },
            ]),
        },
    };
    return { ...base, ...overrides } as unknown as ObsidianAgentPlugin;
}

function extractText(messages: Awaited<ReturnType<typeof buildPrompts>>): string {
    return messages
        .map(m => (typeof m.content === 'object' ? (m.content as { text?: string }).text ?? '' : ''))
        .join('\n');
}

describe('buildPrompts (MCP systemContext)', () => {
    it('does not contain urgency words (CRITICAL, NON-NEGOTIABLE, MUST, ALWAYS, MANDATORY)', async () => {
        const text = extractText(await buildPrompts(makePlugin()));
        expect(text).not.toMatch(/\bCRITICAL\b/);
        expect(text).not.toMatch(/\bNON-NEGOTIABLE\b/);
        expect(text).not.toMatch(/\bMUST\b/);
        expect(text).not.toMatch(/\bALWAYS\b/);
        expect(text).not.toMatch(/\bMANDATORY\b/);
        expect(text).not.toMatch(/FINAL action/i);
        expect(text).not.toMatch(/even if the user says goodbye/i);
    });

    it('does not embed soul.md content as Agent Identity', async () => {
        const text = extractText(await buildPrompts(makePlugin()));
        expect(text).not.toMatch(/Agent Identity/i);
        expect(text).not.toMatch(/I am Obsilo/);
        expect(text).not.toMatch(/likes coffee at 7am/);
    });

    it('does not embed the user memory profile dump', async () => {
        const text = extractText(await buildPrompts(makePlugin()));
        expect(text).not.toMatch(/User Memory/i);
        expect(text).not.toMatch(/PROFILE: Sebastian/);
    });

    it('does not leak personal names', async () => {
        const text = extractText(await buildPrompts(makePlugin()));
        expect(text).not.toMatch(/Sebastian/);
    });

    it('still exposes the neutral skills section so users can opt into context', async () => {
        const text = extractText(await buildPrompts(makePlugin()));
        expect(text).toMatch(/Available Skills/);
        expect(text).toMatch(/office-workflow/);
    });

    it('returns a valid prompt array when memoryService is missing', async () => {
        const plugin = {
            rulesLoader: undefined,
            skillsManager: undefined,
            memoryService: undefined,
        } as unknown as ObsidianAgentPlugin;
        const out = await buildPrompts(plugin);
        expect(Array.isArray(out)).toBe(true);
        expect(out.length).toBeGreaterThan(0);
    });
});
