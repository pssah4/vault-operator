/**
 * FreshnessFrontmatterPatcher -- thin allowlisted facade over
 * `FrontmatterWriter` for the verifier path (IMP-20-06-01 W4-T1).
 *
 * ADR-95 amendment: when the freshness verifier writes anything into
 * a note's YAML frontmatter, the patch MUST contain exactly one key,
 * `freshness`. Any other key is dropped before the underlying
 * FrontmatterWriter runs, so a future refactor that accidentally
 * widens the patch shape still cannot leak into user notes.
 *
 * The single-key constraint is what makes the user-visible promise
 * from BA-25 cheap to enforce: a single labeled hint, never a
 * verifier-controlled YAML block.
 *
 * Wayfinder entry: see `src/ARCHITECTURE.map`, row
 * `freshness-frontmatter-allowlist`.
 */

import type { TFile } from 'obsidian';
import type {
    FrontmatterPatch,
    FrontmatterPatchField,
    FrontmatterWriter,
    WriteResult,
} from '../ingest/FrontmatterWriter';

export const FRESHNESS_ALLOWLIST: readonly string[] = ['freshness'];

export interface FreshnessHintInput {
    label: string;
    replace?: boolean;
}

export class FreshnessFrontmatterPatcher {
    constructor(private readonly writer: FrontmatterWriter) {}

    async writeHint(file: TFile, hint: FreshnessHintInput): Promise<WriteResult> {
        return this.writer.write(file, this.buildPatch(hint));
    }

    buildPatch(hint: FreshnessHintInput): FrontmatterPatch {
        const field: FrontmatterPatchField = {
            value: hint.label,
            replace: hint.replace ?? true,
        };
        const raw: Record<string, FrontmatterPatchField> = {
            freshness: field,
        };
        return filterToAllowlist(raw);
    }
}

export function filterToAllowlist(
    raw: Record<string, FrontmatterPatchField>,
): FrontmatterPatch {
    const out: FrontmatterPatch = {};
    for (const key of FRESHNESS_ALLOWLIST) {
        if (key in raw) out[key] = raw[key];
    }
    return out;
}
