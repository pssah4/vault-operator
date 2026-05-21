/**
 * Tests for ImportConflictResolver (FEAT-29-12 Task C).
 *
 * The resolver is pure logic: given a target file set and an incoming
 * backup file set, it decides what to write. UI lives elsewhere; we
 * pin every decision branch here.
 */

import { describe, it, expect } from 'vitest';
import {
    detectConflicts,
    applyResolution,
    summariseImport,
    type Resolution,
} from '../ImportConflictResolver';
import type { BackupFile } from '../BackupExportService';

function file(path: string, content: string): BackupFile {
    return { path, content: new TextEncoder().encode(content), isText: true };
}

describe('detectConflicts', () => {
    it('returns an empty list when paths do not overlap', () => {
        const target = [file('a.md', '1')];
        const incoming = [file('b.md', '2')];
        expect(detectConflicts(target, incoming)).toEqual([]);
    });

    it('flags paths that exist in both sides', () => {
        const target = [file('a.md', 'old')];
        const incoming = [file('a.md', 'new')];
        const out = detectConflicts(target, incoming);
        expect(out).toHaveLength(1);
        expect(out[0].path).toBe('a.md');
        expect(out[0].bytesDiffer).toBe(true);
        expect(out[0].targetSize).toBe(3);
        expect(out[0].incomingSize).toBe(3);
    });

    it('flags identical files as bytesDiffer=false', () => {
        const target = [file('a.md', 'same')];
        const incoming = [file('a.md', 'same')];
        const out = detectConflicts(target, incoming);
        expect(out).toHaveLength(1);
        expect(out[0].bytesDiffer).toBe(false);
    });

    it('sorts the result by path', () => {
        const target = [file('z.md', '1'), file('a.md', '1')];
        const incoming = [file('z.md', '2'), file('a.md', '2')];
        const out = detectConflicts(target, incoming);
        expect(out.map((c) => c.path)).toEqual(['a.md', 'z.md']);
    });
});

describe('applyResolution overwrite-all', () => {
    it('writes every incoming file (new + overwrite)', () => {
        const target = [file('a.md', 'old')];
        const incoming = [file('a.md', 'new'), file('b.md', 'fresh')];
        const plan = applyResolution({ kind: 'overwrite-all' }, target, incoming);
        expect(plan).toHaveLength(2);
        expect(plan.find((p) => p.file.path === 'a.md')?.kind).toBe('overwrite');
        expect(plan.find((p) => p.file.path === 'b.md')?.kind).toBe('new');
    });
});

describe('applyResolution skip-all', () => {
    it('drops every conflicting incoming file, writes only new ones', () => {
        const target = [file('a.md', 'old')];
        const incoming = [file('a.md', 'new'), file('b.md', 'fresh')];
        const plan = applyResolution({ kind: 'skip-all' }, target, incoming);
        expect(plan).toHaveLength(1);
        expect(plan[0].file.path).toBe('b.md');
        expect(plan[0].kind).toBe('new');
    });

    it('writes nothing when every incoming file is a conflict', () => {
        const target = [file('a.md', '1'), file('b.md', '2')];
        const incoming = [file('a.md', '3'), file('b.md', '4')];
        const plan = applyResolution({ kind: 'skip-all' }, target, incoming);
        expect(plan).toEqual([]);
    });
});

describe('applyResolution per-item', () => {
    it('writes overwrite for paths the user selected, skips others', () => {
        const target = [file('a.md', 'old'), file('b.md', 'old-b')];
        const incoming = [file('a.md', 'new'), file('b.md', 'new-b'), file('c.md', 'fresh')];
        const resolution: Resolution = {
            kind: 'per-item',
            perItem: {
                'a.md': 'overwrite',
                'b.md': 'skip',
            },
        };
        const plan = applyResolution(resolution, target, incoming);
        const paths = plan.map((p) => `${p.file.path}:${p.kind}`).sort();
        expect(paths).toEqual(['a.md:overwrite', 'c.md:new']);
    });

    it('skips unmapped paths (safer default)', () => {
        const target = [file('a.md', 'old')];
        const incoming = [file('a.md', 'new')];
        const resolution: Resolution = { kind: 'per-item', perItem: {} };
        const plan = applyResolution(resolution, target, incoming);
        expect(plan).toEqual([]);
    });

    it('always writes non-conflicting incoming files regardless of perItem map', () => {
        const target: BackupFile[] = [];
        const incoming = [file('a.md', 'fresh')];
        const resolution: Resolution = { kind: 'per-item', perItem: {} };
        const plan = applyResolution(resolution, target, incoming);
        expect(plan).toHaveLength(1);
        expect(plan[0].kind).toBe('new');
    });
});

describe('summariseImport', () => {
    it('produces the counts the modal heading uses', () => {
        const target = [
            file('a.md', '1'),
            file('b.md', '2'),
            file('c.md', '3'),
        ];
        const incoming = [
            file('a.md', '1'),    // identical
            file('b.md', 'XX'),   // modified
            file('d.md', 'new1'), // new
            file('e.md', 'new2'), // new
        ];
        const s = summariseImport(target, incoming);
        expect(s).toEqual({
            incomingCount: 4,
            conflictCount: 2,
            modifiedConflicts: 1,
            identicalConflicts: 1,
            newFiles: 2,
        });
    });

    it('handles the empty-target case (fresh vault, every file is new)', () => {
        const incoming = [file('a.md', 'x'), file('b.md', 'y')];
        const s = summariseImport([], incoming);
        expect(s).toEqual({
            incomingCount: 2,
            conflictCount: 0,
            modifiedConflicts: 0,
            identicalConflicts: 0,
            newFiles: 2,
        });
    });
});
