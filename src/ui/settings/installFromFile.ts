/**
 * pickAndInstallAsset -- shared helper for the Install-from-file UX
 * shown in the Wizard, the Self-Development settings (DebugTab) and
 * the Reranker settings (EmbeddingsTab).
 *
 * Used as a fallback when the GitHub release does not (yet) ship the
 * asset, e.g. during local development of the plugin itself, or when
 * a user has the file on disk from another channel. The file is
 * hash-verified before it is persisted, identical to install() from a
 * GitHub download.
 */

import { Notice } from 'obsidian';
import type { OptionalAssetManager, AssetSpec } from '../../core/assets/OptionalAssetManager';

export function pickAndInstallAsset(
    manager: OptionalAssetManager,
    spec: AssetSpec,
    onDone: () => void | Promise<void>,
): void {
    const input = activeDocument.createElement('input');
    input.type = 'file';
    input.accept = spec.filename.endsWith('.wasm')
        ? '.wasm,application/wasm'
        : spec.filename.endsWith('.json')
            ? '.json,application/json'
            : '*/*';
    input.setCssStyles({ display: 'none' });
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- event handler / callback returns Promise; errors handled inside
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        try {
            const buffer = await file.arrayBuffer();
            await manager.installFromBuffer(spec, buffer);
            new Notice(`${spec.label} installed from local file.`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`Install from file failed: ${msg}`, 10_000);
        } finally {
            await onDone();
        }
    });
    activeDocument.body.appendChild(input);
    input.click();
}
