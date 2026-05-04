/**
 * AUDIT-015 Eval-Coverage: recallMemory MCP-Handler.
 */

import { describe, it, expect } from 'vitest';
import { handleRecallMemory } from '../recallMemory';
import type ObsidianAgentPlugin from '../../../main';

function plugin(open: boolean) {
    return {
        memoryDB: { isOpen: () => open },
    } as unknown as ObsidianAgentPlugin;
}

describe('handleRecallMemory (AUDIT-015 Eval-Coverage)', () => {
    it('rejects empty query', async () => {
        const r = await handleRecallMemory(plugin(true), { query: '   ' });
        expect(r.isError).toBe(true);
    });

    it('reports memory DB not available when closed', async () => {
        const r = await handleRecallMemory(plugin(false), { query: 'x' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toMatch(/not available/i);
    });

    describe('AUDIT-015 M-3: strictSourceIsolation', () => {
        function strictPlugin() {
            return {
                memoryDB: { isOpen: () => true, getDB: () => ({ exec: () => [] }) },
                settings: { memory: { crossSurface: { strictSourceIsolation: true } } },
            } as unknown as Parameters<typeof handleRecallMemory>[0];
        }

        it('rejects call without source_interface when strict isolation is on', async () => {
            const r = await handleRecallMemory(strictPlugin(), { query: 'x' });
            expect(r.isError).toBe(true);
            expect(r.content[0].text).toMatch(/strictSourceIsolation/);
        });

        it('accepts call WITH source_interface when strict isolation is on', async () => {
            const r = await handleRecallMemory(strictPlugin(), { query: 'x', source_interface: 'claude-ai' });
            // No error -- empty result is fine
            expect(r.content[0].text).not.toMatch(/strictSourceIsolation/);
        });
    });
});
