/**
 * LibreOffice Detection Utility
 *
 * Detects LibreOffice installation on macOS, Linux, and Windows.
 * Used by RenderPresentationTool and Visual Intelligence Settings Tab.
 */

import { spawnAllowed } from '../security/spawnAllowlist';

export interface LibreOfficeStatus {
    found: boolean;
    path?: string;
}

/** Known installation paths per platform */
const KNOWN_PATHS: Record<string, string[]> = {
    darwin: [
        '/Applications/LibreOffice.app/Contents/MacOS/soffice',
        '/opt/homebrew/bin/soffice',
        '/usr/local/bin/soffice',
    ],
    linux: [
        '/usr/bin/soffice',
        '/usr/local/bin/soffice',
        '/snap/bin/libreoffice',
    ],
    win32: [
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ],
};

/** Cached result — only detect once per session */
let cachedResult: LibreOfficeStatus | null = null;

/** Resolve binary to absolute path via 'which' (macOS/Linux) or 'where' (Windows) */
function resolveBinary(name: string): Promise<string | null> {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    return new Promise((resolve) => {
        const child = spawnAllowed(cmd, [name], {
            timeout: 5_000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        // stdio is ['ignore', 'pipe', 'pipe'] above, so stdout/stderr cannot be null here.
        child.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
        child.on('close', (code: number | null) => {
            if (code === 0 && stdout.trim()) {
                resolve(stdout.trim().split('\n')[0]);
            } else {
                resolve(null);
            }
        });
        child.on('error', () => resolve(null));
    });
}

/** Check if a file exists by trying to spawn a version check */
function checkPath(path: string): Promise<boolean> {
    return new Promise((resolve) => {
        const child = spawnAllowed(path, ['--version'], {
            timeout: 5_000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.on('close', (code: number | null) => resolve(code === 0));
        child.on('error', () => resolve(false));
    });
}

/**
 * Detect LibreOffice installation.
 *
 * @param customPath Optional user-configured path from Settings
 * @param forceRefresh If true, ignore cached result
 */
export async function detectLibreOffice(
    customPath?: string,
    forceRefresh = false,
): Promise<LibreOfficeStatus> {
    if (cachedResult && !forceRefresh && !customPath) return cachedResult;

    // 1. Custom path has highest priority
    if (customPath) {
        const valid = await checkPath(customPath);
        if (valid) {
            const result = { found: true, path: customPath };
            cachedResult = result;
            return result;
        }
    }

    // 2. Check known platform paths
    const platformPaths = KNOWN_PATHS[process.platform] ?? [];
    for (const knownPath of platformPaths) {
        const valid = await checkPath(knownPath);
        if (valid) {
            const result = { found: true, path: knownPath };
            cachedResult = result;
            return result;
        }
    }

    // 3. Fallback: resolve via PATH
    const resolved = await resolveBinary('soffice');
    if (resolved) {
        const result = { found: true, path: resolved };
        cachedResult = result;
        return result;
    }

    const result: LibreOfficeStatus = { found: false };
    cachedResult = result;
    return result;
}

/** Clear cached detection result (e.g. after user installs LibreOffice) */
export function clearLibreOfficeCache(): void {
    cachedResult = null;
}

// ── PDF-to-PNG converter detection ─────────────────────────────────────

export interface PdfToPngConverter {
    found: boolean;
    tool: 'pdftoppm' | 'gs' | 'none';
    path?: string;
}

/** Cached result for PDF-to-PNG converter */
let cachedPdfConverter: PdfToPngConverter | null = null;

/**
 * Detect available PDF-to-PNG converter.
 * Priority: pdftoppm (poppler-utils) > gs (Ghostscript)
 */
export async function detectPdfToPngConverter(
    forceRefresh = false,
): Promise<PdfToPngConverter> {
    if (cachedPdfConverter && !forceRefresh) return cachedPdfConverter;

    // 1. Try pdftoppm (best quality, most common)
    const pdftoppm = await resolveBinary('pdftoppm');
    if (pdftoppm) {
        cachedPdfConverter = { found: true, tool: 'pdftoppm', path: pdftoppm };
        return cachedPdfConverter;
    }

    // 2. Try Ghostscript
    const gs = await resolveBinary('gs');
    if (gs) {
        cachedPdfConverter = { found: true, tool: 'gs', path: gs };
        return cachedPdfConverter;
    }

    cachedPdfConverter = { found: false, tool: 'none' };
    return cachedPdfConverter;
}

/** Clear cached PDF converter result */
export function clearPdfConverterCache(): void {
    cachedPdfConverter = null;
}
