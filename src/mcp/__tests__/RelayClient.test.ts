import { describe, expect, it } from 'vitest';
import { describeRequestError, redactToken } from '../RelayClient';

describe('redactToken', () => {
    it('replaces every occurrence of the relay token with <redacted>', () => {
        const token = 'super-secret-token-123';
        const input = `Bearer ${token} responded with body containing ${token} again`;
        expect(redactToken(input, token)).toBe(
            'Bearer <redacted> responded with body containing <redacted> again',
        );
    });

    it('redacts generic Bearer headers even when the token is empty', () => {
        const input = 'Authorization: Bearer abcDEF123-_=+/';
        expect(redactToken(input, '')).toBe('Authorization: Bearer <redacted>');
    });

    it('returns empty input untouched', () => {
        expect(redactToken('', 'whatever')).toBe('');
    });
});

describe('describeRequestError', () => {
    const token = 'abc123tok';

    it('formats Obsidian requestUrl errors with status and trimmed body', () => {
        const err = { status: 429, text: 'error code: 1027' };
        expect(describeRequestError(err, token)).toBe('HTTP 429: error code: 1027');
    });

    it('truncates long bodies to keep logs readable', () => {
        const longBody = 'x'.repeat(500);
        const out = describeRequestError({ status: 500, text: longBody }, token);
        expect(out.startsWith('HTTP 500: ')).toBe(true);
        expect(out.length).toBeLessThan(longBody.length);
        expect(out.endsWith('...')).toBe(true);
    });

    it('redacts the relay token if it ever appears in the body', () => {
        const err = { status: 401, text: `Invalid token ${token}` };
        const out = describeRequestError(err, token);
        expect(out).not.toContain(token);
        expect(out).toContain('<redacted>');
    });

    it('falls back to error.message for plain network errors without status', () => {
        const err = new TypeError('NetworkError: Failed to fetch');
        expect(describeRequestError(err, token)).toContain('Failed to fetch');
    });

    it('falls back to error.name when neither status nor message is available', () => {
        const err = { name: 'AbortError' };
        expect(describeRequestError(err, token)).toBe('AbortError');
    });
});
