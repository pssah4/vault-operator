/**
 * ExtractZipTool — extracts a ZIP archive from the vault into a target
 * folder. Built so the skill-translator (and any other workflow) can
 * unpack ZIPs without juggling jszip inside the sandbox, where dynamic
 * imports are blocked and `vault.readBinary` does not survive the
 * structured-clone bridge.
 *
 * Safety: rejects path-traversal entries and enforces a cumulative
 * uncompressed-size cap (zip-bomb guard). Existing files are skipped
 * by default and the caller has to opt in via `overwrite=true`.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { extractZip, ExtractZipError } from '../../utils/extractZip';

interface ExtractZipInput {
    zip_path: string;
    target_folder: string;
    overwrite?: boolean;
    strip_root_folder?: boolean;
    max_uncompressed_bytes?: number;
}

export class ExtractZipTool extends BaseTool<'extract_zip'> {
    readonly name = 'extract_zip' as const;
    readonly isWriteOperation = true;

    getDefinition(): ToolDefinition {
        return {
            name: 'extract_zip',
            description:
                'Extract a .zip / .skill archive from the vault into a target folder. ' +
                'Use this when you need to unpack a ZIP (e.g. a downloaded Anthropic skill, ' +
                'an export bundle, an asset pack). Path-traversal entries are rejected and ' +
                'the cumulative uncompressed size is capped (default 100 MB). Existing files ' +
                'are skipped unless overwrite=true. ' +
                'NEVER try to unpack ZIPs via evaluate_expression — the sandbox cannot bundle ' +
                'jszip and the binary roundtrip is lossy.',
            input_schema: {
                type: 'object',
                properties: {
                    zip_path: {
                        type: 'string',
                        description: 'Vault-relative path to the .zip / .skill file (e.g., "Inbox/skill.zip").',
                    },
                    target_folder: {
                        type: 'string',
                        description: 'Vault-relative destination folder. Will be created if missing. Must not start with "/" or contain "..".',
                    },
                    overwrite: {
                        type: 'boolean',
                        description: 'Overwrite existing files in the target folder. Default: false (existing files are reported as skipped).',
                    },
                    strip_root_folder: {
                        type: 'boolean',
                        description: 'If true and the archive has exactly one top-level folder, strip it so the children land directly in target_folder. Useful for Anthropic-style skill archives (my-skill/SKILL.md → SKILL.md). Default: false.',
                    },
                    max_uncompressed_bytes: {
                        type: 'number',
                        description: 'Cap on cumulative uncompressed bytes (zip-bomb guard). Default: 104857600 (100 MB).',
                    },
                },
                required: ['zip_path', 'target_folder'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const params = input as unknown as ExtractZipInput;

        try {
            if (!params.zip_path) throw new Error('zip_path parameter is required');
            if (!params.target_folder) throw new Error('target_folder parameter is required');

            const adapter = this.app.vault.adapter;

            const result = await extractZip({
                adapter: {
                    exists: (p) => adapter.exists(p),
                    mkdir: (p) => adapter.mkdir(p),
                    writeBinary: (p, data) => adapter.writeBinary(p, data),
                    readBinary: (p) => adapter.readBinary(p),
                },
                zipPath: params.zip_path,
                targetFolder: params.target_folder,
                overwrite: params.overwrite,
                stripRootFolder: params.strip_root_folder,
                maxUncompressedBytes: params.max_uncompressed_bytes,
            });

            const stripNote = result.strippedRoot
                ? ` (stripped root folder "${result.strippedRoot}")`
                : '';
            const skipNote = result.skippedEntries.length > 0
                ? `\nSkipped (existing, use overwrite=true to replace): ${result.skippedEntries.join(', ')}`
                : '';

            const message =
                `Extracted ${result.writtenFiles.length} file(s) ` +
                `from ${params.zip_path} into ${params.target_folder}${stripNote}.\n` +
                `Files: ${result.writtenFiles.join(', ')}${skipNote}`;

            callbacks.pushToolResult(this.formatSuccess(message));
            callbacks.log(`extract_zip: ${params.zip_path} → ${params.target_folder} (${result.writtenFiles.length} written, ${result.skippedEntries.length} skipped)`);
        } catch (error) {
            if (error instanceof ExtractZipError) {
                callbacks.pushToolResult(this.formatError(`${error.code}: ${error.message}`));
            } else {
                callbacks.pushToolResult(this.formatError(error));
            }
            await callbacks.handleError('extract_zip', error);
        }
    }
}
