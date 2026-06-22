/**
 * InlineSkillFilter -- listet inline-eligible Skills aus dem Skill-Registry (FEAT-33-08, EPIC-33).
 *
 * Probe-Pattern haelt das Modul entkoppelt vom konkreten Skill-System.
 * Der live SkillLoader im Plugin implementiert SkillCapabilityProbe
 * indem er ueber alle registrierten User- und Plugin-Skills iteriert
 * und deren `inlineActionCapability` aus dem Manifest-Frontmatter
 * liest.
 *
 * Related: ADR-141, FEAT-33-08.
 */

import type { InlineActionCapability } from './inlineActionCapability';
import type { InlineTriggerContext } from '../InlineTriggerContext';

export interface SkillEntry {
    /** Stable skill identifier. */
    id: string;
    /** Display label in the Floating-Menu. */
    label: string;
    /** Optional one-line description (tooltip). */
    description?: string;
    /**
     * Capability from the Skill-Manifest. Skills without this field
     * are silently excluded from the Floating-Menu.
     */
    capability?: InlineActionCapability;
}

export interface SkillCapabilityProbe {
    /**
     * Return all candidate skills. The probe should NOT pre-filter --
     * the filter does that consistently so changes to filter logic
     * land in one place.
     */
    listSkills(): SkillEntry[];
}

export interface InlineSkillFilterOptions {
    probe: SkillCapabilityProbe;
    /** TOP-N cap for the Floating-Menu (default 10). 0 = hide all skills. */
    topN?: number;
}

export class InlineSkillFilter {
    private readonly probe: SkillCapabilityProbe;
    private readonly topN: number;

    constructor(options: InlineSkillFilterOptions) {
        this.probe = options.probe;
        this.topN = options.topN ?? 10;
    }

    /**
     * Return the skills eligible for the current trigger context.
     * Filters by: capability.eligible === true, max_selection_chars
     * constraint, and TOP-N cap.
     */
    filter(ctx: InlineTriggerContext): SkillEntry[] {
        if (this.topN <= 0) return [];
        const selectionLen = ctx.selectionText.length;
        const result: SkillEntry[] = [];
        for (const skill of this.probe.listSkills()) {
            const cap = skill.capability;
            if (cap === undefined || cap.eligible !== true) continue;
            if (cap.max_selection_chars !== undefined && selectionLen > cap.max_selection_chars) continue;
            result.push(skill);
            if (result.length >= this.topN) break;
        }
        return result;
    }
}
