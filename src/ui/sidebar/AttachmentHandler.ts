import { setIcon, TFile, Notice } from 'obsidian';
import type { ContentBlock, ImageMediaType } from '../../api/types';
import type { Vault, FileSystemAdapter } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { t } from '../../i18n';
import { parseDocument } from '../../core/document-parsers/parseDocument';
import {
    BINARY_DOCUMENT_EXTENSIONS,
    MAX_FILE_SIZE,
    MAX_DOCUMENT_FILE_SIZE,
    LARGE_DOCUMENT_CHAR_THRESHOLD,
    CONTEXT_DOCUMENT_CHAR_LIMIT,
    TOTAL_ATTACHMENT_CHAR_BUDGET,
} from '../../core/document-parsers/types';

/** Extensions handled by the document parser (binary formats via OS file picker). */
const DOCUMENT_EXTENSIONS = ['.pptx', '.potx', '.xlsx', '.docx', '.pdf', '.csv'];

/** Map file extension to Lucide icon name for chip display. */
const CHIP_ICON_MAP: Record<string, string> = {
    pptx: 'presentation',
    xlsx: 'table-2',
    docx: 'file-text',
    pdf: 'file-type',
    csv: 'table-2',
};

/** Escape a string for safe use in XML attribute values. */
function escapeXmlAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Maximum total size of all stored full document texts (memory guard). */
const MAX_TOTAL_DOC_TEXT_SIZE = 500 * 1024 * 1024; // 500 MB

/** A file (image or text) attached to the current compose turn. */
export interface AttachmentItem {
    name: string;
    /** File extension (for icon selection in chips). */
    extension?: string;
    /** Object URL for thumbnail display (images only); revoked when removed before send. */
    objectUrl?: string;
    /** The ContentBlock that will be included in the API message. */
    block: ContentBlock;
    /** Raw binary data for PPTX/POTX files (used as template source). */
    binaryData?: ArrayBuffer;
    /** Vault path if the file was added from the vault (for template reference). */
    vaultPath?: string;
}

/**
 * AttachmentHandler — manages the pending attachment list and chip bar UI.
 *
 * Extracted from AgentSidebarView to reduce file size.
 */
export class AttachmentHandler {
    readonly pending: AttachmentItem[] = [];
    /** Full (un-truncated) document texts, parallel to pending[]. Used by IngestDocumentTool and ReadDocumentTool. */
    private fullDocTexts: string[] = [];
    /**
     * FEAT-24-03: chars of attachment text already injected into the context this
     * compose turn. New attachments are capped to whatever budget is left. Reset
     * in clear() (one compose turn = one budget).
     */
    private contextCharsUsed = 0;

    constructor(
        private vault: Vault,
        private chipBar: HTMLElement,
        private plugin?: ObsidianAgentPlugin,
    ) {}

    openFilePicker(): void {
        const input = activeDocument.createElement('input');
        input.type = 'file';
        input.multiple = true;
        // No accept filter — Electron/macOS greyed out Office files with MIME-based filters.
        // Validation happens in processFile() which shows a Notice for unsupported formats.
        input.addEventListener('change', () => {
            if (input.files) {
                for (const file of Array.from(input.files)) void this.processFile(file);
            }
        });
        input.click();
    }

    async processFile(file: File): Promise<void> {
        // Documents (PDF, Office) get text-extracted — allow larger files.
        // Images get base64-encoded into context — keep stricter limit.
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const isDocument = DOCUMENT_EXTENSIONS.some(d => file.name.toLowerCase().endsWith(d));
        const sizeLimit = isDocument ? MAX_DOCUMENT_FILE_SIZE : MAX_FILE_SIZE;
        if (file.size > sizeLimit) {
            new Notice(t('ui.attachment.tooLarge', { name: file.name }));
            return;
        }

        const IMAGE_TYPES: Record<string, ImageMediaType> = {
            'image/png': 'image/png',
            'image/jpeg': 'image/jpeg',
            'image/gif': 'image/gif',
            'image/webp': 'image/webp',
        };
        const TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.py', '.ts', '.js', '.jsx', '.tsx', '.css', '.html', '.xml', '.yaml', '.yml', '.sh'];

        const mediaType = IMAGE_TYPES[file.type];

        // Resolve OS file path to vault-relative path if possible.
        // Electron File objects have a non-standard .path property with the full OS path.
        const vaultPath = this.resolveOsPathToVaultPath(file);
        // Use vault path as display name when available (consistent with addVaultFile behavior)
        const displayName = vaultPath ?? file.name;

        if (mediaType) {
            // Image attachment
            const arrayBuffer = await file.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const base64 = btoa(binary);
            const objectUrl = URL.createObjectURL(file);
            this.pending.push({
                name: displayName || 'image.png',
                objectUrl,
                vaultPath,
                block: { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            });
        } else if (DOCUMENT_EXTENSIONS.some(d => file.name.toLowerCase().endsWith(d))) {
            // Document attachment — parse via document parser
            try {
                const arrayBuffer = await file.arrayBuffer();
                const result = await parseDocument(arrayBuffer, ext, this.plugin);

                if (result.text.length > LARGE_DOCUMENT_CHAR_THRESHOLD) {
                    new Notice(t('ui.attachment.largeDocument', { name: displayName }));
                }

                // Auto-save external PPTX/POTX files to vault for template
                // analysis; other binaries land in the attachments folder
                // so a follow-up turn can reach them via vault_path.
                let resolvedVaultPath = vaultPath;
                if (!resolvedVaultPath && (ext === 'pptx' || ext === 'potx')) {
                    resolvedVaultPath = await this.saveExternalTemplateToVault(file.name, arrayBuffer);
                } else if (!resolvedVaultPath) {
                    // PDF/DOCX/XLSX (everything that lands in the document
                    // parser path except PPTX/POTX templates) gets persisted
                    // into the user's attachment folder so later turns can
                    // reach the binary via vault_path. Without this the
                    // file lives only in the chat-attachment buffer of the
                    // current turn -- a move_file in a follow-up turn would
                    // have nothing to operate on.
                    resolvedVaultPath = await this.saveExternalBinaryToAttachments(file.name, arrayBuffer);
                }

                const vaultPathAttr = resolvedVaultPath ? ` vault_path="${escapeXmlAttr(resolvedVaultPath)}"` : '';
                // Include original filename for external files (not full OS path to avoid information disclosure)
                const osPath = (file as unknown as { path?: string }).path;
                const sourceFileName = !resolvedVaultPath && osPath ? osPath.split('/').pop() ?? '' : '';
                const sourceAttr = sourceFileName ? ` source_name="${escapeXmlAttr(sourceFileName)}"` : '';
                const contextText = this.truncateForContext(result.text, result.metadata.pageCount);
                this.pushFullDocText(result.text);
                const safeName = escapeXmlAttr(displayName);
                const item: AttachmentItem = {
                    name: displayName,
                    extension: ext,
                    vaultPath: resolvedVaultPath,
                    block: {
                        type: 'text',
                        text: `<attached_document name="${safeName}" format="${ext}"${vaultPathAttr}${sourceAttr}${result.metadata.pageCount ? ` pages="${result.metadata.pageCount}"` : ''}>\n${contextText}\n</attached_document>`,
                    },
                };

                // Preserve binary data for PPTX/POTX files (template source)
                if (ext === 'pptx' || ext === 'potx') {
                    item.binaryData = arrayBuffer;
                }

                this.pending.push(item);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                new Notice(`Failed to parse ${file.name}: ${msg}`);
                return;
            }
        } else if (TEXT_EXTENSIONS.some(te => file.name.toLowerCase().endsWith(te)) || file.type.startsWith('text/')) {
            const text = await file.text();
            // FEAT-24-03: always cap (per-turn attachment budget). An external file
            // with no vault path keeps a head excerpt + a notice that the rest is gone —
            // an uncapped paste of a huge file is exactly the context-bloat we're fixing.
            const contextText = this.truncateTextFileForContext(text, vaultPath ?? '');
            this.pending.push({
                name: displayName,
                vaultPath,
                block: { type: 'text', text: `<attached_file name="${escapeXmlAttr(displayName)}">\n${contextText}\n</attached_file>` },
            });
        } else {
            new Notice(t('ui.attachment.unsupported', { name: file.name }));
            return;
        }
        this.renderChips();
    }

    async addVaultFile(file: TFile): Promise<void> {
        try {
            const ext = file.extension.toLowerCase();

            if (BINARY_DOCUMENT_EXTENSIONS.has(ext)) {
                // Binary document — parse via document parser
                const data = await this.vault.readBinary(file);
                const result = await parseDocument(data, ext, this.plugin);

                if (result.text.length > LARGE_DOCUMENT_CHAR_THRESHOLD) {
                    new Notice(t('ui.attachment.largeDocument', { name: file.path }));
                }

                const contextText = this.truncateForContext(result.text, result.metadata.pageCount);
                this.pushFullDocText(result.text);
                const safePath = escapeXmlAttr(file.path);
                const item: AttachmentItem = {
                    name: file.path,
                    extension: ext,
                    vaultPath: file.path,
                    block: {
                        type: 'text',
                        text: `<attached_document name="${safePath}" format="${ext}" vault_path="${safePath}"${result.metadata.pageCount ? ` pages="${result.metadata.pageCount}"` : ''}>\n${contextText}\n</attached_document>`,
                    },
                };

                // Preserve binary data for PPTX/POTX files (template source)
                if (ext === 'pptx' || ext === 'potx') {
                    item.binaryData = data;
                }

                this.pending.push(item);
            } else if (ext === 'csv') {
                // CSV — read as text, parse to Markdown table
                const content = await this.vault.read(file);
                const data = new TextEncoder().encode(content).buffer;
                const result = await parseDocument(data, ext, this.plugin);
                const contextText = this.truncateTextFileForContext(result.text, file.path);

                this.pending.push({
                    name: file.path,
                    extension: ext,
                    block: {
                        type: 'text',
                        text: `<attached_document name="${escapeXmlAttr(file.path)}" format="${ext}">\n${contextText}\n</attached_document>`,
                    },
                });
            } else {
                // Text file — read as text. Large source files (a long note, an XML
                // dump) would otherwise be injected in full and dominate the context
                // window; cap it and point the model at read_file for the rest.
                const content = await this.vault.read(file);
                const contextText = this.truncateTextFileForContext(content, file.path);
                this.pending.push({
                    name: file.path,
                    extension: ext,
                    block: { type: 'text', text: `<attached_file name="${escapeXmlAttr(file.path)}">\n${contextText}\n</attached_file>` },
                });
            }
            this.renderChips();
        } catch {
            new Notice(t('ui.attachment.readFailed', { path: file.path }));
        }
    }

    renderChips(): void {
        this.chipBar.empty();
        this.pending.forEach((item, i) => {
            const chip = this.chipBar.createDiv('chat-attachment-chip');
            if (item.objectUrl) {
                const img = chip.createEl('img', { cls: 'attachment-chip-thumb' });
                img.src = item.objectUrl;
                img.alt = item.name;
            } else {
                const iconName = (item.extension && CHIP_ICON_MAP[item.extension]) || 'file-text';
                setIcon(chip.createSpan('attachment-chip-icon'), iconName);
                chip.createSpan('attachment-chip-name').setText(item.name);
            }
            const removeBtn = chip.createSpan('attachment-chip-remove');
            setIcon(removeBtn, 'x');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
                this.pending.splice(i, 1);
                this.renderChips();
            });
        });
    }

    /**
     * Clears the chip-bar UI: revokes object URLs, empties the pending list,
     * and empties the chipBar element. Does NOT touch fullDocTexts.
     * fullDocTexts have a different lifecycle (one tool-handoff per send pass)
     * and are managed via consumeFullDocTexts(). See ADR-112 / FIX-19-28-05.
     */
    clear(): void {
        for (const att of this.pending) {
            if (att.objectUrl) URL.revokeObjectURL(att.objectUrl);
        }
        this.pending.length = 0;
        this.chipBar.empty();
        this.contextCharsUsed = 0;
    }

    /** Returns the full (un-truncated) document texts for IngestDocumentTool and ReadDocumentTool. */
    getFullDocTexts(): string[] {
        return this.fullDocTexts;
    }

    /**
     * Atomically returns and clears the full document texts. Used by
     * AgentSidebarView at tool-handoff to pass texts to IngestDocumentTool /
     * ReadDocumentTool while resetting the internal buffer for the next turn.
     * Always returns a fresh array (caller mutations do not leak into state).
     * See ADR-112 / FIX-19-28-05.
     */
    consumeFullDocTexts(): string[] {
        const snapshot = [...this.fullDocTexts];
        this.fullDocTexts.length = 0;
        return snapshot;
    }

    /** Push a full document text with cumulative size guard to prevent OOM. */
    private pushFullDocText(text: string): void {
        const currentSize = this.fullDocTexts.reduce((sum, t) => sum + t.length, 0);
        if (currentSize + text.length > MAX_TOTAL_DOC_TEXT_SIZE) {
            const msg = `Total attachment text exceeds ${MAX_TOTAL_DOC_TEXT_SIZE / 1024 / 1024} MB limit. ` +
                'This document will not be available for ingest_document or read_document.';
            console.warn(`[AttachmentHandler] ${msg}`);
            // Push error marker so tools get a clear error instead of silently empty text
            this.fullDocTexts.push(`[ERROR: ${msg}]`);
            return;
        }
        this.fullDocTexts.push(text);
    }

    /**
     * FEAT-24-03: chars of attachment text still available for this compose turn.
     * Always at least 2000 so even an over-budget turn gets a usable excerpt.
     */
    private budgetRemaining(): number {
        return Math.max(2000, TOTAL_ATTACHMENT_CHAR_BUDGET - this.contextCharsUsed);
    }

    /** Track that `text` chars of context were consumed by an attachment. */
    private chargeContext(text: string): string {
        this.contextCharsUsed += text.length;
        return text;
    }

    /**
     * Truncate document text for the LLM context window.
     * Cuts at the last `## Page N` boundary before the limit (PDF), or at the last
     * paragraph break for other formats. Honours the per-turn attachment budget
     * (FEAT-24-03) — a single doc never exceeds CONTEXT_DOCUMENT_CHAR_LIMIT, and
     * later attachments shrink to whatever budget is left. Appends a truncation notice.
     */
    private truncateForContext(text: string, pageCount?: number): string {
        const maxChars = Math.min(CONTEXT_DOCUMENT_CHAR_LIMIT, this.budgetRemaining());
        if (text.length <= maxChars) return this.chargeContext(text);

        const limitSlice = text.slice(0, maxChars);

        // Try to cut at a ## Page N boundary for clean truncation
        const pageHeaderRegex = /\n## Page \d+\n/g;
        let lastPageBoundary = -1;
        let lastPageMatch: RegExpExecArray | null;
        while ((lastPageMatch = pageHeaderRegex.exec(limitSlice)) !== null) {
            lastPageBoundary = lastPageMatch.index;
        }

        let truncated: string;
        let pagesShown: string;
        if (lastPageBoundary > 0) {
            truncated = text.slice(0, lastPageBoundary);
            // Count how many pages are in the truncated text
            const shownCount = (truncated.match(/^## Page \d+$/gm) ?? []).length;
            pagesShown = `~${shownCount} of ${pageCount ?? '?'}`;
        } else {
            // Fallback: cut at last paragraph break
            const lastPara = limitSlice.lastIndexOf('\n\n');
            truncated = lastPara > 0 ? text.slice(0, lastPara) : limitSlice;
            pagesShown = pageCount ? `partial (${pageCount} total)` : 'partial';
        }

        return this.chargeContext(truncated +
            `\n\n[Document truncated for context window. Showing first ${pagesShown} pages. ` +
            'The full text is pre-parsed and available to tools. ' +
            'Use ingest_document (with attachment_index) to create a note with the COMPLETE original text appended automatically. This works regardless of file size. ' +
            'Use read_document with start_page/end_page to read specific page ranges.]');
    }

    /**
     * Cap a plain text / markdown attachment for the LLM context window. A long
     * note or an XML/JSON dump attached via @-mention (or several of them) would
     * otherwise be injected in full and crowd out everything else (and the model's
     * own output budget). Honours the per-turn attachment budget (FEAT-24-03).
     * When the file is in the vault the model reads the rest with read_file;
     * for an external/pasted file the omitted part is gone, so the notice says so.
     */
    private truncateTextFileForContext(text: string, vaultPath: string): string {
        const maxChars = Math.min(CONTEXT_DOCUMENT_CHAR_LIMIT, this.budgetRemaining());
        if (text.length <= maxChars) return this.chargeContext(text);
        // Cut on a line boundary near the limit when one is reasonably close.
        const nl = text.lastIndexOf('\n', maxChars);
        const cut = nl > maxChars / 2 ? nl : maxChars;
        const pct = Math.round((cut / text.length) * 100);
        const tail = vaultPath
            ? `Read the omitted part with read_file path="${vaultPath}". Do not assume it is empty or unimportant.]`
            : `The omitted part is not available (external/pasted file, not stored in the vault). Re-attach a smaller excerpt or save it to the vault first if you need it.]`;
        return this.chargeContext(text.slice(0, cut) +
            `\n\n[Attachment truncated for the context window: showing the first ~${pct}% ` +
            `(${cut.toLocaleString()} of ${text.length.toLocaleString()} characters). ${tail}`);
    }

    /**
     * Save an external PPTX/POTX file to the vault so that template analysis tools can access it.
     * Files are saved to "Tools & Settings/Templates/{filename}".
     * Returns the vault-relative path, or undefined on failure.
     */
    private async saveExternalTemplateToVault(fileName: string, data: ArrayBuffer): Promise<string | undefined> {
        try {
            const safeName = sanitiseAttachmentFileName(fileName);
            if (!safeName) {
                console.warn(`[AttachmentHandler] Refusing template-save with unsafe name: ${fileName}`);
                return undefined;
            }
            const templateDir = 'Tools & Settings/Templates';
            await this.vault.adapter.mkdir(templateDir);

            const targetPath = `${templateDir}/${safeName}`;
            const existing = this.vault.getAbstractFileByPath(targetPath);
            if (existing instanceof TFile) {
                await this.vault.modifyBinary(existing, data);
            } else {
                await this.vault.createBinary(targetPath, data);
            }

            new Notice(`Template saved to vault: ${targetPath}`);
            return targetPath;
        } catch (err) {
            console.warn('[AttachmentHandler] Failed to save external template to vault:', err);
            return undefined;
        }
    }

    /**
     * Persist a binary chat-attachment (PDF / DOCX / XLSX) into the user's
     * Obsidian attachment folder so a follow-up turn can reach the file via
     * `vault_path`. Skips PPTX/POTX -- those go through the template-folder
     * path instead. Reads `attachmentFolderPath` from `.obsidian/app.json`
     * (default `Attachements`) so users with a custom attachment folder
     * stay consistent. On collision the existing file is left untouched and
     * the existing path is returned -- the agent decides whether to
     * rename via `move_file`.
     */
    private async saveExternalBinaryToAttachments(fileName: string, data: ArrayBuffer): Promise<string | undefined> {
        try {
            // AUDIT-025 M-1 (CWE-22): sanitise the user-supplied file
            // name before it lands in a vault path. Browser/Electron
            // normally strip path components from File.name, but a
            // malicious sender (e.g. a compromised browser extension)
            // could pass `../escape/secret.pdf`. Reject any leftover
            // path separator, parent reference, or NUL char.
            const safeName = sanitiseAttachmentFileName(fileName);
            if (!safeName) {
                new Notice(`Refusing attachment with unsafe name: ${fileName}`, 8000);
                return undefined;
            }
            const folder = (await this.readAttachmentFolderPath()).replace(/\/+$/, '') || 'Attachements';
            await this.vault.adapter.mkdir(folder);

            // FIX-01-12-02: don't return the existing path blind. Compare
            // bytes first; on a real duplicate reuse the path, on a true
            // collision pick the next available `<base>-N.<ext>` slot.
            // Returning the existing path while pushing the NEW parsed
            // text into the chat was a silent content swap: chat history
            // pointed at `report.pdf` while every follow-up tool read the
            // previous bytes.
            const targetPath = await this.resolveAttachmentTargetPath(folder, safeName, data);
            if (!targetPath) {
                // Identical bytes already in vault — nothing to write.
                return `${folder}/${safeName}`;
            }
            await this.vault.createBinary(targetPath, data);
            new Notice(`Attachment saved to vault: ${targetPath}`);
            return targetPath;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[AttachmentHandler] Failed to save external binary to vault:', err);
            new Notice(`Attachment auto-save FAILED: ${msg}`, 8000);
            return undefined;
        }
    }

    /**
     * FIX-01-12-02: pick the path the next attachment write should land
     * on. Returns:
     *   - `<folder>/<name>` when no file exists there;
     *   - `null` when a byte-identical file already exists (reuse, skip write);
     *   - `<folder>/<base>-N.<ext>` otherwise, cascading until a free slot
     *     is found.
     *
     * The suffix lands BEFORE the final dot-segment so `archive.tar.gz`
     * becomes `archive.tar-2.gz`, not `archive-2.tar.gz` -- the file
     * stays openable by extension-based tools.
     */
    private async resolveAttachmentTargetPath(
        folder: string,
        safeName: string,
        data: ArrayBuffer,
    ): Promise<string | null> {
        const primary = `${folder}/${safeName}`;
        if (!(this.vault.getAbstractFileByPath(primary) instanceof TFile)) {
            return primary;
        }
        // Same name exists — compare bytes to decide between reuse and rename.
        try {
            const existingBytes = await this.vault.adapter.readBinary(primary);
            if (this.bytesEqual(existingBytes, data)) {
                new Notice(`Attachment already in vault (identical bytes): ${primary}`);
                return null;
            }
        } catch {
            // Read failed — fall through and rename defensively. Better
            // to write a new file than risk a silent overwrite or skip.
        }
        const dotIdx = safeName.lastIndexOf('.');
        const base = dotIdx > 0 ? safeName.slice(0, dotIdx) : safeName;
        const ext = dotIdx > 0 ? safeName.slice(dotIdx) : '';
        for (let n = 2; n < 1000; n++) {
            const candidate = `${folder}/${base}-${n}${ext}`;
            if (this.vault.getAbstractFileByPath(candidate) instanceof TFile) {
                // Slot taken — if its bytes match, reuse; else keep cascading.
                try {
                    const otherBytes = await this.vault.adapter.readBinary(candidate);
                    if (this.bytesEqual(otherBytes, data)) {
                        new Notice(`Attachment already in vault (identical bytes): ${candidate}`);
                        return null;
                    }
                } catch { /* fall through to next slot */ }
                continue;
            }
            return candidate;
        }
        // Defensive ceiling — extremely unlikely. Treat as failure.
        throw new Error(`No free attachment slot under ${folder}/${safeName} after 1000 tries`);
    }

    private bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
        if (a.byteLength !== b.byteLength) return false;
        const va = new Uint8Array(a);
        const vb = new Uint8Array(b);
        for (let i = 0; i < va.length; i++) {
            if (va[i] !== vb[i]) return false;
        }
        return true;
    }

    /**
     * Read the Obsidian-core attachment folder setting. Falls back to
     * `Attachements` (Sebastian's vault default) when the JSON cannot be
     * parsed; falls back to `Attachments` (Obsidian default) when the key
     * is missing entirely. We deliberately avoid hard-coding the path so
     * users that renamed the folder stay consistent.
     */
    private async readAttachmentFolderPath(): Promise<string> {
        try {
            // configDir is the user-configurable Obsidian config folder
            // (usually `.obsidian` but can be renamed). Reading via the
            // hardcoded `.obsidian/app.json` literal trips the
            // obsidianmd/hardcoded-config-path rule -- and would actually
            // miss the file on vaults with a renamed config folder.
            const configDir = this.vault.configDir;
            const raw = await this.vault.adapter.read(`${configDir}/app.json`);
            const parsed = JSON.parse(raw) as { attachmentFolderPath?: unknown };
            const v = parsed.attachmentFolderPath;
            if (typeof v === 'string' && v.trim()) return v.trim();
            return 'Attachments';
        } catch {
            return 'Attachements';
        }
    }

    /**
     * Try to resolve an OS file picker File to a vault-relative path.
     *
     * Electron's File objects have a non-standard `.path` property containing
     * the full filesystem path (e.g. "/Users/x/Vault/folder/file.pptx").
     * If the file is inside the vault root, returns the relative vault path
     * (e.g. "folder/file.pptx"). Otherwise returns undefined.
     */
    private resolveOsPathToVaultPath(file: File): string | undefined {
        const osPath = (file as unknown as { path?: string }).path;
        if (!osPath) return undefined;

        const adapter = this.vault.adapter as FileSystemAdapter;
        const vaultRoot: string = adapter.basePath ?? adapter.getBasePath?.() ?? '';
        if (!vaultRoot) return undefined;

        // Normalize path separators (Windows uses backslashes)
        const normalizedOs = osPath.replace(/\\/g, '/');
        const normalizedRoot = vaultRoot.replace(/\\/g, '/').replace(/\/$/, '');

        if (normalizedOs.startsWith(normalizedRoot + '/')) {
            return normalizedOs.slice(normalizedRoot.length + 1);
        }
        return undefined;
    }
}

/**
 * AUDIT-025 M-1: keep agent-controlled vault writes within their
 * configured folder. Strips path separators (forward + backward
 * slashes), refuses anything containing a parent-reference (`..`),
 * a NUL char, or a leading dot-segment ("`./`"). Trims surrounding
 * whitespace. Returns the safe filename or an empty string when the
 * input cannot be normalised into a single-segment name; callers
 * abort the save on empty.
 */
export function sanitiseAttachmentFileName(raw: string): string {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw.trim();
    if (s.includes('\0')) return '';
    if (s.includes('..')) return '';
    // Strip platform path separators -- a real file-name has none.
    s = s.replace(/[\\/]/g, '');
    // Drop a leading dot (so ".env" stays valid as an extension-leading
    // name only if the user really wants it; we forbid hidden-leading
    // double-dot which is already covered above).
    if (s.startsWith('.')) s = s.replace(/^\.+/, '');
    return s.trim();
}
