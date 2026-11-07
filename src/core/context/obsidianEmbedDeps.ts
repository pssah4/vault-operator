import { TFile, resolveSubpath } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { isDeniedPath } from '../tools/vault/denyZoneFilter';
import type { ResolveEmbedsDeps } from './resolveEmbeds';

/**
 * IMP-03-03-01 (Issue #94): the thin Obsidian side of resolveEmbeds. Uses only
 * platform API (link resolution, subpath resolution, frontmatter position), no
 * Markdown parser of our own, so headings and block ids behave exactly like the
 * embeds Obsidian renders itself.
 */
export function makeEmbedDeps(plugin: ObsidianAgentPlugin): ResolveEmbedsDeps {
    const { vault, metadataCache } = plugin.app;
    return {
        isDenied: (path) => isDeniedPath(plugin, path),
        async load(linkpath, subpath, fromPath) {
            // An empty linkpath is an embed of the note itself ("![[#Heading]]").
            const file = linkpath
                ? metadataCache.getFirstLinkpathDest(linkpath, fromPath)
                : vault.getAbstractFileByPath(fromPath);
            if (!(file instanceof TFile) || file.extension !== 'md') return null; // images, PDFs, canvases stay literal
            const raw = await vault.cachedRead(file);
            const cache = metadataCache.getFileCache(file);
            if (!subpath) return { path: file.path, text: raw.slice(cache?.frontmatterPosition?.end.offset ?? 0) };
            const hit = cache ? resolveSubpath(cache, subpath) : null;
            return hit ? { path: file.path, text: raw.slice(hit.start.offset, hit.end?.offset) } : null;
        },
    };
}
