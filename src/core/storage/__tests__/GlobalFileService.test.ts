import { describe, it, expect } from 'vitest';
import { GlobalFileService } from '../GlobalFileService';
import pathModule from 'path';

describe('GlobalFileService', () => {
    describe('constructor', () => {
        it('should use vault parent directory when vaultBasePath provided', () => {
            const service = new GlobalFileService('/Users/test/Documents/MyVault');
            expect(service.getRoot()).toBe(
                pathModule.join('/Users/test/Documents', 'vault-operator-shared'),
            );
        });

        it('should use home directory when no vaultBasePath', () => {
            const service = new GlobalFileService();
            // Constructor probes for legacy folder names in the home dir and stays put if any exists;
            // otherwise it falls back to the fresh-install name. Accept all three so the test works
            // regardless of the developer's local home-dir state.
            const root = service.getRoot();
            const hasAcceptableName = ['vault-operator-shared', 'obsilo-shared', '.obsidian-agent']
                .some((name) => root.endsWith(name));
            expect(hasAcceptableName).toBe(true);
        });
    });

    describe('resolvePath', () => {
        it('should resolve relative paths within root', () => {
            const service = new GlobalFileService('/Users/test/Vault');
            const resolved = service.resolvePath('memory/user-profile.md');
            expect(resolved).toBe(
                pathModule.join('/Users/test', 'vault-operator-shared', 'memory', 'user-profile.md'),
            );
        });

        it('should block path traversal with ../', () => {
            const service = new GlobalFileService('/Users/test/Vault');
            expect(() => service.resolvePath('../../etc/passwd')).toThrow('Path traversal blocked');
        });

        it('should block path traversal with absolute paths', () => {
            const service = new GlobalFileService('/Users/test/Vault');
            // Path.join normalizes this, but if the result escapes root, it should throw
            expect(() => service.resolvePath('../../../tmp/evil')).toThrow('Path traversal blocked');
        });

        it('should allow resolving root itself', () => {
            const service = new GlobalFileService('/Users/test/Vault');
            // Empty path resolves to root — but path.join('root', '') = 'root'
            // which equals this.root, so it should NOT throw
            const resolved = service.resolvePath('');
            expect(resolved).toBe(pathModule.join('/Users/test', 'vault-operator-shared'));
        });
    });

    describe('getLegacyRoot', () => {
        it('should return a path containing .obsidian-agent in home dir', () => {
            const legacyRoot = GlobalFileService.getLegacyRoot();
            expect(legacyRoot).toContain('.obsidian-agent');
        });
    });
});
