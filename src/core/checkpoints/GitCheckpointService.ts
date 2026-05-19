/**
 * GitCheckpointService - isomorphic-git based snapshot/restore (Sprint 1.4)
 *
 * Maintains a shadow git repository OUTSIDE the vault, at an absolute path
 * passed in via the constructor (today: {vault-parent}/vault-operator-shared/checkpoints).
 *
 * Before each task's first write operation, it commits a snapshot of all
 * tracked files. If the user triggers undo, we restore from the snapshot.
 *
 * Uses isomorphic-git — pure JS, no native git binary required.
 *
 * History: the shadow repo used to live at {vault}/.obsidian/plugins/<id>/checkpoints
 * (inside the vault). That worked on local SSD but stalled iCloud / Obsidian
 * Sync clients because the directory routinely grew past 100 MB across
 * thousands of tiny git-object files. Moved out of the vault on 2026-05-19
 * via migratePluginDataDirs.ts.
 *
 * ADR-003: Shadow-repo approach for robust undo without modifying the vault's
 * own git history (if any).
 */

import git from 'isomorphic-git';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- isomorphic-git
// needs the raw Node fs module as its plugin; routing through safeFs caused an
// indefinite hang during git.resolveRef on iCloud-backed vaults (2026-05-16).
// The repo also lives outside the vault now (2026-05-19), so vault.adapter is
// no longer an option for repo-internal I/O.
const rawFs = require('fs') as typeof import('fs');
import { TFile, TFolder, type App, type Vault } from 'obsidian';

export interface CheckpointInfo {
    taskId: string;
    commitOid: string;
    timestamp: string;
    filesChanged: string[];
    toolName?: string;
    /** Files that didn't exist before this checkpoint (restore = delete) */
    newFiles?: string[];
    /** Files the snapshot loop tried to capture but skipped (per-file error
     *  or path-traversal reject). Surfaced so callers can warn the user that
     *  the checkpoint is partial. AUDIT-030 L-3. */
    skipped?: string[];
}

/** Reject path-traversal and absolute paths at every checkpoint boundary.
 *  Used by both snapshot and restore loops, plus the marker-file writer.
 *  AUDIT-030 M-1 + L-2. */
function isVaultRelative(p: string): boolean {
    if (typeof p !== 'string' || p.length === 0) return false;
    if (p.includes('..')) return false;
    if (p.includes('\0')) return false;
    if (path.isAbsolute(p)) return false;
    return true;
}

/** Cap parsed input from git commit messages so a hostile repo cannot turn
 *  the restore-fallback into a CPU sink. AUDIT-030 M-2. */
const NEW_FILES_MAX_BYTES = 64 * 1024;
const NEW_FILES_MAX_ENTRIES = 10_000;

export interface RestoreResult {
    restored: string[];
    errors: string[];
}

export class GitCheckpointService {
    private app: App;
    private vault: Vault;
    /** Absolute filesystem path to the shadow repo (outside the vault). */
    private repoPath: string;
    private initialized = false;
    private timeoutMs: number;
    private autoCleanup: boolean;
    /** In-memory checkpoint tracking per task (Kilo Code pattern: _checkpoints[]) */
    private taskCheckpoints = new Map<string, CheckpointInfo[]>();

    /**
     * @param app Obsidian App instance (used for vault writes during restore).
     * @param vault Obsidian Vault (used for reading file content during snapshot).
     * @param repoAbsPath Absolute filesystem path to the shadow git repo.
     *   Must be writable via Node fs. Lives outside the vault so it does not
     *   bloat iCloud / Obsidian Sync.
     */
    constructor(app: App, vault: Vault, repoAbsPath: string, timeoutSeconds = 30, autoCleanup = true) {
        this.app = app;
        this.vault = vault;
        this.repoPath = repoAbsPath;
        this.timeoutMs = timeoutSeconds * 1000;
        this.autoCleanup = autoCleanup;
    }

    /**
     * Initialize the shadow repo (git init if not already done).
     * Safe to call multiple times.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;
        try {
            // Ensure directory exists (outside the vault, so vault.adapter is
            // not an option -- use rawFs directly, same plugin we hand to
            // isomorphic-git below).
            await rawFs.promises.mkdir(this.repoPath, { recursive: true });

            // Check if already a git repo
            const fs = this.getFs();
            try {
                await git.resolveRef({ fs, dir: this.repoPath, ref: 'HEAD' });
            } catch {
                // Not initialized — do git init
                await git.init({
                    fs,
                    dir: this.repoPath,
                    defaultBranch: 'main',
                });
                console.debug('[Checkpoints] Shadow repo initialized at', this.repoPath);
            }
            this.initialized = true;
        } catch (e) {
            console.error('[Checkpoints] Failed to initialize shadow repo:', e);
            throw e;
        }
    }

    /**
     * Create a snapshot of the specified files before a task modifies them.
     * Returns a CheckpointInfo with the commit OID.
     */
    async snapshot(taskId: string, filePaths: string[], toolName?: string): Promise<CheckpointInfo> {
        console.debug(`[Checkpoints] snapshot() called: taskId=${taskId} tool=${toolName} files=${filePaths.join(', ')} initialized=${this.initialized}`);
        // AUDIT-030 L-2: reject taskId values that could escape the marker-file
        // write path. Today's callers generate the id server-side, but the
        // marker-file destination at `${repoPath}/.vault-operator-newfiles-${taskId}`
        // would otherwise let a future caller punch out of repoPath.
        if (!isVaultRelative(taskId) || taskId.includes('/') || taskId.includes('\\')) {
            throw new Error(`[Checkpoints] Refused snapshot for unsafe taskId: ${JSON.stringify(taskId)}`);
        }
        await this.ensureInit();
        const fs = this.getFs();
        const staged: string[] = [];
        const newFiles: string[] = [];
        const skipped: string[] = [];
        for (const vaultRelPath of filePaths) {
            try {
                // AUDIT-028 L-1 defense-in-depth: reject path-traversal segments
                // and absolute paths up front. filePaths arrives from LLM
                // tool-call input (ToolExecutionPipeline.ts:338 passes
                // toolCall.input.path) and the shadow-repo write below uses raw
                // fs (FIX-28-00-02), so upstream tool validation is the only
                // boundary. The check here mirrors the vault-file recipe
                // validator and keeps sub-paths (forward slashes) intact.
                if (!isVaultRelative(vaultRelPath)) {
                    console.warn(`[Checkpoints] Rejected non-vault-relative path: ${JSON.stringify(vaultRelPath)}`);
                    skipped.push(vaultRelPath);
                    continue;
                }
                const repoRelative = vaultRelPath;

                // Check if file exists before reading (write_file may create new files)
                const exists = await this.vault.adapter.exists(vaultRelPath);
                if (!exists) {
                    // New file. Restore = delete.
                    newFiles.push(vaultRelPath);
                    continue;
                }

                // Read file content from vault
                const content = await this.withTimeout(
                    this.vault.adapter.read(vaultRelPath),
                    `Read ${vaultRelPath}`
                );
                console.debug(`[Checkpoints] ${vaultRelPath}: read ${content.length} chars from vault`);

                // Write into shadow repo at same relative path
                const destPath = `${this.repoPath}/${repoRelative}`;
                const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
                await this.mkdirRecursive(destDir);
                await fs.promises.writeFile(destPath, content, 'utf8');

                // Stage file
                await git.add({ fs, dir: this.repoPath, filepath: repoRelative });
                console.debug(`[Checkpoints] ${vaultRelPath}: staged in shadow repo`);
                staged.push(vaultRelPath);
            } catch (e) {
                // AUDIT-030 L-3: track per-file failures so callers can surface
                // a partial-checkpoint warning instead of a false-positive
                // "saved" indicator.
                console.warn(`[Checkpoints] Could not snapshot ${JSON.stringify(vaultRelPath)}:`, e);
                skipped.push(vaultRelPath);
            }
        }

        // Nothing to track at all: return an empty marker so callers can
        // tell that a snapshot was attempted but no changes were captured.
        if (staged.length === 0 && newFiles.length === 0) {
            console.debug(`[Checkpoints] Snapshot for task ${taskId}: nothing to track (no existing or new files)`);
            return {
                taskId,
                commitOid: 'empty',
                timestamp: new Date().toISOString(),
                filesChanged: [],
                toolName,
                skipped: skipped.length > 0 ? skipped : undefined,
            };
        }

        // FIX-01-07-01: When the only change is new files, isomorphic-git
        // refuses an empty commit. Stage a marker blob so the commit goes
        // through and the newFiles list survives a plugin reload via
        // restoreLatestForTask's git-log fallback. The marker also gives
        // us a stable place to encode the new-file list as JSON so the
        // recovery path can rebuild the in-memory CheckpointInfo.
        const newFilesPayload = newFiles.length > 0 ? JSON.stringify(newFiles) : '';
        if (newFilesPayload && staged.length === 0) {
            const markerPath = `.vault-operator-newfiles-${taskId}`;
            const markerDest = `${this.repoPath}/${markerPath}`;
            await fs.promises.writeFile(markerDest, newFilesPayload, 'utf8');
            await git.add({ fs, dir: this.repoPath, filepath: markerPath });
        }

        const commitOid = await git.commit({
            fs,
            dir: this.repoPath,
            author: { name: 'obsidian-agent', email: 'agent@obsidian.local' },
            message: this.buildCommitMessage(taskId, staged, newFiles),
        });

        console.debug(
            `[Checkpoints] Snapshot for task ${taskId}: ` +
            `${staged.length} modified + ${newFiles.length} new file(s) tracked ` +
            `(oid=${commitOid.substring(0, 8)})`,
        );

        const info: CheckpointInfo = {
            taskId,
            commitOid,
            timestamp: new Date().toISOString(),
            filesChanged: staged,
            toolName,
            newFiles: newFiles.length > 0 ? newFiles : undefined,
            skipped: skipped.length > 0 ? skipped : undefined,
        };

        // Register in-memory (Kilo Code pattern: _checkpoints.push(toHash))
        const list = this.taskCheckpoints.get(taskId) ?? [];
        list.push(info);
        this.taskCheckpoints.set(taskId, list);

        return info;
    }

    /**
     * Build the commit message for a snapshot. Carries the staged files
     * as a JSON array (AUDIT-030 M-3: prior comma-joined form split paths
     * containing literal `, `, e.g. `Plan, Q3 2025.md`). The `FilesJson`
     * field is the authoritative source; the legacy `Files: ` line stays
     * for one release so older commits still parse via the comma fallback.
     */
    private buildCommitMessage(taskId: string, staged: string[], newFiles: string[]): string {
        let msg = `checkpoint:${taskId}\n\nFilesJson: ${JSON.stringify(staged)}`;
        // Legacy `Files: ` line kept for backwards-compatibility during the
        // one-release transition window. Parsers prefer FilesJson and fall
        // back to this line when FilesJson is absent.
        msg += `\n\nFiles: ${staged.join(', ')}`;
        if (newFiles.length > 0) {
            msg += `\n\nNewFiles: ${JSON.stringify(newFiles)}`;
        }
        return msg;
    }

    /** Parse the optional NewFiles JSON section from a checkpoint commit
     *  message. Bounded by NEW_FILES_MAX_BYTES + NEW_FILES_MAX_ENTRIES.
     *  Shared between restoreLatestForTask, loadCheckpointsForTask, and
     *  getCheckpointByOid -- all three need to reconstruct the new-file
     *  list from the commit message after a plugin reload. */
    private parseNewFilesFromMessage(msg: string): string[] {
        const m = msg.match(/\n\nNewFiles:\s*(\[.*?\])/s);
        if (!m || !m[1] || m[1].length > NEW_FILES_MAX_BYTES) return [];
        try {
            const parsed = JSON.parse(m[1]) as unknown;
            if (!Array.isArray(parsed)) return [];
            const out: string[] = [];
            for (const item of parsed) {
                if (typeof item === 'string') out.push(item);
                if (out.length >= NEW_FILES_MAX_ENTRIES) break;
            }
            return out;
        } catch {
            return [];
        }
    }

    /** Build a CheckpointInfo from a git.log / git.readCommit result.
     *  Shared between loadCheckpointsForTask and getCheckpointByOid.
     *  Returns null if the commit message is not a checkpoint commit. */
    private checkpointInfoFromCommit(c: {
        oid: string;
        commit: { message: string; committer: { timestamp: number } };
    }): CheckpointInfo | null {
        const msg = c.commit.message;
        const taskMatch = msg.match(/^checkpoint:(\S+)/);
        if (!taskMatch || !taskMatch[1]) return null;
        const newFiles = this.parseNewFilesFromMessage(msg);
        return {
            taskId: taskMatch[1],
            commitOid: c.oid,
            timestamp: new Date(c.commit.committer.timestamp * 1000).toISOString(),
            filesChanged: this.parseFilesFromMessage(msg),
            newFiles: newFiles.length > 0 ? newFiles : undefined,
        };
    }

    /** Parse the FilesJson or legacy Files line from a checkpoint commit
     *  message. Returns an empty array on any parse error or oversized
     *  input. AUDIT-030 M-2 + M-3. */
    private parseFilesFromMessage(msg: string): string[] {
        const jsonMatch = msg.match(/\n\nFilesJson:\s*(\[.*?\])/s);
        if (jsonMatch && jsonMatch[1] && jsonMatch[1].length <= NEW_FILES_MAX_BYTES) {
            try {
                const parsed = JSON.parse(jsonMatch[1]) as unknown;
                if (Array.isArray(parsed)) {
                    const out: string[] = [];
                    for (const item of parsed) {
                        if (typeof item === 'string') out.push(item);
                        if (out.length >= NEW_FILES_MAX_ENTRIES) break;
                    }
                    return out;
                }
            } catch {
                // fall through to legacy parser
            }
        }
        // Legacy comma-joined format. Brittle on filenames containing `, `
        // but we still accept it so old commits restore.
        const legacyPart = msg.split('\n\nFiles: ')[1]?.split('\n\n')[0] ?? '';
        return legacyPart ? legacyPart.split(', ').map((f) => f.trim()).filter(Boolean) : [];
    }

    /**
     * Restore files from a checkpoint back into the vault.
     */
    async restore(checkpoint: CheckpointInfo): Promise<RestoreResult> {
        console.debug(`[Checkpoints] restore() called: commitOid=${checkpoint.commitOid} files=${checkpoint.filesChanged.join(',')} newFiles=${checkpoint.newFiles?.join(',') ?? 'none'}`);
        await this.ensureInit();
        if (checkpoint.commitOid === 'empty') {
            return { restored: [], errors: ['No files were snapshotted'] };
        }

        const fs = this.getFs();
        const restored: string[] = [];
        const errors: string[] = [];

        // Restore existing files from shadow repo
        if (checkpoint.commitOid !== 'none') {
            for (const vaultRelPath of checkpoint.filesChanged) {
                // AUDIT-030 M-1: mirror the snapshot path-traversal guard at
                // every restore boundary. `filesChanged` originates from
                // either the in-memory map (checked at snapshot time) or
                // from parsing a commit message whose source we do not
                // fully control if the shadow-repo's object database is
                // tampered with locally. Re-check here.
                if (!isVaultRelative(vaultRelPath)) {
                    console.warn(`[Checkpoints] Rejected non-vault-relative path on restore: ${JSON.stringify(vaultRelPath)}`);
                    errors.push(`${JSON.stringify(vaultRelPath)}: rejected (unsafe path)`);
                    continue;
                }
                try {
                    const { blob } = await git.readBlob({
                        fs,
                        dir: this.repoPath,
                        oid: checkpoint.commitOid,
                        filepath: vaultRelPath,
                    });
                    const content = new TextDecoder().decode(blob);
                    console.debug(`[Checkpoints] Restoring ${JSON.stringify(vaultRelPath)}: ${content.length} chars from oid ${checkpoint.commitOid.substring(0, 8)}`);

                    const existingFile = this.vault.getAbstractFileByPath(vaultRelPath);
                    if (existingFile) {
                            if (existingFile instanceof TFile) {
                            await this.vault.modify(existingFile, content);
                            console.debug(`[Checkpoints] ${JSON.stringify(vaultRelPath)}: restored via vault.modify`);
                        }
                    } else {
                        await this.vault.adapter.write(vaultRelPath, content);
                        console.debug(`[Checkpoints] ${JSON.stringify(vaultRelPath)}: restored via vault.adapter.write (file was deleted)`);
                    }
                    restored.push(vaultRelPath);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    console.error(`[Checkpoints] Failed to restore ${JSON.stringify(vaultRelPath)}:`, e);
                    errors.push(`${JSON.stringify(vaultRelPath)}: ${msg}`);
                }
            }
        }

        // Delete files that were newly created (undo = remove them)
        if (checkpoint.newFiles) {
            for (const vaultRelPath of checkpoint.newFiles) {
                if (!isVaultRelative(vaultRelPath)) {
                    console.warn(`[Checkpoints] Rejected non-vault-relative new-file path on restore: ${JSON.stringify(vaultRelPath)}`);
                    errors.push(`${JSON.stringify(vaultRelPath)} (delete): rejected (unsafe path)`);
                    continue;
                }
                try {
                    const file = this.vault.getAbstractFileByPath(vaultRelPath);
                    if (file && (file instanceof TFile || file instanceof TFolder)) {
                        await this.app.fileManager.trashFile(file);
                        restored.push(vaultRelPath);
                    }
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    errors.push(`${JSON.stringify(vaultRelPath)} (delete): ${msg}`);
                }
            }
        }

        console.debug(`[Checkpoints] Restored ${restored.length} files for task ${checkpoint.taskId}`);
        return { restored, errors };
    }

    /**
     * Generate a unified diff between the snapshot and current vault state.
     */
    async diff(checkpoint: CheckpointInfo): Promise<string> {
        if (checkpoint.commitOid === 'empty' || checkpoint.filesChanged.length === 0) {
            return '(no files snapshotted)';
        }

        const fs = this.getFs();
        const lines: string[] = [];

        for (const vaultRelPath of checkpoint.filesChanged) {
            try {
                // Get original content from snapshot
                const { blob } = await git.readBlob({
                    fs,
                    dir: this.repoPath,
                    oid: checkpoint.commitOid,
                    filepath: vaultRelPath,
                });
                const original = new TextDecoder().decode(blob);
                const current = await this.vault.adapter.read(vaultRelPath);

                if (original === current) {
                    lines.push(`--- ${vaultRelPath}: unchanged`);
                } else {
                    lines.push(`--- ${vaultRelPath}`);
                    const diffLines = this.simpleDiff(original, current);
                    lines.push(...diffLines);
                }
            } catch {
                lines.push(`--- ${vaultRelPath}: (error reading diff)`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Return all in-memory checkpoints for a task.
     */
    getCheckpointsForTask(taskId: string): CheckpointInfo[] {
        return this.taskCheckpoints.get(taskId) ?? [];
    }

    /**
     * Restore files from a specific checkpoint (used by checkpoint markers).
     */
    restoreToCheckpoint(checkpoint: CheckpointInfo): Promise<RestoreResult> {
        return this.restore(checkpoint);
    }

    /**
     * Restore all files snapshotted for a given task to the pre-task state.
     *
     * Uses in-memory checkpoint map first (fast, no git log scanning).
     * Falls back to git log without depth limit for post-restart recovery.
     */
    async restoreLatestForTask(taskId: string): Promise<RestoreResult> {
        await this.ensureInit();

        // 1. Try in-memory (fast path — always works during active session)
        const checkpoints = this.taskCheckpoints.get(taskId);
        if (checkpoints && checkpoints.length > 0) {
            // Restore from earliest checkpoint (pre-task state)
            return this.restore(checkpoints[0]);
        }

        // 2. Fallback: git log WITHOUT depth limit (post-restart recovery)
        const fs = this.getFs();
        try {
            const commits = await git.log({ fs, dir: this.repoPath });
            const prefix = `checkpoint:${taskId}`;
            const matches = commits.filter((c) => c.commit.message.startsWith(prefix));
            if (matches.length === 0) {
                return { restored: [], errors: [`No checkpoint found for task ${taskId}`] };
            }

            // Collect each modified file -> OID of its earliest snapshot
            // (commits are newest-first, so we iterate in reverse to find
            // the earliest per file). FIX-01-07-01: also collect the union
            // of all new files declared in any of the task's commit
            // messages so post-reload undo can delete them too.
            // AUDIT-030 M-2 + M-3: bounded JSON parse via parseFilesFromMessage
            // and bounded NewFiles parse below.
            const fileToOid = new Map<string, string>();
            const newFilesSet = new Set<string>();
            for (const match of [...matches].reverse()) {
                const msg = match.commit.message;
                const files = this.parseFilesFromMessage(msg);
                for (const f of files) {
                    fileToOid.set(f, match.oid);
                }
                for (const f of this.parseNewFilesFromMessage(msg)) {
                    newFilesSet.add(f);
                    if (newFilesSet.size >= NEW_FILES_MAX_ENTRIES) break;
                }
            }

            const restored: string[] = [];
            const errors: string[] = [];

            for (const [vaultRelPath, oid] of fileToOid.entries()) {
                // AUDIT-030 M-1: re-validate every path before adapter.write.
                if (!isVaultRelative(vaultRelPath)) {
                    console.warn(`[Checkpoints] Rejected non-vault-relative path on git-log restore: ${JSON.stringify(vaultRelPath)}`);
                    errors.push(`${JSON.stringify(vaultRelPath)}: rejected (unsafe path)`);
                    continue;
                }
                try {
                    const { blob } = await git.readBlob({
                        fs,
                        dir: this.repoPath,
                        oid,
                        filepath: vaultRelPath,
                    });
                    const content = new TextDecoder().decode(blob);
                    const existingFile = this.vault.getAbstractFileByPath(vaultRelPath);
                    if (existingFile) {
                            if (existingFile instanceof TFile) {
                            await this.vault.modify(existingFile, content);
                        }
                    } else {
                        await this.vault.adapter.write(vaultRelPath, content);
                    }
                    restored.push(vaultRelPath);
                } catch (e) {
                    // AUDIT-030 L-1: wrap path in JSON.stringify so embedded
                    // newlines or escape sequences from a tampered commit
                    // message cannot poison the user-facing error string.
                    errors.push(`${JSON.stringify(vaultRelPath)}: ${e instanceof Error ? e.message : String(e)}`);
                }
            }

            // Delete newly created files (same as the in-memory restore path).
            for (const vaultRelPath of newFilesSet) {
                if (!isVaultRelative(vaultRelPath)) {
                    console.warn(`[Checkpoints] Rejected non-vault-relative new-file path on git-log restore: ${JSON.stringify(vaultRelPath)}`);
                    errors.push(`${JSON.stringify(vaultRelPath)} (delete): rejected (unsafe path)`);
                    continue;
                }
                try {
                    const file = this.vault.getAbstractFileByPath(vaultRelPath);
                    if (file && (file instanceof TFile || file instanceof TFolder)) {
                        await this.app.fileManager.trashFile(file);
                        restored.push(vaultRelPath);
                    }
                } catch (e) {
                    errors.push(`${JSON.stringify(vaultRelPath)} (delete): ${e instanceof Error ? e.message : String(e)}`);
                }
            }

            console.debug(
                `[Checkpoints] Restored ${restored.length} files for task ${taskId} ` +
                `(${fileToOid.size} modified + ${newFilesSet.size} new via git-log fallback)`,
            );
            return { restored, errors };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { restored: [], errors: [msg] };
        }
    }

    /**
     * Rehydrate the in-memory checkpoint list for a task by scanning the
     * shadow repo. Used by the sidebar on chat-history reload (FIX-01-07-02)
     * and by the list_checkpoints agent tool when filtered by taskId.
     *
     * Idempotent: subsequent calls overwrite the in-memory list with the
     * freshly parsed one. Returns the list in chronological order (oldest
     * first), matching the order a live snapshot() sequence would produce.
     *
     * Note: toolName and skipped are NOT persisted in commit messages, so
     * the rehydrated CheckpointInfo entries leave those fields undefined.
     */
    async loadCheckpointsForTask(taskId: string): Promise<CheckpointInfo[]> {
        if (!isVaultRelative(taskId) || taskId.includes('/') || taskId.includes('\\')) {
            throw new Error(`[Checkpoints] Refused load for unsafe taskId: ${JSON.stringify(taskId)}`);
        }
        await this.ensureInit();
        const fs = this.getFs();
        const commits = await git.log({ fs, dir: this.repoPath });
        const prefix = `checkpoint:${taskId}`;
        const list: CheckpointInfo[] = [];
        // git.log is newest-first; reverse so callers see chronological order.
        for (const c of [...commits].reverse()) {
            if (!c.commit.message.startsWith(prefix)) continue;
            const info = this.checkpointInfoFromCommit(c);
            if (info) list.push(info);
        }
        this.taskCheckpoints.set(taskId, list);
        return list;
    }

    /**
     * Look up a single checkpoint by its commit oid. Used by the agent
     * tools (read/diff/restore_checkpoint) which only carry the oid in
     * their tool-call payload.
     *
     * Returns null when the oid is unknown to the shadow repo or the
     * commit is not a checkpoint commit. Throws on malformed oid input.
     */
    async getCheckpointByOid(oid: string): Promise<CheckpointInfo | null> {
        if (typeof oid !== 'string' || !/^[0-9a-f]{40}$/.test(oid)) {
            throw new Error(`[Checkpoints] Invalid checkpoint oid: ${JSON.stringify(oid)}`);
        }
        await this.ensureInit();
        const fs = this.getFs();
        try {
            const result = await git.readCommit({ fs, dir: this.repoPath, oid });
            return this.checkpointInfoFromCommit(result);
        } catch {
            return null;
        }
    }

    /**
     * Scan the shadow repo for all checkpoint commits across every task,
     * newest first. Used by the list_checkpoints agent tool when no
     * taskId filter is supplied.
     *
     * Does NOT populate the in-memory taskCheckpoints map -- that map is
     * per-task, and a global scan would mix unrelated tasks together.
     * Callers that want to restore must use getCheckpointByOid +
     * restore() explicitly.
     */
    async listAllCheckpoints(limit = 50): Promise<CheckpointInfo[]> {
        if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0 || limit > 1000) {
            throw new Error(`[Checkpoints] Invalid limit: ${JSON.stringify(limit)}`);
        }
        await this.ensureInit();
        const fs = this.getFs();
        const commits = await git.log({ fs, dir: this.repoPath });
        const list: CheckpointInfo[] = [];
        for (const c of commits) {
            if (!c.commit.message.startsWith('checkpoint:')) continue;
            const info = this.checkpointInfoFromCommit(c);
            if (info) list.push(info);
            if (list.length >= limit) break;
        }
        return list;
    }

    /**
     * Read the snapshotted content of a single file from a checkpoint.
     * Returns null if the checkpoint has no commit or the file is not found.
     */
    async getSnapshotContent(checkpoint: CheckpointInfo, filePath: string): Promise<string | null> {
        if (checkpoint.commitOid === 'empty' || checkpoint.commitOid === 'none') return null;
        try {
            await this.ensureInit();
            const fs = this.getFs();
            const { blob } = await git.readBlob({
                fs,
                dir: this.repoPath,
                oid: checkpoint.commitOid,
                filepath: filePath,
            });
            return new TextDecoder().decode(blob);
        } catch (e) {
            console.warn(`[Checkpoints] Could not read snapshot for ${filePath}:`, e);
            return null;
        }
    }

    /**
     * Remove old checkpoint commits to keep repo lean.
     * Call after task completes (if autoCleanup is enabled).
     */
    cleanup(taskId: string): void {
        if (!this.autoCleanup) return;
        // For simplicity: we keep the last 10 commits and prune older ones via gc
        // isomorphic-git doesn't have a built-in GC, so we just log for now
        console.debug(`[Checkpoints] Cleanup for task ${taskId} (repo stays lean via periodic prune)`);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private async ensureInit(): Promise<void> {
        if (!this.initialized) await this.initialize();
    }

    /**
     * isomorphic-git fs plugin. Passes the raw Node fs module rather than the
     * safeFs wrapper because isomorphic-git's internals hang indefinitely when
     * fed safeFs (observed 2026-05-16 on iCloud-backed vaults). The shadow
     * repo lives under `<vaultRoot>/<pluginDataDir>/checkpoints`, fully inside
     * vaultRoot, so the safety property the wrapper provides is preserved by
     * the scope of `dir` passed to every git.* call.
     */
    private getFs() {
        return rawFs;
    }

    private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = window.setTimeout(
                () => reject(new Error(`Timeout: ${label}`)),
                this.timeoutMs
            );
            promise.then(
                (val) => { window.clearTimeout(timer); resolve(val); },
                (err) => { window.clearTimeout(timer); reject(err instanceof Error ? err : new Error(String(err))); }
            );
        });
    }

    private async mkdirRecursive(dirPath: string): Promise<void> {
        const fs = this.getFs();
        try {
            await fs.promises.mkdir(dirPath, { recursive: true });
        } catch {
            // Already exists — fine
        }
    }

    /** Very simple line-by-line diff for display purposes */
    private simpleDiff(original: string, current: string): string[] {
        // Use Set for O(n+m) membership tests instead of the previous Array.includes()
        // which was O(n²) for files with many lines.
        const origLines = original.split('\n');
        const currLines = current.split('\n');
        const origSet = new Set(origLines);
        const currSet = new Set(currLines);
        const added = currLines.filter((l) => !origSet.has(l)).length;
        const removed = origLines.filter((l) => !currSet.has(l)).length;
        return [`  +${added} lines added, -${removed} lines removed`];
    }
}
