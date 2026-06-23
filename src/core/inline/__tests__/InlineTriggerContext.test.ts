import { describe, it, expect } from 'vitest';
import { isInlineTriggerContext, type InlineTriggerContext } from '../InlineTriggerContext';

/**
 * Tests for InlineTriggerContext (FEAT-33-01 TR-1.1, EPIC-33).
 *
 * The TriggerContext is the shared input every Inline-Action receives.
 * It is built once by the InlineTriggerResolver when a selection event
 * fires, then passed unchanged to every action dispatcher.
 *
 * Required fields per ADR-138 + FEAT-33-01 spec:
 *   - selectionText: user-selected text (non-empty for action-triggers)
 *   - editorMode: 'source' | 'live-preview' | 'reading'
 *   - cursorPos: char-offset in the note buffer
 *   - notePath: vault-relative file path
 *   - settingsSnapshot: model/skills/prompts/provider at trigger-time
 */

describe('InlineTriggerContext', () => {
    it('isInlineTriggerContext accepts a minimal valid context', () => {
        const ctx: InlineTriggerContext = {
            selectionText: 'some text',
            editorMode: 'source',
            cursorPos: 42,
            notePath: 'Notes/foo.md',
            settingsSnapshot: {
                modelId: 'claude-haiku-4-5',
                provider: 'anthropic',
                skillIds: [],
                customPromptIds: [],
            },
        };
        expect(isInlineTriggerContext(ctx)).toBe(true);
    });

    it('isInlineTriggerContext rejects non-objects', () => {
        expect(isInlineTriggerContext(null)).toBe(false);
        expect(isInlineTriggerContext(undefined)).toBe(false);
        expect(isInlineTriggerContext('not an object')).toBe(false);
        expect(isInlineTriggerContext(42)).toBe(false);
    });

    it('isInlineTriggerContext rejects missing required fields', () => {
        expect(isInlineTriggerContext({})).toBe(false);
        expect(isInlineTriggerContext({ selectionText: 'x' })).toBe(false);
        expect(isInlineTriggerContext({
            selectionText: 'x',
            editorMode: 'source',
            cursorPos: 0,
            notePath: 'a.md',
            // settingsSnapshot missing
        })).toBe(false);
    });

    it('isInlineTriggerContext rejects invalid editor modes', () => {
        expect(isInlineTriggerContext({
            selectionText: 'x',
            editorMode: 'not-a-mode',
            cursorPos: 0,
            notePath: 'a.md',
            settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        })).toBe(false);
    });

    it('accepts all three valid editor modes', () => {
        const base = {
            selectionText: 'x',
            cursorPos: 0,
            notePath: 'a.md',
            settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        };
        expect(isInlineTriggerContext({ ...base, editorMode: 'source' })).toBe(true);
        expect(isInlineTriggerContext({ ...base, editorMode: 'live-preview' })).toBe(true);
        expect(isInlineTriggerContext({ ...base, editorMode: 'reading' })).toBe(true);
    });

    it('accepts empty selection text (some actions can run without selection)', () => {
        // The Resolver may build a context with empty selection for
        // hotkey-without-selection cases (open menu, then user picks
        // an action that does not require a selection).
        const ctx: InlineTriggerContext = {
            selectionText: '',
            editorMode: 'source',
            cursorPos: 0,
            notePath: 'a.md',
            settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        };
        expect(isInlineTriggerContext(ctx)).toBe(true);
    });
});
