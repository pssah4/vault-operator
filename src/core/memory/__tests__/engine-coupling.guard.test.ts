import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Engine-Coupling Lint Guard (ADR-080 enforcement).
 *
 * The Memory v2 engine package (src/core/memory/) MUST stay free of
 * `obsidian` imports so Phase 7 (engine extract for UCM) is a directory
 * move, not a refactor. This test fails the suite if anybody adds an
 * obsidian import to the engine -- the boundary is documentation-plus-CI,
 * not just convention.
 *
 * Tests themselves are exempt: the existing __tests__/ folder uses sql.js
 * directly, which is fine.
 */

const ENGINE_DIR = path.resolve(__dirname, '..');
const FORBIDDEN_PATTERN = /from\s+['"]obsidian['"]|require\s*\(\s*['"]obsidian['"]\s*\)/;
const SKIP_DIRS = new Set(['__tests__']);

function listEngineFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            out.push(...listEngineFiles(path.join(dir, entry.name)));
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

describe('Engine-Coupling Lint Guard (ADR-080)', () => {
    it('no source file in src/core/memory/ imports `obsidian`', () => {
        const offenders: string[] = [];
        for (const file of listEngineFiles(ENGINE_DIR)) {
            const content = fs.readFileSync(file, 'utf-8');
            if (FORBIDDEN_PATTERN.test(content)) {
                offenders.push(path.relative(process.cwd(), file));
            }
        }
        if (offenders.length > 0) {
            const msg =
                `Engine-coupling violation: the following files in src/core/memory/ import 'obsidian':\n` +
                offenders.map(f => `  - ${f}`).join('\n') +
                `\n\nADR-080 requires the engine to stay obsidian-free so Phase 7 ` +
                `(engine extract for UCM) is a directory move, not a refactor. Move the ` +
                `obsidian-specific code into the host layer (src/main.ts, src/ui/, src/mcp/).`;
            throw new Error(msg);
        }
        expect(offenders).toEqual([]);
    });

    it('the guard actually scans real engine files (smoke test)', () => {
        const files = listEngineFiles(ENGINE_DIR);
        expect(files.length).toBeGreaterThan(10);
        expect(files.some(f => f.endsWith('FactStore.ts'))).toBe(true);
    });
});
