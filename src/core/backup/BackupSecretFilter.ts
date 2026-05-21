/**
 * BackupSecretFilter -- FEAT-29-12 Task B.
 *
 * Removes API-Keys and other secrets from a parsed data.json object
 * before it is added to the backup ZIP. The defaults match every
 * field-name the codebase uses for provider credentials.
 *
 * The filter is purely shape-driven: it walks the object recursively
 * and replaces any value whose key is in KNOWN_SECRET_KEYS with the
 * REDACTED sentinel. Other values pass through unchanged.
 *
 * `exportSecrets: true` bypasses the filter entirely (caller opt-in
 * via Settings -> Backup -> "Include API keys in export").
 */

/**
 * AUDIT-EPIC-29 H-1 fix: this allowlist MUST mirror every secret-bearing
 * field name in src/types/settings.ts. The manual backup flow
 * (BackupTab.stripSensitiveFields) historically had its own hard-coded
 * list; before the H-1 patch the two lists drifted, and auto-backups
 * leaked 8 fields that the manual flow stripped. Both flows now
 * converge on this single source of truth.
 */
const KNOWN_SECRET_KEYS: ReadonlySet<string> = new Set([
    // Generic credentials carried by ApiHandler / ProviderConfig
    'apiKey',
    'awsApiKey',
    'awsAccessKey',
    'awsSecretKey',
    'awsSessionToken',
    'anthropicApiKey',
    'openaiApiKey',
    'githubToken',
    'githubAccessToken',
    'bearerToken',
    'token',
    'secret',
    'password',
    // OpenRouter / Kilo / generic provider variants
    'openrouterApiKey',
    'kiloApiKey',
    'kiloAccessToken',
    // AUDIT-EPIC-29 H-1: explicit settings-level token fields. These
    // mirror src/ui/settings/BackupTab.ts stripSensitiveFields().
    'braveApiKey',
    'tavilyApiKey',
    'githubCopilotAccessToken',
    'githubCopilotToken',
    'kiloToken',
    'cloudflareApiToken',
    'relayToken',
    'mcpServerToken',
]);

/** Returns the set of key names this filter treats as secrets. */
export function getKnownSecretKeys(): ReadonlySet<string> {
    return KNOWN_SECRET_KEYS;
}

/** Sentinel that replaces stripped secret values in the exported JSON. */
export const REDACTED_SENTINEL = '<<REDACTED>>';

/**
 * Recursively walk an object/array tree and replace every value whose
 * key matches the secret allowlist with REDACTED_SENTINEL.
 *
 * Pure and side-effect-free: returns a deep copy. The input is not
 * mutated.
 *
 * Pass `bypass: true` to skip filtering entirely (used when the user
 * opts into including secrets in the export).
 */
export function filterSecretsFromDataJson(json: unknown, bypass = false): unknown {
    if (bypass) return deepClone(json);
    return walk(json);
}

function walk(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
        return value.map((v) => walk(v));
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(obj)) {
            if (KNOWN_SECRET_KEYS.has(key)) {
                // Only redact when the value would actually carry a secret.
                // Keep null / empty string / undefined as-is so the round-trip
                // doesn't "leak" a sentinel into fields the user never set.
                if (v === '' || v === null || v === undefined) {
                    out[key] = v;
                } else {
                    out[key] = REDACTED_SENTINEL;
                }
            } else {
                out[key] = walk(v);
            }
        }
        return out;
    }
    return value;
}

function deepClone<T>(v: T): T {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Detect whether an object tree contains any secret-keyed fields with
 * a non-empty value. Used by the export UI to warn the user before
 * opting into secret export.
 */
export function dataJsonContainsSecrets(json: unknown): boolean {
    if (json === null || json === undefined) return false;
    if (Array.isArray(json)) return json.some((v) => dataJsonContainsSecrets(v));
    if (typeof json !== 'object') return false;
    for (const [key, v] of Object.entries(json as Record<string, unknown>)) {
        if (KNOWN_SECRET_KEYS.has(key) && v !== '' && v !== null && v !== undefined) return true;
        if (dataJsonContainsSecrets(v)) return true;
    }
    return false;
}
