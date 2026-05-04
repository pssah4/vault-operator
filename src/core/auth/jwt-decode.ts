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
 * Read a string claim, trying multiple possible claim names. Returns the
 * first non-empty match or `''`. Use this when the exact claim name is
 * not yet confirmed empirically.
 */
export function readStringClaim(claims: JwtClaims, ...names: string[]): string {
    for (const name of names) {
        const value = claims[name];
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return '';
}
