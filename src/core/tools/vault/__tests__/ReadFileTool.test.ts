/**
 * BUG-020 unit test -- externalised tmp path retry.
 *
 * Only tests the pure helper. Exercising the full ReadFileTool would
 * need a mock plugin with a vault adapter; the helper carries the
 * security-relevant logic (strict prefix, traversal guard) so testing
 * it in isolation is enough to lock the contract.
 */

import { describe, it, expect } from 'vitest';
import { looksLikeExternalisedTmpPath } from '../ReadFileTool';

describe('looksLikeExternalisedTmpPath', () => {
    it('matches the externaliser pattern', () => {
        expect(looksLikeExternalisedTmpPath('tmp/task-abc123/result.md')).toBe(true);
        expect(looksLikeExternalisedTmpPath('tmp/task-xyz/search_files-0.md')).toBe(true);
    });

    it('rejects unrelated tmp paths', () => {
        expect(looksLikeExternalisedTmpPath('tmp.md')).toBe(false);
        expect(looksLikeExternalisedTmpPath('tmp/foo.md')).toBe(false);
        expect(looksLikeExternalisedTmpPath('tmp/task/file.md')).toBe(false); // missing -<id>
        expect(looksLikeExternalisedTmpPath('other/tmp/task-abc/x.md')).toBe(false);
    });

    it('rejects path traversal segments', () => {
        expect(looksLikeExternalisedTmpPath('tmp/task-abc/../secret.md')).toBe(false);
        expect(looksLikeExternalisedTmpPath('tmp/../task-abc/result.md')).toBe(false);
    });

    it('rejects paths with null bytes', () => {
        expect(looksLikeExternalisedTmpPath('tmp/task-abc/\u0000poisoned.md')).toBe(false);
    });

    it('requires at least tmp/task-<id>/<filename>', () => {
        expect(looksLikeExternalisedTmpPath('tmp/task-abc')).toBe(false);
        expect(looksLikeExternalisedTmpPath('tmp/task-abc/')).toBe(true); // trailing slash -> 3 segments
    });
});
