/**
 * SourceAdapter -- engine-public interface for resolving URIs into payloads.
 *
 * Hosts (Vault Operator, UCM, custom integrations) register adapters per URI
 * scheme. The engine itself never imports `obsidian` or any
 * host-specific code; it only knows the interface and asks the
 * `AdapterRegistry` to resolve a URI when payload is needed.
 *
 * A URI without a registered adapter is NOT a crash -- it stays a
 * reference token that survives in `fact_edges.to_external_ref` and
 * remains useful for graph queries. Resolution returns null in that
 * case (see ADR-078).
 *
 * FEATURE-0315 / PLAN-004 task 7.
 */

export interface ResolvedSource {
    /** The URI that resolved (echo for caller convenience). */
    uri: string;
    /** Resolved scheme (`vault`, `file`, `https`, `entity`, ...). */
    scheme: string;
    /** Optional title or label. */
    title?: string;
    /** Optional textual content (markdown, HTML, plain text). */
    content?: string;
    /** Optional last-modified timestamp (ms since epoch). */
    mtimeMs?: number;
    /** Free-form structured metadata from the source. */
    metadata?: Record<string, unknown>;
}

export interface SourceAdapter {
    /** Lower-cased URI scheme this adapter handles, e.g. `'vault'`, `'https'`. */
    readonly scheme: string;
    /**
     * Cheap check whether the adapter accepts a given URI. The
     * registry uses the scheme prefix first; this hook lets adapters
     * narrow further (e.g. only `https://app.example.com/...`).
     */
    canHandle(uri: string): boolean;
    /** Returns null when the URI cannot be resolved (e.g. missing file). */
    resolve(uri: string): Promise<ResolvedSource | null>;
}
