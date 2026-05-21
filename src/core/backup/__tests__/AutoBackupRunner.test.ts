/**
 * Tests for AutoBackupRunner (FEAT-29-12).
 *
 * The runner orchestrates scheduler + export + secret-filter + write +
 * retention. Tests use an in-memory adapter so the full pipeline runs
 * without touching the real filesystem.
 */

import { describe, it, expect } from 'vitest';
import { maybeRunAutoBackup, AUTO_BACKUP_SELECTION } from '../AutoBackupRunner';
import { readManifest } from '../BackupExportService';
import { REDACTED_SENTINEL } from '../BackupSecretFilter';
import type { BackupFileAdapter } from '../BackupExportService';
import type { BackupSettings } from '../../../types/settings';

function settings(over: Partial<BackupSettings>): BackupSettings {
    return {
        exportSecretsAllowed: false,
        autoDailyEnabled: true,
        autoDailyTargetPath: '.vault-operator/cache/backups',
        retentionCount: 3,
        lastAutoBackupAt: 0,
        ...over,
    };
}

function makeAdapter(): BackupFileAdapter & {
    textFiles: Map<string, string>;
    binaryFiles: Map<string, Uint8Array>;
    folders: Set<string>;
    remove: (p: string) => Promise<void>;
} {
    const textFiles = new Map<string, string>();
    const binaryFiles = new Map<string, Uint8Array>();
    const folders = new Set<string>();
    return {
        textFiles, binaryFiles, folders,
        async exists(p) { return textFiles.has(p) || binaryFiles.has(p) || folders.has(p); },
        async list(p) {
            if (!folders.has(p)) throw new Error(`not a folder: ${p}`);
            const files: string[] = [];
            const innerFolders: string[] = [];
            const prefix = p.endsWith('/') ? p : p + '/';
            for (const f of [...textFiles.keys(), ...binaryFiles.keys()]) {
                if (f.startsWith(prefix) && !f.slice(prefix.length).includes('/')) files.push(f);
            }
            for (const f of folders) {
                if (f.startsWith(prefix) && f !== p && !f.slice(prefix.length).includes('/')) innerFolders.push(f);
            }
            return { files, folders: innerFolders };
        },
        async readBinary(p) {
            if (binaryFiles.has(p)) return binaryFiles.get(p)!;
            if (textFiles.has(p)) return new TextEncoder().encode(textFiles.get(p)!);
            throw new Error(`not found: ${p}`);
        },
        async writeBinary(p, data) { binaryFiles.set(p, data); },
        async read(p) {
            if (textFiles.has(p)) return textFiles.get(p)!;
            if (binaryFiles.has(p)) return new TextDecoder().decode(binaryFiles.get(p)!);
            throw new Error(`not found: ${p}`);
        },
        async write(p, data) { textFiles.set(p, data); },
        async mkdir(p) { folders.add(p); },
        async stat(p) {
            if (textFiles.has(p)) return { mtime: 0, size: textFiles.get(p)!.length };
            if (binaryFiles.has(p)) return { mtime: 0, size: binaryFiles.get(p)!.byteLength };
            return null;
        },
        async remove(p) { textFiles.delete(p); binaryFiles.delete(p); folders.delete(p); },
    };
}

describe('maybeRunAutoBackup', () => {
    it('returns ran=false when disabled', async () => {
        const adapter = makeAdapter();
        const out = await maybeRunAutoBackup(
            settings({ autoDailyEnabled: false }),
            adapter, '.vault-operator', {}, async () => {},
            Date.now(),
        );
        expect(out).toEqual({ ran: false, reason: 'disabled' });
    });

    it('returns ran=false when too soon (less than 24h)', async () => {
        const adapter = makeAdapter();
        const now = 1_000_000_000_000;
        const out = await maybeRunAutoBackup(
            settings({ lastAutoBackupAt: now - 3 * 60 * 60 * 1000 }),
            adapter, '.vault-operator', {}, async () => {},
            now,
        );
        expect(out.ran).toBe(false);
        expect(out.reason).toBe('too-soon');
    });

    it('runs on first boot (never-ran) and writes a ZIP', async () => {
        const adapter = makeAdapter();
        adapter.folders.add('.vault-operator');
        adapter.folders.add('.vault-operator/data');
        adapter.folders.add('.vault-operator/data/skills');
        adapter.folders.add('.vault-operator/data/skills/foo');
        adapter.textFiles.set('.vault-operator/data/skills/foo/SKILL.md', '# foo');
        adapter.textFiles.set('.vault-operator/data.json', JSON.stringify({ apiKey: 'sk-real', model: 'opus' }));

        const now = 1_000_000_000_000;
        let savedTs = 0;
        const out = await maybeRunAutoBackup(
            settings({ lastAutoBackupAt: 0 }),
            adapter,
            '.vault-operator',
            { apiKey: 'sk-real', model: 'opus' },
            async (ts) => { savedTs = ts; },
            now,
        );
        expect(out.ran).toBe(true);
        expect(out.filename).toMatch(/^vault-operator-auto-/);
        expect(out.bytesWritten).toBeGreaterThan(0);
        expect(savedTs).toBe(now);
        // ZIP landed in the target folder
        const written = [...adapter.binaryFiles.keys()].filter((p) => p.endsWith('.zip'));
        expect(written).toHaveLength(1);
    });

    it('strips secrets from data.json in the auto-backup (regardless of exportSecretsAllowed)', async () => {
        const adapter = makeAdapter();
        adapter.folders.add('.vault-operator');
        adapter.textFiles.set('.vault-operator/data.json', JSON.stringify({ apiKey: 'sk-real', model: 'opus' }));
        const liveSettings = { apiKey: 'sk-real', model: 'opus' };

        const now = 1_000_000_000_000;
        const out = await maybeRunAutoBackup(
            settings({ exportSecretsAllowed: true /* should NOT matter for auto */ }),
            adapter, '.vault-operator', liveSettings,
            async () => {}, now,
        );
        expect(out.ran).toBe(true);
        // Read back the ZIP, find data.json inside, verify secret is gone.
        const zipPath = [...adapter.binaryFiles.keys()].find((p) => p.endsWith('.zip'))!;
        const zipBytes = adapter.binaryFiles.get(zipPath)!;
        const manifest = await readManifest(zipBytes);
        expect(manifest.selection.exportSecrets).toBe(false);

        // The on-disk data.json on the source is unchanged
        const sourceData = JSON.parse(adapter.textFiles.get('.vault-operator/data.json')!);
        expect(sourceData.apiKey).toBe('sk-real');
    });

    it('AUTO_BACKUP_SELECTION never exports secrets', () => {
        expect(AUTO_BACKUP_SELECTION.exportSecrets).toBe(false);
    });

    it('prunes older backups beyond retentionCount', async () => {
        const adapter = makeAdapter();
        adapter.folders.add('.vault-operator');
        adapter.folders.add('.vault-operator/cache/backups');
        // Three existing auto-backups
        adapter.binaryFiles.set('.vault-operator/cache/backups/vault-operator-auto-2026-05-18T00-00-00Z.zip', new Uint8Array());
        adapter.binaryFiles.set('.vault-operator/cache/backups/vault-operator-auto-2026-05-19T00-00-00Z.zip', new Uint8Array());
        adapter.binaryFiles.set('.vault-operator/cache/backups/vault-operator-auto-2026-05-20T00-00-00Z.zip', new Uint8Array());

        const now = new Date('2026-05-21T17:00:00Z').getTime();
        const out = await maybeRunAutoBackup(
            settings({ retentionCount: 2, lastAutoBackupAt: 0 }),
            adapter,
            '.vault-operator',
            {},
            async () => {},
            now,
        );
        expect(out.ran).toBe(true);
        // After the run, 4 files were briefly present; the prune keeps newest 2.
        const remaining = [...adapter.binaryFiles.keys()]
            .filter((p) => p.includes('vault-operator-auto-'))
            .sort();
        expect(remaining.length).toBe(2);
        // The oldest two (2026-05-18 and 2026-05-19) should be gone.
        expect(remaining.some((p) => p.includes('2026-05-18'))).toBe(false);
        expect(remaining.some((p) => p.includes('2026-05-19'))).toBe(false);
    });
});
