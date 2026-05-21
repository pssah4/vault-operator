/**
 * FEAT-29-14: tests for the Obsidian-Core-Templates-Plugin folder
 * resolver. We bypass the App / Vault types via a minimal stub so the
 * helper stays import-light and testable without a real Obsidian
 * environment.
 */

import { describe, it, expect } from 'vitest';
import { resolveCoreTemplatesFolder } from '../templatesFolder';

type AdapterRead = (path: string) => Promise<string>;

function makeApp(configDir: string, files: Record<string, string | Error>): unknown {
    return {
        vault: {
            configDir,
            adapter: {
                read: (async (p: string) => {
                    const v = files[p];
                    if (v instanceof Error) throw v;
                    if (typeof v !== 'string') throw new Error(`ENOENT ${p}`);
                    return v;
                }) as AdapterRead,
            },
        },
    };
}

describe('resolveCoreTemplatesFolder', () => {
    it('returns the configured folder when templates.json has a non-empty folder string', async () => {
        const app = makeApp('.obsidian', {
            '.obsidian/templates.json': JSON.stringify({ folder: 'Tools & Settings/Templates', dateFormat: 'DD-MM-YYYY' }),
        });
        const folder = await resolveCoreTemplatesFolder(app as never);
        expect(folder).toBe('Tools & Settings/Templates');
    });

    it('returns null when templates.json does not exist', async () => {
        const app = makeApp('.obsidian', {});
        const folder = await resolveCoreTemplatesFolder(app as never);
        expect(folder).toBeNull();
    });

    it('returns null when templates.json is malformed JSON', async () => {
        const app = makeApp('.obsidian', { '.obsidian/templates.json': '{not json' });
        const folder = await resolveCoreTemplatesFolder(app as never);
        expect(folder).toBeNull();
    });

    it('returns null when folder field is missing', async () => {
        const app = makeApp('.obsidian', { '.obsidian/templates.json': JSON.stringify({ dateFormat: 'DD-MM-YYYY' }) });
        const folder = await resolveCoreTemplatesFolder(app as never);
        expect(folder).toBeNull();
    });

    it('returns null when folder field is an empty string', async () => {
        const app = makeApp('.obsidian', { '.obsidian/templates.json': JSON.stringify({ folder: '' }) });
        const folder = await resolveCoreTemplatesFolder(app as never);
        expect(folder).toBeNull();
    });

    it('honors the vault.configDir (not hard-coded .obsidian) so custom hidden-config locations work', async () => {
        // FEAT-29-01 follow-up: configDir can be relocated by Obsidian
        // for a custom-config vault. The helper must compose the path
        // off the live configDir, not assume `.obsidian/`.
        const app = makeApp('.my-config', {
            '.my-config/templates.json': JSON.stringify({ folder: 'tpl' }),
        });
        const folder = await resolveCoreTemplatesFolder(app as never);
        expect(folder).toBe('tpl');
    });

    it('trims a leading slash so the result is always a vault-relative path', async () => {
        // Users sometimes type "/Templates" in Obsidian's UI; the
        // adapter API expects vault-relative paths without a leading
        // slash. Normalize defensively.
        const app = makeApp('.obsidian', { '.obsidian/templates.json': JSON.stringify({ folder: '/Templates' }) });
        const folder = await resolveCoreTemplatesFolder(app as never);
        expect(folder).toBe('Templates');
    });
});
