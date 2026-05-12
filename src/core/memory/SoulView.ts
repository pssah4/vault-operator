/**
 * SoulView -- read API for the Agent-Self layer (profile_id='_obsilo').
 *
 * L2 Curated Soul (values, anti-patterns, identity, communication style)
 * and L3 Capability Snapshot live in the same `facts` table as user
 * memory, just under the reserved `profile_id='_obsilo'` partition.
 * SoulView is the read-side wrapper that the System-Prompt-Builder, the
 * settings UI and the inspect_self tool share.
 *
 * Top-N ranking per category (FEATURE-0319b decision B): three entries
 * per soul-category (value / anti_pattern / identity / communication),
 * ordered by importance DESC then last_used_at DESC. Capabilities have
 * no top-N cap because they're agent-only and travel via recall_memory.
 *
 * Constructor-Injection only -- no `obsidian`, no plugin globals. Stays
 * engine-extract ready (ADR-080).
 *
 * FEATURE-0319b / PLAN-008 task A.2.
 */

import type { MemoryDB } from '../knowledge/MemoryDB';
import type { Fact } from './FactStore';
import { FactStore } from './FactStore';

export const OBSILO_PROFILE = '_obsilo';

export type SoulCategory = 'value' | 'anti_pattern' | 'identity' | 'communication';

const SOUL_CATEGORY_ORDER: SoulCategory[] = ['identity', 'value', 'anti_pattern', 'communication'];
const PER_CATEGORY_CAP = 3;

export interface SoulSnapshot {
    identity: Fact[];
    values: Fact[];
    antiPatterns: Fact[];
    communication: Fact[];
}

export class SoulView {
    private readonly factStore: FactStore;

    constructor(memoryDB: MemoryDB) {
        this.factStore = new FactStore(memoryDB);
    }

    /** Top-3 facts per soul-category, ranked by importance, then last_used_at. */
    snapshot(): SoulSnapshot {
        const all = this.factStore.listLatest({
            profileId: OBSILO_PROFILE,
            limit: 200,
        });
        return {
            identity: this.topN(all, 'identity'),
            values: this.topN(all, 'value'),
            antiPatterns: this.topN(all, 'anti_pattern'),
            communication: this.topN(all, 'communication'),
        };
    }

    getCategory(category: SoulCategory): Fact[] {
        const all = this.factStore.listLatest({ profileId: OBSILO_PROFILE, limit: 200 });
        return this.topN(all, category);
    }

    /** All capabilities (no top-N cap; agent reads via recall_memory). */
    getCapabilities(): Fact[] {
        const all = this.factStore.listLatest({ profileId: OBSILO_PROFILE, limit: 500 });
        return all.filter(f => f.topics.includes('capability'));
    }

    /**
     * Render the cache-stable Soul block for the system prompt.
     * Layout is intentionally rigid so KV-cache stays warm across turns.
     */
    renderMarkdown(): string {
        const s = this.snapshot();
        const lines: string[] = [];
        lines.push('## Identity & Soul (Vault Operator)');
        lines.push('');
        lines.push('You are Vault Operator, an AI agent embedded in Obsidian.');
        lines.push('');

        for (const cat of SOUL_CATEGORY_ORDER) {
            const facts = this.bucket(s, cat);
            if (facts.length === 0) continue;
            lines.push(`**${labelFor(cat)}:**`);
            for (const f of facts) lines.push(`- ${f.text}`);
            lines.push('');
        }

        lines.push(
            'For your own features call recall_memory(profile=\'_obsilo\') or ' +
            'inspect_self({ area: \'settings\' | \'tools\' | \'capabilities\' }) ' +
            'instead of guessing.',
        );
        return lines.join('\n');
    }

    private topN(all: Fact[], category: SoulCategory): Fact[] {
        const filtered = all.filter(f =>
            f.topics.includes('soul') && f.topics.includes(category),
        );
        filtered.sort((a, b) => {
            if (b.importance !== a.importance) return b.importance - a.importance;
            const aTs = a.lastUsedAt ?? a.lastConfirmedAt;
            const bTs = b.lastUsedAt ?? b.lastConfirmedAt;
            return bTs.localeCompare(aTs);
        });
        return filtered.slice(0, PER_CATEGORY_CAP);
    }

    private bucket(s: SoulSnapshot, cat: SoulCategory): Fact[] {
        switch (cat) {
            case 'identity': return s.identity;
            case 'value': return s.values;
            case 'anti_pattern': return s.antiPatterns;
            case 'communication': return s.communication;
        }
    }
}

function labelFor(cat: SoulCategory): string {
    switch (cat) {
        case 'identity': return 'Identity';
        case 'value': return 'Values';
        case 'anti_pattern': return 'Anti-Patterns';
        case 'communication': return 'Communication style';
    }
}
