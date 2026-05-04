/**
 * AUDIT-015 Eval-Coverage: updateMemory (V1 deprecated, routes to v2).
 */

import { describe, it, expect, vi } from 'vitest';
import { handleUpdateMemory } from '../updateMemory';
import type ObsidianAgentPlugin from '../../../main';

function plugin(opts: { open?: boolean; telemetry?: boolean } = {}) {
    const calls: Array<Record<string, unknown>> = [];
    return {
        plugin: {
            memoryDB: { isOpen: () => opts.open ?? false },
            memoryV2Telemetry: opts.telemetry !== false ? {
                legacyUpdateMemory: vi.fn(async (payload: Record<string, unknown>) => {
                    calls.push(payload);
                }),
            } : null,
        } as unknown as ObsidianAgentPlugin,
        calls,
    };
}

describe('handleUpdateMemory (V1-Deprecation, AUDIT-015 Eval-Coverage)', () => {
    it('rejects unknown category', async () => {
        const { plugin: p } = plugin();
        const r = await handleUpdateMemory(p, { category: 'unknown', content: 'x' });
        expect(r.isError).toBe(true);
        expect(r.content[0].text).toMatch(/category must be one of/);
    });

    it('rejects missing content', async () => {
        const { plugin: p } = plugin();
        const r = await handleUpdateMemory(p, { category: 'profile', content: '   ' });
        expect(r.isError).toBe(true);
    });

    it('records legacy-call telemetry on every invocation', async () => {
        const { plugin: p, calls } = plugin();
        // Memory not available -> save_to_memory will reject, but telemetry
        // is still fired so Sebastian can see legacy-tool usage.
        await handleUpdateMemory(p, {
            category: 'profile',
            content: 'something',
            source_interface: 'claude-ai',
        });
        expect(calls).toHaveLength(1);
        expect(calls[0].category).toBe('profile');
        expect(calls[0].sourceInterface).toBe('claude-ai');
    });
});
