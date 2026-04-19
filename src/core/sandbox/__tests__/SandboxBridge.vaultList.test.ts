/**
 * BUG-022 regression: SandboxBridge.vaultList must handle the vault root
 * (passed as '/' by sandbox scripts) without throwing "Not a folder".
 *
 * The stubbed obsidian module doesn't ship real TFolder children, so the
 * test wires a minimal fake vault that returns a TFolder-shaped object
 * whose prototype matches the stub's TFolder class -- that is enough for
 * the `instanceof TFolder` check in the production code.
 */

import { describe, it, expect } from 'vitest';
import { TFolder } from 'obsidian';
import { SandboxBridge } from '../SandboxBridge';

interface FakeChild { path: string }

function makeFolder(path: string, children: FakeChild[]): unknown {
    const folder = Object.create(TFolder.prototype) as Record<string, unknown>;
    folder.path = path;
    folder.children = children;
    return folder;
}

function makeNonFolder(): unknown {
    return { path: 'note.md' };
}

function makeBridge(rootChildren: FakeChild[], byPath: Record<string, unknown>) {
    const vault = {
        getRoot: () => makeFolder('', rootChildren),
        getAbstractFileByPath: (p: string) => byPath[p] ?? null,
        configDir: 'configDirStub',
    };
    const plugin = {
        app: { vault },
    } as unknown as import('../../../main').default;
    return new SandboxBridge(plugin);
}

describe('SandboxBridge.vaultList root handling (BUG-022)', () => {
    it("lists the vault root when called with '/'", () => {
        const bridge = makeBridge(
            [{ path: 'Inbox' }, { path: 'notes/today.md' }],
            {},
        );
        expect(bridge.vaultList('/')).toEqual(['Inbox', 'notes/today.md']);
    });

    it("lists the vault root when called with ''", () => {
        const bridge = makeBridge([{ path: 'a.md' }], {});
        expect(bridge.vaultList('')).toEqual(['a.md']);
    });

    it('lists a named subfolder via getAbstractFileByPath', () => {
        const sub = makeFolder('folder', [{ path: 'folder/x.md' }]);
        const bridge = makeBridge([], { 'folder': sub });
        expect(bridge.vaultList('folder')).toEqual(['folder/x.md']);
    });

    it('still rejects path traversal', () => {
        const bridge = makeBridge([], {});
        expect(() => bridge.vaultList('../secret')).toThrow(/Invalid path/);
    });

    it('throws when the target exists but is not a folder', () => {
        const bridge = makeBridge([], { 'note.md': makeNonFolder() });
        expect(() => bridge.vaultList('note.md')).toThrow(/Not a folder/);
    });
});
