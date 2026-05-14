/**
 * Entry point for the office-bundle.js Optional Asset.
 *
 * esbuild bundles this file as a standalone CommonJS bundle with `exceljs`,
 * `docx`, and `pptxgenjs` resolved and tree-shaken. BundleLoader fetches the
 * resulting file at runtime from the {version}-assets GitHub release, verifies
 * its SHA256, and evaluates it via the indirect Function-constructor pattern.
 *
 * Only used during the office-bundle.js build (entry-point referenced by
 * esbuild.config.mjs generateOfficeBundles()). Not imported by main.ts.
 */
import ExcelJSDefault from 'exceljs';
import * as DocxNs from 'docx';
import PptxGenJSDefault from 'pptxgenjs';

export const ExcelJS = ExcelJSDefault;
export const docx = DocxNs;
export const PptxGenJS = PptxGenJSDefault;
