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
