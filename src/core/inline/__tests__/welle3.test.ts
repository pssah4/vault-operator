import { describe, it, expect, vi } from 'vitest';
import { PerActionPin } from '../settings/PerActionPin';
import { FindActionItemsAction } from '../actions/FindActionItemsAction';
import type { InlineLLMCaller, InlineLLMStreamCallbacks } from '../InlineLLMCaller';
import type { InlineTriggerContext } from '../InlineTriggerContext';

describe('PerActionPin', () => {
    it('returns null when no pins are set', () => {
        const pin = new PerActionPin({ getPins: () => ({}) });
        expect(pin.getModelOverride('lookup')).toBeNull();
    });

    it('returns null when pins source is undefined', () => {
        const pin = new PerActionPin({ getPins: () => undefined });
        expect(pin.getModelOverride('lookup')).toBeNull();
    });

    it('returns the pinned model id when set', () => {
        const pin = new PerActionPin({ getPins: () => ({ lookup: 'claude-haiku-4-5' }) });
        expect(pin.getModelOverride('lookup')).toBe('claude-haiku-4-5');
    });

    it('returns null for explicit null pin', () => {
        const pin = new PerActionPin({ getPins: () => ({ lookup: null }) });
        expect(pin.getModelOverride('lookup')).toBeNull();
    });

    it('returns null for empty-string pin (treats as cleared)', () => {
        const pin = new PerActionPin({ getPins: () => ({ lookup: '' }) });
        expect(pin.getModelOverride('lookup')).toBeNull();
    });

    it('reads pins via live callback (changes take effect)', () => {
        let pins: Record<string, string | null> = { lookup: 'a' };
        const pin = new PerActionPin({ getPins: () => pins });
        expect(pin.getModelOverride('lookup')).toBe('a');
        pins = { lookup: 'b' };
        expect(pin.getModelOverride('lookup')).toBe('b');
    });
});

describe('FindActionItemsAction', () => {
    function ctx(text = 'Meeting notes: TODO call alice; decide on stack'): InlineTriggerContext {
        return {
            selectionText: text,
            editorMode: 'source',
            cursorPos: 0,
            notePath: 'a.md',
            settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        };
    }
    function makeCb() { return { onText: vi.fn(), onToolStart: vi.fn(), onToolResult: vi.fn(), onComplete: vi.fn(), onError: vi.fn() } as any; }
    function makeCaller(): InlineLLMCaller & { stream: ReturnType<typeof vi.fn> } {
        return {
            stream: vi.fn(async (_a, cbs: InlineLLMStreamCallbacks) => {
                cbs.onText('- [ ] Call Alice\n- [ ] Decide on stack');
                cbs.onComplete();
            }),
        } as any;
    }

    it('has stable id and label', () => {
        const a = new FindActionItemsAction({ caller: makeCaller() });
        expect(a.id).toBe('find-action-items');
        expect(a.label).toBe('Find action items');
    });

    it('eligible with non-empty selection in any editor mode', () => {
        const a = new FindActionItemsAction({ caller: makeCaller() });
        expect(a.isEligible(ctx())).toBe(true);
        expect(a.isEligible({ ...ctx(), editorMode: 'reading' })).toBe(true);
    });

    it('NOT eligible with empty selection', () => {
        const a = new FindActionItemsAction({ caller: makeCaller() });
        expect(a.isEligible({ ...ctx(), selectionText: '' })).toBe(false);
    });

    it('passes the selection into the user message', async () => {
        const caller = makeCaller();
        const a = new FindActionItemsAction({ caller });
        await a.execute(ctx('Decide pricing'), makeCb());
        const args = caller.stream.mock.calls[0][0];
        expect(args.userMessage).toContain('Decide pricing');
        expect(args.systemPrompt).toContain('action items');
    });
});
