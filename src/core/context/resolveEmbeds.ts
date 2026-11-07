import { escapeXmlAttribute, stripToFixpoint } from '../tools/BaseTool';

/**
 * IMP-03-03-01 (Issue #94): expand the `![[embeds]]` of an attached or active
 * note into read-only copies, so the model sees the embedded text instead of a
 * link it would have to chase with read_file. Opt-in via the setting
 * `resolveEmbedsInAttachments`; with the setting off this module is not called.
 *
 * Pure function. Everything that needs Obsidian is injected (see
 * obsidianEmbedDeps.ts), the same way activeFileContext.ts takes `read`.
 */

/** Limits per call, so a note with 200 embeds cannot blow up the context. */
export const EMBED_LIMITS = { depth: 2, count: 20, charsEach: 4_000, charsTotal: 24_000 } as const;

export interface EmbedTarget {
    /** Vault-relative path of the note the text comes from. */
    path: string;
    /** The whole note without frontmatter, or the chosen heading/block section. */
    text: string;
}

export interface ResolveEmbedsDeps {
    /** null: target is missing, is not a Markdown note, or the heading/block was not found. */
    load: (linkpath: string, subpath: string, fromPath: string) => Promise<EmbedTarget | null>;
    /** Same ignore list the rest of the plugin honours. */
    isDenied: (path: string) => boolean;
}

/** `![[target]]`, `![[target|alias]]`, `![[image|300]]`. The part after the pipe is cut in expand(). */
const EMBED_RE = /!\[\[([^\]\n]+)\]\]/g;
/** Fenced and inline code: an embed shown inside code is an example, not an embed. */
const CODE_RE = /```[\s\S]*?```|`[^`\n]*`/g;
/** A target must not be able to forge or close our wrapper. */
const NOTE_TAG_RE = /<\s*\/?\s*embedded_note\b[^<>\n]*>/gi;
const HINT = '[Embeds below are expanded as read-only copies inside <embedded_note>. Edit the source notes, never the copies.]\n\n';

interface Budget { count: number; chars: number }

/**
 * Returns `text` with every resolvable embed followed by a wrapped copy of its
 * target. The original `![[...]]` line stays, so editing keeps working on the
 * real Markdown. Anything that cannot or must not be expanded stays literal.
 * When nothing was expanded the input is returned unchanged.
 */
export async function resolveEmbeds(text: string, sourcePath: string, deps: ResolveEmbedsDeps): Promise<string> {
    const budget: Budget = { count: 0, chars: 0 };
    const out = await expand(text, sourcePath, [sourcePath], deps, budget);
    return budget.count > 0 ? HINT + out : text;
}

async function expand(text: string, fromPath: string, stack: string[], deps: ResolveEmbedsDeps, budget: Budget): Promise<string> {
    // Same length as the original, so offsets found in `masked` are valid in `text`.
    const masked = text.replace(CODE_RE, (m) => ' '.repeat(m.length));
    let out = '';
    let last = 0;
    for (const m of masked.matchAll(EMBED_RE)) {
        const block = await expandOne(m[1].split('|')[0], fromPath, stack, deps, budget); // alias and size hints are dropped
        if (block === null) continue; // stays literal
        const end = (m.index ?? 0) + m[0].length;
        // ponytail: an embed in the middle of a line gets its block right behind the
        // embed and the rest of the line after the closing tag. Models read that fine;
        // move the block to the end of the line if one ever trips over it.
        out += `${text.slice(last, end)}\n${block}`;
        last = end;
    }
    return out + text.slice(last);
}

async function expandOne(target: string, fromPath: string, stack: string[], deps: ResolveEmbedsDeps, budget: Budget): Promise<string | null> {
    if (stack.length > EMBED_LIMITS.depth || budget.count >= EMBED_LIMITS.count || budget.chars >= EMBED_LIMITS.charsTotal) return null;
    const hash = target.indexOf('#');
    const linkpath = (hash < 0 ? target : target.slice(0, hash)).trim(); // empty: embed of the note itself
    const subpath = hash < 0 ? '' : target.slice(hash).trim(); // '#Heading' or '#^blockid'
    const hit = await deps.load(linkpath, subpath, fromPath);
    if (!hit || deps.isDenied(hit.path) || stack.includes(hit.path + subpath)) return null; // missing, ignored, cycle
    const inner = stripToFixpoint(hit.text, NOTE_TAG_RE).trim();
    let body = (await expand(inner, hit.path, [...stack, hit.path + subpath], deps, budget)).trim();
    if (!body) return null;
    if (body.length > EMBED_LIMITS.charsEach) {
        body = `${body.slice(0, EMBED_LIMITS.charsEach)}\n[embed truncated: read_file path="${hit.path}" for the rest]`;
    }
    budget.count++;
    budget.chars += body.length;
    const section = subpath ? ` section="${escapeXmlAttribute(subpath)}"` : '';
    return `<embedded_note source="${escapeXmlAttribute(hit.path)}"${section}>\n${body}\n</embedded_note>`;
}
