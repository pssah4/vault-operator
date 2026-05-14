/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * CreateExcalidrawTool
 *
 * Creates an Excalidraw drawing (.excalidraw.md) with labeled boxes.
 * Format knowledge lives in TypeScript code — the LLM only provides
 * high-level input (labels, colors, layout).
 *
 * Follows the same pattern as GenerateCanvasTool and CreateBaseTool:
 * the tool handles the complex file format programmatically so the
 * LLM never has to generate raw Excalidraw JSON.
 *
 * Supported elements: rectangles + text (no arrows — they require
 * complex point arrays with Bezier data).
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

/* ------------------------------------------------------------------ */
/*  Excalidraw element interfaces (subset needed for box + text)      */
/* ------------------------------------------------------------------ */

interface ExcalidrawBoundReference {
    id: string;
    type: 'arrow' | 'text';
}

interface ExcalidrawBaseElement {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
    strokeColor: string;
    backgroundColor: string;
    fillStyle: string;
    strokeWidth: number;
    strokeStyle: string;
    roughness: number;
    opacity: number;
    seed: number;
    version: number;
    versionNonce: number;
    isDeleted: boolean;
    groupIds: string[];
    frameId: null;
    roundness: { type: number } | null;
    boundElements: ExcalidrawBoundReference[] | null;
    updated: number;
    link: null;
    locked: boolean;
}

interface ExcalidrawRectangle extends ExcalidrawBaseElement {
    type: 'rectangle';
}

interface ExcalidrawText extends ExcalidrawBaseElement {
    type: 'text';
    fontSize: number;
    fontFamily: number;
    text: string;
    textAlign: string;
    verticalAlign: string;
    containerId: null;
    originalText: string;
    autoResize: boolean;
    lineHeight: number;
}

/**
 * Excalidraw arrow with endpoint bindings. Points are relative to (x, y):
 * first point is always [0, 0], subsequent points are offsets. With
 * startBinding / endBinding set, Excalidraw re-routes the arrow when the
 * bound rectangle is moved — the user can rearrange the layout in the
 * plugin and the arrows follow.
 */
interface ExcalidrawArrow extends ExcalidrawBaseElement {
    type: 'arrow';
    points: [number, number][];
    lastCommittedPoint: null;
    startBinding: { elementId: string; focus: number; gap: number } | null;
    endBinding: { elementId: string; focus: number; gap: number } | null;
    startArrowhead: 'arrow' | 'bar' | 'dot' | 'triangle' | null;
    endArrowhead: 'arrow' | 'bar' | 'dot' | 'triangle' | null;
    elbowed?: boolean;
}

type ExcalidrawElement = ExcalidrawRectangle | ExcalidrawText | ExcalidrawArrow;

interface ExcalidrawScene {
    type: 'excalidraw';
    version: number;
    elements: ExcalidrawElement[];
    appState: {
        viewBackgroundColor: string;
    };
}

/* ------------------------------------------------------------------ */
/*  Color palette: named colors → Excalidraw hex values               */
/* ------------------------------------------------------------------ */

const COLOR_PALETTE: Record<string, string> = {
    blue: '#a5d8ff',
    green: '#b2f2bb',
    yellow: '#ffec99',
    red: '#ffc9c9',
    purple: '#d0bfff',
    orange: '#ffd8a8',
    gray: '#dee2e6',
    grey: '#dee2e6',
    white: '#ffffff',
    cyan: '#99e9f2',
    pink: '#fcc2d7',
};

const DEFAULT_COLOR = '#a5d8ff'; // blue

function resolveColor(input?: string): string {
    if (!input) return DEFAULT_COLOR;
    const lower = input.toLowerCase().trim();
    if (COLOR_PALETTE[lower]) return COLOR_PALETTE[lower];
    if (/^#[0-9a-f]{6}$/i.test(lower)) return lower;
    return DEFAULT_COLOR;
}

/* ------------------------------------------------------------------ */
/*  Layout constants                                                  */
/* ------------------------------------------------------------------ */

const BOX_W = 240;
const BOX_H = 90;
const BOX_H_WITH_DESC = 120;
const GAP_X = 60;
const GAP_Y = 50;
const TITLE_FONT_SIZE = 24;
const LABEL_FONT_SIZE = 20;
const DESC_FONT_SIZE = 14;
const TITLE_MARGIN_BOTTOM = 40;

/* ------------------------------------------------------------------ */
/*  Input coercion                                                    */
/* ------------------------------------------------------------------ */

/**
 * Some LLMs (notably GPT/Copilot variants) stringify complex array inputs
 * even when the schema declares `type: "array"`. Accept both shapes so the
 * tool call does not hard-fail on a harmless format quirk.
 */
function coerceArrayInput(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch { /* not JSON -- fall through */ }
    }
    return [];
}

/* ------------------------------------------------------------------ */
/*  Element builders                                                  */
/* ------------------------------------------------------------------ */

let seedCounter = 1000;

function nextSeed(): number {
    return ++seedCounter;
}

function buildBaseProps(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    bgColor: string,
): Omit<ExcalidrawBaseElement, 'type'> {
    return {
        id,
        x,
        y,
        width: w,
        height: h,
        angle: 0,
        strokeColor: '#1e1e1e',
        backgroundColor: bgColor,
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 0,
        opacity: 100,
        seed: nextSeed(),
        version: 1,
        versionNonce: nextSeed(),
        isDeleted: false,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
    };
}

function buildRectangle(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    bgColor: string,
): ExcalidrawRectangle {
    return {
        ...buildBaseProps(id, x, y, w, h, bgColor),
        type: 'rectangle',
    };
}

function buildText(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    fontSize: number,
): ExcalidrawText {
    return {
        ...buildBaseProps(id, x, y, w, h, 'transparent'),
        type: 'text',
        strokeColor: '#1e1e1e',
        fontSize,
        fontFamily: 1,
        text,
        textAlign: 'center',
        verticalAlign: 'middle',
        containerId: null,
        originalText: text,
        autoResize: true,
        lineHeight: 1.25,
    };
}

/**
 * Build an Excalidraw arrow that connects two rectangles by id. Endpoint
 * bindings keep the arrow attached when the user moves the rectangles in
 * the plugin. Points are `[[0,0], [dx,dy]]` — Excalidraw's renderer
 * straightens / re-routes the line based on bindings and geometry.
 */
function buildArrow(
    id: string,
    fromRect: { id: string; x: number; y: number; width: number; height: number },
    toRect: { id: string; x: number; y: number; width: number; height: number },
): ExcalidrawArrow {
    const start = { x: fromRect.x + fromRect.width / 2, y: fromRect.y + fromRect.height };
    const end = { x: toRect.x + toRect.width / 2, y: toRect.y };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const base = buildBaseProps(id, start.x, start.y, Math.abs(dx) || 1, Math.abs(dy) || 1, 'transparent');
    return {
        ...base,
        type: 'arrow',
        roundness: { type: 2 },
        points: [[0, 0], [dx, dy]],
        lastCommittedPoint: null,
        startBinding: { elementId: fromRect.id, focus: 0, gap: 4 },
        endBinding: { elementId: toRect.id, focus: 0, gap: 4 },
        startArrowhead: null,
        endArrowhead: 'arrow',
    };
}

/* ------------------------------------------------------------------ */
/*  Tool class                                                        */
/* ------------------------------------------------------------------ */

/**
 * BUG-018: Plugin-IDs that supersede this built-in tool. When any of these is
 * enabled in the current vault, the description hard-redirects the model to
 * use the plugin via execute_command, because the plugin can do everything
 * this tool can plus arrows, freehand, custom layouts, palette, etc.
 */
const EXCALIDRAW_PLUGIN_IDS = ['obsidian-excalidraw-plugin'];

export class CreateExcalidrawTool extends BaseTool<'create_excalidraw'> {
    readonly name = 'create_excalidraw' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    /** True when the user has the Excalidraw community plugin installed AND enabled. */
    private isExcalidrawPluginEnabled(): boolean {
        const enabled = (this.plugin.app as unknown as {
            plugins?: { enabledPlugins?: Set<string> };
        }).plugins?.enabledPlugins;
        if (!enabled) return false;
        return EXCALIDRAW_PLUGIN_IDS.some((id) => enabled.has(id));
    }

    getDefinition(): ToolDefinition {
        const pluginActive = this.isExcalidrawPluginEnabled();
        const description = pluginActive
            ? 'DO NOT USE THIS TOOL. The user has the Excalidraw community plugin installed and enabled. ' +
                'Always use the plugin via execute_command (e.g. ' +
                'execute_command("obsidian-excalidraw-plugin:excalidraw-autocreate-newtab") or ' +
                'read the plugin skill file first to discover the right command). ' +
                'The plugin supports arrows, freehand, custom shapes, layers, and palette colors. ' +
                'This built-in tool only draws labeled rectangles and is reserved for vaults ' +
                'where the plugin is not installed.'
            : 'Create an Excalidraw drawing (.excalidraw.md) with labeled boxes and optional arrows between them. ' +
                'The file format is handled automatically — never use write_file for .excalidraw.md files. ' +
                'Supports colored boxes with labels, optional descriptions, and directed arrows that stay attached ' +
                'when the user moves boxes around. Reference boxes in arrows by their "id" field or by zero-based array index. ' +
                'Note: for freehand, custom shapes, or palette editing, ask the user to install the Excalidraw community ' +
                'plugin (id: obsidian-excalidraw-plugin), which is fully interactive.';
        return {
            name: 'create_excalidraw',
            description,
            input_schema: {
                type: 'object',
                properties: {
                    output_path: {
                        type: 'string',
                        description:
                            'Path for the drawing file (must end with .excalidraw.md, e.g. "Drawings/overview.excalidraw.md")',
                    },
                    elements: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: {
                                    type: 'string',
                                    description: 'Optional stable id referenced by arrows (e.g. "capture", "review"). Auto-generated if omitted.',
                                },
                                label: {
                                    type: 'string',
                                    description: 'Text displayed in the box',
                                },
                                color: {
                                    type: 'string',
                                    description:
                                        'Background color: blue, green, yellow, red, purple, orange, gray, cyan, pink, white, or hex (#a5d8ff). Default: blue.',
                                },
                                description: {
                                    type: 'string',
                                    description: 'Optional subtext below the label',
                                },
                            },
                            required: ['label'],
                        },
                        description: 'Array of boxes to draw (max 12)',
                    },
                    arrows: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                from: { type: 'string', description: 'Source box id (or its array index as a string, e.g. "0").' },
                                to: { type: 'string', description: 'Target box id (or its array index as a string).' },
                            },
                            required: ['from', 'to'],
                        },
                        description: 'Optional arrows connecting boxes. Reference boxes by their "id" field, or by zero-based array index as a string. Arrows stay attached when the user moves boxes in the Excalidraw editor.',
                    },
                    title: {
                        type: 'string',
                        description: 'Optional title text displayed above the boxes',
                    },
                    layout: {
                        type: 'string',
                        enum: ['grid', 'row'],
                        description: '"grid" (2 columns, default) or "row" (single horizontal row)',
                    },
                },
                required: ['output_path', 'elements'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const outputPath = ((input.output_path as string) ?? '').trim();
        const rawElements = coerceArrayInput(input.elements);
        const rawArrows = coerceArrayInput(input.arrows) as Array<{ from?: string; to?: string }>;
        const title = ((input.title as string) ?? '').trim();
        const layout: 'grid' | 'row' = input.layout === 'row' ? 'row' : 'grid';

        // Validation
        if (!outputPath) {
            callbacks.pushToolResult(this.formatError(new Error('output_path is required')));
            return;
        }
        if (!outputPath.endsWith('.excalidraw.md')) {
            callbacks.pushToolResult(
                this.formatError(new Error('output_path must end with .excalidraw.md')),
            );
            return;
        }
        if (rawElements.length === 0) {
            callbacks.pushToolResult(
                this.formatError(new Error('At least one element is required')),
            );
            return;
        }

        const elements = rawElements.slice(0, 12); // Cap at 12 boxes
        seedCounter = 1000; // Reset for deterministic output

        try {
            const sceneElements: ExcalidrawElement[] = [];
            let startY = 0;

            // Optional title
            if (title) {
                const titleW = Math.max(BOX_W * 2 + GAP_X, 400);
                sceneElements.push(
                    buildText('title', 0, 0, titleW, 40, title, TITLE_FONT_SIZE),
                );
                startY = TITLE_MARGIN_BOTTOM + 40;
            }

            // Layout boxes. Track rectangles so arrows can re-look them up
            // by user-provided id (BUG-018 Wave 2 arrows extension).
            const cols = layout === 'row' ? elements.length : 2;
            const rectsByUserId = new Map<string, { id: string; x: number; y: number; width: number; height: number }>();
            const rectsByIndex: typeof rectsByUserId extends Map<string, infer V> ? V[] : never = [];

            for (let i = 0; i < elements.length; i++) {
                const elem = (elements[i] ?? {}) as { id?: string; label?: string; color?: string; description?: string };
                const label: string = elem.label ?? `Box ${i + 1}`;
                const color = resolveColor(elem.color);
                const desc: string = (elem.description ?? '').trim();
                const hasDesc = desc.length > 0;

                const col = i % cols;
                const row = Math.floor(i / cols);
                const boxH = hasDesc ? BOX_H_WITH_DESC : BOX_H;
                const x = col * (BOX_W + GAP_X);
                const y = startY + row * (BOX_H_WITH_DESC + GAP_Y);

                const rectId = `rect-${i}`;
                const labelId = `label-${i}`;

                // Rectangle
                sceneElements.push(buildRectangle(rectId, x, y, BOX_W, boxH, color));
                const rectRef = { id: rectId, x, y, width: BOX_W, height: boxH };
                rectsByIndex.push(rectRef);
                const userId = typeof elem.id === 'string' && elem.id.trim().length > 0 ? elem.id.trim() : null;
                if (userId) rectsByUserId.set(userId, rectRef);

                if (hasDesc) {
                    // Label at top of box
                    sceneElements.push(
                        buildText(labelId, x, y + 8, BOX_W, 36, label, LABEL_FONT_SIZE),
                    );
                    // Description below
                    sceneElements.push(
                        buildText(`desc-${i}`, x, y + 44, BOX_W, 60, desc, DESC_FONT_SIZE),
                    );
                } else {
                    // Centered label
                    sceneElements.push(
                        buildText(labelId, x, y, BOX_W, boxH, label, LABEL_FONT_SIZE),
                    );
                }
            }

            // Arrows (BUG-018 Wave 2). Resolve endpoint by user-id first,
            // fall back to numeric array index as a string. Arrows with
            // unknown endpoints are silently dropped but logged.
            let droppedArrows = 0;
            const resolveRef = (ref: string) => {
                const direct = rectsByUserId.get(ref);
                if (direct) return direct;
                const idx = Number.parseInt(ref, 10);
                if (Number.isFinite(idx) && idx >= 0 && idx < rectsByIndex.length) {
                    return rectsByIndex[idx];
                }
                return null;
            };

            for (let i = 0; i < rawArrows.length; i++) {
                const arrow = rawArrows[i];
                const from = typeof arrow.from === 'string' ? resolveRef(arrow.from) : null;
                const to = typeof arrow.to === 'string' ? resolveRef(arrow.to) : null;
                if (!from || !to || from === to) {
                    droppedArrows++;
                    continue;
                }
                const arrowId = `arrow-${i}`;
                sceneElements.push(buildArrow(arrowId, from, to));

                // Attach the arrow reference to each bound rectangle so
                // Excalidraw moves the arrow endpoints when the user drags
                // the boxes around.
                for (const el of sceneElements) {
                    if (el.type === 'rectangle' && (el.id === from.id || el.id === to.id)) {
                        const ref: ExcalidrawBoundReference = { id: arrowId, type: 'arrow' };
                        el.boundElements = el.boundElements ? [...el.boundElements, ref] : [ref];
                    }
                }
            }
            if (droppedArrows > 0) {
                callbacks.log(`create_excalidraw: dropped ${droppedArrows} arrow(s) with unknown endpoints`);
            }

            // Build scene
            const scene: ExcalidrawScene = {
                type: 'excalidraw',
                version: 2,
                elements: sceneElements,
                appState: {
                    viewBackgroundColor: '#ffffff',
                },
            };

            const json = JSON.stringify(scene, null, 2);

            // Build .excalidraw.md wrapper (Obsidian Excalidraw plugin format)
            const textElements = sceneElements
                .filter((el): el is ExcalidrawText => el.type === 'text')
                .map((el) => `${el.text} ^${el.id}`)
                .join('\n\n');

            const fileContent = [
                '---',
                '',
                'excalidraw-plugin: parsed',
                'tags: [excalidraw]',
                '',
                '---',
                '==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==',
                '',
                '# Excalidraw Data',
                '',
                '## Text Elements',
                textElements,
                '',
                '%%',
                '## Drawing',
                '```json',
                json,
                '```',
                '%%',
            ].join('\n');

            // Write file
            const existing = this.app.vault.getFileByPath(outputPath);
            if (existing) {
                await this.app.vault.modify(existing, fileContent);
            } else {
                const dir = outputPath.includes('/')
                    ? outputPath.split('/').slice(0, -1).join('/')
                    : null;
                if (dir) {
                    await this.app.vault.createFolder(dir).catch(() => { /* already exists */ });
                }
                await this.app.vault.create(outputPath, fileContent);
            }

            const arrowCount = sceneElements.filter((el) => el.type === 'arrow').length;
            callbacks.pushToolResult(
                `Excalidraw drawing created: **${outputPath}**\n` +
                `- ${elements.length} boxes\n` +
                (arrowCount > 0 ? `- ${arrowCount} arrows\n` : '') +
                (title ? `- Title: "${title}"\n` : '') +
                `- Layout: ${layout}\n\n` +
                `Open the file in Obsidian to view the drawing.`,
            );
            callbacks.log(
                `Created Excalidraw drawing: ${outputPath} (${elements.length} boxes, ${arrowCount} arrows)`,
            );
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('create_excalidraw', error);
        }
    }
}
