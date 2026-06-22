/**
 * LookupAppendix -- markdown renderer for the inline Lookup-Action result (EPIC-33).
 *
 * Pure function. Takes the typed RAG / web / edge results and emits a
 * single markdown block that gets appended to the assistant bubble
 * AFTER the LLM stream completes. Sections are omitted when empty.
 *
 * Order:
 *   1. Vault sources    (one bullet per LookupRagSource)
 *   2. Web sources      (one bullet per WebLookupResult)
 *   3. Explicit connections   (backlink / outgoing-link / tag-cooccurrence)
 *   4. Implicit connections   (implicit-similarity)
 *
 * Wikilink targets always strip `.md`. Confidence rendered as a 2-decimal number.
 * Web results render as plain markdown links, never as wikilinks.
 */

import type { LookupRagSource } from '../actions/LookupAction';
import type { InlineEdgeHit } from './LookupEdgeAggregator';
import type { WebLookupResult } from './InlineWebLookup';

export type LookupTier = 'strong' | 'weak' | 'empty';

export interface RenderArgs {
    tier: LookupTier;
    vaultSources: LookupRagSource[];
    webResults: WebLookupResult[];
    edges: InlineEdgeHit[];
}

export function renderLookupAppendix(args: RenderArgs): string {
    const parts: string[] = [];

    if (args.tier === 'weak' && args.vaultSources.length > 0) {
        parts.push('*Low confidence -- vault match is partial.*');
    }

    if (args.vaultSources.length > 0) {
        parts.push('**Vault sources**');
        for (const s of args.vaultSources) {
            const display = wikilinkDisplay(s.notePath);
            const conf = Math.round(s.confidence * 100) / 100;
            const excerpt = s.excerpt !== undefined && s.excerpt.length > 0
                ? ` -- ${truncate(escapeInline(s.excerpt), 120)}`
                : '';
            parts.push(`- [[${display}]] (${conf})${excerpt}`);
        }
    }

    if (args.webResults.length > 0) {
        if (parts.length > 0) parts.push('');
        parts.push('**Web sources**');
        for (const w of args.webResults) {
            const snippet = w.snippet.length > 0 ? ` -- ${truncate(escapeInline(w.snippet), 160)}` : '';
            const title = escapeMarkdownLinkLabel(w.title);
            const url = escapeMarkdownLinkTarget(w.url);
            parts.push(`- [${title}](${url})${snippet}`);
        }
    }

    const explicit = args.edges.filter(e => e.type !== 'implicit-similarity');
    const implicit = args.edges.filter(e => e.type === 'implicit-similarity');

    if (explicit.length > 0) {
        if (parts.length > 0) parts.push('');
        parts.push('**Explicit connections**');
        for (const e of explicit) {
            const display = wikilinkDisplay(e.targetPath);
            parts.push(`- [[${display}]] -- ${escapeInline(e.reason)}`);
        }
    }

    if (implicit.length > 0) {
        if (parts.length > 0) parts.push('');
        parts.push('**Implicit connections**');
        for (const e of implicit) {
            const display = wikilinkDisplay(e.targetPath);
            parts.push(`- [[${display}]] -- ${escapeInline(e.reason)}`);
        }
    }

    if (parts.length === 0) return '';
    return '\n\n' + parts.join('\n');
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Build a safe Obsidian wikilink display string from a note-path.
 * Strips `.md`, brackets, pipes and newlines so a path containing
 * `]]` or other Markdown-breaking chars cannot escape the wikilink
 * and inject sibling Markdown. Audit ref: AUDIT-EPIC-33 M-03.
 */
function wikilinkDisplay(notePath: string): string {
    return notePath
        .replace(/\.md$/, '')
        // Strip wikilink-breaking and HTML-breaking chars. Obsidian's
        // own note-path validator already forbids `<>:"\\|?*`, but the
        // index can hold stale entries from external tooling -- defang
        // them so the rendered Markdown stays safe.
        .replace(/[[\]|<>"']/g, '')
        .replace(/[\r\n]+/g, ' ')
        .trim();
}

/**
 * Strip newlines + collapse whitespace from inline text that is
 * embedded into a single Markdown bullet (so a multi-line snippet
 * cannot break the list structure).
 */
function escapeInline(text: string): string {
    return text.replace(/[\r\n]+/g, ' ').trim();
}

/** Markdown link label `[X]`: strip closing brackets and newlines. */
function escapeMarkdownLinkLabel(text: string): string {
    return text.replace(/[[\]]/g, '').replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Markdown link target `(URL)`: strip whitespace, parentheses, and
 * the `javascript:` scheme to defang both Markdown-injection and
 * clickable XSS via `javascript:` URLs in the rendered appendix.
 */
function escapeMarkdownLinkTarget(url: string): string {
    const stripped = url.replace(/[()\s]/g, '').trim();
    if (/^javascript:/i.test(stripped)) return '#';
    return stripped;
}
