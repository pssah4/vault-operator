import { describe, it, expect, vi } from 'vitest';
import { FrontmatterWriter } from '../FrontmatterWriter';

/**
 * FrontmatterWriter-Unit-Tests mit Mock-App. processFrontMatter wird
 * gemockt um die Patch-Logik (add vs replace vs skip) ohne Vault zu
 * verifizieren.
 */

interface MockFrontmatter {
    [key: string]: unknown;
}

function makeMockApp(initialFrontmatter: MockFrontmatter, opts?: { throwInProcess?: boolean }) {
    const fm = { ...initialFrontmatter };
    const processFrontMatter = vi.fn(
        async (_file: unknown, fn: (fm: Record<string, unknown>) => void) => {
            if (opts?.throwInProcess) throw new Error('synthetic-error');
            fn(fm);
        },
    );
    return {
        app: { fileManager: { processFrontMatter } } as never,
        getFm: () => fm,
        spy: processFrontMatter,
    };
}

describe('FrontmatterWriter', () => {
    it('adds missing fields without overwriting existing ones', async () => {
        const mock = makeMockApp({ existing: 'keep-me' });
        const writer = new FrontmatterWriter(mock.app, { storageMode: 'global' });

        const result = await writer.write({} as never, {
            existing: { value: 'overwrite-attempt' },
            newProp: { value: 'added' },
        });

        expect(result.written).toBe(true);
        expect(result.fieldsAdded).toEqual(['newProp']);
        expect(result.fieldsReplaced).toEqual([]);
        expect(mock.getFm()).toEqual({ existing: 'keep-me', newProp: 'added' });
    });

    it('replaces existing field when replace=true', async () => {
        const mock = makeMockApp({ summary: 'old' });
        const writer = new FrontmatterWriter(mock.app, { storageMode: 'global' });

        const result = await writer.write({} as never, {
            summary: { value: 'new', replace: true },
        });

        expect(result.written).toBe(true);
        expect(result.fieldsReplaced).toEqual(['summary']);
        expect(result.fieldsAdded).toEqual([]);
        expect(mock.getFm()).toEqual({ summary: 'new' });
    });

    it('returns skippedReason no-change when nothing to do', async () => {
        const mock = makeMockApp({ summary: 'kept' });
        const writer = new FrontmatterWriter(mock.app, { storageMode: 'global' });

        const result = await writer.write({} as never, {
            summary: { value: 'attempt' }, // no replace
        });

        expect(result.written).toBe(false);
        expect(result.skippedReason).toBe('no-change');
    });

    it('captures error and returns skippedReason error', async () => {
        const mock = makeMockApp({}, { throwInProcess: true });
        const writer = new FrontmatterWriter(mock.app, { storageMode: 'global' });

        const result = await writer.write({} as never, {
            x: { value: 1 },
        });

        expect(result.written).toBe(false);
        expect(result.skippedReason).toBe('error');
        expect(result.error).toBe('synthetic-error');
    });

    it('AUDIT-014 M-1: rejects __proto__ property name', async () => {
        const mock = makeMockApp({});
        const writer = new FrontmatterWriter(mock.app, { storageMode: 'global' });

        const result = await writer.write({} as never, {
            __proto__: { value: { polluted: true } },
            normalProp: { value: 'ok' },
        });
        expect(result.fieldsAdded).toEqual(['normalProp']);
        // proto-Pollution-Check: bestaetigt dass globaler Object.prototype nicht polluted
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('AUDIT-014 M-1: rejects constructor and prototype property names', async () => {
        const mock = makeMockApp({});
        const writer = new FrontmatterWriter(mock.app, { storageMode: 'global' });

        const result = await writer.write({} as never, {
            constructor: { value: 'evil' },
            prototype: { value: 'evil' },
            allowed: { value: 'safe' },
        });
        expect(result.fieldsAdded).toEqual(['allowed']);
    });

    it('preserves null and undefined as missing (overrides)', async () => {
        const mock = makeMockApp({ summary: null, tags: undefined });
        const writer = new FrontmatterWriter(mock.app, { storageMode: 'global' });

        const result = await writer.write({} as never, {
            summary: { value: 'filled' },
            tags: { value: ['a', 'b'] },
        });

        expect(result.written).toBe(true);
        expect(result.fieldsAdded.sort()).toEqual(['summary', 'tags']);
    });
});
