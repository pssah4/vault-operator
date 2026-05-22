/**
 * OutputModeGenerator -- drei Output-Modi (Source-only / Summary /
 * Multi-Zettel) plus Folder-Layout-Konfiguration.
 *
 * Backs FEAT-19-24 (Output-Modus-Auswahl), FEAT-19-25 (Source-Folder),
 * FEAT-19-30 (Bibliographische Summary-Note mit Base-Block).
 *
 * ADR-101: Drei Generator-Funktionen, Modus 2 als System-Default.
 *
 * Note-Generierung erfolgt via Vault-API. LLM-Inhalte (Take-Aways,
 * Cross-Links, Bibliografie-Abstract) werden als Eingabe uebergeben:
 * der Generator selbst ruft kein LLM auf. Plugin-Wiring kombiniert
 * Generator mit ContentBuilder/SummaryGenerator nach Bedarf.
 */

import { TFile, TFolder, type App } from 'obsidian';
import { markBlockIds } from './BlockIdSetter';

export type OutputMode = 'source-only' | 'source-plus-summary' | 'source-plus-multi-zettel';

/**
 * Single notes folder for all ingest output. Source notes are NEVER
 * duplicated -- if the caller already passed an `existingSourceFile`,
 * we modify it in place (block-IDs) and write derived notes (sense-
 * making / bibliography / zettel) into `notesFolder`. The folder is
 * the user-configured `defaultOutputFolder` (default "Inbox/"). No
 * cluster-derived subfolders are created.
 */
export interface OutputFolderConfig {
    notesFolder: string;
}

export interface SourceContent {
    /** Path-Hint fuer den Original-Source-Note (zB "Articles/Karpathy-LLM-Wiki.md"). */
    suggestedFilename: string;
    /** Markdown-Body der Source. Wird mit Block-IDs versehen. */
    body: string;
    /** Frontmatter-Properties fuer den Source-Note. */
    frontmatter: Record<string, unknown>;
    /** Optional: Anker-Texte, an denen Block-IDs gesetzt werden. */
    blockAnchors?: string[];
    /**
     * When the source already lives in the vault as a TFile, the caller
     * passes it here so the generator updates the existing file in place
     * (block-IDs injected via `vault.modify`) instead of writing a
     * duplicate note into `notesFolder`. The original file's frontmatter
     * is preserved; only the body is rewritten with the marked content.
     */
    existingFile?: TFile;
}

export interface SenseMakingContent {
    /** Cluster-Slug fuer Folder-Berechnung. */
    cluster: string;
    /** Suggested filename (ohne .md). */
    title: string;
    /** Markdown-Body. Soll Wikilinks zur Source enthalten. */
    body: string;
    /** Frontmatter-Properties. */
    frontmatter: Record<string, unknown>;
}

export interface MultiZettelContent extends SenseMakingContent {
    /** Bibliografie-Note-Title (gemeinsamer Anker fuer alle Zettel). */
    bibliographyTitle: string;
    /** Frontmatter fuer die Bibliografie-Note (Autor, Jahr, etc.). */
    bibliographyFrontmatter: Record<string, unknown>;
    /** Bibliografie-Body (Abstract etc., ohne Base-Codeblock - der wird auto-generiert). */
    bibliographyBody: string;
    /** Liste der Zettel mit Title + Body + Frontmatter. */
    zettel: Array<{
        title: string;
        body: string;
        frontmatter: Record<string, unknown>;
    }>;
}

export interface GenerateResult {
    sourceFile?: TFile;
    senseMakingFile?: TFile;
    bibliographyFile?: TFile;
    zettelFiles?: TFile[];
}

export class OutputModeGenerator {
    constructor(
        private readonly app: App,
        private readonly folderConfig: OutputFolderConfig,
    ) {}

    async generate(
        mode: OutputMode,
        source: SourceContent,
        senseMaking?: SenseMakingContent | MultiZettelContent,
    ): Promise<GenerateResult> {
        const sourceFile = await this.writeSourceNote(source);

        switch (mode) {
            case 'source-only':
                return { sourceFile };

            case 'source-plus-summary':
                if (!senseMaking) throw new Error('source-plus-summary requires senseMaking content');
                return {
                    sourceFile,
                    senseMakingFile: await this.writeSenseMakingNote(senseMaking, sourceFile),
                };

            case 'source-plus-multi-zettel':
                if (!senseMaking || !('zettel' in senseMaking)) {
                    throw new Error('source-plus-multi-zettel requires MultiZettelContent');
                }
                return await this.writeMultiZettel(source, senseMaking, sourceFile);

            default: {
                // Unreachable per type
                const _exhaustive: never = mode;
                throw new Error(`Unknown OutputMode: ${String(_exhaustive)}`);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Private writers
    // -----------------------------------------------------------------------

    private async writeSourceNote(source: SourceContent): Promise<TFile> {
        // No-duplication path: when the caller already has the source as a
        // vault file (every ingest run does — IngestDeepTool resolves the
        // TFile before calling the pipeline), we inject block-IDs in place
        // instead of writing a copy into notesFolder. The original
        // frontmatter is preserved; we only rewrite the body portion of
        // the existing file.
        if (source.existingFile) {
            return this.modifySourceInPlace(source.existingFile, source.body, source.blockAnchors ?? []);
        }

        const folder = await this.ensureFolder(this.folderConfig.notesFolder);
        const path = `${folder}/${source.suggestedFilename}`;
        const safePath = await this.uniquePath(path);

        // Set Block-IDs in body BEFORE write
        const { content: body } = markBlockIds(source.body, source.blockAnchors ?? []);
        const fmYaml = renderFrontmatter(source.frontmatter);
        const content = `${fmYaml}${body}`;

        const file = await this.app.vault.create(safePath, content);
        return file;
    }

    /**
     * Inject block-IDs into the existing source file without touching
     * its frontmatter. Reads the live content, splits off the frontmatter
     * block (so the agent / user-edited metadata stays intact), runs
     * markBlockIds (idempotent) on the body, and writes it back via
     * vault.modify. Returns the original TFile so downstream code can
     * keep referencing it.
     */
    private async modifySourceInPlace(file: TFile, _bodyHint: string, anchors: string[]): Promise<TFile> {
        const current = await this.app.vault.read(file);
        const { frontmatter, body } = splitFrontmatter(current);
        const { content: markedBody } = markBlockIds(body, anchors);
        const next = frontmatter ? `${frontmatter}${markedBody}` : markedBody;
        if (next !== current) {
            await this.app.vault.modify(file, next);
        }
        return file;
    }

    private async writeSenseMakingNote(senseMaking: SenseMakingContent, sourceFile: TFile): Promise<TFile> {
        // All derived notes live in the single notesFolder (defaultOutputFolder).
        // No cluster subdirectories -- they would mean creating new folders.
        const folder = await this.ensureFolder(this.folderConfig.notesFolder);
        const path = `${folder}/${senseMaking.title}.md`;
        const safePath = await this.uniquePath(path);

        const fm = {
            ...senseMaking.frontmatter,
            source: `[[${sourceFile.basename}]]`,
        };
        const content = `${renderFrontmatter(fm)}${senseMaking.body}`;
        return await this.app.vault.create(safePath, content);
    }

    private async writeMultiZettel(
        _source: SourceContent,
        content: MultiZettelContent,
        sourceFile: TFile,
    ): Promise<GenerateResult> {
        const folder = await this.ensureFolder(this.folderConfig.notesFolder);

        // 1. Bibliografie-Note (lives in notesFolder, same as everything else).
        const bibPath = await this.uniquePath(`${folder}/${content.bibliographyTitle}.md`);

        const bibFm = {
            ...content.bibliographyFrontmatter,
            source_path: `[[${sourceFile.basename}]]`,
        };
        // Base-Codeblock fuer dynamische Zettel-Liste (FEAT-19-30 ADR-101)
        const baseBlock = `\n\n## Abgeleitete Zettel\n\n\`\`\`base\nfrom ""\nwhere source = link(this.file)\nsort created asc\n\`\`\`\n`;
        const bibContent = `${renderFrontmatter(bibFm)}${content.bibliographyBody}${baseBlock}`;
        const bibFile = await this.app.vault.create(bibPath, bibContent);

        // 2. Zettel-Notes (same notesFolder).
        const zettelFiles: TFile[] = [];
        for (const zettel of content.zettel) {
            const zettelPath = await this.uniquePath(`${folder}/${zettel.title}.md`);
            const zettelFm = {
                ...zettel.frontmatter,
                source: `[[${bibFile.basename}]]`,
            };
            const zettelContent = `${renderFrontmatter(zettelFm)}${zettel.body}`;
            const file = await this.app.vault.create(zettelPath, zettelContent);
            zettelFiles.push(file);
        }

        return {
            sourceFile,
            bibliographyFile: bibFile,
            zettelFiles,
        };
    }

    private async ensureFolder(folderPath: string): Promise<string> {
        const trimmed = folderPath.replace(/\/+$/, '');
        const existing = this.app.vault.getAbstractFileByPath(trimmed);
        if (!existing) {
            await this.app.vault.createFolder(trimmed);
        } else if (!(existing instanceof TFolder)) {
            // AUDIT-016 L-3: instanceof statt `as TFolder`-Cast (Plugin-
            // Review-Bot-Compliance). Path exists as file, not folder.
            // Append timestamp to avoid clash.
            return `${trimmed}-${Date.now()}`;
        }
        return trimmed;
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async kept for symmetry with vault.adapter.exists path used in tests
    private async uniquePath(path: string): Promise<string> {
        let candidate = path;
        let counter = 1;
        while (this.app.vault.getAbstractFileByPath(candidate)) {
            const dot = path.lastIndexOf('.');
            const base = dot >= 0 ? path.substring(0, dot) : path;
            const ext = dot >= 0 ? path.substring(dot) : '';
            candidate = `${base} (${counter})${ext}`;
            counter++;
        }
        return candidate;
    }
}

/**
 * Rendert ein Frontmatter-Object zu YAML-String mit `---`-Begrenzern.
 * Listen werden als Bullet-Liste gerendert. Strings ohne Sonderzeichen
 * werden unquoted, sonst quoted.
 */
export function renderFrontmatter(fm: Record<string, unknown>): string {
    if (!fm || Object.keys(fm).length === 0) return '';
    const lines: string[] = ['---'];
    for (const [key, value] of Object.entries(fm)) {
        if (value === null || value === undefined) continue;
        if (Array.isArray(value)) {
            lines.push(`${key}:`);
            for (const item of value) {
                lines.push(`  - ${formatYamlValue(item)}`);
            }
        } else {
            lines.push(`${key}: ${formatYamlValue(value)}`);
        }
    }
    lines.push('---');
    lines.push(''); // blank line before body
    return lines.join('\n');
}

/**
 * Split a markdown string into its leading frontmatter block (including
 * the trailing `---` and the blank line that usually follows) and the
 * remaining body. If no frontmatter is present, returns `{ frontmatter:
 * '', body: input }`.
 */
export function splitFrontmatter(input: string): { frontmatter: string; body: string } {
    if (!input.startsWith('---')) return { frontmatter: '', body: input };
    const lines = input.split('\n');
    if (lines[0].trim() !== '---') return { frontmatter: '', body: input };
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            // Include the closing `---` plus an optional blank line.
            let end = i + 1;
            if (end < lines.length && lines[end].trim() === '') end += 1;
            return {
                frontmatter: lines.slice(0, end).join('\n') + (end < lines.length ? '\n' : ''),
                body: lines.slice(end).join('\n'),
            };
        }
    }
    return { frontmatter: '', body: input };
}

function formatYamlValue(value: unknown): string {
    if (typeof value === 'string') {
        // Bei einfachen Strings ohne Sonderzeichen unquoted
        if (/[:#\n"'[\]{}|>%@`]/.test(value)) {
            return JSON.stringify(value);
        }
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
}
