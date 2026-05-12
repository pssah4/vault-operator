import { describe, it, expect } from 'vitest';
import { capOversizedToolOutput, HARD_TOOL_OUTPUT_CAP_CHARS } from '../ToolExecutionPipeline';

describe('capOversizedToolOutput (FEAT-24-03)', () => {
    it('leaves a within-budget string untouched', () => {
        const r = capOversizedToolOutput('hello world', false);
        expect(r.capped).toBe(false);
        expect(r.content).toBe('hello world');
    });

    it('leaves an error result untouched even when oversized', () => {
        const big = 'x'.repeat(HARD_TOOL_OUTPUT_CAP_CHARS + 5000);
        const r = capOversizedToolOutput(big, true);
        expect(r.capped).toBe(false);
        expect(r.content).toBe(big);
    });

    it('leaves multimodal content untouched', () => {
        const blocks = [{ type: 'text' as const, text: 'x'.repeat(HARD_TOOL_OUTPUT_CAP_CHARS + 5000) }];
        const r = capOversizedToolOutput(blocks, false);
        expect(r.capped).toBe(false);
        expect(r.content).toBe(blocks);
    });

    it('caps an oversized string and appends a how-to-fetch-the-rest notice', () => {
        const big = 'line of content\n'.repeat(8000); // ~128k chars, lots of newlines
        const r = capOversizedToolOutput(big, false);
        expect(r.capped).toBe(true);
        expect(r.originalLength).toBe(big.length);
        const out = r.content as string;
        expect(out.length).toBeLessThan(HARD_TOOL_OUTPUT_CAP_CHARS + 500);
        expect(out).toContain('Output truncated');
        expect(out).toContain(String(big.length));
        // Cut on a newline boundary -> no dangling half-line right before the notice.
        expect(out.split('\n\n[Output truncated')[0].endsWith('line of content')).toBe(true);
    });

    it('falls back to a hard slice when there is no newline near the cap', () => {
        const big = 'x'.repeat(HARD_TOOL_OUTPUT_CAP_CHARS + 10_000); // no newlines at all
        const r = capOversizedToolOutput(big, false);
        expect(r.capped).toBe(true);
        const out = r.content as string;
        expect(out.startsWith('x'.repeat(HARD_TOOL_OUTPUT_CAP_CHARS))).toBe(true);
        expect(out).toContain('Output truncated');
    });

    it('honours a custom cap', () => {
        const r = capOversizedToolOutput('y'.repeat(2000), false, 500);
        expect(r.capped).toBe(true);
        expect((r.content as string).startsWith('y'.repeat(500))).toBe(true);
    });
});
