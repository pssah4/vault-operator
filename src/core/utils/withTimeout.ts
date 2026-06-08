/**
 * withTimeout (FEAT-32-03 PR 3.1)
 *
 * Hard ceiling on any single async operation. Wraps a Promise in
 * `Promise.race` against a setTimeout-driven rejection. When the inner
 * promise wins, the timer is cleared and the value is returned. When the
 * timeout wins, a `TimeoutError` is thrown carrying the label so the caller
 * can produce a non-fatal log line and continue.
 *
 * Used by AgentTask to wrap `skillsManager.discoverSkills()` so a hanging
 * plugin-skill discovery cannot block the Stigmergy capability registration
 * (Audit Finding 26).
 *
 * Timer access goes through `src/core/utils/runtime.ts` so the cross-env
 * `globalThis` fallback lives in exactly one place (review-bot Tier 3).
 */

import { safeSetTimeout, safeClearTimeout } from './runtime';

export class TimeoutError extends Error {
    constructor(public readonly label: string, public readonly ms: number) {
        super(`Timeout after ${ms}ms: ${label}`);
        this.name = 'TimeoutError';
    }
}

export function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = safeSetTimeout(() => {
            reject(new TimeoutError(label, ms));
        }, ms);
        promise.then(
            (value) => {
                safeClearTimeout(timer);
                resolve(value);
            },
            (err: unknown) => {
                safeClearTimeout(timer);
                // Re-wrap non-Error rejections so the promise contract
                // (`@typescript-eslint/prefer-promise-reject-errors`) holds
                // even when the inner promise rejected with a string or
                // a plain object.
                reject(err instanceof Error ? err : new Error(String(err)));
            },
        );
    });
}
