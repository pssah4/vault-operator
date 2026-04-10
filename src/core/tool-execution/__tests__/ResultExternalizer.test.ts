import { describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal FileAdapter stub (in-memory)
// ---------------------------------------------------------------------------

function createMemoryFs(): import('../../storage/types').FileAdapter & { files: Map<string, string>; dirs: Set<string> } {
    const files = new Map<string, string>();
    const dirs = new Set<string>();

    return {
        files,
        dirs,
        exists: (path: string) => Promise.resolve(files.has(path) || dirs.has(path)),
        read: (path: string) => {
            const content = files.get(path);
            if (content === undefined) return Promise.reject(new Error(`File not found: ${path}`));
            return Promise.resolve(content);
        },
        write: (path: string, content: string) => { files.set(path, content); return Promise.resolve(); },
        append: (path: string, content: string) => { files.set(path, (files.get(path) ?? '') + content); return Promise.resolve(); },
        remove: (path: string) => { files.delete(path); dirs.delete(path); return Promise.resolve(); },
        mkdir: (path: string) => { dirs.add(path); return Promise.resolve(); },
        list: (path: string) => Promise.resolve({
            files: [...files.keys()].filter((f) => f.startsWith(path + '/')),
            folders: [...dirs].filter((d) => d.startsWith(path + '/') && d !== path),
        }),
        stat: (path: string) => Promise.resolve(files.has(path) ? { mtime: Date.now(), size: (files.get(path) ?? '').length } : null),
    };
}

// Dynamic import to handle 'obsidian' module stub
async function createExternalizer(fs: ReturnType<typeof createMemoryFs>, taskId = 'test-task-1') {
    const { ResultExternalizer } = await import('../ResultExternalizer');
    return new ResultExternalizer(fs, taskId);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResultExternalizer', () => {
    let fs: ReturnType<typeof createMemoryFs>;

    beforeEach(() => {
        fs = createMemoryFs();
    });

    describe('maybeExternalize', () => {
        it('should return null for small results (under threshold)', async () => {
            const ext = await createExternalizer(fs);
            const result = await ext.maybeExternalize('search_files', {}, 'small result', false);
            expect(result).toBeNull();
            expect(fs.files.size).toBe(0);
        });

        it('should externalize large results to a temp file', async () => {
            const ext = await createExternalizer(fs);
            const largeContent = 'x'.repeat(3000);
            const result = await ext.maybeExternalize('search_files', {}, largeContent, false);

            expect(result).not.toBeNull();
            expect(result).toContain('Full results saved to:');
            expect(fs.files.size).toBe(1);
            // Verify temp file contains full content
            const tempFile = [...fs.files.entries()][0];
            expect(tempFile[1]).toBe(largeContent);
        });

        it('should return null for error results', async () => {
            const ext = await createExternalizer(fs);
            const result = await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), true);
            expect(result).toBeNull();
        });

        it('should return null for write tools (skip list)', async () => {
            const ext = await createExternalizer(fs);
            const result = await ext.maybeExternalize('write_file', {}, 'x'.repeat(3000), false);
            expect(result).toBeNull();
        });

        it('should return null for control flow tools', async () => {
            const ext = await createExternalizer(fs);
            const result = await ext.maybeExternalize('attempt_completion', {}, 'x'.repeat(3000), false);
            expect(result).toBeNull();
        });

        it('should return null when disabled', async () => {
            const ext = await createExternalizer(fs);
            ext.disable();
            const result = await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), false);
            expect(result).toBeNull();
        });

        it('should work again after re-enabling', async () => {
            const ext = await createExternalizer(fs);
            ext.disable();
            ext.enable();
            const result = await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), false);
            expect(result).not.toBeNull();
        });

        it('should generate unique file names using call counter', async () => {
            const ext = await createExternalizer(fs);
            const content = 'x'.repeat(3000);
            await ext.maybeExternalize('search_files', {}, content, false);
            await ext.maybeExternalize('search_files', {}, content, false);

            expect(fs.files.size).toBe(2);
            const paths = [...fs.files.keys()];
            expect(paths[0]).not.toBe(paths[1]);
        });
    });

    describe('tool-specific formatters', () => {
        it('should format search_files reference with match count', async () => {
            const ext = await createExternalizer(fs);
            const content = 'Found 42 matches for "test".\nNotes/File1.md: line 5\nNotes/File2.md: line 10\n' + 'x'.repeat(3000);
            const ref = await ext.maybeExternalize('search_files', {}, content, false);

            expect(ref).toContain('42');
            expect(ref).toContain('search_files');
            expect(ref).toContain('read_file');
        });

        it('should format semantic_search reference with top results', async () => {
            const ext = await createExternalizer(fs);
            const content = '1. Notes/Kant.md (0.92)\n2. Notes/Ethics.md (0.85)\n3. Notes/Moral.md (0.78)\n' + 'x'.repeat(3000);
            const ref = await ext.maybeExternalize('semantic_search', {}, content, false);

            expect(ref).toContain('semantic_search');
            expect(ref).toContain('read_file');
        });

        it('should format read_file reference with headings', async () => {
            const ext = await createExternalizer(fs);
            const content = '# Main Title\n\n## Section 1\nSome content\n\n## Section 2\nMore content\n' + 'x'.repeat(3000);
            const ref = await ext.maybeExternalize('read_file', { path: 'Notes/Test.md' }, content, false);

            expect(ref).toContain('read_file');
            expect(ref).toContain('Notes/Test.md');
            expect(ref).toContain('Main Title');
        });
    });

    describe('cleanup', () => {
        it('should remove all temp files for the task', async () => {
            const ext = await createExternalizer(fs);
            await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), false);
            await ext.maybeExternalize('read_file', { path: 'a.md' }, 'x'.repeat(3000), false);

            expect(fs.files.size).toBe(2);

            await ext.cleanup();

            expect(fs.files.size).toBe(0);
        });
    });

    describe('cleanupOrphaned', () => {
        it('should remove old tmp directories', async () => {
            const { ResultExternalizer } = await import('../ResultExternalizer');

            // Create a fake old temp directory
            fs.dirs.add('tmp');
            fs.dirs.add('tmp/old-task-1');
            fs.files.set('tmp/old-task-1/search-1.md', 'old content');

            // Override stat to return old mtime
            const origStat = fs.stat;
            fs.stat = async (path: string) => {
                if (path.includes('old-task')) return { mtime: Date.now() - 2 * 60 * 60 * 1000, size: 100 };
                return origStat(path);
            };

            await ResultExternalizer.cleanupOrphaned(fs);

            expect(fs.files.has('tmp/old-task-1/search-1.md')).toBe(false);
        });
    });
});
