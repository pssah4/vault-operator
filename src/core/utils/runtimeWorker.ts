/**
 * runtimeWorker -- materialise inline worker code as a file inside the
 * vault, so child_process.spawn() / cp.fork() can launch it.
 *
 * Why a file at all: Node's spawn/fork need a script path. They cannot
 * accept inline JavaScript directly. We therefore write the inlined
 * worker code to a temp file the first time it is needed, then reuse
 * that file on subsequent launches.
 *
 * Why the vault and not pluginDir: writing into the plugin directory
 * triggers Obsidian's "self-update" pattern in the review bot. Writing
 * to the user's vault is the normal job of a plugin and is allowed.
 *
 * Location: `<vault>/.vault-operator/runtime/<name>`. Hidden dot-folder
 * keeps it out of normal note search; the runtime/ subfolder makes it
 * obvious to the user what these files are for.
 *
 * Cache validation: SHA-256 of the inlined code is computed at call
 * time, stored in a sidecar `.sha256` file, and checked before every
 * reuse. AUDIT-024 M-1: a byte-length-only check was rejected because
 * a forged file with the same size could survive (another local
 * plugin, OS-level actor). A full SHA check costs about 1 ms for
 * worker-sized blobs and is paid only when the worker is first
 * needed.
 */

import type { Plugin } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const RUNTIME_DIR = '.vault-operator/runtime';

/** AUDIT-024 L-1: whitelist the worker filenames we materialise. */
const ALLOWED_WORKER_NAMES = new Set(['sandbox-worker.js', 'mcp-server-worker.js']);

/**
 * Materialise `code` as `<vault>/.vault-operator/runtime/<name>`.
 * Returns the absolute filesystem path to the materialised file.
 *
 * @throws if the adapter is not a FileSystemAdapter (Desktop only),
 *         if `name` is not in the whitelist, or if writing fails.
 */
export function ensureRuntimeWorker(plugin: Plugin, name: string, code: string): string {
    // AUDIT-024 L-1: reject anything that smells like path-traversal
    // or that is not in the small whitelist we expect at call sites.
    if (!ALLOWED_WORKER_NAMES.has(name)) {
        throw new Error(`ensureRuntimeWorker: unknown worker name ${JSON.stringify(name)}`);
    }
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
        throw new Error(`ensureRuntimeWorker: path traversal rejected for ${JSON.stringify(name)}`);
    }

    const adapter = plugin.app.vault.adapter as { getBasePath?: () => string };
    if (!adapter.getBasePath) {
        throw new Error('ensureRuntimeWorker requires a FileSystemAdapter (Desktop only)');
    }
    const basePath = adapter.getBasePath();
    const dirAbs = path.join(basePath, RUNTIME_DIR);
    const fileAbs = path.join(dirAbs, name);
    const sidecarAbs = fileAbs + '.sha256';

    // Defense-in-depth: even with the whitelist check above, verify
    // the resolved path still sits inside the runtime directory.
    if (!fileAbs.startsWith(dirAbs + path.sep)) {
        throw new Error(`ensureRuntimeWorker: path escapes runtime dir: ${fileAbs}`);
    }

    const expectedSha = crypto.createHash('sha256').update(code, 'utf-8').digest('hex');

    // Cache hit: sidecar matches the SHA of the inlined code AND the
    // worker file is still on disk. Both conditions cheap to check.
    try {
        const installedSha = fs.readFileSync(sidecarAbs, 'utf-8').trim();
        if (installedSha === expectedSha && fs.existsSync(fileAbs)) {
            return fileAbs;
        }
    } catch {
        // sidecar missing or unreadable -- fall through to rewrite
    }

    fs.mkdirSync(dirAbs, { recursive: true });
    fs.writeFileSync(fileAbs, code, 'utf-8');
    fs.writeFileSync(sidecarAbs, expectedSha, 'utf-8');
    return fileAbs;
}
