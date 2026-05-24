/**
 * WriteFileTool - Write content to a file, creating it if needed
 *
 * This is a write operation, so:
 * - isWriteOperation = true
 * - Requires approval (Phase 2)
 * - Creates checkpoint (Phase 3)
 */

import { TFile, TFolder } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { getAgentFolderPath } from '../../utils/agentFolder';
import { refreshOpenMarkdownViewsFor } from '../../utils/refreshMarkdownView';

/**
 * BUG-018 follow-up: protected file extensions that the agent must NEVER
 * write directly. These are structured / binary / dual-format files that
 * other tools or plugins own. Letting the agent hallucinate the format
 * (esp. drawio.svg, excalidraw, office formats) produces files that look
 * right but are rejected by the consuming plugin or app.
 *
 * The error message points the agent at the right tool / plugin so it can
 * retry without bouncing through write_file again.
 */
const PROTECTED_FORMATS: { pattern: RegExp; redirect: string }[] = [
    {
        pattern: /\.drawio$/i,
        redirect: 'Drawio / Diagrams.net format. Use the built-in create_drawio tool — it emits a valid '
            + 'mxfile wrapper that the drawio-obsidian and obsidian-diagrams-net plugins accept and open '
            + 'for editing. write_file cannot hand-author the format reliably.',
    },
    {
        pattern: /\.drawio\.svg$/i,
        redirect: 'Drawio-SVG dual format. Use the built-in create_drawio tool with output_path ending in '
            + '.drawio.svg — the tool emits both the SVG preview and the embedded mxfile content-attribute '
            + 'correctly. write_file would ship a broken file that the plugin rejects with "Not a diagram file".',
    },
    {
        pattern: /\.drawio\.png$/i,
        redirect: 'Drawio-PNG dual format requires raster output with embedded mxfile metadata, which the agent '
            + 'cannot author. Use create_drawio with .drawio.svg instead; the plugin exports to PNG on demand '
            + 'from its own editor.',
    },
    {
        pattern: /\.excalidraw(\.md)?$/i,
        redirect: 'Excalidraw format. Use execute_command("obsidian-excalidraw-plugin:excalidraw-autocreate-newtab") '
            + 'if the Excalidraw community plugin is installed, otherwise use the built-in create_excalidraw '
            + 'tool (basic boxes only).',
    },
    {
        pattern: /\.canvas$/i,
        redirect: 'Obsidian canvas format. Use the built-in generate_canvas tool — it knows the JSON shape.',
    },
    {
        pattern: /\.pptx$/i,
        redirect: 'PowerPoint format. Use the built-in create_pptx tool. For template-based decks, plan_presentation first.',
    },
    {
        pattern: /\.docx$/i,
        redirect: 'Word format. Use the built-in create_docx tool.',
    },
    {
        pattern: /\.xlsx$/i,
        redirect: 'Excel format. Use the built-in create_xlsx tool.',
    },
];

interface WriteFileInput {
    path: string;
    content: string;
}

export class WriteFileTool extends BaseTool<'write_file'> {
    readonly name = 'write_file' as const;
    readonly isWriteOperation = true; // Triggers approval + checkpoint

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'write_file',
            description:
                'Write content to a file in the vault, creating it if it does not exist. Use this to create new notes or completely replace existing content.',
            input_schema: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description:
                            'Path to the file relative to vault root (e.g., "folder/note.md")',
                    },
                    content: {
                        type: 'string',
                        description: 'The complete content to write to the file',
                    },
                },
                required: ['path', 'content'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { path, content } = input as unknown as WriteFileInput;
        const { callbacks } = context;

        try {
            // Validate input
            if (!path) {
                throw new Error('Path parameter is required');
            }
            if (content === undefined || content === null) {
                throw new Error('Content parameter is required');
            }

            // BUG-018: refuse halluzinated structured / binary formats so the
            // agent doesn't ship files that pass write_file but fail to open
            // in the consuming plugin / app (e.g. .drawio.svg without a valid
            // mxfile wrapper -> "Not a diagram file").
            for (const { pattern, redirect } of PROTECTED_FORMATS) {
                if (pattern.test(path)) {
                    callbacks.pushToolResult(
                        this.formatError(
                            new Error(
                                `write_file refuses ${path} because this is a protected format. ${redirect} `
                                    + 'Do NOT retry write_file with this extension — the file would be rejected by the consumer.',
                            ),
                        ),
                    );
                    return;
                }
            }

            // Config-dir paths are not in the vault index — use adapter directly.
            // FEATURE-0507: also covers the configurable agent folder.
            const cfgDir = this.app.vault.configDir;
            const agentDir = getAgentFolderPath(this.plugin);
            if (path.startsWith(`${cfgDir}/`) || path === agentDir || path.startsWith(`${agentDir}/`)) {
                await this.writeViaAdapter(path, content, callbacks);
                return;
            }

            // Check if file exists
            const existingFile = this.app.vault.getAbstractFileByPath(path);

            if (existingFile) {
                // File exists - modify it
                if (!(existingFile instanceof TFile)) {
                    throw new Error(`Path exists but is not a file: ${path}`);
                }

                const existingContent = await this.app.vault.read(existingFile);
                await this.app.vault.modify(existingFile, content);
                // FIX-01-07-03: push the new content directly into the open
                // CodeMirror buffer so the editor view shows the write
                // immediately and the next auto-save no longer reverts it.
                await refreshOpenMarkdownViewsFor(this.app, existingFile, content);
                const beforeLines = existingContent.split('\n').length;
                const afterLines = content.split('\n').length;
                const added = Math.max(0, afterLines - beforeLines);
                const removed = Math.max(0, beforeLines - afterLines);
                callbacks.pushToolResult(
                    this.formatSuccess(`File updated: ${path} (${content.length} chars)`) +
                    `\n<diff_stats added="${added}" removed="${removed}"/>`
                );
                callbacks.log(`Successfully updated file: ${path}`);
            } else {
                // File doesn't exist - create it
                // First ensure parent folder exists
                const parentPath = path.substring(0, path.lastIndexOf('/'));
                if (parentPath) {
                    await this.ensureFolderExists(parentPath);
                }

                await this.app.vault.create(path, content);
                const newLines = content.split('\n').length;
                callbacks.pushToolResult(
                    this.formatSuccess(`File created: ${path} (${content.length} chars)`) +
                    `\n<diff_stats added="${newLines}" removed="0"/>`
                );
                callbacks.log(`Successfully created file: ${path}`);
            }
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
            await callbacks.handleError('write_file', error);
        }
    }

    /**
     * Write via vault.adapter for paths outside the vault index (.obsidian/, .obsidian-agent/).
     * These paths are not tracked by Obsidian's file index, so vault.getAbstractFileByPath()
     * and vault.createFolder() don't work reliably for them.
     */
    private async writeViaAdapter(path: string, content: string, callbacks: ToolExecutionContext['callbacks']): Promise<void> {
        const adapter = this.app.vault.adapter;
        const existed = await adapter.exists(path);

        // Ensure parent directory exists
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        if (parentPath) {
            const parentExists = await adapter.exists(parentPath);
            if (!parentExists) {
                await adapter.mkdir(parentPath);
            }
        }

        await adapter.write(path, content);

        if (existed) {
            callbacks.pushToolResult(this.formatSuccess(`File updated: ${path} (${content.length} chars)`));
            callbacks.log(`Successfully updated file: ${path}`);
        } else {
            callbacks.pushToolResult(this.formatSuccess(`File created: ${path} (${content.length} chars)`));
            callbacks.log(`Successfully created file: ${path}`);
        }
    }

    /**
     * Ensure a folder path exists, creating it if needed
     */
    private async ensureFolderExists(folderPath: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(folderPath);

        if (!folder) {
            // Folder doesn't exist, create it
            await this.app.vault.createFolder(folderPath);
        } else if (!(folder instanceof TFolder)) {
            throw new Error(`Path exists but is not a folder: ${folderPath}`);
        }
    }
}
