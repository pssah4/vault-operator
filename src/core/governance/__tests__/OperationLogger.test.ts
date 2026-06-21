/**
 * REF-11: regression tests for OperationLogger.sanitizeParams.
 *
 * The logger persists tool-call audit entries to a JSONL file. The
 * sanitiseParams step is the security-relevant boundary -- credentials,
 * file content and overlong values must be stripped before they hit
 * the persistent log. These tests pin every documented redaction rule.
 *
 * sanitizeParams is private; we reach it through the public `log()`
 * API so the test exercises the real wire path. A minimal fake
 * FileAdapter captures the JSONL line for inspection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OperationLogger } from '../OperationLogger';

class FakeAdapter {
    files = new Map<string, string>();
    async exists(p: string): Promise<boolean> { return this.files.has(p); }
    async mkdir(_p: string): Promise<void> { /* no-op */ }
    async write(p: string, content: string): Promise<void> { this.files.set(p, content); }
    async append(p: string, content: string): Promise<void> {
        const prev = this.files.get(p) ?? '';
        this.files.set(p, prev + content);
    }
    async read(p: string): Promise<string> {
        const v = this.files.get(p);
        if (v === undefined) throw new Error('ENOENT');
        return v;
    }
    async readBinary(_p: string): Promise<ArrayBuffer> { throw new Error('binary not used'); }
    async writeBinary(_p: string, _data: ArrayBuffer): Promise<void> { /* not used */ }
    async remove(_p: string): Promise<void> { /* not used */ }
    async list(_p: string): Promise<{ files: string[]; folders: string[] }> { return { files: [], folders: [] }; }
    async rmdir(_p: string, _recursive: boolean): Promise<void> { /* not used */ }
}

async function lastEntry(fa: FakeAdapter): Promise<Record<string, unknown>> {
    const entries = Array.from(fa.files.values()).flatMap((c) => c.split('\n').filter(Boolean));
    return JSON.parse(entries[entries.length - 1]) as Record<string, unknown>;
}

describe('OperationLogger.sanitizeParams (REF-11)', () => {
    let fa: FakeAdapter;
    let logger: OperationLogger;

    beforeEach(async () => {
        fa = new FakeAdapter();
        // The OperationLogger type expects a FileAdapter but the runtime
        // contract is duck-typed: exists/mkdir/write/append/read.
        logger = new OperationLogger(fa as unknown as ConstructorParameters<typeof OperationLogger>[0]);
        await logger.initialize();
    });

    function makeBaseEntry(params: Record<string, unknown>): Parameters<typeof logger.log>[0] {
        return {
            timestamp: new Date().toISOString(),
            taskId: 'task-1',
            mode: 'agent',
            tool: 'test_tool',
            params,
            success: true,
            durationMs: 1,
        };
    }

    it('redacts sensitive keys (password, token, api_key, secret, key, auth, authorization)', async () => {
        await logger.log(makeBaseEntry({
            password: 'hunter2',
            token: 'abc',
            api_key: 'sk-...',
            secret: 'shh',
            key: 'k',
            auth: 'Bearer ...',
            authorization: 'Basic ...',
            other: 'kept',
        }));
        const entry = await lastEntry(fa);
        const p = entry.params as Record<string, unknown>;
        expect(p.password).toBe('[REDACTED]');
        expect(p.token).toBe('[REDACTED]');
        expect(p.api_key).toBe('[REDACTED]');
        expect(p.secret).toBe('[REDACTED]');
        expect(p.key).toBe('[REDACTED]');
        expect(p.auth).toBe('[REDACTED]');
        expect(p.authorization).toBe('[REDACTED]');
        expect(p.other).toBe('kept');
    });

    it('replaces file-content keys with their length', async () => {
        const longText = 'A'.repeat(1234);
        await logger.log(makeBaseEntry({
            content: longText,
            new_str: 'short',
            old_str: 'abc',
        }));
        const p = (await lastEntry(fa)).params as Record<string, unknown>;
        expect(p.content).toBe('[1234 chars]');
        expect(p.new_str).toBe('[5 chars]');
        expect(p.old_str).toBe('[3 chars]');
    });

    it('strips userinfo from url values', async () => {
        await logger.log(makeBaseEntry({
            url: 'https://alice:secret@example.com/path?q=1',
        }));
        const p = (await lastEntry(fa)).params as Record<string, unknown>;
        expect(p.url).toBe('https://example.com/path?q=1');
    });

    it('replaces invalid urls with [INVALID_URL]', async () => {
        await logger.log(makeBaseEntry({ url: 'not a url' }));
        const p = (await lastEntry(fa)).params as Record<string, unknown>;
        expect(p.url).toBe('[INVALID_URL]');
    });

    it('truncates overlong string values', async () => {
        const long = 'B'.repeat(800);
        await logger.log(makeBaseEntry({ note: long }));
        const p = (await lastEntry(fa)).params as Record<string, unknown>;
        expect(typeof p.note).toBe('string');
        expect((p.note as string).length).toBeLessThanOrEqual(501);
        expect((p.note as string).endsWith('…')).toBe(true);
    });

    it('passes short strings through untouched', async () => {
        await logger.log(makeBaseEntry({ note: 'short value' }));
        const p = (await lastEntry(fa)).params as Record<string, unknown>;
        expect(p.note).toBe('short value');
    });

    it('truncates a long result field', async () => {
        const long = 'C'.repeat(3000);
        await logger.log({
            ...makeBaseEntry({}),
            result: long,
        });
        const entry = await lastEntry(fa);
        expect(typeof entry.result).toBe('string');
        expect((entry.result as string)).toMatch(/\[truncated\]$/);
    });
});
