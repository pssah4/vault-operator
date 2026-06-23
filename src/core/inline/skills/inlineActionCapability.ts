/**
 * Skill-Capability fuer Inline-Actions (FEAT-33-08, ADR-141, EPIC-33).
 *
 * Skills mit dieser Capability tauchen im Floating-Menu auf. Output-
 * Modus pro Skill deklariert, sodass das Menu den richtigen
 * Rendering-Pfad waehlen kann (Preview-Block, Inline-Diff, Side-Panel,
 * Tooltip).
 *
 * Das Feld ist standalone definiert (nicht in src/core/skills/types.ts
 * hineingewebt) damit das Inline-Modul ohne tiefe Eingriffe ins
 * bestehende Skill-System integrieren kann. Der live SkillLoader im
 * Plugin liest das Feld aus dem Skill-Manifest-Frontmatter und
 * uebergibt es via SkillCapabilityProbe an den InlineSkillFilter.
 */

export type InlineActionOutputMode = 'preview-block' | 'inline-diff' | 'side-panel' | 'tooltip';
export type InlineActionInputFormat = 'markdown' | 'plain';

export interface InlineActionCapability {
    /** Master-Schalter -- false oder fehlend = Skill taucht nicht im Floating-Menu auf. */
    eligible: boolean;
    /** Wie der Skill seinen Output rendern moechte. */
    output_mode: InlineActionOutputMode;
    /** Wie die Selection als Input uebergeben wird. */
    input_format: InlineActionInputFormat;
    /** Optional cap so Skills nicht versehentlich auf der ganzen Note laufen. */
    max_selection_chars?: number;
}

const VALID_OUTPUT_MODES: ReadonlySet<InlineActionOutputMode> = new Set(['preview-block', 'inline-diff', 'side-panel', 'tooltip']);
const VALID_INPUT_FORMATS: ReadonlySet<InlineActionInputFormat> = new Set(['markdown', 'plain']);

export function isInlineActionCapability(value: unknown): value is InlineActionCapability {
    if (value === null || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    if (typeof v.eligible !== 'boolean') return false;
    if (typeof v.output_mode !== 'string' || !VALID_OUTPUT_MODES.has(v.output_mode as InlineActionOutputMode)) return false;
    if (typeof v.input_format !== 'string' || !VALID_INPUT_FORMATS.has(v.input_format as InlineActionInputFormat)) return false;
    if (v.max_selection_chars !== undefined && typeof v.max_selection_chars !== 'number') return false;
    return true;
}
