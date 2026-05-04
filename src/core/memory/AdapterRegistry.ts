/**
 * AdapterRegistry -- host-pluggable URI resolution for the engine.
 *
 * Hosts register one `SourceAdapter` per scheme (or share a custom
 * scheme like `cloud`). The engine asks the registry to resolve a URI;
 * the registry picks the matching adapter via `canHandle()` and
 * delegates. Schemes without a registered adapter resolve to null
 * without throwing -- the URI keeps its value as a reference token in
 * `fact_edges.to_external_ref` (ADR-078).
 *
 * Phase 1 ships the registry empty. The Vault adapter lands in Phase 3
 * together with the UnifiedGraphService when ATTACH/cross-DB walks are
 * wired (PLAN-001 phase plan).
 *
 * FEATURE-0315 / PLAN-004 task 7.
 */

import type { SourceAdapter, ResolvedSource } from './SourceAdapter';
import { UriResolver } from './UriResolver';

export class AdapterRegistry {
    private readonly adapters = new Map<string, SourceAdapter>();
    private readonly resolver = new UriResolver();

    register(adapter: SourceAdapter): void {
        if (typeof adapter.scheme !== 'string' || adapter.scheme.length === 0) {
            throw new Error('AdapterRegistry: adapter.scheme must be non-empty');
        }
        const scheme = adapter.scheme.toLowerCase();
        if (this.adapters.has(scheme)) {
            throw new Error(`AdapterRegistry: scheme '${scheme}' is already registered`);
        }
        this.adapters.set(scheme, adapter);
    }

    /** Replace an existing adapter (host setup change). */
    override(adapter: SourceAdapter): void {
        this.adapters.set(adapter.scheme.toLowerCase(), adapter);
    }

    unregister(scheme: string): void {
        this.adapters.delete(scheme.toLowerCase());
    }

    has(scheme: string): boolean {
        return this.adapters.has(scheme.toLowerCase());
    }

    get(scheme: string): SourceAdapter | undefined {
        return this.adapters.get(scheme.toLowerCase());
    }

    /**
     * Resolve a URI by routing to the registered adapter. Returns null
     * when no adapter is registered or when the adapter cannot handle
     * the specific URI. Never throws on unknown schemes -- callers can
     * keep the URI as a reference token.
     */
    async resolve(uri: string): Promise<ResolvedSource | null> {
        const scheme = this.resolver.schemeOf(uri);
        if (!scheme) return null;
        const adapter = this.adapters.get(scheme);
        if (!adapter) return null;
        if (!adapter.canHandle(uri)) return null;
        return adapter.resolve(uri);
    }

    /** Snapshot of all registered schemes (for diagnostics). */
    listSchemes(): string[] {
        return [...this.adapters.keys()].sort();
    }
}
