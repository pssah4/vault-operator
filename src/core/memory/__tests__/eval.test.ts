/**
 * Memory v2 Single-Call eval set (PLAN-007 task C.4).
 *
 * Each fixture in conversation-fixtures/*.json defines a conversation,
 * the LLM tool_use payload we expect a well-prompted memory model to
 * produce, and the validated outcome we want the engine to land on.
 *
 * The test runs SingleCallExtractor with a mock ApiHandler scripted to
 * the fixture's `extractorOutput`, then asserts the validated result
 * matches `expected`. This catches regressions in the validation +
 * noise-filter logic and pins down the schema contract for the prompt.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SingleCallExtractor, type SingleCallMessage } from '../SingleCallExtractor';
import type { ApiHandler, ApiStream, ApiStreamChunk } from '../../../api/types';

interface FixtureExpected {
    factCount: number;
    rejectedCount: number;
    topicDriftDetected: boolean;
    mentionsCount?: number;
    facts: Array<{ kind: string; relation: string; topicsFirst: string }>;
}

interface Fixture {
    name: string;
    description: string;
    messages: Array<{ role: 'user' | 'assistant'; text: string }>;
    extractorOutput: Record<string, unknown>;
    expected: FixtureExpected;
}

const FIXTURES_DIR = (() => {
    const here = dirname(fileURLToPath(import.meta.url));
    return resolve(here, 'conversation-fixtures');
})();

function loadFixtures(): Fixture[] {
    return readdirSync(FIXTURES_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .map(name => JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8')) as Fixture);
}

function makeMockApi(input: Record<string, unknown>): ApiHandler {
    const chunks: ApiStreamChunk[] = [
        { type: 'tool_use', id: 'tu', name: '_memory_single_call', input },
    ];
    return {
        createMessage: (): ApiStream => (async function*() { for (const c of chunks) yield c; })(),
        getModel: () => ({ id: 'mock', info: { contextWindow: 100000, supportsTools: true, supportsStreaming: true } }),
    };
}

const fixtures = loadFixtures();

describe('SingleCall eval set (PLAN-007 task C.4)', () => {
    it('loads at least 10 fixtures', () => {
        expect(fixtures.length).toBeGreaterThanOrEqual(10);
    });

    for (const fx of fixtures) {
        it(`fixture ${fx.name}: ${fx.description}`, async () => {
            const messages: SingleCallMessage[] = fx.messages.map((m, i) => ({
                role: m.role, text: m.text, index: i,
            }));
            const api = makeMockApi(fx.extractorOutput);
            const result = await new SingleCallExtractor(api).extract({ messages });

            expect(result.facts).toHaveLength(fx.expected.factCount);
            expect(result.rejected).toHaveLength(fx.expected.rejectedCount);
            expect(result.topicDriftDetected).toBe(fx.expected.topicDriftDetected);
            if (typeof fx.expected.mentionsCount === 'number') {
                expect(result.mentions).toHaveLength(fx.expected.mentionsCount);
            }
            for (let i = 0; i < fx.expected.facts.length; i++) {
                const exp = fx.expected.facts[i];
                const got = result.facts[i];
                expect(got.kind).toBe(exp.kind);
                expect(got.relation).toBe(exp.relation);
                expect(got.topics[0]).toBe(exp.topicsFirst);
            }
        });
    }
});
