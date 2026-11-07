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
    // AUDIT-038 ISSUE-001: provider-credential fields that
    // providerCredentialCrypto encrypts at rest but the export path
    // forgot. gatewayHeaderValue carries the Bedrock-gateway
    // subscription key, oauthToken carries provider OAuth tokens, and
    // the chatgpt* fields carry the ChatGPT-OAuth tuple (ADR-088/089).
    'gatewayHeaderValue',
    'oauthToken',
    // FEAT-04-14: both live settings and encrypted on-disk backups carry
    // these per-provider credentials. Neither belongs in a secret-free export.
    'geminiOAuthClientSecret',
    'geminiOAuthRefreshToken',
    'chatgptOAuthAccessToken',
    'chatgptOAuthRefreshToken',
    'chatgptOAuthIdToken',
    // FEAT-04-10: OAuth MCP connector session fields nested under
    // mcpServers[name].oauth.{tokens,clientInformation}. Shape-driven, so the
    // SDK key names are what get matched wherever they appear.
    'access_token',
    'refresh_token',
    'client_secret',
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
            // FEAT-04-11: a `headers` object carries user-supplied request
            // headers whose NAMES are arbitrary (Authorization, X-Api-Key, ...)
            // but whose VALUES are credentials. Redact every non-empty value.
            if (key === 'headers' && v !== null && typeof v === 'object' && !Array.isArray(v)) {
                const headers = v as Record<string, unknown>;
                const redacted: Record<string, unknown> = {};
                for (const [hk, hv] of Object.entries(headers)) {
                    redacted[hk] = (hv === '' || hv === null || hv === undefined) ? hv : REDACTED_SENTINEL;
                }
                out[key] = redacted;
            } else if (KNOWN_SECRET_KEYS.has(key)) {
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
 * Inverse of filterSecretsFromDataJson(): walk an imported object tree
 * and remove any field whose value is exactly REDACTED_SENTINEL.
 *
 * AUDIT-039 H-1: the export path replaces secret values with
 * REDACTED_SENTINEL so it is visible on inspection that a value was
 * stripped. On import, those sentinel strings must NOT be persisted
 * into settings -- if they were, saveSettings would encrypt the literal
 * "<<REDACTED>>" string and the user's real credential would be
 * destroyed permanently. By deleting the field instead, DEFAULT_SETTINGS
 * keeps providing the empty-string default and the user simply has to
 * re-authenticate, matching the pre-fix behaviour.
 *
 * Pure and side-effect-free (returns a deep copy).
 */
export function stripRedactedFromImport(json: unknown): unknown {
    return walkStrip(json);
}

function walkStrip(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
        return value.map((v) => walkStrip(v));
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(obj)) {
            if (v === REDACTED_SENTINEL) continue;
            out[key] = walkStrip(v);
        }
        return out;
    }
    return value;
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
