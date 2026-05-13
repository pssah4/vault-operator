import { describe, it, expect } from 'vitest';
import { capMcpDescription, MCP_DESCRIPTION_CAP } from '../tools';

/**
 * Tests for the MCP-tool-description cap (FEAT-24-06 / ADR-118).
 *
 * The MCP listing in the stable system-prompt prefix caps every tool
 * description at MCP_DESCRIPTION_CAP chars (200) so a verbose MCP server
 * cannot bloat the cached block. Longer descriptions end with a hint that
 * points the model at read_mcp_tool for the full text.
 */

describe('capMcpDescription', () => {
    it('returns short descriptions unchanged', () => {
        const desc = 'Short tool description.';
        expect(capMcpDescription(desc, 'notion', 'create_page')).toBe(desc);
    });

    it('returns descriptions at the cap boundary unchanged', () => {
        const desc = 'X'.repeat(MCP_DESCRIPTION_CAP);
        expect(capMcpDescription(desc, 'notion', 'create_page')).toBe(desc);
    });

    it('truncates descriptions above the cap and appends the read_mcp_tool hint with the right server and name', () => {
        // Pick an input far enough above the cap that the suffix cannot make
        // the result longer than the original: a long verbose description.
        const desc = 'X'.repeat(MCP_DESCRIPTION_CAP + 1000);
        const out = capMcpDescription(desc, 'notion', 'create_page');
        expect(out.length).toBeLessThan(desc.length);
        expect(out.startsWith('X'.repeat(MCP_DESCRIPTION_CAP))).toBe(true);
        expect(out).toContain('... [full description: read_mcp_tool(');
        expect(out).toContain('server: "notion"');
        expect(out).toContain('name: "create_page"');
    });

    it('keeps the head exactly the first 200 chars (no mid-word cut on top of trim)', () => {
        // The cap should be deterministic so the cache key stays stable.
        const desc = 'A'.repeat(150) + ' some trailing text that exceeds the cap by a lot';
        const out = capMcpDescription(desc, 'srv', 'tool');
        expect(out.startsWith('A'.repeat(150) + ' some trailing text')).toBe(true);
    });
});
