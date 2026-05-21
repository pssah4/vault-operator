/**
 * FEAT-29-09 Step B: tests for SkillWriteInterceptor.
 *
 * The interceptor wraps `adapter.write` and `adapter.writeBinary` on the
 * live vault adapter. Whenever a write targets a path inside
 * `<skillsRoot>/{name}/...`, the interceptor takes a snapshot of the
 * skill folder BEFORE delegating to the original write. So WriteFileTool,
 * EditFileTool, sandbox-bridge writes, and manual edits via Obsidian's
 * editor all gain versioning automatically.
 *
 * Debounce: subsequent writes to the same skill within a 5-second
 * window share the previous snapshot -- multi-file edits (e.g. SKILL.md
 * + scripts/foo.js together) get one snapshot, not one per file.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillWriteInterceptor } from '../SkillWriteInterceptor';

interface SnapshotCall {
    skillName: string;
    label?: string;
}

interface MockAdapter {
    write(path: string, content: string): Promise<void>;
    writeBinary?(path: string, content: ArrayBuffer): Promise<void>;
}

function makeAdapter(): { adapter: MockAdapter; writes: Array<{ path: string; content: string }> } {
    const writes: Array<{ path: string; content: string }> = [];
    const adapter: MockAdapter = {
        async write(path, content) {
            writes.push({ path, content });
        },
        async writeBinary(path, content) {
            writes.push({ path, content: `<binary-${content.byteLength}>` });
        },
    };
    return { adapter, writes };
}

function makeSnapshotService(): { service: { snapshot: (n: string, l?: string) => Promise<{ id: string }> }; calls: SnapshotCall[] } {
    const calls: SnapshotCall[] = [];
    const service = {
        async snapshot(skillName: string, label?: string) {
            calls.push({ skillName, label });
            return { id: `mock-${calls.length}` };
        },
    };
    return { service, calls };
}

const SKILLS_ROOT = '.vault-operator/data/skills';

describe('SkillWriteInterceptor', () => {
    let adapter: MockAdapter;
    let writes: Array<{ path: string; content: string }>;
    let service: { snapshot: (n: string, l?: string) => Promise<{ id: string }> };
    let snapshotCalls: SnapshotCall[];
    let interceptor: SkillWriteInterceptor;

    beforeEach(() => {
        const a = makeAdapter();
        adapter = a.adapter;
        writes = a.writes;
        const s = makeSnapshotService();
        service = s.service;
        snapshotCalls = s.calls;
        interceptor = new SkillWriteInterceptor(adapter as never, service as never, SKILLS_ROOT);
        // Default: 5s debounce, no skill-folder existence requirement
        interceptor.install();
    });

    it('takes a snapshot before writing to <skillsRoot>/{name}/...', async () => {
        await adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, 'new content');

        expect(snapshotCalls).toEqual([{ skillName: 'my-skill', label: 'auto' }]);
        expect(writes).toEqual([{ path: `${SKILLS_ROOT}/my-skill/SKILL.md`, content: 'new content' }]);
    });

    it('takes the snapshot BEFORE the write (snapshot is the pre-state)', async () => {
        const events: string[] = [];
        snapshotCalls.length = 0;
        // Replace the service to record ordering
        const orderedSvc = {
            async snapshot(skillName: string) {
                events.push(`snapshot-${skillName}`);
                return { id: 'x' };
            },
        };
        const orderedAdapter: MockAdapter = {
            async write(path, _content) {
                events.push(`write-${path}`);
            },
        };
        const i2 = new SkillWriteInterceptor(orderedAdapter as never, orderedSvc as never, SKILLS_ROOT);
        i2.install();

        await orderedAdapter.write(`${SKILLS_ROOT}/foo/SKILL.md`, 'x');

        expect(events).toEqual([
            'snapshot-foo',
            `write-${SKILLS_ROOT}/foo/SKILL.md`,
        ]);
    });

    it('does NOT snapshot for writes outside <skillsRoot>', async () => {
        await adapter.write('Notes/My Note.md', 'content');
        expect(snapshotCalls).toEqual([]);
        expect(writes).toEqual([{ path: 'Notes/My Note.md', content: 'content' }]);
    });

    it('does NOT snapshot for writes to the .versions/ subfolder itself', async () => {
        await adapter.write(
            `${SKILLS_ROOT}/my-skill/.versions/some-id/SKILL.md`,
            'snapshot copy',
        );
        // The snapshot service itself writes inside .versions/ -- if we
        // snapshotted that, we'd recurse infinitely.
        expect(snapshotCalls).toEqual([]);
    });

    it('does NOT snapshot for writes to skills-root itself (no skill name)', async () => {
        await adapter.write(SKILLS_ROOT, 'bogus');
        expect(snapshotCalls).toEqual([]);
    });

    it('debounces multiple writes to the same skill within 5 seconds', async () => {
        await adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, 'v1');
        await adapter.write(`${SKILLS_ROOT}/my-skill/scripts/foo.js`, 'v2');
        await adapter.write(`${SKILLS_ROOT}/my-skill/references/notes.md`, 'v3');

        // Three writes, but only one snapshot
        expect(snapshotCalls).toEqual([{ skillName: 'my-skill', label: 'auto' }]);
        expect(writes).toHaveLength(3);
    });

    it('takes a fresh snapshot for a different skill (independent debouncing)', async () => {
        await adapter.write(`${SKILLS_ROOT}/skill-a/SKILL.md`, 'a');
        await adapter.write(`${SKILLS_ROOT}/skill-b/SKILL.md`, 'b');

        expect(snapshotCalls.map((s) => s.skillName)).toEqual(['skill-a', 'skill-b']);
    });

    it('takes a fresh snapshot after the debounce window expires', async () => {
        vi.useFakeTimers();
        try {
            await adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, 'v1');
            vi.advanceTimersByTime(6000); // past 5s window
            await adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, 'v2');

            expect(snapshotCalls).toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('still delegates the write even if the snapshot call throws', async () => {
        const failingSvc = {
            async snapshot() {
                throw new Error('snapshot failed');
            },
        };
        const a2 = makeAdapter();
        const i2 = new SkillWriteInterceptor(a2.adapter as never, failingSvc as never, SKILLS_ROOT);
        i2.install();

        await a2.adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, 'content');

        // Write went through despite snapshot failure
        expect(a2.writes).toEqual([{ path: `${SKILLS_ROOT}/my-skill/SKILL.md`, content: 'content' }]);
    });

    it('intercepts writeBinary the same way as write', async () => {
        const buf = new TextEncoder().encode('image-data').buffer;
        await adapter.writeBinary?.(`${SKILLS_ROOT}/my-skill/assets/icon.png`, buf);
        expect(snapshotCalls).toEqual([{ skillName: 'my-skill', label: 'auto' }]);
    });

    it('uninstall restores the original write and stops snapshotting', async () => {
        interceptor.uninstall();
        await adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, 'after uninstall');
        expect(snapshotCalls).toEqual([]);
    });
});
