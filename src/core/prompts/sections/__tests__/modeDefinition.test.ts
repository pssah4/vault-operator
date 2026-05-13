import { describe, it, expect } from 'vitest';
import { getModeDefinitionSection } from '../modeDefinition';
import type { ModeConfig } from '../../../../types/settings';

/**
 * Tests for getModeDefinitionSection -- mode header + role body, with
 * optional subagent profile override (FEAT-24-04 / ADR-113).
 */

function makeMode(overrides: Partial<ModeConfig> = {}): ModeConfig {
    return {
        slug: 'agent',
        name: 'Agent',
        roleDefinition: 'You are the main agent.',
        toolGroups: ['read', 'edit'],
        ...overrides,
    } as ModeConfig;
}

describe('getModeDefinitionSection', () => {
    it('renders the mode header + roleDefinition by default', () => {
        const out = getModeDefinitionSection(makeMode());
        expect(out).toContain('MODE: AGENT');
        expect(out).toContain('You are the main agent.');
    });

    it('replaces roleDefinition with the override when provided (FEAT-24-04 / ADR-113)', () => {
        const out = getModeDefinitionSection(makeMode(), 'You are a focused research subagent.');
        expect(out).toContain('MODE: AGENT');
        expect(out).toContain('You are a focused research subagent.');
        expect(out).not.toContain('You are the main agent.');
    });

    it('keeps the mode header even when overriding the role', () => {
        // The subagent still needs to know which mode label it operates in.
        const out = getModeDefinitionSection(makeMode({ name: 'Agent' }), 'Lean profile prompt.');
        expect(out).toContain('MODE: AGENT');
    });

    it('falls back to the mode roleDefinition when override is undefined', () => {
        const fallback = getModeDefinitionSection(makeMode(), undefined);
        expect(fallback).toContain('You are the main agent.');
    });
});
