/**
 * UriResolver -- parse-only URI helper for the Memory v2 engine.
 *
 * Recognises the standard schemes from ADR-078:
 *
 *   vault://<path>          External: vault-relative file path
 *   file://<absolute-path>  External: filesystem path (out-of-vault)
 *   https://<host>/<path>   External: web resource
 *   cloud://<service>/<id>  External: SaaS resource (Notion, Drive, ...)
 *   fact:<id>               Internal: facts.id
 *   session://<sessionId>   Internal: session token
 *   episode://<episodeId>   Internal: episodes.id
 *   entity://<name>         Internal: entity reference (case-preserved)
 *   thread://<threadId>     Internal: conversation_threads.thread_id
 *
 * Unknown schemes are NOT errors. The resolver returns `kind: 'unknown'`
 * so callers can keep the URI as a reference token in `fact_edges.to_external_ref`.
 *
 * Pure parser: no I/O, no network, no DB. Resolution to payload is
 * delegated to host-registered `SourceAdapter`s via `AdapterRegistry`.
 *
 * FEATURE-0315 / PLAN-004 task 7.
 */

export type ParsedUri =
    | { kind: 'external'; scheme: ExternalScheme; uri: string; path: string }
    | { kind: 'internal'; scheme: InternalScheme; uri: string; id: string }
    | { kind: 'unknown'; uri: string };

export type ExternalScheme = 'vault' | 'file' | 'https' | 'http' | 'cloud';
export type InternalScheme = 'fact' | 'session' | 'episode' | 'entity' | 'thread';

const EXTERNAL_SCHEMES: ReadonlySet<ExternalScheme> = new Set([
    'vault', 'file', 'https', 'http', 'cloud',
]);

const INTERNAL_DOUBLE_SLASH_SCHEMES: ReadonlySet<InternalScheme> = new Set([
    'session', 'episode', 'entity', 'thread',
]);

/**
 * `fact:<id>` is the only single-colon internal scheme (no `//`) because
 * fact ids are integers, not opaque tokens. The other internal schemes
 * carry user-generated ids that may contain `/`, so they keep `://` for
 * unambiguous parsing.
 */
const INTERNAL_SINGLE_COLON_SCHEMES: ReadonlySet<InternalScheme> = new Set(['fact']);

export class UriResolver {
    /**
     * Parse a URI into one of the standard shapes. Never throws -- unknown
     * URIs return `{ kind: 'unknown' }` so callers can keep them as
     * reference tokens.
     */
    parse(uri: string): ParsedUri {
        if (typeof uri !== 'string' || uri.length === 0) {
            return { kind: 'unknown', uri };
        }

        // Try `scheme://rest` first (covers most cases)
        const doubleColonIdx = uri.indexOf('://');
        if (doubleColonIdx > 0) {
            const scheme = uri.slice(0, doubleColonIdx).toLowerCase();
            const rest = uri.slice(doubleColonIdx + 3);
            if (EXTERNAL_SCHEMES.has(scheme as ExternalScheme)) {
                return { kind: 'external', scheme: scheme as ExternalScheme, uri, path: rest };
            }
            if (INTERNAL_DOUBLE_SLASH_SCHEMES.has(scheme as InternalScheme)) {
                return { kind: 'internal', scheme: scheme as InternalScheme, uri, id: rest };
            }
            return { kind: 'unknown', uri };
        }

        // Single-colon schemes (only `fact:<id>` today)
        const singleColonIdx = uri.indexOf(':');
        if (singleColonIdx > 0) {
            const scheme = uri.slice(0, singleColonIdx).toLowerCase();
            const rest = uri.slice(singleColonIdx + 1);
            if (INTERNAL_SINGLE_COLON_SCHEMES.has(scheme as InternalScheme)) {
                return { kind: 'internal', scheme: scheme as InternalScheme, uri, id: rest };
            }
        }

        return { kind: 'unknown', uri };
    }

    /** Convenience: just the lower-cased scheme, or undefined when unparseable. */
    schemeOf(uri: string): string | undefined {
        const parsed = this.parse(uri);
        return parsed.kind === 'unknown' ? undefined : parsed.scheme;
    }

    /** Build a `vault://` URI from a vault-relative path. */
    static vault(path: string): string {
        return `vault://${path}`;
    }

    /** Build a `fact:` URI from a numeric fact id. */
    static fact(id: number): string {
        return `fact:${id}`;
    }

    static session(sessionId: string): string { return `session://${sessionId}`; }
    static episode(episodeId: string): string { return `episode://${episodeId}`; }
    static entity(name: string): string { return `entity://${name}`; }
    static thread(threadId: string): string { return `thread://${threadId}`; }
}
