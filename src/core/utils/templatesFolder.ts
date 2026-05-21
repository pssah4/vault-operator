/**
 * FEAT-29-14: Obsidian-Core-Templates-Plugin folder resolver.
 *
 * The Obsidian core plugin "Templates" stores its configured folder in
 * `<configDir>/templates.json` as `{ "folder": "Path/To/Templates", ... }`.
 * Vault Operator's First-Run wizard and TemplateMaterializer write the
 * shipped Default-Templates into that folder so the user can pick them
 * up via Obsidian's native "Insert template" command without juggling a
 * second plugin or a separate folder.
 *
 * Returns `null` for any failure mode (templates plugin disabled, file
 * missing, malformed JSON, empty folder field). Callers should treat
 * null as "ask the user where templates should live".
 */

import type { App } from 'obsidian';

export async function resolveCoreTemplatesFolder(app: App): Promise<string | null> {
    const configDir = app.vault.configDir;
    const path = `${configDir}/templates.json`;
    let raw: string;
    try {
        raw = await app.vault.adapter.read(path);
    } catch {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const folderRaw = (parsed as { folder?: unknown }).folder;
    if (typeof folderRaw !== 'string' || folderRaw.length === 0) return null;
    // Users occasionally type "/Templates" in the Obsidian UI; the
    // adapter expects a vault-relative path, no leading slash.
    return folderRaw.replace(/^\/+/, '');
}
