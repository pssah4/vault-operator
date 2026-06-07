import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecipePromotionService } from '../RecipePromotionService';
import type { RecipeStore } from '../RecipeStore';
import type { EpisodicExtractor, TaskEpisode } from '../EpisodicExtractor';
import type { ProceduralRecipe } from '../types';
import type { ApiHandler } from '../../../api/types';

/**
 * FEAT-32-02 PR 2.3 / ADR-132: RecipePromotionService gains 3 gates in
 * checkForPromotion(episode, evidence?):
 *
 *   Gate 1: recipeWinner -> incrementSuccess on the winner, no promote.
 *   Gate 2: sequence-mode + pinnedPath followed + accept -> promoteFromStigmergyPath.
 *   Gate 3: fallback to the existing ADR-058 path.
 *
 * Daemon-down (evidence undefined) and enforce/ranked modes fall through to Gate 3.
 */

function makeStore(initial: ProceduralRecipe[] = []): {
    store: RecipeStore;
    saves: ProceduralRecipe[];
    increments: string[];
    saveSpy: ReturnType<typeof vi.fn>;
    incrementSpy: ReturnType<typeof vi.fn>;
} {
    const saves: ProceduralRecipe[] = [];
    const increments: string[] = [];
    const saveSpy = vi.fn(async (r: ProceduralRecipe) => {
        saves.push(r);
        initial.push(r);
    });
    const incrementSpy = vi.fn((id: string) => {
        increments.push(id);
    });
    const store = {
        getAll: () => initial,
        getById: (id: string) => initial.find((r) => r.id === id),
        save: saveSpy,
        incrementSuccess: incrementSpy,
    } as unknown as RecipeStore;
    return { store, saves, increments, saveSpy, incrementSpy };
}

function makeEpisode(overrides: Partial<TaskEpisode> = {}): TaskEpisode {
    return {
        id: overrides.id ?? 'ep-1',
        timestamp: '2026-06-07T00:00:00Z',
        userMessage: overrides.userMessage ?? 'do thing',
        mode: 'agent',
        toolSequence: overrides.toolSequence ?? [
            'search_files',
            'read_file',
            'write_file',
            'attempt_completion',
        ],
        toolLedger: '',
        success: overrides.success ?? true,
        resultSummary: overrides.resultSummary ?? 'ok',
        stigmergy: overrides.stigmergy,
    };
}

function makeExtractor(similar: TaskEpisode[] = []): EpisodicExtractor {
    return {
        findSimilarEpisodes: vi.fn(async () => similar),
    } as unknown as EpisodicExtractor;
}

// Minimal ApiHandler that streams a valid recipe JSON. The promotion LLM call
// expects { name, description, trigger, steps: [{tool, note}, ...] }.
function makeApi(): ApiHandler {
    const json = JSON.stringify({
        name: 'Stigmergy-Synth-1',
        description: 'auto-generated from a Stigmergy pinned sequence',
        trigger: 'search read write',
        steps: [
            { tool: 'search_files', note: 'find files' },
            { tool: 'read_file', note: 'read each' },
            { tool: 'write_file', note: 'emit synthesis' },
        ],
    });
    return {
        createMessage: async function* () {
            yield { type: 'text', text: json };
        },
    } as unknown as ApiHandler;
}

describe('RecipePromotionService 3 gates (FEAT-32-02 PR 2.3, ADR-132)', () => {
    let getApi: () => ApiHandler | null;
    beforeEach(() => {
        getApi = () => makeApi();
    });

    describe('Gate 1: recipe-wins', () => {
        it('increments successCount on recipeWinner and skips promote', async () => {
            const { store, saveSpy, incrementSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor());
            await svc.checkForPromotion(makeEpisode(), {
                enabled: true,
                mode: 'sequence',
                pinnedPath: [],
                guidanceTextSuppressed: true,
                recipeWinner: 'rcp-42',
            });
            expect(incrementSpy).toHaveBeenCalledWith('rcp-42');
            expect(saveSpy).not.toHaveBeenCalled();
        });
    });

    describe('Gate 2: stigmergy sequence shortcut', () => {
        it('promotes when sequence mode + path followed + last is attempt_completion', async () => {
            const { store, saves, saveSpy, incrementSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor());
            await svc.checkForPromotion(
                makeEpisode({
                    toolSequence: ['search_files', 'read_file', 'write_file', 'attempt_completion'],
                }),
                {
                    enabled: true,
                    mode: 'sequence',
                    pinnedPath: ['search_files', 'read_file', 'write_file'],
                    guidanceTextSuppressed: false,
                    recipeWinner: null,
                },
            );
            expect(saveSpy).toHaveBeenCalledTimes(1);
            expect(saves[0].source).toBe('learned');
            expect(saves[0].successCount).toBe(1);
            expect(saves[0].id.startsWith('learned-stigmergy-')).toBe(true);
            expect(incrementSpy).not.toHaveBeenCalled();
        });

        it('SKIPs when toolSequence does NOT contain the pinned subsequence', async () => {
            const { store, saveSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor());
            await svc.checkForPromotion(
                makeEpisode({
                    toolSequence: ['search_files', 'attempt_completion'],
                }),
                {
                    enabled: true,
                    mode: 'sequence',
                    pinnedPath: ['search_files', 'read_file', 'write_file'],
                    guidanceTextSuppressed: false,
                    recipeWinner: null,
                },
            );
            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('SKIPs when last tool is not attempt_completion', async () => {
            const { store, saveSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor());
            await svc.checkForPromotion(
                makeEpisode({
                    toolSequence: ['search_files', 'read_file', 'write_file'],
                }),
                {
                    enabled: true,
                    mode: 'sequence',
                    pinnedPath: ['search_files', 'read_file', 'write_file'],
                    guidanceTextSuppressed: false,
                    recipeWinner: null,
                },
            );
            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('SKIPs when mode is enforce (set-semantics, not a path)', async () => {
            const { store, saveSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor());
            await svc.checkForPromotion(
                makeEpisode(),
                {
                    enabled: true,
                    mode: 'enforce',
                    pinnedPath: ['search_files', 'read_file'],
                    guidanceTextSuppressed: false,
                    recipeWinner: null,
                },
            );
            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('SKIPs when mode is ranked (observe-only)', async () => {
            const { store, saveSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor());
            await svc.checkForPromotion(
                makeEpisode(),
                {
                    enabled: true,
                    mode: 'ranked',
                    pinnedPath: [],
                    guidanceTextSuppressed: false,
                    recipeWinner: null,
                },
            );
            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('SKIPs when pinnedPath length is below 2', async () => {
            const { store, saveSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor());
            await svc.checkForPromotion(
                makeEpisode(),
                {
                    enabled: true,
                    mode: 'sequence',
                    pinnedPath: ['search_files'],
                    guidanceTextSuppressed: false,
                    recipeWinner: null,
                },
            );
            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('SKIPs when getLearnedEnabled returns false', async () => {
            const { store, saveSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => false, makeExtractor());
            await svc.checkForPromotion(
                makeEpisode(),
                {
                    enabled: true,
                    mode: 'sequence',
                    pinnedPath: ['search_files', 'read_file', 'write_file'],
                    guidanceTextSuppressed: false,
                    recipeWinner: null,
                },
            );
            expect(saveSpy).not.toHaveBeenCalled();
        });

        it('SKIPs when MAX_LEARNED_RECIPES (50) is reached', async () => {
            const existing: ProceduralRecipe[] = Array.from({ length: 50 }, (_, i) => ({
                id: `learned-${i}`,
                name: `r${i}`,
                description: '',
                trigger: 'unrelated',
                steps: [],
                source: 'learned',
                schemaVersion: 1,
                successCount: 1,
                lastUsed: null,
                modes: [],
            }));
            const { store, saveSpy } = makeStore(existing);
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor());
            await svc.checkForPromotion(
                makeEpisode(),
                {
                    enabled: true,
                    mode: 'sequence',
                    pinnedPath: ['search_files', 'read_file', 'write_file'],
                    guidanceTextSuppressed: false,
                    recipeWinner: null,
                },
            );
            expect(saveSpy).not.toHaveBeenCalled();
        });
    });

    describe('Gate 3: ADR-058 fallback', () => {
        it('falls through to ADR-058 path when evidence is undefined (daemon down)', async () => {
            const similar = [
                makeEpisode({ id: 'ep-a', userMessage: 'do thing' }),
                makeEpisode({ id: 'ep-b', userMessage: 'do thing' }),
            ];
            const { store, saveSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor(similar));
            await svc.checkForPromotion(makeEpisode());
            // ADR-058 path will fire promoteToRecipe (LLM call). saveSpy should be called.
            expect(saveSpy).toHaveBeenCalledTimes(1);
            expect(saveSpy.mock.calls[0][0].source).toBe('learned');
        });

        it('falls through to ADR-058 when evidence.enabled is false', async () => {
            const similar = [
                makeEpisode({ id: 'ep-a', userMessage: 'do thing' }),
                makeEpisode({ id: 'ep-b', userMessage: 'do thing' }),
            ];
            const { store, saveSpy } = makeStore();
            const svc = new RecipePromotionService(store, getApi, () => true, makeExtractor(similar));
            await svc.checkForPromotion(makeEpisode(), {
                enabled: false,
                mode: 'none',
                pinnedPath: [],
                guidanceTextSuppressed: false,
                recipeWinner: null,
            });
            expect(saveSpy).toHaveBeenCalledTimes(1);
        });
    });
});
