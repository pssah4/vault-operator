import { describe, it, expect } from 'vitest';
import { LocalFileAdapter, WebUrlAdapter, CloudAdapterStub } from '../StandardAdapters';
import { McpKnowledgeAdapter } from '../McpKnowledgeAdapter';

describe('LocalFileAdapter (PLAN-006 task 11)', () => {
    const fs = {
        async read(path: string) {
            if (path === '/missing') return null;
            return `content of ${path}`;
        },
    };
    const adapter = new LocalFileAdapter(fs);

    it('canHandle file:// URIs', () => {
        expect(adapter.canHandle('file:///abs/path')).toBe(true);
        expect(adapter.canHandle('vault://x')).toBe(false);
    });

    it('resolves to content + title', async () => {
        const r = await adapter.resolve('file:///abs/notes/x.txt');
        expect(r?.content).toBe('content of /abs/notes/x.txt');
        expect(r?.title).toBe('x.txt');
        expect(r?.scheme).toBe('file');
    });

    it('returns null when fs returns null', async () => {
        expect(await adapter.resolve('file:///missing')).toBeNull();
    });

    it('returns null for empty path', async () => {
        expect(await adapter.resolve('file://')).toBeNull();
    });
});

describe('WebUrlAdapter (PLAN-006 task 11)', () => {
    const fetcher = {
        async fetchText(url: string) {
            if (url === 'https://broken') return null;
            if (url === 'https://gone') return { body: 'not found', status: 404 };
            return { body: `body of ${url}`, status: 200 };
        },
    };

    it('handles only its scheme', () => {
        const https = new WebUrlAdapter(fetcher, 'https');
        expect(https.canHandle('https://x.com')).toBe(true);
        expect(https.canHandle('http://x.com')).toBe(false);
        const http = new WebUrlAdapter(fetcher, 'http');
        expect(http.canHandle('http://x.com')).toBe(true);
    });

    it('returns content on 2xx', async () => {
        const adapter = new WebUrlAdapter(fetcher, 'https');
        const r = await adapter.resolve('https://x.com/page');
        expect(r?.content).toBe('body of https://x.com/page');
        expect(r?.metadata?.status).toBe(200);
    });

    it('returns null on >=400 status', async () => {
        const adapter = new WebUrlAdapter(fetcher, 'https');
        expect(await adapter.resolve('https://gone')).toBeNull();
    });

    it('returns null on transport error', async () => {
        const adapter = new WebUrlAdapter(fetcher, 'https');
        expect(await adapter.resolve('https://broken')).toBeNull();
    });
});

describe('CloudAdapterStub', () => {
    it('always resolves to null in Phase 3', async () => {
        const stub = new CloudAdapterStub();
        expect(stub.canHandle('cloud://service/abc')).toBe(true);
        expect(await stub.resolve('cloud://service/abc')).toBeNull();
    });
});

describe('McpKnowledgeAdapter (PLAN-006 task 11)', () => {
    function makeAdapter(responses: Record<string, unknown>) {
        return new McpKnowledgeAdapter(async (name) => responses[name]);
    }

    it('parses implicit-edges JSON payload', async () => {
        const adapter = makeAdapter({
            get_vault_implicit_edges: JSON.stringify({
                path: 'A.md', hops: 1,
                neighbours: [{ path: 'B.md', similarity: 0.9 }],
            }),
        });
        const r = await adapter.getImplicitNeighbors('A.md');
        expect(r).toEqual([{ path: 'B.md', similarity: 0.9 }]);
    });

    it('returns empty list on missing payload', async () => {
        const adapter = makeAdapter({ get_vault_implicit_edges: null });
        expect(await adapter.getImplicitNeighbors('A.md')).toEqual([]);
    });

    it('parses note-metadata JSON payload', async () => {
        const adapter = makeAdapter({
            get_vault_note_metadata: JSON.stringify({
                path: 'A.md', tags: ['x', 'y'], lastIndexedAt: '2026-04-28T00:00Z',
            }),
        });
        const r = await adapter.getNoteMetadata('A.md');
        expect(r?.tags).toEqual(['x', 'y']);
        expect(r?.lastIndexedAt).toBe('2026-04-28T00:00Z');
    });

    it('returns null when payload missing flag is set', async () => {
        const adapter = makeAdapter({
            get_vault_note_metadata: JSON.stringify({ path: 'X.md', missing: true }),
        });
        expect(await adapter.getNoteMetadata('X.md')).toBeNull();
    });

    it('searchSimilar returns empty array (Phase-3 limitation)', async () => {
        const adapter = makeAdapter({});
        expect(await adapter.searchSimilar(Float32Array.from([1, 0]))).toEqual([]);
    });

    it('logs and returns null on transport error', async () => {
        const adapter = new McpKnowledgeAdapter(async () => {
            throw new Error('network down');
        });
        expect(await adapter.getImplicitNeighbors('A.md')).toEqual([]);
    });
});
