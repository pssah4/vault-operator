import { describe, it, expect } from 'vitest';
import { TemplateCatalogLoader } from '../TemplateCatalog';
import type { TemplateCatalog, SlideType, SlideTypeShape } from '../types';

// ------------------------------------------------------------------ //
//  Test-Fixtures                                                       //
// ------------------------------------------------------------------ //

function makeShape(overrides: Partial<SlideTypeShape> = {}): SlideTypeShape {
    return {
        name: 'Titel 1',
        role: 'title',
        content_type: 'text',
        required: true,
        ...overrides,
    };
}

function makeSlideType(overrides: Partial<SlideType> = {}): SlideType {
    return {
        id: 'titelfolie',
        layout_name: 'Titelfolie',
        representative_slide: 1,
        alternate_slides: [],
        description: 'Titel',
        shapes: [makeShape()],
        ...overrides,
    };
}

function makeCatalog(overrides: Partial<TemplateCatalog> = {}): TemplateCatalog {
    return {
        name: 'TestTemplate',
        version: '2026-03-22',
        slide_size: { width: 1280, height: 720 },
        layouts: {},
        slide_types: [makeSlideType()],
        total_slides: 20,
        ...overrides,
    };
}

// ------------------------------------------------------------------ //
//  formatSlideTypeGuide                                               //
// ------------------------------------------------------------------ //

describe('TemplateCatalogLoader.formatSlideTypeGuide', () => {

    describe('empty slide_types', () => {
        it('returns fallback message when slide_types is empty', () => {
            // FIX-29-99-04: pre-fix the message named the removed
            // `ingest_template` tool; assertion updated to the new
            // "feature deprecated, switch to default theme" guidance.
            const catalog = makeCatalog({ slide_types: [] });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('Keine Slide-Typen gefunden');
            expect(result).toContain('Default-Theme');
        });

        it('returns fallback message when slide_types is undefined', () => {
            const catalog = makeCatalog({ slide_types: undefined as unknown as SlideType[] });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('Keine Slide-Typen gefunden');
        });
    });

    describe('header line', () => {
        it('contains template name and slide count', () => {
            const catalog = makeCatalog({ name: 'EnBW Corporate', total_slides: 108 });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('EnBW Corporate');
            expect(result).toContain('108 Slides');
        });

        it('shows ? for total_slides when undefined', () => {
            const catalog = makeCatalog({ total_slides: undefined });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('?');
        });

        it('shows the correct slide_types count', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ id: 'a' }), makeSlideType({ id: 'b' })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('2 Slide-Typen');
        });
    });

    describe('slide type entries', () => {
        it('renders type id and representative slide', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ id: 'kpi-folie', representative_slide: 42 })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('### kpi-folie (Slide 42)');
        });

        it('renders description in bold', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ description: 'Titel + Untertitel' })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('**Titel + Untertitel**');
        });

        it('omits visual_description when not set', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ visual_description: undefined })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).not.toContain('Visual:');
        });

        it('renders visual_description when present', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ visual_description: 'Dunkle Folie mit Logo' })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('Visual: Dunkle Folie mit Logo');
        });

        it('renders use_when when present', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ use_when: 'Als Abschlussfolie' })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('Verwenden für: Als Abschlussfolie');
        });

        it('renders semantic family when present', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ semantic_family: 'process' })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('Familie: process');
        });

        it('renders warning flags in human-readable form', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ warning_flags: ['possible-style-guide', 'image-dependent'] })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('Achtung: wahrscheinlich Styleguide-/Regelfolie; benötigt echtes Bildmaterial');
        });
    });

    describe('alternate slides', () => {
        it('omits alternate suffix when alternate_slides is empty', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ representative_slide: 5, alternate_slides: [] })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('(Slide 5)');
            expect(result).not.toContain('auch:');
        });

        it('lists up to 5 alternate slides without truncation', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ representative_slide: 1, alternate_slides: [2, 3, 4, 5, 6] })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            // Exact 5 alternates: no ellipsis after the slide list
            expect(result).toContain('auch: 2, 3, 4, 5, 6)');
            expect(result).not.toContain('2, 3, 4, 5, 6 ...');
        });

        it('truncates alternate slides beyond 5 with ellipsis', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ representative_slide: 1, alternate_slides: [2, 3, 4, 5, 6, 7] })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('auch: 2, 3, 4, 5, 6 ...');
        });
    });

    describe('shapes', () => {
        it('renders REQUIRED for required shapes', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ shapes: [makeShape({ name: 'Titel 1', required: true })] })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('`Titel 1` [REQUIRED]');
        });

        it('renders optional for non-required shapes', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ shapes: [makeShape({ name: 'Untertitel 2', required: false })] })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('`Untertitel 2` [optional]');
        });

        it('appends max_chars when set', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ shapes: [makeShape({ name: 'Body', max_chars: 250 })] })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('(max 250 chars)');
        });

        it('omits max_chars suffix when not set', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ shapes: [makeShape({ name: 'Logo', max_chars: undefined })] })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).not.toContain('Zeichen');
        });

        it('uses ShapeName#N key for duplicate shapes (duplicate_index > 0)', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({
                    shapes: [makeShape({ name: 'KPI-Wert', duplicate_index: 2 })],
                })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('`KPI-Wert#2`');
        });

        it('uses plain ShapeName when duplicate_index is 0', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({
                    shapes: [makeShape({ name: 'KPI-Wert', duplicate_index: 0 })],
                })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('`KPI-Wert`');
            expect(result).not.toContain('KPI-Wert#');
        });

        it('uses plain ShapeName when duplicate_index is undefined', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({
                    shapes: [makeShape({ name: 'Titel 1', duplicate_index: undefined })],
                })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('`Titel 1`');
            expect(result).not.toContain('Titel 1#');
        });

        it('includes the shape role in output', () => {
            const catalog = makeCatalog({
                slide_types: [makeSlideType({ shapes: [makeShape({ role: 'kpi_value' })] })],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('kpi_value');
        });
    });

    describe('footer', () => {
        it('contains usage instructions', () => {
            const catalog = makeCatalog();
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            expect(result).toContain('"source_slide"');
            expect(result).toContain('REQUIRED');
            expect(result).toContain('Verwendung');
        });
    });

    describe('multiple slide types', () => {
        it('renders all slide types in order', () => {
            const catalog = makeCatalog({
                slide_types: [
                    makeSlideType({ id: 'titelfolie', representative_slide: 1 }),
                    makeSlideType({ id: 'kpi-folie', representative_slide: 5 }),
                    makeSlideType({ id: 'agenda', representative_slide: 3 }),
                ],
            });
            const result = TemplateCatalogLoader.formatSlideTypeGuide(catalog);
            const titlePos = result.indexOf('### titelfolie');
            const kpiPos = result.indexOf('### kpi-folie');
            const agendaPos = result.indexOf('### agenda');
            expect(titlePos).toBeLessThan(kpiPos);
            expect(kpiPos).toBeLessThan(agendaPos);
        });
    });
});
