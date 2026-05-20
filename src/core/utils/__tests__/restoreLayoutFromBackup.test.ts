/**
 * restoreLayoutFromBackup tests for FEAT-29-01 Task 5.
 *
 * Covers the four legacy-root restore paths plus the consolidated-tree
 * removal. Uses a real temp directory because the service uses Node's fs
 * directly (same pattern as migrateAgentLayout tests).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
    restoreLayoutFromBackup,
    listBackupFolders,
} from '../restoreLayoutFromBackup';

function makeTempVault() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feat-29-01-restore-'));
    const vaultBasePath = path.join(root, 'TestVault');
    const vaultParent = root;
    const pluginDataDir = path.join(root, 'plugin-data');
    fs.mkdirSync(vaultBasePath, { recursive: true });
    fs.mkdirSync(pluginDataDir, { recursive: true });
    return {
        vaultBasePath,
        vaultParent,
        pluginDataDir,
        cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
}

function seedBackup(pluginDataDir: string, timestamp: string): string {
    const backupRoot = path.join(pluginDataDir, 'layout-migration-backups', `vault-operator-backup-${timestamp}`);
    fs.mkdirSync(backupRoot, { recursive: true });
    return backupRoot;
}

describe('listBackupFolders', () => {
    let vault: ReturnType<typeof makeTempVault>;
    beforeEach(() => { vault = makeTempVault(); });
    afterEach(() => vault.cleanup());

    it('returns empty array when no backup folder exists', async () => {
        const result = await listBackupFolders(vault.pluginDataDir);
        expect(result).toEqual([]);
    });

    it('returns backups sorted newest first', async () => {
        seedBackup(vault.pluginDataDir, '2026-05-01T00-00-00-000Z');
        seedBackup(vault.pluginDataDir, '2026-05-15T00-00-00-000Z');
        seedBackup(vault.pluginDataDir, '2026-05-10T00-00-00-000Z');
        const result = await listBackupFolders(vault.pluginDataDir);
        expect(result).toHaveLength(3);
        expect(result[0]).toContain('2026-05-15');
        expect(result[2]).toContain('2026-05-01');
    });
});

describe('restoreLayoutFromBackup', () => {
    let vault: ReturnType<typeof makeTempVault>;
    beforeEach(() => { vault = makeTempVault(); });
    afterEach(() => vault.cleanup());

    it('restores all four legacy roots from a populated backup', async () => {
        const backup = seedBackup(vault.pluginDataDir, '2026-05-20T17-00-00-000Z');
        // Seed backup contents
        fs.mkdirSync(path.join(backup, 'obsidian-agent', 'telemetry'), { recursive: true });
        fs.writeFileSync(path.join(backup, 'obsidian-agent', 'telemetry', 'log.json'), 'tel');
        fs.mkdirSync(path.join(backup, 'obsilo-vault'), { recursive: true });
        fs.writeFileSync(path.join(backup, 'obsilo-vault', 'knowledge.db'), 'kdb-content');
        fs.mkdirSync(path.join(backup, 'vault-operator', 'assets'), { recursive: true });
        fs.writeFileSync(path.join(backup, 'vault-operator', 'assets', 'office.js'), 'office');
        fs.mkdirSync(path.join(backup, 'obsilo-shared', 'history'), { recursive: true });
        fs.writeFileSync(path.join(backup, 'obsilo-shared', 'history', 'conv.json'), '{}');

        // Seed something in the consolidated tree that should be deleted
        fs.mkdirSync(path.join(vault.vaultBasePath, '.vault-operator', 'data'), { recursive: true });
        fs.writeFileSync(path.join(vault.vaultBasePath, '.vault-operator', 'data', 'remnant'), 'r');
        fs.mkdirSync(path.join(vault.vaultBasePath, '.vault-operator', 'cache'), { recursive: true });

        const report = await restoreLayoutFromBackup({
            vaultBasePath: vault.vaultBasePath,
            vaultParent: vault.vaultParent,
            backupPath: backup,
            removeConsolidated: true,
        });

        expect(report.allRestoreSucceeded).toBe(true);
        // Each target should be restored
        expect(fs.existsSync(path.join(vault.vaultBasePath, '.obsidian-agent', 'telemetry', 'log.json'))).toBe(true);
        expect(fs.existsSync(path.join(vault.vaultBasePath, '.obsilo-vault', 'knowledge.db'))).toBe(true);
        expect(fs.existsSync(path.join(vault.vaultBasePath, '.vault-operator', 'assets', 'office.js'))).toBe(true);
        expect(fs.existsSync(path.join(vault.vaultParent, 'obsilo-shared', 'history', 'conv.json'))).toBe(true);
        // Consolidated data + cache removed, but the .vault-operator root remains (now holding restored assets/)
        expect(fs.existsSync(path.join(vault.vaultBasePath, '.vault-operator', 'data'))).toBe(false);
        expect(fs.existsSync(path.join(vault.vaultBasePath, '.vault-operator', 'cache'))).toBe(false);
        expect(report.removedConsolidated.length).toBeGreaterThan(0);
    });

    it('refuses to overwrite a populated destination', async () => {
        const backup = seedBackup(vault.pluginDataDir, '2026-05-20T17-30-00-000Z');
        fs.mkdirSync(path.join(backup, 'obsilo-vault'), { recursive: true });
        fs.writeFileSync(path.join(backup, 'obsilo-vault', 'knowledge.db'), 'backup-db');
        // Pre-populate destination
        fs.mkdirSync(path.join(vault.vaultBasePath, '.obsilo-vault'), { recursive: true });
        fs.writeFileSync(path.join(vault.vaultBasePath, '.obsilo-vault', 'existing-file'), 'do not clobber');

        const report = await restoreLayoutFromBackup({
            vaultBasePath: vault.vaultBasePath,
            vaultParent: vault.vaultParent,
            backupPath: backup,
            removeConsolidated: true,
        });

        expect(report.allRestoreSucceeded).toBe(false);
        const blockedEntry = report.entries.find((e) => e.label === 'obsilo-vault');
        expect(blockedEntry?.status).toBe('skipped-destination-populated');
        // Pre-existing file untouched
        expect(fs.readFileSync(path.join(vault.vaultBasePath, '.obsilo-vault', 'existing-file'), 'utf8')).toBe('do not clobber');
        // Consolidated tree NOT removed because allRestoreSucceeded=false
        expect(report.removedConsolidated).toEqual([]);
    });

    it('skips empty source sub-folders without failing', async () => {
        const backup = seedBackup(vault.pluginDataDir, '2026-05-20T18-00-00-000Z');
        // Only seed one of four sub-folders. The other three should be skipped cleanly.
        fs.mkdirSync(path.join(backup, 'obsilo-vault'), { recursive: true });
        fs.writeFileSync(path.join(backup, 'obsilo-vault', 'foo'), 'bar');

        const report = await restoreLayoutFromBackup({
            vaultBasePath: vault.vaultBasePath,
            vaultParent: vault.vaultParent,
            backupPath: backup,
            removeConsolidated: false,
        });

        expect(report.allRestoreSucceeded).toBe(true);
        const skipped = report.entries.filter((e) => e.status === 'skipped-empty-source');
        expect(skipped).toHaveLength(3);
        const restored = report.entries.filter((e) => e.status === 'restored');
        expect(restored).toHaveLength(1);
    });

    it('blocks .vault-operator restore when destination has user files beyond data/+cache/', async () => {
        // The .vault-operator restore target uses isDirEmptyIgnoringConsolidated:
        // data/ and cache/ are ignored (they get removed anyway), but other
        // sub-folders count as a real population that must not be clobbered.
        const backup = seedBackup(vault.pluginDataDir, '2026-05-20T18-30-00-000Z');
        fs.mkdirSync(path.join(backup, 'vault-operator', 'assets'), { recursive: true });
        fs.writeFileSync(path.join(backup, 'vault-operator', 'assets', 'office.js'), 'office');
        // Destination has data/ + cache/ (expected, from migration) AND
        // a legacy assets/ folder that pre-dates the restore -> must block.
        fs.mkdirSync(path.join(vault.vaultBasePath, '.vault-operator', 'data'), { recursive: true });
        fs.mkdirSync(path.join(vault.vaultBasePath, '.vault-operator', 'cache'), { recursive: true });
        fs.mkdirSync(path.join(vault.vaultBasePath, '.vault-operator', 'assets'), { recursive: true });
        fs.writeFileSync(
            path.join(vault.vaultBasePath, '.vault-operator', 'assets', 'pre-existing.js'),
            'do not clobber',
        );

        const report = await restoreLayoutFromBackup({
            vaultBasePath: vault.vaultBasePath,
            vaultParent: vault.vaultParent,
            backupPath: backup,
            removeConsolidated: true,
        });

        expect(report.allRestoreSucceeded).toBe(false);
        const blockedEntry = report.entries.find((e) => e.label === 'vault-operator');
        expect(blockedEntry?.status).toBe('skipped-destination-populated');
        // Pre-existing file untouched
        expect(
            fs.readFileSync(
                path.join(vault.vaultBasePath, '.vault-operator', 'assets', 'pre-existing.js'),
                'utf8',
            ),
        ).toBe('do not clobber');
        // Consolidated tree NOT removed because allRestoreSucceeded=false
        expect(report.removedConsolidated).toEqual([]);
    });

    it('respects removeConsolidated=false even when all restores succeed', async () => {
        const backup = seedBackup(vault.pluginDataDir, '2026-05-20T19-00-00-000Z');
        fs.mkdirSync(path.join(backup, 'obsilo-vault'), { recursive: true });
        fs.writeFileSync(path.join(backup, 'obsilo-vault', 'k.db'), 'k');
        fs.mkdirSync(path.join(vault.vaultBasePath, '.vault-operator', 'data'), { recursive: true });
        fs.writeFileSync(path.join(vault.vaultBasePath, '.vault-operator', 'data', 'leftover'), 'x');

        const report = await restoreLayoutFromBackup({
            vaultBasePath: vault.vaultBasePath,
            vaultParent: vault.vaultParent,
            backupPath: backup,
            removeConsolidated: false,
        });

        expect(report.allRestoreSucceeded).toBe(true);
        expect(report.removedConsolidated).toEqual([]);
        // data/leftover is still there
        expect(fs.existsSync(path.join(vault.vaultBasePath, '.vault-operator', 'data', 'leftover'))).toBe(true);
    });
});
