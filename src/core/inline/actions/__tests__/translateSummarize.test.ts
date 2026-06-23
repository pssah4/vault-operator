import { describe, it, expect, vi } from 'vitest';
import { TranslateAction } from '../TranslateAction';
import { SummarizeAction } from '../SummarizeAction';
import type { InlineLLMCaller, InlineLLMStreamCallbacks } from '../../InlineLLMCaller';
import type { InlineTriggerContext } from '../../InlineTriggerContext';

function makeCtx(text = 'sample', overrides: Partial<InlineTriggerContext> = {}): InlineTriggerContext {
    return {
        selectionText: text,
        editorMode: 'source',
        cursorPos: 0,
        notePath: 'a.md',
        settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        ...overrides,
    };
}

function makeCb() { return { onText: vi.fn(), onToolStart: vi.fn(), onToolResult: vi.fn(), onComplete: vi.fn(), onError: vi.fn() } as any; }

function makeCaller(impl?: (args: any, cbs: InlineLLMStreamCallbacks) => Promise<void>) {
    return {
        stream: vi.fn(async (args: any, cbs: InlineLLMStreamCallbacks) => {
            if (impl !== undefined) await impl(args, cbs);
            else { cbs.onText('mock'); cbs.onComplete(); }
        }),
    } as InlineLLMCaller & { stream: ReturnType<typeof vi.fn> };
}

describe('TranslateAction', () => {
    it('id encodes the target language', () => {
        const a = new TranslateAction({ caller: makeCaller(), targetLanguage: 'German' });
        expect(a.id).toBe('translate:german');
    });

    it('label includes the target language', () => {
        const a = new TranslateAction({ caller: makeCaller(), targetLanguage: 'German' });
        expect(a.label).toBe('Translate to German');
    });

    it('eligible only with non-empty selection', () => {
        const a = new TranslateAction({ caller: makeCaller(), targetLanguage: 'German' });
        expect(a.isEligible(makeCtx('text'))).toBe(true);
        expect(a.isEligible(makeCtx(''))).toBe(false);
    });

    it('eligible in all editor modes', () => {
        const a = new TranslateAction({ caller: makeCaller(), targetLanguage: 'German' });
        expect(a.isEligible(makeCtx('x', { editorMode: 'reading' }))).toBe(true);
    });

    it('passes target language to LLM in user message', async () => {
        const caller = makeCaller();
        const a = new TranslateAction({ caller, targetLanguage: 'Italian' });
        await a.execute(makeCtx('Hello'), makeCb());
        const args = caller.stream.mock.calls[0][0];
        expect(args.userMessage).toContain('Italian');
        expect(args.userMessage).toContain('Hello');
    });
});

describe('SummarizeAction', () => {
    it('id encodes the length variant', () => {
        const a = new SummarizeAction({ caller: makeCaller(), length: 'short' });
        expect(a.id).toBe('summarize:short');
    });

    it('label includes the length', () => {
        const a = new SummarizeAction({ caller: makeCaller(), length: 'long' });
        expect(a.label).toBe('Summarize (long)');
    });

    it('NOT eligible in reading mode would still be eligible (read-only summarize is fine)', () => {
        const a = new SummarizeAction({ caller: makeCaller(), length: 'short' });
        expect(a.isEligible(makeCtx('x', { editorMode: 'reading' }))).toBe(true);
    });

    it('passes length instruction to LLM', async () => {
        const caller = makeCaller();
        const a = new SummarizeAction({ caller, length: 'short' });
        await a.execute(makeCtx('long passage about lambda calculus'), makeCb());
        const args = caller.stream.mock.calls[0][0];
        expect(args.userMessage.toLowerCase()).toContain('one or two sentence');
    });

    it('passes long-length instruction for length: long', async () => {
        const caller = makeCaller();
        const a = new SummarizeAction({ caller, length: 'long' });
        await a.execute(makeCtx('x'), makeCb());
        const args = caller.stream.mock.calls[0][0];
        expect(args.userMessage.toLowerCase()).toContain('paragraph');
    });
});
