/**
 * EmbeddingCache -- tiny LRU for selection-text embeddings (EPIC-33 Lookup-Enhancement).
 *
 * The inline magnifier is clicked repeatedly on the same selection
 * during exploration. Re-embedding identical text on every click
 * burns provider tokens. This LRU caches up to N selection
 * embeddings per panel session.
 *
 * Key is a stable hash of the trimmed selection text (FNV-1a, no
 * dependency on crypto). Values are number[] embeddings.
 *
 * Audit reference: vaultAudit gap "No caching of the selection
 * embedding -- clicking magnifier twice on the same selection
 * re-embeds. EmbeddingService offers a cache but the inline probe
 * goes directly to embedTexts which bypasses it."
 */

export interface EmbeddingCacheOptions {
    /** Maximum entries before LRU eviction. Default 16. */
    capacity?: number;
}

/**
 * Cache entry keeps the original trimmed source text alongside the
 * embedding so a hash collision (two distinct texts with the same
 * FNV-1a + length-prefix) does not silently return the wrong vector.
 * Audit ref: AUDIT-EPIC-33 M-02.
 */
interface CacheEntry {
    text: string;
    embedding: number[];
}

export class EmbeddingCache {
    private readonly capacity: number;
    private readonly map = new Map<string, CacheEntry>();

    constructor(options: EmbeddingCacheOptions = {}) {
        this.capacity = Math.max(1, options.capacity ?? 16);
    }

    get(text: string): number[] | undefined {
        const trimmed = text.trim();
        const key = hashText(trimmed);
        const entry = this.map.get(key);
        if (entry === undefined) return undefined;
        // Guard against hash collisions: only return the embedding when
        // the cached source text matches the request verbatim.
        if (entry.text !== trimmed) return undefined;
        // Re-insert to refresh LRU position.
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.embedding;
    }

    set(text: string, embedding: number[]): void {
        if (embedding.length === 0) return;
        const trimmed = text.trim();
        const key = hashText(trimmed);
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, { text: trimmed, embedding });
        while (this.map.size > this.capacity) {
            const next = this.map.keys().next();
            if (next.done === true) break;
            this.map.delete(next.value);
        }
    }

    clear(): void { this.map.clear(); }

    get size(): number { return this.map.size; }
}

function hashText(trimmed: string): string {
    // FNV-1a 32-bit on the trimmed text. Sufficient for an in-session
    // cache as long as the caller verifies the source text on hit
    // (entry.text equality guard in get()).
    let hash = 0x811c9dc5;
    for (let i = 0; i < trimmed.length; i += 1) {
        hash ^= trimmed.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return `${trimmed.length}:${hash.toString(16)}`;
}
