import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TOOL_METADATA, DEFERRED_TOOL_NAMES } from '../toolMetadata';

/**
 * IMP-24-06-01: regression guard against the TOOL_METADATA / ToolName-union
 * drift discovered in AUDIT-020 F-1.
 *
 * The check is static: scan `src/core/tools/types.ts` for every union
 * member of `ToolName` and compare against the keys of `TOOL_METADATA`
 * plus the entries of `DEFERRED_TOOL_NAMES`. Any drift fails the test
 * with the specific tool name printed so the cleanup is mechanical.
 *
 * The "_"-prefix allowlist covers LLM-internal tool schemas that are
 * NOT registered in the ToolRegistry and therefore must not appear in
 * TOOL_METADATA (Memory-Atomizer / SingleCallExtractor schemas). They
 * are part of the ToolName union for type-safety on the LLM-payload
 * side but live in their own files.
 */

const TYPES_FILE = path.resolve(__dirname, '../types.ts');

function parseToolNameUnion(): Set<string> {
    const source = fs.readFileSync(TYPES_FILE, 'utf-8');
    const names = new Set<string>();
    for (const match of source.matchAll(/\|\s*'([a-z_]+)'/g)) {
        names.add(match[1]);
    }
    return names;
}

const ALLOWLIST_NO_METADATA = new Set<string>([
    // Underscore-prefixed: LLM-internal constraint tools (Memory v2). Not in
    // the ToolRegistry; their schema is shipped inline by the extractor that
    // owns them. By convention these never get a TOOL_METADATA entry.
    '_memory_atomize',
    '_memory_single_call',
]);

describe('TOOL_METADATA / ToolName-union consistency (IMP-24-06-01)', () => {
    it('every ToolName-union member has a TOOL_METADATA entry (or is on the underscore-prefix allowlist)', () => {
        const union = parseToolNameUnion();
        const missing: string[] = [];
        for (const name of union) {
            if (ALLOWLIST_NO_METADATA.has(name)) continue;
            if (!Object.prototype.hasOwnProperty.call(TOOL_METADATA, name)) {
                missing.push(name);
            }
        }
        expect(missing, `Tools in ToolName union without TOOL_METADATA entry: ${missing.join(', ')}`).toEqual([]);
    });

    it('every TOOL_METADATA key is in the ToolName union (no orphan entries)', () => {
        const union = parseToolNameUnion();
        const orphans: string[] = [];
        for (const key of Object.keys(TOOL_METADATA)) {
            if (!union.has(key)) orphans.push(key);
        }
        expect(orphans, `TOOL_METADATA keys not in ToolName union: ${orphans.join(', ')}`).toEqual([]);
    });

    it('every DEFERRED_TOOL_NAMES entry has a TOOL_METADATA entry (find_tool ranks via metadata)', () => {
        const missing: string[] = [];
        for (const name of DEFERRED_TOOL_NAMES) {
            if (!Object.prototype.hasOwnProperty.call(TOOL_METADATA, name)) {
                missing.push(name);
            }
        }
        expect(missing, `DEFERRED_TOOL_NAMES entries without TOOL_METADATA: ${missing.join(', ')}`).toEqual([]);
    });
});
