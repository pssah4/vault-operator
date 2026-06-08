/**
 * NoticeCapture -- transient monkey-patch around `window.Notice` so the
 * tool layer can record everything a plugin announces during a single
 * `executeCommandById` call.
 *
 * FEAT-29-04 / ADR-125. Why monkey-patch instead of an Obsidian-native
 * listener: there is no `app.on("notice")`. The only choke point is the
 * Notice constructor that Obsidian and every community plugin import
 * from the `obsidian` module. The constructor writes its argument to
 * `window.Notice`, so a temporary replacement at the global level
 * captures every Notice raised by every plugin for the patch window.
 *
 * Safety properties:
 *
 *  - Restore on exit (try/finally). Even if the wrapped function throws,
 *    `window.Notice` returns to its original constructor before this
 *    function returns.
 *  - Fail-soft. If `window` or `window.Notice` is not patchable (e.g.
 *    in a non-DOM test environment), the wrapped function runs without
 *    capture and the returned `notices` array is empty.
 *  - Async tail-window. Many plugins raise their notices a few ticks
 *    after `executeCommandById` resolves. We keep the patch active for
 *    `tailMs` (default 250 ms) past the wrapped function so async
 *    notices get caught too.
 *  - Sensitive-data filter. Notices whose text matches /token|secret|key/i
 *    are replaced with a redaction marker so we never write tokens to
 *    tool_result.
 *  - Truncation. After `maxCaptures` (default 100) captured notices the
 *    capture stops and a single overflow marker is appended.
 */

import { safeSetTimeout } from './runtime';

export interface CapturedNotice {
    text: string;
    likely_severity: 'success' | 'warning' | 'error' | 'unknown';
    redacted: boolean;
    /** ms since the wrapped function started. Useful for the agent to
     *  reason about ordering when many notices arrive. */
    t_ms: number;
}

export interface NoticeCaptureResult<T> {
    result: T | undefined;
    notices: CapturedNotice[];
    truncated: boolean;
    capturedError: Error | null;
    /** True when the monkey-patch could not attach -- caller may want
     *  to surface a "no capture in this environment" hint. */
    patchSkipped: boolean;
}

export interface NoticeCaptureOptions {
    /** ms to keep the patch active after the wrapped function settles
     *  so async notices land in the capture too. Default 250. */
    tailMs?: number;
    /** Hard cap on captured notice count. Default 100. */
    maxCaptures?: number;
}

/**
 * AUDIT-FEAT-29-03+04 I-1 fix: catch both explicit keyword mentions
 * (token/secret/key/password/bearer/pat/auth) and naked token formats
 * (GitHub `ghp_*`, OpenAI `sk-*`, JWT `eyJ*`, generic 32+ hex). The format
 * patterns catch leaks even when a plugin spells the key without naming
 * the field.
 */
const SENSITIVE_PATTERN_KEYWORDS =
    /\b(token|secret|key|password|api[-_ ]?key|bearer|pat|auth(?:orization)?)\b/i;
const SENSITIVE_PATTERN_TOKEN_FORMATS =
    /\b(ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9._-]{20,}|[0-9a-f]{32,})\b/;

function isSensitiveText(text: string): boolean {
    return SENSITIVE_PATTERN_KEYWORDS.test(text) || SENSITIVE_PATTERN_TOKEN_FORMATS.test(text);
}

/** AUDIT-FEAT-29-03+04 L-2 fix: per-notice text bound. 500 chars is generous
 *  for legit user-facing notices; large debug strings and stack traces get
 *  truncated with a clear marker. */
const MAX_NOTICE_TEXT_CHARS = 500;

/** AUDIT-FEAT-29-03+04 M-1 fix: module-level singleton to prevent two
 *  concurrent `withNoticeCapture` calls from corrupting the global Notice
 *  reference. The first caller patches; nested callers run fail-soft (no
 *  capture) until the first one finishes restoring. */
let activePatch: { token: symbol } | null = null;
const ERROR_PATTERN = /\b(error|fail|cannot|not found|missing|invalid)\b/i;
const WARNING_PATTERN = /\b(warning|warn|deprecated|caution)\b/i;
const SUCCESS_PATTERN = /\b(success|saved|created|done|copied|exported|completed)\b/i;

function classifySeverity(text: string): CapturedNotice['likely_severity'] {
    if (ERROR_PATTERN.test(text)) return 'error';
    if (WARNING_PATTERN.test(text)) return 'warning';
    if (SUCCESS_PATTERN.test(text)) return 'success';
    return 'unknown';
}

/**
 * Run `fn` with `window.Notice` monkey-patched so every notice raised
 * during the call lands in the returned `notices` array.
 *
 * Exposed as `(globalRef, fn, options)` instead of a closure over
 * `globalThis` so unit tests can inject a fake global with a Notice
 * constructor stub. Production callers pass `globalThis`.
 */
export async function withNoticeCapture<T>(
    globalRef: { Notice?: unknown },
    fn: () => Promise<T> | T,
    options: NoticeCaptureOptions = {},
): Promise<NoticeCaptureResult<T>> {
    const tailMs = options.tailMs ?? 250;
    const maxCaptures = options.maxCaptures ?? 100;
    const notices: CapturedNotice[] = [];
    let truncated = false;
    let patchSkipped = false;
    const t0 = Date.now();

    const OriginalNotice = globalRef.Notice as
        | (new (msg: string | DocumentFragment, timeout?: number) => unknown) & { prototype: object }
        | undefined;

    if (!OriginalNotice || typeof OriginalNotice !== 'function') {
        patchSkipped = true;
        let result: T | undefined;
        let capturedError: Error | null = null;
        try {
            result = await fn();
        } catch (e) {
            capturedError = e instanceof Error ? e : new Error(String(e));
        }
        return { result, notices, truncated, capturedError, patchSkipped };
    }

    // AUDIT-FEAT-29-03+04 M-1: a second caller during the tail-window of
    // an active capture would otherwise read the already-patched Notice
    // as its "original", chain the patches, and corrupt the global on
    // restore. Detect via the module-level singleton and fail-soft
    // (run fn without capture). The first caller's notices stay intact.
    if (activePatch !== null) {
        patchSkipped = true;
        let result: T | undefined;
        let capturedError: Error | null = null;
        try {
            result = await fn();
        } catch (e) {
            capturedError = e instanceof Error ? e : new Error(String(e));
        }
        return { result, notices, truncated, capturedError, patchSkipped };
    }
    const ownToken = Symbol('notice-capture-token');
    activePatch = { token: ownToken };

    const recordNotice = (raw: unknown): void => {
        if (notices.length >= maxCaptures) {
            truncated = true;
            return;
        }
        const rawText = typeof raw === 'string'
            ? raw
            : (raw && typeof raw === 'object' && 'textContent' in raw && typeof (raw as { textContent?: unknown }).textContent === 'string'
                ? (raw as { textContent: string }).textContent
                : String(raw));
        // AUDIT-FEAT-29-03+04 L-2: trim per-notice text so a plugin that
        // dumps a 50 KB stack trace into a Notice does not bloat tool_result.
        const text = rawText.length > MAX_NOTICE_TEXT_CHARS
            ? rawText.slice(0, MAX_NOTICE_TEXT_CHARS) + '... [truncated]'
            : rawText;
        const redacted = isSensitiveText(text);
        notices.push({
            text: redacted ? '[redacted notice text -- contained sensitive keyword or token format]' : text,
            likely_severity: redacted ? 'unknown' : classifySeverity(text),
            redacted,
            t_ms: Date.now() - t0,
        });
    };

    // Wrapping the Notice constructor: must behave like the original so
    // plugins that inspect the returned instance keep working. We delegate
    // construction back to the original and record the message on the side.
    function PatchedNotice(this: unknown, msg: string | DocumentFragment, timeout?: number): unknown {
        try { recordNotice(msg); } catch { /* never let capture break a plugin */ }
        // `new OriginalNotice(...)` is the production path; in jsdom-free test
        // envs the stub returns nothing and that's fine.
        try {
            return new (OriginalNotice as new (...a: unknown[]) => unknown)(msg, timeout);
        } catch {
            return undefined;
        }
    }
    // Mirror the prototype so `instanceof Notice` checks in plugins keep
    // working while the patch is active.
    PatchedNotice.prototype = (OriginalNotice as { prototype: object }).prototype;

    let result: T | undefined;
    let capturedError: Error | null = null;
    try {
        globalRef.Notice = PatchedNotice;
        try {
            result = await fn();
        } catch (e) {
            capturedError = e instanceof Error ? e : new Error(String(e));
        }
        // Keep patch active for the async tail window so plugins that
        // raise notices after their command returns still land in capture.
        if (tailMs > 0) {
            // safeSetTimeout centralises the renderer/node-test fallback in
            // src/core/utils/runtime.ts so this file does not need to
            // reference globalThis directly (review-bot Tier 3).
            await new Promise<void>((res) => {
                safeSetTimeout(() => res(), tailMs);
            });
        }
    } finally {
        // Restore in finally so a throw still puts the original back.
        // M-1 fix: only clear `activePatch` when WE are the active patcher.
        // A defensive guard in case a future caller manages to set
        // activePatch concurrently despite the head-of-function check.
        globalRef.Notice = OriginalNotice;
        if (activePatch !== null && activePatch.token === ownToken) {
            activePatch = null;
        }
    }

    return { result, notices, truncated, capturedError, patchSkipped };
}
