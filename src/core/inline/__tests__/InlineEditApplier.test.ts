import { describe, it, expect, vi } from 'vitest';
import { applyInlineEdit, inlineTaskId } from '../InlineEditApplier';
import type { CheckpointInfo, GitCheckpointService } from '../../checkpoints/GitCheckpointService';
import type { App } from 'obsidian';

function makeService(overrides: Partial<{ snapshot: ReturnType<typeof vi.fn> }> = {}): GitCheckpointService {
    const defaultCheckpoint: CheckpointInfo = {
        taskId: 'inline-abcd',
        commitOid: 'oid-1',
        timestamp: '2026-06-22T00:00:00Z',
        filesChanged: ['Notes/A.md'],
    };
    const snapshot = overrides.snapshot ?? vi.fn().mockResolvedValue(defaultCheckpoint);
    return { snapshot } as unknown as GitCheckpointService;
}

const app = {} as App;

describe('applyInlineEdit', () => {
    it('returns "skipped" when selection is empty', async () => {
        const openReview = vi.fn();
        const writeBack = vi.fn();
        const result = await applyInlineEdit({
            app,
            checkpointService: makeService(),
            notePath: 'Notes/A.md',
            selection: { from: 0, to: 0, text: '' },
            proposedText: 'rewrite',
            actionLabel: 'Inline-AI: Rewrite',
            taskId: 'inline-abcd',
            toolName: 'inline:rewrite',
            openReview,
            writeBack,
        });
        expect(result.status).toBe('skipped');
        expect(openReview).not.toHaveBeenCalled();
        expect(writeBack).not.toHaveBeenCalled();
    });

    it('returns "discarded" when user discards the review', async () => {
        const openReview = vi.fn().mockResolvedValue(null);
        const writeBack = vi.fn();
        const service = makeService();
        const result = await applyInlineEdit({
            app,
            checkpointService: service,
            notePath: 'Notes/A.md',
            selection: { from: 0, to: 5, text: 'hello' },
            proposedText: 'world',
            actionLabel: 'Inline-AI: Rewrite',
            taskId: 'inline-abcd',
            toolName: 'inline:rewrite',
            openReview,
            writeBack,
        });
        expect(result.status).toBe('discarded');
        expect(service.snapshot).not.toHaveBeenCalled();
        expect(writeBack).not.toHaveBeenCalled();
    });

    it('returns "skipped" when user toggled skipped in the review', async () => {
        const openReview = vi.fn().mockResolvedValue({ path: 'Notes/A.md', finalContent: 'world', skipped: true });
        const writeBack = vi.fn();
        const service = makeService();
        const result = await applyInlineEdit({
            app,
            checkpointService: service,
            notePath: 'Notes/A.md',
            selection: { from: 0, to: 5, text: 'hello' },
            proposedText: 'world',
            actionLabel: 'Inline-AI: Rewrite',
            taskId: 'inline-abcd',
            toolName: 'inline:rewrite',
            openReview,
            writeBack,
        });
        expect(result.status).toBe('skipped');
        expect(service.snapshot).not.toHaveBeenCalled();
        expect(writeBack).not.toHaveBeenCalled();
    });

    it('snapshots, writes back, and returns checkpoint on apply', async () => {
        const openReview = vi.fn().mockResolvedValue({
            path: 'Notes/A.md',
            finalContent: 'user edited content',
            skipped: false,
        });
        const writeBack = vi.fn().mockResolvedValue(undefined);
        const expectedCheckpoint: CheckpointInfo = {
            taskId: 'inline-abcd',
            commitOid: 'oid-1',
            timestamp: '2026-06-22T00:00:00Z',
            filesChanged: ['Notes/A.md'],
        };
        const snapshot = vi.fn().mockResolvedValue(expectedCheckpoint);
        const service = makeService({ snapshot });

        const result = await applyInlineEdit({
            app,
            checkpointService: service,
            notePath: 'Notes/A.md',
            selection: { from: 0, to: 5, text: 'hello' },
            proposedText: 'streamed',
            actionLabel: 'Inline-AI: Rewrite',
            taskId: 'inline-abcd',
            toolName: 'inline:rewrite',
            openReview,
            writeBack,
        });

        expect(result.status).toBe('applied');
        expect(result.checkpoint).toEqual(expectedCheckpoint);
        expect(result.finalContent).toBe('user edited content');
        expect(snapshot).toHaveBeenCalledWith('inline-abcd', ['Notes/A.md'], 'inline:rewrite');
        expect(writeBack).toHaveBeenCalledWith('user edited content');
    });

    it('still applies when checkpoint service is missing', async () => {
        const openReview = vi.fn().mockResolvedValue({
            path: 'Notes/A.md',
            finalContent: 'override',
            skipped: false,
        });
        const writeBack = vi.fn().mockResolvedValue(undefined);
        const result = await applyInlineEdit({
            app,
            checkpointService: null,
            notePath: 'Notes/A.md',
            selection: { from: 0, to: 5, text: 'hello' },
            proposedText: 'streamed',
            actionLabel: 'Inline-AI: Rewrite',
            taskId: 'inline-abcd',
            toolName: 'inline:rewrite',
            openReview,
            writeBack,
        });
        expect(result.status).toBe('applied');
        expect(result.checkpoint).toBeUndefined();
        expect(writeBack).toHaveBeenCalledWith('override');
    });

    it('does not crash when snapshot rejects (continues without checkpoint)', async () => {
        const openReview = vi.fn().mockResolvedValue({
            path: 'Notes/A.md',
            finalContent: 'override',
            skipped: false,
        });
        const writeBack = vi.fn().mockResolvedValue(undefined);
        const snapshot = vi.fn().mockRejectedValue(new Error('boom'));
        const service = makeService({ snapshot });

        const result = await applyInlineEdit({
            app,
            checkpointService: service,
            notePath: 'Notes/A.md',
            selection: { from: 0, to: 5, text: 'hello' },
            proposedText: 'streamed',
            actionLabel: 'Inline-AI: Rewrite',
            taskId: 'inline-abcd',
            toolName: 'inline:rewrite',
            openReview,
            writeBack,
        });
        expect(result.status).toBe('applied');
        expect(result.checkpoint).toBeUndefined();
        expect(writeBack).toHaveBeenCalledWith('override');
    });

    it('returns "discarded" with error when writeBack throws', async () => {
        const openReview = vi.fn().mockResolvedValue({
            path: 'Notes/A.md',
            finalContent: 'override',
            skipped: false,
        });
        const writeBack = vi.fn().mockRejectedValue(new Error('disk full'));
        const result = await applyInlineEdit({
            app,
            checkpointService: makeService(),
            notePath: 'Notes/A.md',
            selection: { from: 0, to: 5, text: 'hello' },
            proposedText: 'streamed',
            actionLabel: 'Inline-AI: Rewrite',
            taskId: 'inline-abcd',
            toolName: 'inline:rewrite',
            openReview,
            writeBack,
        });
        expect(result.status).toBe('discarded');
        expect(result.error).toContain('disk full');
    });
});

describe('inlineTaskId', () => {
    it('produces a stable hash per note path', () => {
        const a = inlineTaskId('Notes/A.md');
        const b = inlineTaskId('Notes/A.md');
        expect(a).toBe(b);
    });

    it('differs for different paths', () => {
        const a = inlineTaskId('Notes/A.md');
        const b = inlineTaskId('Notes/B.md');
        expect(a).not.toBe(b);
    });

    it('starts with "inline-" prefix and is safe for checkpoint snapshot taskId', () => {
        const id = inlineTaskId('Notes/A.md');
        expect(id.startsWith('inline-')).toBe(true);
        expect(id.includes('/')).toBe(false);
        expect(id.includes('\\')).toBe(false);
        expect(id.includes('..')).toBe(false);
    });
});
