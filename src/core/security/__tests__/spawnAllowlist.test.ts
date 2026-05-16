import { describe, expect, it } from 'vitest';
import {
    ALLOWED_BINARIES,
    SpawnNotAllowed,
    spawnAllowed,
    spawnAllowedSync,
} from '../spawnAllowlist';

describe('spawnAllowlist', () => {
    describe('checkCommand', () => {
        it('accepts a bare allowlisted binary', () => {
            // node is allowed -- spawnAllowedSync('node', ['-e', '0']) returns a result
            const result = spawnAllowedSync('node', ['-e', 'process.exit(0)']);
            // We do not assert on status here -- node may or may not be installed in CI.
            // We only assert that the call did not throw.
            expect(result).toBeDefined();
        });

        it('accepts a full-path allowlisted binary via basename', () => {
            const candidate = process.platform === 'win32'
                ? 'C\\Program Files\\nodejs\\node.exe'
                : '/usr/local/bin/node';
            // We only check that the *check* passes -- if node is not installed at this
            // path, spawnSync will fail with ENOENT, that is fine for this test.
            expect(() => spawnAllowedSync(candidate, ['-e', 'process.exit(0)'])).not.toThrow(SpawnNotAllowed);
        });

        it('rejects a non-allowlisted binary', () => {
            expect(() => spawnAllowedSync('rm', ['-rf', '/'])).toThrow(SpawnNotAllowed);
        });

        it('rejects a binary with a shell metacharacter in the command', () => {
            expect(() => spawnAllowedSync('node; rm -rf /', [])).toThrow(SpawnNotAllowed);
            expect(() => spawnAllowedSync('node && evil', [])).toThrow(SpawnNotAllowed);
            expect(() => spawnAllowedSync('node | cat', [])).toThrow(SpawnNotAllowed);
            expect(() => spawnAllowedSync('node > /tmp/x', [])).toThrow(SpawnNotAllowed);
            expect(() => spawnAllowedSync('node `whoami`', [])).toThrow(SpawnNotAllowed);
            expect(() => spawnAllowedSync('node $(whoami)', [])).toThrow(SpawnNotAllowed);
        });

        it('rejects an empty command', () => {
            expect(() => spawnAllowedSync('', [])).toThrow(SpawnNotAllowed);
        });
    });

    describe('forceNoShell', () => {
        it('rejects shell: true', () => {
            expect(() => spawnAllowedSync('node', ['-e', '0'], { shell: true })).toThrow(SpawnNotAllowed);
        });

        it('rejects shell: "/bin/bash" or any truthy shell value', () => {
            expect(() => spawnAllowedSync('node', ['-e', '0'], { shell: '/bin/bash' })).toThrow(SpawnNotAllowed);
        });

        it('accepts shell: false explicitly', () => {
            const result = spawnAllowedSync('node', ['-e', 'process.exit(0)'], { shell: false });
            expect(result).toBeDefined();
        });

        it('accepts no shell option', () => {
            const result = spawnAllowedSync('node', ['-e', 'process.exit(0)']);
            expect(result).toBeDefined();
        });
    });

    describe('spawnAllowed (async)', () => {
        it('accepts an allowlisted binary', () => {
            const child = spawnAllowed('node', ['-e', 'process.exit(0)']);
            expect(child).toBeDefined();
            child.kill();
        });

        it('rejects a non-allowlisted binary', () => {
            expect(() => spawnAllowed('curl', ['https://evil'])).toThrow(SpawnNotAllowed);
        });

        it('rejects shell: true', () => {
            expect(() => spawnAllowed('node', ['-e', '0'], { shell: true })).toThrow(SpawnNotAllowed);
        });
    });

    describe('error properties', () => {
        it('SpawnNotAllowed carries the attempted binary and the allowlist', () => {
            try {
                spawnAllowedSync('rm', ['-rf', '/']);
            } catch (e) {
                expect(e).toBeInstanceOf(SpawnNotAllowed);
                if (e instanceof SpawnNotAllowed) {
                    expect(e.attemptedBinary).toBe('rm');
                    expect(e.allowedBinaries).toContain('node');
                    expect(e.allowedBinaries.length).toBe(Object.keys(ALLOWED_BINARIES).length);
                }
            }
        });
    });

    describe('allowlist content', () => {
        it('contains the binaries used by the plugin today', () => {
            const keys = Object.keys(ALLOWED_BINARIES);
            expect(keys).toContain('node');
            expect(keys).toContain('which');
            expect(keys).toContain('where');
            expect(keys).toContain('git');
            expect(keys).toContain('soffice');
            expect(keys).toContain('libreoffice');
            expect(keys).toContain('cloudflared');
        });

        it('every entry has a reason', () => {
            for (const [bin, meta] of Object.entries(ALLOWED_BINARIES)) {
                expect(meta.reason).toBeTruthy();
                expect(meta.reason.length).toBeGreaterThan(10);
                expect(bin).toBeTruthy();
            }
        });
    });
});
