/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * pickAgentFolder — native OS folder picker.
 *
 * Issue #26 follow-up: users asked for Finder / Explorer / GNOME-Files style
 * selection instead of a vault-scoped fuzzy picker. Obsidian runs on Electron
 * so we reach for the renderer's dialog bridge. Depending on the Obsidian
 * version, `electron.remote` (older) or `@electron/remote` (modern) provides
 * `dialog.showOpenDialog`. Both patterns are tried before we give up.
 *
 * Returns:
 *  - `{ kind: 'vault-relative', path: '.obsidian-agent/...' }` when the chosen
 *    folder is inside the vault. The path is normalised and saved as-is.
 *  - `{ kind: 'absolute', path: '/Users/.../somewhere' }` when the user picked
 *    a folder outside the vault. For v2.5.1 this is stored but most
 *    consumers continue to use the default `.obsidian-agent` inside the vault
 *    (see getInternalAgentFolderPath). Full cross-vault support follows later.
 *  - `null` when the user cancelled or the native dialog is not available.
 */

import { App, Notice, normalizePath } from 'obsidian';
import * as path from 'path';

export type PickResult =
    | { kind: 'vault-relative'; path: string }
    | { kind: 'absolute'; path: string }
    | null;

interface ElectronDialog {
    showOpenDialog(options: {
        title?: string;
        defaultPath?: string;
        properties?: string[];
    }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

function resolveElectronDialog(): ElectronDialog | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron can only be loaded dynamically in the renderer
        const electron = require('electron');
        // Direct module (Obsidian's renderer re-exports dialog in some builds).
        if (electron?.dialog?.showOpenDialog) return electron.dialog as ElectronDialog;
        // Legacy remote bridge — still works in current Obsidian (Electron 28+).
        if (electron?.remote?.dialog?.showOpenDialog) return electron.remote.dialog as ElectronDialog;
    } catch { /* fall through */ }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron can only be loaded dynamically in the renderer
        const remote = require('@electron/remote');
        if (remote?.dialog?.showOpenDialog) return remote.dialog as ElectronDialog;
    } catch { /* fall through */ }
    return null;
}

function getVaultBasePath(app: App): string | null {
    const adapter = app.vault.adapter as unknown as { getBasePath?(): string };
    const p = adapter.getBasePath?.();
    return typeof p === 'string' && p.length > 0 ? p : null;
}

export async function pickAgentFolder(app: App): Promise<PickResult> {
    const dialog = resolveElectronDialog();
    if (!dialog) {
        new Notice('Native folder picker unavailable in this Obsidian build. Type the path manually.');
        return null;
    }

    const vaultBase = getVaultBasePath(app);

    const result = await dialog.showOpenDialog({
        title: 'Choose agent folder',
        defaultPath: vaultBase ?? undefined,
        properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    const chosen = result.filePaths[0];

    if (vaultBase) {
        // Normalise trailing separators before comparing.
        const normBase = path.resolve(vaultBase);
        const normChosen = path.resolve(chosen);
        if (normChosen === normBase || normChosen.startsWith(normBase + path.sep)) {
            const rel = path.relative(normBase, normChosen);
            // Empty relative means the user picked the vault root itself;
            // that would make the agent folder equal the vault root, which is
            // almost certainly not what they want.
            if (rel.length === 0) {
                new Notice('Picking the vault root is not allowed — choose or create a subfolder.');
                return null;
            }
            return { kind: 'vault-relative', path: normalizePath(rel.replace(/\\/g, '/')) };
        }
    }

    new Notice(
        'Folders outside the vault are partially supported in v2.5.1: the path will be saved, but plugin skills, tmp results, and the local knowledge database continue to live in the default `.obsidian-agent` folder inside your vault. Full cross-vault support is planned.',
        12_000,
    );
    return { kind: 'absolute', path: chosen };
}
