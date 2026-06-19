import { describe, it, expect, vi } from 'vitest';

import {
    FreshnessFrontmatterPatcher,
    FRESHNESS_ALLOWLIST,
    filterToAllowlist,
} from '../FreshnessFrontmatterPatcher';
import type {
    FrontmatterWriter,
} from '../../ingest/FrontmatterWriter';

/**
 * IMP-20-06-01 W4-T1.
 *
 * Pin the verifier-write allowlist down to a single property name.
 * Any future refactor that widens the patch must update both the
 * allowlist and this test.
 */

describe('FreshnessFrontmatterPatcher', () => {
    it('exposes a single-property allowlist', () => {
        expect([...FRESHNESS_ALLOWLIST]).toEqual(['freshness']);
    });

    it('filterToAllowlist drops every key that is not `freshness`', () => {
        const filtered = filterToAllowlist({
            freshness: { value: 'outdated', replace: true },
            verdict: { value: 'widerspricht' },
            confidence: { value: 0.9 },
            sources: { value: ['u'] },
        });
        expect(Object.keys(filtered)).toEqual(['freshness']);
        expect(filtered.freshness).toEqual({ value: 'outdated', replace: true });
    });

    it('buildPatch defaults to replace=true so the hint stays current', () => {
        const patcher = new FreshnessFrontmatterPatcher({} as FrontmatterWriter);
        const patch = patcher.buildPatch({ label: 'needs-review' });
        expect(patch.freshness?.replace).toBe(true);
        expect(patch.freshness?.value).toBe('needs-review');
    });

    it('writeHint calls FrontmatterWriter.write with the allowlisted patch only', async () => {
        const writeSpy = vi.fn().mockResolvedValue({
            written: true,
            fieldsAdded: ['freshness'],
            fieldsReplaced: [],
        });
        const fakeWriter = { write: writeSpy } as unknown as FrontmatterWriter;
        const patcher = new FreshnessFrontmatterPatcher(fakeWriter);

        const file = { path: 'Notes/x.md' } as unknown as Parameters<FrontmatterWriter['write']>[0];
        await patcher.writeHint(file, { label: 'outdated' });

        expect(writeSpy).toHaveBeenCalledTimes(1);
        const passedPatch = writeSpy.mock.calls[0][1];
        expect(Object.keys(passedPatch)).toEqual(['freshness']);
    });
});
