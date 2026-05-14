import { describe, it, expect } from 'vitest';
import { AdapterRegistry } from '../AdapterRegistry';
import type { SourceAdapter, ResolvedSource } from '../SourceAdapter';

class StubAdapter implements SourceAdapter {
    resolved: string[] = [];
    constructor(
        public readonly scheme: string,
        private readonly handler: (uri: string) => boolean = () => true,
        private readonly payload: ResolvedSource | null = null,
    ) {}
    canHandle(uri: string) { return this.handler(uri); }
    async resolve(uri: string): Promise<ResolvedSource | null> {
        this.resolved.push(uri);
        return this.payload ?? { uri, scheme: this.scheme, content: 'stub' };
    }
}

describe('AdapterRegistry (PLAN-004 task 7)', () => {
    it('starts empty', () => {
        const reg = new AdapterRegistry();
        expect(reg.listSchemes()).toEqual([]);
        expect(reg.has('vault')).toBe(false);
    });

    it('registers and looks up adapters by scheme (case-insensitive)', () => {
        const reg = new AdapterRegistry();
        const a = new StubAdapter('vault');
        reg.register(a);
        expect(reg.has('Vault')).toBe(true);
        expect(reg.get('VAULT')).toBe(a);
        expect(reg.listSchemes()).toEqual(['vault']);
    });

    it('rejects an empty scheme', () => {
        const reg = new AdapterRegistry();
        expect(() => reg.register({ scheme: '' } as SourceAdapter)).toThrow(/non-empty/);
    });

    it('rejects double registration of the same scheme (use override())', () => {
        const reg = new AdapterRegistry();
        reg.register(new StubAdapter('vault'));
        expect(() => reg.register(new StubAdapter('vault'))).toThrow(/already registered/);
    });

    it('override replaces an existing adapter', () => {
        const reg = new AdapterRegistry();
        const first = new StubAdapter('vault');
        const second = new StubAdapter('vault');
        reg.register(first);
        reg.override(second);
        expect(reg.get('vault')).toBe(second);
    });

    it('unregister removes the adapter', () => {
        const reg = new AdapterRegistry();
        reg.register(new StubAdapter('vault'));
        reg.unregister('vault');
        expect(reg.has('vault')).toBe(false);
    });

    describe('resolve', () => {
        it('routes to the adapter matching the scheme', async () => {
            const reg = new AdapterRegistry();
            const adapter = new StubAdapter('vault');
            reg.register(adapter);
            const result = await reg.resolve('vault://Notes/X.md');
            expect(result).toEqual({ uri: 'vault://Notes/X.md', scheme: 'vault', content: 'stub' });
            expect(adapter.resolved).toEqual(['vault://Notes/X.md']);
        });

        it('returns null when no adapter is registered for the scheme', async () => {
            const reg = new AdapterRegistry();
            expect(await reg.resolve('vault://Notes/X.md')).toBeNull();
        });

        it('returns null when adapter.canHandle says no', async () => {
            const reg = new AdapterRegistry();
            // AUDIT-025 H-3 (GitHub code-scanning alert #68,
            // js/incomplete-url-substring-sanitization): match the host via
            // URL().hostname instead of String.startsWith. The .startsWith
            // form let a hostile URL like https://denied.com.allowed.com/x
            // slip through; the URL-parser form does an exact hostname check.
            const adapter = new StubAdapter('https', uri => {
                try { return new URL(uri).hostname === 'allowed.com'; }
                catch { return false; }
            });
            reg.register(adapter);
            expect(await reg.resolve('https://denied.com/x')).toBeNull();
            expect(adapter.resolved).toEqual([]); // canHandle gated it
        });

        it('returns null for unknown URIs without throwing', async () => {
            const reg = new AdapterRegistry();
            expect(await reg.resolve('weirdscheme://x')).toBeNull();
            expect(await reg.resolve('not-a-uri')).toBeNull();
            expect(await reg.resolve('')).toBeNull();
        });

        it('routes fact:<id> single-colon URIs correctly', async () => {
            const reg = new AdapterRegistry();
            const adapter = new StubAdapter('fact');
            reg.register(adapter);
            const result = await reg.resolve('fact:42');
            expect(result?.uri).toBe('fact:42');
        });
    });
});
