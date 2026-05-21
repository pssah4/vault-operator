/**
 * Tests for AutoBackupScheduler (FEAT-29-12 Task D).
 */

import { describe, it, expect } from 'vitest';
import {
    shouldRunAutoBackup,
    autoBackupFilename,
    pickStaleBackups,
    ONE_DAY_MS,
} from '../AutoBackupScheduler';
import type { BackupSettings } from '../../../types/settings';

function settings(over: Partial<BackupSettings>): BackupSettings {
    return {
        exportSecretsAllowed: false,
        autoDailyEnabled: true,
        autoDailyTargetPath: '.vault-operator/cache/backups',
        retentionCount: 7,
        lastAutoBackupAt: 0,
        ...over,
    };
}

describe('shouldRunAutoBackup', () => {
    it('returns disabled when autoDailyEnabled=false', () => {
        const out = shouldRunAutoBackup(settings({ autoDailyEnabled: false }));
        expect(out).toEqual({ run: false, reason: 'disabled' });
    });

    it('returns run=true with reason never-ran on first launch', () => {
        const out = shouldRunAutoBackup(settings({ lastAutoBackupAt: 0 }));
        expect(out.run).toBe(true);
        if (out.run) expect(out.reason).toBe('never-ran');
    });

    it('returns run=true with reason interval-elapsed when 24h have passed', () => {
        const now = 1_000_000_000_000;
        const out = shouldRunAutoBackup(
            settings({ lastAutoBackupAt: now - ONE_DAY_MS - 1 }),
            now,
        );
        expect(out.run).toBe(true);
        if (out.run) expect(out.reason).toBe('interval-elapsed');
    });

    it('returns too-soon when less than 24h elapsed', () => {
        const now = 1_000_000_000_000;
        const out = shouldRunAutoBackup(
            settings({ lastAutoBackupAt: now - 3 * 60 * 60 * 1000 }),
            now,
        );
        expect(out).toEqual({ run: false, reason: 'too-soon' });
    });

    it('fires exactly at the 24h boundary', () => {
        const now = 1_000_000_000_000;
        const out = shouldRunAutoBackup(
            settings({ lastAutoBackupAt: now - ONE_DAY_MS }),
            now,
        );
        expect(out.run).toBe(true);
    });
});

describe('autoBackupFilename', () => {
    it('produces a lexicographically sortable UTC timestamp filename', () => {
        // AUDIT-EPIC-29 I-1: ms-precision suffix to avoid same-second collisions.
        const a = autoBackupFilename(new Date('2026-05-21T17:30:00.123Z'));
        expect(a).toBe('vault-operator-auto-2026-05-21T17-30-00-123Z.zip');
    });

    it('AUDIT-EPIC-29 I-1: two calls in the same second produce distinct filenames', () => {
        const a = autoBackupFilename(new Date('2026-05-21T17:30:00.001Z'));
        const b = autoBackupFilename(new Date('2026-05-21T17:30:00.999Z'));
        expect(a).not.toBe(b);
        // And remain lexicographically sortable (001 < 999).
        expect([b, a].sort()).toEqual([a, b]);
    });

    it('sorts in time-order via plain string comparison', () => {
        const a = autoBackupFilename(new Date('2026-05-21T01:00:00Z'));
        const b = autoBackupFilename(new Date('2026-05-21T17:30:00Z'));
        const c = autoBackupFilename(new Date('2026-05-22T08:00:00Z'));
        const arr = [c, a, b].sort();
        expect(arr).toEqual([a, b, c]);
    });
});

describe('pickStaleBackups', () => {
    it('keeps the newest N backups, returns the rest as stale', () => {
        const files = [
            'vault-operator-auto-2026-05-20T00-00-00Z.zip',
            'vault-operator-auto-2026-05-19T00-00-00Z.zip',
            'vault-operator-auto-2026-05-18T00-00-00Z.zip',
            'vault-operator-auto-2026-05-21T00-00-00Z.zip',
        ];
        const stale = pickStaleBackups(files, 2);
        // keep newest 2: 2026-05-21, 2026-05-20. stale: 19 + 18.
        expect(stale.sort()).toEqual([
            'vault-operator-auto-2026-05-18T00-00-00Z.zip',
            'vault-operator-auto-2026-05-19T00-00-00Z.zip',
        ]);
    });

    it('returns an empty list when count is at or below retention', () => {
        const files = ['a.zip', 'b.zip'];
        expect(pickStaleBackups(files, 5)).toEqual([]);
        expect(pickStaleBackups(files, 2)).toEqual([]);
    });

    it('returns ALL files as stale when retentionCount is 0 or negative', () => {
        const files = ['a.zip', 'b.zip'];
        expect(pickStaleBackups(files, 0)).toEqual(['a.zip', 'b.zip']);
        expect(pickStaleBackups(files, -1)).toEqual(['a.zip', 'b.zip']);
    });

    it('does not mutate the input array', () => {
        const files = ['c.zip', 'a.zip', 'b.zip'];
        const before = [...files];
        pickStaleBackups(files, 1);
        expect(files).toEqual(before);
    });
});
