/**
 * AutoBackupRunner -- FEAT-29-12.
 *
 * Glues AutoBackupScheduler + BackupExportService + BackupSecretFilter
 * into a single onload-callable function. Lives next to the pure
 * services so the BackupTab UI does not need to import this layer.
 *
 * The runner is deliberately conservative:
 *   - Backs up Skills + Memory + History + Rules + Workflows + Settings
 *     (a strict, opinionated selection so the user does not have to
 *     configure it)
 *   - Secrets are ALWAYS stripped, regardless of the manual-export
 *     setting. Auto-backups are unattended; user opt-in for secrets
 *     only applies to the manual flow.
 *   - Output lands in `.vault-operator/cache/backups/` with the
 *     auto-backup-filename pattern, so manual exports and auto-daily
 *     ZIPs never collide.
 *   - Retention prunes the oldest backups beyond settings.backup.retentionCount.
 */

import type { BackupSettings } from '../../types/settings';
import type { BackupFileAdapter, BackupSelection } from './BackupExportService';
import { collectFiles, buildZip } from './BackupExportService';
import { filterSecretsFromDataJson } from './BackupSecretFilter';
import {
    shouldRunAutoBackup,
    autoBackupFilename,
    pickStaleBackups,
} from './AutoBackupScheduler';

/** The strict selection auto-daily backups always use. */
export const AUTO_BACKUP_SELECTION: BackupSelection = {
    skills: true,
    memory: true,
    history: true,
    rules: true,
    workflows: true,
    settings: true,
    exportSecrets: false, // Auto-backups never carry secrets.
};

export interface AutoBackupResult {
    ran: boolean;
    reason: string;
    filename?: string;
    bytesWritten?: number;
    prunedFiles?: string[];
    error?: string;
}

/**
 * Decide whether to run, then build + write the ZIP + prune old
 * backups. Returns a structured result the caller can log without
 * branching on exceptions.
 *
 * Note: pure-logic level. The caller passes a BackupFileAdapter and
 * the settings; the runner does not touch the plugin instance.
 */
export async function maybeRunAutoBackup(
    settings: BackupSettings,
    adapter: BackupFileAdapter,
    agentRoot: string,
    settingsJson: unknown,
    onSaveBackupTimestamp: (ts: number) => Promise<void>,
    now: number = Date.now(),
): Promise<AutoBackupResult> {
    const verdict = shouldRunAutoBackup(settings, now);
    if (!verdict.run) return { ran: false, reason: verdict.reason };

    try {
        // 1. Collect files for the strict selection (no UI).
        const files = await collectFiles(adapter, agentRoot, AUTO_BACKUP_SELECTION);

        // 2. Substitute the live settings.json with a secret-filtered copy.
        //    collectFiles already read data.json from disk; we replace its
        //    content in the file list so the on-disk file stays untouched.
        const filteredSettings = filterSecretsFromDataJson(settingsJson, false);
        for (let i = 0; i < files.length; i++) {
            if (files[i].path.endsWith('data.json')) {
                files[i] = {
                    ...files[i],
                    content: new TextEncoder().encode(JSON.stringify(filteredSettings, null, 2)),
                    isText: true,
                };
            }
        }

        // 3. Build the ZIP.
        const zipBytes = await buildZip(files, AUTO_BACKUP_SELECTION, new Date(now).toISOString());

        // 4. Ensure target folder exists.
        const targetDir = settings.autoDailyTargetPath;
        if (!(await adapter.exists(targetDir))) {
            await adapter.mkdir(targetDir);
        }

        // 5. Write under the deterministic filename pattern.
        const fname = autoBackupFilename(new Date(now));
        const fullPath = `${targetDir.replace(/\/$/, '')}/${fname}`;
        await adapter.writeBinary(fullPath, zipBytes);

        // 6. Persist the timestamp BEFORE pruning so a partial prune does
        //    not also trigger an immediate re-run on the next boot.
        await onSaveBackupTimestamp(now);

        // 7. Prune older backups beyond retention.
        const existing = await listBackupsInFolder(adapter, targetDir);
        const stale = pickStaleBackups(existing, settings.retentionCount);
        for (const f of stale) {
            try {
                await adapter.list(targetDir); // ensure folder still listable
                await deleteIfExists(adapter, `${targetDir.replace(/\/$/, '')}/${f}`);
            } catch {
                // ignore prune errors -- next run cleans up
            }
        }

        return {
            ran: true,
            reason: verdict.reason,
            filename: fname,
            bytesWritten: zipBytes.byteLength,
            prunedFiles: stale,
        };
    } catch (e) {
        return {
            ran: false,
            reason: 'error',
            error: e instanceof Error ? e.message : String(e),
        };
    }
}

async function listBackupsInFolder(adapter: BackupFileAdapter, folder: string): Promise<string[]> {
    try {
        const listing = await adapter.list(folder);
        const prefix = folder.replace(/\/$/, '') + '/';
        return listing.files
            .map((p) => (p.startsWith(prefix) ? p.slice(prefix.length) : p))
            .filter((name) => name.startsWith('vault-operator-auto-') && name.endsWith('.zip'));
    } catch {
        return [];
    }
}

async function deleteIfExists(adapter: BackupFileAdapter, path: string): Promise<void> {
    if (await adapter.exists(path)) {
        // FileAdapter has remove but BackupFileAdapter does not; cast at the call site.
        const a = adapter as unknown as { remove?: (p: string) => Promise<void> };
        await a.remove?.(path);
    }
}
