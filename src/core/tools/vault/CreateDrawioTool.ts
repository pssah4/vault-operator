/**
 * CreateDrawioTool
 *
 * Creates a Draw.io / diagrams.net flowchart file (.drawio) programmatically.
 * The format is hand-authored mxGraph XML wrapped in mxfile — the
 * drawio-obsidian (zapthedingbat) and obsidian-diagrams-net (jensmtg) plugins
 * both accept this format and open it for further editing.
 *
 * Why this exists: the LLM kept producing .drawio.svg via write_file with
 * hallucinated mxfile wrappers, and the plugin rejected the files as
 * "Not a diagram file" (BUG-018). This tool knows the valid minimum shape,
 * so the plugin opens the file cleanly.
 *
 * Supported: vertices (labeled boxes, colors, auto-layout in a column or row)
 * and edges (arrows between vertices). Advanced features (swimlanes, custom
 * shape libraries, layers) are out of scope for now — the user can extend
 * the diagram in the plugin's editor after opening the file.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

/* ------------------------------------------------------------------ */
/*  Input schema                                                      */
/* ------------------------------------------------------------------ */

interface DrawioNodeInput {
    /** Stable identifier the user references from edges. Required. */
    id: string;
    /** Text shown in the box. Required. */
    label: string;
    /** Color name or #hex. Optional — default blue. */
    color?: string;
    /** Shape style — default "rounded" rectangle. */
    shape?: 'rounded' | 'rectangle' | 'ellipse' | 'rhombus';
}

interface DrawioEdgeInput {
    /** Source node id. */
    from: string;
    /** Target node id. */
    to: string;
    /** Optional edge label (e.g. "yes" / "no" branches). */
    label?: string;
}

/* ------------------------------------------------------------------ */
/*  Color + style helpers                                             */
/* ------------------------------------------------------------------ */

const COLOR_MAP: Record<string, { fill: string; stroke: string }> = {
    blue:   { fill: '#dae8fc', stroke: '#6c8ebf' },
    green:  { fill: '#d5e8d4', stroke: '#82b366' },
    yellow: { fill: '#fff2cc', stroke: '#d6b656' },
    red:    { fill: '#f8cecc', stroke: '#b85450' },
    purple: { fill: '#e1d5e7', stroke: '#9673a6' },
    orange: { fill: '#ffe6cc', stroke: '#d79b00' },
    gray:   { fill: '#f5f5f5', stroke: '#666666' },
    cyan:   { fill: '#c5e7f5', stroke: '#4d9ab8' },
    white:  { fill: '#ffffff', stroke: '#000000' },
};

function resolveColors(name?: string): { fill: string; stroke: string } {
    if (!name) return COLOR_MAP.blue;
    const lower = name.toLowerCase();
    if (COLOR_MAP[lower]) return COLOR_MAP[lower];
    // Accept #hex — mxGraph accepts it directly, pair with a plain black stroke.
    if (/^#[0-9a-f]{3,8}$/i.test(name)) return { fill: name, stroke: '#000000' };
    return COLOR_MAP.blue;
}

function vertexStyle(shape: DrawioNodeInput['shape'], fill: string, stroke: string): string {
    const shapePart =
        shape === 'rectangle' ? 'rounded=0;whiteSpace=wrap;html=1;' :
        shape === 'ellipse' ? 'ellipse;whiteSpace=wrap;html=1;' :
        shape === 'rhombus' ? 'rhombus;whiteSpace=wrap;html=1;' :
        'rounded=1;whiteSpace=wrap;html=1;';
    return `${shapePart}fillColor=${fill};strokeColor=${stroke};fontSize=12;`;
}

const EDGE_STYLE =
    'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';

/* ------------------------------------------------------------------ */
/*  XML helpers                                                       */
/* ------------------------------------------------------------------ */

function xmlAttr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/* ------------------------------------------------------------------ */
/*  Layout                                                            */
/* ------------------------------------------------------------------ */

interface Position { x: number; y: number; width: number; height: number }

function layoutVertices(
    nodes: DrawioNodeInput[],
    layout: 'column' | 'row',
): Map<string, Position> {
    const BOX_W = 160;
    const BOX_H = 50;
    const GAP = 40;
    const positions = new Map<string, Position>();
    if (layout === 'row') {
        nodes.forEach((n, i) => {
            positions.set(n.id, { x: 80 + i * (BOX_W + GAP), y: 80, width: BOX_W, height: BOX_H });
        });
    } else {
        nodes.forEach((n, i) => {
            positions.set(n.id, { x: 160, y: 80 + i * (BOX_H + GAP), width: BOX_W, height: BOX_H });
        });
    }
    return positions;
}

/* ------------------------------------------------------------------ */
/*  .drawio.svg wrapper                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a Drawio-compatible SVG. The drawio-obsidian and obsidian-diagrams-net
 * plugins both look for a `content` attribute on the root <svg> element
 * containing the raw mxfile XML (leading `<`) — see
 * https://github.com/zapthedingbat/drawio-obsidian main.js `Editor.prototype.isDataSvg`.
 *
 * The SVG body itself is a static preview of the diagram so Obsidian's default
 * SVG renderer shows something useful without the plugin — boxes, labels and
 * arrows at their laid-out positions. The plugin overrides this when the user
 * opens the file for editing.
 */
function buildDrawioSvg(
    mxfileXml: string,
    nodes: DrawioNodeInput[],
    edges: DrawioEdgeInput[],
    positions: Map<string, Position>,
    idMap: Map<string, string>,
): string {
    // Page size — compute bounding box from positions so the SVG canvas
    // matches what the plugin will render.
    let maxX = 0;
    let maxY = 0;
    for (const pos of positions.values()) {
        maxX = Math.max(maxX, pos.x + pos.width + 40);
        maxY = Math.max(maxY, pos.y + pos.height + 40);
    }
    const width = Math.max(400, maxX);
    const height = Math.max(300, maxY);

    // Preview elements: rectangles + text for each node, lines for each edge.
    const svgParts: string[] = [];

    // Edges first so they sit behind boxes.
    for (const edge of edges) {
        if (!idMap.has(edge.from) || !idMap.has(edge.to)) continue;
        const src = positions.get(edge.from);
        const dst = positions.get(edge.to);
        if (!src || !dst) continue;
        const x1 = src.x + src.width / 2;
        const y1 = src.y + src.height;
        const x2 = dst.x + dst.width / 2;
        const y2 = dst.y;
        svgParts.push(
            `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#555" stroke-width="1.5" fill="none" marker-end="url(#obsilo-drawio-arrow)"/>`,
        );
        if (edge.label) {
            const lx = (x1 + x2) / 2;
            const ly = (y1 + y2) / 2;
            svgParts.push(
                `<text x="${lx}" y="${ly}" fill="#333" font-family="sans-serif" font-size="11" text-anchor="middle" dy="-4">${xmlAttr(edge.label)}</text>`,
            );
        }
    }

    for (const node of nodes) {
        const pos = positions.get(node.id);
        if (!pos) continue;
        const { fill, stroke } = resolveColors(node.color);
        const rx = node.shape === 'rectangle' ? 0 : node.shape === 'ellipse' ? pos.width / 2 : node.shape === 'rhombus' ? 0 : 8;
        const ry = node.shape === 'ellipse' ? pos.height / 2 : rx;
        if (node.shape === 'rhombus') {
            const cx = pos.x + pos.width / 2;
            const cy = pos.y + pos.height / 2;
            svgParts.push(
                `<polygon points="${cx},${pos.y} ${pos.x + pos.width},${cy} ${cx},${pos.y + pos.height} ${pos.x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
            );
        } else {
            svgParts.push(
                `<rect x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`,
            );
        }
        const cx = pos.x + pos.width / 2;
        const cy = pos.y + pos.height / 2 + 4;
        svgParts.push(
            `<text x="${cx}" y="${cy}" fill="#222" font-family="sans-serif" font-size="12" text-anchor="middle">${xmlAttr(node.label)}</text>`,
        );
    }

    // content attribute needs the raw mxfile XML with XML attribute escaping.
    const contentAttr = xmlAttr(mxfileXml);

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `
            + `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" `
            + `content="${contentAttr}">`,
        '<defs>',
        '<marker id="obsilo-drawio-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto">',
        '<path d="M 0 0 L 10 5 L 0 10 z" fill="#555"/>',
        '</marker>',
        '</defs>',
        `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
        svgParts.join(''),
        '</svg>',
    ].join('');
}

/* ------------------------------------------------------------------ */
/*  Tool class                                                        */
/* ------------------------------------------------------------------ */

export class CreateDrawioTool extends BaseTool<'create_drawio'> {
    readonly name = 'create_drawio' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'create_drawio',
            description:
                'Create a Draw.io / diagrams.net flowchart programmatically. Accepts both .drawio (pure mxfile XML) '
                + 'and .drawio.svg (SVG with embedded mxfile content-attribute — renders as an image preview in Obsidian '
                + 'and opens as an editable diagram in the drawio-obsidian / obsidian-diagrams-net plugin). '
                + 'Choose .drawio.svg when the user wants a visible diagram without enabling a plugin action; '
                + 'choose .drawio when the file is purely data. NEVER use write_file for either extension — '
                + 'the embedded metadata format is strict and write_file will reject it.',
            input_schema: {
                type: 'object',
                properties: {
                    output_path: {
                        type: 'string',
                        description: 'Path for the diagram file. Must end with .drawio OR .drawio.svg '
                            + '(e.g. "Diagrams/workflow.drawio.svg").',
                    },
                    nodes: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: 'Stable id referenced from edges.' },
                                label: { type: 'string', description: 'Text shown in the box.' },
                                color: { type: 'string', description: 'blue, green, yellow, red, purple, orange, gray, cyan, white, or #hex. Default: blue.' },
                                shape: { type: 'string', enum: ['rounded', 'rectangle', 'ellipse', 'rhombus'], description: 'Default: rounded.' },
                            },
                            required: ['id', 'label'],
                        },
                        description: 'Boxes in the flowchart (max 30).',
                    },
                    edges: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                from: { type: 'string', description: 'Source node id.' },
                                to: { type: 'string', description: 'Target node id.' },
                                label: { type: 'string', description: 'Optional edge label, e.g. "yes" / "no".' },
                            },
                            required: ['from', 'to'],
                        },
                        description: 'Arrows connecting the boxes.',
                    },
                    layout: {
                        type: 'string',
                        enum: ['column', 'row'],
                        description: '"column" (vertical, default) or "row" (horizontal).',
                    },
                },
                required: ['output_path', 'nodes'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const outputPath = ((input.output_path as string) ?? '').trim();
        const nodesRaw = Array.isArray(input.nodes) ? (input.nodes as DrawioNodeInput[]) : [];
        const edgesRaw = Array.isArray(input.edges) ? (input.edges as DrawioEdgeInput[]) : [];
        const layout: 'column' | 'row' = input.layout === 'row' ? 'row' : 'column';

        if (!outputPath) {
            callbacks.pushToolResult(this.formatError(new Error('output_path is required')));
            return;
        }
        const wantsSvg = /\.drawio\.svg$/i.test(outputPath);
        const wantsPureXml = /\.drawio$/i.test(outputPath);
        if (!wantsSvg && !wantsPureXml) {
            callbacks.pushToolResult(
                this.formatError(new Error('output_path must end with .drawio or .drawio.svg.')),
            );
            return;
        }
        if (nodesRaw.length === 0) {
            callbacks.pushToolResult(this.formatError(new Error('At least one node is required.')));
            return;
        }
        if (nodesRaw.length > 30) {
            callbacks.pushToolResult(this.formatError(new Error('Maximum 30 nodes per diagram — split larger flows into multiple files.')));
            return;
        }

        const nodes = nodesRaw.slice(0, 30);
        const nodeIds = new Set(nodes.map((n) => n.id));
        const edges = edgesRaw.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
        const droppedEdges = edgesRaw.length - edges.length;

        const positions = layoutVertices(nodes, layout);

        // ── Build mxGraphModel ──────────────────────────────────────────────
        // Cell id 0 is the graph root, id 1 is the default layer. User cells
        // start at id 2. Required structure — deviations break the plugin.
        const cellParts: string[] = [
            '<mxCell id="0" />',
            '<mxCell id="1" parent="0" />',
        ];

        let cellId = 2;
        const idMap = new Map<string, string>();

        for (const node of nodes) {
            const pos = positions.get(node.id)!;
            const { fill, stroke } = resolveColors(node.color);
            const style = vertexStyle(node.shape, fill, stroke);
            const mxId = String(cellId++);
            idMap.set(node.id, mxId);
            cellParts.push(
                `<mxCell id="${mxId}" value="${xmlAttr(node.label)}" style="${xmlAttr(style)}" vertex="1" parent="1">` +
                    `<mxGeometry x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" as="geometry" />` +
                    `</mxCell>`,
            );
        }

        for (const edge of edges) {
            const srcMx = idMap.get(edge.from);
            const dstMx = idMap.get(edge.to);
            if (!srcMx || !dstMx) continue;
            const mxId = String(cellId++);
            const labelAttr = edge.label ? ` value="${xmlAttr(edge.label)}"` : '';
            cellParts.push(
                `<mxCell id="${mxId}"${labelAttr} style="${xmlAttr(EDGE_STYLE)}" edge="1" source="${srcMx}" target="${dstMx}" parent="1">` +
                    `<mxGeometry relative="1" as="geometry" />` +
                    `</mxCell>`,
            );
        }

        const cells = cellParts.join('');
        const now = new Date().toISOString();

        // The pure .drawio payload (and also the content-attribute of the SVG wrapper).
        const mxfileXml = [
            `<mxfile host="Obsidian" modified="${now}" agent="vault-operator" version="1.0" type="device">`,
            '<diagram name="Page-1" id="obsilo-main">',
            '<mxGraphModel dx="900" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">',
            '<root>',
            cells,
            '</root>',
            '</mxGraphModel>',
            '</diagram>',
            '</mxfile>',
        ].join('');

        let fileContent: string;
        if (wantsSvg) {
            fileContent = buildDrawioSvg(mxfileXml, nodes, edges, positions, idMap);
        } else {
            fileContent = `<?xml version="1.0" encoding="UTF-8"?>${mxfileXml}`;
        }

        // ── Write via Obsidian API (binary-safe, path-validated) ───────────
        try {
            const existing = this.app.vault.getAbstractFileByPath(outputPath);
            if (existing) {
                // Overwrite
                const { TFile } = await import('obsidian');
                if (!(existing instanceof TFile)) {
                    throw new Error(`Path exists but is not a file: ${outputPath}`);
                }
                await this.app.vault.modify(existing, fileContent);
            } else {
                // Create
                const lastSlash = outputPath.lastIndexOf('/');
                if (lastSlash > 0) {
                    const dir = outputPath.slice(0, lastSlash);
                    await this.app.vault.createFolder(dir).catch(() => { /* already exists */ });
                }
                await this.app.vault.create(outputPath, fileContent);
            }

            const edgeHint = droppedEdges > 0
                ? ` (dropped ${droppedEdges} edge(s) with unknown node ids)`
                : '';
            callbacks.pushToolResult(
                this.formatSuccess(
                    `Created ${outputPath} with ${nodes.length} node(s) and ${edges.length} edge(s)${edgeHint}. ` +
                        `Open the file in Obsidian — the Diagrams plugin renders it automatically and lets the user extend the flow in the editor.`,
                ),
            );
        } catch (error) {
            await callbacks.handleError('create_drawio', error);
            callbacks.pushToolResult(this.formatError(error));
        }
    }
}
