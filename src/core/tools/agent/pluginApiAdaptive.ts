/**
 * pluginApiAdaptive -- FEAT-29-07.
 *
 * Pure helpers for adaptive timeouts + auto-promotion of dynamically
 * discovered (Tier-2) plugin-API methods. The functions are
 * deliberately settings-only (no I/O, no Obsidian imports) so the
 * tests pin every branch without a vault.
 */

import type { PluginApiSettings } from '../../../types/settings';
import { isSafePathSegment } from '../../utils/safePathName';

/** Default API-call timeout when nothing more specific is configured. */
export const DEFAULT_API_TIMEOUT_MS = 10_000;
/** Hard upper bound. Spec NFR: max 5 minutes to prevent endless hangs. */
export const MAX_API_TIMEOUT_MS = 5 * 60 * 1000;
/** Default approval count before auto-promotion fires. */
export const DEFAULT_AUTO_PROMOTION_THRESHOLD = 3;

/**
 * Methods whose name matches one of these read-prefixes are
 * classified as read-only. Heuristic; the user can always override
 * via safeMethodOverrides.
 */
const READ_PREFIX_RE =
    /^(get|list|find|query|fetch|read|search|count|has|is|describe|enumerate|peek|browse)([A-Z0-9_].*|s$|es$|$)/;

/**
 * Classify a method name as read (returns false) or write (returns
 * true) using a name-prefix heuristic.
 *
 * False -> read-only (auto-promotable to safeMethodOverrides[true])
 * True  -> write or unknown -> default to "needs approval"
 */
export function classifyMethodIsWrite(method: string): boolean {
    if (!method || typeof method !== 'string') return true;
    return !READ_PREFIX_RE.test(method);
}

/**
 * Resolve the timeout (in ms) for a plugin API call. Precedence:
 *   1. settings.pluginApi.pluginTimeoutMs[pluginId]
 *   2. settings.pluginApi.defaultTimeoutMs
 *   3. DEFAULT_API_TIMEOUT_MS
 *
 * Any value is clamped to [1000, MAX_API_TIMEOUT_MS].
 */
export function resolveTimeoutMs(
    settings: PluginApiSettings | undefined,
    pluginId: string,
): number {
    const perPlugin = settings?.pluginTimeoutMs?.[pluginId];
    const fallback = settings?.defaultTimeoutMs;
    const candidate = perPlugin ?? fallback ?? DEFAULT_API_TIMEOUT_MS;
    if (!Number.isFinite(candidate) || candidate <= 0) return DEFAULT_API_TIMEOUT_MS;
    return Math.min(Math.max(candidate, 1000), MAX_API_TIMEOUT_MS);
}

/**
 * Build the `pluginId:method` storage key. Exported for tests.
 *
 * AUDIT-EPIC-29 L-2 fix: throws when either input fails the
 * path-segment whitelist. Without the guard a pluginId containing `:`
 * would collide with another `(pluginId, method)` pair via key
 * reinterpretation.
 */
export function approvalKey(pluginId: string, method: string): string {
    if (!isSafePathSegment(pluginId)) {
        throw new Error(`Unsafe pluginId rejected by approvalKey guard: ${JSON.stringify(pluginId)}`);
    }
    if (!isSafePathSegment(method)) {
        throw new Error(`Unsafe method rejected by approvalKey guard: ${JSON.stringify(method)}`);
    }
    return `${pluginId}:${method}`;
}

export interface PromotionResult {
    promoted: boolean;
    newCount: number;
    reason: 'disabled' | 'already-promoted' | 'write-method' | 'below-threshold' | 'promoted';
}

/**
 * Record one user-approval for a Tier-2 plugin-API call. When the
 * approval count reaches the threshold AND the method name passes the
 * read heuristic, the method is promoted into safeMethodOverrides
 * (key set to true). Subsequent calls then skip the approval prompt.
 *
 * The settings object is mutated in-place so the caller can persist
 * it with a single saveSettings() afterwards. Returns a structured
 * result for telemetry / logging.
 */
export function recordApprovalAndMaybePromote(
    settings: PluginApiSettings,
    pluginId: string,
    method: string,
): PromotionResult {
    if (settings.autoPromotionEnabled === false) {
        return { promoted: false, newCount: 0, reason: 'disabled' };
    }
    // AUDIT-EPIC-29 L-2 + L-4: reject unsafe input names rather than
    // letting them pollute settings keys. Silent skip via 'disabled'-style
    // result so the caller does not need to handle a thrown exception
    // in the hot approval path.
    if (!isSafePathSegment(pluginId) || !isSafePathSegment(method)) {
        return { promoted: false, newCount: 0, reason: 'disabled' };
    }
    const key = approvalKey(pluginId, method);

    settings.approvalCounts = settings.approvalCounts ?? {};
    const prev = settings.approvalCounts[key] ?? 0;
    const newCount = prev + 1;
    settings.approvalCounts[key] = newCount;

    settings.safeMethodOverrides = settings.safeMethodOverrides ?? {};
    if (settings.safeMethodOverrides[key]) {
        // Already promoted earlier; we still count to give the user a
        // signal in the UI, but the promotion is a no-op.
        return { promoted: false, newCount, reason: 'already-promoted' };
    }

    if (classifyMethodIsWrite(method)) {
        return { promoted: false, newCount, reason: 'write-method' };
    }

    const threshold = settings.autoPromotionThreshold ?? DEFAULT_AUTO_PROMOTION_THRESHOLD;
    if (newCount < threshold) {
        return { promoted: false, newCount, reason: 'below-threshold' };
    }

    settings.safeMethodOverrides[key] = true;
    return { promoted: true, newCount, reason: 'promoted' };
}
