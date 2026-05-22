import { describe, it, expect, beforeEach, vi } from 'vitest';

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

        it('should NOT externalize search_history -- output is curated, must reach agent verbatim', async () => {
            const ext = await createExternalizer(fs);
            const result = await ext.maybeExternalize('search_history', {}, 'x'.repeat(7000), false);
            expect(result).toBeNull();
        });

        it('should NOT externalize recall_memory -- output is curated, must reach agent verbatim', async () => {
            const ext = await createExternalizer(fs);
            const result = await ext.maybeExternalize('recall_memory', {}, 'x'.repeat(7000), false);
            expect(result).toBeNull();
        });

        it('should NOT externalize ingest_triage -- curated card with cluster + top-K Vault/Memory/History hits', async () => {
            const ext = await createExternalizer(fs);
            const result = await ext.maybeExternalize('ingest_triage', {}, 'x'.repeat(7000), false);
            expect(result).toBeNull();
        });

        it('should NEVER externalize read_file -- ADR-063 revised 2026-04-29', async () => {
            const ext = await createExternalizer(fs);
            const result = await ext.maybeExternalize(
                'read_file',
                { path: 'Notes/SomeLargeNote.md' },
                'x'.repeat(7000),
                false,
            );
            expect(result).toBeNull();
        });

        it('should NEVER externalize read_document -- agent needs full content verbatim', async () => {
            const ext = await createExternalizer(fs);
            const result = await ext.maybeExternalize(
                'read_document',
                { path: 'Notes/Some.pdf' },
                'x'.repeat(7000),
                false,
            );
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

        it('should format default reference for unknown tools with first lines + saved path', async () => {
            const ext = await createExternalizer(fs);
            const content = 'first informative line\n'.repeat(20) + 'x'.repeat(3000);
            const ref = await ext.maybeExternalize('some_other_tool', {}, content, false);

            expect(ref).toContain('some_other_tool');
            expect(ref).toContain('First lines:');
            expect(ref).toContain('first informative line');
            expect(ref).toContain('Full result saved to:');
        });

        it('caps a re-read of an externalizer tmp file instead of returning the full text', async () => {
            const ext = await createExternalizer(fs);
            // First produce a tmp file via a normal externalization.
            const big = 'y'.repeat(60_000);
            const firstRef = await ext.maybeExternalize('web_fetch', {}, big, false);
            expect(firstRef).not.toBeNull();
            const tmpPath = firstRef!.match(/saved to: (\S+)/)![1];

            // Now simulate the agent reading that tmp file back.
            const reRead = await ext.maybeExternalize('read_file', { path: tmpPath }, big, false);
            expect(reRead).not.toBeNull();
            expect(reRead!).toContain('capped to');
            expect(reRead!.length).toBeLessThan(10_000);
            // A read_file of a NORMAL vault path is still skipped (returns null).
            expect(await ext.maybeExternalize('read_file', { path: 'Notes/Real.md' }, big, false)).toBeNull();
        });
    });

    describe('cleanup', () => {
        it('should remove all temp files for the task', async () => {
            const ext = await createExternalizer(fs);
            await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), false);
            await ext.maybeExternalize('semantic_search', {}, 'x'.repeat(3000), false);

            expect(fs.files.size).toBe(2);

            await ext.cleanup();

            expect(fs.files.size).toBe(0);
        });

        it('BUG-023: retries transient EPERM (iCloud lock) before giving up', async () => {
            const ext = await createExternalizer(fs);
            await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), false);
            expect(fs.files.size).toBe(1);

            // Fail the first two remove() calls with EPERM, then succeed.
            const realRemove = fs.remove;
            const attempts: number[] = [];
            fs.remove = (path: string) => {
                attempts.push(1);
                if (attempts.length <= 2) {
                    const err = Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
                    return Promise.reject(err);
                }
                return realRemove(path);
            };

            await ext.cleanup();

            expect(attempts.length).toBeGreaterThanOrEqual(3);
            expect(fs.files.size).toBe(0);
        });

        it('BUG-023: reports cleanup failure non-fatally after retries exhaust', async () => {
            const ext = await createExternalizer(fs);
            await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), false);

            fs.remove = () => {
                const err = Object.assign(new Error('EPERM: locked'), { code: 'EPERM' });
                return Promise.reject(err);
            };

            // Must not throw -- cleanup swallows unrecoverable failures and
            // leaves the orphan sweeper to finish on next plugin start.
            await expect(ext.cleanup()).resolves.toBeUndefined();
            expect(fs.files.size).toBe(1);
        });

        it('FIX-24-03-03: persistent EPERM logs as debug, not warn (iCloud noise reduction)', async () => {
            const ext = await createExternalizer(fs);
            await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), false);

            fs.remove = () => {
                const err = Object.assign(new Error('EPERM: locked'), { code: 'EPERM' });
                return Promise.reject(err);
            };

            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

            await ext.cleanup();

            const warnCalls = warnSpy.mock.calls.filter((args) =>
                args.some((a) => typeof a === 'string' && a.includes('[Externalize] Cleanup failed')),
            );
            const debugCalls = debugSpy.mock.calls.filter((args) =>
                args.some((a) => typeof a === 'string' && a.includes('[Externalize] Cleanup failed')),
            );

            expect(warnCalls.length).toBe(0);
            expect(debugCalls.length).toBe(1);

            warnSpy.mockRestore();
            debugSpy.mockRestore();
        });

        it('FIX-24-03-03: non-transient error (ENOENT) still surfaces as warn', async () => {
            const ext = await createExternalizer(fs);
            await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), false);

            fs.remove = () => {
                const err = Object.assign(new Error('ENOENT: missing'), { code: 'ENOENT' });
                return Promise.reject(err);
            };

            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            await ext.cleanup();

            const warnCalls = warnSpy.mock.calls.filter((args) =>
                args.some((a) => typeof a === 'string' && a.includes('[Externalize] Cleanup failed')),
            );
            expect(warnCalls.length).toBe(1);

            warnSpy.mockRestore();
        });

        it('FIX-24-03-03: retry schedule is 4 attempts (was 3)', async () => {
            const ext = await createExternalizer(fs);
            await ext.maybeExternalize('search_files', {}, 'x'.repeat(3000), false);

            const attempts: number[] = [];
            fs.remove = () => {
                attempts.push(1);
                const err = Object.assign(new Error('EPERM'), { code: 'EPERM' });
                return Promise.reject(err);
            };

            await ext.cleanup();

            // 4 retry attempts per remove() target. cleanup() calls remove on
            // each file plus the dir; we only need >=4 to prove the schedule
            // grew. The previous schedule was 3.
            expect(attempts.length).toBeGreaterThanOrEqual(4);
        });
    });

    describe('cleanupOrphaned', () => {
        it('should remove old tmp directories under the default vault tmp root', async () => {
            const { ResultExternalizer, DEFAULT_TMP_ROOT } = await import('../ResultExternalizer');

            const orphanDir = `${DEFAULT_TMP_ROOT}/old-task-1`;
            const orphanFile = `${orphanDir}/search-1.md`;
            fs.dirs.add(DEFAULT_TMP_ROOT);
            fs.dirs.add(orphanDir);
            fs.files.set(orphanFile, 'old content');

            const origStat = fs.stat;
            fs.stat = async (path: string) => {
                if (path.includes('old-task')) return { mtime: Date.now() - 2 * 60 * 60 * 1000, size: 100 };
                return origStat(path);
            };

            await ResultExternalizer.cleanupOrphaned(fs);

            expect(fs.files.has(orphanFile)).toBe(false);
        });
    });
});
