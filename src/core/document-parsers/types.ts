/**
 * Document Parser Types
 *
 * Shared types for the document parsing pipeline.
 * Used by all parsers and the parseDocument entry point.
 */

/** Metadata about an embedded image (no image data, just position info). */
export interface ImageMetadata {
    id: string;
    filename: string;
    /** Human-readable location, e.g. "Slide 3" or "Page 5" */
    location: string;
    width?: number;
    height?: number;
}

/** Result of parsing a document. */
export interface ParseResult {
    /** Structured text output (Markdown-like). */
    text: string;
    /** Image metadata only — actual image data is extracted on-demand (Phase 2). */
    images: ImageMetadata[];
    /** Document-level metadata. */
    metadata: {
        format: string;
        pageCount?: number;
        sheetNames?: string[];
    };
}

/** Supported document extensions for parsing. */
export const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
    'pptx', 'potx', 'xlsx', 'docx', 'pdf', 'csv', 'json', 'xml',
]);

/** Extensions that require binary reading (ArrayBuffer). */
export const BINARY_DOCUMENT_EXTENSIONS = new Set([
    'pptx', 'potx', 'xlsx', 'docx', 'pdf',
]);

/** Maximum decompressed size for ZIP-based formats (ZIP-bomb protection). */
export const MAX_DECOMPRESSED_SIZE = 500 * 1024 * 1024; // 500 MB

/** Maximum input file size for binary uploads (images). */
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/** Maximum input file size for document text extraction (PDFs, Office docs). Higher because only text is extracted, not the full binary. */
export const MAX_DOCUMENT_FILE_SIZE = 200 * 1024 * 1024; // 200 MB

/** Text length threshold for large-document warning. */
export const LARGE_DOCUMENT_CHAR_THRESHOLD = 100_000;

/** Max chars for a SINGLE document/text attachment embedded in LLM context. Full text stays available for chunked reading via read_document / read_file. */
export const CONTEXT_DOCUMENT_CHAR_LIMIT = 80_000;

/**
 * FEAT-24-03 (ADR-63 amendment): max chars summed over ALL attachments of one
 * compose turn. A single 80k-char file is fine; five of them is the 138k/181k
 * disaster. ~64k chars ≈ ~16k tokens — enough material, leaves room for the
 * conversation and the model's own output budget. Each new attachment is capped
 * to whatever budget is left (but always at least a small excerpt + pointer).
 */
export const TOTAL_ATTACHMENT_CHAR_BUDGET = 64_000;
