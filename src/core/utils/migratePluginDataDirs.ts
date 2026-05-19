/**
 * migratePluginDataDirs -- move large internal-only plugin caches out of the vault.
 *
 * History: both the isomorphic-git shadow repo (GitCheckpointService) and the
 * esbuild-wasm cache (EsbuildWasmManager) used to live inside the vault at
 *   {vault}/.obsidian/plugins/{plugin-id}/checkpoints
 *   {vault}/.obsidian/plugins/{plugin-id}/dev-env
 *
 * That works fine on a local SSD, but iCloud / Obsidian Sync / Dropbox treat
 * everything under the vault as user content and replicate it to every device
 * the vault is opened on. checkpoints/ alone routinely grows past 100 MB with
 * thousands of tiny git-object files; on iPhones backed by iCloud this stalls
 * Obsidian's startup until iCloud has indexed every file, producing the
 * "restart in safe mode?" dialog reported on 2026-05-19.
 *
 * The fix moves both caches into the cross-vault GlobalFileService root
 * ({vault-parent}/vault-operator-shared/ or its legacy aliases), which sits
 * next to the vault rather than inside it and therefore never appears in
 * Obsidian's sync stream.
 *
 * Strategy:
 *   - Try fs.rename(oldAbs, newAbs). Single atomic op on the same filesystem.
 *   - On EXDEV / EEXIST fall back to recursive copy + delete.
 *   - Skip entirely if the source does not exist (fresh install) or the
 *     destination already has content (migration ran in a previous session).
 *
 * Idempotent: safe to call on every plugin load.
 *
 * Desktop-only: the rawFs require would crash on Mobile. Caller must gate
 * this with `Platform.isDesktop` (manifest currently also keeps the entire
 * plugin Desktop-only via isDesktopOnly:true).
 */

/* eslint-disable @typescript-eslint/no-require-imports -- rawFs is needed because
 * the destination path lives outside the vault and is therefore unreachable
 * via vault.adapter; the same pattern is used in GitCheckpointService and
 * GlobalFileService.
 */
const rawFs = require('fs') as typeof import('fs');
import * as pathModule from 'path';

export interface PluginDataMigrationReport {
    /** Number of dirs successfully migrated. */
    migrated: number;
    /** Per-target result (skipped / migrated / failed). */
    entries: Array<{
        label: string;
        from: string;
        to: string;
        status: 'skipped-no-source' | 'skipped-destination-populated' | 'renamed' | 'copied' | 'failed';
        error?: string;
    }>;
}

export interface PluginDataMigrationTarget {
    /** Short human-readable label for log output (e.g. "checkpoints"). */
    label: string;
    /** Absolute path to the legacy in-vault directory. */
    from: string;
    /** Absolute path to the new out-of-vault directory. */
    to: string;
}

/** Plan the standard set of targets for the plugin. */
export function planPluginDataMigration(
    vaultBasePath: string,
    pluginConfigDir: string,
    pluginId: string,
    globalRoot: string,
): PluginDataMigrationTarget[] {
    const inVaultBase = pathModule.join(vaultBasePath, pluginConfigDir, 'plugins', pluginId);
    return [
        {
            label: 'checkpoints',
            from: pathModule.join(inVaultBase, 'checkpoints'),
            to: pathModule.join(globalRoot, 'checkpoints'),
        },
        {
            label: 'dev-env',
            from: pathModule.join(inVaultBase, 'dev-env'),
            to: pathModule.join(globalRoot, 'dev-env'),
        },
    ];
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
        return entries.length === 0;
    } catch {
        return true;
    }
}

async function copyRecursive(src: string, dest: string): Promise<void> {
    const stat = await rawFs.promises.stat(src);
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

async function migrateOne(target: PluginDataMigrationTarget): Promise<PluginDataMigrationReport['entries'][0]> {
    const base = { label: target.label, from: target.from, to: target.to };

    if (!(await pathExists(target.from))) {
        return { ...base, status: 'skipped-no-source' };
    }

    if (await pathExists(target.to) && !(await isDirEmpty(target.to))) {
        // Destination already has content -- assume a prior migration filled it
        // and the in-vault copy is stale. Don't clobber.
        return { ...base, status: 'skipped-destination-populated' };
    }

    // Ensure parent of destination exists.
    await rawFs.promises.mkdir(pathModule.dirname(target.to), { recursive: true });

    // Empty destination dirs get removed so rename has a clear shot.
    if (await pathExists(target.to)) {
        try { await rawFs.promises.rmdir(target.to); } catch { /* race-tolerant */ }
    }

    // Try atomic rename first.
    try {
        await rawFs.promises.rename(target.from, target.to);
        return { ...base, status: 'renamed' };
    } catch (e) {
        const code = (e as NodeJS.ErrnoException)?.code ?? '';
        // EXDEV: cross-device link (vault and vault-parent on different volumes)
        // EPERM/EBUSY: locked file (rare on macOS, can happen on Windows)
        // ENOTEMPTY: shouldn't happen given the check above, but be defensive
        if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') {
            return { ...base, status: 'failed', error: e instanceof Error ? e.message : String(e) };
        }
    }

    // Fallback: recursive copy, then delete source.
    try {
        await copyRecursive(target.from, target.to);
        await rawFs.promises.rm(target.from, { recursive: true, force: true });
        return { ...base, status: 'copied' };
    } catch (e) {
        return { ...base, status: 'failed', error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * Run the migration. Always returns a report; never throws.
 * Caller decides whether to surface a Notice based on the report.
 */
export async function migratePluginDataDirs(
    targets: PluginDataMigrationTarget[],
): Promise<PluginDataMigrationReport> {
    const entries: PluginDataMigrationReport['entries'] = [];
    let migrated = 0;
    for (const t of targets) {
        const entry = await migrateOne(t);
        entries.push(entry);
        if (entry.status === 'renamed' || entry.status === 'copied') migrated += 1;
    }
    return { migrated, entries };
}

/* eslint-enable @typescript-eslint/no-require-imports -- end of file scope */
