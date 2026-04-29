/**
 * MentionParser -- pure regex pass that pulls URI mentions out of a
 * message body without an LLM round-trip.
 *
 * Used by the Single-Call extraction path (Phase 4 / FEATURE-0318) so
 * provisional edges land synchronously the moment the user sends a
 * message; the end-of-conversation LLM call later upgrades or discards
 * them. Synchronous detection means hybrid retrieval finds mentioned
 * sources within the same turn.
 *
 * Recognised patterns:
 *   - Wikilinks `[[Notes/X]]` / `[[Notes/X.md|alias]]`  ->  `vault://Notes/X.md`
 *   - Markdown links `[label](rel/path.pdf)`            ->  `vault://rel/path.pdf`
 *                    `[label](/abs/path.txt)`           ->  `file:///abs/path.txt`
 *                    `[label](https://...)`              ->  passthrough
 *   - Bare URLs `https?://...`                          ->  passthrough
 *
 * Not recognised by design (too noisy without context):
 *   - Plain file paths in prose. The Single-Call LLM still picks them
 *     up via the `mentions` field; the parser only catches deterministic
 *     patterns where false positives are unlikely.
 *
 * No obsidian, no plugin globals -- engine-public, ADR-080.
 *
 * FEATURE-0318 / PLAN-007 task A.1.
 */

export interface Mention {
    /** Canonical URI: vault:// / file:// / https:// / http://. */
    uri: string;
    /** Lowercased URI scheme. */
    scheme: 'vault' | 'file' | 'https' | 'http';
    /** Optional human-readable label (markdown alt-text or wikilink alias). */
    label?: string;
    /** Where in the source string the mention started (byte offset). */
    start: number;
    /** Pattern that triggered the match -- useful for diagnostics. */
    source: 'wikilink' | 'markdown-link' | 'bare-url';
}

// TODO(R3): migrate to src/core/utils/wikilinks.ts (parseWikilinks).
// Kept regex-based for now to avoid touching the memory-extraction pipeline.
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;
// Plain URL detection -- intentionally conservative: must have a scheme,
// must not be inside () to avoid double-eating markdown links (handled
// via `excludeRanges`).
const BARE_URL_RE = /\bhttps?:\/\/[^\s\])>]+/g;

interface Range { start: number; end: number; }

export function parseMentions(text: string): Mention[] {
    if (!text || text.length === 0) return [];
    const mentions: Mention[] = [];
    const consumed: Range[] = [];

    // 1. Wikilinks first -- they sit inside the bare-url RE's blacklist
    //    indirectly (no `://`), but we still record their range so we
    //    don't double-process via markdown-link (which doesn't match
    //    `[[...]]` anyway).
    for (const match of text.matchAll(WIKILINK_RE)) {
        const target = match[1].trim();
        const alias = match[2]?.trim();
        if (!target) continue;
        const path = target.endsWith('.md') ? target : `${target}.md`;
        mentions.push({
            uri: `vault://${path}`,
            scheme: 'vault',
            label: alias || target,
            start: match.index ?? 0,
            source: 'wikilink',
        });
        consumed.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
    }

    // 2. Markdown links. Skip when the match overlaps a wikilink range.
    for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
        const start = match.index ?? 0;
        if (overlaps(consumed, start, start + match[0].length)) continue;
        const label = match[1].trim();
        const href = match[2].trim();
        if (!href) continue;
        const m = classify(href, label, start);
        if (m) {
            mentions.push(m);
            consumed.push({ start, end: start + match[0].length });
        }
    }

    // 3. Bare URLs. Skip when overlap with a markdown-link match.
    for (const match of text.matchAll(BARE_URL_RE)) {
        const start = match.index ?? 0;
        if (overlaps(consumed, start, start + match[0].length)) continue;
        const url = match[0];
        const scheme = url.startsWith('https://') ? 'https' : 'http';
        // strip trailing punctuation that often glues to URLs in prose
        const cleaned = url.replace(/[.,;:)\]>]+$/, '');
        mentions.push({
            uri: cleaned,
            scheme,
            start,
            source: 'bare-url',
        });
    }

    mentions.sort((a, b) => a.start - b.start);
    return dedup(mentions);
}

function classify(href: string, label: string, start: number): Mention | null {
    if (href.startsWith('https://') || href.startsWith('http://')) {
        const scheme = href.startsWith('https://') ? 'https' : 'http';
        return { uri: href, scheme, label: label || undefined, start, source: 'markdown-link' };
    }
    if (href.startsWith('file://')) {
        return { uri: href, scheme: 'file', label: label || undefined, start, source: 'markdown-link' };
    }
    if (href.startsWith('/')) {
        return { uri: `file://${href}`, scheme: 'file', label: label || undefined, start, source: 'markdown-link' };
    }
    if (href.startsWith('mailto:') || href.startsWith('#') || href.startsWith('?')) {
        return null;
    }
    // Vault-relative path -- e.g. `Notes/foo.md`, `attachments/x.pdf`
    return { uri: `vault://${href}`, scheme: 'vault', label: label || undefined, start, source: 'markdown-link' };
}

function overlaps(ranges: readonly Range[], start: number, end: number): boolean {
    for (const r of ranges) {
        if (start < r.end && end > r.start) return true;
    }
    return false;
}

function dedup(list: readonly Mention[]): Mention[] {
    const seen = new Set<string>();
    const out: Mention[] = [];
    for (const m of list) {
        const key = m.uri;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
    }
    return out;
}
