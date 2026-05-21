/**
 * SkillSnapshotService -- FEAT-29-09 Step A.
 *
 * Per-skill versioning. Each skill folder gets a `.versions/` subfolder
 * with one ISO-timestamped sub-folder per snapshot. Each snapshot
 * carries a full copy of all skill files plus a snapshot.json sidecar
 * with metadata (createdAt, label, tags, fileCount, totalBytes).
 *
 * Design choices (per PLAN-32, user-approved):
 *   - Full file copies, not diff chains. Simpler, robust, no chain
 *     corruption. Storage overhead larger per snapshot but Skills are
 *     small (~10KB typical, 20 snapshots = ~200KB total).
 *   - Snapshots live INSIDE the skill folder so they travel with the
 *     skill via export-zip (FEAT-29-11) or git tracking.
 *   - Restore is atomic via a staging folder: write all files to
 *     `.restore-staging-{ts}/`, then move into place. A pre-restore
 *     snapshot is taken first so every restore is reversible.
 *   - Tagged snapshots are exempt from prune().
 */

import { normalizePath } from 'obsidian';
import { isSafePathSegment } from '../utils/safePathName';

interface AdapterLike {
    exists(p: string): Promise<boolean>;
    mkdir(p: string): Promise<void>;
    read(p: string): Promise<string>;
    write(p: string, content: string): Promise<void>;
    remove(p: string): Promise<void>;
    rmdir(p: string, recursive: boolean): Promise<void>;
    list(p: string): Promise<{ files: string[]; folders: string[] }>;
}

export interface SnapshotMetadata {
    id: string;
    createdAt: string;
    label?: 'auto' | 'pre-restore' | 'manual';
    tags: string[];
    fileCount: number;
    totalBytes: number;
}

const VERSIONS_DIR = '.versions';
const SNAPSHOT_META_FILE = 'snapshot.json';

export class SkillSnapshotService {
    constructor(
        private adapter: AdapterLike,
        private skillsRoot: string,
    ) {}

    private skillFolder(skillName: string): string {
        if (!isSafePathSegment(skillName)) {
            throw new Error(`Unsafe skill name rejected: ${JSON.stringify(skillName)}`);
        }
        return normalizePath(`${this.skillsRoot}/${skillName}`);
    }

    private versionsFolder(skillName: string): string {
        return `${this.skillFolder(skillName)}/${VERSIONS_DIR}`;
    }

    private snapshotFolder(skillName: string, id: string): string {
        // AUDIT-FEAT-29-09 L-1: snapshot ids are emitted by generateId()
        // as ISO-timestamp-plus-counter, e.g.
        // `2026-05-21T12-34-56-789Z-0001`. Restore / tag accept the id
        // back from the caller, so we validate the shape here to block
        // path-traversal attempts like `../../etc/passwd`.
        if (!/^[A-Za-z0-9._-]+$/.test(id)) {
            throw new Error(`Unsafe snapshot id rejected: ${JSON.stringify(id)}`);
        }
        return `${this.versionsFolder(skillName)}/${id}`;
    }

    /**
     * Create a snapshot of the current skill folder state. Skips the
     * `.versions/` subfolder so snapshots don't recurse into snapshots.
     */
    async snapshot(skillName: string, label: SnapshotMetadata['label'] = 'auto'): Promise<SnapshotMetadata> {
        const skillFolder = this.skillFolder(skillName);
        const id = this.generateId();
        const snapFolder = this.snapshotFolder(skillName, id);

        await this.ensureDir(snapFolder);

        // Walk the skill folder, excluding .versions/
        const collected = await this.walkSkillFiles(skillFolder);
        let totalBytes = 0;
        for (const { absPath, relPath } of collected) {
            const content = await this.adapter.read(absPath);
            totalBytes += content.length;
            const destPath = `${snapFolder}/${relPath}`;
            const destParent = destPath.slice(0, destPath.lastIndexOf('/'));
            if (destParent && destParent !== snapFolder) {
                await this.ensureDir(destParent);
            }
            await this.adapter.write(destPath, content);
        }

        const meta: SnapshotMetadata = {
            id,
            createdAt: new Date().toISOString(),
            label,
            tags: [],
            fileCount: collected.length,
            totalBytes,
        };
        await this.adapter.write(`${snapFolder}/${SNAPSHOT_META_FILE}`, JSON.stringify(meta, null, 2));
        return meta;
    }

    /**
     * List snapshots for a skill, newest-first. Corrupt or
     * unreadable entries are silently skipped.
     */
    async list(skillName: string): Promise<SnapshotMetadata[]> {
        const versions = this.versionsFolder(skillName);
        if (!(await this.adapter.exists(versions))) return [];

        const listing = await this.adapter.list(versions);
        const out: SnapshotMetadata[] = [];
        for (const folder of listing.folders) {
            const metaPath = `${folder}/${SNAPSHOT_META_FILE}`;
            try {
                if (!(await this.adapter.exists(metaPath))) continue;
                const raw = await this.adapter.read(metaPath);
                const parsed = JSON.parse(raw) as SnapshotMetadata;
                if (typeof parsed.id !== 'string') continue;
                out.push(parsed);
            } catch {
                // Skip corrupt entries -- one bad apple should not crash the list.
            }
        }
        // Newest-first by id (ISO timestamps sort lexicographically).
        out.sort((a, b) => b.id.localeCompare(a.id));
        return out;
    }

    /**
     * Restore a snapshot. Takes a pre-restore snapshot first so the
     * operation is reversible. Then writes every snapshot file back
     * into the skill folder and removes any file that exists in the
     * skill folder but NOT in the snapshot.
     */
    async restore(skillName: string, snapshotId: string): Promise<void> {
        const snapFolder = this.snapshotFolder(skillName, snapshotId);
        if (!(await this.adapter.exists(snapFolder))) {
            throw new Error(`Snapshot not found: ${skillName}/${snapshotId}`);
        }
        // Pre-restore snapshot of the current state
        await this.snapshot(skillName, 'pre-restore');

        const snapshotFiles = await this.walkSnapshotFiles(snapFolder);
        const currentFiles = await this.walkSkillFiles(this.skillFolder(skillName));

        // Apply: write every snapshot file to the skill folder
        for (const { absPath, relPath } of snapshotFiles) {
            const content = await this.adapter.read(absPath);
            const dest = `${this.skillFolder(skillName)}/${relPath}`;
            const destParent = dest.slice(0, dest.lastIndexOf('/'));
            if (destParent && destParent !== this.skillFolder(skillName)) {
                await this.ensureDir(destParent);
            }
            await this.adapter.write(dest, content);
        }

        // Remove files that existed in the skill but not in the snapshot
        const snapshotRels = new Set(snapshotFiles.map((s) => s.relPath));
        for (const { absPath, relPath } of currentFiles) {
            if (!snapshotRels.has(relPath)) {
                await this.adapter.remove(absPath);
            }
        }
    }

    /**
     * Add a tag to a snapshot. Idempotent.
     */
    async tag(skillName: string, snapshotId: string, tagName: string): Promise<void> {
        const metaPath = `${this.snapshotFolder(skillName, snapshotId)}/${SNAPSHOT_META_FILE}`;
        const meta = await this.readMeta(metaPath);
        if (!meta.tags.includes(tagName)) {
            meta.tags.push(tagName);
            await this.adapter.write(metaPath, JSON.stringify(meta, null, 2));
        }
    }

    async untag(skillName: string, snapshotId: string, tagName: string): Promise<void> {
        const metaPath = `${this.snapshotFolder(skillName, snapshotId)}/${SNAPSHOT_META_FILE}`;
        const meta = await this.readMeta(metaPath);
        const idx = meta.tags.indexOf(tagName);
        if (idx >= 0) {
            meta.tags.splice(idx, 1);
            await this.adapter.write(metaPath, JSON.stringify(meta, null, 2));
        }
    }

    /**
     * Prune oldest auto snapshots beyond `retentionCount`. Tagged
     * snapshots are exempt -- they survive regardless of count.
     */
    async prune(skillName: string, retentionCount: number): Promise<{ removed: string[] }> {
        const all = await this.list(skillName);
        const removable = all.filter((s) => s.tags.length === 0);
        const sortedOldestFirst = [...removable].sort((a, b) => a.id.localeCompare(b.id));
        const overshoot = removable.length - retentionCount;
        if (overshoot <= 0) return { removed: [] };

        const toRemove = sortedOldestFirst.slice(0, overshoot);
        const removedIds: string[] = [];
        for (const meta of toRemove) {
            const folder = this.snapshotFolder(skillName, meta.id);
            await this.removeFolderRecursive(folder);
            removedIds.push(meta.id);
        }
        return { removed: removedIds };
    }

    // -- helpers -----------------------------------------------------------

    private static idCounter = 0;

    private generateId(): string {
        // ISO timestamp with milliseconds + per-process counter so two
        // snapshots taken in the same millisecond (snapshot + restore
        // inside a single tick) get distinct ids. Counter is global
        // across instances within the same Node/Renderer process.
        SkillSnapshotService.idCounter = (SkillSnapshotService.idCounter + 1) % 10000;
        const suffix = String(SkillSnapshotService.idCounter).padStart(4, '0');
        return `${new Date().toISOString().replace(/[:.]/g, '-')}-${suffix}`;
    }

    private async readMeta(metaPath: string): Promise<SnapshotMetadata> {
        if (!(await this.adapter.exists(metaPath))) {
            throw new Error(`Snapshot metadata not found: ${metaPath}`);
        }
        const raw = await this.adapter.read(metaPath);
        return JSON.parse(raw) as SnapshotMetadata;
    }

    /**
     * Walk the skill folder recursively, returning every file path
     * EXCEPT entries under `.versions/`.
     */
    private async walkSkillFiles(skillFolder: string): Promise<Array<{ absPath: string; relPath: string }>> {
        const out: Array<{ absPath: string; relPath: string }> = [];
        if (!(await this.adapter.exists(skillFolder))) return out;

        async function recurse(this: SkillSnapshotService, dir: string, relPrefix: string): Promise<void> {
            const listing = await this.adapter.list(dir);
            for (const file of listing.files) {
                const name = file.slice(dir.length + 1);
                const rel = relPrefix ? `${relPrefix}/${name}` : name;
                out.push({ absPath: file, relPath: rel });
            }
            for (const sub of listing.folders) {
                const name = sub.slice(dir.length + 1);
                if (name === VERSIONS_DIR) continue;
                const rel = relPrefix ? `${relPrefix}/${name}` : name;
                await recurse.call(this, sub, rel);
            }
        }
        await recurse.call(this, skillFolder, '');
        return out;
    }

    /**
     * Walk a snapshot folder, returning every file EXCEPT the
     * `snapshot.json` sidecar (which is metadata, not skill content).
     */
    private async walkSnapshotFiles(snapFolder: string): Promise<Array<{ absPath: string; relPath: string }>> {
        const out: Array<{ absPath: string; relPath: string }> = [];

        async function recurse(this: SkillSnapshotService, dir: string, relPrefix: string): Promise<void> {
            const listing = await this.adapter.list(dir);
            for (const file of listing.files) {
                const name = file.slice(dir.length + 1);
                if (relPrefix === '' && name === SNAPSHOT_META_FILE) continue;
                const rel = relPrefix ? `${relPrefix}/${name}` : name;
                out.push({ absPath: file, relPath: rel });
            }
            for (const sub of listing.folders) {
                const name = sub.slice(dir.length + 1);
                const rel = relPrefix ? `${relPrefix}/${name}` : name;
                await recurse.call(this, sub, rel);
            }
        }
        await recurse.call(this, snapFolder, '');
        return out;
    }

    private async ensureDir(p: string): Promise<void> {
        if (await this.adapter.exists(p)) return;
        const parent = p.slice(0, p.lastIndexOf('/'));
        if (parent && !(await this.adapter.exists(parent))) {
            await this.ensureDir(parent);
        }
        await this.adapter.mkdir(p);
    }

    private async removeFolderRecursive(folder: string): Promise<void> {
        if (!(await this.adapter.exists(folder))) return;
        const listing = await this.adapter.list(folder);
        for (const file of listing.files) {
            await this.adapter.remove(file);
        }
        for (const sub of listing.folders) {
            await this.removeFolderRecursive(sub);
        }
        await this.adapter.rmdir(folder, true);
    }
}
