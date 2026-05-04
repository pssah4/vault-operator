/**
 * AUDIT-015 Eval-Coverage: saveToMemory MCP-Handler.
 */

import { describe, it, expect, vi } from 'vitest';
import { handleSaveToMemory } from '../saveToMemory';
import type ObsidianAgentPlugin from '../../../main';
import type { Fact } from '../../../core/memory/FactStore';

function makePluginMock() {
    const inserted: Array<Partial<Fact>> = [];
    const memDB = {
        isOpen: () => true,
        getDB: () => null,
        markDirty: () => undefined,
        save: vi.fn(),
    };
    // FactStore patchen waere komplex -- hier mocken wir den
    // FactStore-Insert-Pfad ueber das Plugin direkt nicht, sondern
    // injizieren ein Stub-FactStore via test-only Klasse.
    return { plugin: { memoryDB: memDB } as unknown as ObsidianAgentPlugin, inserted };
}

describe('handleSaveToMemory (AUDIT-015 Eval-Coverage)', () => {
    it('rejects empty content', async () => {
        const { plugin } = makePluginMock();
        const r = await handleSaveToMemory(plugin, { content: '   ' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toMatch(/required/i);
    });

    it('rejects content > 4000 chars', async () => {
        const { plugin } = makePluginMock();
        const big = 'x'.repeat(4001);
        const r = await handleSaveToMemory(plugin, { content: big });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toMatch(/4000/);
    });

    it('rejects when memoryDB not available', async () => {
        const plugin = { memoryDB: null } as unknown as ObsidianAgentPlugin;
        const r = await handleSaveToMemory(plugin, { content: 'hello' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toMatch(/not available/i);
    });
});
