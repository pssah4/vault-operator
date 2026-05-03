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

import { TFile, type App } from 'obsidian';
import { parseDocument } from '../document-parsers/parseDocument';

export interface MirrorResult {
    mirrorFile: TFile;
    chunks: number;
}

export class PdfMarkdownMirror {
    constructor(private readonly app: App) {}

    /**
     * Erzeugt einen Markdown-Mirror neben der PDF (gleicher Folder, .md-Suffix).
     * Wenn Mirror schon existiert: skip plus Re-Use.
     */
    async createMirror(pdfFile: TFile): Promise<MirrorResult | null> {
        if (pdfFile.extension !== 'pdf') {
            console.warn(`[PdfMarkdownMirror] not a PDF: ${pdfFile.path}`);
            return null;
        }
        const mirrorPath = pdfFile.path.replace(/\.pdf$/i, '.md');
        const existing = this.app.vault.getAbstractFileByPath(mirrorPath);
        if (existing instanceof TFile) {
            return { mirrorFile: existing, chunks: 0 };
        }

        try {
            const arrayBuf = await this.app.vault.readBinary(pdfFile);
            const parsed = await parseDocument(arrayBuf, 'pdf');
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
