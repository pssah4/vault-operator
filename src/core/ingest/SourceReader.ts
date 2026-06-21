/**
 * SourceReader (FIX-19-28-01 PLAN-15 Step 1) -- liest Source-Files
 * einheitlich als Markdown-Text fuer den Ingest-Pfad.
 *
 * Backs FEAT-19-28 (Source-Position-Marker, ADR-103). Der DeepIngest-
 * Pipeline-Fix in Step 3 ersetzt den hardcoded leeren Source-Body durch
 * den Output dieses Helpers, sodass BlockIdSetter echte Anchor-Treffer
 * findet.
 *
 * Routing:
 * - .md -> vault.cachedRead (direkter Text)
 * - .pdf, .docx, .pptx, .xlsx, etc. -> parseDocument-Pipeline (EPIC-06).
 *   parsePdf erzeugt pro Seite ein "## Page N"-Heading; das ist der
 *   Heading-Anker, auf den IngestDocumentTool und SummaryPositionAnnotator
 *   ihre Wikilinks zeigen.
 *
 * Unsupported extensions werfen einen klaren Fehler. Aufrufer bei
 * IngestDeepTool / IngestDocumentTool muessen das abfangen und an den
 * User melden.
 */

import { TFile, type App } from 'obsidian';
import { parseDocument } from '../document-parsers/parseDocument';
import type ObsidianAgentPlugin from '../../main';

/**
 * Liefert den Source-Inhalt als Markdown-Text.
 *
 * @param app    Obsidian App-Handle (fuer vault.cachedRead bzw. readBinary).
 * @param file   Source-File im Vault.
 * @param plugin Plugin-Instanz; wird an parseDocument durchgereicht und
 *               von parsePdf gebraucht, um pdfjs-dist ueber den
 *               Optional-Asset-BundleLoader zu laden. Required, damit
 *               Caller das Argument nicht versehentlich droppen
 *               (FIX-06-01-01).
 * @returns Der Inhalt als Markdown-Text.
 * @throws Error bei Unsupported-Extension oder Read-Fehler.
 */
export async function readSourceAsMarkdown(app: App, file: TFile, plugin: ObsidianAgentPlugin): Promise<string> {
    const ext = file.extension.toLowerCase();
    if (ext === 'md') {
        return await app.vault.cachedRead(file);
    }
    const buf = await app.vault.readBinary(file);
    const parsed = await parseDocument(buf, ext, plugin);
    return parsed.text;
}
