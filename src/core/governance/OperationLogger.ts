/**
 * OperationLogger - Persistent JSONL audit trail (Sprint 1.7)
 *
 * Logs every tool execution to daily JSONL files.
 * Format: one JSON object per line, one file per day.
 * Rotation: keeps last 30 days, deletes older files.
 *
 * Storage: .obsidian/plugins/vault-operator/logs/YYYY-MM-DD.jsonl
 */

import { Notice } from 'obsidian';
import type { FileAdapter } from '../storage/types';

export interface LogEntry {
    timestamp: string;
    taskId: string;
    mode: string;
    tool: string;
    params: Record<string, unknown>;
    result?: string;
    success: boolean;
    durationMs: number;
    error?: string;
}

/**
 * Credential-shaped key segments. Matches camelCase and snake_case variants:
 * apiKey, api_key, awsAccessKey, accessToken, refreshToken, sessionToken,
 * clientSecret, gatewayHeaderValue, passphrase, bearer, credential, authoriz, etc.
 */
const CREDENTIAL_KEY_PATTERN =
    /(password|passphrase|secret|bearer|credential|authoriz|^auth$|api[_-]?key|access[_-]?key|secret[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|gateway[_-]?header[_-]?value|chatgptoauth|subscription[_-]?key|client[_-]?secret)/i;

/**
 * Whole-block redaction targets. Headers and cookies are containers of
 * credentials so we never want their nested values in the log.
 */
const BLOCK_REDACTION_KEYS = new Set([
    'headers',
    'request_headers',
    'requestheaders',
    'http_headers',
    'httpheaders',
    'cookies',
    'cookie',
    'set-cookie',
    'credentials',
    'providerconfigs',
]);

/**
 * Well-known credential value patterns. Conservative list, only matches
 * shapes that cannot be confused with normal text.
 */
const VALUE_TOKEN_PATTERNS: RegExp[] = [
    /\bBearer\s+[A-Za-z0-9._-]+/gi,
    /\bsk-[A-Za-z0-9_-]{16,}/g,
    /\bxox[bpoasr]-[A-Za-z0-9-]{8,}/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
];

const REDACTED = '[REDACTED]';
const INVALID_URL = '[INVALID_URL]';
const MAX_RECURSE_DEPTH = 4;

export class OperationLogger {
    private fs: FileAdapter;
    private logDir: string;
    private readonly MAX_LOG_DAYS = 30;
    private readonly MAX_RESULT_LEN = 2000;

    // L-12: surface logger write failures instead of swallowing them.
    private failedWrites = 0;
    private failureNoticeShown = false;
    private lastFailureMessage: string | undefined;
    private readonly FAILURE_NOTICE_THRESHOLD = 1;

    constructor(fs: FileAdapter) {
        this.fs = fs;
        this.logDir = 'logs';
    }

    /**
     * Initialize the log directory (create if needed).
     */
    async initialize(): Promise<void> {
        try {
            const exists = await this.fs.exists(this.logDir);
            if (!exists) {
                await this.fs.mkdir(this.logDir);
            }
        } catch (e) {
            console.warn('[OperationLogger] Failed to create log directory:', e);
        }
    }

    /**
     * H-5 + M-12: Sanitize tool parameters before persisting to audit log.
     * Prevents sensitive data (file contents, credentials, long strings) from
     * being stored in plain-text JSONL files.
     *
     * Walks nested objects and arrays up to MAX_RECURSE_DEPTH. Catches camelCase
     * credential keys (apiKey, accessToken, clientSecret, awsSessionToken,
     * gatewayHeaderValue, chatgptOAuth*, providerConfigs[].credentials.*) plus
     * whole header / cookie blocks. Values are additionally scanned for
     * well-known token shapes (Bearer, sk-, ghp_, AKIA, ...).
     */
    private sanitizeParams(_tool: string, params: Record<string, unknown>): Record<string, unknown> {
        const visited = new WeakSet<object>();
        const out = this.sanitizeValue(params, '', 0, visited);
        // Top-level must be a plain object for downstream consumers.
        if (out !== null && typeof out === 'object' && !Array.isArray(out)) {
            return out as Record<string, unknown>;
        }
        return {};
    }

    private sanitizeValue(value: unknown, key: string, depth: number, visited: WeakSet<object>): unknown {
        // Key-driven redactions take precedence over value type.
        const lk = key.toLowerCase();

        if (this.shouldRedactBlock(lk)) {
            return REDACTED;
        }

        if (key && this.shouldRedactKey(lk)) {
            return REDACTED;
        }

        if (key && this.isContentKey(lk)) {
            return `[${typeof value === 'string' ? value.length : '?'} chars]`;
        }

        // URL fields: strip userinfo, keep rest visible.
        if (key && lk === 'url' && typeof value === 'string') {
            try {
                const u = new URL(value);
                u.username = '';
                u.password = '';
                return u.toString();
            } catch {
                return INVALID_URL;
            }
        }

        if (value === null || value === undefined) {
            return value;
        }

        if (typeof value === 'string') {
            return this.scrubAndTruncateString(value);
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }

        if (depth >= MAX_RECURSE_DEPTH) {
            return '[TRUNCATED_DEPTH]';
        }

        if (Array.isArray(value)) {
            if (visited.has(value)) return '[CIRCULAR]';
            visited.add(value);
            return value.map((item) => this.sanitizeValue(item, '', depth + 1, visited));
        }

        if (typeof value === 'object') {
            const obj = value as Record<string, unknown>;
            if (visited.has(obj)) return '[CIRCULAR]';
            visited.add(obj);
            const result: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(obj)) {
                result[k] = this.sanitizeValue(v, k, depth + 1, visited);
            }
            return result;
        }

        // Unknown primitive (bigint, symbol, function) -> coerce to string.
        if (typeof value === 'bigint') return value.toString();
        if (typeof value === 'symbol') return value.toString();
        if (typeof value === 'function') return '[function]';
        return '[unknown]';
    }

    private shouldRedactKey(lowerKey: string): boolean {
        return CREDENTIAL_KEY_PATTERN.test(lowerKey);
    }

    private shouldRedactBlock(lowerKey: string): boolean {
        return BLOCK_REDACTION_KEYS.has(lowerKey);
    }

    private isContentKey(lowerKey: string): boolean {
        return lowerKey === 'content' || lowerKey === 'new_str' || lowerKey === 'old_str';
    }

    private scrubAndTruncateString(value: string): string {
        const MAX_VALUE_LEN = 500;
        let scrubbed = value;
        for (const pattern of VALUE_TOKEN_PATTERNS) {
            scrubbed = scrubbed.replace(pattern, REDACTED);
        }
        if (scrubbed.length > MAX_VALUE_LEN) {
            return scrubbed.slice(0, MAX_VALUE_LEN) + '…';
        }
        return scrubbed;
    }

    /**
     * Log a tool operation.
     * Uses adapter.append() for true O(1) appends — no full-file rewrite needed.
     */
    async log(entry: LogEntry): Promise<void> {
        try {
            const today = this.getToday();
            const logPath = `${this.logDir}/${today}.jsonl`;
            const sanitizedResult = entry.result
                ? (entry.result.length > this.MAX_RESULT_LEN
                    ? entry.result.slice(0, this.MAX_RESULT_LEN) + '...[truncated]'
                    : entry.result)
                : undefined;
            const sanitized = {
                ...entry,
                params: this.sanitizeParams(entry.tool, entry.params),
                result: sanitizedResult,
            };
            const line = JSON.stringify(sanitized) + '\n';

            const exists = await this.fs.exists(logPath);
            if (!exists) {
                // New day file: create it and rotate old logs asynchronously
                await this.fs.write(logPath, line);
                this.rotateLogs().catch((e) =>
                    console.warn('[OperationLogger] Rotation error:', e)
                );
            } else {
                await this.fs.append(logPath, line);
            }
        } catch (e) {
            // Logging must never break agent execution, but the audit gap MUST be visible.
            this.recordWriteFailure(e);
        }
    }

    /**
     * L-12: Surface logger write failures via Notice + counter.
     * LogTab can call getFailedWriteCount() / getLastFailureMessage() to render an inline banner.
     */
    private recordWriteFailure(err: unknown): void {
        this.failedWrites++;
        const msg = err instanceof Error ? err.message : String(err);
        this.lastFailureMessage = msg;
        console.warn('[OperationLogger] Failed to write log entry:', err);

        if (!this.failureNoticeShown && this.failedWrites >= this.FAILURE_NOTICE_THRESHOLD) {
            this.failureNoticeShown = true;
            try {
                new Notice(
                    'Vault Operator: audit log write failed. Operations continue, but the audit trail has a gap. Check the log tab.',
                    8000
                );
            } catch {
                // Notice unavailable (test harness) -- counter still increments.
            }
            // Best-effort sentinel so a forensic check finds the gap on disk.
            void this.writeFailureSentinel(msg);
        }
    }

    private async writeFailureSentinel(reason: string): Promise<void> {
        try {
            const sentinelPath = `${this.logDir}/.failures-${this.getToday()}`;
            const stamp = new Date().toISOString();
            const line = `${stamp} ${reason}\n`;
            const exists = await this.fs.exists(sentinelPath);
            if (exists) {
                await this.fs.append(sentinelPath, line);
            } else {
                await this.fs.write(sentinelPath, line);
            }
        } catch {
            // If even the sentinel fails the disk is gone; the Notice already fired.
        }
    }

    /**
     * Number of log-write failures since plugin start.
     * LogTab uses this to render an inline banner.
     */
    getFailedWriteCount(): number {
        return this.failedWrites;
    }

    /**
     * Last write-failure message, for diagnostics in the Log tab.
     */
    getLastFailureMessage(): string | undefined {
        return this.lastFailureMessage;
    }

    /**
     * Reset the failure counters. Intended for the LogTab "dismiss" action.
     */
    clearFailureState(): void {
        this.failedWrites = 0;
        this.failureNoticeShown = false;
        this.lastFailureMessage = undefined;
    }

    /**
     * Read log entries for a specific date (YYYY-MM-DD).
     */
    async readLog(date: string): Promise<LogEntry[]> {
        const logPath = `${this.logDir}/${date}.jsonl`;
        try {
            const exists = await this.fs.exists(logPath);
            if (!exists) return [];
            const content = await this.fs.read(logPath);
            return content
                .split('\n')
                .filter((line) => line.trim().length > 0)
                .map((line) => { try { return JSON.parse(line) as LogEntry; } catch { return null; } })
                .filter((entry): entry is LogEntry => entry !== null);
        } catch {
            return [];
        }
    }

    /**
     * Get available log dates (newest first).
     */
    async getLogDates(): Promise<string[]> {
        try {
            const listed = await this.fs.list(this.logDir);
            return listed.files
                .map((f) => f.replace(`${this.logDir}/`, '').replace('.jsonl', ''))
                .filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name))
                .sort()
                .reverse();
        } catch {
            return [];
        }
    }

    /**
     * Read raw JSONL content for a specific date (for download).
     */
    async readRawLog(date: string): Promise<string | null> {
        const logPath = `${this.logDir}/${date}.jsonl`;
        try {
            const exists = await this.fs.exists(logPath);
            if (!exists) return null;
            return await this.fs.read(logPath);
        } catch {
            return null;
        }
    }

    /**
     * Delete all log files.
     */
    async clearLogs(): Promise<void> {
        const dates = await this.getLogDates();
        for (const date of dates) {
            try {
                await this.fs.remove(`${this.logDir}/${date}.jsonl`);
            } catch {
                // Ignore individual delete failures
            }
        }
    }

    // -------------------------------------------------------------------------

    private getToday(): string {
        const now = new Date();
        return now.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    private async rotateLogs(): Promise<void> {
        const dates = await this.getLogDates();
        if (dates.length <= this.MAX_LOG_DAYS) return;

        // Delete oldest files beyond retention limit
        const toDelete = dates.slice(this.MAX_LOG_DAYS);
        for (const date of toDelete) {
            try {
                await this.fs.remove(`${this.logDir}/${date}.jsonl`);
                console.debug(`[OperationLogger] Rotated old log: ${date}`);
            } catch {
                // Ignore
            }
        }
    }
}
