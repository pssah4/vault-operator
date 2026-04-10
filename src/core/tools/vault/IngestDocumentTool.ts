/**
 * IngestDocumentTool — Creates a Markdown source note from a PDF/Office document.
 *
 * The agent provides frontmatter + overview (small, LLM-generated).
 * The tool programmatically appends the full original text extracted from the
 * document, bypassing LLM output token limits.
 *
 * This solves the fundamental problem: a 300-page PDF cannot be written through
 * the LLM's output tokens (~8k), but the parsed text is already available.
 */

import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { parseDocument } from '../../document-parsers/parseDocument';
import { BINARY_DOCUMENT_EXTENSIONS, MAX_FILE_SIZE } from '../../document-parsers/types';

interface IngestDocumentInput {
    /** Path for the new Markdown note (e.g. "Notes/Webb-2026_Title.md") */
    output_path: string;
    /** Frontmatter + overview + kernaussagen written by the agent (everything ABOVE the original text) */
    header_content: string;
    /** Path to the source document in the vault (e.g. "Attachements/report.pdf") */
    source_path?: string;
    /** If the document was a chat attachment (not in vault), the agent passes the attachment index (0-based) */
    attachment_index?: number;
}

export class IngestDocumentTool extends BaseTool<'ingest_document'> {
    readonly name = 'ingest_document' as const;
    readonly isWriteOperation = true;

    /** Parsed text from chat attachments, set by AgentSidebarView before task execution */
    private attachmentTexts: string[] = [];

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    /** Called by AgentSidebarView to pass parsed attachment texts for the current turn */
    setAttachmentTexts(texts: string[]): void {
        this.attachmentTexts = texts;
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'ingest_document',
            description:
                'Create a Markdown source note from a PDF or Office document. ' +
                'You provide the frontmatter + overview (header_content), and the tool automatically appends ' +
                'the full original document text as Markdown. This bypasses output token limits for long documents. ' +
                'Use either source_path (for vault files) or attachment_index (for chat attachments, 0-based). ' +
                'The document text is extracted programmatically and cleaned up (page breaks, headers/footers removed).',
            input_schema: {
                type: 'object',
                properties: {
                    output_path: {
                        type: 'string',
                        description: 'Path for the new Markdown note (e.g. "Notes/Webb-2026_Convergence-Outlook.md")',
                    },
                    header_content: {
                        type: 'string',
                        description:
                            'The frontmatter (YAML) + overview + kernaussagen that you wrote. ' +
                            'Must include the opening and closing --- for frontmatter. ' +
                            'The full original document text will be appended automatically after a "## Originaltext" heading.',
                    },
                    source_path: {
                        type: 'string',
                        description: 'Path to the source document in the vault (e.g. "Attachements/report.pdf"). Use this for vault files.',
                    },
                    attachment_index: {
                        type: 'number',
                        description: 'Index of the chat attachment (0-based). Use this when the document was added via drag & drop or file picker, not from the vault.',
                    },
                },
                required: ['output_path', 'header_content'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { output_path, header_content, source_path, attachment_index } = input as unknown as IngestDocumentInput;
        const { callbacks } = context;

        try {
            if (!output_path) {
                throw new Error('output_path is required');
            }
            if (!header_content) {
                throw new Error('header_content is required (frontmatter + overview)');
            }

            // Get the document text
            let documentText: string;

            if (source_path) {
                // Parse from vault file
                documentText = await this.parseVaultDocument(source_path);
            } else if (attachment_index !== undefined && attachment_index >= 0) {
                // Get from chat attachment
                if (attachment_index >= this.attachmentTexts.length) {
                    throw new Error(
                        `Attachment index ${attachment_index} out of range. ` +
                        `${this.attachmentTexts.length} attachment(s) available.`
                    );
                }
                documentText = this.attachmentTexts[attachment_index];
            } else {
                throw new Error('Either source_path or attachment_index is required');
            }

            if (!documentText || documentText.trim().length < 50) {
                throw new Error('Document text is empty or too short. The document may not contain extractable text.');
            }

            // Clean up the document text
            const cleanedText = this.cleanDocumentText(documentText);

            // Combine header + original text
            const fullContent = header_content.trimEnd() +
                '\n\n---\n\n## Originaltext\n\n' +
                cleanedText;

            // Write the file
            const existing = this.app.vault.getAbstractFileByPath(output_path);
            if (existing) {
                throw new Error(`File already exists: ${output_path}. Use a different path or delete the existing file first.`);
            }

            // Ensure parent folder exists
            const parentPath = output_path.split('/').slice(0, -1).join('/');
            if (parentPath) {
                const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
                if (!parentFolder) {
                    await this.app.vault.createFolder(parentPath);
                }
            }

            const file = await this.app.vault.create(output_path, fullContent);

            const textLength = cleanedText.length;
            const totalLength = fullContent.length;
            callbacks.pushToolResult(
                this.formatSuccess(
                    `Created source note: ${output_path}\n` +
                    `Header: ${header_content.length} chars (frontmatter + overview)\n` +
                    `Original text: ${textLength} chars (appended automatically)\n` +
                    `Total: ${totalLength} chars`
                )
            );

            // Open the note
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(file);

        } catch (e) {
            callbacks.pushToolResult(this.formatError(e instanceof Error ? e : new Error(String(e))));
        }
    }

    private async parseVaultDocument(sourcePath: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!file || !(file instanceof TFile)) {
            throw new Error(`Source document not found: ${sourcePath}`);
        }

        const ext = file.extension.toLowerCase();
        if (file.stat.size > MAX_FILE_SIZE) {
            throw new Error(`Document too large: ${(file.stat.size / 1024 / 1024).toFixed(1)} MB`);
        }

        let data: ArrayBuffer;
        if (BINARY_DOCUMENT_EXTENSIONS.has(ext)) {
            data = await this.app.vault.readBinary(file);
        } else {
            const text = await this.app.vault.read(file);
            data = new TextEncoder().encode(text).buffer;
        }

        const result = await parseDocument(data, ext);
        return result.text;
    }

    /**
     * Clean up extracted document text for Markdown readability.
     * Removes PDF artifacts: page numbers, repeated headers/footers, excessive whitespace.
     */
    private cleanDocumentText(text: string): string {
        return text
            // Remove standalone page numbers (lines that are just a number)
            .replace(/^\s*\d{1,4}\s*$/gm, '')
            // Collapse 3+ consecutive blank lines to 2
            .replace(/\n{4,}/g, '\n\n\n')
            // Remove leading/trailing whitespace
            .trim();
    }
}
