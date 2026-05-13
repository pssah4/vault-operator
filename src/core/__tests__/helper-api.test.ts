import { describe, it, expect, vi } from 'vitest';
import { getHelperApi } from '../helper-api';
import type { ApiHandler } from '../../api/types';
import type ObsidianAgentPlugin from '../../main';
import type { CustomModel } from '../../types/settings';

/**
 * Tests for getHelperApi (FEAT-24-07 / ADR-115).
 *
 * Verifies fail-closed-to-fallback behaviour: no helper model configured,
 * helper model disabled, helper model not in activeModels, or buildApiHandlerForModel
 * throws -- all routes return the fallback handler. Only a clean build
 * returns a fresh helper handler.
 */

// Mock the api factory so tests stay isolated from real provider modules.
vi.mock('../../api/index', () => ({
    buildApiHandlerForModel: vi.fn((model: CustomModel) => {
        if (model.name === 'broken-model') {
            throw new Error('intentional build failure for test');
        }
        // Return a uniquely-identifiable stub per model name so the test
        // can tell helper from fallback apart.
        return { __mock_model: model.name } as unknown as ApiHandler;
    }),
}));

function makeFallback(): ApiHandler {
    return { __mock_role: 'fallback' } as unknown as ApiHandler;
}

function makePlugin(helperModel: CustomModel | null): ObsidianAgentPlugin {
    return {
        getHelperModel: () => helperModel,
    } as unknown as ObsidianAgentPlugin;
}

describe('getHelperApi', () => {
    it('returns the fallback when no helper model is configured', () => {
        const fallback = makeFallback();
        const plugin = makePlugin(null);
        expect(getHelperApi(plugin, fallback)).toBe(fallback);
    });

    it('returns a freshly built handler when a helper model is configured', () => {
        const fallback = makeFallback();
        const helperModel: CustomModel = { name: 'haiku', provider: 'anthropic', enabled: true };
        const plugin = makePlugin(helperModel);
        const out = getHelperApi(plugin, fallback);
        expect(out).not.toBe(fallback);
        expect((out as unknown as { __mock_model: string }).__mock_model).toBe('haiku');
    });

    it('falls back when buildApiHandlerForModel throws', () => {
        const fallback = makeFallback();
        const brokenModel: CustomModel = { name: 'broken-model', provider: 'anthropic', enabled: true };
        const plugin = makePlugin(brokenModel);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const out = getHelperApi(plugin, fallback);
            expect(out).toBe(fallback);
            expect(warnSpy).toHaveBeenCalled();
        } finally {
            warnSpy.mockRestore();
        }
    });

    it('honours plugin.getHelperModel as the only source of truth', () => {
        // getHelperApi must NOT inspect settings directly -- it must defer
        // to plugin.getHelperModel so the disabled / not-in-activeModels
        // lookup rules live in one place. This test confirms the contract:
        // when getHelperModel returns null, we get the fallback regardless
        // of whether settings.helperModelKey is set.
        const fallback = makeFallback();
        const plugin = {
            getHelperModel: () => null,
            // settings object intentionally not exposed -- if helper-api
            // peeked here, the test would fail with "Cannot read".
        } as unknown as ObsidianAgentPlugin;
        expect(getHelperApi(plugin, fallback)).toBe(fallback);
    });
});
