/**
 * IngestDocumentTool — Creates a Markdown source note from a PDF/Office document.
 *
 * The agent provides frontmatter + overview (small, LLM-generated).
 * The tool programmatically appends the full original text extracted from the
 * document, bypassing LLM output token limits.
 *
 * This solves the fundamental problem: a 300-page PDF cannot be written through
 * the LLM's output tokens (~8k), but the parsed text is already available.
 */

import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { parseDocument } from '../../document-parsers/parseDocument';
import { BINARY_DOCUMENT_EXTENSIONS } from '../../document-parsers/types';

interface IngestDocumentInput {
    /** Path for the new Markdown note (e.g. "Notes/Webb-2026_Title.md") */
    output_path: string;
    /** Frontmatter + overview + kernaussagen written by the agent (everything ABOVE the original text) */
    header_content: string;
    /** Path to the source document in the vault (e.g. "Attachements/report.pdf") */
    source_path?: string;
    /** If the document was a chat attachment (not in vault), the agent passes the attachment index (0-based) */
    attachment_index?: number;
}

export class IngestDocumentTool extends BaseTool<'ingest_document'> {
    readonly name = 'ingest_document' as const;
    readonly isWriteOperation = true;

    /** Parsed text from chat attachments, set by AgentSidebarView before task execution */
    private attachmentTexts: string[] = [];

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    /** Called by AgentSidebarView to pass parsed attachment texts for the current turn */
    setAttachmentTexts(texts: string[]): void {
        this.attachmentTexts = texts;
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'ingest_document',
            description:
                'Create a Markdown source note from a PDF or Office document. ' +
                'You provide the frontmatter + overview (header_content), and the tool automatically appends ' +
                'the full original document text as Markdown. This bypasses output token limits for long documents. ' +
                'Used by the /ingest skill (quick single-pass ingest). For Karpathy-style multi-turn deep-ingest with ' +
                'block-refs and dialog, use ingest_deep instead. ' +
                'Works even for very large files (100+ MB) because it uses the already-parsed ' +
                'attachment text, not the raw file. ' +
                'Use either source_path (for vault files) or attachment_index (for chat attachments, 0-based). ' +
                'For chat attachments, prefer attachment_index. If source_path fails due to file size, ' +
                'the tool automatically falls back to the pre-parsed attachment text. ' +
                'PROVENANCE CONVENTION (per ADR-103 Amendment 2026-05-07, FEAT-19-28): in your header_content, ' +
                'for every Kernaussage / take-away in the summary section, append an inline source-position ' +
                'marker at the END of the statement, separated by a single space, using the form ' +
                '`[[OUTPUT_BASENAME#Page N|↗]]` for PDFs (where N matches a "## Page N" heading in the appended ' +
                '## Originaltext section), `[[OUTPUT_BASENAME#Slide N|↗]]` for PPTX, ' +
                '`[[OUTPUT_BASENAME#^block-N|↗]]` for Markdown sources. Display text is always just the ↗ symbol, ' +
                'no "Quelle:", no "[1]"-style. The tool reports back how many Kernaussagen carry a marker so ' +
                'you can fill any that are missing in a follow-up edit.',
            input_schema: {
                type: 'object',
                properties: {
                    output_path: {
                        type: 'string',
                        description: 'Path for the new Markdown note (e.g. "Notes/Webb-2026_Convergence-Outlook.md")',
                    },
                    header_content: {
                        type: 'string',
                        description:
                            'The frontmatter (YAML) + overview + kernaussagen that you wrote. ' +
                            'Must include the opening and closing --- for frontmatter. ' +
                            'The full original document text will be appended automatically after a "## Originaltext" heading.',
                    },
                    source_path: {
                        type: 'string',
                        description: 'Path to the source document in the vault (e.g. "Attachements/report.pdf"). Use this for vault files.',
                    },
                    attachment_index: {
                        type: 'integer',
                        description: 'Index of the chat attachment (0-based). Use this when the document was added via drag & drop or file picker, not from the vault.',
                    },
                },
                required: ['output_path', 'header_content'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { output_path, header_content, source_path, attachment_index } = input as unknown as IngestDocumentInput;
        const { callbacks } = context;

        try {
            if (!output_path) {
                throw new Error('output_path is required');
            }
            if (!header_content) {
                throw new Error('header_content is required (frontmatter + overview)');
            }

            // Get the document text
            let documentText: string;

            if (source_path) {
                try {
                    // Parse from vault file
                    documentText = await this.parseVaultDocument(source_path);
                } catch (parseErr) {
                    // Fallback: if vault parsing fails but a specific attachment_index was provided, use that
                    if (attachment_index !== undefined && attachment_index >= 0 && attachment_index < this.attachmentTexts.length) {
                        documentText = this.attachmentTexts[attachment_index];
                        callbacks.log(`Vault parse failed (${parseErr instanceof Error ? parseErr.message : String(parseErr)}), using attachment[${attachment_index}] as fallback.`);
                    } else {
                        throw parseErr;
                    }
                }
            } else if (attachment_index !== undefined && attachment_index >= 0) {
                // Get from chat attachment
                if (attachment_index >= this.attachmentTexts.length) {
                    // Attachments are populated only on the turn the user uploaded them;
                    // a Multi-Turn-Dialog skill that calls ingest_document on a later
                    // turn will see attachmentTexts === [] (FIX-19-28-02 follow-up).
                    // Give the agent an actionable error instead of a number.
                    if (this.attachmentTexts.length === 0) {
                        throw new Error(
                            'No chat attachments available on this turn. The chat-attachment lifetime is one turn -- ' +
                            'the PDF/Office document the user uploaded earlier is no longer accessible via attachment_index. ' +
                            'Action: ask the user to save the file to the vault (e.g. drag into Attachments/), then re-run with source_path. ' +
                            'Alternative: if the parsed document text is still visible in your context as <attached_document> block, ' +
                            'extract the page-structured text from there and call write_file directly with the full Markdown body ' +
                            '(including the ## Page N headings and ## Originaltext section) and add the [[basename#Page N|↗]] markers ' +
                            'to your Kernaussagen manually.'
                        );
                    }
                    throw new Error(
                        `Attachment index ${attachment_index} out of range. ` +
                        `${this.attachmentTexts.length} attachment(s) available (use index 0..${this.attachmentTexts.length - 1}).`
                    );
                }
                documentText = this.attachmentTexts[attachment_index];
            } else {
                throw new Error('Either source_path or attachment_index is required');
            }

            if (!documentText || documentText.trim().length < 50) {
                throw new Error('Document text is empty or too short. The document may not contain extractable text.');
            }
            if (documentText.startsWith('[ERROR:')) {
                throw new Error(documentText);
            }

            // Clean up the document text
            const cleanedText = this.cleanDocumentText(documentText);

            // Combine header + original text
            const fullContent = header_content.trimEnd() +
                '\n\n---\n\n## Originaltext\n\n' +
                cleanedText;

            // Write the file
            const existing = this.app.vault.getAbstractFileByPath(output_path);
            if (existing) {
                throw new Error(`File already exists: ${output_path}. Use a different path or delete the existing file first.`);
            }

            // Ensure parent folder exists
            const parentPath = output_path.split('/').slice(0, -1).join('/');
            if (parentPath) {
                const parentFolder = this.app.vault.getAbstractFileByPath(parentPath);
                if (!parentFolder) {
                    await this.app.vault.createFolder(parentPath);
                }
            }

            const file = await this.app.vault.create(output_path, fullContent);

            const textLength = cleanedText.length;
            const totalLength = fullContent.length;

            // FIX-19-28-01 PLAN-15 Step 5: Position-Marker-Check.
            // FIX-19-28-06: Plus Dead-Page-Ref-Detection -- zaehle nicht
            // nur Anwesenheit, sondern verifiziere dass die referenzierten
            // Pages im Originaltext existieren und der Basename matcht.
            const markerCheck = checkPositionMarkers(header_content);
            const pageCount = countPageHeadings(cleanedText);
            const outputBasename = basenameOf(output_path);
            const deadRefs = findDeadPageRefs(header_content, outputBasename, pageCount);
            const markerLine = markerCheck.kernaussagen === 0
                ? 'Kernaussagen-Section nicht erkannt -- bitte ## Kernaussagen Heading nutzen.'
                : `Position-Marker check: ${markerCheck.withMarker} of ${markerCheck.kernaussagen} Kernaussagen carry [[basename#...|↗]] refs.`
                  + (markerCheck.withMarker < markerCheck.kernaussagen
                    ? ` ${markerCheck.kernaussagen - markerCheck.withMarker} ohne Marker -- bitte ergaenzen.`
                    : '');
            const deadLine = deadRefs.length === 0
                ? ''
                : `\nDead refs detected: ${deadRefs.length} ref(s) point to non-existent positions.\n`
                  + deadRefs.map((d) => `  - ${d.reason}: ${d.line}`).join('\n')
                  + `\nACTION: remove the dead refs from the Kernaussagen-Section (do not add additional refs next to them).`
                  + ` Replace with a valid Page-Ref where pageCount=${pageCount} and basename="${outputBasename}", or drop the ref entirely.`;

            callbacks.pushToolResult(
                this.formatSuccess(
                    `Created source note: ${output_path}\n` +
                    `Header: ${header_content.length} chars (frontmatter + overview)\n` +
                    `Original text: ${textLength} chars (${pageCount} pages, structured by ## Page N)\n` +
                    `Total: ${totalLength} chars\n` +
                    `${markerLine}${deadLine}`
                )
            );

            // Open the note
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(file);

        } catch (e) {
            callbacks.pushToolResult(this.formatError(e instanceof Error ? e : new Error(String(e))));
        }
    }

    private async parseVaultDocument(sourcePath: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(sourcePath);
        if (!file || !(file instanceof TFile)) {
            throw new Error(`Source document not found: ${sourcePath}`);
        }

        const ext = file.extension.toLowerCase();
        // Higher limit than context tools — ingest writes to disk, not to LLM context.
        // 500 MB cap to prevent OOM from loading entire file into memory.
        const INGEST_MAX_SIZE = 500 * 1024 * 1024;
        if (file.stat.size > INGEST_MAX_SIZE) {
            throw new Error(`Document too large for ingest: ${(file.stat.size / 1024 / 1024).toFixed(1)} MB (limit: 500 MB)`);
        }

        let data: ArrayBuffer;
        if (BINARY_DOCUMENT_EXTENSIONS.has(ext)) {
            data = await this.app.vault.readBinary(file);
        } else {
            const text = await this.app.vault.read(file);
            data = new TextEncoder().encode(text).buffer;
        }

        const result = await parseDocument(data, ext, this.plugin);
        return result.text;
    }

    /**
     * Clean up extracted document text for Markdown readability.
     * Removes PDF artifacts: page numbers, repeated headers/footers, excessive whitespace.
     */
    private cleanDocumentText(text: string): string {
        return text
            // Remove standalone page numbers (lines that are just a number)
            .replace(/^\s*\d{1,4}\s*$/gm, '')
            // Collapse 3+ consecutive blank lines to 2
            .replace(/\n{4,}/g, '\n\n\n')
            // Remove leading/trailing whitespace
            .trim();
    }
}

/**
 * Zaehlt `## Page N`-Headings im geparsten Originaltext (FIX-19-28-01).
 * Wird im Tool-Result an den Agent zurueckgegeben.
 */
export function countPageHeadings(text: string): number {
    const matches = text.match(/^##\s+Page\s+\d+/gm);
    return matches?.length ?? 0;
}

/**
 * Position-Marker-Check (FIX-19-28-01 PLAN-15 Step 5,
 * FIX-19-28-06 Regex-Erweiterung): zaehlt im `## Kernaussagen`-
 * Section, wie viele Bullet-Items einen Wikilink-Marker `[[...|↗]]`
 * am Ende tragen.
 *
 * Erwartet: Section beginnt mit `## Kernaussagen` (oder `## Key
 * Take-aways` oder `## Take-Aways`), Items sind `- ...`-Bullets.
 * Section endet beim naechsten `## `-Heading oder am Ende des Strings.
 *
 * Block-Anchor-Suffix `^slug` nach dem Ref ist erlaubt: Karpathy-
 * Pattern setzt Eigen-Anchor auf jeden Bullet, damit andere Notes
 * ihn referenzieren koennen. Ohne diese Tolerierung wuerde der
 * Check `0 of N` zurueckgeben und der Agent dupliziert Refs in
 * einem Folge-Edit (FIX-19-28-06).
 *
 * Ergebnis-Felder:
 * - kernaussagen: gezaehlte Bullet-Items in der Section
 * - withMarker:   davon mit `↗`-Wikilink am Ende (Anchor-Suffix erlaubt)
 */
export function checkPositionMarkers(headerContent: string): { kernaussagen: number; withMarker: number } {
    // Section-Erkennung: ## Kernaussagen / ## Key Take-aways / ## Take-Aways
    const sectionRe = /^##\s+(Kernaussagen|Key\s+Take[-\s]?aways|Take[-\s]?Aways)\b[^\n]*$/im;
    const lines = headerContent.split(/\r?\n/);
    let inSection = false;
    let kernaussagen = 0;
    let withMarker = 0;
    for (const line of lines) {
        if (sectionRe.test(line)) {
            inSection = true;
            continue;
        }
        if (inSection && /^##\s+\S/.test(line)) {
            // Naechste Section trifft -> Ende
            inSection = false;
            continue;
        }
        if (!inSection) continue;
        const m = line.match(/^\s*[-*]\s+(.+)$/);
        if (!m) continue;
        kernaussagen++;
        if (/\[\[[^\]]+\|↗\]\](?:\s+\^[A-Za-z0-9_-]+)?\s*$/.test(line)) {
            withMarker++;
        }
    }
    return { kernaussagen, withMarker };
}

/**
 * Dead-Page-Ref-Detection (FIX-19-28-06): scannt die `## Kernaussagen`-
 * Section nach `[[BASENAME#Page N|↗]]`-Refs und meldet jene, die ins
 * Leere zeigen. Zwei Failure-Modi werden erkannt:
 *
 * 1. Page-Number ueber pageCount (z.B. Ref auf `#Page 87` bei nur
 *    60 geparsten Pages). Tritt auf, wenn der Agent Page-Numbers aus
 *    dem PDF-Footer halluziniert statt aus den `## Page N`-Headings
 *    abzuleiten.
 * 2. Basename matched nicht das Output-File (z.B. Output ist
 *    "Notes/Webb-2026.md", aber Refs zeigen auf `[[Anderer Title]]`).
 *    Tritt auf, wenn der Agent den Pdf-Quell-Title als Wikilink-Target
 *    nutzt statt den Output-Basename.
 *
 * Refs auf `#Slide N`, `#^block-N`, `#anchor` werden nicht geprueft --
 * dieser Check ist explizit fuer den PDF-Pfad mit Heading-Anchors.
 *
 * Ergebnis: Liste der dead Refs mit der zeilenexakten Beobachtung.
 * Bei leerer Liste sind alle Refs konsistent zur Source.
 */
export function findDeadPageRefs(
    headerContent: string,
    outputBasename: string,
    pageCount: number,
): { line: string; reason: string }[] {
    const sectionRe = /^##\s+(Kernaussagen|Key\s+Take[-\s]?aways|Take[-\s]?Aways)\b[^\n]*$/im;
    const lines = headerContent.split(/\r?\n/);
    const dead: { line: string; reason: string }[] = [];
    let inSection = false;
    // Capture: target-name (without #), page-number
    const refRe = /\[\[([^#\]|]+)#Page\s+(\d+)\|↗\]\]/g;
    for (const line of lines) {
        if (sectionRe.test(line)) {
            inSection = true;
            continue;
        }
        if (inSection && /^##\s+\S/.test(line)) {
            inSection = false;
            continue;
        }
        if (!inSection) continue;
        for (const match of line.matchAll(refRe)) {
            const target = match[1].trim();
            const page = Number.parseInt(match[2], 10);
            if (target !== outputBasename) {
                dead.push({
                    line: line.trim(),
                    reason: `target "${target}" does not match output basename "${outputBasename}"`,
                });
                continue;
            }
            if (pageCount > 0 && page > pageCount) {
                dead.push({
                    line: line.trim(),
                    reason: `Page ${page} exceeds source pageCount ${pageCount}`,
                });
            }
        }
    }
    return dead;
}

/**
 * Extrahiert den Output-Basename aus dem `output_path` (ohne `.md`).
 * Fuer Refs der Form `[[BASENAME#...|↗]]` ist BASENAME der File-Stem.
 */
export function basenameOf(outputPath: string): string {
    const file = outputPath.split('/').pop() ?? outputPath;
    return file.replace(/\.md$/i, '');
}
