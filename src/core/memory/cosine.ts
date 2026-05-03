/**
 * Cosine similarity helper -- engine-public utility for fact_embeddings
 * lookups.
 *
 * Pure function, no DB, no obsidian, no globals. Reused by FactIntegrator
 * (relation=update conflict-detection) and RecallMemoryTool (cold-memory
 * recall via embedded query).
 *
 * Returns 0 for length-mismatched vectors and for zero-magnitude
 * vectors instead of NaN, so callers can sort the result without
 * special-casing.
 */

export function cosine(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    if (denom === 0) return 0;
    const sim = dot / denom;
    // AUDIT-016 L-2: NaN-Guard. NaN/Infinity koennen entstehen, wenn
    // ein Vektor NaN-Eintraege traegt (Embedding-Provider-Bug). Wir
    // returnen 0 statt NaN damit Sortier-Logik (b.score - a.score)
    // nicht in undefined ordering laeuft.
    return Number.isFinite(sim) ? sim : 0;
}
