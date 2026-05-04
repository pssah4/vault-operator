import { describe, it, expect } from 'vitest';
import { UriResolver } from '../UriResolver';

describe('UriResolver (PLAN-004 task 7)', () => {
    const r = new UriResolver();

    describe('external schemes', () => {
        it('parses vault:// URIs', () => {
            const p = r.parse('vault://Notes/Foo.md');
            expect(p).toEqual({
                kind: 'external', scheme: 'vault',
                uri: 'vault://Notes/Foo.md', path: 'Notes/Foo.md',
            });
        });

        it('parses file://, http://, https://, cloud://', () => {
            for (const [scheme, rest] of [
                ['file', '/abs/path/x.txt'],
                ['http', 'example.com/page'],
                ['https', 'docs.example.com/api'],
                ['cloud', 'notion/abc-123'],
            ] as const) {
                const p = r.parse(`${scheme}://${rest}`);
                expect(p.kind).toBe('external');
                if (p.kind === 'external') {
                    expect(p.scheme).toBe(scheme);
                    expect(p.path).toBe(rest);
                }
            }
        });
    });

    describe('internal schemes', () => {
        it('parses session://, episode://, entity://, thread://', () => {
            for (const scheme of ['session', 'episode', 'entity', 'thread'] as const) {
                const p = r.parse(`${scheme}://abc-123`);
                expect(p.kind).toBe('internal');
                if (p.kind === 'internal') {
                    expect(p.scheme).toBe(scheme);
                    expect(p.id).toBe('abc-123');
                }
            }
        });

        it('parses fact:<id> with single colon', () => {
            const p = r.parse('fact:42');
            expect(p).toEqual({
                kind: 'internal', scheme: 'fact', uri: 'fact:42', id: '42',
            });
        });

        it('does not accept fact://<id> (double slash) -- single colon is canonical', () => {
            const p = r.parse('fact://42');
            // fact is not in the double-slash set, so this is unknown
            expect(p.kind).toBe('unknown');
        });
    });

    describe('unknown / malformed', () => {
        it('returns kind=unknown for arbitrary schemes', () => {
            const p = r.parse('weirdscheme://blah');
            expect(p.kind).toBe('unknown');
        });

        it('returns kind=unknown for empty / non-string input', () => {
            expect(r.parse('').kind).toBe('unknown');
            expect(r.parse(null as unknown as string).kind).toBe('unknown');
            expect(r.parse(undefined as unknown as string).kind).toBe('unknown');
        });

        it('returns kind=unknown for raw strings without scheme', () => {
            expect(r.parse('not-a-uri').kind).toBe('unknown');
            expect(r.parse('just/a/path.md').kind).toBe('unknown');
        });
    });

    describe('schemeOf', () => {
        it('returns the lowercased scheme or undefined', () => {
            expect(r.schemeOf('VAULT://x.md')).toBe('vault');
            expect(r.schemeOf('fact:42')).toBe('fact');
            expect(r.schemeOf('weird://x')).toBeUndefined();
            expect(r.schemeOf('not-a-uri')).toBeUndefined();
        });
    });

    describe('builders', () => {
        it('UriResolver.vault / fact / session / episode / entity / thread produce canonical URIs', () => {
            expect(UriResolver.vault('Notes/X.md')).toBe('vault://Notes/X.md');
            expect(UriResolver.fact(42)).toBe('fact:42');
            expect(UriResolver.session('s1')).toBe('session://s1');
            expect(UriResolver.episode('e1')).toBe('episode://e1');
            expect(UriResolver.entity('UniCredit')).toBe('entity://UniCredit');
            expect(UriResolver.thread('t1')).toBe('thread://t1');
        });
    });
});
