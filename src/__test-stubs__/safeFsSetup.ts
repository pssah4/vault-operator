/**
 * vitest setup: initialise safeFs with a permissive allowlist so tests
 * can read/write under os.tmpdir(), the project source tree, and the
 * caller's home directory. Tests still benefit from the wrapper (paths
 * are normalised, the API surface matches production), but path
 * confinement is not enforced beyond these wide roots.
 */
import * as os from 'os';
import * as path from 'path';
import * as safeFs from '../core/security/safeFs';

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
