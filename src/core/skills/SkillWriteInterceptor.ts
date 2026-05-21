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

interface AdapterLike {
    write(path: string, content: string): Promise<void>;
    writeBinary?(path: string, content: ArrayBuffer): Promise<void>;
}

interface SnapshotServiceLike {
    snapshot(skillName: string, label?: 'auto' | 'pre-restore' | 'manual'): Promise<{ id: string }>;
}

export class SkillWriteInterceptor {
    private originalWrite: AdapterLike['write'] | null = null;
    private originalWriteBinary: AdapterLike['writeBinary'] | null = null;
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
        this.originalWrite = this.adapter.write.bind(this.adapter);
        if (typeof this.adapter.writeBinary === 'function') {
            this.originalWriteBinary = this.adapter.writeBinary.bind(this.adapter);
        }

        const self = this;
        this.adapter.write = async function (path: string, content: string): Promise<void> {
            await self.maybeSnapshot(path);
            return self.originalWrite!(path, content);
        };
        if (this.originalWriteBinary) {
            this.adapter.writeBinary = async function (path: string, content: ArrayBuffer): Promise<void> {
                await self.maybeSnapshot(path);
                return self.originalWriteBinary!(path, content);
            };
        }
        this.installed = true;
    }

    /**
     * Restore the original adapter methods. Useful for tests and for
     * graceful plugin unload.
     */
    uninstall(): void {
        if (!this.installed) return;
        if (this.originalWrite) {
            this.adapter.write = this.originalWrite;
            this.originalWrite = null;
        }
        if (this.originalWriteBinary) {
            this.adapter.writeBinary = this.originalWriteBinary;
            this.originalWriteBinary = null;
        }
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
