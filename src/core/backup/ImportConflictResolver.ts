/**
 * ImportConflictResolver -- FEAT-29-12 Task C.
 *
 * Pure decision logic for the "what happens when an incoming backup
 * file collides with an existing file in the target vault" question.
 * UI lives in BackupImportConflictModal; this file is the testable
 * core.
 *
 * Workflow:
 *   1. detectConflicts(target, incoming) -- compare file lists by path
 *      and produce a Conflict[] (same path on both sides).
 *   2. applyResolution(resolution, conflicts, incoming) -- shape the
 *      final write-list based on the user's choice.
 *
 * Resolutions:
 *   - overwrite-all  : every incoming file wins
 *   - skip-all       : every conflicting incoming file is dropped, only
 *                      non-conflicting incoming files are written
 *   - per-item       : user passes a per-path decision map
 */

import type { BackupFile } from './BackupExportService';

export interface ConflictEntry {
    path: string;
    /** Whether the bytes differ. When false, the conflict is a no-op and the resolver can drop it silently. */
    bytesDiffer: boolean;
    /** Size of the file currently in the vault. */
    targetSize: number;
    /** Size of the file in the incoming backup. */
    incomingSize: number;
}

export type ResolutionKind = 'overwrite-all' | 'skip-all' | 'per-item';

export interface Resolution {
    kind: ResolutionKind;
    /** Only consulted when kind === 'per-item'. Maps path -> action. */
    perItem?: Record<string, 'overwrite' | 'skip'>;
}

export interface PlannedWrite {
    file: BackupFile;
    /** 'new'   -- target had no file at that path
     *  'overwrite' -- target had a file, incoming wins per resolution */
    kind: 'new' | 'overwrite';
}

/**
 * Compare two file-by-path sets. Returns the list of paths present in
 * both with metadata for the UI (size diff + content diff bit).
 * The bytesDiffer flag uses byte-by-byte comparison; identical files
 * are reported with bytesDiffer=false so the UI can hide trivial
 * collisions if it wants.
 */
export function detectConflicts(
    targetFiles: BackupFile[],
    incomingFiles: BackupFile[],
): ConflictEntry[] {
    const target = new Map<string, BackupFile>();
    for (const f of targetFiles) target.set(f.path, f);
    const out: ConflictEntry[] = [];
    for (const f of incomingFiles) {
        const t = target.get(f.path);
        if (!t) continue;
        out.push({
            path: f.path,
            bytesDiffer: !byteArraysEqual(t.content, f.content),
            targetSize: t.content.byteLength,
            incomingSize: f.content.byteLength,
        });
    }
    out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return out;
}

/**
 * Given the conflict list and the user's resolution, return the
 * actual write plan (one entry per path that will land on disk).
 *
 * Non-conflicting incoming files are always written. The resolution
 * only shapes what happens at conflicting paths.
 */
export function applyResolution(
    resolution: Resolution,
    targetFiles: BackupFile[],
    incomingFiles: BackupFile[],
): PlannedWrite[] {
    const targetPaths = new Set(targetFiles.map((f) => f.path));
    const out: PlannedWrite[] = [];
    for (const f of incomingFiles) {
        const isConflict = targetPaths.has(f.path);
        if (!isConflict) {
            out.push({ file: f, kind: 'new' });
            continue;
        }
        const decision = resolveOne(resolution, f.path);
        if (decision === 'overwrite') {
            out.push({ file: f, kind: 'overwrite' });
        }
        // 'skip' -> drop
    }
    return out;
}

function resolveOne(resolution: Resolution, path: string): 'overwrite' | 'skip' {
    if (resolution.kind === 'overwrite-all') return 'overwrite';
    if (resolution.kind === 'skip-all') return 'skip';
    // per-item: fall back to 'skip' for unmapped paths (safer default).
    return (resolution.perItem?.[path] ?? 'skip');
}

function byteArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * Summary stats for the import-conflict modal heading line.
 * "47 incoming, 3 conflicts (2 modified, 1 identical), 44 new"
 */
export function summariseImport(
    targetFiles: BackupFile[],
    incomingFiles: BackupFile[],
): {
    incomingCount: number;
    conflictCount: number;
    modifiedConflicts: number;
    identicalConflicts: number;
    newFiles: number;
} {
    const conflicts = detectConflicts(targetFiles, incomingFiles);
    const identical = conflicts.filter((c) => !c.bytesDiffer).length;
    return {
        incomingCount: incomingFiles.length,
        conflictCount: conflicts.length,
        modifiedConflicts: conflicts.length - identical,
        identicalConflicts: identical,
        newFiles: incomingFiles.length - conflicts.length,
    };
}
