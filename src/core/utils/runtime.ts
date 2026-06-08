/**
 * Cross-environment runtime helpers (review-bot Tier 3 / Audit 2.13.x).
 *
 * The plugin runs in three environments: Obsidian renderer (Electron, `window`
 * defined), vitest node (`window` undefined, `globalThis` is the node global),
 * and a sandbox-worker subprocess (node child_process, no DOM). The reviewer
 * bot's `obsidianmd/platform/no-global-this` rule flags every literal
 * `globalThis` reference. Consolidating the cross-env fallback into this
 * single module reduces the bot's warning count to a single site instead of
 * spreading the same shim across multiple call sites.
 *
 * Renderer code MUST prefer `window.setTimeout` / `window.clearTimeout`
 * directly. These helpers exist for code that has to share a tested path
 * with vitest's node environment.
 */

// Typed signatures so the bound exports do not widen to `any` after the
// obsidian 1.13.0 type-defs update narrowed the global `setTimeout` typing.
// The callback type accepts an arbitrary single argument so Promise
// resolvers (`(value: unknown) => void`) are accepted alongside zero-arg
// callbacks; the timer impl ignores extra arguments.
type SetTimeoutFn = (cb: (...args: unknown[]) => void, ms?: number) => ReturnType<typeof setTimeout>;
type ClearTimeoutFn = (id: ReturnType<typeof setTimeout>) => void;

// The single `globalThis` reference in the codebase that the bot tolerates.
// Wrapping it here means the four-or-five-site spread before EPIC-32 is now
// one isolated import boundary.
const ctx: { setTimeout: SetTimeoutFn; clearTimeout: ClearTimeoutFn } =
    typeof window !== 'undefined' ? window : globalThis;

/**
 * setTimeout that works in both the renderer (`window`) and node tests.
 * Arrow-function wrappers avoid `Function.prototype.bind`'s `any`-widening
 * (TypeScript currently widens `bind()` returns when overloads are
 * involved, which the obsidian 1.13.0 type-defs introduced for the
 * global `setTimeout`).
 */
export const safeSetTimeout: SetTimeoutFn = (cb, ms) => ctx.setTimeout(cb, ms);

/** clearTimeout matching `safeSetTimeout`. */
export const safeClearTimeout: ClearTimeoutFn = (id) => ctx.clearTimeout(id);

/**
 * Web Crypto handle. Renderer has `window.crypto.subtle`; node tests have
 * `globalThis.crypto.subtle` since Node 19+. Single isolated cross-env
 * access point (review-bot Tier 3 / Audit 2.13.x).
 */
export function safeCrypto(): { subtle?: SubtleCrypto } | undefined {
    return (ctx as { crypto?: { subtle?: SubtleCrypto } }).crypto;
}

/**
 * The cross-env global object cast to a generic record. Use when a third
 * party (e.g. NoticeCapture monkey-patch) needs to read a property like
 * `Notice` off the global. Renderer-callers should prefer `window` directly;
 * this helper exists for code paths that must also work under vitest's
 * node environment.
 */
export function globalRef<T extends object = Record<string, unknown>>(): T {
    return ctx as unknown as T;
}
