import { describe, it, expect, vi } from 'vitest';
import { InlineActionRegistry, type InlineAction } from '../InlineActionRegistry';
import type { InlineTriggerContext } from '../InlineTriggerContext';

/**
 * Tests for InlineActionRegistry (FEAT-33-01 TR-1.3, EPIC-33).
 *
 * The Registry is the pluggable layer where each Inline-Action
 * (Lookup, Rewrite, Send-to-Main-Chat, Translate, ...) registers
 * itself. The Floating-Menu and Command-Palette read the registry
 * to enumerate eligible actions for the current TriggerContext.
 *
 * Actions filter via isEligible(ctx): some actions only work in
 * Source/Live-Preview (Rewrite, Inline-Chat), others work in
 * Reading-Mode too (Lookup, Send-to-Main, Translate).
 */

function makeAction(overrides: Partial<InlineAction> = {}): InlineAction {
    return {
        id: 'test-action',
        label: 'Test Action',
        isEligible: () => true,
        execute: vi.fn(async () => { /* no-op */ }),
        ...overrides,
    };
}

function makeCtx(overrides: Partial<InlineTriggerContext> = {}): InlineTriggerContext {
    return {
        selectionText: 'sample',
        editorMode: 'source',
        cursorPos: 0,
        notePath: 'a.md',
        settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        ...overrides,
    };
}

describe('InlineActionRegistry', () => {
    it('starts empty', () => {
        const reg = new InlineActionRegistry();
        expect(reg.listActions()).toHaveLength(0);
        expect(reg.getAction('any')).toBeUndefined();
    });

    it('registers and retrieves an action by id', () => {
        const reg = new InlineActionRegistry();
        const action = makeAction({ id: 'lookup', label: 'Lookup' });
        reg.register(action);

        expect(reg.getAction('lookup')).toBe(action);
        expect(reg.listActions()).toHaveLength(1);
    });

    it('rejects duplicate registration of the same id', () => {
        const reg = new InlineActionRegistry();
        reg.register(makeAction({ id: 'lookup' }));
        expect(() => reg.register(makeAction({ id: 'lookup' }))).toThrow(/already registered/i);
    });

    it('unregisters an action by id', () => {
        const reg = new InlineActionRegistry();
        reg.register(makeAction({ id: 'lookup' }));
        reg.unregister('lookup');
        expect(reg.getAction('lookup')).toBeUndefined();
        expect(reg.listActions()).toHaveLength(0);
    });

    it('unregister is idempotent for unknown ids', () => {
        const reg = new InlineActionRegistry();
        expect(() => reg.unregister('nope')).not.toThrow();
    });

    it('listActions returns insertion order (stable)', () => {
        const reg = new InlineActionRegistry();
        reg.register(makeAction({ id: 'a' }));
        reg.register(makeAction({ id: 'b' }));
        reg.register(makeAction({ id: 'c' }));
        expect(reg.listActions().map(a => a.id)).toEqual(['a', 'b', 'c']);
    });

    it('listActions filters by isEligible when context is provided', () => {
        const reg = new InlineActionRegistry();
        reg.register(makeAction({ id: 'rewrite', isEligible: (ctx) => ctx.editorMode !== 'reading' }));
        reg.register(makeAction({ id: 'lookup', isEligible: () => true }));

        const editing = reg.listActions(makeCtx({ editorMode: 'source' }));
        expect(editing.map(a => a.id)).toEqual(['rewrite', 'lookup']);

        const reading = reg.listActions(makeCtx({ editorMode: 'reading' }));
        expect(reading.map(a => a.id)).toEqual(['lookup']);
    });

    it('listActions without context returns ALL registered actions (no filter)', () => {
        const reg = new InlineActionRegistry();
        reg.register(makeAction({ id: 'rewrite', isEligible: () => false }));
        reg.register(makeAction({ id: 'lookup', isEligible: () => true }));
        expect(reg.listActions()).toHaveLength(2);
    });

    it('clear removes all actions', () => {
        const reg = new InlineActionRegistry();
        reg.register(makeAction({ id: 'a' }));
        reg.register(makeAction({ id: 'b' }));
        reg.clear();
        expect(reg.listActions()).toHaveLength(0);
    });
});
