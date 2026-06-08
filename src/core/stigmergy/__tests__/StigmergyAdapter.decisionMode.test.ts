import { describe, it, expect, beforeEach } from 'vitest';
import {
    beginStigmergyTurn,
    __testHooks,
} from '../StigmergyAdapter';

interface FakeDecision {
    mode: 'sequence' | 'enforce' | 'ranked';
    ranked?: Array<{ capabilityId: string }>;
    forceFromSet?: true;
    nextCapability?: string;
    remainingPath?: string[];
}

interface FakeRawTurn {
    decision?: FakeDecision;
    surfaced?: string[];
    enabled?: boolean;
}

function makeFakeLoop(makeTurn: () => FakeRawTurn | { throwAtBegin: true }): {
    beginTurn: (params: unknown) => Promise<unknown>;
} {
    return {
        beginTurn: async (_params) => {
            const t = makeTurn();
            if ('throwAtBegin' in t && t.throwAtBegin) {
                throw new Error('simulated beginTurn failure');
            }
            const raw = t as FakeRawTurn;
            return {
                instrument: <T>(tools: T[]): T[] => tools,
                end: async () => undefined,
                accept: async () => undefined,
                iterate: async () => undefined,
                abandon: async () => undefined,
                surfaced: raw.surfaced ?? [],
                enabled: raw.enabled ?? true,
                decision: raw.decision,
            };
        },
    };
}

const baseTurnParams = {
    taskId: 'test-task',
    prompt: 'test prompt',
    candidateIds: ['toolA', 'toolB'],
};

describe('StigmergyAdapter.decisionMode (FEAT-32-01 PR 1.1, ADR-130)', () => {
    beforeEach(() => {
        __testHooks!.reset();
    });

    it('returns NOOP_TURN with decisionMode "none" when loop is absent', async () => {
        const turn = await beginStigmergyTurn(baseTurnParams);
        expect(turn.enabled).toBe(false);
        expect(turn.decisionMode).toBe('none');
    });

    it('returns decisionMode "sequence" when raw decision is sequence-mode', async () => {
        __testHooks!.setCachedLoop(
            makeFakeLoop(() => ({
                decision: {
                    mode: 'sequence',
                    nextCapability: 'read_file',
                    remainingPath: ['write_file', 'attempt_completion'],
                },
            })),
        );
        const turn = await beginStigmergyTurn(baseTurnParams);
        expect(turn.enabled).toBe(true);
        expect(turn.decisionMode).toBe('sequence');
    });

    it('returns decisionMode "enforce" when raw decision is enforce-mode', async () => {
        __testHooks!.setCachedLoop(
            makeFakeLoop(() => ({
                decision: {
                    mode: 'enforce',
                    ranked: [{ capabilityId: 'read_file' }, { capabilityId: 'write_file' }],
                    forceFromSet: true,
                },
            })),
        );
        const turn = await beginStigmergyTurn(baseTurnParams);
        expect(turn.decisionMode).toBe('enforce');
    });

    it('returns decisionMode "ranked" when raw decision is ranked-mode', async () => {
        __testHooks!.setCachedLoop(
            makeFakeLoop(() => ({
                decision: {
                    mode: 'ranked',
                    ranked: [{ capabilityId: 'search_files' }],
                },
            })),
        );
        const turn = await beginStigmergyTurn(baseTurnParams);
        expect(turn.decisionMode).toBe('ranked');
    });

    it('returns decisionMode "none" when raw decision is undefined', async () => {
        __testHooks!.setCachedLoop(makeFakeLoop(() => ({})));
        const turn = await beginStigmergyTurn(baseTurnParams);
        expect(turn.enabled).toBe(true);
        expect(turn.decisionMode).toBe('none');
    });

    it('returns NOOP_TURN with decisionMode "none" when beginTurn throws', async () => {
        __testHooks!.setCachedLoop(makeFakeLoop(() => ({ throwAtBegin: true })));
        const turn = await beginStigmergyTurn(baseTurnParams);
        expect(turn.enabled).toBe(false);
        expect(turn.decisionMode).toBe('none');
    });
});
