/**
 * FEAT-29-09 Step A: TDD tests for SkillSnapshotService.
 *
 * Architecture decisions (per PLAN-32, user-approved):
 *   - Full file copies in <skill-folder>/.versions/{timestamp}/.
 *     No diff-chain -- simpler, robust, no chain-corruption.
 *   - Each snapshot has a snapshot.json sidecar with metadata.
 *   - Restore is atomic via staging folder: write all files to
 *     {skill-folder}/.restore-staging-{ts}/, then rename onto the
 *     skill folder. Pre-restore snapshot first so restore is reversible.
 *   - Tagged versions exempt from prune.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillSnapshotService } from '../SkillSnapshotService';

interface StubAdapter {
    exists(p: string): Promise<boolean>;
    mkdir(p: string): Promise<void>;
    read(p: string): Promise<string>;
    write(p: string, content: string): Promise<void>;
    remove(p: string): Promise<void>;
    rmdir(p: string, recursive: boolean): Promise<void>;
    list(p: string): Promise<{ files: string[]; folders: string[] }>;
}

function makeStubAdapter() {
    const files = new Map<string, string>();
    const folders = new Set<string>();

    const adapter: StubAdapter = {
        async exists(p) {
            return files.has(p) || folders.has(p);
        },
        async mkdir(p) {
            folders.add(p);
        },
        async read(p) {
            const v = files.get(p);
            if (v === undefined) throw new Error(`ENOENT: ${p}`);
            return v;
        },
        async write(p, content) {
            files.set(p, content);
            const parent = p.slice(0, p.lastIndexOf('/'));
            if (parent) folders.add(parent);
        },
        async remove(p) {
            files.delete(p);
        },
        async rmdir(p) {
            folders.delete(p);
            for (const k of [...files.keys()]) {
                if (k.startsWith(p + '/')) files.delete(k);
            }
            for (const k of [...folders]) {
                if (k.startsWith(p + '/')) folders.delete(k);
            }
        },
        async list(p) {
            const prefix = p.endsWith('/') ? p : p + '/';
            return {
                files: [...files.keys()].filter(
                    (k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'),
                ),
                folders: [...folders].filter(
                    (k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'),
                ),
            };
        },
    };

    return { adapter, files, folders };
}

const SKILLS_ROOT = '.vault-operator/data/skills';

async function seedSkill(stub: ReturnType<typeof makeStubAdapter>, name: string, files: Record<string, string>) {
    const root = `${SKILLS_ROOT}/${name}`;
    await stub.adapter.mkdir(root);
    for (const [relPath, content] of Object.entries(files)) {
        const fullPath = `${root}/${relPath}`;
        const parent = fullPath.slice(0, fullPath.lastIndexOf('/'));
        if (parent !== root) await stub.adapter.mkdir(parent);
        await stub.adapter.write(fullPath, content);
    }
}

describe('SkillSnapshotService', () => {
    let stub: ReturnType<typeof makeStubAdapter>;
    let svc: SkillSnapshotService;

    beforeEach(() => {
        stub = makeStubAdapter();
        svc = new SkillSnapshotService(stub.adapter as never, SKILLS_ROOT);
    });

    describe('snapshot', () => {
        it('creates a .versions/{id}/ folder with copies of every skill file', async () => {
            await seedSkill(stub, 'my-skill', {
                'SKILL.md': '---\nname: my-skill\n---\n\nBody',
                'scripts/foo.js': 'export async function execute() {}',
                'references/notes.md': '# Notes',
            });

            const meta = await svc.snapshot('my-skill');

            const root = `${SKILLS_ROOT}/my-skill`;
            // Snapshot folder exists with the id
            expect(stub.folders.has(`${root}/.versions/${meta.id}`)).toBe(true);
            // Each file is copied
            expect(stub.files.get(`${root}/.versions/${meta.id}/SKILL.md`)).toBe('---\nname: my-skill\n---\n\nBody');
            expect(stub.files.get(`${root}/.versions/${meta.id}/scripts/foo.js`)).toBe('export async function execute() {}');
            expect(stub.files.get(`${root}/.versions/${meta.id}/references/notes.md`)).toBe('# Notes');
        });

        it('writes a snapshot.json sidecar with metadata', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'content' });
            const meta = await svc.snapshot('my-skill', 'auto');

            const root = `${SKILLS_ROOT}/my-skill`;
            const sidecar = stub.files.get(`${root}/.versions/${meta.id}/snapshot.json`);
            expect(sidecar).toBeDefined();
            const parsed = JSON.parse(sidecar!);
            expect(parsed.id).toBe(meta.id);
            expect(parsed.label).toBe('auto');
            expect(parsed.tags).toEqual([]);
            expect(parsed.fileCount).toBe(1);
            expect(typeof parsed.createdAt).toBe('string');
            expect(typeof parsed.totalBytes).toBe('number');
        });

        it('excludes .versions/ from the snapshot (no infinite recursion)', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'content' });
            await svc.snapshot('my-skill');
            // Second snapshot should not contain the first snapshot's files
            const meta2 = await svc.snapshot('my-skill');

            const root = `${SKILLS_ROOT}/my-skill`;
            const snap2Prefix = `${root}/.versions/${meta2.id}/`;
            // The second snapshot does NOT contain a nested `.versions/`
            // entry (its own children-paths past the snap2 prefix must
            // have no further `.versions/`).
            const filesInSnap2 = [...stub.files.keys()].filter((k) =>
                k.startsWith(snap2Prefix),
            );
            const childPaths = filesInSnap2.map((p) => p.slice(snap2Prefix.length));
            expect(childPaths.some((p) => p.includes('.versions/'))).toBe(false);
            expect(childPaths.some((p) => p === 'snapshot.json')).toBe(true);
            expect(childPaths.some((p) => p === 'SKILL.md')).toBe(true);
        });

        it('returns ascending IDs for chronological order', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v1' });
            const m1 = await svc.snapshot('my-skill');
            // Force a small delay so the timestamps differ
            await new Promise((r) => setTimeout(r, 5));
            await stub.adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, 'v2');
            const m2 = await svc.snapshot('my-skill');
            expect(m2.id > m1.id).toBe(true);
        });
    });

    describe('list', () => {
        it('returns snapshots newest-first', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v1' });
            const m1 = await svc.snapshot('my-skill');
            await new Promise((r) => setTimeout(r, 5));
            const m2 = await svc.snapshot('my-skill');

            const list = await svc.list('my-skill');
            expect(list).toHaveLength(2);
            expect(list[0].id).toBe(m2.id);
            expect(list[1].id).toBe(m1.id);
        });

        it('returns empty array when no snapshots exist', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v1' });
            const list = await svc.list('my-skill');
            expect(list).toEqual([]);
        });

        it('skips entries with a missing or unreadable snapshot.json', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v1' });
            await svc.snapshot('my-skill');
            // Manually create a corrupt snapshot folder (no snapshot.json)
            await stub.adapter.mkdir(`${SKILLS_ROOT}/my-skill/.versions/corrupt-id`);

            const list = await svc.list('my-skill');
            expect(list).toHaveLength(1); // only the valid one
        });
    });

    describe('restore', () => {
        it('restores files from the snapshot to the skill folder', async () => {
            await seedSkill(stub, 'my-skill', {
                'SKILL.md': 'original',
                'scripts/foo.js': 'original-script',
            });
            const m1 = await svc.snapshot('my-skill');

            // Modify the skill
            await stub.adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, 'modified');
            await stub.adapter.write(`${SKILLS_ROOT}/my-skill/scripts/foo.js`, 'modified-script');

            // Restore
            await svc.restore('my-skill', m1.id);

            expect(stub.files.get(`${SKILLS_ROOT}/my-skill/SKILL.md`)).toBe('original');
            expect(stub.files.get(`${SKILLS_ROOT}/my-skill/scripts/foo.js`)).toBe('original-script');
        });

        it('creates a pre-restore snapshot so the restore is reversible', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'original' });
            const m1 = await svc.snapshot('my-skill');
            await stub.adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, 'modified');

            const listBefore = await svc.list('my-skill');
            expect(listBefore).toHaveLength(1);

            await svc.restore('my-skill', m1.id);

            const listAfter = await svc.list('my-skill');
            expect(listAfter.length).toBeGreaterThanOrEqual(2);
            // The newest snapshot is the pre-restore one
            expect(listAfter[0].label).toBe('pre-restore');
        });

        it('rejects an unknown snapshot id', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v1' });
            await expect(svc.restore('my-skill', 'no-such-id')).rejects.toThrow();
        });

        it('removes files that were not in the snapshot', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'original' });
            const m1 = await svc.snapshot('my-skill');

            // Add a new file after the snapshot
            await stub.adapter.write(`${SKILLS_ROOT}/my-skill/scripts/new.js`, 'added-later');
            expect(stub.files.has(`${SKILLS_ROOT}/my-skill/scripts/new.js`)).toBe(true);

            await svc.restore('my-skill', m1.id);

            // new.js was not in the snapshot -> gone after restore
            expect(stub.files.has(`${SKILLS_ROOT}/my-skill/scripts/new.js`)).toBe(false);
            expect(stub.files.get(`${SKILLS_ROOT}/my-skill/SKILL.md`)).toBe('original');
        });
    });

    describe('tag / untag', () => {
        it('adds a tag to the snapshot metadata', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v1' });
            const m1 = await svc.snapshot('my-skill');

            await svc.tag('my-skill', m1.id, 'release-v1');

            const list = await svc.list('my-skill');
            expect(list[0].tags).toContain('release-v1');
        });

        it('tag is idempotent (adding same tag twice does nothing)', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v1' });
            const m1 = await svc.snapshot('my-skill');
            await svc.tag('my-skill', m1.id, 'release-v1');
            await svc.tag('my-skill', m1.id, 'release-v1');

            const list = await svc.list('my-skill');
            expect(list[0].tags).toEqual(['release-v1']);
        });

        it('untag removes the tag', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v1' });
            const m1 = await svc.snapshot('my-skill');
            await svc.tag('my-skill', m1.id, 'release-v1');
            await svc.tag('my-skill', m1.id, 'staging');

            await svc.untag('my-skill', m1.id, 'release-v1');

            const list = await svc.list('my-skill');
            expect(list[0].tags).toEqual(['staging']);
        });
    });

    describe('prune', () => {
        it('removes oldest auto snapshots beyond the retention count', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v0' });
            const created: string[] = [];
            for (let i = 1; i <= 5; i++) {
                await stub.adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, `v${i}`);
                const m = await svc.snapshot('my-skill', 'auto');
                created.push(m.id);
                await new Promise((r) => setTimeout(r, 2));
            }
            expect((await svc.list('my-skill')).length).toBe(5);

            const result = await svc.prune('my-skill', 3);

            const remaining = await svc.list('my-skill');
            expect(remaining.length).toBe(3);
            // Newest 3 are kept
            expect(remaining.map((s) => s.id)).toEqual([created[4], created[3], created[2]]);
            expect(result.removed).toEqual([created[0], created[1]]);
        });

        it('never removes tagged snapshots', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v0' });
            const created: string[] = [];
            for (let i = 1; i <= 5; i++) {
                await stub.adapter.write(`${SKILLS_ROOT}/my-skill/SKILL.md`, `v${i}`);
                const m = await svc.snapshot('my-skill', 'auto');
                created.push(m.id);
                await new Promise((r) => setTimeout(r, 2));
            }
            // Tag the oldest
            await svc.tag('my-skill', created[0], 'preserve');

            await svc.prune('my-skill', 2);

            const remaining = await svc.list('my-skill');
            // 2 newest auto + 1 tagged = 3
            expect(remaining.length).toBe(3);
            const ids = remaining.map((s) => s.id);
            expect(ids).toContain(created[0]); // tagged survives
            expect(ids).toContain(created[4]); // newest survives
            expect(ids).toContain(created[3]); // second-newest survives
        });

        it('is a no-op when there are fewer snapshots than the retention count', async () => {
            await seedSkill(stub, 'my-skill', { 'SKILL.md': 'v0' });
            await svc.snapshot('my-skill');
            const result = await svc.prune('my-skill', 10);
            expect(result.removed).toEqual([]);
            expect((await svc.list('my-skill')).length).toBe(1);
        });
    });

    describe('edge cases', () => {
        it('rejects unsafe skill names', async () => {
            await expect(svc.snapshot('../escape')).rejects.toThrow();
        });

        it('snapshot of an empty skill folder yields a snapshot with 0 files', async () => {
            await stub.adapter.mkdir(`${SKILLS_ROOT}/empty`);
            const meta = await svc.snapshot('empty');
            expect(meta.fileCount).toBe(0);
        });
    });
});
