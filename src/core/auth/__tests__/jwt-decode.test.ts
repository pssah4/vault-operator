/**
 * jwt-decode: nested-namespace claim reads.
 *
 * The ChatGPT OAuth id/access tokens carry the account id and plan type inside
 * a nested object claim `https://api.openai.com/auth`, not as a flat dotted
 * key. readStringClaim must descend into that object when a name is written as
 * `<namespace>.<field>`, otherwise the chatgpt-account-id header is never sent
 * and the Codex backend rejects every model.
 */

import { describe, it, expect } from 'vitest';
import { decodeJwtClaims, readStringClaim, findClaimInNestedObjects, describeClaimStructure } from '../jwt-decode';

function makeJwt(payload: Record<string, unknown>): string {
    const b64 = (o: unknown) =>
        Buffer.from(JSON.stringify(o)).toString('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64({ alg: 'none' })}.${b64(payload)}.`;
}

const OPENAI_AUTH = 'https://api.openai.com/auth';

describe('readStringClaim nested OpenAI namespace', () => {
    it('reads chatgpt_account_id from the nested auth object', () => {
        const claims = decodeJwtClaims(makeJwt({
            [OPENAI_AUTH]: { chatgpt_account_id: 'acct-123', chatgpt_plan_type: 'pro' },
            email: 'user@example.com',
        }))!;
        expect(readStringClaim(claims, `${OPENAI_AUTH}.chatgpt_account_id`, 'chatgpt_account_id', 'account_id'))
            .toBe('acct-123');
        expect(readStringClaim(claims, `${OPENAI_AUTH}.chatgpt_plan_type`, 'chatgpt_plan_type'))
            .toBe('pro');
    });

    it('still reads a genuinely flat claim', () => {
        const claims = decodeJwtClaims(makeJwt({ chatgpt_account_id: 'flat-456' }))!;
        expect(readStringClaim(claims, `${OPENAI_AUTH}.chatgpt_account_id`, 'chatgpt_account_id'))
            .toBe('flat-456');
    });

    it('prefers the first non-empty match in order (nested wins when listed first)', () => {
        const claims = decodeJwtClaims(makeJwt({
            [OPENAI_AUTH]: { chatgpt_account_id: 'nested-1' },
            chatgpt_account_id: 'flat-2',
        }))!;
        expect(readStringClaim(claims, `${OPENAI_AUTH}.chatgpt_account_id`, 'chatgpt_account_id'))
            .toBe('nested-1');
    });

    it('returns empty string when neither nested nor flat is present', () => {
        const claims = decodeJwtClaims(makeJwt({ sub: 'x' }))!;
        expect(readStringClaim(claims, `${OPENAI_AUTH}.chatgpt_account_id`, 'chatgpt_account_id', 'account_id'))
            .toBe('');
    });

    it('ignores a non-object value at the namespace key', () => {
        const claims = decodeJwtClaims(makeJwt({ [OPENAI_AUTH]: 'not-an-object' }))!;
        expect(readStringClaim(claims, `${OPENAI_AUTH}.chatgpt_account_id`)).toBe('');
    });
});

describe('findClaimInNestedObjects (deep scan)', () => {
    it('finds a field inside an unexpected namespace object', () => {
        const claims = decodeJwtClaims(makeJwt({
            'https://api.openai.com/profile': { chatgpt_account_id: 'deep-1' },
            email: 'x@y.z',
        }))!;
        expect(findClaimInNestedObjects(claims, 'chatgpt_account_id', 'account_id')).toBe('deep-1');
    });

    it('returns empty when no object claim carries the field', () => {
        const claims = decodeJwtClaims(makeJwt({ email: 'x@y.z', sub: 's' }))!;
        expect(findClaimInNestedObjects(claims, 'chatgpt_account_id', 'account_id')).toBe('');
    });

    it('ignores array and primitive claims', () => {
        const claims = decodeJwtClaims(makeJwt({ roles: ['a', 'b'], n: 5, s: 'str' }))!;
        expect(findClaimInNestedObjects(claims, 'chatgpt_account_id')).toBe('');
    });
});

describe('describeClaimStructure (keys only, no values)', () => {
    it('lists top-level keys and nested object keys without values', () => {
        const claims = decodeJwtClaims(makeJwt({
            email: 'secret@x.z',
            'https://api.openai.com/auth': { chatgpt_account_id: 'acct-secret', chatgpt_plan_type: 'pro' },
            sub: 'user-secret',
        }))!;
        const desc = describeClaimStructure(claims);
        expect(desc).toContain('email');
        expect(desc).toContain('https://api.openai.com/auth:{chatgpt_account_id,chatgpt_plan_type}');
        // values must never appear
        expect(desc).not.toContain('secret');
        expect(desc).not.toContain('acct-secret');
        expect(desc).not.toContain('pro');
    });
});
