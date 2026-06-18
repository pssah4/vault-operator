/**
 * extractZip — generic ZIP-extraction helper backing the `extract_zip`
 * built-in tool. Used by skill-translator and any other workflow that
 * needs to unpack a ZIP from the vault without juggling jszip inside
 * the sandbox.
 *
 * Path-traversal and zip-bomb guards are mandatory; the helper refuses
 * archives that try to escape the target folder or exceed the cumulative
 * uncompressed-size limit.
 */

import JSZip from 'jszip';

export interface ExtractZipAdapter {
    exists(p: string): Promise<boolean>;
    mkdir(p: string): Promise<void>;
    writeBinary(p: string, data: ArrayBuffer): Promise<void>;
    readBinary(p: string): Promise<ArrayBuffer>;
}

export interface ExtractZipInput {
    adapter: ExtractZipAdapter;
    zipPath: string;
    targetFolder: string;
    /** Overwrite existing files (default false). */
    overwrite?: boolean;
    /**
     * If true and the archive has exactly one top-level folder, strip it
     * so the children are written directly under `targetFolder`.
     */
    stripRootFolder?: boolean;
    /** Cumulative uncompressed size cap. Default 100 MB. */
    maxUncompressedBytes?: number;
}

export interface ExtractZipResult {
    writtenFiles: string[];
    skippedEntries: string[];
    strippedRoot: string | null;
    totalUncompressedBytes: number;
}

export type ExtractZipErrorCode =
    | 'PATH_TRAVERSAL'
    | 'ZIP_BOMB'
    | 'READ_FAILED'
    | 'INVALID_TARGET';

export class ExtractZipError extends Error {
    constructor(message: string, public readonly code: ExtractZipErrorCode) {
        super(message);
        this.name = 'ExtractZipError';
    }
}

const DEFAULT_MAX_UNCOMPRESSED = 100 * 1024 * 1024;

export async function extractZip(input: ExtractZipInput): Promise<ExtractZipResult> {
    const limit = input.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED;
    const target = normaliseTarget(input.targetFolder);

    const zipBytes = await input.adapter.readBinary(input.zipPath);
    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(zipBytes);
    } catch (e) {
        throw new ExtractZipError(
            `Could not read ZIP archive at ${input.zipPath}: ${messageOf(e)}`,
            'READ_FAILED',
        );
    }

    for (const name of Object.keys(zip.files)) {
        if (isDangerousPath(name)) {
            throw new ExtractZipError(
                `Suspicious path in archive: "${name}"`,
                'PATH_TRAVERSAL',
            );
        }
    }

    const strippedRoot = input.stripRootFolder ? detectSingleRoot(zip) : null;
    const entries = collectFileEntries(zip, strippedRoot);

    let total = 0;
    for (const entry of entries) {
        total += getUncompressedSize(entry.file);
        if (total > limit) {
            throw new ExtractZipError(
                `Archive cumulative uncompressed size exceeds ${limit} bytes.`,
                'ZIP_BOMB',
            );
        }
    }

    if (!(await input.adapter.exists(target))) {
        await input.adapter.mkdir(target);
    }

    const written: string[] = [];
    const skipped: string[] = [];

    for (const entry of entries) {
        const absPath = target ? `${target}/${entry.relPath}` : entry.relPath;

        if ((await input.adapter.exists(absPath)) && !input.overwrite) {
            skipped.push(entry.relPath);
            continue;
        }

        const parentDir = absPath.slice(0, absPath.lastIndexOf('/'));
        if (parentDir && parentDir !== target && !(await input.adapter.exists(parentDir))) {
            await ensureFolderChain(input.adapter, parentDir);
        }

        const data = await entry.file.async('arraybuffer');
        await input.adapter.writeBinary(absPath, data);
        written.push(entry.relPath);
    }

    return {
        writtenFiles: written,
        skippedEntries: skipped,
        strippedRoot,
        totalUncompressedBytes: total,
    };
}

interface FileEntry {
    relPath: string;
    file: JSZip.JSZipObject;
}

function collectFileEntries(zip: JSZip, strippedRoot: string | null): FileEntry[] {
    const entries: FileEntry[] = [];
    const prefix = strippedRoot ? `${strippedRoot}/` : '';
    for (const [name, file] of Object.entries(zip.files)) {
        if (file.dir) continue;
        if (strippedRoot) {
            if (!name.startsWith(prefix)) continue;
            entries.push({ relPath: name.slice(prefix.length), file });
        } else {
            entries.push({ relPath: name, file });
        }
    }
    return entries;
}

function detectSingleRoot(zip: JSZip): string | null {
    const topLevel = new Set<string>();
    for (const name of Object.keys(zip.files)) {
        if (name.endsWith('/')) {
            const idx = name.indexOf('/');
            if (idx === name.length - 1) {
                topLevel.add(name.slice(0, idx));
            }
            continue;
        }
        const firstSlash = name.indexOf('/');
        if (firstSlash === -1) {
            // file at root → multiple top-level entries, cannot strip
            return null;
        }
        topLevel.add(name.slice(0, firstSlash));
    }
    if (topLevel.size !== 1) return null;
    return [...topLevel][0];
}

function normaliseTarget(raw: string): string {
    const trimmed = raw.trim().replace(/\\/g, '/');
    if (trimmed === '' || trimmed === '/') {
        throw new ExtractZipError(
            'targetFolder must point at a folder inside the vault.',
            'INVALID_TARGET',
        );
    }
    if (trimmed.startsWith('/')) {
        throw new ExtractZipError(
            `targetFolder must be a vault-relative path, got "${raw}".`,
            'INVALID_TARGET',
        );
    }
    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
        throw new ExtractZipError(
            `targetFolder must be a vault-relative path, got "${raw}".`,
            'INVALID_TARGET',
        );
    }
    const segments = trimmed.split('/').filter((s) => s.length > 0);
    if (segments.some((s) => s === '..')) {
        throw new ExtractZipError(
            `targetFolder must not contain parent-dir segments, got "${raw}".`,
            'INVALID_TARGET',
        );
    }
    return segments.join('/');
}

function isDangerousPath(p: string): boolean {
    if (!p) return true;
    if (p.includes('\0')) return true;
    if (p.startsWith('/')) return true;
    if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
    if (p.startsWith('\\\\')) return true;
    const segments = p.split('/');
    if (segments.some((s) => s === '..')) return true;
    return false;
}

async function ensureFolderChain(adapter: ExtractZipAdapter, folder: string): Promise<void> {
    const parts = folder.split('/').filter((p) => p.length > 0);
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!(await adapter.exists(current))) {
            await adapter.mkdir(current);
        }
    }
}

function getUncompressedSize(file: JSZip.JSZipObject): number {
    const raw = (file as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
    return raw?.uncompressedSize ?? raw?.compressedSize ?? 0;
}

function messageOf(e: unknown): string {
    const raw = (e as { message?: unknown })?.message;
    if (typeof raw === 'string') return raw;
    if (typeof e === 'string') return e;
    return 'unknown error';
}
