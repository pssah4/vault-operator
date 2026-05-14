/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * EmbeddedSourceManager
 *
 * Loads the plugin's TypeScript source code on demand from a JSON
 * bundle the user has explicitly installed into their vault. Powers
 * the `manage_source` tool: list, read, search, edit-in-memory,
 * compile, propose patch.
 *
 * Why no longer inlined into main.js: the source bundle is ~5 MB and
 * is only needed for an advanced opt-in feature. Inlining would push
 * main.js over Obsidian Sync's 5 MB threshold for every user, even
 * those who never use Self-Development. It now ships as a separate
 * file in the GitHub release and is downloaded into the vault on
 * explicit user request (Settings -> Advanced -> Self-Development).
 *
 * Storage: <vault>/.vault-operator/assets/plugin-source.json
 * Integrity: SHA256 from src/_generated/source-hash.ts, generated
 * at build time alongside the JSON.
 */
import type { Plugin } from 'obsidian';
import { safeRegex } from '../utils/safeRegex';

interface EmbeddedSourceBundle {
    version: string;
    files: Record<string, string>;
    buildConfig: Record<string, unknown>;
}

export class EmbeddedSourceManager {
    private files = new Map<string, string>();
    private version = '';
    private buildConfig: Record<string, unknown> = {};
    private loaded = false;

    constructor(private readonly plugin: Plugin) {}

    /**
     * Load the source bundle from the vault asset, if installed.
     * Returns false (without error) when the asset has not been
     * downloaded yet -- the caller surfaces the "install via Settings"
     * hint to the user.
     */
    async load(): Promise<boolean> {
        if (this.loaded) return true;

        try {
            const { OptionalAssetManager, buildSelfDevSourceSpec } = await import('../assets/OptionalAssetManager');
            const { SELF_DEV_SOURCE_SHA256 } = await import('../../_generated/source-hash');
            if (!SELF_DEV_SOURCE_SHA256) {
                console.debug('[EmbeddedSourceManager] No source hash compiled in -- dev build, skipping');
                return false;
            }
            const manager = new OptionalAssetManager(this.plugin);
            const spec = buildSelfDevSourceSpec(this.plugin.manifest.version, SELF_DEV_SOURCE_SHA256);
            const buffer = await manager.load(spec);
            if (!buffer) {
                console.debug('[EmbeddedSourceManager] Source bundle not installed -- run Settings > Advanced > Self-Development > Install');
                return false;
            }

            const decoder = new TextDecoder('utf-8');
            const bundle = JSON.parse(decoder.decode(buffer)) as EmbeddedSourceBundle;
            this.version = bundle.version;
            this.buildConfig = bundle.buildConfig;

            for (const [path, content] of Object.entries(bundle.files)) {
                try {
                    this.files.set(path, atob(content));
                } catch {
                    this.files.set(path, content);
                }
            }

            this.loaded = true;
            console.debug(`[EmbeddedSourceManager] Loaded ${this.files.size} source files (v${this.version}) from vault asset`);
            return true;
        } catch (e) {
            console.error('[EmbeddedSourceManager] Failed to load source bundle:', e);
            return false;
        }
    }

    /** Check if the source bundle is loaded. */
    get isLoaded(): boolean {
        return this.loaded;
    }

    /** Build version of the loaded bundle. */
    getVersion(): string {
        return this.version;
    }

    /** Compile config that was active when the bundle was emitted. */
    getBuildConfig(): Record<string, unknown> {
        return this.buildConfig;
    }

    /** List all source file paths the bundle contains. */
    listFiles(): string[] {
        return [...this.files.keys()].sort();
    }

    /** Read a source file by path. */
    readFile(path: string): string | undefined {
        return this.files.get(path);
    }

    /** Search for a pattern across all source files. */
    searchFiles(pattern: string): { path: string; line: number; text: string }[] {
        const regex = safeRegex(pattern, 'gi');
        const results: { path: string; line: number; text: string }[] = [];
        for (const [path, content] of this.files) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                    results.push({ path, line: i + 1, text: lines[i].trim() });
                    regex.lastIndex = 0;
                }
            }
        }
        return results;
    }

    /** Edit a source file in memory. Does NOT persist. */
    editFile(path: string, content: string): void {
        if (!this.files.has(path)) {
            console.warn(`[EmbeddedSourceManager] Creating new file: ${path}`);
        }
        this.files.set(path, content);
    }

    /** Get all files as a Map for the build process. */
    getAllFiles(): Map<string, string> {
        return new Map(this.files);
    }
}
