/**
 * Minimal JWT claim decoder.
 *
 * Reads claims from a JWT without verifying its signature. Safe here because
 * the token comes directly from auth.openai.com over TLS in the OAuth code
 * exchange (FEATURE-021-001, ADR-088).
 *
 * For tokens received over an untrusted channel, use a real JWT lib that
 * validates the signature.
 */

export type JwtClaims = Record<string, unknown>;

/**
 * Decode the payload claims of a JWT string.
 * Returns null if the input is malformed.
 */
export function decodeJwtClaims(jwt: string): JwtClaims | null {
    if (!jwt || typeof jwt !== 'string') return null;
    const parts = jwt.split('.');
    if (parts.length < 2) return null;

    try {
        const payload = base64UrlDecode(parts[1]);
        const parsed = JSON.parse(payload) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed as JwtClaims;
        }
        return null;
    } catch {
        return null;
    }
}

function base64UrlDecode(input: string): string {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (padded.length % 4)) % 4;
    const base64 = padded + '='.repeat(padLength);
    return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Object-valued claims that namespace their fields. OpenAI nests the
 * chatgpt-account-id and plan type inside `https://api.openai.com/auth`
 * rather than as flat dotted keys, so a name written as
 * `https://api.openai.com/auth.chatgpt_account_id` must descend into that
 * object. The namespace itself contains dots, so the path cannot be split
 * naively; match the known prefixes explicitly.
 */
const NESTED_CLAIM_NAMESPACES = ['https://api.openai.com/auth'];

/**
 * Read a string claim, trying multiple possible claim names. Returns the
 * first non-empty match or `''`. A name of the form `<namespace>.<field>`
 * (where namespace is a known nested object claim) reads `<field>` from that
 * object; everything else is a flat key lookup. Use this when the exact claim
 * name is not yet confirmed empirically.
 */
export function readStringClaim(claims: JwtClaims, ...names: string[]): string {
    for (const name of names) {
        const direct = claims[name];
        if (typeof direct === 'string' && direct.length > 0) return direct;

        for (const ns of NESTED_CLAIM_NAMESPACES) {
            const prefix = ns + '.';
            if (!name.startsWith(prefix)) continue;
            const obj = claims[ns];
            if (!obj || typeof obj !== 'object') continue;
            const field = name.slice(prefix.length);
            const nested = (obj as Record<string, unknown>)[field];
            if (typeof nested === 'string' && nested.length > 0) return nested;
        }
    }
    return '';
}

/**
 * Last-resort deep scan: look for any of the given field names one level deep
 * inside every object-valued claim, regardless of the namespace key. Used when
 * the expected namespace paths miss because a provider nests a value under a
 * key we do not enumerate. Returns the first non-empty string match or `''`.
 */
export function findClaimInNestedObjects(claims: JwtClaims, ...fieldNames: string[]): string {
    for (const value of Object.values(claims)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const obj = value as Record<string, unknown>;
        for (const field of fieldNames) {
            const v = obj[field];
            if (typeof v === 'string' && v.length > 0) return v;
        }
    }
    return '';
}

/**
 * Describe a claims object's shape for diagnostics: top-level keys, with
 * nested object claims expanded to `key:{subkey,subkey}`. KEYS ONLY, never
 * values, so it is safe to log a token's structure without leaking the
 * account id, email, or other claim values.
 */
export function describeClaimStructure(claims: JwtClaims): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(claims)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            parts.push(`${key}:{${Object.keys(value as Record<string, unknown>).join(',')}}`);
        } else {
            parts.push(key);
        }
    }
    return parts.join(', ');
}
