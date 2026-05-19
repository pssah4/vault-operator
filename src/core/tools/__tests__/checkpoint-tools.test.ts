/**
 * IMP-01-07-01 coverage for the four agent-facing checkpoint tools.
 *
 * The tools layer the real GitCheckpointService -- we seed a shadow repo in
 * a tmpdir with hand-crafted checkpoint commits, hand the service to a
 * minimal fake plugin, and drive the tools' execute() through a captured
 * ToolExecutionContext. The restore tool is not exercised end-to-end here
 * (it writes through vault.adapter / vault.modify which only exists in
 * Electron); we instead assert its tool definition and refuse-paths logic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import git from 'isomorphic-git';
import { App, Vault } from 'obsidian';

import { GitCheckpointService } from '../../checkpoints/GitCheckpointService';
import { ListCheckpointsTool } from '../vault/ListCheckpointsTool';
import { ReadCheckpointTool } from '../vault/ReadCheckpointTool';
import { DiffCheckpointTool } from '../vault/DiffCheckpointTool';
import { RestoreCheckpointTool } from '../vault/RestoreCheckpointTool';
import type { ToolCallbacks, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

async function seedCheckpoint(repo: string, message: string, files: Record<string, string> = {}): Promise<string> {
    await fs.promises.mkdir(repo, { recursive: true });
    try {
        await git.resolveRef({ fs, dir: repo, ref: 'HEAD' });
    } catch {
        await git.init({ fs, dir: repo, defaultBranch: 'main' });
    }
    for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(repo, rel);
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        await fs.promises.writeFile(abs, content, 'utf8');
        await git.add({ fs, dir: repo, filepath: rel });
    }
    if (Object.keys(files).length === 0) {
        // Still need a blob to commit (isomorphic-git refuses empty commits).
        const marker = `.seed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await fs.promises.writeFile(path.join(repo, marker), '', 'utf8');
        await git.add({ fs, dir: repo, filepath: marker });
    }
    return git.commit({
        fs,
        dir: repo,
        author: { name: 'test', email: 't@t.test' },
        message,
    });
}

function makeCapturedContext(): { context: ToolExecutionContext; results: string[]; errors: unknown[] } {
    const results: string[] = [];
    const errors: unknown[] = [];
    const callbacks: ToolCallbacks = {
        pushToolResult(content) {
            results.push(typeof content === 'string' ? content : JSON.stringify(content));
        },
        handleError(_name, err) {
            errors.push(err);
        },
        log() { /* ignore */ },
    };
    const context: ToolExecutionContext = {
        taskId: 'test-task',
        mode: 'agent',
        callbacks,
    };
    return { context, results, errors };
}

describe('checkpoint tools (IMP-01-07-01)', () => {
    let tmpdir: string;
    let service: GitCheckpointService;
    let fakePlugin: ObsidianAgentPlugin;

    beforeEach(async () => {
        tmpdir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cp-tools-test-'));
        service = new GitCheckpointService(new App(), new Vault(), tmpdir);
        fakePlugin = {
            app: new App(),
            checkpointService: service,
            settings: { enableCheckpoints: true },
        } as unknown as ObsidianAgentPlugin;
    });

    afterEach(async () => {
        await fs.promises.rm(tmpdir, { recursive: true, force: true });
    });

    describe('tool definitions', () => {
        it('every tool exposes the expected name and write flag', () => {
            const list = new ListCheckpointsTool(fakePlugin);
            const read = new ReadCheckpointTool(fakePlugin);
            const diff = new DiffCheckpointTool(fakePlugin);
            const restore = new RestoreCheckpointTool(fakePlugin);

            expect(list.name).toBe('list_checkpoints');
            expect(list.isWriteOperation).toBe(false);
            expect(read.name).toBe('read_checkpoint');
            expect(read.isWriteOperation).toBe(false);
            expect(diff.name).toBe('diff_checkpoint');
            expect(diff.isWriteOperation).toBe(false);
            expect(restore.name).toBe('restore_checkpoint');
            expect(restore.isWriteOperation).toBe(true);
        });

        it('each definition declares commitOid where it is required', () => {
            const read = new ReadCheckpointTool(fakePlugin).getDefinition();
            const diff = new DiffCheckpointTool(fakePlugin).getDefinition();
            const restore = new RestoreCheckpointTool(fakePlugin).getDefinition();
            expect(read.input_schema.required).toContain('commitOid');
            expect(read.input_schema.required).toContain('path');
            expect(diff.input_schema.required).toContain('commitOid');
            expect(restore.input_schema.required).toContain('commitOid');
        });
    });

    describe('list_checkpoints', () => {
        it('reports no checkpoints when the shadow repo is empty of matching commits', async () => {
            await seedCheckpoint(tmpdir, 'unrelated commit');
            const tool = new ListCheckpointsTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({}, context);
            expect(results[0]).toContain('No checkpoints match');
        });

        it('lists checkpoints across tasks newest-first by default', async () => {
            await seedCheckpoint(tmpdir, 'checkpoint:task-A\n\nFilesJson: ["a.md"]');
            await new Promise((r) => setTimeout(r, 1100));
            await seedCheckpoint(tmpdir, 'checkpoint:task-B\n\nFilesJson: ["b.md"]');
            const tool = new ListCheckpointsTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({}, context);
            const out = results[0]!;
            // newest first -> task-B should appear before task-A in the output
            const idxA = out.indexOf('task-A');
            const idxB = out.indexOf('task-B');
            expect(idxB).toBeGreaterThanOrEqual(0);
            expect(idxA).toBeGreaterThan(idxB);
        });

        it('filters by path when supplied', async () => {
            await seedCheckpoint(tmpdir, 'checkpoint:task-A\n\nFilesJson: ["a.md","shared.md"]');
            await seedCheckpoint(tmpdir, 'checkpoint:task-B\n\nFilesJson: ["b.md"]');
            const tool = new ListCheckpointsTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ path: 'shared.md' }, context);
            const out = results[0]!;
            expect(out).toContain('task-A');
            expect(out).not.toContain('task-B');
        });

        it('restricts to a single task when taskId is supplied', async () => {
            await seedCheckpoint(tmpdir, 'checkpoint:task-X\n\nFilesJson: ["x.md"]');
            await seedCheckpoint(tmpdir, 'checkpoint:task-Y\n\nFilesJson: ["y.md"]');
            const tool = new ListCheckpointsTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ taskId: 'task-X' }, context);
            const out = results[0]!;
            expect(out).toContain('task-X');
            expect(out).not.toContain('task-Y');
        });

        it('renders verbose mode with explicit field labels', async () => {
            await seedCheckpoint(tmpdir, 'checkpoint:task-V\n\nFilesJson: ["v.md"]');
            const tool = new ListCheckpointsTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ verbose: true }, context);
            const out = results[0]!;
            expect(out).toMatch(/oid:\s+[0-9a-f]{40}/);
            expect(out).toContain('taskId:');
            expect(out).toContain('timestamp:');
        });
    });

    describe('read_checkpoint', () => {
        it('returns the snapshot content of a file in a checkpoint', async () => {
            const oid = await seedCheckpoint(
                tmpdir,
                'checkpoint:task-R\n\nFilesJson: ["note.md"]',
                { 'note.md': 'OLD CONTENT' },
            );
            const tool = new ReadCheckpointTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ commitOid: oid, path: 'note.md' }, context);
            expect(results[0]).toContain('OLD CONTENT');
        });

        it('errors when the oid is unknown', async () => {
            await seedCheckpoint(tmpdir, 'checkpoint:task-R\n\nFilesJson: ["note.md"]', { 'note.md': 'hi' });
            const tool = new ReadCheckpointTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ commitOid: '0'.repeat(40), path: 'note.md' }, context);
            expect(results[0]).toContain('<error>');
            expect(results[0]).toContain('Unknown checkpoint oid');
        });

        it('refuses path traversal at the tool boundary', async () => {
            const oid = await seedCheckpoint(
                tmpdir,
                'checkpoint:task-R\n\nFilesJson: ["note.md"]',
                { 'note.md': 'safe' },
            );
            const tool = new ReadCheckpointTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ commitOid: oid, path: '../etc/passwd' }, context);
            expect(results[0]).toContain('<error>');
            expect(results[0]).toContain('vault-relative');
        });

        it('errors with a clear message when the path is not in the checkpoint', async () => {
            const oid = await seedCheckpoint(
                tmpdir,
                'checkpoint:task-R\n\nFilesJson: ["note.md"]',
                { 'note.md': 'present' },
            );
            const tool = new ReadCheckpointTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ commitOid: oid, path: 'missing.md' }, context);
            expect(results[0]).toContain('<error>');
            expect(results[0]).toContain('not found in checkpoint');
        });
    });

    describe('diff_checkpoint', () => {
        it('errors when the path is not part of the checkpoint', async () => {
            const oid = await seedCheckpoint(
                tmpdir,
                'checkpoint:task-D\n\nFilesJson: ["a.md"]',
                { 'a.md': 'one' },
            );
            const tool = new DiffCheckpointTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ commitOid: oid, path: 'unrelated.md' }, context);
            expect(results[0]).toContain('<error>');
            expect(results[0]).toContain('not part of checkpoint');
        });

        it('refuses traversal-shaped paths', async () => {
            const oid = await seedCheckpoint(tmpdir, 'checkpoint:task-D\n\nFilesJson: ["a.md"]', { 'a.md': 'x' });
            const tool = new DiffCheckpointTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ commitOid: oid, path: '../leak' }, context);
            expect(results[0]).toContain('<error>');
            expect(results[0]).toContain('vault-relative');
        });
    });

    describe('restore_checkpoint', () => {
        it('errors on unknown oid before any write occurs', async () => {
            const tool = new RestoreCheckpointTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ commitOid: '0'.repeat(40), path: 'a.md' }, context);
            expect(results[0]).toContain('<error>');
            expect(results[0]).toContain('Unknown checkpoint oid');
        });

        it('refuses traversal-shaped paths', async () => {
            const oid = await seedCheckpoint(tmpdir, 'checkpoint:task-R\n\nFilesJson: ["a.md"]', { 'a.md': 'x' });
            const tool = new RestoreCheckpointTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ commitOid: oid, path: '../etc/passwd', mode: 'file' }, context);
            expect(results[0]).toContain('<error>');
            expect(results[0]).toContain('vault-relative');
        });

        it('requires a path when mode="file" is explicitly requested', async () => {
            const oid = await seedCheckpoint(tmpdir, 'checkpoint:task-R\n\nFilesJson: ["a.md"]', { 'a.md': 'x' });
            const tool = new RestoreCheckpointTool(fakePlugin);
            const { context, results } = makeCapturedContext();
            await tool.execute({ commitOid: oid, mode: 'file' }, context);
            expect(results[0]).toContain('<error>');
            expect(results[0]).toContain('path is required');
        });
    });
});
