/**
 * FEATURE-0508 regression test: agent-folder change handling.
 *
 * Covers the unit-testable parts of AgentFolderService:
 *  - previewMigration reads the expected files at the old path
 *  - migrate copies (not moves) plugin-skills, vault-dna.json,
 *    knowledge.db, memory.db
 *  - migrate leaves originals in place
 *  - migrate refuses cross-vault absolute paths (until Phase 3)
 *
 * P0 (Notice) and P1 (retargetLiveComponents) live-fire paths are not
 * exercised here because they depend on a full Plugin instance; they
 * have dedicated smoke coverage in the manual release-gate checklist.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentFolderService } from '../agentFolderService';

type MockAdapter = {
    files: Map<string, string>;
    binaries: Map<string, ArrayBuffer>;
    dirs: Set<string>;
    exists: (p: string) => Promise<boolean>;
    read: (p: string) => Promise<string>;
    write: (p: string, data: string) => Promise<void>;
    mkdir: (p: string) => Promise<void>;
    list: (p: string) => Promise<{ files: string[]; folders: string[] }>;
    stat: (p: string) => Promise<{ type: 'file' | 'folder'; ctime: number; mtime: number; size: number } | null>;
    readBinary: (p: string) => Promise<ArrayBuffer>;
    writeBinary: (p: string, data: ArrayBuffer) => Promise<void>;
};

function createMockAdapter(): MockAdapter {
    const files = new Map<string, string>();
    const binaries = new Map<string, ArrayBuffer>();
    const dirs = new Set<string>();

    return {
        files,
        binaries,
        dirs,
        exists: (p) => Promise.resolve(files.has(p) || binaries.has(p) || dirs.has(p)),
        read: (p) => {
            const c = files.get(p);
            if (c === undefined) return Promise.reject(new Error(`not found: ${p}`));
            return Promise.resolve(c);
        },
        write: (p, data) => { files.set(p, data); return Promise.resolve(); },
        mkdir: (p) => { dirs.add(p); return Promise.resolve(); },
        list: (p) => Promise.resolve({
            files: [...files.keys(), ...binaries.keys()].filter((f) => f.startsWith(p + '/')),
            folders: [...dirs].filter((d) => d.startsWith(p + '/')),
        }),
        stat: (p) => Promise.resolve(
            files.has(p)
                ? { type: 'file' as const, ctime: 0, mtime: 0, size: (files.get(p) ?? '').length }
                : binaries.has(p)
                    ? { type: 'file' as const, ctime: 0, mtime: 0, size: (binaries.get(p) ?? new ArrayBuffer(0)).byteLength }
                    : null,
        ),
        readBinary: (p) => {
            const b = binaries.get(p);
            if (!b) return Promise.reject(new Error(`not found: ${p}`));
            return Promise.resolve(b);
        },
        writeBinary: (p, data) => { binaries.set(p, data); return Promise.resolve(); },
    };
}

interface MockPlugin {
    app: { vault: { adapter: MockAdapter } };
    settings: { agentFolderPath: string };
    knowledgeDB: null;
    memoryDB: null;
    skillRegistry: null;
    vaultDNAScanner: null;
}

function makePluginWithAdapter(adapter: MockAdapter): MockPlugin {
    return {
        app: { vault: { adapter } },
        settings: { agentFolderPath: '.obsidian-agent' },
        knowledgeDB: null,
        memoryDB: null,
        skillRegistry: null,
        vaultDNAScanner: null,
    };
}

describe('AgentFolderService (FEATURE-0508)', () => {
    let adapter: MockAdapter;
    let plugin: MockPlugin;
    let service: AgentFolderService;

    beforeEach(() => {
        adapter = createMockAdapter();
        plugin = makePluginWithAdapter(adapter);
        service = new AgentFolderService(plugin as unknown as import('../../../main').default);
    });

    describe('previewMigration', () => {
        it('reports plugin skills, vault-dna, knowledge.db, memory.db', async () => {
            adapter.dirs.add('.obsidian-agent/plugin-skills');
            adapter.files.set('.obsidian-agent/plugin-skills/dataview.skill.md', 'A'.repeat(100));
            adapter.files.set('.obsidian-agent/plugin-skills/tasks.skill.md', 'B'.repeat(200));
            adapter.files.set('.obsidian-agent/vault-dna.json', 'C'.repeat(50));
            adapter.binaries.set('.obsidian-agent/knowledge.db', new ArrayBuffer(1024));
            adapter.binaries.set('.obsidian-agent/memory.db', new ArrayBuffer(512));

            const preview = await service.previewMigration('.obsidian-agent');

            expect(preview.pluginSkills).toHaveLength(2);
            expect(preview.vaultDnaExists).toBe(true);
            expect(preview.knowledgeDbExists).toBe(true);
            expect(preview.memoryDbExists).toBe(true);
            expect(preview.totalBytes).toBe(100 + 200 + 50 + 1024 + 512);
        });

        it('returns an empty preview for a non-existent old path', async () => {
            const preview = await service.previewMigration('_missing/agent');
            expect(preview.pluginSkills).toHaveLength(0);
            expect(preview.vaultDnaExists).toBe(false);
            expect(preview.knowledgeDbExists).toBe(false);
            expect(preview.memoryDbExists).toBe(false);
            expect(preview.totalBytes).toBe(0);
        });

        it('refuses absolute paths and returns an empty preview (Phase 3 only)', async () => {
            const preview = await service.previewMigration('/Users/me/external-skills');
            expect(preview.pluginSkills).toHaveLength(0);
            expect(preview.totalBytes).toBe(0);
        });
    });

    describe('migrate', () => {
        beforeEach(() => {
            adapter.dirs.add('.obsidian-agent/plugin-skills');
            adapter.files.set('.obsidian-agent/plugin-skills/dataview.skill.md', '# dataview skill');
            adapter.files.set('.obsidian-agent/plugin-skills/tasks.skill.md', '# tasks skill');
            adapter.files.set('.obsidian-agent/vault-dna.json', '{"plugins":[]}');
            adapter.binaries.set('.obsidian-agent/knowledge.db', new ArrayBuffer(32));
            adapter.binaries.set('.obsidian-agent/memory.db', new ArrayBuffer(16));
        });

        it('copies plugin-skills, vault-dna, and both DBs to the new path', async () => {
            const result = await service.migrate('.obsidian-agent', '_private/agent');

            expect(result.movedPluginSkills).toBe(2);
            expect(result.movedVaultDna).toBe(true);
            expect(result.movedKnowledgeDb).toBe(true);
            expect(result.movedMemoryDb).toBe(true);
            expect(result.errors).toHaveLength(0);

            expect(adapter.files.has('_private/agent/plugin-skills/dataview.skill.md')).toBe(true);
            expect(adapter.files.has('_private/agent/plugin-skills/tasks.skill.md')).toBe(true);
            expect(adapter.files.has('_private/agent/vault-dna.json')).toBe(true);
            expect(adapter.binaries.has('_private/agent/knowledge.db')).toBe(true);
            expect(adapter.binaries.has('_private/agent/memory.db')).toBe(true);
        });

        it('leaves originals in place (defensive copy)', async () => {
            await service.migrate('.obsidian-agent', '_private/agent');

            expect(adapter.files.has('.obsidian-agent/plugin-skills/dataview.skill.md')).toBe(true);
            expect(adapter.files.has('.obsidian-agent/vault-dna.json')).toBe(true);
            expect(adapter.binaries.has('.obsidian-agent/knowledge.db')).toBe(true);
            expect(adapter.binaries.has('.obsidian-agent/memory.db')).toBe(true);
        });

        it('does not overwrite files that already exist at the destination', async () => {
            adapter.dirs.add('_private/agent');
            adapter.files.set('_private/agent/vault-dna.json', 'PRE-EXISTING');
            adapter.files.set('_private/agent/plugin-skills/dataview.skill.md', 'ALREADY THERE');

            const result = await service.migrate('.obsidian-agent', '_private/agent');

            // dataview skill already existed -> skipped; only tasks moved
            expect(result.movedPluginSkills).toBe(1);
            expect(result.movedVaultDna).toBe(false);
            expect(adapter.files.get('_private/agent/vault-dna.json')).toBe('PRE-EXISTING');
            expect(adapter.files.get('_private/agent/plugin-skills/dataview.skill.md')).toBe('ALREADY THERE');
        });

        it('no-ops when old and new paths are the same', async () => {
            const result = await service.migrate('.obsidian-agent', '.obsidian-agent');
            expect(result.movedPluginSkills).toBe(0);
            expect(result.movedVaultDna).toBe(false);
        });

        it('refuses cross-vault absolute paths', async () => {
            const result = await service.migrate('/Users/me/external', '.obsidian-agent');
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toMatch(/Cross-vault migration is not supported/i);
        });
    });
});
