/**
 * Regression-tests for FIX-29-99-04 adapter that folds plan_presentation
 * DeckPlan slides into the flat adhoc shape CreatePptxTool's renderer
 * understands. Without the adapter the agent had to manually rewrite
 * every slide before passing it to create_pptx; with the adapter, the
 * plan output can be copied verbatim.
 *
 * Tests run against the adapter in isolation (no real PptxGenJS, no
 * vault writes) so they can pin the heuristic without booting the
 * full Obsidian sandbox.
 */

import { describe, it, expect } from 'vitest';
import { CreatePptxTool } from '../CreatePptxTool';

// Reach the otherwise-private adapter without exposing it publicly.
type AnySlide = Record<string, unknown>;
function adapt(slide: AnySlide): AnySlide {
    const tool = Object.create(CreatePptxTool.prototype) as unknown as {
        adaptDeckPlanSlide(s: AnySlide): AnySlide;
    };
    return tool.adaptDeckPlanSlide(slide);
}

describe('CreatePptxTool.adaptDeckPlanSlide (FIX-29-99-04)', () => {
    it('passes adhoc-shaped slides through untouched', () => {
        const input = { title: 'Hi', bullets: ['a', 'b'], layout: 'content' };
        const out = adapt(input);
        expect(out).toEqual(input);
    });

    it('extracts title from Title / Headline / Heading shape names', () => {
        for (const key of ['Title', 'Headline', 'Heading', 'Slide_Title']) {
            const out = adapt({ source_slide: 1, content: { [key]: 'Mapped Title' } });
            expect(out.title).toBe('Mapped Title');
        }
    });

    it('extracts subtitle from Subtitle / Subheadline shape names', () => {
        for (const key of ['Subtitle', 'Subheadline', 'Sub_Title']) {
            const out = adapt({ source_slide: 1, content: { [key]: 'Mapped Subtitle' } });
            expect(out.subtitle).toBe('Mapped Subtitle');
        }
    });

    it('collects all Bullet* keys (sorted) into the bullets array', () => {
        const out = adapt({
            source_slide: 3,
            content: {
                Bullet3: 'third',
                Bullet1: 'first',
                Bullet2: 'second',
                Other: 'ignored-for-bullets',
            },
        });
        expect(out.bullets).toEqual(['first', 'second', 'third']);
    });

    it('extracts body from Body / Content / Description', () => {
        for (const key of ['Body', 'Content', 'Description']) {
            const out = adapt({ source_slide: 1, content: { [key]: 'Para text' } });
            expect(out.body).toBe('Para text');
        }
    });

    it('falls back to joined remaining string values when no explicit body shape exists', () => {
        // No Body/Content/Description key; remaining strings get joined so the
        // renderer at least surfaces the planner's text instead of an empty slide.
        const out = adapt({
            source_slide: 5,
            content: {
                Title: 'My Title',
                Quote: 'Steve said this',
                Caption: 'Source: HBR 2026',
            },
        });
        expect(out.title).toBe('My Title');
        expect(out.body).toContain('Steve said this');
        expect(out.body).toContain('Source: HBR 2026');
    });

    it('never overwrites a field the caller supplied explicitly', () => {
        const out = adapt({
            source_slide: 1,
            title: 'Caller wins',
            content: { Title: 'Adapter would have written this' },
        });
        expect(out.title).toBe('Caller wins');
    });

    it('returns the slide unchanged when neither source_slide nor content is present', () => {
        const slide = { title: 'plain', layout: 'title' };
        expect(adapt(slide)).toBe(slide);
    });
});
