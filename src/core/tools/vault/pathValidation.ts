/**
 * Shared Path-Validierung fuer Vault-relative Pfade an Vault-Tool-
 * Boundaries. AUDIT-016 L-5: extrahiert aus IngestTriageTool, damit
 * MarkNoteAsMemorySourceTool / UnmarkNoteAsMemorySourceTool und
 * weitere Tools dieselbe robuste Validierung bekommen.
 *
 * Returns: normalisierter Pfad (Forward-Slashes, ohne fuehrenden /)
 * oder null wenn der Pfad geblockt wird.
 *
 * Geblockt:
 *  - leerer / nicht-string Input
 *  - parent-traversal (`..` oder `.` als Segment)
 *  - NUL-Bytes
 *  - URL-encoded Traversal-Patterns (`%2e%2e`, `%2f%2f`)
 *
 * NICHT geprueft (Caller-Aufgabe):
 *  - Existenz im Vault (getAbstractFileByPath)
 *  - File-Type (Markdown vs binary)
 *  - IgnoreService / configDir-Schutz (siehe validateMcpVaultPath
 *    fuer den McpBridge-Pfad)
 */
export function validateVaultRelativePath(rawPath: unknown): string | null {
    if (typeof rawPath !== 'string' || rawPath.length === 0) return null;
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.split('/').some((seg) => seg === '..' || seg === '.')) return null;
    if (normalized.includes('\0')) return null;
    if (/%2e%2e|%2f%2f/i.test(normalized)) return null;
    return normalized;
}
