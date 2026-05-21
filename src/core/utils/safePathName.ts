/**
 * safePathName -- shared whitelist-based guard against path traversal in
 * user-controllable path segments (plugin IDs, skill names, script
 * names, file basenames). Extracted by AUDIT-FEAT-29-06 L-1 to remove
 * the duplicate regex between RunSkillScriptTool and
 * agentFolder.assertSafePluginId.
 *
 * Whitelist rules:
 *  - first char must be alphanumeric (no leading dot/dash to avoid
 *    hidden-file or option-flag confusion)
 *  - remaining chars: alphanumeric, dot, underscore, dash
 *  - max length 200 characters
 *  - rejects all path separators (/, \), absolute paths and `..`
 *    sequences implicitly through the character class
 */

const SAFE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_NAME_MAX_LEN = 200;

/**
 * Returns true when the name passes the whitelist guard. Cheap predicate
 * for call sites that want to short-circuit (e.g. tool-input validation
 * that maps an invalid value to a user-friendly error rather than a
 * thrown exception).
 */
export function isSafePathSegment(name: string): boolean {
    return (
        typeof name === 'string'
        && name.length > 0
        && name.length <= SAFE_NAME_MAX_LEN
        && SAFE_NAME_PATTERN.test(name)
    );
}

/**
 * Throws when the name does not pass the whitelist guard. Use at API
 * surface boundaries that build file paths from user input. The `label`
 * goes into the error message so a caller can disambiguate
 * (plugin id, skill name, script name, ...).
 *
 * Throws so misuse becomes loud at the call site rather than silently
 * landing in an unexpected path.
 */
export function assertSafePathSegment(name: string, label = 'name'): void {
    if (!isSafePathSegment(name)) {
        throw new Error(
            `Unsafe ${label} rejected by path-traversal guard: ${JSON.stringify(name)}`,
        );
    }
}
