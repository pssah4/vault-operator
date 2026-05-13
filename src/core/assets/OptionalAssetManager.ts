/**
 * OptionalAssetManager -- Phase 2.
 *
 * Manages one-time downloads of large optional assets that don't ship
 * inlined in main.js: the ONNX reranker WASM (~12 MB) and the
 * self-development source bundle (~5 MB). Both are pulled from the
 * plugin's GitHub release page at the matching plugin version, hash-
 * verified, and stored inside the user's vault.
 *
 * Why the vault and not pluginDir: writing into pluginDir triggers
 * Obsidian's "self-update" review-bot pattern. Writing to the user's
 * vault is the normal job of a plugin and is allowed. Per
 * Obsidian Developer Policies, the download is triggered only by an
 * explicit user click in the Settings UI, never silently on plugin
 * load.
 *
 * Storage layout:
 *   <vault>/.vault-operator/assets/<name>
 *   <vault>/.vault-operator/assets/<name>.sha256
 *
 * The sidecar `.sha256` file lets us detect a corrupted or partial
 * download cheaply on the next plugin start without having to re-hash
 * the binary blob every time.
 */

import { requestUrl } from 'obsidian';
import type { Plugin } from 'obsidian';

const ASSET_DIR = '.vault-operator/assets';

/**
 * Hard size cap for install() and installFromBuffer(). The known
 * assets are 5 to 12 MB, 50 MB gives generous headroom for future
 * growth and rejects an outright "wrong file" pick (e.g. a multi-GB
 * video) before we spend memory on a SHA-256 over the whole buffer.
 * AUDIT-024 L-3.
 */
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/**
 * Reject filenames that try to traverse out of the assets folder.
 * Defense-in-depth on top of the hardcoded buildRerankerSpec /
 * buildSelfDevSourceSpec callers. AUDIT-024 L-2.
 */
function assertSafeFilename(filename: string): void {
    if (
        filename.length === 0 ||
        filename.includes('/') ||
        filename.includes('\\') ||
        filename.includes('..') ||
        filename.startsWith('.')
    ) {
        throw new Error(`OptionalAssetManager: unsafe asset filename ${JSON.stringify(filename)}`);
    }
}

/** Manifest of every optional asset the plugin knows about. */
export interface AssetSpec {
    /** Unique id, also used as filename in the assets folder. */
    id: 'reranker-onnx' | 'self-development-source';
    /** Filename written to disk. */
    filename: string;
    /** Human-readable label for the Settings UI. */
    label: string;
    /** Short blurb shown next to the install button. */
    description: string;
    /** Approximate download size in MB, shown in the UI. */
    sizeMb: number;
    /** Expected SHA256 of the file content (lowercase hex). */
    expectedSha256: string;
    /** Direct download URL. Resolved against the plugin's GitHub release tag. */
    downloadUrl: string;
}

export type AssetStatus = 'not-installed' | 'installed' | 'outdated' | 'error';

export interface AssetSnapshot {
    spec: AssetSpec;
    status: AssetStatus;
    installedAt?: string;
    installedSha?: string;
    errorMessage?: string;
}

export class OptionalAssetManager {
    constructor(private readonly plugin: Plugin) {}

    /** Resolve the absolute vault-adapter path for a given asset id. */
    private filePath(spec: AssetSpec): string {
        assertSafeFilename(spec.filename);
        return `${ASSET_DIR}/${spec.filename}`;
    }

    private shaSidecarPath(spec: AssetSpec): string {
        assertSafeFilename(spec.filename);
        return `${ASSET_DIR}/${spec.filename}.sha256`;
    }

    /**
     * Read the installed asset as an ArrayBuffer. Returns null if missing
     * or if the SHA sidecar doesn't match `spec.expectedSha256`.
     */
    async load(spec: AssetSpec): Promise<ArrayBuffer | null> {
        const adapter = this.plugin.app.vault.adapter;
        const path = this.filePath(spec);
        const shaPath = this.shaSidecarPath(spec);
        try {
            if (!await adapter.exists(path)) return null;
            const sha = (await adapter.read(shaPath).catch(() => '')).trim();
            if (sha !== spec.expectedSha256) return null;
            return await adapter.readBinary(path);
        } catch {
            return null;
        }
    }

    /**
     * Return the current snapshot for an asset, for the Settings UI.
     */
    async snapshot(spec: AssetSpec): Promise<AssetSnapshot> {
        const adapter = this.plugin.app.vault.adapter;
        const path = this.filePath(spec);
        const shaPath = this.shaSidecarPath(spec);
        try {
            if (!await adapter.exists(path)) {
                return { spec, status: 'not-installed' };
            }
            const installedSha = (await adapter.read(shaPath).catch(() => '')).trim();
            if (installedSha === spec.expectedSha256) {
                const stat = await adapter.stat(path);
                return {
                    spec,
                    status: 'installed',
                    installedSha,
                    installedAt: stat ? new Date(stat.mtime).toISOString() : undefined,
                };
            }
            return { spec, status: 'outdated', installedSha };
        } catch (e) {
            return {
                spec,
                status: 'error',
                errorMessage: e instanceof Error ? e.message : String(e),
            };
        }
    }

    /**
     * Download the asset from `spec.downloadUrl`, verify the SHA256
     * against `spec.expectedSha256`, and persist into the vault.
     *
     * Returns the verified ArrayBuffer on success. Throws on any of:
     * - network error
     * - hash mismatch (no data written)
     * - filesystem error
     *
     * The progress callback is called with bytesDownloaded; total may
     * be unavailable depending on what the response gives back, so
     * callers should be defensive.
     */
    async install(
        spec: AssetSpec,
        onProgress?: (bytesDownloaded: number) => void,
    ): Promise<ArrayBuffer> {
        const adapter = this.plugin.app.vault.adapter;

        // Ensure the assets directory exists -- vault-resident, so this
        // is a normal plugin write, not a pluginDir write.
        if (!await adapter.exists(ASSET_DIR)) {
            await adapter.mkdir(ASSET_DIR);
        }

        let response;
        try {
            response = await requestUrl({ url: spec.downloadUrl });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // requestUrl throws on non-2xx by default. Detect 404 specifically
            // so we can give the user a clear message instead of a stack-trace
            // style "Request failed, status 404".
            if (/\b404\b/.test(msg)) {
                throw new Error(
                    `Asset is not published in the ${this.plugin.manifest.version} release yet. ` +
                    `If you already have this asset installed locally it keeps working. ` +
                    `Otherwise wait for the next plugin release that ships ${spec.filename}.`,
                );
            }
            throw e;
        }
        if (response.status >= 400) {
            if (response.status === 404) {
                throw new Error(
                    `Asset is not published in the ${this.plugin.manifest.version} release yet. ` +
                    `If you already have this asset installed locally it keeps working. ` +
                    `Otherwise wait for the next plugin release that ships ${spec.filename}.`,
                );
            }
            throw new Error(`Download failed: HTTP ${response.status}`);
        }
        const buffer = response.arrayBuffer;
        onProgress?.(buffer.byteLength);

        if (buffer.byteLength > MAX_ASSET_BYTES) {
            throw new Error(
                `Downloaded asset is ${Math.round(buffer.byteLength / 1024 / 1024)} MB, ` +
                `over the ${MAX_ASSET_BYTES / 1024 / 1024} MB cap. Refusing to install.`,
            );
        }

        // SHA256 verification before persisting -- a forged or partial
        // download must never become "installed".
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const sha = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        if (sha !== spec.expectedSha256) {
            throw new Error(
                `Hash mismatch for ${spec.id}: expected ${spec.expectedSha256.slice(0, 16)}..., ` +
                `got ${sha.slice(0, 16)}...`,
            );
        }

        const path = this.filePath(spec);
        await adapter.writeBinary(path, buffer);
        await adapter.write(this.shaSidecarPath(spec), sha);
        return buffer;
    }

    /**
     * Install from a buffer that the caller already has (file picker,
     * drag-and-drop). Same hash check as install(), no network. Used as
     * a fallback when the GitHub release does not (yet) ship the asset.
     */
    async installFromBuffer(spec: AssetSpec, buffer: ArrayBuffer): Promise<void> {
        const adapter = this.plugin.app.vault.adapter;

        if (buffer.byteLength > MAX_ASSET_BYTES) {
            throw new Error(
                `Selected file is ${Math.round(buffer.byteLength / 1024 / 1024)} MB, ` +
                `over the ${MAX_ASSET_BYTES / 1024 / 1024} MB cap. ` +
                `Make sure you picked the right file for ${spec.label}.`,
            );
        }

        if (!await adapter.exists(ASSET_DIR)) {
            await adapter.mkdir(ASSET_DIR);
        }

        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const sha = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        if (sha !== spec.expectedSha256) {
            throw new Error(
                `Hash mismatch for ${spec.id}: expected ${spec.expectedSha256.slice(0, 16)}..., ` +
                `got ${sha.slice(0, 16)}... ` +
                `Make sure you selected the file matching this plugin version (${this.plugin.manifest.version}).`,
            );
        }

        await adapter.writeBinary(this.filePath(spec), buffer);
        await adapter.write(this.shaSidecarPath(spec), sha);
    }

    /** Remove the installed asset and its SHA sidecar. Idempotent. */
    async remove(spec: AssetSpec): Promise<void> {
        const adapter = this.plugin.app.vault.adapter;
        for (const p of [this.filePath(spec), this.shaSidecarPath(spec)]) {
            if (await adapter.exists(p)) {
                await adapter.remove(p);
            }
        }
    }
}

/**
 * Build the asset spec for a given plugin version. The URL points at
 * the GitHub release tag matching the version, so installing an older
 * plugin build pulls the asset that ships alongside it.
 */
export function buildRerankerSpec(pluginVersion: string, expectedSha256: string): AssetSpec {
    return {
        id: 'reranker-onnx',
        filename: 'ort-wasm-simd-threaded.wasm',
        label: 'Semantic Reranker',
        description: 'Cross-encoder model that re-ranks semantic-search results by actual relevance. Runs locally on your machine, no API calls.',
        sizeMb: 12,
        expectedSha256,
        downloadUrl: `https://github.com/pssah4/vault-operator/releases/download/${pluginVersion}-assets/ort-wasm-simd-threaded.wasm`,
    };
}

export function buildSelfDevSourceSpec(pluginVersion: string, expectedSha256: string): AssetSpec {
    return {
        id: 'self-development-source',
        filename: 'plugin-source.json',
        label: 'Self-Development Source',
        description: 'Bundle of the plugin\'s TypeScript source code. Enables the manage_source tool so the agent can read its own code to answer "how does feature X work?" questions and propose code patches.',
        sizeMb: 5,
        expectedSha256,
        downloadUrl: `https://github.com/pssah4/vault-operator/releases/download/${pluginVersion}-assets/plugin-source.json`,
    };
}
