/**
 * Parser for the legacy memory/soul.md OpenClaw-style format.
 *
 * Recognised headings (any heading level): "Identity", "Values",
 * "Anti-Patterns" / "Anti Patterns", "Communication" / "Style".
 * Bullet items underneath become entries; other sections (Name, Role)
 * are folded into identity.
 *
 * Used by the legacy soul.md import in the Backup tab.
 */

export interface SoulSections {
    identity: string[];
    values: string[];
    antiPatterns: string[];
    communication: string[];
}

export function parseSoulSections(content: string): SoulSections {
    const out: SoulSections = { identity: [], values: [], antiPatterns: [], communication: [] };
    const lines = content.split('\n');
    let bucket: keyof SoulSections | null = null;
    for (const raw of lines) {
        const line = raw.trim();
        const heading = /^#{1,3}\s+(.+)$/.exec(line);
        if (heading) {
            const name = heading[1].toLowerCase();
            if (name.includes('value')) bucket = 'values';
            else if (name.includes('anti')) bucket = 'antiPatterns';
            else if (name.includes('communication') || name.includes('style')) bucket = 'communication';
            else if (name.includes('identity') || name.includes('name') || name.includes('role')) bucket = 'identity';
            else bucket = null;
            continue;
        }
        const bullet = /^[-*+]\s+(.+)$/.exec(line);
        if (bucket && bullet) out[bucket].push(bullet[1].trim());
    }
    return out;
}
