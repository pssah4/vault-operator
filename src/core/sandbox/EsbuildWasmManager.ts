/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * EsbuildWasmManager
 *
 * On-demand TypeScript compilation via esbuild-wasm. Both the JS module
 * and the WASM binary are downloaded from CDN on first use and cached
 * in the plugin data directory.
 *
 * Two compilation modes:
 * - transform(): Single file, no imports (~100ms)
 * - build(): Bundle with npm dependencies via virtual filesystem (~500ms-2s)
 *
 * Loading strategy:
 * 1. Check if JS + WASM are already cached locally
 * 2. If not, download via requestUrl (Obsidian API, no fetch)
 * 3. Load JS module via CommonJS evaluation (not dynamic import)
 * 4. Initialize esbuild with local WASM binary as ArrayBuffer
 *
 * Part of Self-Development Phase 3: Sandbox + Dynamic Modules.
 */

import { Notice, requestUrl } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ESBUILD_VERSION = '0.24.2';
const JS_CDN_URL = `https://cdn.jsdelivr.net/npm/esbuild-wasm@${ESBUILD_VERSION}/lib/browser.js`;
const WASM_CDN_URL = `https://cdn.jsdelivr.net/npm/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`;

const CACHE_DIR_NAME = 'dev-env';
const JS_CACHE_FILE = `esbuild-browser-${ESBUILD_VERSION}.js`;
const WASM_CACHE_FILE = `esbuild-${ESBUILD_VERSION}.wasm`;

/**
 * SHA-256 hashes for integrity verification of CDN downloads.
 * Generated from the official esbuild-wasm@0.24.2 npm package.
 * To update: download the files, then run:
 *   shasum -a 256 browser.js esbuild.wasm
 *
 * BUG-022 (2026-04-19, verified locally against the live jsdelivr CDN):
 *   curl -sL "https://cdn.jsdelivr.net/npm/esbuild-wasm@0.24.2/lib/browser.js" -o esb-browser.js
 *   curl -sL "https://cdn.jsdelivr.net/npm/esbuild-wasm@0.24.2/esbuild.wasm" -o esb.wasm
 *   shasum -a 256 esb-browser.js esb.wasm
 * The previous hashes (9eed... and 6cb7...) no longer matched the live
 * content -- sandbox init always failed verification until refreshed.
 */
const INTEGRITY_HASHES: Record<string, string> = {
    [JS_CACHE_FILE]: 'a8cd209161ef95d4c3c5c60e67f6ce402afd5fd2c2d2edd46d64f9fe8c7aac17',
    [WASM_CACHE_FILE]: 'e2b4b98297e04ef12981bafabf0a3c2d7c3c5cf6af603ef79d886deac3b5eeb3',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * M-2: TOFU (Trust On First Use) hash manifest for CDN-downloaded packages.
 * Stored persistently in dev-env/package-hashes.json.
 */
interface PackageHashEntry {
    hash: string;        // SHA-256 of CDN content
    version?: string;    // npm version (only for top-level packages)
    pinnedAt?: string;   // ISO date of first download
}
type PackageHashManifest = Record<string, PackageHashEntry>;

/** esbuild-wasm module interface (subset we use) */
interface EsbuildModule {
    initialize(options: { wasmModule: WebAssembly.Module }): Promise<void>;
    transform(
        source: string,
        options: Record<string, unknown>,
    ): Promise<{ code: string; warnings: unknown[] }>;
    build(
        options: Record<string, unknown>,
    ): Promise<{ outputFiles?: { text: string }[]; errors: unknown[]; warnings: unknown[] }>;
}

// ---------------------------------------------------------------------------
// EsbuildWasmManager
// ---------------------------------------------------------------------------

export class EsbuildWasmManager {
    private esbuild: EsbuildModule | null = null;
    private packageCache = new Map<string, string>();
    private readonly cacheDir: string;
    private initializing = false;
    /** Track packages for which a CDN download notice has already been shown (per session). */
    private notifiedPackages = new Set<string>();
    /** M-2: TOFU hash manifest for package integrity verification. */
    private hashManifest: PackageHashManifest = {};
    private hashManifestLoaded = false;

    constructor(private plugin: ObsidianAgentPlugin) {
        const configDir = plugin.app.vault.configDir;
        const pluginId = plugin.manifest.id;
        this.cacheDir = `${configDir}/plugins/${pluginId}/${CACHE_DIR_NAME}`;
    }

    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    /**
     * Ensure esbuild-wasm is downloaded and initialized.
     * Downloads JS (~150KB) + WASM (~11MB) from CDN on first use.
     */
    async ensureReady(): Promise<void> {
        if (this.esbuild) return;
        if (this.initializing) {
            while (this.initializing) {
                await new Promise(resolve => window.setTimeout(resolve, 100));
            }
            if (this.esbuild) return;
            throw new Error('esbuild-wasm initialization failed in another call');
        }

        this.initializing = true;
        try {
            await this.ensureCacheDir();

            // Step 1: Get the JS module (from cache or CDN)
            const jsCode = await this.getCachedOrDownloadText(JS_CACHE_FILE, JS_CDN_URL);

            // Step 2: Get the WASM binary (from cache or CDN)
            const wasmBuffer = await this.getCachedOrDownloadBinary(WASM_CACHE_FILE, WASM_CDN_URL);

            // Step 3: Load the JS module via CommonJS evaluation
            // esbuild-wasm browser.js is: (module => { ... module.exports = ... })(module)
            const esbuildModule = this.loadCommonJsModule(jsCode);

            // Step 4: Compile WASM and initialize esbuild
            const wasmModule = await WebAssembly.compile(wasmBuffer);
            await esbuildModule.initialize({ wasmModule });

            this.esbuild = esbuildModule;
            console.debug('[EsbuildWasmManager] Initialized successfully');
        } catch (e) {
            console.error('[EsbuildWasmManager] Initialization failed:', e);
            throw new Error(`Failed to initialize esbuild-wasm: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            this.initializing = false;
        }
    }

    // -----------------------------------------------------------------------
    // Compilation
    // -----------------------------------------------------------------------

    /**
     * Mode 1: Transform a single TypeScript file (no imports).
     * Fast (~100ms). Output is an IIFE that populates an exports object.
     */
    async transform(source: string): Promise<string> {
        await this.ensureReady();

        const result = await this.esbuild!.transform(source, {
            loader: 'ts',
            format: 'iife',
            target: 'es2022',
            globalName: '__module',
        });

        return `${result.code}\nif (typeof __module !== 'undefined') { Object.assign(exports, __module); }`;
    }

    /**
     * Mode 2: Bundle TypeScript with npm dependencies.
     * Uses a virtual filesystem plugin to resolve imports from cached packages.
     * Slower (~500ms-2s) but supports libraries.
     */
    async build(source: string, dependencies: string[]): Promise<string> {
        await this.ensureReady();

        await Promise.all(dependencies.map(dep => this.ensurePackage(dep)));

        const packageCache = this.packageCache;

        const result = await this.esbuild!.build({
            stdin: { contents: source, loader: 'ts', resolveDir: '.' },
            bundle: true,
            format: 'iife',
            globalName: '__module',
            target: 'es2022',
            write: false,
            plugins: [{
                name: 'virtual-packages',
                setup(build: { onResolve: (...args: unknown[]) => unknown; onLoad: (...args: unknown[]) => unknown }) {
                    build.onResolve(
                        { filter: /^[^.]/ },
                        (args: { path: string }) => ({
                            path: args.path,
                            namespace: 'pkg',
                        })
                    );
                    build.onLoad(
                        { filter: /.*/, namespace: 'pkg' },
                        (args: { path: string }) => ({
                            contents: packageCache.get(args.path) ?? `export default {};`,
                            loader: 'js',
                        })
                    );
                },
            }],
        });

        const output = result.outputFiles?.[0]?.text ?? '';
        return `${output}\nif (typeof __module !== 'undefined') { Object.assign(exports, __module); }`;
    }

    /**
     * Check if the manager is initialized.
     */
    get isReady(): boolean {
        return this.esbuild !== null;
    }

    // -----------------------------------------------------------------------
    // Module Loading
    // -----------------------------------------------------------------------

    /**
     * Load a CommonJS module from source code.
     * esbuild-wasm's browser.js is: (module => { ... module.exports = ... })(module)
     */
    private loadCommonJsModule(jsCode: string): EsbuildModule {
        type CjsModule = { exports: Record<string, unknown> };
        const mod: CjsModule = { exports: {} };
        // Indirect access to the Function constructor via Object.getPrototypeOf
        // to load the esbuild-wasm CJS bundle at runtime. jsCode is fetched from
        // a trusted CDN (esm.sh/jsdelivr) and verified via SHA-256 integrity
        // check before reaching this method; never user input.
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- see comment above
        const FnCtor = Object.getPrototypeOf(function () { /* noop */ }).constructor as new (...args: string[]) => (mod: CjsModule, exports: CjsModule['exports']) => void;
        const factory = new FnCtor('module', 'exports', jsCode);
        factory(mod, mod.exports);
        return mod.exports as unknown as EsbuildModule;
    }

    // -----------------------------------------------------------------------
    // Cache Management
    // -----------------------------------------------------------------------

    private async ensureCacheDir(): Promise<void> {
        const adapter = this.plugin.app.vault.adapter;
        if (!await adapter.exists(this.cacheDir)) {
            await adapter.mkdir(this.cacheDir);
        }
    }

    /**
     * Get a text file from local cache, or download from CDN and cache it.
     * Verifies SHA-256 integrity hash on download.
     */
    private async getCachedOrDownloadText(filename: string, cdnUrl: string): Promise<string> {
        const path = `${this.cacheDir}/${filename}`;
        const adapter = this.plugin.app.vault.adapter;

        if (await adapter.exists(path)) {
            console.debug(`[EsbuildWasmManager] Loading cached: ${filename}`);
            return await adapter.read(path);
        }

        console.debug(`[EsbuildWasmManager] Downloading: ${cdnUrl}`);
        const response = await requestUrl({ url: cdnUrl });
        if (response.status !== 200) {
            throw new Error(`Failed to download ${cdnUrl}: HTTP ${response.status}`);
        }

        // Integrity verification
        await this.verifyIntegrity(filename, response.arrayBuffer);

        await adapter.write(path, response.text);
        console.debug(`[EsbuildWasmManager] Cached: ${filename}`);
        return response.text;
    }

    /**
     * Get a binary file from local cache, or download from CDN and cache it.
     * Verifies SHA-256 integrity hash on download.
     */
    private async getCachedOrDownloadBinary(filename: string, cdnUrl: string): Promise<ArrayBuffer> {
        const path = `${this.cacheDir}/${filename}`;
        const adapter = this.plugin.app.vault.adapter;

        if (await adapter.exists(path)) {
            console.debug(`[EsbuildWasmManager] Loading cached: ${filename}`);
            return await adapter.readBinary(path);
        }

        console.debug(`[EsbuildWasmManager] Downloading: ${cdnUrl} (this may take a moment)`);
        const response = await requestUrl({ url: cdnUrl });
        if (response.status !== 200) {
            throw new Error(`Failed to download ${cdnUrl}: HTTP ${response.status}`);
        }

        // Integrity verification
        await this.verifyIntegrity(filename, response.arrayBuffer);

        await adapter.writeBinary(path, response.arrayBuffer);
        console.debug(`[EsbuildWasmManager] Cached: ${filename}`);
        return response.arrayBuffer;
    }

    /**
     * Verify SHA-256 integrity hash of downloaded content.
     * Throws if the hash does not match the expected value.
     */
    private async verifyIntegrity(filename: string, data: ArrayBuffer): Promise<void> {
        const expectedHash = INTEGRITY_HASHES[filename];
        if (!expectedHash) {
            console.warn(`[EsbuildWasmManager] No integrity hash for ${filename}, skipping verification`);
            return;
        }

        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const actualHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (actualHash !== expectedHash) {
            throw new Error(
                `Integrity check failed for ${filename}. ` +
                `Expected SHA-256: ${expectedHash}, got: ${actualHash}. ` +
                `The file may have been tampered with. Delete the cache and retry.`
            );
        }
        console.debug(`[EsbuildWasmManager] Integrity verified: ${filename}`);
    }

    // -----------------------------------------------------------------------
    // M-2: Package Integrity (TOFU + npm Registry)
    // -----------------------------------------------------------------------

    /**
     * M-2: Compute SHA-256 hash of string content.
     */
    private async computeHash(content: string): Promise<string> {
        const data = new TextEncoder().encode(content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * M-2: Load TOFU hash manifest from disk.
     */
    private async loadHashManifest(): Promise<void> {
        this.hashManifestLoaded = true;
        const path = `${this.cacheDir}/package-hashes.json`;
        try {
            const adapter = this.plugin.app.vault.adapter;
            if (await adapter.exists(path)) {
                const raw: unknown = JSON.parse(await adapter.read(path));
                if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                    this.hashManifest = raw as PackageHashManifest;
                }
            }
        } catch {
            console.warn('[EsbuildWasmManager] Failed to load package hash manifest, starting fresh');
        }
    }

    /**
     * M-2: Save TOFU hash manifest to disk.
     */
    private async saveHashManifest(): Promise<void> {
        const path = `${this.cacheDir}/package-hashes.json`;
        try {
            const adapter = this.plugin.app.vault.adapter;
            if (!(await adapter.exists(this.cacheDir))) {
                await adapter.mkdir(this.cacheDir);
            }
            await adapter.write(path, JSON.stringify(this.hashManifest, null, 2));
        } catch (e) {
            console.warn('[EsbuildWasmManager] Failed to save package hash manifest:', e);
        }
    }

    /**
     * M-2: Query npm registry for latest version and deprecation status.
     * Returns pinned version string (e.g. "4.17.21") or null on failure.
     */
    private async resolvePackageVersion(name: string): Promise<string | null> {
        try {
            const resp = await requestUrl({
                url: `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`,
                headers: { 'Accept': 'application/json' },
            });
            if (resp.status !== 200) return null;
            const raw: unknown = JSON.parse(resp.text);
            if (!raw || typeof raw !== 'object') return null;
            const data = raw as Record<string, unknown>;

            // Deprecation warning
            if (typeof data['deprecated'] === 'string') {
                console.warn(`[EsbuildWasmManager] Package "${name}" is deprecated: ${data['deprecated']}`);
                new Notice(`Warning: "${name}" is deprecated on npm`, 8000);
            }

            return typeof data['version'] === 'string' ? data['version'] : null;
        } catch {
            // Registry unavailable -- continue without pinning
            console.debug(`[EsbuildWasmManager] npm registry unavailable for "${name}", skipping version check`);
            return null;
        }
    }

    /**
     * M-2: TOFU (Trust On First Use) integrity for CDN packages.
     * - First download: compute SHA-256, store in manifest
     * - Version change: re-trust with new hash
     * - Subsequent downloads: verify against stored hash, reject on mismatch
     */
    private async verifyPackageIntegrity(key: string, content: string, version?: string | null): Promise<void> {
        if (!this.hashManifestLoaded) await this.loadHashManifest();

        const hash = await this.computeHash(content);
        const entry = this.hashManifest[key];

        if (!entry) {
            // First use -- trust and store
            this.hashManifest[key] = {
                hash,
                version: version ?? undefined,
                pinnedAt: new Date().toISOString(),
            };
            await this.saveHashManifest();
            console.debug(`[EsbuildWasmManager] TOFU: Stored hash for "${key}": ${hash.slice(0, 16)}...`);
            return;
        }

        // Version changed -- re-trust with new hash
        if (version && entry.version && version !== entry.version) {
            console.debug(`[EsbuildWasmManager] Version change for "${key}": ${entry.version} -> ${version}, re-trusting`);
            this.hashManifest[key] = {
                hash,
                version,
                pinnedAt: new Date().toISOString(),
            };
            await this.saveHashManifest();
            return;
        }

        // Same version -- verify hash
        if (hash !== entry.hash) {
            throw new Error(
                `Package integrity check failed for "${key}". ` +
                `Expected SHA-256: ${entry.hash.slice(0, 16)}..., got: ${hash.slice(0, 16)}.... ` +
                `The CDN content may have been tampered with. ` +
                `Delete ${this.cacheDir}/package-hashes.json to re-trust.`
            );
        }
        console.debug(`[EsbuildWasmManager] Integrity verified: "${key}"`);
    }

    // -----------------------------------------------------------------------
    // Package Download
    // -----------------------------------------------------------------------

    /**
     * Download an npm package from CDN and cache it in memory.
     * Prefers esm.sh ?bundle which includes all transitive dependencies.
     * Falls back to jsdelivr +esm for packages not available on esm.sh.
     *
     * After downloading, resolves absolute-path imports recursively so that
     * sub-dependencies (e.g. pptxgenjs -> jszip, or esm.sh Node polyfills)
     * are also available in the virtual filesystem.
     *
     * M-2: Queries npm registry for version pinning + deprecation check.
     * Uses TOFU integrity to detect CDN content tampering on re-download.
     */
    private async ensurePackage(name: string): Promise<void> {
        if (this.packageCache.has(name)) return;

        // Notify user about CDN download (once per package per session)
        if (!this.notifiedPackages.has(name)) {
            this.notifiedPackages.add(name);
            console.warn(`[EsbuildWasmManager] Downloading npm package "${name}" from CDN for sandbox execution`);
            new Notice(`Sandbox: Downloading "${name}" from CDN`, 5000);
        }

        // AUDIT-007 M-4: Validate package name to prevent URL injection
        if (!/^[@a-zA-Z0-9][\w./_-]*$/.test(name)) {
            throw new Error(`Invalid package name: ${name}`);
        }

        // M-2: Resolve version from npm registry for pinning + deprecation check
        const version = await this.resolvePackageVersion(name);
        const versionedName = version ? `${name}@${version}` : name;

        // Prefer esm.sh ?bundle with pinned version
        const bundleUrl = `https://esm.sh/${versionedName}?bundle`;
        try {
            const response = await requestUrl({ url: bundleUrl });
            if (response.status === 200) {
                await this.verifyPackageIntegrity(name, response.text, version);
                this.packageCache.set(name, response.text);
                // Resolve esm.sh internal imports (Node polyfills, actual bundle URLs)
                await this.resolveInternalImports(response.text, 'https://esm.sh');
                console.debug(`[EsbuildWasmManager] Cached package (esm.sh bundle): ${versionedName}`);
                return;
            }
        } catch (e) {
            // Re-throw integrity errors -- don't fall back to another CDN
            if (e instanceof Error && e.message.includes('integrity check failed')) throw e;
            console.debug(`[EsbuildWasmManager] esm.sh bundle failed for "${versionedName}", falling back to jsdelivr`);
        }

        // Fallback: jsdelivr +esm with pinned version
        const fallbackUrl = version
            ? `https://cdn.jsdelivr.net/npm/${name}@${version}/+esm`
            : `https://cdn.jsdelivr.net/npm/${name}/+esm`;
        try {
            const response = await requestUrl({ url: fallbackUrl });
            await this.verifyPackageIntegrity(name, response.text, version);
            this.packageCache.set(name, response.text);
            // Resolve jsdelivr sub-dependency imports (e.g. /npm/jszip@3.10.1/+esm)
            await this.resolveInternalImports(response.text, 'https://cdn.jsdelivr.net');
            console.debug(`[EsbuildWasmManager] Cached package (jsdelivr): ${versionedName}`);
        } catch (e) {
            console.warn(`[EsbuildWasmManager] Failed to download package "${name}":`, e);
            throw new Error(`Failed to download npm package "${name}": ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Resolve absolute-path imports found in CDN-hosted packages.
     *
     * CDN modules use internal absolute paths for sub-dependencies:
     * - esm.sh: `/node/buffer.mjs`, `/pptxgenjs@4.0.1/es2022/pptxgenjs.bundle.mjs`
     * - jsdelivr: `/npm/jszip@3.10.1/+esm`
     *
     * The virtual-packages esbuild plugin catches these paths (filter `/^[^.]/`),
     * so we download and store them in packageCache with their path as key.
     * Resolves recursively with a depth limit to handle transitive chains.
     */
    private async resolveInternalImports(
        code: string,
        cdnBase: string,
        depth = 0,
    ): Promise<void> {
        if (depth > 5) return;

        // Match absolute-path imports: import "/path", from "/path", export * from "/path"
        // Uses \s* (not \s+) because minified CDN code often omits spaces: from"/path"
        const importRegex = /(?:from|import)\s*["'](\/[^"']+)["']/g;
        let match;
        const paths: string[] = [];

        while ((match = importRegex.exec(code)) !== null) {
            const path = match[1];
            if (!this.packageCache.has(path) && !paths.includes(path)) {
                paths.push(path);
            }
        }

        for (const path of paths) {
            if (this.packageCache.has(path)) continue;

            const fullUrl = `${cdnBase}${path}`;
            try {
                const resp = await requestUrl({ url: fullUrl });
                if (resp.status === 200) {
                    // M-2: TOFU integrity for sub-dependencies
                    await this.verifyPackageIntegrity(path, resp.text);
                    this.packageCache.set(path, resp.text);
                    await this.resolveInternalImports(resp.text, cdnBase, depth + 1);
                } else {
                    console.warn(`[EsbuildWasmManager] HTTP ${resp.status} for ${fullUrl}`);
                    this.packageCache.set(path, 'export default {};');
                }
            } catch (e) {
                console.warn(`[EsbuildWasmManager] Failed to resolve ${path}:`, e);
                this.packageCache.set(path, 'export default {};');
            }
        }
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
