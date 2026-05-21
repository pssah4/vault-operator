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
    // FEAT-29-05: vaultList is now async (adapter.list for hidden folders
    // is async, so the method had to follow). Tests await accordingly.
    it("lists the vault root when called with '/'", async () => {
        const bridge = makeBridge(
            [{ path: 'Inbox' }, { path: 'notes/today.md' }],
            {},
        );
        await expect(bridge.vaultList('/')).resolves.toEqual(['Inbox', 'notes/today.md']);
    });

    it("lists the vault root when called with ''", async () => {
        const bridge = makeBridge([{ path: 'a.md' }], {});
        await expect(bridge.vaultList('')).resolves.toEqual(['a.md']);
    });

    it('lists a named subfolder via getAbstractFileByPath', async () => {
        const sub = makeFolder('folder', [{ path: 'folder/x.md' }]);
        const bridge = makeBridge([], { 'folder': sub });
        await expect(bridge.vaultList('folder')).resolves.toEqual(['folder/x.md']);
    });

    it('still rejects path traversal', async () => {
        const bridge = makeBridge([], {});
        await expect(bridge.vaultList('../secret')).rejects.toThrow(/Invalid path/);
    });

    it('throws when the target exists but is not a folder', async () => {
        const bridge = makeBridge([], { 'note.md': makeNonFolder() });
        await expect(bridge.vaultList('note.md')).rejects.toThrow(/Not a folder/);
    });

    // BUG-028 (Beta-11): trailing slashes on folder paths broke the sandbox
    // because getAbstractFileByPath('Notes/') returns null in Obsidian.
    // Agents naturally type 'Notes/' when enumerating a folder.
    it("strips a trailing slash: 'Notes/' resolves like 'Notes'", async () => {
        const sub = makeFolder('Notes', [{ path: 'Notes/x.md' }]);
        const bridge = makeBridge([], { 'Notes': sub });
        await expect(bridge.vaultList('Notes/')).resolves.toEqual(['Notes/x.md']);
    });

    it("strips multiple trailing slashes", async () => {
        const sub = makeFolder('folder', [{ path: 'folder/a.md' }]);
        const bridge = makeBridge([], { 'folder': sub });
        await expect(bridge.vaultList('folder///')).resolves.toEqual(['folder/a.md']);
    });
});

// BUG-028 unit tests for the exported helper -- cover every variant the
// agents might throw at the bridge.
describe('normaliseVaultPath', () => {
    it('maps root variants to the empty string', async () => {
        const { normaliseVaultPath } = await import('../SandboxBridge');
        expect(normaliseVaultPath('/')).toBe('');
        expect(normaliseVaultPath('.')).toBe('');
        expect(normaliseVaultPath('./')).toBe('');
    });

    it('strips trailing slashes', async () => {
        const { normaliseVaultPath } = await import('../SandboxBridge');
        expect(normaliseVaultPath('Notes/')).toBe('Notes');
        expect(normaliseVaultPath('Notes/sub/')).toBe('Notes/sub');
        expect(normaliseVaultPath('Notes///')).toBe('Notes');
    });

    it('leaves clean paths unchanged', async () => {
        const { normaliseVaultPath } = await import('../SandboxBridge');
        expect(normaliseVaultPath('Notes')).toBe('Notes');
        expect(normaliseVaultPath('Notes/sub/file.md')).toBe('Notes/sub/file.md');
        expect(normaliseVaultPath('')).toBe('');
    });
});

// BUG-027 (Beta-11): circuit-breaker auto-reset so a stuck bridge does
// not wedge the agent for the rest of the session.
describe('SandboxBridge circuit auto-reset (BUG-027)', () => {
    function makeEmptyBridge() {
        return makeBridge([], {});
    }

    it('auto-resets after the cooldown window expires', async () => {
        const bridge = makeEmptyBridge();
        // Trip the breaker: 20 errors in a row.
        for (let i = 0; i < 20; i++) bridge.recordError();
        // Still tripped -- circuit is open.
        await expect(bridge.vaultList('/')).rejects.toThrow(/circuit open/);

        // Fake the cooldown by rewinding lastErrorAt 31 seconds.
        (bridge as unknown as { lastErrorAt: number }).lastErrorAt = Date.now() - 31_000;

        // Next call probes the circuit, auto-resets, and returns normally.
        await expect(bridge.vaultList('/')).resolves.toBeDefined();
    });

    it('recordSuccess clears an open circuit so consecutive good calls stay fast', async () => {
        const bridge = makeEmptyBridge();
        for (let i = 0; i < 20; i++) bridge.recordError();
        (bridge as unknown as { lastErrorAt: number }).lastErrorAt = Date.now() - 31_000;
        await expect(bridge.vaultList('/')).resolves.toBeDefined();
        // After one success, the circuit is closed AND consecutiveErrors reset.
        expect((bridge as unknown as { circuitOpen: boolean }).circuitOpen).toBe(false);
        expect((bridge as unknown as { consecutiveErrors: number }).consecutiveErrors).toBe(0);
    });
});
