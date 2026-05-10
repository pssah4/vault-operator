/**
 * BUG-019 bridge to Obsidian's internal drag manager.
 *
 * Obsidian's file explorer, search results, and other core views place the
 * dragged item on `app.dragManager.draggable` rather than on the standard
 * `DataTransfer`. The shape of `draggable` depends on the source:
 *
 *   - file  -> `{ type: 'file', file: TFile }`
 *   - files -> `{ type: 'files', files: TFile[] }`
 *
 * This is undocumented but stable across Obsidian 1.4+ (2024-2026) and is
 * the only way to accept internal drags without asking users to hold
 * modifier keys.
 *
 * Kept in a thin, tested module so the sidebar view doesn't carry the
 * reflection logic.
 */

import type { App } from 'obsidian';
import { TFile } from 'obsidian';

interface DragManagerLike {
    draggable?: unknown;
}

interface FileDraggable {
    type: 'file';
    file: TFile;
}

interface FilesDraggable {
    type: 'files';
    files: TFile[];
}

function isFileDraggable(x: unknown): x is FileDraggable {
    return typeof x === 'object'
        && x !== null
        && (x as { type?: unknown }).type === 'file'
        && (x as { file?: unknown }).file instanceof TFile;
}

function isFilesDraggable(x: unknown): x is FilesDraggable {
    if (typeof x !== 'object' || x === null) return false;
    if ((x as { type?: unknown }).type !== 'files') return false;
    const files = (x as { files?: unknown }).files;
    return Array.isArray(files);
}

function getDragManager(app: App): DragManagerLike | null {
    const candidate = (app as unknown as { dragManager?: unknown }).dragManager;
    if (typeof candidate !== 'object' || candidate === null) return null;
    return candidate;
}

/**
 * Returns the TFile(s) currently held by Obsidian's drag manager, or an
 * empty array when the drag did not originate from an Obsidian-internal
 * source (external OS drag, unknown payload type, or missing API).
 */
export function resolveObsidianDraggedFiles(app: App): TFile[] {
    const dm = getDragManager(app);
    if (!dm) return [];
    const draggable = dm.draggable;
    if (isFileDraggable(draggable)) return [draggable.file];
    if (isFilesDraggable(draggable)) return draggable.files.filter((f): f is TFile => f instanceof TFile);
    return [];
}
