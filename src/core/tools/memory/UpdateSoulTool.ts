/**
 * update_soul -- agent-driven editing of L2 Curated Soul.
 *
 * The user often instructs Obsilo with phrases like
 *   "merk dir, dass ich keine Floskeln mag"
 *   "remember to never use emojis"
 *   "stell dir vor du bist eher direkt als hoeflich"
 * The agent calls update_soul to persist these as L2 facts under the
 * reserved profile_id='_obsilo' partition. Stored facts immediately
 * surface in the Soul-Block of the next system prompt (cache-stable
 * section, FEATURE-0319b decision A).
 *
 * Categories:
 *   - value          stable beliefs / preferences
 *   - anti_pattern   things to avoid
 *   - identity       who Obsilo is (rare; usually static)
 *   - communication  style / tone preferences
 *
 * supersedes={factId} replaces an existing soul fact via
 * FactStore.supersede so the audit trail keeps the prior version.
 *
 * FEATURE-0319b / PLAN-008 task B.4.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { FactStore } from '../../memory/FactStore';
import { OBSILO_PROFILE, type SoulCategory } from '../../memory/SoulView';

const ALLOWED_CATEGORIES: ReadonlySet<SoulCategory> = new Set([
    'value', 'anti_pattern', 'identity', 'communication',
]);

export class UpdateSoulTool extends BaseTool<'update_soul'> {
    readonly name = 'update_soul' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'update_soul',
            description:
                'Add, update, or replace an entry in your own Curated Soul (L2): values, ' +
                'anti-patterns, identity, or communication style. Call this when the user ' +
                'instructs you about HOW to behave ("remember to be more direct", "merk dir, ' +
                'dass ich keine Emojis mag"). Persisted under profile_id=_obsilo and surfaced ' +
                'in the system prompt of the next turn.',
            input_schema: {
                type: 'object',
                properties: {
                    category: {
                        type: 'string',
                        enum: ['value', 'anti_pattern', 'identity', 'communication'],
                        description:
                            'value=stable beliefs/preferences, anti_pattern=things to avoid, ' +
                            'identity=who you are, communication=style/tone.',
                    },
                    text: {
                        type: 'string',
                        description: 'The soul entry as a single self-contained statement (max ~120 chars).',
                    },
                    importance: {
                        type: 'number',
                        description: 'Importance 0..1 (default 0.7). Higher = more likely to stay in the prompt cap.',
                    },
                    supersedes: {
                        type: 'number',
                        description: 'Optional fact_id of an existing soul entry to replace. Old entry is superseded, new one inserted.',
                    },
                    rationale: {
                        type: 'string',
                        description: 'Optional one-line context (why this entry was added).',
                    },
                },
                required: ['category', 'text'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        if (!this.plugin.settings.memory.enabled) {
            callbacks.pushToolResult('Memory is disabled. Cannot update soul.');
            return;
        }
        const memDB = this.plugin.memoryDB;
        if (!memDB?.isOpen()) {
            callbacks.pushToolResult('Memory database is not open. Cannot update soul.');
            return;
        }

        const category = input.category;
        if (typeof category !== 'string' || !ALLOWED_CATEGORIES.has(category as SoulCategory)) {
            callbacks.pushToolResult(this.formatError(
                new Error(`category must be one of ${[...ALLOWED_CATEGORIES].join(', ')}`),
            ));
            return;
        }
        const text = typeof input.text === 'string' ? input.text.trim() : '';
        if (!text) {
            callbacks.pushToolResult(this.formatError(new Error('text must be a non-empty string')));
            return;
        }
        const importance = clampImportance(input.importance) ?? 0.7;

        const factStore = new FactStore(memDB);
        const factInput = {
            text,
            topics: ['soul', category],
            importance,
            kind: 'identity' as const,
            profileId: OBSILO_PROFILE,
            sourceInterface: 'obsilo-self',
            metadata: typeof input.rationale === 'string'
                ? { rationale: input.rationale }
                : undefined,
        };

        try {
            const supersedesRaw = input.supersedes;
            if (typeof supersedesRaw === 'number' && Number.isInteger(supersedesRaw) && supersedesRaw > 0) {
                const result = factStore.supersede(supersedesRaw, factInput);
                await memDB.save().catch(() => undefined);
                callbacks.pushToolResult(
                    `Superseded soul fact #${result.supersededId} with new ${category}: "${text}" (id=${result.newFact.id}).`,
                );
                return;
            }
            const fact = factStore.insert(factInput);
            await memDB.save().catch(() => undefined);
            callbacks.pushToolResult(
                `Added ${category} to soul: "${text}" (id=${fact.id}, importance=${importance.toFixed(2)}).`,
            );
        } catch (e) {
            callbacks.pushToolResult(this.formatError(e));
        }
    }
}

function clampImportance(raw: unknown): number | null {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
    if (raw < 0 || raw > 1) return null;
    return raw;
}
