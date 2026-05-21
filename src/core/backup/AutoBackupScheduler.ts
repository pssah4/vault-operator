/**
 * AutoBackupScheduler -- FEAT-29-12 Task D.
 *
 * On plugin boot, checks whether 24h have passed since the last
 * auto-daily backup and runs a fresh one if so. Retention prunes
 * older backups beyond settings.backup.retentionCount.
 *
 * The scheduler is plug-and-play: the trigger (onload) and the
 * actual export call live elsewhere. This file owns the timing
 * decision and the retention math -- both pure functions that the
 * tests pin without needing a fake clock or a real backup pipeline.
 */

import type { BackupSettings } from '../../types/settings';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Decide whether the scheduler should run a backup right now.
 * Returns the reason as a tag so the live log is informative.
 */
export type ShouldRunVerdict =
    | { run: true; reason: 'never-ran' | 'interval-elapsed' }
    | { run: false; reason: 'disabled' | 'too-soon' };

export function shouldRunAutoBackup(
    settings: BackupSettings,
    nowMs: number = Date.now(),
): ShouldRunVerdict {
    if (!settings.autoDailyEnabled) {
        return { run: false, reason: 'disabled' };
    }
    if (!settings.lastAutoBackupAt || settings.lastAutoBackupAt <= 0) {
        return { run: true, reason: 'never-ran' };
    }
    const sinceLast = nowMs - settings.lastAutoBackupAt;
    if (sinceLast >= ONE_DAY_MS) {
        return { run: true, reason: 'interval-elapsed' };
    }
    return { run: false, reason: 'too-soon' };
}

/**
 * Filename produced for an auto-daily backup. ISO date in UTC keeps
 * filenames lexicographically sortable, which makes the retention
 * math trivial (sort + slice).
 *
 * AUDIT-EPIC-29 I-1: includes millisecond precision so two calls in
 * the same second (unit tests, edge-case double trigger) produce
 * distinct filenames.
 */
export function autoBackupFilename(now: Date = new Date()): string {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    const ms = String(now.getUTCMilliseconds()).padStart(3, '0');
    return `vault-operator-auto-${y}-${m}-${d}T${hh}-${mm}-${ss}-${ms}Z.zip`;
}

/**
 * Pick old backups to delete so the on-disk count stays within
 * retentionCount. Files are expected to be lexicographically
 * sortable (autoBackupFilename guarantees that). Returns the list
 * of filenames to delete; never the names to keep.
 */
export function pickStaleBackups(
    files: string[],
    retentionCount: number,
): string[] {
    if (retentionCount <= 0) return [...files];
    // Sort newest-first via lexicographic order on the ISO timestamp.
    const sorted = [...files].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return sorted.slice(retentionCount);
}
