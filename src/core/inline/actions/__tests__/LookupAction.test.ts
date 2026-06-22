import { describe, it, expect, vi } from 'vitest';
import { LookupAction, type VaultRagPipeline } from '../LookupAction';
import type { InlineLLMCaller, InlineLLMStreamCallbacks } from '../../InlineLLMCaller';
import type { InlineTriggerContext } from '../../InlineTriggerContext';
import type { AgentTaskCallbacks } from '../../../AgentTask';

function makeCtx(text = 'lambda calculus', overrides: Partial<InlineTriggerContext> = {}): InlineTriggerContext {
    return {
        selectionText: text,
        editorMode: 'source',
        cursorPos: 0,
        notePath: 'a.md',
        settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        ...overrides,
    };
}

function makeCallbacks(): AgentTaskCallbacks & { onText: ReturnType<typeof vi.fn>; onError: ReturnType<typeof vi.fn>; onComplete: ReturnType<typeof vi.fn> } {
    return {
        onText: vi.fn(),
        onToolStart: vi.fn(),
        onToolResult: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
    } as any;
}

function makeCaller(streamImpl?: (args: { systemPrompt: string; userMessage: string }, cbs: InlineLLMStreamCallbacks) => Promise<void>): InlineLLMCaller & { stream: ReturnType<typeof vi.fn> } {
    return {
        stream: vi.fn(async (args, cbs: InlineLLMStreamCallbacks) => {
            if (streamImpl !== undefined) {
                await streamImpl(args, cbs);
            } else {
                cbs.onText('Mock explanation.');
                cbs.onComplete();
            }
        }),
    } as any;
}

describe('LookupAction', () => {
    it('exposes stable id and label', () => {
        const action = new LookupAction({ caller: makeCaller() });
        expect(action.id).toBe('lookup');
        expect(action.label).toBe('Lookup');
    });

    it('is eligible when selection has text (any editor mode)', () => {
        const action = new LookupAction({ caller: makeCaller() });
        expect(action.isEligible(makeCtx('term'))).toBe(true);
        expect(action.isEligible(makeCtx('term', { editorMode: 'reading' }))).toBe(true);
        expect(action.isEligible(makeCtx('term', { editorMode: 'live-preview' }))).toBe(true);
    });

    it('is NOT eligible with empty / whitespace-only selection', () => {
        const action = new LookupAction({ caller: makeCaller() });
        expect(action.isEligible(makeCtx(''))).toBe(false);
        expect(action.isEligible(makeCtx('   '))).toBe(false);
    });

    it('calls the LLM caller with a system prompt and user message containing the selection', async () => {
        const caller = makeCaller();
        const action = new LookupAction({ caller });
        const cb = makeCallbacks();
        await action.execute(makeCtx('lambda calculus'), cb);
        const callArgs = caller.stream.mock.calls[0][0];
        expect(typeof callArgs.systemPrompt).toBe('string');
        expect(callArgs.systemPrompt.length).toBeGreaterThan(0);
        expect(callArgs.userMessage).toContain('lambda calculus');
    });

    it('forwards LLM text chunks to action callbacks', async () => {
        const caller = makeCaller(async (_args, cbs) => {
            cbs.onText('Hello ');
            cbs.onText('world.');
            cbs.onComplete();
        });
        const action = new LookupAction({ caller });
        const cb = makeCallbacks();
        await action.execute(makeCtx('x'), cb);
        expect(cb.onText).toHaveBeenCalledWith('Hello ');
        expect(cb.onText).toHaveBeenCalledWith('world.');
        expect(cb.onComplete).toHaveBeenCalledTimes(1);
    });

    it('routes LLM errors to onError', async () => {
        const caller = makeCaller(async (_a, cbs) => cbs.onError(new Error('llm-fail')));
        const action = new LookupAction({ caller });
        const cb = makeCallbacks();
        await action.execute(makeCtx('x'), cb);
        expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'llm-fail' }));
    });

    describe('Vault-RAG augmentation (FEAT-33-09)', () => {
        it('skips RAG when no pipeline is provided', async () => {
            const caller = makeCaller();
            const action = new LookupAction({ caller });
            await action.execute(makeCtx('x'), makeCallbacks());
            // System prompt should NOT contain the augmentation prefix.
            const sys = caller.stream.mock.calls[0][0].systemPrompt;
            expect(sys).not.toContain('vault contains the following relevant notes');
        });

        it('calls the pipeline when present', async () => {
            const pipeline: VaultRagPipeline = {
                augment: vi.fn(async () => ({
                    sources: [{ notePath: 'Notes/Lambda.md', excerpt: 'A foundational model of computation.', confidence: 0.82 }],
                    promptAugmentation: 'Note Lambda.md: A foundational model of computation.',
                })),
            };
            const caller = makeCaller();
            const action = new LookupAction({ caller, vaultRagPipeline: pipeline });
            const cb = makeCallbacks();
            await action.execute(makeCtx('lambda calculus'), cb);

            expect(pipeline.augment).toHaveBeenCalledWith(expect.objectContaining({
                selectionText: 'lambda calculus',
                confidenceThreshold: 0.7,
            }));
            const sys = caller.stream.mock.calls[0][0].systemPrompt;
            expect(sys).toContain('vault contains the following relevant notes');
            expect(sys).toContain('A foundational model of computation.');
        });

        it('prepends a sources header to the streamed text when settings enable it', async () => {
            const pipeline: VaultRagPipeline = {
                augment: vi.fn(async () => ({
                    sources: [{ notePath: 'Notes/Topic.md', excerpt: 'short excerpt', confidence: 0.9 }],
                    promptAugmentation: '...',
                })),
            };
            const caller = makeCaller();
            const action = new LookupAction({
                caller,
                vaultRagPipeline: pipeline,
                getRagSettings: () => ({ enabled: true, confidenceThreshold: 0.7, showSourcesInTooltip: true, topN: 5 }),
            });
            const cb = makeCallbacks();
            await action.execute(makeCtx('x'), cb);
            const firstText = (cb.onText as ReturnType<typeof vi.fn>).mock.calls[0][0];
            expect(firstText).toContain('From your vault:');
            expect(firstText).toContain('[[Notes/Topic]]');
        });

        it('omits source header when showSourcesInTooltip is false', async () => {
            const pipeline: VaultRagPipeline = {
                augment: vi.fn(async () => ({
                    sources: [{ notePath: 'Notes/Topic.md', excerpt: 'x', confidence: 0.9 }],
                    promptAugmentation: '...',
                })),
            };
            const caller = makeCaller();
            const action = new LookupAction({
                caller,
                vaultRagPipeline: pipeline,
                getRagSettings: () => ({ enabled: true, confidenceThreshold: 0.7, showSourcesInTooltip: false, topN: 5 }),
            });
            const cb = makeCallbacks();
            await action.execute(makeCtx('x'), cb);
            // The first onText call should be the LLM mock output, not a source header.
            const firstText = (cb.onText as ReturnType<typeof vi.fn>).mock.calls[0][0];
            expect(firstText).not.toContain('From your vault:');
        });

        it('skips RAG when settings.enabled is false', async () => {
            const pipeline: VaultRagPipeline = { augment: vi.fn() };
            const caller = makeCaller();
            const action = new LookupAction({
                caller,
                vaultRagPipeline: pipeline,
                getRagSettings: () => ({ enabled: false, confidenceThreshold: 0.7, showSourcesInTooltip: true, topN: 5 }),
            });
            await action.execute(makeCtx('x'), makeCallbacks());
            expect(pipeline.augment).not.toHaveBeenCalled();
        });

        it('falls back to LLM-only when pipeline.augment returns null', async () => {
            const pipeline: VaultRagPipeline = { augment: vi.fn(async () => null) };
            const caller = makeCaller();
            const action = new LookupAction({ caller, vaultRagPipeline: pipeline });
            const cb = makeCallbacks();
            await action.execute(makeCtx('x'), cb);
            const sys = caller.stream.mock.calls[0][0].systemPrompt;
            expect(sys).not.toContain('vault contains the following relevant notes');
            expect(cb.onError).not.toHaveBeenCalled();
        });

        it('falls back to LLM-only when pipeline.augment throws', async () => {
            const pipeline: VaultRagPipeline = { augment: vi.fn(async () => { throw new Error('embed-fail'); }) };
            const caller = makeCaller();
            const action = new LookupAction({ caller, vaultRagPipeline: pipeline });
            const cb = makeCallbacks();
            await action.execute(makeCtx('x'), cb);
            expect(cb.onError).not.toHaveBeenCalled();
            expect(cb.onComplete).toHaveBeenCalled();
        });
    });
});
