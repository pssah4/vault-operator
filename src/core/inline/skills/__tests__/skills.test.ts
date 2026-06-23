import { describe, it, expect, vi } from 'vitest';
import { isInlineActionCapability } from '../inlineActionCapability';
import { InlineSkillFilter, type SkillEntry } from '../InlineSkillFilter';
import { InlineSkillAction } from '../InlineSkillAction';
import type { InlineTriggerContext } from '../../InlineTriggerContext';
import type { AgentTaskCallbacks } from '../../../AgentTask';

function makeCtx(text = 'sample'): InlineTriggerContext {
    return {
        selectionText: text,
        editorMode: 'source',
        cursorPos: 0,
        notePath: 'a.md',
        settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
    };
}

describe('isInlineActionCapability', () => {
    it('accepts minimal valid capability', () => {
        expect(isInlineActionCapability({
            eligible: true, output_mode: 'preview-block', input_format: 'markdown',
        })).toBe(true);
    });

    it('accepts max_selection_chars when number', () => {
        expect(isInlineActionCapability({
            eligible: true, output_mode: 'preview-block', input_format: 'markdown', max_selection_chars: 1000,
        })).toBe(true);
    });

    it('rejects invalid output_mode', () => {
        expect(isInlineActionCapability({
            eligible: true, output_mode: 'modal', input_format: 'markdown',
        })).toBe(false);
    });

    it('rejects invalid input_format', () => {
        expect(isInlineActionCapability({
            eligible: true, output_mode: 'preview-block', input_format: 'html',
        })).toBe(false);
    });

    it('rejects non-object input', () => {
        expect(isInlineActionCapability(null)).toBe(false);
        expect(isInlineActionCapability(undefined)).toBe(false);
        expect(isInlineActionCapability('x')).toBe(false);
    });
});

describe('InlineSkillFilter', () => {
    function probe(skills: SkillEntry[]) {
        return { listSkills: () => skills };
    }

    it('returns only skills with capability.eligible === true', () => {
        const skills: SkillEntry[] = [
            { id: 'a', label: 'A', capability: { eligible: true, output_mode: 'preview-block', input_format: 'markdown' } },
            { id: 'b', label: 'B', capability: { eligible: false, output_mode: 'preview-block', input_format: 'markdown' } },
            { id: 'c', label: 'C' }, // no capability
        ];
        const filter = new InlineSkillFilter({ probe: probe(skills) });
        const out = filter.filter(makeCtx());
        expect(out.map(s => s.id)).toEqual(['a']);
    });

    it('applies max_selection_chars limit', () => {
        const skills: SkillEntry[] = [
            { id: 'short', label: 'Short', capability: { eligible: true, output_mode: 'preview-block', input_format: 'markdown', max_selection_chars: 5 } },
            { id: 'long', label: 'Long', capability: { eligible: true, output_mode: 'preview-block', input_format: 'markdown', max_selection_chars: 100 } },
        ];
        const filter = new InlineSkillFilter({ probe: probe(skills) });
        const out = filter.filter(makeCtx('this is a long selection text'));
        expect(out.map(s => s.id)).toEqual(['long']);
    });

    it('honors TOP-N cap', () => {
        const skills: SkillEntry[] = Array.from({ length: 15 }, (_, i) => ({
            id: `s${i}`,
            label: `Skill ${i}`,
            capability: { eligible: true, output_mode: 'preview-block', input_format: 'markdown' } as const,
        }));
        const filter = new InlineSkillFilter({ probe: probe(skills), topN: 3 });
        expect(filter.filter(makeCtx())).toHaveLength(3);
    });

    it('topN: 0 returns empty list (hide skills entirely)', () => {
        const skills: SkillEntry[] = [
            { id: 'a', label: 'A', capability: { eligible: true, output_mode: 'preview-block', input_format: 'markdown' } },
        ];
        const filter = new InlineSkillFilter({ probe: probe(skills), topN: 0 });
        expect(filter.filter(makeCtx())).toEqual([]);
    });

    it('default topN is 10', () => {
        const skills: SkillEntry[] = Array.from({ length: 20 }, (_, i) => ({
            id: `s${i}`,
            label: `Skill ${i}`,
            capability: { eligible: true, output_mode: 'preview-block', input_format: 'markdown' } as const,
        }));
        const filter = new InlineSkillFilter({ probe: probe(skills) });
        expect(filter.filter(makeCtx())).toHaveLength(10);
    });
});

describe('InlineSkillAction', () => {
    function eligibleEntry(maxChars?: number): SkillEntry {
        return {
            id: 'my-skill',
            label: 'My Skill',
            description: 'Does X',
            capability: { eligible: true, output_mode: 'preview-block', input_format: 'markdown', max_selection_chars: maxChars },
        };
    }

    function makeCb(): AgentTaskCallbacks & { onComplete: ReturnType<typeof vi.fn>; onError: ReturnType<typeof vi.fn> } {
        return { onText: vi.fn(), onToolStart: vi.fn(), onToolResult: vi.fn(), onComplete: vi.fn(), onError: vi.fn() } as any;
    }

    it('prefixes id with "skill:" to avoid collision with built-ins', () => {
        const action = new InlineSkillAction({ entry: eligibleEntry(), invoker: vi.fn() });
        expect(action.id).toBe('skill:my-skill');
    });

    it('inherits label and description from the entry', () => {
        const action = new InlineSkillAction({ entry: eligibleEntry(), invoker: vi.fn() });
        expect(action.label).toBe('My Skill');
        expect(action.description).toBe('Does X');
    });

    it('isEligible returns false for skills with capability.eligible === false', () => {
        const entry: SkillEntry = { id: 'x', label: 'X', capability: { eligible: false, output_mode: 'preview-block', input_format: 'markdown' } };
        const action = new InlineSkillAction({ entry, invoker: vi.fn() });
        expect(action.isEligible(makeCtx())).toBe(false);
    });

    it('isEligible respects max_selection_chars', () => {
        const action = new InlineSkillAction({ entry: eligibleEntry(5), invoker: vi.fn() });
        expect(action.isEligible(makeCtx('ok'))).toBe(true);
        expect(action.isEligible(makeCtx('too long selection'))).toBe(false);
    });

    it('execute calls the invoker with entry, ctx, callbacks', async () => {
        const invoker = vi.fn(async () => {});
        const entry = eligibleEntry();
        const action = new InlineSkillAction({ entry, invoker });
        const ctx = makeCtx();
        const cb = makeCb();
        await action.execute(ctx, cb);
        expect(invoker).toHaveBeenCalledWith(entry, ctx, cb);
    });

    it('routes invoker errors to onError', async () => {
        const action = new InlineSkillAction({
            entry: eligibleEntry(),
            invoker: vi.fn(async () => { throw new Error('skill-fail'); }),
        });
        const cb = makeCb();
        await action.execute(makeCtx(), cb);
        expect(cb.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'skill-fail' }));
    });
});
