/**
 * One-time migration of user skills from the legacy `.obsilo-sync/skills/`
 * location into the configurable agent folder introduced by ADR-072.
 *
 * FEATURE-2201 / ADR-075 / EPIC-022. Defensive copy, originals stay in
 * place. A `.migrated` marker in the legacy folder makes the migration
 * idempotent so subsequent plugin starts are no-ops.
 */

import type { DataAdapter, ListedFiles } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import {
    getSelfAuthoredSkillsDir,
    LEGACY_SELF_AUTHORED_SKILLS_DIR,
} from '../utils/agentFolder';
import type { SkillMigrationResult } from './types';

const MIGRATION_MARKER = '.migrated';

export async function migrateLegacySkillsIfNeeded(
    plugin: ObsidianAgentPlugin,
): Promise<SkillMigrationResult | null> {
    const adapter = plugin.app.vault.adapter;
    const legacyDir = LEGACY_SELF_AUTHORED_SKILLS_DIR;
    const targetDir = getSelfAuthoredSkillsDir(plugin);

    if (legacyDir === targetDir) return null;
    if (!(await adapter.exists(legacyDir))) return null;

    const markerPath = `${legacyDir}/${MIGRATION_MARKER}`;
    if (await adapter.exists(markerPath)) return null;

    const result: SkillMigrationResult = {
        migratedSlugs: [],
        skippedSlugs: [],
        errors: [],
        sourceDir: legacyDir,
        targetDir,
    };

    let entries: ListedFiles;
    try {
        entries = await adapter.list(legacyDir);
    } catch (e) {
        result.errors.push(`list ${legacyDir}: ${errorToMessage(e)}`);
        return result;
    }

    if (entries.folders.length === 0) {
        await writeMarker(adapter, markerPath);
        return result;
    }

    await ensureDir(adapter, targetDir);

    for (const skillFolder of entries.folders) {
        const slug = skillFolder.slice(legacyDir.length + 1);
        const destFolder = `${targetDir}/${slug}`;

        if (await adapter.exists(destFolder)) {
            result.skippedSlugs.push(slug);
            continue;
        }

        try {
            await copyFolderRecursive(adapter, skillFolder, destFolder);
            result.migratedSlugs.push(slug);
        } catch (e) {
            result.errors.push(`${slug}: ${errorToMessage(e)}`);
        }
    }

    if (result.errors.length === 0) {
        await writeMarker(adapter, markerPath);
    }

    return result;
}

async function copyFolderRecursive(
    adapter: DataAdapter,
    source: string,
    dest: string,
): Promise<void> {
    await ensureDir(adapter, dest);

    const entries = await adapter.list(source);

    for (const filePath of entries.files) {
        const name = filePath.slice(source.length + 1);
        const destFile = `${dest}/${name}`;
        const buffer = await adapter.readBinary(filePath);
        await adapter.writeBinary(destFile, buffer);
    }

    for (const subFolder of entries.folders) {
        const name = subFolder.slice(source.length + 1);
        await copyFolderRecursive(adapter, subFolder, `${dest}/${name}`);
    }
}

async function ensureDir(adapter: DataAdapter, path: string): Promise<void> {
    if (await adapter.exists(path)) return;
    await adapter.mkdir(path);
}

async function writeMarker(adapter: DataAdapter, path: string): Promise<void> {
    await adapter.write(
        path,
        `Migrated by Vault Operator v2.6 on ${new Date().toISOString()}.\nThis marker prevents re-migration; safe to delete the whole legacy folder once the new location works.\n`,
    );
}

function errorToMessage(e: unknown): string {
    const raw = (e as { message?: unknown })?.message;
    if (typeof raw === 'string') return raw;
    if (typeof e === 'string') return e;
    return 'unknown error';
}
