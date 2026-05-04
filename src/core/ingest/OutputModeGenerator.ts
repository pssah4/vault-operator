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

export interface OutputFolderConfig {
    sourceFolder: string;       // default 'Sources'
    knowledgeFolder?: string;   // default leer = Cluster-Match aus Ontologie
    bibliographyFolder?: string; // default = sourceFolder
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
        const folder = await this.ensureFolder(this.folderConfig.sourceFolder);
        const path = `${folder}/${source.suggestedFilename}`;
        const safePath = await this.uniquePath(path);

        // Set Block-IDs in body BEFORE write
        const { content: body } = markBlockIds(source.body, source.blockAnchors ?? []);
        const fmYaml = renderFrontmatter(source.frontmatter);
        const content = `${fmYaml}${body}`;

        const file = await this.app.vault.create(safePath, content);
        return file;
    }

    private async writeSenseMakingNote(senseMaking: SenseMakingContent, sourceFile: TFile): Promise<TFile> {
        const folder = await this.ensureFolder(this.knowledgeFolderFor(senseMaking.cluster));
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
        // 1. Bibliografie-Note in bibliographyFolder
        const bibFolder = await this.ensureFolder(this.folderConfig.bibliographyFolder ?? this.folderConfig.sourceFolder);
        const bibPath = await this.uniquePath(`${bibFolder}/${content.bibliographyTitle}.md`);

        const bibFm = {
            ...content.bibliographyFrontmatter,
            source_path: `[[${sourceFile.basename}]]`,
        };
        // Base-Codeblock fuer dynamische Zettel-Liste (FEAT-19-30 ADR-101)
        const baseBlock = `\n\n## Abgeleitete Zettel\n\n\`\`\`base\nfrom ""\nwhere source = link(this.file)\nsort created asc\n\`\`\`\n`;
        const bibContent = `${renderFrontmatter(bibFm)}${content.bibliographyBody}${baseBlock}`;
        const bibFile = await this.app.vault.create(bibPath, bibContent);

        // 2. Zettel-Notes in knowledgeFolder
        const knowledgeFolder = await this.ensureFolder(this.knowledgeFolderFor(content.cluster));
        const zettelFiles: TFile[] = [];
        for (const zettel of content.zettel) {
            const zettelPath = await this.uniquePath(`${knowledgeFolder}/${zettel.title}.md`);
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

    private knowledgeFolderFor(cluster: string): string {
        const explicit = this.folderConfig.knowledgeFolder;
        if (explicit && explicit.length > 0) return explicit;
        // Fallback: Cluster als Sub-Folder unter "Knowledge/"
        return `Knowledge/${cluster}`;
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
