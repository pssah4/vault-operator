/**
 * AUDIT-013 H-4 + H-5 regression tests for the MCP bridge security layer.
 */

import { describe, it, expect } from 'vitest';
import { wrapVaultContentForMcp, timingSafeStringEqual } from '../McpBridge';

describe('wrapVaultContentForMcp (AUDIT-013 H-4)', () => {
    it('wraps content in a vault-content tag', () => {
        const out = wrapVaultContentForMcp('Note.md', 'hello world');
        expect(out).toContain('<vault-content path="Note.md" trust="user-data">');
        expect(out).toContain('hello world');
        expect(out).toContain('</vault-content>');
    });

    it('escapes path attribute to prevent attribute injection', () => {
        const out = wrapVaultContentForMcp('Note "with quotes".md', 'x');
        expect(out).toContain('Note &quot;with quotes&quot;.md');
        expect(out).not.toContain('Note "with quotes".md');
    });

    it('escapes < > & in path', () => {
        const out = wrapVaultContentForMcp('a&b<c>.md', 'x');
        expect(out).toContain('a&amp;b&lt;c&gt;.md');
    });

    it('does not escape content body (content is the inner text node)', () => {
        // Content can contain markdown / arbitrary text; the boundary is a
        // structural marker for the downstream agent, not an HTML safety net.
        const out = wrapVaultContentForMcp('a.md', 'Body with <tags> & "quotes"');
        expect(out).toContain('Body with <tags> & "quotes"');
    });

    it('handles multiline content', () => {
        const out = wrapVaultContentForMcp('a.md', 'line 1\nline 2\nline 3');
        expect(out.split('\n').length).toBeGreaterThanOrEqual(5);
    });
});

describe('timingSafeStringEqual (AUDIT-013 H-5)', () => {
    it('returns true for matching strings', () => {
        const t = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';
        expect(timingSafeStringEqual(t, t)).toBe(true);
    });

    it('returns false for different strings of same length', () => {
        const a = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';
        const b = 'a1b2c3d4-e5f6-7890-abcd-ef012345678X';
        expect(timingSafeStringEqual(a, b)).toBe(false);
    });

    it('returns false for length mismatch', () => {
        expect(timingSafeStringEqual('short', 'much-longer-token')).toBe(false);
    });

    it('returns false for empty expected (misconfiguration)', () => {
        expect(timingSafeStringEqual('', '')).toBe(false);
        expect(timingSafeStringEqual('x', '')).toBe(false);
        expect(timingSafeStringEqual('', 'y')).toBe(false);
    });

    it('handles unicode-safe utf-8 byte comparison', () => {
        // Two strings that differ in encoding shape should still compare correctly
        const t = 'token-äöü-ß';
        expect(timingSafeStringEqual(t, t)).toBe(true);
        expect(timingSafeStringEqual(t, 'token-äöü-x')).toBe(false);
    });
});
