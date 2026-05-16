/* eslint-disable @typescript-eslint/no-require-imports -- test helpers need direct fs */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as realFs from 'fs';
import {
    SafeFsViolation,
    _rootsForTest,
    assertAllowed,
    existsSync,
    initialize,
    mkdirSync,
    readFileSync,
    resetForTest,
    writeFileSync,
} from '../safeFs';

function makeTempRoots(): {
    vaultRoot: string;
    pluginDataDir: string;
    agentConfigDir: string;
    systemTempDir: string;
    desktopConfigDirs: string[];
} {
    const base = realFs.mkdtempSync(path.join(os.tmpdir(), 'safefs-test-'));
    const vaultRoot = path.join(base, 'vault');
    const pluginDataDir = path.join(vaultRoot, '.obsidian', 'plugins', 'vault-operator');
    const agentConfigDir = path.join(vaultRoot, '.obsidian-agent');
    const systemTempDir = path.join(base, 'tmp');
    const desktop = path.join(base, 'home', '.config', 'Claude');
    realFs.mkdirSync(vaultRoot, { recursive: true });
    realFs.mkdirSync(pluginDataDir, { recursive: true });
    realFs.mkdirSync(agentConfigDir, { recursive: true });
    realFs.mkdirSync(systemTempDir, { recursive: true });
    realFs.mkdirSync(desktop, { recursive: true });
    return { vaultRoot, pluginDataDir, agentConfigDir, systemTempDir, desktopConfigDirs: [desktop] };
}

describe('safeFs', () => {
    beforeEach(() => {
        resetForTest();
    });
    afterEach(() => {
        resetForTest();
    });

    describe('initialize', () => {
        it('builds the allowlist from the provided roots', () => {
            const roots = makeTempRoots();
            initialize(roots);
            const installed = _rootsForTest();
            expect(installed).toContain(path.resolve(roots.vaultRoot));
            expect(installed).toContain(path.resolve(roots.pluginDataDir));
            expect(installed).toContain(path.resolve(roots.systemTempDir));
            expect(installed).toContain(path.resolve(roots.desktopConfigDirs[0]));
        });

        it('throws on second call', () => {
            const roots = makeTempRoots();
            initialize(roots);
            expect(() => initialize(roots)).toThrow('already initialised');
        });
    });

    describe('assertAllowed', () => {
        let roots: ReturnType<typeof makeTempRoots>;

        beforeEach(() => {
            roots = makeTempRoots();
            initialize(roots);
        });

        it('accepts a file directly inside the vault root', () => {
            const ok = path.join(roots.vaultRoot, 'note.md');
            expect(() => assertAllowed(ok)).not.toThrow();
        });

        it('accepts a deeply nested file inside the plugin data dir', () => {
            const ok = path.join(roots.pluginDataDir, 'memory', 'session', '2026-05-16.json');
            expect(() => assertAllowed(ok)).not.toThrow();
        });

        it('accepts the root itself', () => {
            expect(() => assertAllowed(roots.vaultRoot)).not.toThrow();
        });

        it('rejects path traversal that escapes the vault root', () => {
            const evil = path.join(roots.vaultRoot, '..', '..', 'etc', 'passwd');
            expect(() => assertAllowed(evil)).toThrow(SafeFsViolation);
        });

        it('rejects an absolute path outside any allowlist root', () => {
            expect(() => assertAllowed('/etc/passwd')).toThrow(SafeFsViolation);
        });

        it('rejects an empty path', () => {
            expect(() => assertAllowed('')).toThrow(SafeFsViolation);
        });

        it('rejects sibling-directory escape via ..', () => {
            // <base>/vault is allowed, <base>/tmp is allowed, but <base>/other is not.
            const other = path.join(path.dirname(roots.vaultRoot), 'other', 'file');
            expect(() => assertAllowed(other)).toThrow(SafeFsViolation);
        });

        it('accepts paths inside the desktop config dirs', () => {
            const ok = path.join(roots.desktopConfigDirs[0], 'claude_desktop_config.json');
            expect(() => assertAllowed(ok)).not.toThrow();
        });

        it('rejects with a violation that names the attempted path', () => {
            try {
                assertAllowed('/etc/passwd');
            } catch (e) {
                expect(e).toBeInstanceOf(SafeFsViolation);
                if (e instanceof SafeFsViolation) {
                    expect(e.attemptedPath).toContain('passwd');
                    expect(e.allowedRoots.length).toBeGreaterThanOrEqual(4);
                }
            }
        });
    });

    describe('not initialised', () => {
        it('throws before initialize is called', () => {
            expect(() => assertAllowed('/anything')).toThrow('not initialised');
            expect(() => readFileSync('/anything')).toThrow('not initialised');
        });
    });

    describe('actual fs operations', () => {
        let roots: ReturnType<typeof makeTempRoots>;

        beforeEach(() => {
            roots = makeTempRoots();
            initialize(roots);
        });

        it('writes inside the plugin data dir', () => {
            const file = path.join(roots.pluginDataDir, 'test.txt');
            writeFileSync(file, 'hello');
            expect(realFs.readFileSync(file, 'utf-8')).toBe('hello');
        });

        it('refuses to write outside any allowlist root', () => {
            const outside = path.join(path.dirname(roots.vaultRoot), 'outside.txt');
            expect(() => writeFileSync(outside, 'evil')).toThrow(SafeFsViolation);
            expect(realFs.existsSync(outside)).toBe(false);
        });

        it('reads inside the agent config dir', () => {
            const file = path.join(roots.agentConfigDir, 'rule.md');
            realFs.writeFileSync(file, 'rule body');
            expect(readFileSync(file, 'utf-8')).toBe('rule body');
        });

        it('mkdirSync creates a subdir inside the plugin data dir', () => {
            const sub = path.join(roots.pluginDataDir, 'created', 'deep');
            mkdirSync(sub, { recursive: true });
            expect(realFs.existsSync(sub)).toBe(true);
        });

        it('existsSync returns false instead of throwing for non-existent allowlist paths', () => {
            const missing = path.join(roots.pluginDataDir, 'definitely-not-there.x');
            expect(existsSync(missing)).toBe(false);
        });

        it('existsSync still throws for paths outside the allowlist', () => {
            expect(() => existsSync('/etc/passwd')).toThrow(SafeFsViolation);
        });
    });
});

/* eslint-enable @typescript-eslint/no-require-imports -- end of safeFs test scope */
