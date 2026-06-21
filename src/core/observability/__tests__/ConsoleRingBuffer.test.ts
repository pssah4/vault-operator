/**
 * REF-11: regression tests for ConsoleRingBuffer.
 *
 * The ring buffer is the source of read_agent_logs and powers the
 * agent's ability to inspect its own debug output. These tests pin:
 *   - install()/uninstall() swap console.debug/warn/error symmetrically
 *   - originals are still called (capture is non-destructive)
 *   - ring overflow drops oldest entries
 *   - query() honours level / since / pattern / limit
 *   - currentTool labelling carries through to LogEntry.correlatedTool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsoleRingBuffer } from '../ConsoleRingBuffer';

describe('ConsoleRingBuffer', () => {
    let buf: ConsoleRingBuffer;
    let origDebug: typeof console.debug;
    let origWarn: typeof console.warn;
    let origError: typeof console.error;

    beforeEach(() => {
        origDebug = console.debug;
        origWarn = console.warn;
        origError = console.error;
        buf = new ConsoleRingBuffer(4); // tiny ring for overflow tests
    });

    afterEach(() => {
        try { buf.uninstall(); } catch { /* ignore */ }
        console.debug = origDebug;
        console.warn = origWarn;
        console.error = origError;
    });

    describe('install / uninstall', () => {
        it('captures debug/warn/error after install', () => {
            buf.install();
            console.debug('one');
            console.warn('two');
            console.error('three');
            const all = buf.query();
            expect(all.map((e) => e.level)).toEqual(['debug', 'warn', 'error']);
            expect(all.map((e) => e.message)).toEqual(['one', 'two', 'three']);
        });

        it('restores originals on uninstall', () => {
            buf.install();
            const installedDebug = console.debug;
            buf.uninstall();
            expect(console.debug).not.toBe(installedDebug);
            // After uninstall the buffer should not capture anymore.
            console.debug('after-uninstall');
            expect(buf.size).toBe(0);
        });

        it('install is idempotent', () => {
            buf.install();
            const first = console.debug;
            buf.install();
            expect(console.debug).toBe(first);
        });

        it('still forwards to the original console methods', () => {
            const debugSpy = vi.fn();
            console.debug = debugSpy;
            buf.install();
            console.debug('hello');
            expect(debugSpy).toHaveBeenCalledTimes(1);
            expect(debugSpy).toHaveBeenCalledWith('hello');
        });
    });

    describe('ring overflow', () => {
        it('drops the oldest entry when maxEntries is reached', () => {
            buf.install();
            for (let i = 0; i < 6; i++) console.debug(`msg-${i}`);
            // maxEntries=4 -> first two dropped, last four kept.
            const messages = buf.query().map((e) => e.message);
            expect(messages).toEqual(['msg-2', 'msg-3', 'msg-4', 'msg-5']);
        });
    });

    describe('query filters', () => {
        beforeEach(() => {
            buf.install();
            console.debug('alpha');
            console.warn('beta');
            console.error('gamma');
        });

        it('filters by level', () => {
            expect(buf.query({ level: 'warn' }).map((e) => e.message)).toEqual(['beta']);
        });

        it('filters by pattern (case-insensitive)', () => {
            const found = buf.query({ pattern: 'ALPHA' });
            expect(found.map((e) => e.message)).toEqual(['alpha']);
        });

        it('respects the limit (takes the last N entries)', () => {
            const found = buf.query({ limit: 2 });
            expect(found.map((e) => e.message)).toEqual(['beta', 'gamma']);
        });
    });

    describe('correlatedTool', () => {
        it('attaches the currentTool label to subsequent entries', () => {
            buf.install();
            buf.setCurrentTool('write_file');
            console.debug('during-write');
            buf.setCurrentTool(null);
            console.debug('outside-write');
            const entries = buf.query();
            expect(entries[0]?.correlatedTool).toBe('write_file');
            expect(entries[1]?.correlatedTool).toBeUndefined();
        });
    });

    describe('clear', () => {
        it('empties the buffer', () => {
            buf.install();
            console.debug('keep');
            expect(buf.size).toBe(1);
            buf.clear();
            expect(buf.size).toBe(0);
        });
    });
});
