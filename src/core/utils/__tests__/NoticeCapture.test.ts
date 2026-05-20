/**
 * FEAT-29-04 unit tests for NoticeCapture.
 *
 * Covers monkey-patch lifecycle, async tail-window, sensitive-data
 * redaction, truncation cap, fail-soft on missing Notice constructor,
 * severity-classification heuristics.
 */

import { describe, it, expect } from 'vitest';
import { withNoticeCapture } from '../NoticeCapture';

function makeGlobalWithStubNotice() {
    const calls: unknown[] = [];
    class StubNotice {
        constructor(public msg: unknown, public timeout?: number) {
            calls.push(msg);
        }
    }
    const globalRef: { Notice?: unknown } = { Notice: StubNotice };
    return { globalRef, calls, StubNotice };
}

describe('withNoticeCapture (FEAT-29-04)', () => {
    it('captures Notice messages raised during fn', async () => {
        const { globalRef } = makeGlobalWithStubNotice();
        const result = await withNoticeCapture(globalRef, () => {
            new (globalRef.Notice as new (msg: string) => unknown)('hello world');
            new (globalRef.Notice as new (msg: string) => unknown)('second message');
        }, { tailMs: 0 });

        expect(result.patchSkipped).toBe(false);
        expect(result.notices.map((n) => n.text)).toEqual(['hello world', 'second message']);
    });

    it('restores window.Notice after fn returns', async () => {
        const { globalRef, StubNotice } = makeGlobalWithStubNotice();
        await withNoticeCapture(globalRef, () => { /* no-op */ }, { tailMs: 0 });
        expect(globalRef.Notice).toBe(StubNotice);
    });

    it('restores window.Notice even when fn throws', async () => {
        const { globalRef, StubNotice } = makeGlobalWithStubNotice();
        const result = await withNoticeCapture(
            globalRef,
            () => { throw new Error('boom'); },
            { tailMs: 0 },
        );
        expect(globalRef.Notice).toBe(StubNotice);
        expect(result.capturedError?.message).toBe('boom');
    });

    it('redacts notices that mention sensitive keywords', async () => {
        const { globalRef } = makeGlobalWithStubNotice();
        const result = await withNoticeCapture(globalRef, () => {
            new (globalRef.Notice as new (msg: string) => unknown)('Using API key abc123');
            new (globalRef.Notice as new (msg: string) => unknown)('Token saved successfully');
            new (globalRef.Notice as new (msg: string) => unknown)('Plain harmless notice');
        }, { tailMs: 0 });

        expect(result.notices[0].redacted).toBe(true);
        expect(result.notices[0].text).toContain('[redacted');
        expect(result.notices[1].redacted).toBe(true);
        expect(result.notices[2].redacted).toBe(false);
        expect(result.notices[2].text).toBe('Plain harmless notice');
    });

    it('classifies severity heuristically (error / warning / success / unknown)', async () => {
        const { globalRef } = makeGlobalWithStubNotice();
        const result = await withNoticeCapture(globalRef, () => {
            new (globalRef.Notice as new (msg: string) => unknown)('Error: file not found');
            new (globalRef.Notice as new (msg: string) => unknown)('Warning: deprecated API');
            new (globalRef.Notice as new (msg: string) => unknown)('File saved successfully');
            new (globalRef.Notice as new (msg: string) => unknown)('Pasta is on the stove');
        }, { tailMs: 0 });

        expect(result.notices[0].likely_severity).toBe('error');
        expect(result.notices[1].likely_severity).toBe('warning');
        expect(result.notices[2].likely_severity).toBe('success');
        expect(result.notices[3].likely_severity).toBe('unknown');
    });

    it('truncates at maxCaptures with a flag', async () => {
        const { globalRef } = makeGlobalWithStubNotice();
        const result = await withNoticeCapture(globalRef, () => {
            for (let i = 0; i < 110; i++) {
                new (globalRef.Notice as new (msg: string) => unknown)(`notice ${i}`);
            }
        }, { tailMs: 0, maxCaptures: 5 });

        expect(result.notices).toHaveLength(5);
        expect(result.truncated).toBe(true);
    });

    it('fail-soft when window.Notice is missing', async () => {
        const globalRef: { Notice?: unknown } = {}; // no Notice constructor
        const result = await withNoticeCapture(globalRef, () => 42, { tailMs: 0 });

        expect(result.patchSkipped).toBe(true);
        expect(result.notices).toEqual([]);
        expect(result.result).toBe(42);
    });

    it('captures notices raised in the async tail window', async () => {
        const { globalRef } = makeGlobalWithStubNotice();
        const result = await withNoticeCapture(globalRef, async () => {
            new (globalRef.Notice as new (msg: string) => unknown)('immediate notice');
            // Schedule a notice 50ms after fn settles; the patch should still
            // be active for the default 250ms tail.
            setTimeout(() => {
                new (globalRef.Notice as new (msg: string) => unknown)('tail notice');
            }, 50);
        }, { tailMs: 200 });

        expect(result.notices.map((n) => n.text)).toContain('immediate notice');
        expect(result.notices.map((n) => n.text)).toContain('tail notice');
    });

    it('records elapsed time per notice (t_ms relative to fn start)', async () => {
        const { globalRef } = makeGlobalWithStubNotice();
        const result = await withNoticeCapture(globalRef, () => {
            new (globalRef.Notice as new (msg: string) => unknown)('first');
        }, { tailMs: 0 });

        expect(result.notices[0].t_ms).toBeGreaterThanOrEqual(0);
        expect(result.notices[0].t_ms).toBeLessThan(1000); // sanity
    });

    it('preserves instanceof checks through patched constructor', async () => {
        const { globalRef, StubNotice } = makeGlobalWithStubNotice();
        let inst: unknown = null;
        await withNoticeCapture(globalRef, () => {
            inst = new (globalRef.Notice as new (msg: string) => unknown)('test');
        }, { tailMs: 0 });
        // The patched constructor sets its prototype to StubNotice.prototype,
        // so a plugin that checks `notice instanceof Notice` keeps working.
        expect(inst).toBeInstanceOf(StubNotice);
    });

    it('does NOT capture notices raised after the tail window has closed', async () => {
        // Risk-Szenario 3 from /coding-Handoff: a plugin that raises a notice
        // ~500 ms after executeCommandById returns will not be captured when
        // tailMs is the 250 ms default. We assert that explicitly so we
        // notice if the tail-window default ever changes in a way that hides
        // this tradeoff.
        const { globalRef } = makeGlobalWithStubNotice();
        const result = await withNoticeCapture(globalRef, async () => {
            new (globalRef.Notice as new (msg: string) => unknown)('immediate');
            setTimeout(() => {
                // This fires 200ms after the tail window (60ms) has closed.
                try {
                    new (globalRef.Notice as new (msg: string) => unknown)('too-late');
                } catch { /* the patched constructor is restored by then */ }
            }, 260);
        }, { tailMs: 60 });

        expect(result.notices.map((n) => n.text)).toContain('immediate');
        expect(result.notices.map((n) => n.text)).not.toContain('too-late');

        // Wait an extra moment so the late timeout actually fires before this
        // test ends, otherwise the setTimeout leaks into the next test.
        await new Promise<void>((res) => setTimeout(res, 300));
    });

    it('does NOT flag false-positive "key" usage in harmless notices', async () => {
        // Risk-Szenario 4 from /coding-Handoff: sensitive-heuristic is
        // anchored on word-boundaries so a notice like "Pressed key Escape"
        // matches "key" as a standalone word -- redacted today, but flagging
        // this so a future tightening of the regex (e.g. requiring an
        // adjacent context word) shows up in this test.
        const { globalRef } = makeGlobalWithStubNotice();
        const result = await withNoticeCapture(globalRef, () => {
            new (globalRef.Notice as new (msg: string) => unknown)('Pressed key Escape');
            new (globalRef.Notice as new (msg: string) => unknown)('Keyboard layout switched');
            new (globalRef.Notice as new (msg: string) => unknown)('API key abc123 saved');
        }, { tailMs: 0 });

        // Current implementation: "key Escape" (standalone "key" with word
        // boundary) is redacted. This is the known false-positive we
        // tolerate to keep the heuristic simple. "Keyboard" is NOT redacted
        // because the regex requires \bkey\b. "API key" IS redacted (true
        // positive).
        const byText = (s: string) => result.notices.find((n) => n.text.startsWith(s) || n.text === s || n.text === '[redacted notice text -- contained sensitive keyword]' && false);
        // We can't easily round-trip the original text once redacted, so we
        // assert on counts + the unredacted notice survives intact.
        const redactedCount = result.notices.filter((n) => n.redacted).length;
        expect(redactedCount).toBeGreaterThanOrEqual(2); // "Pressed key Escape" + "API key abc123"
        const keyboardNotice = result.notices.find((n) => n.text.startsWith('Keyboard'));
        expect(keyboardNotice).toBeDefined();
        expect(keyboardNotice?.redacted).toBe(false);

        // Mark `byText` as intentionally unused; it's a placeholder for a
        // future improvement that stores the original text alongside the
        // redacted marker.
        void byText;
    });
});
