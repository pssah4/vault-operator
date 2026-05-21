/**
 * restoreLayoutFromBackup -- undo a completed storage layout migration by
 * restoring the legacy roots (.obsidian-agent, .obsilo-vault, .vault-operator,
 * vault-parent/obsilo-shared) from a backup snapshot, then deleting the
 * consolidated .vault-operator/{data,cache}/ tree.
 *
 * Backup snapshots are written by phase 1 of the migration into:
 *   {vault}/.obsidian/plugins/<id>/layout-migration-backups/
 *     vault-operator-backup-{ISO-timestamp}/
 *       obsidian-agent/...
 *       obsilo-vault/...
 *       vault-operator/...
 *       obsilo-shared/...
 *
 * Restore strategy:
 *   1. Detect the chosen backup folder (default: latest by timestamp).
 *   2. For each backup sub-folder copy its contents into the corresponding
 *      legacy root, creating the parent if needed.
 *   3. Remove .vault-operator/{data, cache} only if all backup copies
 *      succeeded.
 *   4. Reset settings: _layoutMigrationStatus -> undefined,
 *      _layoutMigrationOptIn -> false. Caller decides whether to also flip
 *      agentFolderPath back to a legacy value.
 *
 * Caller (UI) is responsible for the confirmation modal and the
 * post-restore reload notice. This module is pure: it never throws on
 * recoverable errors and always returns a report.
 *
 * Desktop-only: same rawFs pattern as the migration service.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- rawFs needed for the
 * vault-parent destination and for atomic moves. Same pattern as
 * migrateAgentLayout and migratePluginDataDirs.
 */
const rawFs = require('fs') as typeof import('fs');
import * as pathModule from 'path';

export interface RestoreEntry {
    label: string;
    from: string;
    to: string;
    status: 'restored' | 'skipped-empty-source' | 'skipped-destination-populated' | 'failed';
    error?: string;
}

export interface RestoreReport {
    backupPath: string;
    entries: RestoreEntry[];
    removedConsolidated: string[];
    allRestoreSucceeded: boolean;
}

export interface RestoreInput {
    /** Absolute vault root path. */
    vaultBasePath: string;
    /** Absolute vault-parent path. */
    vaultParent: string;
    /** Absolute backup folder path (the timestamped folder, not its parent). */
    backupPath: string;
    /** Whether to delete the consolidated .vault-operator/{data, cache} tree
     *  after a successful restore. Defaults to true. */
    removeConsolidated?: boolean;
}

async function pathExists(p: string): Promise<boolean> {
    try {
        await rawFs.promises.access(p);
        return true;
    } catch {
        return false;
    }
}

async function isDirEmpty(p: string): Promise<boolean> {
    try {
        const entries = await rawFs.promises.readdir(p);
        return entries.filter((e) => e !== '.DS_Store').length === 0;
    } catch {
        return true;
    }
}

/**
 * For the `.vault-operator` restore target the destination may still hold
 * the consolidated `data/` and `cache/` folders (they are about to be
 * removed by this restore pass). Treat those as not-blocking so the
 * legacy assets/runtime sub-folders can be restored on top.
 */
async function isDirEmptyIgnoringConsolidated(p: string): Promise<boolean> {
    try {
        const entries = await rawFs.promises.readdir(p);
        const meaningful = entries.filter(
            (e) => e !== '.DS_Store' && e !== 'data' && e !== 'cache',
        );
        return meaningful.length === 0;
    } catch {
        return true;
    }
}

async function copyRecursive(src: string, dest: string): Promise<void> {
    // lstat so symlinks inside the backup snapshot don't get followed during
    // a restore. Mirrors L-4 hardening in migrateAgentLayout.copyRecursive.
    const stat = await rawFs.promises.lstat(src);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
        await rawFs.promises.mkdir(dest, { recursive: true });
        const entries = await rawFs.promises.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            const s = pathModule.join(src, entry.name);
            const d = pathModule.join(dest, entry.name);
            await copyRecursive(s, d);
        }
    } else {
        await rawFs.promises.mkdir(pathModule.dirname(dest), { recursive: true });
        await rawFs.promises.copyFile(src, dest);
    }
}

/**
 * List backup folders sorted newest first.
 *
 * Note: with the M-1 fix in main.ts, the backup directory now sits directly
 * at {homedir}/.vault-operator-migration-backups/{vault-hash}/. The legacy
 * sub-folder `layout-migration-backups` is no longer added; the input
 * already points at the {vault-hash} folder.
 */
export async function listBackupFolders(pluginDataDir: string): Promise<string[]> {
    if (!(await pathExists(pluginDataDir))) return [];
    const entries = await rawFs.promises.readdir(pluginDataDir, { withFileTypes: true });
    const resolvedRoot = pathModule.resolve(pluginDataDir);
    // Defense-in-depth path-containment check (L-3 in AUDIT-FEAT-29-01):
    // even though `dirent.name` is just a basename, a malicious symlink with
    // the right prefix could otherwise pipe restore-reads outside the root.
    const folders = entries
        .filter((e) => e.isDirectory() && e.name.startsWith('vault-operator-backup-'))
        .map((e) => pathModule.resolve(pathModule.join(pluginDataDir, e.name)))
        .filter((p) => p === resolvedRoot
            || p.startsWith(resolvedRoot + pathModule.sep))
        .sort()
        .reverse(); // newest first
    return folders;
}

export async function restoreLayoutFromBackup(input: RestoreInput): Promise<RestoreReport> {
    const report: RestoreReport = {
        backupPath: input.backupPath,
        entries: [],
        removedConsolidated: [],
        allRestoreSucceeded: true,
    };

    // Four restore targets matching the four migration source roots.
    const targets: Array<{ label: string; from: string; to: string }> = [
        {
            label: 'obsidian-agent',
            from: pathModule.join(input.backupPath, 'obsidian-agent'),
            to: pathModule.join(input.vaultBasePath, '.obsidian-agent'),
        },
        {
            label: 'obsilo-vault',
            from: pathModule.join(input.backupPath, 'obsilo-vault'),
            to: pathModule.join(input.vaultBasePath, '.obsilo-vault'),
        },
        {
            label: 'vault-operator',
            from: pathModule.join(input.backupPath, 'vault-operator'),
            to: pathModule.join(input.vaultBasePath, '.vault-operator'),
        },
        {
            label: 'obsilo-shared',
            from: pathModule.join(input.backupPath, 'obsilo-shared'),
            to: pathModule.join(input.vaultParent, 'obsilo-shared'),
        },
    ];

    for (const t of targets) {
        const entry: RestoreEntry = { label: t.label, from: t.from, to: t.to, status: 'restored' };
        if (!(await pathExists(t.from))) {
            entry.status = 'skipped-empty-source';
            report.entries.push(entry);
            continue;
        }
        const destEmpty = t.label === 'vault-operator'
            ? await isDirEmptyIgnoringConsolidated(t.to)
            : await isDirEmpty(t.to);
        if ((await pathExists(t.to)) && !destEmpty) {
            // Refuse to overwrite a populated destination so a restore does
            // not silently clobber whatever the user has at the legacy path.
            entry.status = 'skipped-destination-populated';
            entry.error = 'destination not empty, refusing to overwrite';
            report.entries.push(entry);
            report.allRestoreSucceeded = false;
            continue;
        }
        try {
            await copyRecursive(t.from, t.to);
            report.entries.push(entry);
        } catch (e) {
            entry.status = 'failed';
            entry.error = e instanceof Error ? e.message : String(e);
            report.entries.push(entry);
            report.allRestoreSucceeded = false;
        }
    }

    // Only nuke the consolidated tree if every restore step was OK.
    const removeConsolidated = input.removeConsolidated !== false;
    if (removeConsolidated && report.allRestoreSucceeded) {
        const consolidatedRoot = pathModule.join(input.vaultBasePath, '.vault-operator');
        const dataDir = pathModule.join(consolidatedRoot, 'data');
        const cacheDir = pathModule.join(consolidatedRoot, 'cache');
        // The restore step for the legacy `vault-operator/assets+runtime`
        // already placed files back under .vault-operator/{assets,runtime},
        // so we must NOT delete the entire .vault-operator tree -- only the
        // data/ and cache/ sub-trees that the migration created.
        for (const dir of [dataDir, cacheDir]) {
            if (await pathExists(dir)) {
                try {
                    await rawFs.promises.rm(dir, { recursive: true, force: true });
                    report.removedConsolidated.push(dir);
                } catch {
                    // non-fatal -- the consolidated tree may still be cleanable by hand
                }
            }
        }
    }

    return report;
}

/* eslint-enable @typescript-eslint/no-require-imports -- end of file scope */
