import { describe, it, expect, vi } from 'vitest';
import { RewriteAction } from '../RewriteAction';
import type { InlineLLMCaller, InlineLLMStreamCallbacks } from '../../InlineLLMCaller';
import type { InlineTriggerContext } from '../../InlineTriggerContext';
import type { AgentTaskCallbacks } from '../../../AgentTask';

function makeCtx(overrides: Partial<InlineTriggerContext> = {}): InlineTriggerContext {
    return {
        selectionText: 'The fox jumps.',
        editorMode: 'source',
        cursorPos: 0,
        notePath: 'a.md',
        settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        ...overrides,
    };
}

function makeCallbacks(): AgentTaskCallbacks & { onText: ReturnType<typeof vi.fn>; onComplete: ReturnType<typeof vi.fn>; onError: ReturnType<typeof vi.fn> } {
    return { onText: vi.fn(), onToolStart: vi.fn(), onToolResult: vi.fn(), onComplete: vi.fn(), onError: vi.fn() } as any;
}

function makeCaller(impl?: (args: any, cbs: InlineLLMStreamCallbacks) => Promise<void>): InlineLLMCaller & { stream: ReturnType<typeof vi.fn> } {
    return {
        stream: vi.fn(async (args, cbs: InlineLLMStreamCallbacks) => {
            if (impl !== undefined) {
                await impl(args, cbs);
            } else {
                cbs.onText('rewritten');
                cbs.onComplete();
            }
        }),
    } as any;
}

describe('RewriteAction', () => {
    it('exposes stable id and label', () => {
        const action = new RewriteAction({ caller: makeCaller() });
        expect(action.id).toBe('rewrite');
        expect(action.label).toBe('Rewrite');
    });

    it('is eligible in source and live-preview editor modes', () => {
        const action = new RewriteAction({ caller: makeCaller() });
        expect(action.isEligible(makeCtx({ editorMode: 'source' }))).toBe(true);
        expect(action.isEligible(makeCtx({ editorMode: 'live-preview' }))).toBe(true);
    });

    it('is NOT eligible in reading mode (read-only)', () => {
        const action = new RewriteAction({ caller: makeCaller() });
        expect(action.isEligible(makeCtx({ editorMode: 'reading' }))).toBe(false);
    });

    it('is NOT eligible with empty selection', () => {
        const action = new RewriteAction({ caller: makeCaller() });
        expect(action.isEligible(makeCtx({ selectionText: '' }))).toBe(false);
        expect(action.isEligible(makeCtx({ selectionText: '   ' }))).toBe(false);
    });

    it('passes the default instruction through to the LLM caller', async () => {
        const caller = makeCaller();
        const action = new RewriteAction({ caller });
        await action.execute(makeCtx(), makeCallbacks());
        const args = caller.stream.mock.calls[0][0];
        expect(args.userMessage).toContain('Improve this passage');
        expect(args.userMessage).toContain('The fox jumps.');
    });

    it('honors a custom default instruction', async () => {
        const caller = makeCaller();
        const action = new RewriteAction({ caller, defaultInstruction: 'Translate to German.' });
        await action.execute(makeCtx(), makeCallbacks());
        const args = caller.stream.mock.calls[0][0];
        expect(args.userMessage).toContain('Translate to German.');
    });

    it('forwards stream chunks and completion to action callbacks', async () => {
        const caller = makeCaller(async (_a, cbs) => {
            cbs.onText('foo');
            cbs.onText('bar');
            cbs.onComplete();
        });
        const action = new RewriteAction({ caller });
        const cb = makeCallbacks();
        await action.execute(makeCtx(), cb);
        expect(cb.onText).toHaveBeenCalledWith('foo');
        expect(cb.onText).toHaveBeenCalledWith('bar');
        expect(cb.onComplete).toHaveBeenCalledTimes(1);
    });

    it('routes errors via onError', async () => {
        const caller = makeCaller(async (_a, cbs) => cbs.onError(new Error('boom')));
        const action = new RewriteAction({ caller });
        const cb = makeCallbacks();
        await action.execute(makeCtx(), cb);
        expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    });
});
