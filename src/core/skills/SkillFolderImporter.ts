/**
 * SkillFolderImporter -- copies a local directory that looks like a skill
 * (has SKILL.md) into the vault's agent-folder skills tree.
 *
 * FEATURE-2202 / ADR-075. Uses Node `fs.promises` for the source side
 * because Electron gives us an absolute path from the native dialog; the
 * destination is inside the vault, so we go through the Obsidian adapter.
 * Whitelist and path-checks mirror SkillPackageImporter so both pathways
 * produce identical on-disk results.
 */

import type { DataAdapter } from 'obsidian';
import { normalizePath } from 'obsidian';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node fs only reachable via dynamic require inside Electron renderer
const fs: typeof import('fs/promises') = require('fs/promises');
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node path only reachable via dynamic require inside Electron renderer
const nodePath: typeof import('path') = require('path');

export interface SkillFolderImportInput {
    adapter: DataAdapter;
    /** Absolute path on disk, as returned by Electron's showOpenDialog. */
    sourceDir: string;
    /** Target skills dir (e.g. result of getSelfAuthoredSkillsDir). */
    targetSkillsDir: string;
    /** Override destination slug; default = basename of sourceDir. */
    slugOverride?: string;
    /** Overwrite even if the destination exists. Default: false. */
    overwrite?: boolean;
    maxUncompressedBytes?: number;
}

export interface SkillFolderImportResult {
    slug: string;
    destFolder: string;
    writtenFiles: string[];
    skippedEntries: string[];
}

export type SkillFolderImportErrorCode =
    | 'NO_SKILL_MD'
    | 'NO_SLUG'
    | 'READ_FAILED'
    | 'SIZE_LIMIT'
    | 'DESTINATION_EXISTS';

export class SkillFolderImportError extends Error {
    constructor(message: string, public readonly code: SkillFolderImportErrorCode) {
        super(message);
        this.name = 'SkillFolderImportError';
    }
}

const DEFAULT_MAX_UNCOMPRESSED = 100 * 1024 * 1024;

/** Permissive on depth -- see matching rationale in SkillPackageImporter. */
const WHITELIST_PATTERNS: RegExp[] = [
    /^SKILL\.md$/,
    /^scripts\/.+$/,
    /^references\/.+$/,
    /^assets\/.+$/,
    /^[^/]+\.skill\.md$/,
];

export async function importSkillFolder(input: SkillFolderImportInput): Promise<SkillFolderImportResult> {
    const slug = sanitizeSlug(input.slugOverride ?? nodePath.basename(input.sourceDir));
    if (!slug) {
        throw new SkillFolderImportError('Could not derive a slug from the folder name.', 'NO_SLUG');
    }

    let skillMdExists = false;
    try {
        await fs.access(nodePath.join(input.sourceDir, 'SKILL.md'));
        skillMdExists = true;
    } catch { skillMdExists = false; }
    if (!skillMdExists) {
        throw new SkillFolderImportError(
            `Folder has no SKILL.md at its root (${input.sourceDir}).`,
            'NO_SKILL_MD',
        );
    }

    const destFolder = normalizePath(`${input.targetSkillsDir}/${slug}`);
    if (await input.adapter.exists(destFolder) && !input.overwrite) {
        throw new SkillFolderImportError(`Skill "${slug}" already exists.`, 'DESTINATION_EXISTS');
    }
    if (!(await input.adapter.exists(destFolder))) {
        await input.adapter.mkdir(destFolder);
    }

    const limit = input.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED;
    const writtenFiles: string[] = [];
    const skipped: string[] = [];
    let totalSize = 0;

    const candidates = await listCandidateFiles(input.sourceDir);

    for (const relPath of candidates) {
        if (!matchesWhitelist(relPath)) {
            skipped.push(relPath);
            continue;
        }
        const absSource = nodePath.join(input.sourceDir, relPath);
        let buffer: Buffer;
        try {
            buffer = await fs.readFile(absSource);
        } catch (e) {
            throw new SkillFolderImportError(
                `Could not read ${relPath}: ${messageOf(e)}`,
                'READ_FAILED',
            );
        }
        totalSize += buffer.byteLength;
        if (totalSize > limit) {
            throw new SkillFolderImportError(
                `Cumulative size exceeds ${limit} bytes.`,
                'SIZE_LIMIT',
            );
        }

        const destPath = `${destFolder}/${relPath}`;
        const parent = destPath.slice(0, destPath.lastIndexOf('/'));
        if (parent !== destFolder && !(await input.adapter.exists(parent))) {
            await input.adapter.mkdir(parent);
        }
        await input.adapter.writeBinary(destPath, bufferToArrayBuffer(buffer));
        writtenFiles.push(relPath);
    }

    return { slug, destFolder, writtenFiles, skippedEntries: skipped };
}

// -- Helpers ---------------------------------------------------------------

/** Returns relative POSIX paths for every non-directory entry, depth-first. */
async function listCandidateFiles(rootDir: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(currentAbs: string, currentRel: string): Promise<void> {
        const entries = await fs.readdir(currentAbs, { withFileTypes: true });
        for (const entry of entries) {
            const rel = currentRel ? `${currentRel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                await walk(nodePath.join(currentAbs, entry.name), rel);
            } else if (entry.isFile()) {
                out.push(rel);
            }
            // Symlinks are ignored deliberately -- whitelist wouldn't accept
            // them and resolving them crosses the security boundary.
        }
    }
    await walk(rootDir, '');
    return out;
}

function matchesWhitelist(p: string): boolean {
    return WHITELIST_PATTERNS.some((re) => re.test(p));
}

function sanitizeSlug(raw: string): string | null {
    const cleaned = raw.trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
    return cleaned.length === 0 ? null : cleaned;
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function messageOf(e: unknown): string {
    const raw = (e as { message?: unknown })?.message;
    if (typeof raw === 'string') return raw;
    if (typeof e === 'string') return e;
    return 'unknown error';
}
