/**
 * SkillWriteInterceptor -- FEAT-29-09 Step B.
 *
 * Monkey-patches `adapter.write` / `adapter.writeBinary` on the live
 * vault adapter. Whenever a write targets a path inside
 * `<skillsRoot>/{name}/...` (but NOT inside that skill's `.versions/`
 * subfolder), a snapshot of {name} is taken BEFORE delegating to the
 * original write.
 *
 * Debounce: subsequent writes to the same skill within `debounceMs`
 * (default 5000) share the previous snapshot. Multi-file edits
 * (SKILL.md + scripts + references) produce one snapshot, not N.
 *
 * Single point of enforcement: covers WriteFileTool, EditFileTool,
 * sandbox-bridge writes (after FEAT-29-05 hidden-path fallback), and
 * manual edits via Obsidian's own editor (which go through the same
 * adapter under the hood).
 */

import type { DataAdapter } from 'obsidian';

interface AdapterLike {
    write: DataAdapter['write'];
    writeBinary?: DataAdapter['writeBinary'];
    /**
     * FIX-31-01-02: used to tell an install from an edit. Optional, because
     * the contract predates it; without it the interceptor keeps its former
     * behaviour and snapshots every write.
     */
    exists?: (path: string) => Promise<boolean>;
}

interface SnapshotServiceLike {
    snapshot(skillName: string, label?: 'auto' | 'pre-restore' | 'manual'): Promise<{ id: string }>;
}

export class SkillWriteInterceptor {
    private originalWrite: AdapterLike['write'] | null = null;
    private originalWriteBinary: AdapterLike['writeBinary'] | null = null;
    private wrappedWrite: AdapterLike['write'] | null = null;
    private wrappedWriteBinary: AdapterLike['writeBinary'] | null = null;
    private deactivate: (() => void) | null = null;
    private lastSnapshotAt = new Map<string, number>();
    private installed = false;

    constructor(
        private adapter: AdapterLike,
        private snapshotService: SnapshotServiceLike,
        private skillsRoot: string,
        private debounceMs: number = 5000,
    ) {}

    /**
     * Install the monkey-patches. Calling twice without uninstall in
     * between is a no-op.
     */
    install(): void {
        if (this.installed) return;
        const adapter = this.adapter;
        const rawWrite = adapter.write;
        const rawWriteBinary = adapter.writeBinary;
        this.originalWrite = rawWrite;
        this.originalWriteBinary = rawWriteBinary;
        // Each installation owns its lifecycle. A later plugin may retain our
        // wrapper even after unload, so it must become a transparent pass-through.
        let active = true;
        this.deactivate = () => { active = false; };
        this.wrappedWrite = (...args) => {
            // Ordinary notes must keep the adapter's arguments, receiver,
            // invocation order and original promise (issue #80).
            if (!active || !this.extractSkillName(args[0])) return rawWrite.apply(adapter, args) as Promise<void>;
            return this.maybeSnapshot(args[0]).then(() => rawWrite.apply(adapter, args) as Promise<void>);
        };
        adapter.write = this.wrappedWrite;
        if (rawWriteBinary) {
            this.wrappedWriteBinary = (...args) => {
                if (!active || !this.extractSkillName(args[0])) return rawWriteBinary.apply(adapter, args) as Promise<void>;
                return this.maybeSnapshot(args[0]).then(() => rawWriteBinary.apply(adapter, args) as Promise<void>);
            };
            adapter.writeBinary = this.wrappedWriteBinary;
        }
        this.installed = true;
    }

    /**
     * Restore the original adapter methods. Useful for tests and for
     * graceful plugin unload.
     */
    uninstall(): void {
        if (!this.installed) return;
        this.deactivate?.();
        if (this.originalWrite && this.adapter.write === this.wrappedWrite) {
            this.adapter.write = this.originalWrite;
        }
        if (this.originalWriteBinary && this.adapter.writeBinary === this.wrappedWriteBinary) {
            this.adapter.writeBinary = this.originalWriteBinary;
        }
        this.originalWrite = null;
        this.originalWriteBinary = null;
        this.wrappedWrite = null;
        this.wrappedWriteBinary = null;
        this.deactivate = null;
        this.lastSnapshotAt.clear();
        this.installed = false;
    }

    /**
     * Determine whether the path needs a snapshot and trigger one if so.
     * Errors in the snapshot service are swallowed -- the write itself
     * must always go through, even if versioning fails (data integrity
     * over history).
     */
    private async maybeSnapshot(path: string): Promise<void> {
        const skillName = this.extractSkillName(path);
        if (!skillName) return;

        const now = Date.now();
        const lastAt = this.lastSnapshotAt.get(skillName);
        if (lastAt !== undefined && now - lastAt < this.debounceMs) {
            return; // debounced
        }

        // FIX-31-01-02: a write into a skill that is not there yet is an
        // INSTALL, and there is nothing to protect. Snapshotting it anyway
        // wrote `.versions/{id}/snapshot.json` with fileCount 0 -- which
        // recreated a folder the user had just deleted, and the importer then
        // refused every later install as "already exists". Live vault,
        // 2026-08-22: that empty snapshot was the only thing left in the
        // folder. A skill exists when its SKILL.md does.
        if (this.adapter.exists) {
            const installed = await this.adapter
                .exists(`${this.skillsRoot}/${skillName}/SKILL.md`)
                .catch(() => true); // unreadable: snapshot rather than risk history
            if (!installed) return;
        }

        try {
            await this.snapshotService.snapshot(skillName, 'auto');
            this.lastSnapshotAt.set(skillName, now);
        } catch (e) {
            console.warn(
                `[SkillWriteInterceptor] Snapshot failed for ${skillName}, write continues:`,
                e instanceof Error ? e.message : String(e),
            );
        }
    }

    /**
     * Pure helper. Returns the skill name if the path looks like
     * `<skillsRoot>/{name}/...` and is NOT inside that skill's
     * `.versions/` subfolder. Otherwise null.
     *
     * Exported for tests via the internal accessor below.
     */
    private extractSkillName(path: string): string | null {
        const prefix = this.skillsRoot.endsWith('/') ? this.skillsRoot : `${this.skillsRoot}/`;
        if (!path.startsWith(prefix)) return null;
        const rest = path.slice(prefix.length);
        const firstSlash = rest.indexOf('/');
        if (firstSlash < 0) return null; // <skillsRoot>/foo (no file inside) -- not a snapshot trigger
        const skillName = rest.slice(0, firstSlash);
        if (skillName.length === 0) return null;
        const tail = rest.slice(firstSlash + 1);
        if (tail.startsWith('.versions/') || tail === '.versions') return null;
        return skillName;
    }
}
