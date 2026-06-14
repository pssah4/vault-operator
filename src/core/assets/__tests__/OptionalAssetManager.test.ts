/**
 * Regression tests for OptionalAssetManager.install() hash verification.
 *
 * ISSUE-B-selfdev-hash-mismatch: the expected hash is compiled into the
 * plugin at build time from the local source tree, while install()
 * downloads the asset of the released version. A locally built plugin
 * therefore always hits the hash-mismatch branch. The error message must
 * point those users to the 'Install from file' fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Plugin } from 'obsidian';
import { OptionalAssetManager, buildSelfDevSourceSpec } from '../OptionalAssetManager';

const { requestUrlMock } = vi.hoisted(() => ({ requestUrlMock: vi.fn() }));

vi.mock('obsidian', () => ({
    requestUrl: requestUrlMock,
}));

function toArrayBuffer(text: string): ArrayBuffer {
    const bytes = new TextEncoder().encode(text);
    const out = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(out).set(bytes);
    return out;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

interface AdapterMock {
    exists: ReturnType<typeof vi.fn>;
    mkdir: ReturnType<typeof vi.fn>;
    writeBinary: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
}

function makeAdapter(): AdapterMock {
    return {
        exists: vi.fn().mockResolvedValue(true),
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeBinary: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
    };
}

function makePlugin(adapter: AdapterMock): Plugin {
    return {
        app: { vault: { adapter } },
        manifest: { version: '2.13.7' },
    } as unknown as Plugin;
}

describe('OptionalAssetManager.install() hash verification', () => {
    beforeEach(() => {
        requestUrlMock.mockReset();
    });

    it('points locally built users to Install from file on hash mismatch', async () => {
        const released = toArrayBuffer('released bytes that differ from the local build');
        requestUrlMock.mockResolvedValue({ status: 200, arrayBuffer: released });

        const adapter = makeAdapter();
        const manager = new OptionalAssetManager(makePlugin(adapter));
        const spec = buildSelfDevSourceSpec('2.13.7', 'a'.repeat(64));

        const err = await manager.install(spec).then(
            () => null,
            (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(Error);
        const msg = (err as Error).message;
        expect(msg).toContain('Hash mismatch for self-development-source');
        expect(msg).toContain("'Install from file'");
        expect(msg).toContain('plugin-source.json');
        expect(msg).toContain('2.13.7');
        // Nothing must be persisted on mismatch.
        expect(adapter.writeBinary).not.toHaveBeenCalled();
        expect(adapter.write).not.toHaveBeenCalled();
    });

    it('persists asset and sidecar when the hash matches', async () => {
        const data = toArrayBuffer('matching bytes');
        const sha = await sha256Hex(data);
        requestUrlMock.mockResolvedValue({ status: 200, arrayBuffer: data });

        const adapter = makeAdapter();
        const manager = new OptionalAssetManager(makePlugin(adapter));
        const spec = buildSelfDevSourceSpec('2.13.7', sha);

        await expect(manager.install(spec)).resolves.toBeDefined();
        expect(adapter.writeBinary).toHaveBeenCalledWith(
            '.vault-operator/assets/plugin-source.json',
            data,
        );
        expect(adapter.write).toHaveBeenCalledWith(
            '.vault-operator/assets/plugin-source.json.sha256',
            sha,
        );
    });
});
