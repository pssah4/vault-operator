/**
 * Folder-rename migration: legacy `.obsidian-agent` -> `obsilo-vault`
 * (vault-local) and `.obsidian-agent` -> `obsilo-shared` (vault-parent).
 *
 * Runs once on plugin onload, before any DB or settings consumer reads
 * from the new paths. Idempotent: a second run on already-migrated
 * installs is a no-op.
 *
 * Atomic: uses fs.rename for the parent path and adapter.rename for the
 * vault-local path, both single syscall renames on APFS / NTFS.
 *
 * Custom-path safety: if the user already configured
 * `settings.agentFolderPath` to something other than the legacy default,
 * we leave the vault-local rename untouched. The vault-parent rename
 * still runs because there is no per-user override for it.
 */

import * as path from 'path';
import * as safeFs from '../security/safeFs';
import type { App } from 'obsidian';
import { LEGACY_GLOBAL_DIR_NAME } from '../storage/GlobalFileService';

const NEW_GLOBAL_DIR_NAME = 'obsilo-shared';

// Pre-FEAT-29-01 vault-local default. This module migrates legacy
// `.obsidian-agent` -> `obsilo-vault` -> `.obsilo-vault`. FEAT-29-01's
// consolidation onto `.vault-operator/` is a separate opt-in migration
// (migrateAgentLayout) and must NOT happen here automatically.
const PRE_FEAT_29_01_DEFAULT = '.obsilo-vault';
const PRE_FEAT_29_01_LEGACY_FOLDERS = ['obsilo-vault', '.obsidian-agent'] as const;

export interface FolderMigrationReport {
    vaultLocalRenamed: boolean;
    vaultLocalReason?: string;
    globalRenamed: boolean;
    globalReason?: string;
}

/**
 * Filesystem-level rename. Runs VERY early in plugin.onload, before
 * GlobalFileService is constructed and before settings are loaded --
 * because both depend on the new folder names being in place.
 *
 * Settings consolidation (rewriting `agentFolderPath` from the legacy
 * default to the new default) is a separate, post-loadSettings step
 * since it needs plugin.saveSettings.
 *
 * Custom-path safety: vault-local rename only runs when no settings
 * file exists yet OR the saved `agentFolderPath` matches the legacy
 * default. Custom paths stay untouched.
 */
export async function migrateFolderRename(
    app: App, vaultBasePath: string, savedAgentFolderPath: string | undefined,
): Promise<FolderMigrationReport> {
    const report: FolderMigrationReport = {
        vaultLocalRenamed: false,
        globalRenamed: false,
    };

    // ── Vault-local rename ────────────────────────────────────────────
    const adapter = app.vault.adapter;
    const configured = savedAgentFolderPath?.trim();
    const knownNames = new Set<string>([PRE_FEAT_29_01_DEFAULT, ...PRE_FEAT_29_01_LEGACY_FOLDERS]);
    const isCustomPath = !!configured && !knownNames.has(configured);

    if (isCustomPath) {
        report.vaultLocalReason = 'custom agentFolderPath, skipping rename';
    } else {
        try {
            const newExists = await adapter.exists(PRE_FEAT_29_01_DEFAULT);
            // Find first legacy folder that exists -- ordered newest-first so
            // a sequence like `obsidian-agent -> obsilo-vault` chooses the
            // most recent intermediate state to migrate from.
            let legacyFound: string | null = null;
            for (const legacy of PRE_FEAT_29_01_LEGACY_FOLDERS) {
                if (await adapter.exists(legacy)) { legacyFound = legacy; break; }
            }
            if (legacyFound && !newExists) {
                await adapter.rename(legacyFound, PRE_FEAT_29_01_DEFAULT);
                report.vaultLocalRenamed = true;
            } else if (legacyFound && newExists) {
                report.vaultLocalReason =
                    `both ${legacyFound} and ${PRE_FEAT_29_01_DEFAULT} exist; user must reconcile manually`;
            } else {
                report.vaultLocalReason = newExists ? 'already on new layout' : 'no legacy vault-local folder';
            }
        } catch (e) {
            report.vaultLocalReason = `rename failed: ${(e as Error).message}`;
            console.warn('[FolderRename] vault-local migration failed:', e);
        }
    }

    // ── Vault-parent (cross-vault, global) rename ─────────────────────
    try {
        if (!vaultBasePath) {
            report.globalReason = 'no vault basePath available, skipping global rename';
            return report;
        }
        const parent = path.dirname(vaultBasePath);
        const oldGlobal = path.join(parent, LEGACY_GLOBAL_DIR_NAME);
        const newGlobal = path.join(parent, NEW_GLOBAL_DIR_NAME);
        const oldExists = safeFs.existsSync(oldGlobal);
        const newExists = safeFs.existsSync(newGlobal);
        if (oldExists && !newExists) {
            await safeFs.promises.rename(oldGlobal, newGlobal);
            report.globalRenamed = true;
        } else if (oldExists && newExists) {
            report.globalReason =
                'both legacy and new global folders exist; user must reconcile manually';
        } else {
            report.globalReason = oldExists ? 'unexpected state' : 'no legacy global folder';
        }
    } catch (e) {
        report.globalReason = `rename failed: ${(e as Error).message}`;
        console.warn('[FolderRename] vault-parent migration failed:', e);
    }

    return report;
}
