/**
 * FIX-13-02-02 regression: kilo-gateway used to strict-typecheck
 * delta.content as a string and silently drop the Claude-via-gateway
 * `[{type:'text',text:...}]` array form. github-copilot already had a
 * `normalizeDeltaContent` helper for the same Claude-via-Copilot quirk.
 * This file tests the shared helper extracted into provider utils so
 * both providers stay in lockstep.
 */

import { describe, it, expect } from 'vitest';
import { normalizeDeltaContent } from '../utils/openAiContent';

describe('normalizeDeltaContent (FIX-13-02-02)', () => {
    it('passes a plain string through unchanged', () => {
        expect(normalizeDeltaContent('Hello world')).toBe('Hello world');
    });

    it('joins text blocks from the Claude-shim array form', () => {
        const arr = [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world' },
        ];
        expect(normalizeDeltaContent(arr)).toBe('Hello world');
    });

    it('keeps only text blocks when the array mixes types', () => {
        const arr = [
            { type: 'text', text: 'Hi' },
            { type: 'image', source: 'ignored' },
            { type: 'text', text: '!' },
        ];
        expect(normalizeDeltaContent(arr)).toBe('Hi!');
    });

    it('returns null for empty arrays / no-text arrays', () => {
        expect(normalizeDeltaContent([])).toBeNull();
        expect(normalizeDeltaContent([{ type: 'image', source: 'foo' }])).toBeNull();
    });

    it('returns null for null, undefined, or non-array/non-string content', () => {
        expect(normalizeDeltaContent(null)).toBeNull();
        expect(normalizeDeltaContent(undefined)).toBeNull();
        expect(normalizeDeltaContent({})).toBeNull();
        expect(normalizeDeltaContent(42)).toBeNull();
    });

    it('treats a string with empty content as null (no spurious empty chunks)', () => {
        // The current consumers turn `null` into "no text chunk" and
        // skip yielding it. An empty string should reach the same fate,
        // not produce a zero-length text chunk that bloats the stream.
        expect(normalizeDeltaContent('')).toBeNull();
    });
});
