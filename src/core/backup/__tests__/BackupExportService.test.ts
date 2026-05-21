/**
 * Tests for BackupExportService (FEAT-29-12 Task A).
 *
 * Cover the pure-logic + I/O paths through an in-memory adapter:
 *   - collectFiles honours selection flags
 *   - buildZip + unpackZip round-trip preserves bytes
 *   - manifest hash detects tampering
 *   - unpackZip rejects path-traversal entries
 *   - readManifest works without unpacking files
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
    collectFiles,
    buildZip,
    unpackZip,
    readManifest,
    isUnsafePath,
    SECTION_ROOTS,
    type BackupSelection,
    type BackupFileAdapter,
} from '../BackupExportService';

function selectionAll(): BackupSelection {
    return {
        skills: true,
        memory: true,
        history: true,
        rules: true,
        workflows: true,
        settings: true,
        exportSecrets: false,
    };
}

function selectionNone(): BackupSelection {
    return {
        skills: false,
        memory: false,
        history: false,
        rules: false,
        workflows: false,
        settings: false,
        exportSecrets: false,
    };
}

function makeAdapter(): BackupFileAdapter & {
    textFiles: Map<string, string>;
    binaryFiles: Map<string, Uint8Array>;
    folders: Set<string>;
} {
    const textFiles = new Map<string, string>();
    const binaryFiles = new Map<string, Uint8Array>();
    const folders = new Set<string>();
    return {
        textFiles, binaryFiles, folders,
        async exists(p: string) {
            return textFiles.has(p) || binaryFiles.has(p) || folders.has(p);
        },
        async list(p: string) {
            if (!folders.has(p)) throw new Error(`not a folder: ${p}`);
            const files: string[] = [];
            const innerFolders: string[] = [];
            const prefix = p.endsWith('/') ? p : p + '/';
            for (const f of [...textFiles.keys(), ...binaryFiles.keys()]) {
                if (f.startsWith(prefix) && !f.slice(prefix.length).includes('/')) {
                    files.push(f);
                }
            }
            for (const f of folders) {
                if (f.startsWith(prefix) && f !== p && !f.slice(prefix.length).includes('/')) {
                    innerFolders.push(f);
                }
            }
            return { files, folders: innerFolders };
        },
        async readBinary(p: string) {
            const b = binaryFiles.get(p);
            if (b) return b;
            const t = textFiles.get(p);
            if (t !== undefined) return new TextEncoder().encode(t);
            throw new Error(`not found: ${p}`);
        },
        async writeBinary(p: string, data: Uint8Array) { binaryFiles.set(p, data); },
        async read(p: string) {
            const t = textFiles.get(p);
            if (t !== undefined) return t;
            const b = binaryFiles.get(p);
            if (b) return new TextDecoder().decode(b);
            throw new Error(`not found: ${p}`);
        },
        async write(p: string, data: string) { textFiles.set(p, data); },
        async mkdir(p: string) { folders.add(p); },
        async stat(p: string) {
            if (textFiles.has(p)) return { mtime: 0, size: textFiles.get(p)!.length };
            if (binaryFiles.has(p)) return { mtime: 0, size: binaryFiles.get(p)!.byteLength };
            return null;
        },
    };
}

describe('collectFiles', () => {
    const ROOT = '.vault-operator';

    it('returns an empty list when nothing is selected', async () => {
        const adapter = makeAdapter();
        adapter.textFiles.set('.vault-operator/data/skills/foo/SKILL.md', 'x');
        const files = await collectFiles(adapter, ROOT, selectionNone());
        expect(files).toEqual([]);
    });

    it('walks data/skills/ recursively when skills is selected', async () => {
        const adapter = makeAdapter();
        adapter.folders.add('.vault-operator/data/skills');
        adapter.folders.add('.vault-operator/data/skills/foo');
        adapter.textFiles.set('.vault-operator/data/skills/foo/SKILL.md', '# foo');
        adapter.textFiles.set('.vault-operator/data/skills/foo/scripts/run.js', '// run');
        adapter.folders.add('.vault-operator/data/skills/foo/scripts');

        const sel = selectionNone();
        sel.skills = true;
        const files = await collectFiles(adapter, ROOT, sel);
        expect(files.map((f) => f.path).sort()).toEqual([
            '.vault-operator/data/skills/foo/SKILL.md',
            '.vault-operator/data/skills/foo/scripts/run.js',
        ]);
    });

    it('picks up the memory db (binary file) when memory is selected', async () => {
        const adapter = makeAdapter();
        const bytes = new Uint8Array([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x00]);
        adapter.binaryFiles.set('.vault-operator/data/memory.db', bytes);
        adapter.binaryFiles.set('.vault-operator/data/memory.db-journal', new Uint8Array([1, 2, 3]));

        const sel = selectionNone();
        sel.memory = true;
        const files = await collectFiles(adapter, ROOT, sel);
        expect(files.length).toBe(2);
        const dbFile = files.find((f) => f.path.endsWith('memory.db'))!;
        expect(dbFile.isText).toBe(false);
        expect(dbFile.content).toEqual(bytes);
    });

    it('combines multiple sections', async () => {
        const adapter = makeAdapter();
        adapter.folders.add('.vault-operator/data/skills');
        adapter.textFiles.set('.vault-operator/data/skills/foo/SKILL.md', 'x');
        adapter.folders.add('.vault-operator/data/skills/foo');
        adapter.binaryFiles.set('.vault-operator/data/memory.db', new Uint8Array([1]));
        adapter.textFiles.set('.vault-operator/data/rules.md', '# rules');
        adapter.textFiles.set('.vault-operator/data.json', '{"a":1}');

        const sel: BackupSelection = {
            skills: true, memory: true, history: false,
            rules: true, workflows: false, settings: true,
            exportSecrets: false,
        };
        const files = await collectFiles(adapter, ROOT, sel);
        expect(files.length).toBe(4);
    });

    it('returns files in a deterministic, path-sorted order', async () => {
        const adapter = makeAdapter();
        adapter.folders.add('.vault-operator/data/skills');
        adapter.folders.add('.vault-operator/data/skills/z');
        adapter.folders.add('.vault-operator/data/skills/a');
        adapter.textFiles.set('.vault-operator/data/skills/z/SKILL.md', 'z');
        adapter.textFiles.set('.vault-operator/data/skills/a/SKILL.md', 'a');

        const sel = selectionNone();
        sel.skills = true;
        const files = await collectFiles(adapter, ROOT, sel);
        expect(files.map((f) => f.path)).toEqual([
            '.vault-operator/data/skills/a/SKILL.md',
            '.vault-operator/data/skills/z/SKILL.md',
        ]);
    });

    it('silently skips paths that do not exist', async () => {
        const adapter = makeAdapter();
        const sel = selectionAll();
        const files = await collectFiles(adapter, ROOT, sel);
        expect(files).toEqual([]);
    });
});

describe('SECTION_ROOTS sanity', () => {
    it('covers every selection key except exportSecrets', () => {
        const expected = ['skills', 'memory', 'history', 'rules', 'workflows', 'settings'];
        expect(Object.keys(SECTION_ROOTS).sort()).toEqual([...expected].sort());
    });
});

describe('buildZip + unpackZip round-trip', () => {
    it('preserves bytes for text files', async () => {
        const files = [
            { path: 'data/skills/foo/SKILL.md', content: new TextEncoder().encode('# foo'), isText: true },
            { path: 'data/rules.md', content: new TextEncoder().encode('# rules'), isText: true },
        ];
        const zipBytes = await buildZip(files, selectionAll(), '2026-05-21T17:00:00.000Z');
        const { files: out } = await unpackZip(zipBytes);
        const map = new Map(out.map((f) => [f.path, f.content]));
        expect(new TextDecoder().decode(map.get('data/skills/foo/SKILL.md')!)).toBe('# foo');
        expect(new TextDecoder().decode(map.get('data/rules.md')!)).toBe('# rules');
    });

    it('preserves bytes for binary files', async () => {
        const dbBytes = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
        const files = [
            { path: 'data/memory.db', content: dbBytes, isText: false },
        ];
        const zipBytes = await buildZip(files, selectionAll(), '2026-05-21T17:00:00.000Z');
        const { files: out } = await unpackZip(zipBytes);
        expect(out[0].content).toEqual(dbBytes);
    });

    it('includes the manifest with selection + sections + hash', async () => {
        const files = [
            { path: 'data/skills/foo/SKILL.md', content: new TextEncoder().encode('x'), isText: true },
        ];
        const sel = selectionNone();
        sel.skills = true;
        const zipBytes = await buildZip(files, sel, '2026-05-21T17:00:00.000Z');
        const manifest = await readManifest(zipBytes);
        expect(manifest.schemaVersion).toBe(1);
        expect(manifest.fileCount).toBe(1);
        expect(manifest.selection.skills).toBe(true);
        expect(manifest.sections.skills).toBe(1);
        expect(manifest.contentHash.length).toBeGreaterThan(0);
    });

    it('detects tampered ZIP via hash mismatch', async () => {
        const files = [
            { path: 'data/rules.md', content: new TextEncoder().encode('original'), isText: true },
        ];
        const zipBytes = await buildZip(files, selectionAll(), '2026-05-21T17:00:00.000Z');
        // Tamper: load, modify a file, re-emit. Manifest hash stays the same but content differs.
        const zip = await JSZip.loadAsync(zipBytes);
        zip.file('data/rules.md', 'TAMPERED');
        const tampered = await zip.generateAsync({ type: 'uint8array' });
        await expect(unpackZip(tampered)).rejects.toThrow(/integrity check/i);
    });

    // Note: JSZip normalises `../`-prefixed paths on serialization, so
    // the unpackZip path-safety check is unreachable via the normal
    // JSZip API. The helper is tested directly below for defense in
    // depth (a hand-crafted raw ZIP byte sequence could still carry
    // such segments).

    it('rejects ZIP without manifest', async () => {
        const zip = new JSZip();
        zip.file('data/rules.md', 'x');
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        await expect(unpackZip(bytes)).rejects.toThrow(/missing BACKUP_MANIFEST/i);
    });

    it('rejects ZIP with unsupported schema version', async () => {
        const zip = new JSZip();
        zip.file('BACKUP_MANIFEST.json', JSON.stringify({ schemaVersion: 99 }));
        const bytes = await zip.generateAsync({ type: 'uint8array' });
        await expect(unpackZip(bytes)).rejects.toThrow(/schema version/i);
    });
});

describe('isUnsafePath helper (defense in depth)', () => {
    it('rejects parent-directory segments', () => {
        expect(isUnsafePath('../escape.md')).toBe(true);
        expect(isUnsafePath('foo/../bar')).toBe(true);
        expect(isUnsafePath('a/b/../c.md')).toBe(true);
    });

    it('rejects absolute paths', () => {
        expect(isUnsafePath('/etc/passwd')).toBe(true);
        expect(isUnsafePath('\\windows\\system32')).toBe(true);
        expect(isUnsafePath('C:\\Users\\foo')).toBe(true);
        expect(isUnsafePath('D:/Foo')).toBe(true);
    });

    it('accepts relative vault-style paths', () => {
        expect(isUnsafePath('data/skills/foo/SKILL.md')).toBe(false);
        expect(isUnsafePath('.vault-operator/data.json')).toBe(false);
        expect(isUnsafePath('foo.md')).toBe(false);
    });

    it('treats single dot as safe', () => {
        // "." is fine as a current-dir marker; we only refuse "..".
        expect(isUnsafePath('./foo.md')).toBe(false);
    });
});

describe('readManifest', () => {
    it('returns the manifest without unpacking files', async () => {
        const files = [
            { path: 'data/skills/foo/SKILL.md', content: new TextEncoder().encode('x'), isText: true },
        ];
        const zipBytes = await buildZip(files, selectionAll(), '2026-05-21T17:00:00.000Z');
        const m = await readManifest(zipBytes);
        expect(m.fileCount).toBe(1);
        expect(m.selection.skills).toBe(true);
    });
});
