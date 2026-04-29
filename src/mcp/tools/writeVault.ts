/**
 * write_vault -- Create, edit, append, or delete vault files.
 * Batch operations supported. Each write is logged.
 */

import { TFile } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { McpToolResult } from '../types';
import { validateMcpVaultPath } from './mcpPathValidation';

interface WriteOp {
    type: 'create' | 'edit' | 'append' | 'delete';
    path: string;
    content?: string;
}

export async function handleWriteVault(
    plugin: ObsidianAgentPlugin,
    args: Record<string, unknown>,
): Promise<McpToolResult> {
    const operations = args.operations as WriteOp[] | undefined;
    if (!operations || !Array.isArray(operations) || operations.length === 0) {
        return { content: [{ type: 'text', text: 'Error: operations parameter is required' }], isError: true };
    }

    if (operations.length > 20) {
        return { content: [{ type: 'text', text: 'Error: max 20 operations per call' }], isError: true };
    }

    const results: string[] = [];
    const vault = plugin.app.vault;

    for (const op of operations) {
        try {
            // AUDIT-006 H-2: Governance check (path traversal, IgnoreService, configDir)
            const validation = validateMcpVaultPath(plugin, op.path, true);
            if (!validation.allowed) {
                results.push(`${op.path}: Error -- ${validation.reason}`);
                continue;
            }

            switch (op.type) {
                case 'create': {
                    // Codex finding (2026-04-29): allow empty string as legitimate content.
                    // Previous `!op.content` rejected `""` which is a valid empty-file case.
                    if (op.content === undefined) { results.push(`${op.path}: Error -- content required for create`); break; }
                    // Ensure parent folder exists
                    const dir = op.path.substring(0, op.path.lastIndexOf('/'));
                    if (dir) {
                        const folderExists = vault.getAbstractFileByPath(dir);
                        if (!folderExists) await vault.createFolder(dir);
                    }
                    await vault.create(op.path, op.content);
                    results.push(`${op.path}: Created`);
                    break;
                }
                case 'edit': {
                    if (op.content === undefined) { results.push(`${op.path}: Error -- content required for edit`); break; }
                    const file = vault.getAbstractFileByPath(op.path);
                    if (!(file instanceof TFile)) { results.push(`${op.path}: Error -- file not found`); break; }
                    await vault.modify(file, op.content);
                    results.push(`${op.path}: Modified`);
                    break;
                }
                case 'append': {
                    if (op.content === undefined) { results.push(`${op.path}: Error -- content required for append`); break; }
                    const appendFile = vault.getAbstractFileByPath(op.path);
                    if (!(appendFile instanceof TFile)) { results.push(`${op.path}: Error -- file not found`); break; }
                    await vault.append(appendFile, op.content);
                    results.push(`${op.path}: Appended`);
                    break;
                }
                case 'delete': {
                    const delFile = vault.getAbstractFileByPath(op.path);
                    if (!(delFile instanceof TFile)) { results.push(`${op.path}: Error -- file not found`); break; }
                    // AUDIT-006 L-9: Use fileManager.trashFile() (Review-Bot compliance)
                    await plugin.app.fileManager.trashFile(delFile);
                    results.push(`${op.path}: Deleted (moved to trash)`);
                    break;
                }
                default:
                    results.push(`${op.path}: Error -- unknown operation type: ${String(op.type)}`);
            }
        } catch (e) {
            results.push(`${op.path}: Error -- ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    return { content: [{ type: 'text', text: results.join('\n') }] };
}
