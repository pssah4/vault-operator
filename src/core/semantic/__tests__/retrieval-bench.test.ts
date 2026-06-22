/**
 * Retrieval bench (light version) -- deterministic regression harness for
 * the lexical retrieval paths. Every later retrieval change on this branch
 * must keep this file green.
 *
 * Scope:
 *  - keywordSearch() (TF-IDF + stemming + title boost)
 *  - tagMatchSearch() (query token vs tags table overlap)
 *  - the RRF fusion path: rrf() with the exact signal composition used by
 *    SemanticSearchTool (semantic / keyword / tag). The semantic signal is a
 *    hand-crafted deterministic path list, NOT an embedder: embedding search
 *    is out of scope for this bench by design (no network, no fake embedder).
 *
 * Query families:
 *  A - entity lookup: names must hit title notes above body-only mentions
 *  B - concept lookup: concept terms hit the defining note, opener excerpt
 *  C - acronyms and umlauts: covered by the tokenizer fix (umlaut folding
 *      plus acronym allowlist). These cases started as it.fails documenting
 *      the bug and were flipped to plain it() together with that fix.
 *  D - fusion sanity: hybrid hits outrank tag-only hits. Cases that
 *      depended on the weighted-RRF change started as it.fails with the
 *      comment "flips with weighted fusion" and were flipped to plain
 *      it() together with that change (item 4: fuseHybridArms).
 *
 * Contract: vitest treats an unexpectedly PASSING it.fails as a failure,
 * so fixing the underlying bug forces the corresponding case to be flipped
 * to a regular assertion in the same change.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import initSqlJs from 'sql.js';
import type { Vault } from 'obsidian';
import { SemanticIndexService } from '../SemanticIndexService';
import type { SemanticResult } from '../SemanticIndexService';
import type { KnowledgeDB } from '../../knowledge/KnowledgeDB';
import { VectorStore } from '../../knowledge/VectorStore';
import type { RrfResult } from '../../memory/rrf';
import { fuseHybridArms } from '../weightedFusion';

// ---------------------------------------------------------------------------
// In-memory KnowledgeDB shim (same pattern as VectorStore.test.ts)
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
CREATE TABLE IF NOT EXISTS tags (
    path TEXT NOT NULL,
    tag TEXT NOT NULL,
    UNIQUE(path, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
`;

// ---------------------------------------------------------------------------
// Synthetic corpus: 12 notes, German and English, umlauts, acronyms.
// Chunk 0 gets the note title prepended, mirroring buildIndex() so the
// title boost in keywordSearch behaves exactly like production.
// ---------------------------------------------------------------------------

interface BenchNote {
    path: string;
    chunks: string[];
    tags: string[];
}

const CORPUS: BenchNote[] = [
    {
        path: 'People/Mark Zimmermann.md',
        chunks: ['Mark Zimmermann leads the platform team in Cologne. Mark works on infrastructure topics.'],
        tags: ['person'],
    },
    {
        path: 'Meetings/2026-01-15 Planning.md',
        chunks: ['Planning session notes. Discussed the roadmap with Mark Zimmermann and agreed on milestones.'],
        tags: ['meeting'],
    },
    {
        path: 'Projects/Vault Operator.md',
        chunks: ['Vault Operator is an Obsidian plugin for agent driven vault management.'],
        tags: ['projekt'],
    },
    {
        path: 'Journal/2026-02-01.md',
        chunks: ['Worked on the Vault Operator release today. Thought briefly about my Zettelkasten workflow.'],
        tags: [],
    },
    {
        path: 'Concepts/Zettelkasten.md',
        chunks: [
            'Zettelkasten is a note-taking method built on atomic notes and dense linking. A Zettelkasten grows by connecting ideas.',
            'Further reading and history of the method.',
        ],
        tags: ['concept'],
    },
    {
        path: 'Concepts/Wissensmanagement.md',
        chunks: ['Wissensmanagement beschreibt den systematischen Umgang mit Wissen in Organisationen.'],
        tags: ['concept'],
    },
    {
        path: 'Notes/Über das Projekt.md',
        chunks: ['Diese Notiz handelt über die Ziele des Projekts. Hintergrund über die Entstehung.'],
        tags: [],
    },
    {
        path: 'Tech/KI Strategie.md',
        chunks: ['KI Modelle veraendern unsere Strategie. Die KI Roadmap steht im Fokus.'],
        tags: ['ki', 'strategie'],
    },
    {
        path: 'Tech/AI Research.md',
        chunks: ['AI systems improve quickly. The AI research lab published new results.'],
        tags: ['research'],
    },
    {
        path: 'Tech/OS Kernel.md',
        chunks: ['The OS scheduler handles processes. Kernel design notes for the OS.'],
        tags: [],
    },
    {
        path: 'Tech/Plugin Development.md',
        chunks: ['Plugin development guide. Building a plugin requires careful plugin lifecycle handling.'],
        tags: ['dev'],
    },
    {
        path: 'Archive/Erweiterungsideen.md',
        chunks: ['Alte Ideensammlung aus dem Archiv fuer kuenftige Erweiterungen.'],
        tags: ['plugin', 'ideen'],
    },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let service: SemanticIndexService;

beforeAll(async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    for (const stmt of SCHEMA_DDL.split(';').map((s) => s.trim()).filter(Boolean)) {
        db.run(stmt + ';');
    }

    const shim = {
        getDB: () => db,
        isOpen: () => true,
        markDirty: () => {},
    } as unknown as KnowledgeDB;

    const vectorStore = new VectorStore(shim);

    // Insert corpus. Vectors are placeholder BLOBs: this bench never runs
    // embedding search, only the lexical paths read the text column.
    const placeholder = new Float32Array([0, 0, 0, 0]);
    for (const note of CORPUS) {
        const title = note.path.split('/').pop()?.replace(/\.\w+$/, '') ?? '';
        const enrichedChunks = title
            ? [title + '\n\n' + note.chunks[0], ...note.chunks.slice(1)]
            : note.chunks;
        vectorStore.insertChunks(
            note.path,
            enrichedChunks,
            enrichedChunks.map(() => placeholder),
            1000,
        );
        for (const tag of note.tags) {
            db.run('INSERT OR IGNORE INTO tags (path, tag) VALUES (?, ?)', [note.path, tag]);
        }
    }

    service = new SemanticIndexService({} as Vault, shim, vectorStore);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 0-based rank of a path in a result list, -1 when absent. */
function rankOf(results: Array<{ path: string }>, path: string): number {
    return results.findIndex((r) => r.path === path);
}

/** 0-based rank of a path in a fused RRF list, -1 when absent. */
function fusedRankOf(fused: RrfResult[], path: string): number {
    return fused.findIndex((f) => f.id === path);
}

/**
 * Fuse the three signals exactly like SemanticSearchTool does
 * (src/core/tools/vault/SemanticSearchTool.ts, fuseHybridArms call).
 * Weighted fusion is the production default (weightedFusionEnabled: true),
 * so the bench runs the weighted path. The semantic signal is a
 * deterministic hand-crafted path list standing in for the embedding
 * ranking; it carries no cosine values, so the cosine sanity blend stays
 * inert here (ordering is then a monotone transform of weighted RRF).
 */
async function fuse(query: string, semanticStylePaths: string[]): Promise<RrfResult[]> {
    const [keywordResults, tagResults] = await Promise.all([
        service.keywordSearch(query, 10),
        service.tagMatchSearch(query, 10),
    ]);
    return fuseHybridArms(
        {
            semantic: semanticStylePaths,
            keyword: keywordResults.map((r) => r.path),
            tag: tagResults.map((r) => r.path),
        },
        { weighted: true },
    );
}

// ---------------------------------------------------------------------------
// Family A - entity lookup
// ---------------------------------------------------------------------------

describe('retrieval bench / family A: entity lookup', () => {
    it('A1: "Mark Zimmermann" ranks the title note above the body-only mention', async () => {
        const results: SemanticResult[] = await service.keywordSearch('Mark Zimmermann', 10);
        expect(results[0]?.path).toBe('People/Mark Zimmermann.md');
        const mentionRank = rankOf(results, 'Meetings/2026-01-15 Planning.md');
        expect(mentionRank).toBeGreaterThan(0);
    });

    it('A2: "Vault Operator" ranks the project note above the journal mention', async () => {
        const results = await service.keywordSearch('Vault Operator', 10);
        expect(results[0]?.path).toBe('Projects/Vault Operator.md');
        const mentionRank = rankOf(results, 'Journal/2026-02-01.md');
        expect(mentionRank).toBeGreaterThan(0);
    });

    it('A3: single surname "Zimmermann" still ranks the person note first', async () => {
        const results = await service.keywordSearch('Zimmermann', 10);
        expect(results[0]?.path).toBe('People/Mark Zimmermann.md');
    });

    it('A4: lowercase query "mark zimmermann" matches case-insensitively', async () => {
        const results = await service.keywordSearch('mark zimmermann', 10);
        expect(results[0]?.path).toBe('People/Mark Zimmermann.md');
    });

    it('A5: entity query does not surface unrelated notes', async () => {
        const results = await service.keywordSearch('Mark Zimmermann', 10);
        expect(rankOf(results, 'Tech/OS Kernel.md')).toBe(-1);
        expect(rankOf(results, 'Tech/KI Strategie.md')).toBe(-1);
    });
});

// ---------------------------------------------------------------------------
// Family B - concept lookup
// ---------------------------------------------------------------------------

describe('retrieval bench / family B: concept lookup', () => {
    it('B1: "Zettelkasten" hits the defining note first with the opener chunk', async () => {
        const results = await service.keywordSearch('Zettelkasten', 10);
        expect(results[0]?.path).toBe('Concepts/Zettelkasten.md');
        // Opener relevance: the definition lives in chunk 0 and must be the excerpt.
        expect(results[0]?.chunkIndex).toBe(0);
        expect(results[0]?.excerpt).toContain('note-taking method');
        // The passing mention ranks below the defining note.
        const mentionRank = rankOf(results, 'Journal/2026-02-01.md');
        expect(mentionRank).toBeGreaterThan(0);
    });

    it('B2: "Wissensmanagement" hits the German defining note first', async () => {
        const results = await service.keywordSearch('Wissensmanagement', 10);
        expect(results[0]?.path).toBe('Concepts/Wissensmanagement.md');
    });

    it('B3: multi-term concept query "note-taking method" hits the defining note', async () => {
        const results = await service.keywordSearch('note-taking method', 10);
        expect(results[0]?.path).toBe('Concepts/Zettelkasten.md');
        expect(results[0]?.excerpt).toContain('note-taking method');
    });

    // KNOWN BROKEN: the single-pass stemmer strips only one suffix. The query
    // "Zettelkastens" stems to "zettelkasten" while the indexed token
    // "Zettelkasten" stems further to "zettelkast", so they never meet.
    // Flips when the tokenizer item later in this branch fixes stemming.
    it.fails('B4: plural query "Zettelkastens" finds the defining note', async () => {
        const results = await service.keywordSearch('Zettelkastens', 10);
        expect(results[0]?.path).toBe('Concepts/Zettelkasten.md');
    });
});

// ---------------------------------------------------------------------------
// Family C - acronyms and umlauts
// ---------------------------------------------------------------------------

describe('retrieval bench / family C: acronyms and umlauts', () => {
    // Short acronyms survive tokenization via ACRONYM_ALLOWLIST.
    it('C1: acronym query "KI" finds the KI note via keyword search', async () => {
        const results = await service.keywordSearch('KI', 10);
        expect(results[0]?.path).toBe('Tech/KI Strategie.md');
    });

    it('C2: acronym query "AI" finds the AI note via keyword search', async () => {
        const results = await service.keywordSearch('AI', 10);
        expect(results[0]?.path).toBe('Tech/AI Research.md');
    });

    it('C3: acronym query "OS" finds the OS note via keyword search', async () => {
        const results = await service.keywordSearch('OS', 10);
        expect(results[0]?.path).toBe('Tech/OS Kernel.md');
    });

    // The allowlist also applies to tag matching, so the #ki tag is
    // reachable by its own acronym.
    it('C4: acronym query "KI" finds the KI note via tag match', async () => {
        const results = await service.tagMatchSearch('KI', 10);
        expect(results[0]?.path).toBe('Tech/KI Strategie.md');
    });

    it('C5: umlaut query "über" finds the note containing the umlaut form', async () => {
        const results = await service.keywordSearch('über', 10);
        expect(results[0]?.path).toBe('Notes/Über das Projekt.md');
    });

    it('C6: capitalized umlaut query "Über" finds the same note', async () => {
        const results = await service.keywordSearch('Über', 10);
        expect(results[0]?.path).toBe('Notes/Über das Projekt.md');
    });

    // Umlaut folding: both "ueber" and "über" fold to "uber", so the
    // transliterated spelling matches the indexed umlaut form.
    it('C7: transliterated query "ueber" finds the same note', async () => {
        const results = await service.keywordSearch('ueber', 10);
        expect(results[0]?.path).toBe('Notes/Über das Projekt.md');
    });

    it('C8: mixed query "KI Strategie" survives via the long token', async () => {
        const results = await service.keywordSearch('KI Strategie', 10);
        expect(results[0]?.path).toBe('Tech/KI Strategie.md');
    });
});

// ---------------------------------------------------------------------------
// Family D - fusion sanity (RRF path)
// ---------------------------------------------------------------------------

describe('retrieval bench / family D: fusion sanity', () => {
    it('D1: a note hit by semantic and keyword outranks a tag-only hit', async () => {
        // Semantic-style signal agrees with keyword on the project note.
        // The archive note is reachable only via its #plugin tag.
        const fused = await fuse('Vault Operator plugin', [
            'Projects/Vault Operator.md',
            'Journal/2026-02-01.md',
        ]);
        expect(fused[0]?.id).toBe('Projects/Vault Operator.md');
        const hybridRank = fusedRankOf(fused, 'Projects/Vault Operator.md');
        const tagOnlyRank = fusedRankOf(fused, 'Archive/Erweiterungsideen.md');
        expect(tagOnlyRank).toBeGreaterThan(hybridRank);
    });

    // Flipped with weighted fusion (item 4): with equal RRF weights a
    // tag-only hit at tag rank 1 (1/61) beat a real body keyword match at
    // keyword rank 2 (1/62). The 0.6 tag arm weight (0.6/61 < 1/62)
    // reverses that.
    it('D2: a keyword body match at rank 2 outranks a tag-only hit', async () => {
        // Semantic signal deliberately misses the project note, so its only
        // signal is keyword rank 2 (behind Tech/Plugin Development.md).
        const fused = await fuse('plugin', ['Tech/Plugin Development.md']);
        const keywordRank = fusedRankOf(fused, 'Projects/Vault Operator.md');
        const tagOnlyRank = fusedRankOf(fused, 'Archive/Erweiterungsideen.md');
        expect(keywordRank).toBeGreaterThan(-1);
        expect(tagOnlyRank).toBeGreaterThan(-1);
        expect(keywordRank).toBeLessThan(tagOnlyRank);
    });

    it('D3: the tag signal contributes to the fused top result', async () => {
        // The KI note is hit by keyword (title + body) AND by its #strategie tag.
        const fused = await fuse('Strategie', []);
        expect(fused[0]?.id).toBe('Tech/KI Strategie.md');
        expect(fused[0]?.contributions['keyword']).toBeGreaterThan(0);
        expect(fused[0]?.contributions['tag']).toBeGreaterThan(0);
    });

    it('D4: tag-only notes still appear in the fused list (tag recall)', async () => {
        const fused = await fuse('Vault Operator plugin', [
            'Projects/Vault Operator.md',
            'Journal/2026-02-01.md',
        ]);
        expect(fusedRankOf(fused, 'Archive/Erweiterungsideen.md')).toBeGreaterThan(-1);
    });
});
