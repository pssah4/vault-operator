/**
 * Regression-tests for FIX-06-01-01 (parseDocument plugin-ref drift).
 *
 * Pins two invariants:
 *   1. parsePdf without `plugin.bundleLoader` returns the NOT_INSTALLED
 *      placeholder. (current intentional fallback)
 *   2. parsePdf delegates the binary blob to `plugin.bundleLoader
 *      .loadPdfjsBundle()` when the loader is available. (the path the
 *      drift bypassed before the fix -- five call-sites used to pass no
 *      plugin and silently landed in branch 1.)
 *
 * The compile-time guarantee that all call-sites pass a plugin instance
 * is enforced by the required `plugin` parameter on parsePdf and
 * parseDocument; this file pins the runtime behaviour that the type
 * system protects.
 */

import { describe, it, expect, vi } from 'vitest';
import { parsePdf } from '../PdfParser';
import type ObsidianAgentPlugin from '../../../../main';

function makeBuffer(text = 'data'): ArrayBuffer {
    return new TextEncoder().encode(text).buffer;
}

function makePluginWithoutLoader(): ObsidianAgentPlugin {
    return {} as ObsidianAgentPlugin;
}

function makePluginWithLoader(loadPdfjsBundle: () => Promise<unknown>): ObsidianAgentPlugin {
    return {
        bundleLoader: { loadPdfjsBundle },
    } as unknown as ObsidianAgentPlugin;
}

describe('parsePdf (FIX-06-01-01)', () => {
    it('returns NOT_INSTALLED placeholder when plugin has no bundleLoader', async () => {
        const result = await parsePdf(makeBuffer(), makePluginWithoutLoader());
        expect(result.text).toContain('PDF Parser is not installed');
        expect(result.metadata.format).toBe('pdf');
        expect(result.images).toEqual([]);
    });

    it('returns NOT_INSTALLED placeholder when bundleLoader.loadPdfjsBundle() returns null', async () => {
        const loadPdfjsBundle = vi.fn().mockResolvedValue(null);
        const result = await parsePdf(makeBuffer(), makePluginWithLoader(loadPdfjsBundle));
        expect(loadPdfjsBundle).toHaveBeenCalledOnce();
        expect(result.text).toContain('PDF Parser is not installed');
    });

    it('calls bundleLoader.loadPdfjsBundle() exactly once when invoked', async () => {
        const loadPdfjsBundle = vi.fn().mockResolvedValue(null);
        await parsePdf(makeBuffer(), makePluginWithLoader(loadPdfjsBundle));
        expect(loadPdfjsBundle).toHaveBeenCalledOnce();
    });
});
