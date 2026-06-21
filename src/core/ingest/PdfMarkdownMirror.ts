/**
 * PdfMarkdownMirror (FEAT-19-29 ADR-103) -- opt-in PDF -> Markdown
 * Konvertierung als Sibling-Note. Source-PDF bleibt unangetastet.
 *
 * Default-Strategie ist "page-refs" (PDF bleibt mit Bildern/Layout
 * erhalten, Source-Position-Marker als [[file.pdf#page=N]]). Diese
 * Klasse ist nur fuer den opt-in Markdown-Mirror-Pfad.
 *
 * Nutzt parseDocument aus EPIC-06 fuer PDF-Text-Extraktion.
 */

import { TFile, TFolder, type App } from 'obsidian';
import { parseDocument } from '../document-parsers/parseDocument';
import type ObsidianAgentPlugin from '../../main';

export interface MirrorResult {
    mirrorFile: TFile;
    chunks: number;
}

export interface PdfMarkdownMirrorOpts {
    /**
     * Folder in which the markdown mirror is created. Defaults to the
     * PDF's folder (legacy behaviour) when not given; pass the user's
     * defaultOutputFolder (typically "Inbox") to keep the PDF in
     * Attachments/ and the markdown working copy in the inbox.
     */
    mirrorFolder?: string;
}

export class PdfMarkdownMirror {
    private readonly mirrorFolder: string | undefined;

    constructor(
        private readonly app: App,
        opts: PdfMarkdownMirrorOpts = {},
        private readonly plugin: ObsidianAgentPlugin,
    ) {
        this.mirrorFolder = opts.mirrorFolder?.replace(/\/+$/, '') || undefined;
    }

    /**
     * Erzeugt einen Markdown-Mirror der PDF. Wenn `mirrorFolder` gesetzt
     * ist (typischerweise der defaultOutputFolder), landet der Mirror
     * dort -- die PDF bleibt unangetastet im Attachements-Folder. Ohne
     * `mirrorFolder` faellt der Code auf das Legacy-Verhalten zurueck
     * (Mirror neben der PDF).
     */
    async createMirror(pdfFile: TFile): Promise<MirrorResult | null> {
        if (pdfFile.extension !== 'pdf') {
            console.warn(`[PdfMarkdownMirror] not a PDF: ${pdfFile.path}`);
            return null;
        }
        const mirrorPath = this.mirrorFolder
            ? `${this.mirrorFolder}/${pdfFile.basename}.md`
            : pdfFile.path.replace(/\.pdf$/i, '.md');
        const existing = this.app.vault.getAbstractFileByPath(mirrorPath);
        if (existing instanceof TFile) {
            return { mirrorFile: existing, chunks: 0 };
        }
        // The mirrorFolder ist eigentlich "alles, was wir je erstellen
        // duerfen" (defaultOutputFolder). Wenn er noch nicht existiert,
        // legen wir ihn an -- das ist der einzige Folder, der vom Ingest
        // erstellt werden darf.
        if (this.mirrorFolder) {
            const folder = this.app.vault.getAbstractFileByPath(this.mirrorFolder);
            if (!folder) {
                await this.app.vault.createFolder(this.mirrorFolder);
            } else if (!(folder instanceof TFolder)) {
                console.warn(`[PdfMarkdownMirror] mirrorFolder "${this.mirrorFolder}" is not a folder`);
                return null;
            }
        }

        try {
            const arrayBuf = await this.app.vault.readBinary(pdfFile);
            const parsed = await parseDocument(arrayBuf, 'pdf', this.plugin);
            const text = parsed.text;
            const fm = `---\nsource_pdf: "[[${pdfFile.basename}.pdf]]"\nmirror_generated_at: "${new Date().toISOString()}"\nbar25_pdf_strategy: markdown-mirror\n---\n\n`;
            const body = `# ${pdfFile.basename} (Markdown-Mirror)\n\n_Wikilink zur Source: [[${pdfFile.basename}.pdf]]_\n\n${text}\n`;
            const mirror = await this.app.vault.create(mirrorPath, fm + body);
            return { mirrorFile: mirror, chunks: text.split(/\n\n+/).length };
        } catch (err) {
            console.warn(`[PdfMarkdownMirror] failed to create mirror for ${pdfFile.path}:`, err);
            return null;
        }
    }
}
