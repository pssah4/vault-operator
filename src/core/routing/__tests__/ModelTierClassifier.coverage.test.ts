/**
 * H-02 Coverage Validation (EPIC-26 / BA-27).
 *
 * Hypothesis: pattern-based tier classifier covers >90% of currently
 * available provider models (Anthropic, OpenAI, Google Gemini, Bedrock)
 * at release time.
 *
 * Fixtures below mirror the public model lists that `fetchProviderModels`
 * returns for each provider, captured 2026-05. Each entry carries an
 * expected tier so a pattern miss is distinguishable from a wrong
 * classification.
 *
 * Threshold is enforced per-provider AND across the union. Misses are
 * surfaced via console.debug so /testing reports show which ids need
 * pattern table updates in ADR-121.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { classifyModelTier, type ClassifyResult } from '../ModelTierClassifier';
import type { ModelTier } from '../../../types/settings';

type Fixture = { id: string; expected: ModelTier };

const ANTHROPIC: Fixture[] = [
    { id: 'claude-opus-4-7', expected: 'flagship' },
    { id: 'claude-opus-4-6', expected: 'flagship' },
    { id: 'claude-opus-4-5-20250929', expected: 'flagship' },
    { id: 'claude-3-opus-20240229', expected: 'flagship' },
    { id: 'claude-sonnet-4-7', expected: 'mid' },
    { id: 'claude-sonnet-4-6', expected: 'mid' },
    { id: 'claude-sonnet-4-5-20250929', expected: 'mid' },
    { id: 'claude-3-7-sonnet-20250219', expected: 'mid' },
    { id: 'claude-3-5-sonnet-20241022', expected: 'mid' },
    { id: 'claude-3-5-sonnet-20240620', expected: 'mid' },
    { id: 'claude-haiku-4-5-20251001', expected: 'fast' },
    { id: 'claude-3-5-haiku-20241022', expected: 'fast' },
    { id: 'claude-3-haiku-20240307', expected: 'fast' },
];

const OPENAI: Fixture[] = [
    { id: 'gpt-5', expected: 'flagship' },
    { id: 'gpt-5-2025-08-01', expected: 'flagship' },
    { id: 'gpt-5-mini', expected: 'fast' },
    { id: 'gpt-5-nano', expected: 'fast' },
    { id: 'gpt-4.5-preview', expected: 'flagship' },
    { id: 'gpt-4.1', expected: 'mid' },
    { id: 'gpt-4.1-2025-04-14', expected: 'mid' },
    { id: 'gpt-4.1-mini', expected: 'fast' },
    { id: 'gpt-4.1-nano', expected: 'fast' },
    { id: 'gpt-4o', expected: 'mid' },
    { id: 'gpt-4o-2024-11-20', expected: 'mid' },
    { id: 'gpt-4o-mini', expected: 'fast' },
    { id: 'gpt-4-turbo', expected: 'mid' },
    { id: 'gpt-4-turbo-2024-04-09', expected: 'mid' },
    { id: 'gpt-3.5-turbo', expected: 'fast' },
    { id: 'gpt-3.5-turbo-0125', expected: 'fast' },
    { id: 'o1', expected: 'flagship' },
    { id: 'o1-2024-12-17', expected: 'flagship' },
    { id: 'o1-mini', expected: 'mid' },
    { id: 'o3', expected: 'flagship' },
    { id: 'o3-mini', expected: 'mid' },
    { id: 'o4-mini', expected: 'mid' },
];

const GEMINI: Fixture[] = [
    { id: 'gemini-2.5-pro', expected: 'flagship' },
    { id: 'gemini-2.5-pro-preview-05-06', expected: 'flagship' },
    { id: 'gemini-2.0-pro-exp-02-05', expected: 'flagship' },
    { id: 'gemini-1.5-pro', expected: 'flagship' },
    { id: 'gemini-1.5-pro-002', expected: 'flagship' },
    { id: 'gemini-2.5-flash', expected: 'mid' },
    { id: 'gemini-2.5-flash-preview-05-20', expected: 'mid' },
    { id: 'gemini-2.0-flash', expected: 'mid' },
    { id: 'gemini-2.0-flash-001', expected: 'mid' },
    { id: 'gemini-2.5-flash-lite', expected: 'fast' },
    { id: 'gemini-2.0-flash-lite', expected: 'fast' },
    { id: 'gemini-1.5-flash', expected: 'fast' },
    { id: 'gemini-1.5-flash-002', expected: 'fast' },
    { id: 'gemini-1.5-flash-8b', expected: 'fast' },
];

const BEDROCK: Fixture[] = [
    { id: 'eu.anthropic.claude-opus-4-7-v1:0', expected: 'flagship' },
    { id: 'eu.anthropic.claude-opus-4-6-v1:0', expected: 'flagship' },
    { id: 'us.anthropic.claude-opus-4-7-v1:0', expected: 'flagship' },
    { id: 'anthropic.claude-3-opus-20240229-v1:0', expected: 'flagship' },
    { id: 'eu.anthropic.claude-sonnet-4-6-v1:0', expected: 'mid' },
    { id: 'eu.anthropic.claude-sonnet-4-5-v1:0', expected: 'mid' },
    { id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', expected: 'mid' },
    { id: 'anthropic.claude-3-5-sonnet-20240620-v1:0', expected: 'mid' },
    { id: 'eu.anthropic.claude-haiku-4-5-v1:0', expected: 'fast' },
    { id: 'us.anthropic.claude-3-5-haiku-20241022-v1:0', expected: 'fast' },
    { id: 'anthropic.claude-3-haiku-20240307-v1:0', expected: 'fast' },
    { id: 'meta.llama3-1-405b-instruct-v1:0', expected: 'flagship' },
    { id: 'meta.llama3-3-70b-instruct-v1:0', expected: 'mid' },
    { id: 'meta.llama3-1-70b-instruct-v1:0', expected: 'mid' },
    { id: 'meta.llama3-1-8b-instruct-v1:0', expected: 'fast' },
];

const PROVIDERS: Record<string, Fixture[]> = {
    anthropic: ANTHROPIC,
    openai: OPENAI,
    gemini: GEMINI,
    bedrock: BEDROCK,
};

const PROVIDER_THRESHOLDS: Record<string, number> = {
    anthropic: 0.9,
    openai: 0.9,
    gemini: 0.9,
    bedrock: 0.9,
};

const UNION_THRESHOLD = 0.9;

interface Outcome {
    id: string;
    expected: ModelTier;
    actual: ClassifyResult | null;
    matchedTier: boolean;
    matchedExpected: boolean;
}

function run(fixtures: Fixture[]): Outcome[] {
    return fixtures.map((f) => {
        const actual = classifyModelTier(f.id);
        return {
            id: f.id,
            expected: f.expected,
            actual,
            matchedTier: actual?.source === 'pattern',
            matchedExpected:
                actual?.source === 'pattern' && actual.tier === f.expected,
        };
    });
}

function reportProvider(provider: string, outcomes: Outcome[]): {
    hitRate: number;
    correctRate: number;
    misses: Outcome[];
    wrong: Outcome[];
} {
    const hits = outcomes.filter((o) => o.matchedTier).length;
    const correct = outcomes.filter((o) => o.matchedExpected).length;
    const misses = outcomes.filter((o) => !o.matchedTier);
    const wrong = outcomes.filter(
        (o) => o.matchedTier && !o.matchedExpected,
    );
    const hitRate = hits / outcomes.length;
    const correctRate = correct / outcomes.length;

    // eslint-disable-next-line no-console -- review-bot allows .info
    console.info(
        `[H-02][${provider}] total=${outcomes.length} pattern-hit=${hits} pattern-correct=${correct} hit-rate=${(hitRate * 100).toFixed(1)}% correct-rate=${(correctRate * 100).toFixed(1)}%`,
    );
    if (misses.length > 0) {
        // eslint-disable-next-line no-console -- review-bot allows .info
        console.info(
            `[H-02][${provider}] misses (no pattern):\n  ${misses.map((m) => `${m.id} (expected ${m.expected})`).join('\n  ')}`,
        );
    }
    if (wrong.length > 0) {
        // eslint-disable-next-line no-console -- review-bot allows .info
        console.info(
            `[H-02][${provider}] wrong tier:\n  ${wrong.map((w) => `${w.id}: expected=${w.expected} actual=${w.actual?.tier}`).join('\n  ')}`,
        );
    }
    return { hitRate, correctRate, misses, wrong };
}

describe('H-02 Coverage Validation (EPIC-26 / FEAT-26-02)', () => {
    const reports: Record<
        string,
        ReturnType<typeof reportProvider> & { outcomes: Outcome[] }
    > = {};

    beforeAll(() => {
        for (const [provider, fixtures] of Object.entries(PROVIDERS)) {
            const outcomes = run(fixtures);
            const r = reportProvider(provider, outcomes);
            reports[provider] = { ...r, outcomes };
        }
    });

    describe.each(Object.keys(PROVIDERS))('provider %s', (provider) => {
        it(`pattern hit-rate >= ${(PROVIDER_THRESHOLDS[provider] * 100).toFixed(0)}%`, () => {
            const r = reports[provider];
            expect(r.hitRate).toBeGreaterThanOrEqual(
                PROVIDER_THRESHOLDS[provider],
            );
        });

        it('no wrong-tier classifications', () => {
            const r = reports[provider];
            expect(r.wrong).toEqual([]);
        });
    });

    it(`union pattern hit-rate >= ${(UNION_THRESHOLD * 100).toFixed(0)}%`, () => {
        const all: Outcome[] = Object.values(reports).flatMap(
            (r) => r.outcomes,
        );
        const hits = all.filter((o) => o.matchedTier).length;
        const hitRate = hits / all.length;
        // eslint-disable-next-line no-console -- review-bot allows .info
        console.info(
            `[H-02][union] total=${all.length} pattern-hit=${hits} hit-rate=${(hitRate * 100).toFixed(1)}%`,
        );
        expect(hitRate).toBeGreaterThanOrEqual(UNION_THRESHOLD);
    });
});
