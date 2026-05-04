/**
 * MemoryRetriever
 *
 * Cross-session context retrieval via semantic search over session summaries
 * and task episodes (ADR-018).
 *
 * On new conversation start, searches for relevant past sessions and episodes,
 * then returns formatted context for injection into the system prompt.
 *
 * Primary path: semantic search over indexed session summaries + episodes.
 * Fallback: most recent 3 session summaries from DB (ADR-060), then .md files (legacy).
 *
 * Budget: 4000 chars total (shared between sessions and episodes).
 */

import type { FileAdapter } from '../storage/types';
import type { SemanticIndexService } from '../semantic/SemanticIndexService';
import type { MemoryService } from './MemoryService';
import type { MemoryDB } from '../knowledge/MemoryDB';

// ---------------------------------------------------------------------------
// MemoryRetriever
// ---------------------------------------------------------------------------

export class MemoryRetriever {
    constructor(
        private fs: FileAdapter,
        private memoryService: MemoryService,
        private getSemanticIndex: () => SemanticIndexService | null,
        private memoryDB: MemoryDB | null = null,
    ) {}

    /**
     * Retrieve relevant session context for a new conversation.
     *
     * @param firstMessage - The user's first message (used as search query).
     * @param topK - Maximum number of session summaries to include.
     * @returns Formatted context string, or empty string if no relevant sessions.
     */
    async retrieveSessionContext(firstMessage: string, topK = 3): Promise<string> {
        const semanticIndex = this.getSemanticIndex();

        let excerpts: Array<{ id: string; excerpt: string }> = [];

        // Primary path: semantic search over session summaries
        if (semanticIndex?.isIndexed) {
            try {
                const results = await semanticIndex.searchSessions(firstMessage, topK);
                excerpts = results.map((r) => ({
                    id: r.path.replace(/^session:(\/\/)?/, ''),
                    excerpt: r.excerpt,
                }));
            } catch (e) {
                console.warn('[MemoryRetriever] Semantic search failed, falling back to recency:', e);
            }
        }

        // Fallback: most recent session summaries (DB first, then legacy .md files)
        if (excerpts.length === 0) {
            excerpts = this.getRecentSessionsFromDB(topK);
            if (excerpts.length === 0) {
                excerpts = await this.getRecentSessionsFromFiles(topK);
            }
        }

        // Episodic memory: search for similar past task episodes (ADR-018)
        let episodeExcerpts: Array<{ id: string; excerpt: string }> = [];
        if (semanticIndex?.isIndexed) {
            try {
                const episodeResults = await semanticIndex.searchEpisodes(firstMessage, 3);
                episodeExcerpts = episodeResults.map((r) => ({
                    id: r.path.replace(/^episode:(\/\/)?/, ''),
                    excerpt: r.excerpt,
                }));
            } catch (e) {
                console.warn('[MemoryRetriever] Episode search failed (non-fatal):', e);
            }
        }

        if (excerpts.length === 0 && episodeExcerpts.length === 0) return '';

        // Format as context block — shared budget of 4000 chars
        const BUDGET = 4000;
        let charCount = 0;
        const lines: string[] = [];

        // Sessions first (higher priority)
        if (excerpts.length > 0) {
            lines.push('<relevant_sessions>');
            for (const { id, excerpt } of excerpts) {
                const truncated = excerpt.length > 600 ? excerpt.slice(0, 600) + '...' : excerpt;
                if (charCount + truncated.length > BUDGET) break;
                lines.push(`<session id="${id}">`);
                lines.push(truncated);
                lines.push('</session>');
                lines.push('');
                charCount += truncated.length + 40; // tag overhead
            }
            lines.push('</relevant_sessions>');
        }

        // Episodes (fill remaining budget)
        if (episodeExcerpts.length > 0 && charCount < BUDGET) {
            lines.push('<past_task_episodes>');
            for (const { id, excerpt } of episodeExcerpts) {
                const truncated = excerpt.length > 400 ? excerpt.slice(0, 400) + '...' : excerpt;
                if (charCount + truncated.length > BUDGET) break;
                lines.push(`<episode id="${id}">`);
                lines.push(truncated);
                lines.push('</episode>');
                lines.push('');
                charCount += truncated.length + 40;
            }
            lines.push('</past_task_episodes>');
        }

        return lines.join('\n');
    }

    /**
     * Primary fallback: load most recent session summaries from MemoryDB.
     * ADR-060: Sessions are stored in DB since FEATURE-1505.
     */
    private getRecentSessionsFromDB(topK: number): Array<{ id: string; excerpt: string }> {
        if (!this.memoryDB?.isOpen()) return [];
        try {
            const db = this.memoryDB.getDB();
            const result = db.exec(
                'SELECT id, summary FROM sessions WHERE summary IS NOT NULL AND summary != \'\' ORDER BY created_at DESC LIMIT ?',
                [topK],
            );
            if (result.length === 0 || result[0].values.length === 0) return [];
            return result[0].values.map((row) => ({
                id: (row[0] as string) ?? '',
                excerpt: (row[1] as string) ?? '',
            }));
        } catch (e) {
            console.warn('[MemoryRetriever] DB fallback failed:', e);
            return [];
        }
    }

    /**
     * Legacy fallback: load most recent session summary .md files.
     */
    private async getRecentSessionsFromFiles(topK: number): Promise<Array<{ id: string; excerpt: string }>> {
        const sessionsDir = this.memoryService.getMemoryDir() + '/sessions';
        try {
            const listed = await this.fs.list(sessionsDir);
            const mdFiles = listed.files.filter((f) => f.endsWith('.md'));

            if (mdFiles.length === 0) return [];

            // Get modification times and sort by most recent
            const withStats = await Promise.all(
                mdFiles.map(async (filePath) => {
                    try {
                        const stat = await this.fs.stat(filePath);
                        return { filePath, mtime: stat?.mtime ?? 0 };
                    } catch {
                        return { filePath, mtime: 0 };
                    }
                }),
            );
            withStats.sort((a, b) => b.mtime - a.mtime);

            const results: Array<{ id: string; excerpt: string }> = [];
            for (const { filePath } of withStats.slice(0, topK)) {
                try {
                    const content = await this.fs.read(filePath);
                    const id = filePath.split('/').pop()?.replace('.md', '') ?? '';
                    results.push({ id, excerpt: content.trim() });
                } catch { /* skip */ }
            }
            return results;
        } catch {
            return [];
        }
    }
}
