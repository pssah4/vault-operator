/**
 * ISSUE-E: stub notes in the semantic arm.
 *
 * Near-empty notes (frontmatter skeleton plus at most a title heading)
 * produced non-empty chunks because splitIntoChunks keeps frontmatter
 * key:value lines and buildIndex/updateFile prepend the filename to
 * chunk 0. Their embeddings sit close to the embedding-space centroid
 * and weakly match every query, so stubs entered the semantic arm at
 * rank 1 (observed weighted-RRF contribution 0.0164 = 1/(60+1)).
 *
 * Covered here:
 *  - splitIntoChunks body gate: bodies under MIN_INDEXABLE_BODY_CHARS
 *    (frontmatter excluded) yield no chunks; the boundary is exact and
 *    the frontmatter-prepend behaviour of chunk 0 is retained above it
 *  - updateFile deletes stored vectors when the new content gates to []
 *  - buildIndex (incremental) deletes stored vectors when a changed
 *    file gates to [] (else-branch of the insert)
 *  - buildIndex runs the one-time bodyGateVersion cleanup sweep exactly
 *    once, skipping session:/episode: entries
 *  - VectorStore.getStubCandidatePaths returns single-chunk short-text
 *    paths only
 */

import { describe, it, expect, vi } from 'vitest';
import initSqlJs from 'sql.js';
import type { Vault } from 'obsidian';
import { SemanticIndexService } from '../SemanticIndexService';
import type { KnowledgeDB } from '../../knowledge/KnowledgeDB';
import { VectorStore } from '../../knowledge/VectorStore';
import type { CustomModel } from '../../../types/settings';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Inbox/COWORK.md shape: uid frontmatter plus a bare title heading. */
const COWORK_STUB = '---\nuid: 20260101120000\n---\n# COWORK\n';

/** Inbox/Untitled.md shape: frontmatter skeleton with keys, zero body. */
const SKELETON_STUB = '---\nuid: 20260101120000\ncreated: 2026-01-01\nmodified: 2026-01-02\ntags:\n---\n';

/** A body comfortably above the gate (63 chars, mirrors the smallest bench fixture). */
const LEGIT_BODY = 'Alte Ideensammlung aus dem Archiv fuer kuenftige Erweiterungen.';

// ---------------------------------------------------------------------------
// Private access helpers (same pattern as SemanticIndexService.chunkIndex.test.ts)
// ---------------------------------------------------------------------------

type PrivateAccess = {
    splitIntoChunks: (text: string, maxChars: number) => string[];
    embedBatch: (texts: string[]) => Promise<Float32Array[]>;
};

function makeBareService(): SemanticIndexService {
    return new SemanticIndexService({} as Vault, {} as KnowledgeDB, {} as VectorStore);
}

function split(service: SemanticIndexService, text: string): string[] {
    return (service as unknown as PrivateAccess).splitIntoChunks(text, 2000);
}

function stubEmbed(service: SemanticIndexService, fail = false): void {
    (service as unknown as PrivateAccess).embedBatch = async (texts: string[]) => {
        if (fail) throw new Error('embedBatch must not be called for gated stubs');
        return texts.map(() => new Float32Array([1, 0, 0]));
    };
}

// ---------------------------------------------------------------------------
// splitIntoChunks body gate
// ---------------------------------------------------------------------------

describe('splitIntoChunks body gate (MIN_INDEXABLE_BODY_CHARS)', () => {
    const service = makeBareService();

    it('returns [] for a frontmatter-skeleton-only note', () => {
        expect(split(service, SKELETON_STUB)).toEqual([]);
    });

    it('returns [] for a uid-frontmatter note with only a title heading', () => {
        expect(split(service, COWORK_STUB)).toEqual([]);
    });

    it('returns [] for a 39-char body even with bulky frontmatter', () => {
        const body = 'x'.repeat(39);
        const text = `---\nuid: 20260101\ncreated: 2026-01-01\nmodified: 2026-01-02\n---\n${body}`;
        expect(split(service, text)).toEqual([]);
    });

    it('returns one chunk for a 40-char body (boundary)', () => {
        const body = 'x'.repeat(40);
        expect(split(service, body)).toEqual([body]);
    });

    it('keeps the frontmatter-prepend behaviour for bodies above the gate', () => {
        const text = `---\nuid: 123\ntags: idee\n---\n${LEGIT_BODY}`;
        const chunks = split(service, text);
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toBe(`uid: 123\ntags: idee\n\n${LEGIT_BODY}`);
    });
});

// ---------------------------------------------------------------------------
// updateFile: gated content deletes stored vectors
// ---------------------------------------------------------------------------

describe('updateFile with stub content', () => {
    it('calls deleteByPath and never embeds or inserts', async () => {
        const file = { path: 'Inbox/COWORK.md', extension: 'md', stat: { mtime: 200 } };
        const vault = {
            getFileByPath: (p: string) => (p === file.path ? file : null),
            cachedRead: async () => COWORK_STUB,
        } as unknown as Vault;
        const deleteByPath = vi.fn();
        const insertChunks = vi.fn();
        const vectorStore = { deleteByPath, insertChunks } as unknown as VectorStore;
        const knowledgeDB = { isOpen: () => true, markDirty: vi.fn() } as unknown as KnowledgeDB;

        const service = new SemanticIndexService(vault, knowledgeDB, vectorStore);
        stubEmbed(service, true);

        await service.updateFile('Inbox/COWORK.md');

        expect(deleteByPath).toHaveBeenCalledWith('Inbox/COWORK.md');
        expect(insertChunks).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// buildIndex: incremental run
// ---------------------------------------------------------------------------

interface BuildMocks {
    service: SemanticIndexService;
    checkpoint: Map<string, string>;
    deleteByPath: ReturnType<typeof vi.fn>;
    insertChunks: ReturnType<typeof vi.fn>;
    getStubCandidatePaths: ReturnType<typeof vi.fn>;
}

function makeBuildSetup(opts: {
    files: Array<{ path: string; extension: string; stat: { mtime: number } }>;
    contents: Record<string, string>;
    storedMtimes: Map<string, number>;
    checkpoint: Map<string, string>;
    stubCandidates?: string[];
}): BuildMocks {
    const { files, contents, storedMtimes, checkpoint, stubCandidates = [] } = opts;

    const vault = {
        getMarkdownFiles: () => files,
        getFiles: () => files,
        getFileByPath: (p: string) => files.find((f) => f.path === p) ?? null,
        cachedRead: async (f: { path: string }) => contents[f.path] ?? '',
    } as unknown as Vault;

    const deleteByPath = vi.fn();
    const insertChunks = vi.fn();
    const getStubCandidatePaths = vi.fn(() => stubCandidates);
    const vectorStore = {
        getPathMtimes: () => new Map(storedMtimes),
        getFileCount: () => storedMtimes.size,
        deleteAll: vi.fn(),
        deleteByPath,
        insertChunks,
        getStubCandidatePaths,
    } as unknown as VectorStore;

    const knowledgeDB = {
        isOpen: () => true,
        markDirty: vi.fn(),
        save: vi.fn(async () => { /* noop */ }),
        getCheckpointValue: (k: string) => checkpoint.get(k) ?? null,
        setCheckpointValue: (k: string, v: string) => { checkpoint.set(k, v); },
    } as unknown as KnowledgeDB;

    const service = new SemanticIndexService(vault, knowledgeDB, vectorStore);
    service.setEmbeddingModel({ name: 'test-embed', provider: 'openai' } as CustomModel);
    stubEmbed(service);
    return { service, checkpoint, deleteByPath, insertChunks, getStubCandidatePaths };
}

describe('buildIndex incremental with gated files', () => {
    it('deletes stored vectors for a changed file that gates to [] (else-branch)', async () => {
        const { service, deleteByPath, insertChunks } = makeBuildSetup({
            files: [{ path: 'Inbox/COWORK.md', extension: 'md', stat: { mtime: 200 } }],
            contents: { 'Inbox/COWORK.md': COWORK_STUB },
            storedMtimes: new Map([['Inbox/COWORK.md', 100]]),
            checkpoint: new Map([
                ['embeddingModel', 'openai:test-embed'],
                ['chunkSize', '2000'],
                ['bodyGateVersion', '1'],
            ]),
        });

        const result = await service.buildIndex();

        expect(result.errors).toBe(0);
        expect(deleteByPath).toHaveBeenCalledWith('Inbox/COWORK.md');
        expect(insertChunks).not.toHaveBeenCalled();
    });

    it('runs the one-time stub sweep, skips session:/episode:, sets bodyGateVersion', async () => {
        const { service, checkpoint, deleteByPath, getStubCandidatePaths } = makeBuildSetup({
            // Unchanged mtime: the stub is NOT in toIndex, only the sweep can reach it.
            files: [{ path: 'Inbox/Untitled.md', extension: 'md', stat: { mtime: 100 } }],
            contents: { 'Inbox/Untitled.md': SKELETON_STUB },
            storedMtimes: new Map([
                ['Inbox/Untitled.md', 100],
                ['session:abc', 50],
            ]),
            checkpoint: new Map([
                ['embeddingModel', 'openai:test-embed'],
                ['chunkSize', '2000'],
            ]),
            stubCandidates: ['Inbox/Untitled.md', 'session:abc', 'episode:xyz'],
        });

        await service.buildIndex();

        expect(getStubCandidatePaths).toHaveBeenCalledTimes(1);
        expect(deleteByPath).toHaveBeenCalledWith('Inbox/Untitled.md');
        expect(deleteByPath).not.toHaveBeenCalledWith('session:abc');
        expect(deleteByPath).not.toHaveBeenCalledWith('episode:xyz');
        expect(checkpoint.get('bodyGateVersion')).toBe('1');

        // Second run: flag is set, sweep must not run again.
        await service.buildIndex();
        expect(getStubCandidatePaths).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// VectorStore.getStubCandidatePaths
// ---------------------------------------------------------------------------

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS vectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    vector BLOB NOT NULL,
    mtime INTEGER NOT NULL,
    enriched INTEGER NOT NULL DEFAULT 0,
    domain TEXT NOT NULL DEFAULT 'note',
    UNIQUE(path, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_vectors_path ON vectors(path);
CREATE INDEX IF NOT EXISTS idx_vectors_domain_path ON vectors(domain, path);
`;

describe('VectorStore.getStubCandidatePaths', () => {
    it('returns only single-chunk paths whose text is under maxLen', async () => {
        const SQL = await initSqlJs();
        const db = new SQL.Database();
        for (const stmt of SCHEMA_DDL.split(';').map((s) => s.trim()).filter(Boolean)) {
            db.run(stmt + ';');
        }
        const shim = {
            getDB: () => db,
            isOpen: () => true,
            markDirty: () => { /* noop */ },
        } as unknown as KnowledgeDB;
        const store = new VectorStore(shim);
        const vec = new Float32Array([0, 0, 0, 0]);

        // Single short chunk: candidate.
        store.insertChunks('Inbox/COWORK.md', ['COWORK\n\nuid: 20260101'], [vec], 100);
        // Single long chunk: not a candidate.
        store.insertChunks('Notes/Long.md', ['y'.repeat(400)], [vec], 100);
        // Two short chunks: not a candidate (COUNT > 1).
        store.insertChunks('Notes/Multi.md', ['short a', 'short b'], [vec, vec], 100);

        const candidates = store.getStubCandidatePaths(300);
        expect(candidates).toEqual(['Inbox/COWORK.md']);
    });
});
