/**
 * Phase 1 of FIX-01-07-02 + IMP-01-07-01: covers the two new rehydration
 * entry points on GitCheckpointService.
 *
 *   loadCheckpointsForTask(taskId)  -- scan shadow repo, rebuild in-memory map
 *   getCheckpointByOid(oid)         -- single-commit lookup for the agent tools
 *
 * The service's existing snapshot()/restore() paths talk to vault.adapter
 * (Obsidian-only). The new methods read ONLY the shadow repo via
 * isomorphic-git, so we can drive them against a tmpdir without an Obsidian
 * vault. Tests seed the shadow repo directly with raw git commits whose
 * message format mirrors what GitCheckpointService.snapshot() would produce.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import git from 'isomorphic-git';
import { App, Vault } from 'obsidian';
import { GitCheckpointService } from '../GitCheckpointService';

async function seedCommit(repo: string, message: string): Promise<string> {
    await fs.promises.mkdir(repo, { recursive: true });
    try {
        await git.resolveRef({ fs, dir: repo, ref: 'HEAD' });
    } catch {
        await git.init({ fs, dir: repo, defaultBranch: 'main' });
    }
    // Each commit needs at least one staged blob.
    const markerName = `.seed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.promises.writeFile(path.join(repo, markerName), '', 'utf8');
    await git.add({ fs, dir: repo, filepath: markerName });
    return git.commit({
        fs,
        dir: repo,
        author: { name: 'test', email: 't@t.test' },
        message,
    });
}

describe('GitCheckpointService rehydration', () => {
    let tmpdir: string;
    let svc: GitCheckpointService;

    beforeEach(async () => {
        tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gccs-test-'));
        svc = new GitCheckpointService(new App(), new Vault(), tmpdir);
    });

    afterEach(async () => {
        await fs.promises.rm(tmpdir, { recursive: true, force: true });
    });

    describe('loadCheckpointsForTask', () => {
        it('returns empty list when no commit matches the taskId', async () => {
            await seedCommit(tmpdir, 'unrelated commit');
            const list = await svc.loadCheckpointsForTask('task-unknown');
            expect(list).toEqual([]);
            // and the in-memory map keeps an explicit empty entry
            expect(svc.getCheckpointsForTask('task-unknown')).toEqual([]);
        });

        it('returns checkpoints in chronological order (oldest first)', async () => {
            await seedCommit(tmpdir, 'checkpoint:task-A\n\nFilesJson: ["a.md"]');
            // git timestamps are second-precision; bump so the order is unambiguous.
            await new Promise((r) => setTimeout(r, 1100));
            await seedCommit(tmpdir, 'checkpoint:task-A\n\nFilesJson: ["b.md"]');

            const list = await svc.loadCheckpointsForTask('task-A');
            expect(list).toHaveLength(2);
            expect(list[0]?.filesChanged).toEqual(['a.md']);
            expect(list[1]?.filesChanged).toEqual(['b.md']);
        });

        it('parses NewFiles when present', async () => {
            await seedCommit(
                tmpdir,
                'checkpoint:task-N\n\nFilesJson: []\n\nNewFiles: ["new.md","also-new.md"]',
            );
            const list = await svc.loadCheckpointsForTask('task-N');
            expect(list[0]?.newFiles).toEqual(['new.md', 'also-new.md']);
        });

        it('survives malformed NewFiles by returning an empty array (no throw)', async () => {
            await seedCommit(
                tmpdir,
                'checkpoint:task-M\n\nFilesJson: ["x.md"]\n\nNewFiles: [not valid json',
            );
            const list = await svc.loadCheckpointsForTask('task-M');
            expect(list[0]?.filesChanged).toEqual(['x.md']);
            expect(list[0]?.newFiles).toBeUndefined();
        });

        it('rejects path-traversal taskId before touching the repo', async () => {
            await expect(svc.loadCheckpointsForTask('../etc/passwd')).rejects.toThrow(
                /unsafe taskId/,
            );
        });

        it('rehydrated entries make getCheckpointsForTask synchronously usable', async () => {
            await seedCommit(tmpdir, 'checkpoint:task-R\n\nFilesJson: ["one.md"]');
            await svc.loadCheckpointsForTask('task-R');
            // Synchronous read after rehydration -- this is the path the UI uses
            // (showPostTaskReview reads from the in-memory map).
            const sync = svc.getCheckpointsForTask('task-R');
            expect(sync).toHaveLength(1);
            expect(sync[0]?.filesChanged).toEqual(['one.md']);
        });
    });

    describe('getCheckpointByOid', () => {
        it('returns a parsed CheckpointInfo for a known checkpoint commit', async () => {
            const oid = await seedCommit(
                tmpdir,
                'checkpoint:task-X\n\nFilesJson: ["x.md"]\n\nNewFiles: ["fresh.md"]',
            );
            const cp = await svc.getCheckpointByOid(oid);
            expect(cp).not.toBeNull();
            expect(cp?.taskId).toBe('task-X');
            expect(cp?.commitOid).toBe(oid);
            expect(cp?.filesChanged).toEqual(['x.md']);
            expect(cp?.newFiles).toEqual(['fresh.md']);
        });

        it('returns null for an unknown oid', async () => {
            await seedCommit(tmpdir, 'unrelated commit');
            const cp = await svc.getCheckpointByOid(
                '0000000000000000000000000000000000000000',
            );
            expect(cp).toBeNull();
        });

        it('returns null when the commit is not a checkpoint commit', async () => {
            const oid = await seedCommit(tmpdir, 'just a regular commit message');
            const cp = await svc.getCheckpointByOid(oid);
            expect(cp).toBeNull();
        });

        it('throws on malformed oid', async () => {
            await expect(svc.getCheckpointByOid('not-a-hash')).rejects.toThrow(
                /Invalid checkpoint oid/,
            );
            await expect(svc.getCheckpointByOid('AAAA')).rejects.toThrow(
                /Invalid checkpoint oid/,
            );
        });
    });
});
