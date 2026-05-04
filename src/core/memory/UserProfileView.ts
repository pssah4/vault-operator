/**
 * UserProfileView -- aggregated read-only view across FactStore +
 * CommunicationStyleStore + MemoryDB.
 *
 * Used by:
 *   - Onboarding (FEATURE-0323) to render the profile summary
 *   - ContextComposer (FEATURE-0317) for the Hot-Memory-Block
 *
 * No persistent storage of its own -- pure query pattern. Engine-public,
 * Constructor-Injection, no obsidian (ADR-080).
 *
 * FEATURE-0317 / PLAN-006 task 2 (E9 sub-deliverable).
 */

import type { MemoryDB } from '../knowledge/MemoryDB';
import type { Fact } from './FactStore';
import { FactStore } from './FactStore';
import type { CommunicationStyle } from './CommunicationStyleStore';
import { CommunicationStyleStore } from './CommunicationStyleStore';

export interface UserProfile {
    identity: Fact[];
    preferences: Fact[];
    /** Facts whose primary topic is 'patterns' (workflow/behavioural). */
    patterns: Fact[];
    /** Default communication style row, or null if none configured. */
    communicationStyle: CommunicationStyle | null;
    stats: {
        conversations: number;
        topics: number;
        lastActive: string | null;
    };
}

export class UserProfileView {
    private readonly facts: FactStore;
    private readonly styles: CommunicationStyleStore;

    constructor(private readonly memoryDB: MemoryDB) {
        this.facts = new FactStore(memoryDB);
        this.styles = new CommunicationStyleStore(memoryDB);
    }

    getUserProfile(): UserProfile {
        const identity = this.facts.listLatest({ kind: 'identity', limit: 50 });
        const preferences = this.facts.listLatest({ kind: 'preference', limit: 100 });
        const allLatest = this.facts.listLatest({ limit: 1000 });
        const patterns = allLatest.filter(f => f.topics[0] === 'patterns');

        const styleRows = this.styles.getMatchingStyles('default', 1);
        const communicationStyle = styleRows[0] ?? null;

        const stats = this.computeStats();

        return { identity, preferences, patterns, communicationStyle, stats };
    }

    private computeStats(): UserProfile['stats'] {
        const db = this.memoryDB.getDB();
        const conversations = this.scalarOrZero(db.exec('SELECT COUNT(*) FROM sessions'));
        const topics = this.scalarOrZero(db.exec('SELECT COUNT(*) FROM known_topics'));
        const lastResult = db.exec(
            `SELECT MAX(created_at) FROM sessions`,
        );
        const lastActive = (lastResult[0]?.values?.[0]?.[0] as string | null) ?? null;
        return { conversations, topics, lastActive };
    }

    private scalarOrZero(result: ReturnType<ReturnType<MemoryDB['getDB']>['exec']>): number {
        return (result[0]?.values?.[0]?.[0] as number) ?? 0;
    }
}
