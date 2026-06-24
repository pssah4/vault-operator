/**
 * writeBinaryToVault - Shared utility for writing binary files to the vault.
 *
 * Used by CreatePptxTool, CreateXlsxTool, CreateDocxTool.
 * Handles folder creation, create-vs-modify logic, and path validation.
 */

import { TFile, type Vault } from 'obsidian';
import { assertSafeVaultPath } from './vaultPathGuard';

export interface WriteBinaryResult {
    created: boolean;
    path: string;
    size: number;
}

/**
 * Write an ArrayBuffer to the vault as a binary file.
 *
 * @param vault - Obsidian Vault instance
 * @param path - Vault-relative path (e.g. "Presentations/demo.pptx")
 * @param content - Binary content as ArrayBuffer
 * @param expectedExtension - Expected file extension including dot (e.g. ".pptx")
 */
export async function writeBinaryToVault(
    vault: Vault,
    path: string,
    content: ArrayBuffer,
    expectedExtension: string,
): Promise<WriteBinaryResult> {
    // AUDIT-034 H-1: replace fragile includes('..') with the shared
    // segment-walking guard from vaultPathGuard.ts so this and every
    // other write tool reject the same set of escape patterns.
    assertSafeVaultPath(path, { paramName: 'output_path', expectedExtension });

    // Ensure parent folder exists
    const dir = path.includes('/') ? path.split('/').slice(0, -1).join('/') : null;
    if (dir) {
        await vault.createFolder(dir).catch(() => { /* already exists */ });
    }

    // Create or modify
    const existing = vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
        await vault.modifyBinary(existing, content);
        return { created: false, path, size: content.byteLength };
    }

    await vault.createBinary(path, content);
    return { created: true, path, size: content.byteLength };
}
