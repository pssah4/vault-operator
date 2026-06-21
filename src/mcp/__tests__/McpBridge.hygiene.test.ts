/**
 * FIX-23-09-01 -- schema-hygiene for MCP tool definitions exposed to
 * external clients.
 *
 * Tool descriptions are sent verbatim in tools/list responses and form
 * part of the contract every MCP client (Claude Desktop, Claude.ai
 * connector, ChatGPT, Perplexity, ...) sees. They must not contain
 * personal names, imperative urgency wording, or plugin-internal IDs.
 */

import { describe, it, expect } from 'vitest';
import { TOOLS, AGENT_INTERNAL_TOOLS } from '../McpBridge';

describe('MCP tool descriptions hygiene (FIX-23-09-01)', () => {
    it('exposes a non-empty TOOLS array', () => {
        expect(Array.isArray(TOOLS)).toBe(true);
        expect(TOOLS.length).toBeGreaterThan(0);
    });

    it('does not contain hardcoded personal names', () => {
        for (const t of TOOLS) {
            expect(t.description, `tool "${t.name}" description`).not.toMatch(/Sebastian/);
        }
    });

    it('does not contain urgency words (CRITICAL, NON-NEGOTIABLE, MUST, ALWAYS, MANDATORY)', () => {
        for (const t of TOOLS) {
            const desc = t.description;
            const label = `tool "${t.name}"`;
            expect(desc, label).not.toMatch(/\bCRITICAL\b/);
            expect(desc, label).not.toMatch(/\bNON-NEGOTIABLE\b/);
            expect(desc, label).not.toMatch(/\bMUST\b/);
            expect(desc, label).not.toMatch(/\bALWAYS\b/);
            expect(desc, label).not.toMatch(/\bMANDATORY\b/);
        }
    });

    it('does not contain imperative-emphasis phrases (IMPORTANT:, PREFER, JUST CALL, REQUIRED)', () => {
        for (const t of TOOLS) {
            const desc = t.description;
            const label = `tool "${t.name}"`;
            expect(desc, label).not.toMatch(/\bIMPORTANT:/);
            expect(desc, label).not.toMatch(/\bPREFER\b/);
            expect(desc, label).not.toMatch(/\bJUST CALL\b/);
            expect(desc, label).not.toMatch(/\bREQUIRED\b/);
            expect(desc, label).not.toMatch(/\bNEVER\b/);
        }
    });

    it('does not leak plugin-internal IDs (FIX-/EPIC-/ADR-/FEAT-)', () => {
        for (const t of TOOLS) {
            const desc = t.description;
            const label = `tool "${t.name}"`;
            expect(desc, label).not.toMatch(/\bFIX-\d/);
            expect(desc, label).not.toMatch(/\bEPIC-\d/);
            expect(desc, label).not.toMatch(/\bADR-\d/);
            expect(desc, label).not.toMatch(/\bFEAT-\d/);
        }
    });
});

describe('AGENT_INTERNAL_TOOLS deny-list (FIX-23-09-02)', () => {
    // GitHub issue #46 flagged the execute_vault_op catch-all and named
    // several operations as suspicious. These plus their close cousins
    // are polymorphic / arbitrary-code surfaces that have no business
    // being reachable through an external MCP client and must stay in
    // the deny-list.
    const REQUIRED_INTERNAL = [
        'execute_command',
        'use_mcp_tool',
        'invoke_mcp_server',
        'invoke_skill',
        'run_skill_script',
        'evaluate_expression',
        'update_soul',
    ];

    for (const name of REQUIRED_INTERNAL) {
        it(`denies "${name}" from external MCP via AGENT_INTERNAL_TOOLS`, () => {
            expect(AGENT_INTERNAL_TOOLS.has(name)).toBe(true);
        });
    }
});
