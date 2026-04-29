/**
 * FIX-H (ADR-090 follow-up) — Todo verification regression tests.
 *
 * Two tiers:
 *   1. Done todos that name a specific file/wikilink which has not been read
 *   2. Done todos that use a collective quantifier ("alle / all / jede")
 *      but the task has read fewer than 2 files
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateTodoListTool } from '../UpdateTodoListTool';
import type { ToolExecutionContext } from '../../types';

interface CapturedResult {
    text: string;
    isError: boolean;
}

function buildTool(): UpdateTodoListTool {
    // The tool only uses `this.app` for the BaseTool plumbing; we don't need
    // a real Obsidian app for the verification logic.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new UpdateTodoListTool({} as any);
}

function buildContext(readFiles: Set<string>, captured: CapturedResult[]): ToolExecutionContext {
    return {
        mode: 'agent',
        callbacks: {
            pushToolResult: (text: string) => captured.push({ text, isError: false }),
            pushProgress: () => {},
            handleError: () => Promise.resolve(),
            log: () => {},
        },
        getReadFiles: () => readFiles,
    } as unknown as ToolExecutionContext;
}

describe('UpdateTodoListTool — verification (FIX-H, ADR-090)', () => {
    let captured: CapturedResult[];
    beforeEach(() => { captured = []; });

    it('flags a done todo that names a file the agent has not read', async () => {
        const tool = buildTool();
        const ctx = buildContext(
            new Set(['Inbox/Asset Radar.md']),
            captured,
        );
        await tool.execute({
            todos: '- [x] Read [[Asset Radar]]\n- [x] Read [[Chatbot Netze]]',
        }, ctx);
        const result = captured[0]!.text;
        expect(result).toContain('VERIFICATION WARNING');
        expect(result).toContain('Chatbot Netze');
        expect(result).not.toContain('Asset Radar"'); // Asset Radar is read, must not appear in the warning's quoted refs
    });

    it('does NOT flag when the named file IS read', async () => {
        const tool = buildTool();
        const ctx = buildContext(
            new Set(['Inbox/Asset Radar.md', 'Inbox/Chatbot Netze.md']),
            captured,
        );
        await tool.execute({
            todos: '- [x] Read [[Asset Radar]]\n- [x] Read [[Chatbot Netze]]',
        }, ctx);
        const result = captured[0]!.text;
        expect(result).not.toContain('VERIFICATION WARNING');
    });

    it('flags a quantifier todo when read count < 2 (the regression case)', async () => {
        const tool = buildTool();
        const ctx = buildContext(
            new Set(['Inbox/Asset Radar.md']),
            captured,
        );
        await tool.execute({
            todos: '- [x] Alle GenAI-Push-Interview-Notes lesen\n- [~] Synthese schreiben',
        }, ctx);
        const result = captured[0]!.text;
        expect(result).toContain('VERIFICATION WARNING');
        expect(result).toContain('quantifier');
        expect(result).toContain('Alle GenAI-Push-Interview-Notes lesen');
    });

    it('does not flag a quantifier todo when 2+ files are read', async () => {
        const tool = buildTool();
        const ctx = buildContext(
            new Set(['Inbox/A.md', 'Inbox/B.md', 'Inbox/C.md']),
            captured,
        );
        await tool.execute({
            todos: '- [x] Alle Notes im Inbox lesen',
        }, ctx);
        const result = captured[0]!.text;
        expect(result).not.toContain('quantifier');
    });

    it('skips quantifier check when the todo also lists explicit files', async () => {
        // The explicit-file branch (tier 1) handles those; tier 2 should not
        // double-warn on the same item.
        const tool = buildTool();
        const ctx = buildContext(
            new Set(['Inbox/A.md']),
            captured,
        );
        await tool.execute({
            todos: '- [x] Alle Notes lesen: [[A]], [[B]], [[C]]',
        }, ctx);
        const result = captured[0]!.text;
        // Tier 1 fires (B and C unread); tier 2 must NOT fire because file refs are present
        expect(result).toContain('VERIFICATION WARNING');
        expect(result).toContain('"B"');
        expect(result).toContain('"C"');
        // No quantifier complaint when explicit refs cover the case
        expect(result).not.toContain('quantifier');
    });

    it('flags plural collective nouns without an explicit quantifier (the actual regression)', async () => {
        // The user's test had "GenAI-Push-Interview-Notes finden und lesen" --
        // no "alle", but plural "Notes" implies collective coverage. With only
        // 1 file read this must be flagged.
        const tool = buildTool();
        const ctx = buildContext(new Set(['Inbox/Insights.md']), captured);
        await tool.execute({
            todos: '- [x] GenAI-Push-Interview-Notes im Inbox finden und lesen',
        }, ctx);
        const result = captured[0]!.text;
        expect(result).toContain('quantifier');
        expect(result).toContain('GenAI-Push-Interview-Notes');
    });

    it('does NOT flag plural collective when an explicit small count is given', async () => {
        const tool = buildTool();
        const ctx = buildContext(new Set(['Inbox/A.md']), captured);
        await tool.execute({
            todos: '- [x] Drei Notes lesen und vergleichen',
        }, ctx);
        const result = captured[0]!.text;
        expect(result).not.toContain('quantifier');
    });

    it('does not warn when no done items reference files', async () => {
        const tool = buildTool();
        const ctx = buildContext(new Set(), captured);
        await tool.execute({
            todos: '- [~] Plan erstellen\n- [ ] Daten erfassen',
        }, ctx);
        const result = captured[0]!.text;
        expect(result).not.toContain('VERIFICATION WARNING');
    });
});
