/**
 * Minimal stub for the `obsidian` module — only covers what test files import.
 * Most production imports of `obsidian` are `import type`, so nothing runs at
 * test time. Exception: `normalizePath`, used by VaultDataFileAdapter.
 */
export class Vault {}
export class App {}
export class Plugin {}
export class TFile {}
export class TFolder {}

/** Notice constructor stub — production code does `new Notice(msg)`. */
export class Notice { constructor(_msg?: string, _timeout?: number) { /* no-op */ } }

/** Ambient `requestUrl` stub so modules that import it at the top level load. */
export function requestUrl(_opts: unknown): Promise<unknown> {
    throw new Error('requestUrl stub called -- wire a mock in the test.');
}

/**
 * Mirrors Obsidian's normalizePath: collapses backslashes to forward slashes,
 * removes duplicate slashes, and trims leading/trailing slashes. The real
 * implementation also handles `..` and `.` segments; this stub keeps it simple
 * because the tests don't exercise those.
 */
export function normalizePath(p: string): string {
    return p
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/+|\/+$/g, '');
}
