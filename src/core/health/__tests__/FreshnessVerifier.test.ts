import { describe, it, expect } from 'vitest';

import { FreshnessVerifier, type VerifierProvider, type RawVerdict, type VerifierSettings } from '../FreshnessVerifier';
import type { NoteVerdict } from '../types';

/**
 * Tests for IMP-20-06-01 Wave 1 task W1-T5.
 *
 * Pins the escalation gates from ADR-135:
 * - Mid-tier always runs first.
 * - Frontier only when confidence < threshold AND verdict in escalation
 *   set AND settings.allowFrontierEscalation AND provider has ZDR.
 * - Without ZDR: fail-closed, the mid-tier verdict stays.
 * - Token cost is the sum across all calls in the run.
 */

interface FakeProviderOptions {
    midReturns: RawVerdict;
    frontierReturns?: RawVerdict;
    zdr: boolean;
}

function makeFakeProvider(opts: FakeProviderOptions): VerifierProvider & {
    midCalls: number;
    frontierCalls: number;
} {
    let midCalls = 0;
    let frontierCalls = 0;
    return {
        get midCalls() { return midCalls; },
        get frontierCalls() { return frontierCalls; },
        callMidTier: async () => {
            midCalls++;
            return opts.midReturns;
        },
        callFrontier: async () => {
            frontierCalls++;
            if (!opts.frontierReturns) throw new Error('frontier should not have been called');
            return opts.frontierReturns;
        },
        hasZdrCapability: () => opts.zdr,
        midModelId: 'haiku-test',
        frontierModelId: 'opus-test',
    };
}

const SETTINGS_DEFAULT: VerifierSettings = {
    allowFrontierEscalation: true,
    frontierConfidenceThreshold: 0.7,
    frontierSeverityFilter: ['widerspricht', 'outdated'],
};

const NOTE = { path: 'Notes/A.md', body: 'Pricing is $29.' };
const CLUSTER = { cluster: 'pricing', sources: ['https://example.com/pricing'] };

describe('FreshnessVerifier (IMP-20-06-01 W1-T5)', () => {
    it('returns the mid-tier verdict when confidence is high enough', async () => {
        const provider = makeFakeProvider({
            midReturns: {
                verdict: 'deckt-sich',
                confidence: 0.9,
                summary: 'Matches the source.',
                sources: ['https://example.com/pricing'],
                tokensUsed: 5500,
            },
            zdr: true,
        });
        const verifier = new FreshnessVerifier(provider, SETTINGS_DEFAULT);

        const result: NoteVerdict = await verifier.verifyNote(NOTE, CLUSTER);

        expect(provider.midCalls).toBe(1);
        expect(provider.frontierCalls).toBe(0);
        expect(result.verdict).toBe('deckt-sich');
        expect(result.verifierTier).toBe('mid');
        expect(result.tokensUsed).toBe(5500);
        expect(result.modelId).toBe('haiku-test');
    });

    it('escalates to frontier when confidence is low AND severity in filter AND ZDR is true', async () => {
        const provider = makeFakeProvider({
            midReturns: {
                verdict: 'widerspricht',
                confidence: 0.55,
                summary: 'Mid call: possibly outdated.',
                sources: ['https://example.com/pricing'],
                tokensUsed: 5500,
            },
            frontierReturns: {
                verdict: 'widerspricht',
                confidence: 0.91,
                summary: 'Frontier confirmed: outdated.',
                sources: ['https://example.com/pricing'],
                tokensUsed: 14000,
            },
            zdr: true,
        });
        const verifier = new FreshnessVerifier(provider, SETTINGS_DEFAULT);

        const result = await verifier.verifyNote(NOTE, CLUSTER);

        expect(provider.midCalls).toBe(1);
        expect(provider.frontierCalls).toBe(1);
        expect(result.verifierTier).toBe('frontier');
        expect(result.confidence).toBeCloseTo(0.91, 2);
        expect(result.modelId).toBe('opus-test');
        // Token cost is the sum of both calls.
        expect(result.tokensUsed).toBe(5500 + 14000);
    });

    it('fail-closes when ZDR capability is false: stays mid-tier, does not call frontier', async () => {
        const provider = makeFakeProvider({
            midReturns: {
                verdict: 'widerspricht',
                confidence: 0.5,
                summary: 'Mid call: possibly outdated.',
                sources: ['https://example.com/pricing'],
                tokensUsed: 5500,
            },
            zdr: false,
        });
        const verifier = new FreshnessVerifier(provider, SETTINGS_DEFAULT);

        const result = await verifier.verifyNote(NOTE, CLUSTER);

        expect(provider.midCalls).toBe(1);
        expect(provider.frontierCalls).toBe(0);
        expect(result.verifierTier).toBe('mid');
        expect(result.verdict).toBe('widerspricht');
        expect(result.tokensUsed).toBe(5500);
    });

    it('does not escalate when allowFrontierEscalation is false, even with low confidence and severity in filter', async () => {
        const provider = makeFakeProvider({
            midReturns: {
                verdict: 'outdated',
                confidence: 0.3,
                summary: 'Mid call: clearly stale.',
                sources: ['https://example.com/x'],
                tokensUsed: 5500,
            },
            zdr: true,
        });
        const verifier = new FreshnessVerifier(provider, {
            ...SETTINGS_DEFAULT,
            allowFrontierEscalation: false,
        });

        const result = await verifier.verifyNote(NOTE, CLUSTER);

        expect(provider.frontierCalls).toBe(0);
        expect(result.verifierTier).toBe('mid');
        expect(result.verdict).toBe('outdated');
    });

    it('does not escalate when severity is not in the filter, even at low confidence', async () => {
        const provider = makeFakeProvider({
            midReturns: {
                verdict: 'ergaenzt',
                confidence: 0.4,
                summary: 'Additive only.',
                sources: ['https://example.com/x'],
                tokensUsed: 5500,
            },
            zdr: true,
        });
        const verifier = new FreshnessVerifier(provider, SETTINGS_DEFAULT);

        const result = await verifier.verifyNote(NOTE, CLUSTER);

        expect(provider.frontierCalls).toBe(0);
        expect(result.verifierTier).toBe('mid');
    });
});
