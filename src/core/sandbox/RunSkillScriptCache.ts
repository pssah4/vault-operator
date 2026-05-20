/**
 * RunSkillScriptCache -- in-memory LRU cache for compiled skill-script
 * bundles. Saves the cost of re-compiling the same JS source through
 * EsbuildWasm on every invocation. FEAT-29-06 Task B / ADR-126.
 *
 * Key derivation: skill-name '|' script-name '|' sha256(source-text). The
 * upstream cache-key includes the skill+script names verbatim, so a
 * collision in the source-hash alone cannot serve the wrong bundle
 * across different skills. Source-text changes invalidate the entry
 * automatically because the hash changes.
 *
 * LRU policy: JavaScript's Map preserves insertion order. On `get` of an
 * existing key we delete + re-set to move the entry to the most-recent
 * end. On `set` past the size cap we drop the first entry (oldest).
 *
 * Default capacity 20 -- typical vault has < 10 script-bundles in flight,
 * 20 leaves headroom for tail experiments without runaway memory.
 *
 * AUDIT-FEAT-29-06 L-2 (2026-05-20): replaced the original FNV-1a 32-bit
 * hash with sha256 (Node `crypto`). FNV-1a was theoretically
 * brute-forceable for targeted collisions; sha256 is cryptographically
 * collision-resistant. Cost is ~1-2 ms per cache-write, negligible
 * compared to the EsbuildWasm transform it avoids.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- one-time crypto require for sha256 hashing of script source. crypto is Node built-in, not an external dep. */
const nodeCrypto = require('crypto') as typeof import('crypto');
/* eslint-enable @typescript-eslint/no-require-imports */

export interface RunSkillScriptCacheOptions {
    maxEntries?: number;
}

function sha256Hash(input: string): string {
    return nodeCrypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function makeKey(skillName: string, scriptName: string, sourceText: string): string {
    return `${skillName}|${scriptName}|${sha256Hash(sourceText)}`;
}

export class RunSkillScriptCache {
    private readonly maxEntries: number;
    private readonly store: Map<string, string>;

    constructor(opts: RunSkillScriptCacheOptions = {}) {
        this.maxEntries = opts.maxEntries ?? 20;
        this.store = new Map<string, string>();
    }

    /** Lookup a previously compiled bundle. Returns null on miss or when
     *  the source-text hash no longer matches the stored entry. */
    get(skillName: string, scriptName: string, sourceText: string): string | null {
        const key = makeKey(skillName, scriptName, sourceText);
        const hit = this.store.get(key);
        if (hit === undefined) return null;
        // Move to most-recent end: delete + set with the same value.
        this.store.delete(key);
        this.store.set(key, hit);
        return hit;
    }

    /** Store a compiled bundle. Evicts the oldest entry when capacity is
     *  exceeded. Re-setting an existing key updates the value AND moves it
     *  to the most-recent end without growing the cache.
     *
     *  AUDIT-FEAT-29-06 I-1 note: the cache-key intentionally does NOT
     *  include `args`. The compiled bundle is args-agnostic at build
     *  time; args land in the sandbox at run time via `execute(args)`.
     *  If a future feature ever inlines args into the bundle at compile
     *  time (e.g. a templating macro), THIS cache-key must be extended
     *  to include an args-hash, otherwise two callers with different
     *  args would receive the same stale bundle. */
    set(skillName: string, scriptName: string, sourceText: string, compiled: string): void {
        const key = makeKey(skillName, scriptName, sourceText);
        // Re-insertion pattern keeps LRU order tidy.
        if (this.store.has(key)) {
            this.store.delete(key);
        }
        this.store.set(key, compiled);
        // Drop the oldest if past cap.
        if (this.store.size > this.maxEntries) {
            const oldestKey = this.store.keys().next().value;
            if (oldestKey !== undefined) this.store.delete(oldestKey);
        }
    }

    /** Number of cached bundles. */
    size(): number {
        return this.store.size;
    }

    /** Drop everything. */
    clear(): void {
        this.store.clear();
    }
}
