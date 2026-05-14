/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * EpisodicExtractor — Records and queries task episodes.
 *
 * After each successful multi-tool task, a TaskEpisode is persisted
 * and indexed in the semantic index for future retrieval.
 *
 * FEATURE-1505: Migrated from JSON files to MemoryDB (SQLite).
 * On first start after migration, existing JSON files are imported into the DB.
 *
 * ADR-018: Episodic Task Memory
 */

import type { FileAdapter } from '../storage/types';
import type { MemoryDB } from '../knowledge/MemoryDB';
import type { SemanticIndexService } from '../semantic/SemanticIndexService';

export interface TaskEpisode {
    id: string;
    timestamp: string;
    userMessage: string;
    mode: string;
    toolSequence: string[];
    toolLedger: string;
    success: boolean;
    resultSummary: string;
}

/** Maximum episodes before FIFO eviction starts. */
const MAX_EPISODES = 500;

export class EpisodicExtractor {
    private fs: FileAdapter;
    private memoryDB: MemoryDB | null;
    private episodesDir: string;
    private getSemanticIndex: () => SemanticIndexService | null;
    private episodeCount = 0;

    constructor(
        fs: FileAdapter,
        getSemanticIndex: () => SemanticIndexService | null,
        memoryDB?: MemoryDB | null,
    ) {
        this.fs = fs;
        this.memoryDB = memoryDB ?? null;
        this.episodesDir = 'episodes';
        this.getSemanticIndex = getSemanticIndex;
    }

    /** Initialize: count existing episodes, migrate from files if needed. */
    async initialize(): Promise<void> {
        try {
            if (this.memoryDB?.isOpen()) {
                this.episodeCount = this.countFromDB();
                // One-time migration from JSON files
                if (this.episodeCount === 0) {
                    await this.migrateFromFiles();
                }
            } else {
                await this.countFromFiles();
            }
        } catch (e) {
            console.warn('[EpisodicExtractor] Init failed (non-fatal):', e);
        }
    }

    /**
     * Record a task episode. Fire-and-forget from the sidebar.
     * Only records multi-tool tasks (2+ tool calls) to avoid noise.
     */
    async recordEpisode(params: {
        userMessage: string;
        mode: string;
        toolSequence: string[];
        toolLedger: string;
        success: boolean;
        resultSummary: string;
    }): Promise<TaskEpisode | null> {
        if (params.toolSequence.length < 2) return null;

        const episode: TaskEpisode = {
            id: `ep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date().toISOString(),
            userMessage: params.userMessage.slice(0, 500),
            mode: params.mode,
            toolSequence: params.toolSequence,
            toolLedger: params.toolLedger.slice(0, 1500),
            success: params.success,
            resultSummary: params.resultSummary.slice(0, 300),
        };

        try {
            // FIFO eviction if at limit
            if (this.episodeCount >= MAX_EPISODES) {
                await this.evictOldest();
            }

            if (this.memoryDB?.isOpen()) {
                this.insertToDB(episode);
            } else {
                await this.insertToFile(episode);
            }
            this.episodeCount++;

            // Index in semantic search (source='episode')
            const index = this.getSemanticIndex();
            if (index) {
                const content = `Task: ${episode.userMessage}\n`
                    + `Tools: ${episode.toolSequence.join(' -> ')}\n`
                    + `Result: ${episode.resultSummary}`;
                await index.indexEpisode(episode.id, content);
            }

            return episode;
        } catch (e) {
            console.warn('[EpisodicExtractor] Failed to record episode:', e);
            return null;
        }
    }

    /** Search for similar past episodes using semantic search. */
    async findSimilarEpisodes(query: string, topK = 3): Promise<TaskEpisode[]> {
        const index = this.getSemanticIndex();
        if (!index) return [];

        try {
            const results = await index.searchEpisodes(query, topK);
            const episodes: TaskEpisode[] = [];

            for (const result of results) {
                const episodeId = result.path.replace(/^episode:(\/\/)?/, '');
                const episode = await this.loadEpisode(episodeId);
                if (episode) episodes.push(episode);
            }

            return episodes;
        } catch (e) {
            console.warn('[EpisodicExtractor] Search failed:', e);
            return [];
        }
    }

    // -----------------------------------------------------------------------
    // DB operations
    // -----------------------------------------------------------------------

    private countFromDB(): number {
        const db = this.memoryDB!.getDB();
        const result = db.exec('SELECT COUNT(*) FROM episodes');
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] as number;
    }

    private insertToDB(episode: TaskEpisode): void {
        const db = this.memoryDB!.getDB();
        db.run(
            `INSERT INTO episodes (id, user_message, mode, tool_sequence, tool_ledger, success, result_summary, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                episode.id,
                episode.userMessage,
                episode.mode,
                JSON.stringify(episode.toolSequence),
                episode.toolLedger,
                episode.success ? 1 : 0,
                episode.resultSummary,
                episode.timestamp,
            ],
        );
        this.memoryDB!.markDirty();
    }

    private loadEpisodeFromDB(id: string): TaskEpisode | null {
        const db = this.memoryDB!.getDB();
        const result = db.exec(
            'SELECT id, user_message, mode, tool_sequence, tool_ledger, success, result_summary, created_at FROM episodes WHERE id = ?',
            [id],
        );
        if (result.length === 0 || result[0].values.length === 0) return null;
        const row = result[0].values[0];
        return {
            id: row[0] as string,
            timestamp: row[7] as string,
            userMessage: (row[1] as string) ?? '',
            mode: (row[2] as string) ?? '',
            toolSequence: JSON.parse((row[3] as string) ?? '[]'),
            toolLedger: (row[4] as string) ?? '',
            success: (row[5] as number) === 1,
            resultSummary: (row[6] as string) ?? '',
        };
    }

    private evictOldestFromDB(): void {
        const db = this.memoryDB!.getDB();
        db.run('DELETE FROM episodes WHERE id = (SELECT id FROM episodes ORDER BY created_at ASC LIMIT 1)');
        this.memoryDB!.markDirty();
        this.episodeCount = Math.max(0, this.episodeCount - 1);
    }

    // -----------------------------------------------------------------------
    // Legacy file operations (fallback + migration)
    // -----------------------------------------------------------------------

    private async countFromFiles(): Promise<void> {
        const exists = await this.fs.exists(this.episodesDir);
        if (!exists) {
            await this.fs.mkdir(this.episodesDir);
            return;
        }
        const listing = await this.fs.list(this.episodesDir);
        this.episodeCount = listing.files.filter((f: string) => f.endsWith('.json')).length;
    }

    private async insertToFile(episode: TaskEpisode): Promise<void> {
        const filePath = `${this.episodesDir}/${episode.id}.json`;
        await this.fs.write(filePath, JSON.stringify(episode, null, 2));
    }

    private async loadEpisode(id: string): Promise<TaskEpisode | null> {
        if (this.memoryDB?.isOpen()) {
            return this.loadEpisodeFromDB(id);
        }
        try {
            const filePath = `${this.episodesDir}/${id}.json`;
            const exists = await this.fs.exists(filePath);
            if (!exists) return null;
            const raw = await this.fs.read(filePath);
            return JSON.parse(raw) as TaskEpisode;
        } catch {
            return null;
        }
    }

    private async evictOldest(): Promise<void> {
        if (this.memoryDB?.isOpen()) {
            this.evictOldestFromDB();
            return;
        }
        try {
            const listing = await this.fs.list(this.episodesDir);
            const jsonFiles = listing.files
                .filter((f: string) => f.endsWith('.json'))
                .sort();
            if (jsonFiles.length > 0) {
                await this.fs.remove(jsonFiles[0]);
                this.episodeCount--;
            }
        } catch (e) {
            console.warn('[EpisodicExtractor] Eviction failed:', e);
        }
    }

    /** One-time migration: import existing JSON episode files into DB. */
    private async migrateFromFiles(): Promise<void> {
        try {
            const exists = await this.fs.exists(this.episodesDir);
            if (!exists) return;
            const listing = await this.fs.list(this.episodesDir);
            const jsonFiles = listing.files.filter((f: string) => f.endsWith('.json'));
            if (jsonFiles.length === 0) return;

            let migrated = 0;
            for (const file of jsonFiles) {
                try {
                    const raw = await this.fs.read(file);
                    const episode = JSON.parse(raw) as TaskEpisode;
                    if (episode.id && episode.timestamp) {
                        this.insertToDB(episode);
                        migrated++;
                    }
                } catch { /* skip corrupt files */ }
            }

            if (migrated > 0) {
                this.episodeCount = migrated;
                await this.memoryDB!.save();
                console.debug(`[EpisodicExtractor] Migrated ${migrated} episodes from JSON files to DB`);
            }
        } catch (e) {
            console.warn('[EpisodicExtractor] Migration from files failed (non-fatal):', e);
        }
    }
}
