/**
 * GraphExtractor -- Extract graph data from Obsidian's metadataCache into GraphStore.
 *
 * Reads Wikilinks (body + frontmatter MOC-Properties) and tags from each vault file
 * and writes them as edges/tags into the Knowledge DB. Supports both full extraction
 * (on startup) and incremental updates (on vault events).
 *
 * ADR-050: SQLite Knowledge DB
 * FEATURE-1502: Graph Data Extraction & Expansion
 */

import type { App, TFile, Vault } from 'obsidian';
import type { GraphStore, Edge } from './GraphStore';

// Wikilink regex — matches [[target]], [[target|alias]], [[target#heading]]
const WIKILINK_RE = /\[\[([^\]|#\n]+?)(?:[|#][^\]]*?)?\]\]/g;

// ---------------------------------------------------------------------------
// GraphExtractor
// ---------------------------------------------------------------------------

export class GraphExtractor {
    private app: App;
    private graphStore: GraphStore;
    private mocProperties: string[];

    constructor(app: App, graphStore: GraphStore, mocProperties: string[]) {
        this.app = app;
        this.graphStore = graphStore;
        this.mocProperties = mocProperties;
    }

    /** Update the MOC property names at runtime (e.g. when settings change). */
    setMocProperties(properties: string[]): void {
        this.mocProperties = properties;
    }

    // -----------------------------------------------------------------------
    // Full extraction
    // -----------------------------------------------------------------------

    /**
     * Extract graph data from all markdown files in the vault.
     * Fast: reads only metadataCache (no file I/O), typically <10s for 800 files.
     */
    extractAll(vault: Vault): { edgeCount: number; tagCount: number } {
        const files = vault.getMarkdownFiles();
        for (const file of files) {
            this.extractFile(file);
        }
        const edgeCount = this.graphStore.getEdgeCount();
        const tagCount = this.graphStore.getTagCount();
        console.debug(`[GraphExtractor] Extracted ${edgeCount} edges, ${tagCount} unique tags from ${files.length} files`);
        return { edgeCount, tagCount };
    }

    // -----------------------------------------------------------------------
    // Incremental extraction
    // -----------------------------------------------------------------------

    /**
     * Extract edges and tags for a single file.
     * Replaces any existing data for this path (atomic update).
     */
    extractFile(file: TFile): void {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) return;

        const edges: Edge[] = [];

        // 1. Body Wikilinks: cache.links contains all [[wikilinks]] in the note body
        // Only .md and .canvas files are valid graph edges (skip PDFs, images, Outlook/Teams links)
        if (cache.links) {
            for (const lc of cache.links) {
                const resolved = this.app.metadataCache.getFirstLinkpathDest(lc.link, file.path);
                if (!resolved) continue; // broken link — skip
                if (resolved.path === file.path) continue; // self-link — skip
                if (!resolved.path.endsWith('.md') && !resolved.path.endsWith('.canvas')) continue; // non-note — skip
                edges.push({
                    targetPath: resolved.path,
                    linkType: 'body',
                    propertyName: null,
                });
            }
        }

        // 2. Frontmatter MOC-Properties: structured links like Themen: [[KI]]
        if (cache.frontmatter) {
            for (const propName of this.mocProperties) {
                const value = cache.frontmatter[propName];
                if (!value) continue;
                const links = this.parseWikilinksFromFrontmatter(value, file.path);
                for (const targetPath of links) {
                    if (targetPath === file.path) continue; // self-link — skip
                    if (!targetPath.endsWith('.md') && !targetPath.endsWith('.canvas')) continue; // non-note — skip
                    edges.push({
                        targetPath,
                        linkType: 'frontmatter',
                        propertyName: propName,
                    });
                }
            }
        }

        // 3. Tags: frontmatter tags + inline #tags
        const tags: string[] = [];
        if (cache.frontmatter?.tags) {
            const fmTags = cache.frontmatter.tags;
            const arr = Array.isArray(fmTags) ? fmTags : [fmTags];
            for (const t of arr) {
                if (typeof t === 'string') {
                    tags.push(t.startsWith('#') ? t.slice(1).toLowerCase() : t.toLowerCase());
                }
            }
        }
        if (cache.tags) {
            for (const tc of cache.tags) {
                const normalized = tc.tag.startsWith('#') ? tc.tag.slice(1).toLowerCase() : tc.tag.toLowerCase();
                if (!tags.includes(normalized)) tags.push(normalized);
            }
        }

        // Write to DB (atomic: DELETE old + INSERT new)
        this.graphStore.replaceEdgesForPath(file.path, edges);
        this.graphStore.replaceTagsForPath(file.path, tags);
    }

    /** Remove all graph data for a deleted/renamed file. */
    removeFile(path: string): void {
        this.graphStore.deleteByPath(path);
    }

    // -----------------------------------------------------------------------
    // Frontmatter Wikilink parsing
    // -----------------------------------------------------------------------

    /**
     * Parse Wikilinks from a frontmatter property value.
     * Handles multiple formats:
     *   - String: "[[KI]]" or "[[KI]], [[ML]]"
     *   - Array: [[[KI]], [[ML]]] or ["[[KI]]", "[[ML]]"]
     *   - Plain string (no brackets): "KI" → resolve as link
     *
     * Returns resolved file paths (broken links are skipped).
     */
    private parseWikilinksFromFrontmatter(value: unknown, sourcePath: string): string[] {
        const paths: string[] = [];
        const texts: string[] = [];

        if (typeof value === 'string') {
            texts.push(value);
        } else if (Array.isArray(value)) {
            for (const item of value) {
                if (typeof item === 'string') texts.push(item);
            }
        }

        for (const text of texts) {
            // Try to extract [[wikilinks]]
            WIKILINK_RE.lastIndex = 0;
            let match: RegExpExecArray | null;
            let foundWikilink = false;
            while ((match = WIKILINK_RE.exec(text)) !== null) {
                foundWikilink = true;
                const linktext = match[1].trim();
                const resolved = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
                if (resolved) paths.push(resolved.path);
            }

            // If no [[wikilinks]] found, try resolving the plain text as a link
            if (!foundWikilink && text.trim()) {
                const resolved = this.app.metadataCache.getFirstLinkpathDest(text.trim(), sourcePath);
                if (resolved) paths.push(resolved.path);
            }
        }

        return paths;
    }
}
