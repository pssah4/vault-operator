/**
 * FIX-23-09-03 -- the relay path (Cloudflare Worker -> RelayClient ->
 * McpBridge) must forward MCP prompts/list and prompts/get the same way
 * the local HTTP path does, so claude.ai connector users can discover
 * and select the vault-operator-context prompt after FIX-23-09-01
 * removed the silent auto-injection.
 */

import { describe, it, expect, vi } from 'vitest';
import { dispatchRelayMethod } from '../RelayClient';
import type ObsidianAgentPlugin from '../../main';

function makePlugin(): {
    plugin: ObsidianAgentPlugin;
    listPrompts: ReturnType<typeof vi.fn>;
    getPrompt: ReturnType<typeof vi.fn>;
    buildInitializeResponse: ReturnType<typeof vi.fn>;
} {
    const listPrompts = vi.fn(() => ({ prompts: [{ name: 'vault-operator-context', description: 'd1' }] }));
    const getPrompt = vi.fn((name: string | undefined) => ({
        messages: [{ role: 'user', content: { type: 'text', text: `prompt:${name ?? 'default'}` } }],
    }));
    const buildInitializeResponse = vi.fn((requested?: string) => ({
        protocolVersion: requested === '2025-06-18' ? '2025-06-18' : '2025-03-26',
        capabilities: { tools: {}, prompts: {}, resources: {} },
        serverInfo: { name: 'Vault Operator', version: '1.0.0' },
        instructions: 'neutral instructions',
    }));
    const plugin = {
        mcpBridge: { listPrompts, getPrompt, buildInitializeResponse },
    } as unknown as ObsidianAgentPlugin;
    return { plugin, listPrompts, getPrompt, buildInitializeResponse };
}

describe('dispatchRelayMethod (FIX-23-09-03)', () => {
    it('routes prompts/list to mcpBridge.listPrompts()', async () => {
        const { plugin, listPrompts } = makePlugin();
        const result = await dispatchRelayMethod(plugin, 'prompts/list', undefined);
        expect(listPrompts).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ prompts: [{ name: 'vault-operator-context', description: 'd1' }] });
    });

    it('routes prompts/get to mcpBridge.getPrompt(name) and forwards the name param', async () => {
        const { plugin, getPrompt } = makePlugin();
        const result = await dispatchRelayMethod(plugin, 'prompts/get', { name: 'vault-operator-context' });
        expect(getPrompt).toHaveBeenCalledWith('vault-operator-context');
        expect(result).toEqual({
            messages: [{ role: 'user', content: { type: 'text', text: 'prompt:vault-operator-context' } }],
        });
    });

    it('routes prompts/get without name to getPrompt(undefined) (matches local HTTP behaviour)', async () => {
        const { plugin, getPrompt } = makePlugin();
        const result = await dispatchRelayMethod(plugin, 'prompts/get', undefined);
        expect(getPrompt).toHaveBeenCalledWith(undefined);
        expect(result).toEqual({
            messages: [{ role: 'user', content: { type: 'text', text: 'prompt:default' } }],
        });
    });

    it('routes prompts/get with non-string name to getPrompt(undefined) (defensive coercion)', async () => {
        const { plugin, getPrompt } = makePlugin();
        const result = await dispatchRelayMethod(plugin, 'prompts/get', { name: 123 as unknown as string });
        expect(getPrompt).toHaveBeenCalledWith(undefined);
        expect(result).toEqual({
            messages: [{ role: 'user', content: { type: 'text', text: 'prompt:default' } }],
        });
    });

    it('routes initialize to mcpBridge.buildInitializeResponse with the client-requested protocol version', async () => {
        const { plugin, buildInitializeResponse } = makePlugin();
        const result = await dispatchRelayMethod(plugin, 'initialize', { protocolVersion: '2025-06-18' });
        expect(buildInitializeResponse).toHaveBeenCalledWith('2025-06-18');
        expect((result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18');
        expect((result as { instructions: string }).instructions).toBe('neutral instructions');
    });

    it('routes initialize without protocolVersion to buildInitializeResponse(undefined)', async () => {
        const { plugin, buildInitializeResponse } = makePlugin();
        const result = await dispatchRelayMethod(plugin, 'initialize', undefined);
        expect(buildInitializeResponse).toHaveBeenCalledWith(undefined);
        expect((result as { protocolVersion: string }).protocolVersion).toBe('2025-03-26');
    });

    it('still falls back to {} for unknown methods', async () => {
        const { plugin } = makePlugin();
        const result = await dispatchRelayMethod(plugin, 'totally/unknown', undefined);
        expect(result).toEqual({});
    });
});
