/**
 * SkillImportRouter -- one entry point that handles every skill source the
 * user might throw at us: a single `.md`, a folder (from the native
 * directory picker) or a `.skill`/`.zip` package.
 *
 * FEATURE-2202 / ADR-075. The router detects the type by arguments
 * and dispatches to the appropriate sub-importer. The UI side only has to
 * pass raw inputs -- `File` objects for HTML pickers, absolute paths for
 * native directory pickers. The detection logic lives here so the UI stays
 * thin.
 */

import type { DataAdapter } from 'obsidian';
import { normalizePath } from 'obsidian';
import {
    importSkillPackage,
    SkillPackageImportError,
    type SkillPackageImportResult,
} from './SkillPackageImporter';
import {
    importSkillFolder,
    SkillFolderImportError,
    type SkillFolderImportResult,
} from './SkillFolderImporter';

export type SkillImportSource =
    | { kind: 'markdown-file'; file: File }
    | { kind: 'zip-file'; file: File }
    | { kind: 'directory'; absolutePath: string };

export interface SkillImportRouterInput {
    adapter: DataAdapter;
    /** Target skills dir (e.g. getSelfAuthoredSkillsDir()). */
    targetSkillsDir: string;
    source: SkillImportSource;
    overwrite?: boolean;
    maxUncompressedBytes?: number;
}

export type SkillImportReport =
    | ({ kind: 'markdown' } & SkillMarkdownImportResult)
    | ({ kind: 'zip' } & SkillPackageImportResult)
    | ({ kind: 'folder' } & SkillFolderImportResult);

export interface SkillMarkdownImportResult {
    slug: string;
    destFolder: string;
    writtenFiles: string[];
}

export async function importSkill(input: SkillImportRouterInput): Promise<SkillImportReport> {
    const { source } = input;
    switch (source.kind) {
        case 'markdown-file':
            return {
                kind: 'markdown',
                ...(await importSkillMarkdown(input, source.file)),
            };
        case 'zip-file':
            return {
                kind: 'zip',
                ...(await importZipFile(input, source.file)),
            };
        case 'directory':
            return {
                kind: 'folder',
                ...(await importSkillFolder({
                    adapter: input.adapter,
                    sourceDir: source.absolutePath,
                    targetSkillsDir: input.targetSkillsDir,
                    overwrite: input.overwrite,
                    maxUncompressedBytes: input.maxUncompressedBytes,
                })),
            };
    }
}

export function detectSourceFromFile(file: File): SkillImportSource {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip') || lower.endsWith('.skill')) {
        return { kind: 'zip-file', file };
    }
    return { kind: 'markdown-file', file };
}

async function importSkillMarkdown(
    input: SkillImportRouterInput,
    file: File,
): Promise<SkillMarkdownImportResult> {
    const content = await file.text();
    const slug = extractSlug(content, file.name);
    if (!slug) {
        throw new SkillPackageImportError(
            'Markdown file has no name frontmatter and no usable filename.',
            'NO_SLUG',
        );
    }

    const destFolder = normalizePath(`${input.targetSkillsDir}/${slug}`);
    if ((await input.adapter.exists(destFolder)) && !input.overwrite) {
        throw new SkillPackageImportError(`Skill "${slug}" already exists.`, 'DESTINATION_EXISTS');
    }
    if (!(await input.adapter.exists(destFolder))) {
        await input.adapter.mkdir(destFolder);
    }

    const destPath = `${destFolder}/SKILL.md`;
    await input.adapter.write(destPath, content);

    return { slug, destFolder, writtenFiles: ['SKILL.md'] };
}

async function importZipFile(
    input: SkillImportRouterInput,
    file: File,
): Promise<SkillPackageImportResult> {
    const buffer = await file.arrayBuffer();
    const fallbackSlug = file.name.replace(/\.(zip|skill)$/i, '').replace(/[^a-zA-Z0-9._-]/g, '-');
    return await importSkillPackage({
        adapter: input.adapter,
        targetSkillsDir: input.targetSkillsDir,
        buffer,
        fallbackSlug,
        overwrite: input.overwrite,
        maxUncompressedBytes: input.maxUncompressedBytes,
    });
}

function extractSlug(content: string, filename: string): string | null {
    const nameMatch = content.match(/^---[\s\S]*?^name:\s*(.+)$/m);
    const candidate = nameMatch?.[1]?.trim() ?? filename.replace(/\.[^.]+$/, '');
    const cleaned = candidate.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
    return cleaned.length === 0 ? null : cleaned;
}

export {
    SkillPackageImportError,
    SkillFolderImportError,
};
