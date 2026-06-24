/**
 * vaultPathGuard -- AUDIT-034 H-1/H-2/M-1..M-3.
 *
 * Single source of truth for "is this a safe vault-relative path?".
 * Replaces the various ad-hoc `includes('..')` checks scattered across
 * the vault tools. The check normalises slashes, walks the path
 * segment-by-segment, and rejects anything that could escape the vault
 * via the LLM's tool inputs:
 *
 *   - absolute Unix paths           "/etc/passwd"
 *   - Windows drive-letter prefixes "C:/Users/..." or "C:\..."
 *   - UNC prefixes                  "\\\\server\\share"
 *   - parent traversal              "../" or any "/../" segment
 *   - current-dir segments          "./" (forces resolution surprises)
 *   - NUL byte injection            "evil\0safe.md"
 *   - empty/whitespace input
 *
 * The guard is a Zero-Trust gate: the LLM never sees the validation
 * logic, only the resulting tool_error when validation fails.
 */

export interface VaultPathGuardOptions {
    /**
     * Optional expected file extension including the leading dot
     * (e.g. `.pptx`). Validated case-insensitively.
     */
    expectedExtension?: string;
    /**
     * Optional human-readable parameter label for the thrown error
     * message (default `path`). Useful when the tool surface has
     * multiple paths, e.g. MoveFileTool's source / destination.
     */
    paramName?: string;
}

/**
 * Throws a descriptive Error when the path is unsafe. Returns the
 * normalised path (forward slashes) on success so callers can re-use
 * it for downstream lookups without re-normalising.
 */
export function assertSafeVaultPath(rawPath: string, options: VaultPathGuardOptions = {}): string {
    const name = options.paramName ?? 'path';
    if (rawPath === undefined || rawPath === null || typeof rawPath !== 'string' || rawPath.trim().length === 0) {
        throw new Error(`${name} is required`);
    }
    if (rawPath.includes('\0')) {
        throw new Error(`${name} must not contain NUL bytes`);
    }
    if (rawPath.startsWith('/') === true || rawPath.startsWith('\\') === true) {
        throw new Error(`${name} must be a vault-relative path, not an absolute path`);
    }
    if (/^[A-Za-z]:[/\\]/.test(rawPath) === true) {
        throw new Error(`${name} must be a vault-relative path (drive-letter prefix rejected)`);
    }
    if (rawPath.startsWith('\\\\') === true) {
        throw new Error(`${name} must be a vault-relative path (UNC prefix rejected)`);
    }
    const normalised = rawPath.replace(/\\/g, '/');
    const segments = normalised.split('/');
    for (const seg of segments) {
        if (seg === '..') {
            throw new Error(`${name} must not contain ".." path traversal`);
        }
        if (seg === '.') {
            throw new Error(`${name} must not contain "." path segments`);
        }
    }
    if (options.expectedExtension !== undefined) {
        const ext = options.expectedExtension.toLowerCase();
        if (normalised.toLowerCase().endsWith(ext) === false) {
            throw new Error(`${name} must end with ${options.expectedExtension}`);
        }
    }
    return normalised;
}
