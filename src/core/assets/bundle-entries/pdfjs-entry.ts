/**
 * Entry point for the pdfjs-bundle.js Optional Asset.
 *
 * esbuild bundles this file as a standalone CommonJS bundle that includes
 * both pdfjs-dist and its worker module. The worker import is a side-effect
 * that registers the fake-worker on the main thread (PdfParser already uses
 * fake-worker mode because Obsidian/Electron blocks Web Workers from
 * arbitrary URLs).
 *
 * BundleLoader fetches the resulting file at runtime from the {version}-assets
 * GitHub release, verifies its SHA256, and evaluates it via the indirect
 * Function-constructor pattern.
 *
 * Only used during the pdfjs-bundle.js build (entry-point referenced by
 * esbuild.config.mjs generateOfficeBundles()). Not imported by main.ts.
 */
import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';

export const pdfjs = pdfjsLib;
export const worker = pdfjsWorker;
