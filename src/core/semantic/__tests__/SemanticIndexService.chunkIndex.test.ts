/**
 * Retrieval wave 1, item 1: SemanticResult carries an optional chunkIndex
 * so excerpt consumers can prefer the opener chunk (chunk_index 0).
 *
 * Covered here:
 *  - search() propagates chunkIndex from VectorSearchResult (both the
 *    searchWithContext and the searchUniqueFiles branches)
 *  - keywordSearch() carries the chunkIndex of the best-scoring chunk per path
 *  - tagMatchSearch() reports chunkIndex 0 (it renders the first chunk)
 */

import { describe, it, expect } from 'vitest';
import type { Vault } from 'obsidian';
import { SemanticIndexService } from '../SemanticIndexService';
import type { KnowledgeDB } from '../../knowledge/KnowledgeDB';
import type { VectorStore, VectorSearchResult } from '../../knowledge/VectorStore';

function makeService(opts: {
    allChunks?: Array<{ path: string; chunkIndex: number; text: string }>;
    contextResults?: VectorSearchResult[];
    uniqueResults?: VectorSearchResult[];
    tagRows?: Array<[string, string]>;
    chunkTextsByPath?: Record<string, string[]>;
}): SemanticIndexService {
    const {
        allChunks = [],
        contextResults = [],
        uniqueResults = [],
        tagRows = [],
        chunkTextsByPath = {},
    } = opts;

    const knowledgeDB = {
        isOpen: () => true,
        getDB: () => ({
            exec: (sql: string) => {
                if (sql.includes('FROM tags')) {
                    return tagRows.length > 0
                        ? [{ columns: ['path', 'tag'], values: tagRows }]
                        : [];
                }
                return [];
            },
        }),
    } as unknown as KnowledgeDB;

    const vectorStore = {
        getAllChunks: () => allChunks,
        searchWithContext: () => contextResults,
        searchUniqueFiles: () => uniqueResults,
        getChunkTextsByPath: (p: string) => chunkTextsByPath[p] ?? [],
    } as unknown as VectorStore;

    const service = new SemanticIndexService({} as Vault, knowledgeDB, vectorStore);
    // Stub the private embedding call so search() never hits the network.
    (service as unknown as { embedBatch: (texts: string[]) => Promise<Float32Array[]> }).embedBatch =
        async (texts: string[]) => texts.map(() => new Float32Array([1, 0, 0]));
    return service;
}

describe('SemanticIndexService chunkIndex propagation', () => {
    it('search() propagates chunkIndex in the searchWithContext branch', async () => {
        const service = makeService({
            contextResults: [
                { path: 'Notes/A.md', text: 'middle chunk text', score: 0.9, chunkIndex: 5 },
            ],
        });
        const results = await service.search('query', 5, undefined, { adjacentChunks: 1, maxPerFile: 2 });
        expect(results).toHaveLength(1);
        expect(results[0].chunkIndex).toBe(5);
    });

    it('search() propagates chunkIndex in the searchUniqueFiles branch', async () => {
        const service = makeService({
            uniqueResults: [
                { path: 'Notes/B.md', text: 'opener text', score: 0.8, chunkIndex: 0 },
            ],
        });
        const results = await service.search('query', 5);
        expect(results).toHaveLength(1);
        expect(results[0].chunkIndex).toBe(0);
    });

    it('keywordSearch() carries the chunkIndex of the best-scoring chunk per path', async () => {
        const service = makeService({
            allChunks: [
                // Chunk 0 mentions the term once, chunk 3 mentions it three times,
                // so chunk 3 must win and its chunkIndex must be reported.
                { path: 'Notes/C.md', chunkIndex: 0, text: 'zebra appears here once' },
                { path: 'Notes/C.md', chunkIndex: 3, text: 'zebra zebra zebra heavy match' },
                // Decoy without the term so the IDF of "zebra" stays positive.
                { path: 'Notes/Other.md', chunkIndex: 0, text: 'completely unrelated topic' },
            ],
        });
        const results = await service.keywordSearch('zebra', 5);
        expect(results).toHaveLength(1);
        expect(results[0].path).toBe('Notes/C.md');
        expect(results[0].excerpt).toContain('heavy match');
        expect(results[0].chunkIndex).toBe(3);
    });

    it('tagMatchSearch() reports chunkIndex 0', async () => {
        const service = makeService({
            tagRows: [['Notes/D.md', 'zebra']],
            chunkTextsByPath: { 'Notes/D.md': ['first chunk of D', 'second chunk of D'] },
        });
        const results = await service.tagMatchSearch('zebra', 5);
        expect(results).toHaveLength(1);
        expect(results[0].path).toBe('Notes/D.md');
        expect(results[0].excerpt).toBe('first chunk of D');
        expect(results[0].chunkIndex).toBe(0);
    });
});
