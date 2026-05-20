/**
 * AUDIT-FEAT-29-06 L-1 unit tests for assertSafePathSegment.
 *
 * Shared whitelist-based guard for path segments that come from
 * user-controllable input (plugin IDs, skill names, script names).
 * RED first -- the helper does not exist yet.
 */

import { describe, it, expect } from 'vitest';
import { assertSafePathSegment, isSafePathSegment } from '../safePathName';

describe('assertSafePathSegment / isSafePathSegment (AUDIT-FEAT-29-06 L-1)', () => {
    it('accepts alphanumeric names', () => {
        expect(() => assertSafePathSegment('hello', 'test')).not.toThrow();
        expect(() => assertSafePathSegment('Hello123', 'test')).not.toThrow();
        expect(isSafePathSegment('hello')).toBe(true);
    });

    it('accepts names with dashes, underscores and dots', () => {
        expect(() => assertSafePathSegment('my-skill', 'test')).not.toThrow();
        expect(() => assertSafePathSegment('skill_name', 'test')).not.toThrow();
        expect(() => assertSafePathSegment('plugin.with.dots', 'test')).not.toThrow();
        expect(() => assertSafePathSegment('foo-bar_baz.123', 'test')).not.toThrow();
    });

    it('rejects leading dot', () => {
        expect(() => assertSafePathSegment('.hidden', 'test')).toThrow(/path-traversal guard/i);
        expect(isSafePathSegment('.hidden')).toBe(false);
    });

    it('rejects leading dash', () => {
        expect(() => assertSafePathSegment('-leading', 'test')).toThrow(/path-traversal guard/i);
    });

    it('rejects path-traversal sequences', () => {
        expect(() => assertSafePathSegment('../malicious', 'test')).toThrow(/path-traversal guard/i);
        expect(() => assertSafePathSegment('..', 'test')).toThrow(/path-traversal guard/i);
    });

    it('rejects forward and backward slashes', () => {
        expect(() => assertSafePathSegment('foo/bar', 'test')).toThrow(/path-traversal guard/i);
        expect(() => assertSafePathSegment('foo\\bar', 'test')).toThrow(/path-traversal guard/i);
    });

    it('rejects absolute paths', () => {
        expect(() => assertSafePathSegment('/etc/passwd', 'test')).toThrow(/path-traversal guard/i);
    });

    it('rejects empty string', () => {
        expect(() => assertSafePathSegment('', 'test')).toThrow(/path-traversal guard/i);
        expect(isSafePathSegment('')).toBe(false);
    });

    it('rejects oversized names (>200 chars)', () => {
        const long = 'a'.repeat(201);
        expect(() => assertSafePathSegment(long, 'test')).toThrow(/path-traversal guard/i);
    });

    it('accepts names up to exactly 200 chars', () => {
        const max = 'a'.repeat(200);
        expect(() => assertSafePathSegment(max, 'test')).not.toThrow();
    });

    it('includes the label in the error message', () => {
        expect(() => assertSafePathSegment('../bad', 'plugin id')).toThrow(/plugin id/);
        expect(() => assertSafePathSegment('../bad', 'script name')).toThrow(/script name/);
    });

    it('includes the rejected value (JSON-encoded) in the error message', () => {
        try {
            assertSafePathSegment('../malicious', 'test');
            expect.fail('expected throw');
        } catch (e) {
            expect((e as Error).message).toContain('"../malicious"');
        }
    });
});
