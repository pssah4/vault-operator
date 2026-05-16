/**
 * EPIC-26 / FEAT-26-03 -- pure label helpers in src/types/settings.ts.
 *
 * Tests the small public surface that the migration + UI rely on:
 *  - `getProviderBrandLabel(type)` -- maps internal enum to brand string
 *  - `getTierBadgeLabel(tier)`     -- maps tier id to user-facing badge text
 *
 * These are tiny but easy to break (typo in a switch, accidentally
 * dropping a provider) so a test is cheap insurance.
 */

import { describe, it, expect } from 'vitest';
import {
    getProviderBrandLabel,
    getTierBadgeLabel,
} from '../settings';
import type { ProviderType } from '../settings';

describe('getProviderBrandLabel (EPIC-26 / FEAT-26-03)', () => {
    it.each<[ProviderType, string]>([
        ['anthropic',       'Anthropic'],
        ['openai',          'OpenAI'],
        ['gemini',          'Google Gemini'],
        ['ollama',          'Ollama'],
        ['lmstudio',        'LM Studio'],
        ['openrouter',      'OpenRouter'],
        ['azure',           'Azure OpenAI'],
        ['github-copilot',  'GitHub Copilot'],
        ['kilo-gateway',    'Kilo Gateway'],
        ['bedrock',         'Amazon Bedrock'],
        ['chatgpt-oauth',   'ChatGPT (OAuth)'],
        ['custom',          'Custom'],
    ])('maps %s to %s', (type, expected) => {
        expect(getProviderBrandLabel(type)).toBe(expected);
    });

    it('returns the raw value for an unknown type (defensive fallback)', () => {
        // We cast through unknown because the type system would reject this.
        // The fallback exists for resilience against schema drift.
        expect(getProviderBrandLabel('mystery-provider' as unknown as ProviderType))
            .toBe('mystery-provider');
    });
});

describe('getTierBadgeLabel (EPIC-26 / FEAT-26-02)', () => {
    it.each<['fast' | 'mid' | 'flagship', string]>([
        ['fast',     'Budget'],
        ['mid',      'Main'],
        ['flagship', 'Frontier'],
    ])('maps %s to %s', (tier, expected) => {
        expect(getTierBadgeLabel(tier)).toBe(expected);
    });

    it('badge labels are all distinct (so the user can tell tiers apart)', () => {
        const labels = new Set(['fast', 'mid', 'flagship'].map((t) =>
            getTierBadgeLabel(t as 'fast' | 'mid' | 'flagship'),
        ));
        expect(labels.size).toBe(3);
    });
});
