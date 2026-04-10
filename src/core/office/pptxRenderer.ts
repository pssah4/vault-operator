/**
 * pptxRenderer.ts — Shared PPTX-to-PNG rendering pipeline
 *
 * Two-step conversion:
 *   1. PPTX → PDF (LibreOffice headless)
 *   2. PDF → PNG (pdf.js in-process rendering via Canvas API)
 *
 * No external PDF-to-PNG tools required (pdftoppm, gs).
 * pdf.js runs in fake-worker mode for Electron/Obsidian compatibility.
 *
 * Used by both AnalyzePptxTemplateTool (integrated pipeline) and
 * RenderPresentationTool (standalone visual inspection).
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectLibreOffice } from './libreOfficeDetector';

/** Timeout for LibreOffice conversion (ms) */
const CONVERSION_TIMEOUT = 120_000;

/** Scale factor for PDF→PNG rendering (2.0 = good quality at ~1920px width) */
const RENDER_SCALE = 2.0;

/** Result of a single rendered slide */
export interface RenderedSlide {
    slideNumber: number;
    base64: string;
}

/** Result of the rendering pipeline */
export interface RenderResult {
    success: boolean;
    slides: RenderedSlide[];
    totalSlides: number;
    error?: string;
}

/**
 * Render a PPTX file to PNG images.
 *
 * @param absolutePptxPath - Absolute filesystem path to the .pptx file
 * @param options - Optional configuration
 * @returns RenderResult with base64-encoded slide images
 */
export async function renderPptxToImages(
    absolutePptxPath: string,
    options?: {
        customLibreOfficePath?: string;
        maxSlides?: number;
        requestedSlides?: number[];
    },
): Promise<RenderResult> {
    const maxSlides = options?.maxSlides ?? 10;

    // 1. Detect LibreOffice
    const libreOffice = await detectLibreOffice(options?.customLibreOfficePath);
    if (!libreOffice.found || !libreOffice.path) {
        return {
            success: false,
            slides: [],
            totalSlides: 0,
            error: 'LibreOffice is not installed. Install it from https://www.libreoffice.org/download/',
        };
    }

    // 2. Verify input file exists
    if (!fs.existsSync(absolutePptxPath)) {
        return {
            success: false,
            slides: [],
            totalSlides: 0,
            error: `File not found: ${absolutePptxPath}`,
        };
    }

    // 3. Create temp directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obsilo-render-'));

    try {
        // 4. Copy PPTX to temp (LibreOffice writes output next to input).
        // .potx/.potm files are structurally identical to .pptx (same OpenXML format)
        // but LibreOffice headless may fail on them; rename to .pptx before conversion.
        const baseName = path.basename(absolutePptxPath).replace(/\.pot[xm]$/i, '.pptx');
        const tempPptx = path.join(tempDir, baseName);
        fs.copyFileSync(absolutePptxPath, tempPptx);

        // 5. PPTX → PDF (LibreOffice headless)
        const tempPdfPath = await convertToPdf(libreOffice.path, tempPptx, tempDir);

        // 6. PDF → PNGs (pdf.js in-process via Canvas API)
        const pdfData = fs.readFileSync(tempPdfPath);
        const allSlides = await renderPdfToImages(pdfData);

        if (allSlides.length === 0) {
            return {
                success: false,
                slides: [],
                totalSlides: 0,
                error: 'PDF rendering produced no images. The file might be corrupt.',
            };
        }

        // 7. Filter to requested slides
        let selectedSlides = allSlides;
        if (options?.requestedSlides && options.requestedSlides.length > 0) {
            const requestedSet = new Set(options.requestedSlides);
            selectedSlides = allSlides.filter((s) => requestedSet.has(s.slideNumber));
        }

        // Cap at maxSlides
        if (selectedSlides.length > maxSlides) {
            selectedSlides = selectedSlides.slice(0, maxSlides);
        }

        return {
            success: true,
            slides: selectedSlides,
            totalSlides: allSlides.length,
        };
    } catch (err) {
        return {
            success: false,
            slides: [],
            totalSlides: 0,
            error: err instanceof Error ? err.message : String(err),
        };
    } finally {
        // Cleanup temp directory
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // Non-fatal: temp files will be cleaned up by OS
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Step 1: PPTX → PDF via LibreOffice                                */
/* ------------------------------------------------------------------ */

function convertToPdf(
    sofficePath: string,
    pptxPath: string,
    outDir: string,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(sofficePath, [
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', outDir,
            pptxPath,
        ], {
            shell: false,
            timeout: CONVERSION_TIMEOUT,
            env: {
                PATH: process.env.PATH,
                HOME: process.env.HOME ?? process.env.USERPROFILE,
                USERPROFILE: process.env.USERPROFILE,
                LANG: 'en_US.UTF-8',
                ...(process.platform === 'win32' ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });

        let stderr = '';
        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
            if (stderr.length > 10_000) stderr = stderr.slice(-10_000);
        });

        const killTimer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch { /* already exited */ }
        }, CONVERSION_TIMEOUT + 5_000);

        child.on('close', (code: number | null) => {
            clearTimeout(killTimer);
            if (code === 0) {
                const baseName = path.basename(pptxPath, path.extname(pptxPath));
                const pdfPath = path.join(outDir, `${baseName}.pdf`);
                if (fs.existsSync(pdfPath)) {
                    resolve(pdfPath);
                } else {
                    reject(new Error('LibreOffice PPTX-to-PDF conversion produced no output file.'));
                }
            } else {
                reject(new Error(
                    `LibreOffice PDF conversion failed (exit code ${code}).` +
                    (stderr.trim() ? ` Error: ${stderr.trim()}` : ''),
                ));
            }
        });

        child.on('error', (err: Error) => {
            clearTimeout(killTimer);
            reject(err);
        });
    });
}

/* ------------------------------------------------------------------ */
/*  Step 2: PDF → PNG via pdf.js + Canvas (in-process, no ext. tools)  */
/* ------------------------------------------------------------------ */

/**
 * Render all pages of a PDF to PNG images using pdf.js and the Canvas API.
 *
 * Runs in fake-worker mode (no Web Worker) for Obsidian/Electron compatibility.
 * Uses OffscreenCanvas when available, falls back to DOM canvas.
 */
async function renderPdfToImages(pdfData: Buffer): Promise<RenderedSlide[]> {
    // Dynamic import — same pattern as PdfParser.ts
    const pdfjsLib = await import('pdfjs-dist') as Record<string, unknown> & {
        GlobalWorkerOptions?: { workerSrc: string };
        getDocument(params: { data: Uint8Array; useWorkerFetch: boolean }): {
            promise: Promise<{
                numPages: number;
                getPage(num: number): Promise<{
                    getViewport(params: { scale: number }): { width: number; height: number };
                    render(params: {
                        canvasContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
                        viewport: { width: number; height: number };
                    }): { promise: Promise<void> };
                    cleanup(): void;
                }>;
                destroy(): void;
            }>;
        };
    };

    // Save global state — see PdfParser.ts for full explanation.
    const savedPdfjsWorker = (globalThis as Record<string, unknown>).pdfjsWorker;
    const savedWorkerSrc = pdfjsLib.GlobalWorkerOptions?.workerSrc;

    // Disable web worker — fake-worker fallback
    if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    }
    await import('pdfjs-dist/build/pdf.worker.mjs');

    const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfData),
        useWorkerFetch: false,
    });
    const pdf = await loadingTask.promise;

    try {
        const slides: RenderedSlide[] = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: RENDER_SCALE });

            // Create canvas for rendering
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                page.cleanup();
                continue;
            }

            // Render page to canvas
            await page.render({
                canvasContext: ctx,
                viewport,
            }).promise;

            // Export canvas as PNG base64
            const dataUrl = canvas.toDataURL('image/png');
            const base64 = dataUrl.split(',')[1] ?? '';

            if (base64) {
                slides.push({ slideNumber: pageNum, base64 });
            }

            page.cleanup();
        }

        pdf.destroy();
        return slides;
    } finally {
        // Restore Obsidian's global state so its PDF viewer keeps working.
        if (savedPdfjsWorker === undefined) {
            delete (globalThis as Record<string, unknown>).pdfjsWorker;
        } else {
            (globalThis as Record<string, unknown>).pdfjsWorker = savedPdfjsWorker;
        }
        if (pdfjsLib.GlobalWorkerOptions && savedWorkerSrc !== undefined) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = savedWorkerSrc;
        }
    }
}
