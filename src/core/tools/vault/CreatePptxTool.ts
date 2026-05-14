/**
 * CreatePptxTool
 *
 * Creates a PowerPoint presentation (.pptx) with slides containing text, bullets, tables, and images.
 * Format knowledge lives in TypeScript code -- the LLM only provides
 * high-level input (slide content, theme). The tool handles layout and
 * formatting programmatically using pptxgenjs.
 *
 * v3 (2026-03-23): Reverted to simple PptxGenJS builder after 50+ failed iterations
 * with pptx-automizer template cloning (ADR-032 to ADR-049). Template corporate design
 * is applied via theme parameters (colors, fonts), not via PPTX cloning.
 *
 * Improvements over dev baseline:
 * - 16:9 widescreen layout (10" x 5.625")
 * - fit: 'shrink' on all text elements (PowerPoint auto-shrinks on open)
 * - margin/padding on text boxes
 * - lineSpacingMultiple for readable body text
 * - shadow on shapes for professional depth
 * - compression for smaller file size
 * - Extended theme support (background, accent, text colors)
 * - Layout types: title, section, content, closing
 */

import type PptxGenJS from 'pptxgenjs';
import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { writeBinaryToVault } from './writeBinaryToVault';

/* ------------------------------------------------------------------ */
/*  Layout constants (16:9 widescreen)                                 */
/* ------------------------------------------------------------------ */

const SLIDE_W = 10;       // inches
const SLIDE_H = 5.625;    // inches (16:9)
const MARGIN = 0.5;       // inches
const TITLE_Y = 0.3;
const TITLE_H = 0.8;
const CONTENT_Y = 1.3;
const CONTENT_H = SLIDE_H - CONTENT_Y - MARGIN;
const CONTENT_W = SLIDE_W - MARGIN * 2;

const DEFAULT_FONT = 'Calibri';
const DEFAULT_PRIMARY = '1a73e8';
const DEFAULT_TEXT = '333333';

/* ------------------------------------------------------------------ */
/*  Input interfaces                                                   */
/* ------------------------------------------------------------------ */

interface SlideInput {
    title?: string;
    subtitle?: string;
    body?: string;
    bullets?: string[];
    table?: {
        headers?: string[];
        rows?: (string | number | null)[][];
    };
    image?: string;
    notes?: string;
    layout?: 'title' | 'section' | 'content' | 'two-column' | 'closing';
}

interface ThemeInput {
    primary_color?: string;
    font_family?: string;
    background_color?: string;
    text_color?: string;
    accent_color?: string;
}

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function toHex(color?: string, fallback = DEFAULT_PRIMARY): string {
    if (!color) return fallback;
    const trimmed = color.trim().replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
    return fallback;
}

/* ------------------------------------------------------------------ */
/*  Tool class                                                         */
/* ------------------------------------------------------------------ */

export class CreatePptxTool extends BaseTool<'create_pptx'> {
    readonly name = 'create_pptx' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'create_pptx',
            description:
                'Create a PowerPoint presentation (.pptx) with slides containing text, bullets, tables, and images. ' +
                'The file format is handled automatically -- never use write_file or evaluate_expression for .pptx files. ' +
                'Supports themed presentations with auto-layout. ' +
                'For corporate design: use theme colors/fonts from ingest_template.',
            input_schema: {
                type: 'object',
                properties: {
                    output_path: {
                        type: 'string',
                        description: 'Path for the presentation file (must end with .pptx)',
                    },
                    slides: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string', description: 'Slide title' },
                                subtitle: { type: 'string', description: 'Subtitle (title/section slides only)' },
                                body: { type: 'string', description: 'Body paragraph text' },
                                bullets: { type: 'array', items: { type: 'string' }, description: 'Bullet points' },
                                table: {
                                    type: 'object',
                                    properties: {
                                        headers: { type: 'array', items: { type: 'string' } },
                                        rows: { type: 'array', items: { type: 'array', items: {} } },
                                    },
                                },
                                image: { type: 'string', description: 'Vault path to image' },
                                notes: { type: 'string', description: 'Speaker notes' },
                                layout: { type: 'string', enum: ['title', 'section', 'content', 'closing'] },
                            },
                        },
                        description: 'Array of slides (max 50)',
                    },
                    title: { type: 'string', description: 'Presentation title' },
                    theme: {
                        type: 'object',
                        properties: {
                            primary_color: { type: 'string', description: 'Primary color hex' },
                            font_family: { type: 'string', description: 'Font family' },
                            background_color: { type: 'string', description: 'Background hex' },
                            text_color: { type: 'string', description: 'Text color hex' },
                            accent_color: { type: 'string', description: 'Accent color hex' },
                        },
                    },
                },
                required: ['output_path', 'slides'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const outputPath = ((input.output_path as string) ?? '').trim();
        const rawSlides = Array.isArray(input.slides) ? (input.slides as SlideInput[]) : [];
        const presTitle = ((input.title as string) ?? '').trim();
        const theme = (input.theme as ThemeInput) ?? {};

        if (!outputPath) { callbacks.pushToolResult(this.formatError(new Error('output_path is required'))); return; }
        if (!outputPath.endsWith('.pptx')) { callbacks.pushToolResult(this.formatError(new Error('output_path must end with .pptx'))); return; }
        if (rawSlides.length === 0) { callbacks.pushToolResult(this.formatError(new Error('At least one slide is required'))); return; }

        const slides = rawSlides.slice(0, 50);
        const primary = toHex(theme.primary_color);
        const accent = toHex(theme.accent_color, primary);
        const textColor = toHex(theme.text_color, DEFAULT_TEXT);
        const font = theme.font_family?.trim() || DEFAULT_FONT;

        const office = await this.plugin.bundleLoader?.loadOfficeBundle();
        if (!office) {
            callbacks.pushToolResult(this.formatError(new Error(
                'Office Document Support is not installed. ' +
                'Open Settings > Vault Operator > Optional Assets to install (~1.5 MB), ' +
                'then retry this tool. The plugin works without it but cannot create pptx files.'
            )));
            return;
        }
        const PptxGenJSCtor = office.PptxGenJS;

        try {
            const pres = new PptxGenJSCtor();
            pres.defineLayout({ name: 'WIDE', width: SLIDE_W, height: SLIDE_H });
            pres.layout = 'WIDE';
            if (presTitle) pres.title = presTitle;
            pres.author = 'Vault Operator';

            for (const si of slides) {
                const slide = pres.addSlide();
                if (si.notes) slide.addNotes(si.notes);

                const layout = si.layout || this.inferLayout(si);
                switch (layout) {
                    case 'title': this.buildTitle(slide, si, primary, font); break;
                    case 'section': this.buildSection(slide, si, primary, font); break;
                    case 'closing': this.buildClosing(slide, si, primary, font); break;
                    default: await this.buildContent(slide, si, primary, accent, textColor, font);
                }
            }

            const buf = await pres.write({ outputType: 'arraybuffer', compression: true }) as ArrayBuffer;
            const result = await writeBinaryToVault(this.app.vault, outputPath, buf, '.pptx');
            const sizeKB = Math.round(result.size / 1024);

            callbacks.pushToolResult(
                `${result.created ? 'Created' : 'Updated'} **${outputPath}**\n` +
                `- ${slides.length} slides (16:9)\n` +
                `- Size: ${sizeKB} KB\n` +
                `\nTipp: \`render_presentation\` aufrufen um das Ergebnis visuell zu pruefen.`,
            );
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('create_pptx', error);
        }
    }

    private inferLayout(si: SlideInput): string {
        if (si.subtitle && !si.body && !si.bullets && !si.table) return 'title';
        return 'content';
    }

    /* -------------------------------------------------------------- */
    /*  Title slide (dark background)                                  */
    /* -------------------------------------------------------------- */
    private buildTitle(s: PptxGenJS.Slide, si: SlideInput, primary: string, font: string): void {
        s.background = { color: primary };
        if (si.title) s.addText(si.title, {
            x: MARGIN, y: 1.5, w: CONTENT_W, h: 1.5,
            fontSize: 36, fontFace: font, color: 'FFFFFF', bold: true,
            align: 'left', valign: 'bottom', fit: 'shrink', margin: [8, 12, 8, 12],
        });
        if (si.subtitle) s.addText(si.subtitle, {
            x: MARGIN, y: 3.2, w: CONTENT_W, h: 0.8,
            fontSize: 18, fontFace: font, color: 'CCCCCC',
            align: 'left', valign: 'top', margin: [4, 12, 4, 12],
        });
    }

    /* -------------------------------------------------------------- */
    /*  Section divider (dark background + accent bar)                 */
    /* -------------------------------------------------------------- */
    private buildSection(s: PptxGenJS.Slide, si: SlideInput, primary: string, font: string): void {
        s.background = { color: primary };
        s.addShape('rect', { x: 0, y: 3.2, w: 1.2, h: 0.08, fill: { color: 'F5A623' } });
        if (si.subtitle) s.addText(si.subtitle, {
            x: MARGIN, y: 1.5, w: 1.5, h: 1.5,
            fontSize: 72, fontFace: font, color: 'FFFFFF', bold: true, transparency: 30,
        });
        if (si.title) s.addText(si.title, {
            x: MARGIN, y: 3.5, w: CONTENT_W * 0.7, h: 1.2,
            fontSize: 32, fontFace: font, color: 'FFFFFF', bold: true,
            fit: 'shrink', margin: [8, 12, 8, 12],
        });
    }

    /* -------------------------------------------------------------- */
    /*  Closing slide                                                  */
    /* -------------------------------------------------------------- */
    private buildClosing(s: PptxGenJS.Slide, si: SlideInput, primary: string, font: string): void {
        s.background = { color: primary };
        if (si.title) s.addText(si.title, {
            x: MARGIN, y: 1.8, w: CONTENT_W, h: 1.5,
            fontSize: 32, fontFace: font, color: 'FFFFFF', bold: true,
            fit: 'shrink', margin: [8, 12, 8, 12],
        });
    }

    /* -------------------------------------------------------------- */
    /*  Content slide (light background)                               */
    /* -------------------------------------------------------------- */
    private async buildContent(
        s: PptxGenJS.Slide, si: SlideInput,
        primary: string, accent: string, textColor: string, font: string,
    ): Promise<void> {
        let y = CONTENT_Y;

        // Accent line
        s.addShape('rect', { x: 0, y: 0, w: SLIDE_W, h: 0.04, fill: { color: primary } });

        if (si.title) {
            s.addText(si.title, {
                x: MARGIN, y: TITLE_Y, w: CONTENT_W, h: TITLE_H,
                fontSize: 24, fontFace: font, color: primary, bold: true,
                valign: 'middle', fit: 'shrink', margin: [4, 8, 4, 8],
            });
        }

        if (si.body) {
            const h = this.estH(si.body, 16);
            s.addText(si.body, {
                x: MARGIN, y, w: CONTENT_W, h,
                fontSize: 16, fontFace: font, color: textColor,
                valign: 'top', wrap: true, fit: 'shrink',
                margin: [6, 8, 6, 8], lineSpacingMultiple: 1.2, paraSpaceAfter: 6,
            });
            y += h + 0.15;
        }

        if (si.bullets?.length) {
            const bH = Math.min(si.bullets.length * 0.45 + 0.3, CONTENT_H - (y - CONTENT_Y));
            s.addText(si.bullets.map(b => ({
                text: b,
                options: { fontSize: 15, fontFace: font, color: textColor, bullet: { type: 'bullet' as const, color: accent }, paraSpaceAfter: 6 },
            })), {
                x: MARGIN, y, w: CONTENT_W, h: bH,
                valign: 'top', fit: 'shrink', margin: [6, 8, 6, 12],
            });
            y += bH + 0.15;
        }

        if (si.table) this.addTable(s, si.table, y, primary, font, textColor);
        if (si.image) await this.addImage(s, si.image, y);
    }

    /* -------------------------------------------------------------- */
    /*  Table                                                          */
    /* -------------------------------------------------------------- */
    private addTable(
        s: PptxGenJS.Slide, t: NonNullable<SlideInput['table']>,
        y: number, primary: string, font: string, textColor: string,
    ): void {
        const rows: PptxGenJS.TableRow[] = [];
        if (t.headers?.length) {
            rows.push(t.headers.map(h => ({
                text: String(h),
                options: { bold: true, color: 'FFFFFF', fill: { color: primary }, fontSize: 13, fontFace: font, margin: [4, 6, 4, 6] as [number, number, number, number] },
            })));
        }
        if (t.rows) {
            for (let i = 0; i < t.rows.length; i++) {
                const zebra = i % 2 === 1 ? { fill: { color: 'F8FAFC' } } : {};
                rows.push(t.rows[i].map(c => ({
                    text: c != null ? String(c) : '',
                    options: { fontSize: 12, fontFace: font, color: textColor, margin: [3, 5, 3, 5] as [number, number, number, number], ...zebra },
                })));
            }
        }
        if (rows.length) {
            s.addTable(rows, {
                x: MARGIN, y, w: CONTENT_W,
                h: Math.min(rows.length * 0.35 + 0.2, SLIDE_H - y - MARGIN),
                border: { type: 'solid', pt: 0.5, color: 'E2E8F0' },
                colW: Array(rows[0].length).fill(CONTENT_W / rows[0].length),
                autoPage: true, autoPageRepeatHeader: true,
            });
        }
    }

    /* -------------------------------------------------------------- */
    /*  Image                                                          */
    /* -------------------------------------------------------------- */
    private async addImage(s: PptxGenJS.Slide, path: string, y: number): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                s.addText(`[Image not found: ${path}]`, { x: MARGIN, y, w: CONTENT_W, h: 1, fontSize: 14, color: '999999', italic: true });
                return;
            }
            const buffer = await this.app.vault.readBinary(file);
            const ext = file.extension.toLowerCase();
            const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml' };
            const uint8 = new Uint8Array(buffer);
            let bin = '';
            for (let i = 0; i < uint8.length; i++) bin += String.fromCharCode(uint8[i]);
            const rH = SLIDE_H - y - MARGIN;
            const iW = CONTENT_W - 2;
            const iH = Math.min(rH, 3.5);
            s.addImage({ data: `data:${mime[ext] ?? 'image/png'};base64,${btoa(bin)}`, x: MARGIN + 1, y, w: iW, h: iH, sizing: { type: 'contain', w: iW, h: iH } });
        } catch {
            s.addText(`[Error: ${path}]`, { x: MARGIN, y, w: CONTENT_W, h: 1, fontSize: 14, color: 'CC0000', italic: true });
        }
    }

    private estH(text: string, fs: number): number {
        const cpl = Math.floor((CONTENT_W * 72) / fs);
        const lines = text.split('\n').reduce((c, l) => c + Math.max(1, Math.ceil(l.length / cpl)), 0);
        return Math.min(Math.max(lines * (fs / 72) * 1.5, 0.8), CONTENT_H);
    }
}
