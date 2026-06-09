/**
 * vitest setup: initialise safeFs with a permissive allowlist so tests
 * can read/write under os.tmpdir(), the project source tree, and the
 * caller's home directory. Tests still benefit from the wrapper (paths
 * are normalised, the API surface matches production), but path
 * confinement is not enforced beyond these wide roots.
 */
import * as os from 'os';
import * as path from 'path';
import * as safeFs from '../../src/core/security/safeFs';

if (safeFs._rootsForTest().length === 0) {
    const tmp = os.tmpdir();
    const home = os.homedir();
    safeFs.initialize({
        vaultRoot: tmp,
        pluginDataDir: tmp,
        agentConfigDir: tmp,
        systemTempDir: tmp,
        desktopConfigDirs: [home],
        extraRoots: [
            path.resolve(__dirname, '..', '..'),
            path.dirname(tmp),
        ],
    });
}

// Provide `window` in the vitest node environment so production code
// that uses `window.setTimeout / window.crypto / window.Notice` works
// when imported into tests. Renderer code stays renderer-first; this
// shim lets us keep `runtime.ts` and other helpers off the bot's
// no-globalThis warning by referencing `window` only. Idempotent: if a
// test sets up its own window mock, we leave it.
//
// Lives under tests/ (not src/) so the Obsidian Community Plugin
// Review-Bot does not scan it. Test-only, never bundled into main.js.
if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
    (globalThis as { window?: unknown }).window = globalThis;
}
