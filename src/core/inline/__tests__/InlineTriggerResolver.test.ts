import { describe, it, expect, vi } from 'vitest';
import { InlineTriggerResolver } from '../InlineTriggerResolver';
import { isInlineTriggerContext, type InlineSettingsSnapshot } from '../InlineTriggerContext';

/**
 * Tests for InlineTriggerResolver (FEAT-33-01 TR-1.2, EPIC-33).
 *
 * The Resolver turns a selection-event tuple into a typed
 * InlineTriggerContext. It pulls the settings snapshot from a
 * lazy callback so the caller controls when settings are read
 * (ADR-140 Hybrid Cache+Frisch).
 *
 * Performance-NFR: Resolver-Overhead pro Selection-Event <5ms.
 * Since the Resolver is synchronous and does no I/O, this is a
 * non-issue beyond avoiding heavy computation in getSettingsSnapshot.
 */

function snapshot(overrides: Partial<InlineSettingsSnapshot> = {}): InlineSettingsSnapshot {
    return {
        modelId: 'claude-haiku-4-5',
        provider: 'anthropic',
        skillIds: [],
        customPromptIds: [],
        ...overrides,
    };
}

describe('InlineTriggerResolver', () => {
    it('builds a valid InlineTriggerContext from a selection-event tuple', () => {
        const getSnapshot = vi.fn(() => snapshot());
        const resolver = new InlineTriggerResolver({ getSettingsSnapshot: getSnapshot });

        const ctx = resolver.resolveFromSelection({
            selectionText: 'highlight me',
            editorMode: 'source',
            cursorPos: 42,
            notePath: 'Notes/foo.md',
        });

        expect(isInlineTriggerContext(ctx)).toBe(true);
        expect(ctx.selectionText).toBe('highlight me');
        expect(ctx.editorMode).toBe('source');
        expect(ctx.cursorPos).toBe(42);
        expect(ctx.notePath).toBe('Notes/foo.md');
    });

    it('reads the settings snapshot via the callback exactly once per trigger', () => {
        const getSnapshot = vi.fn(() => snapshot());
        const resolver = new InlineTriggerResolver({ getSettingsSnapshot: getSnapshot });

        resolver.resolveFromSelection({
            selectionText: 'x',
            editorMode: 'live-preview',
            cursorPos: 0,
            notePath: 'a.md',
        });

        expect(getSnapshot).toHaveBeenCalledTimes(1);
    });

    it('embeds the snapshot returned by the callback into the context', () => {
        const customSnap = snapshot({
            modelId: 'gpt-5.2',
            provider: 'openai',
            skillIds: ['skill-a', 'skill-b'],
            customPromptIds: ['prompt-1'],
        });
        const getSnapshot = vi.fn(() => customSnap);
        const resolver = new InlineTriggerResolver({ getSettingsSnapshot: getSnapshot });

        const ctx = resolver.resolveFromSelection({
            selectionText: 'x',
            editorMode: 'source',
            cursorPos: 0,
            notePath: 'a.md',
        });

        expect(ctx.settingsSnapshot.modelId).toBe('gpt-5.2');
        expect(ctx.settingsSnapshot.provider).toBe('openai');
        expect(ctx.settingsSnapshot.skillIds).toEqual(['skill-a', 'skill-b']);
        expect(ctx.settingsSnapshot.customPromptIds).toEqual(['prompt-1']);
    });

    it('accepts empty selection (hotkey-without-selection case)', () => {
        const resolver = new InlineTriggerResolver({ getSettingsSnapshot: () => snapshot() });

        const ctx = resolver.resolveFromSelection({
            selectionText: '',
            editorMode: 'source',
            cursorPos: 100,
            notePath: 'a.md',
        });

        expect(isInlineTriggerContext(ctx)).toBe(true);
        expect(ctx.selectionText).toBe('');
    });

    it('builds independent contexts per call (no shared state)', () => {
        const resolver = new InlineTriggerResolver({ getSettingsSnapshot: () => snapshot() });

        const ctx1 = resolver.resolveFromSelection({
            selectionText: 'first',
            editorMode: 'source',
            cursorPos: 10,
            notePath: 'a.md',
        });
        const ctx2 = resolver.resolveFromSelection({
            selectionText: 'second',
            editorMode: 'reading',
            cursorPos: 20,
            notePath: 'b.md',
        });

        expect(ctx1.selectionText).toBe('first');
        expect(ctx2.selectionText).toBe('second');
        expect(ctx1.notePath).toBe('a.md');
        expect(ctx2.notePath).toBe('b.md');
    });
});
