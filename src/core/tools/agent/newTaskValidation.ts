/**
 * NewTaskTool input validation -- FEATURE-1804 / ADR-090 Levers 4 + 7
 * plus FEAT-24-04 / ADR-113 (optional profile-Pfad).
 *
 * Pure helpers extracted from NewTaskTool.execute() so the rules are
 * unit-testable and the tool body stays a thin shell. Each helper returns
 * either a normalised value or an error message; the tool simply forwards
 * the message to the agent via pushToolResult.
 */

import { getSubagentProfile, listSubagentProfileNames } from '../../agent/subagent-profiles';

// 2026-05-18: 'ask' removed; the single built-in Agent ("agent") + any
// custom agent slug are valid sub-modes. The set still rejects unknown
// slugs (typos / hallucinations).
export const ALLOWED_SUB_MODES = new Set(['agent']);
export const ALLOWED_JUSTIFICATION_CATEGORIES = new Set(['PARALLEL', 'SPECIALIST', 'ESCALATION']);

/** Generic-phrase detector -- rejects empty platitudes in justifications. */
const GENERIC_PHRASE_RE =
    /\b(more|better|fresh|deeper|broader|further)\s+(context|perspective|understanding|insight|analysis|exploration)\b/i;

const MIN_JUSTIFICATION_LENGTH = 20;

export interface NewTaskInput {
    mode: string;
    message: string;
    /** Empty string when no profile was requested (Tier-4 path). */
    profile: string;
    /** Empty string when a profile was used (justification not required). */
    justificationCategory: string;
    /** Empty string when a profile was used. */
    justificationReason: string;
}

export type ValidationResult =
    | { ok: true; value: NewTaskInput }
    | { ok: false; error: string };

/**
 * Normalise + validate the raw tool input.
 *
 * Two paths:
 *
 * - **Profile path** (FEAT-24-04 / ADR-113): if `profile` is set to a known
 *   profile name, justification is NOT required (the profile choice IS the
 *   explicit decision). Profile-spawns get a lean system prompt and a
 *   reduced tool allowlist via the AgentTask.spawnSubtask path.
 *
 * - **Tier-4 path** (ADR-090): if `profile` is empty, the heutige
 *   PARALLEL / SPECIALIST / ESCALATION justification is required (unchanged
 *   from before). Generic phrases are still rejected.
 */
export function validateNewTaskInput(raw: Record<string, unknown>): ValidationResult {
    const mode = (typeof raw.mode === 'string' ? raw.mode : '').trim();
    const message = (typeof raw.message === 'string' ? raw.message : '').trim();
    const profile = (typeof raw.profile === 'string' ? raw.profile : '').trim();
    const justificationCategory = (typeof raw.justification_category === 'string' ? raw.justification_category : '').trim().toUpperCase();
    const justificationReason = (typeof raw.justification_reason === 'string' ? raw.justification_reason : '').trim();

    if (!mode) return { ok: false, error: 'mode parameter is required' };
    if (!message) return { ok: false, error: 'message parameter is required' };

    if (!ALLOWED_SUB_MODES.has(mode)) {
        return {
            ok: false,
            error: `Unknown sub-agent mode "${mode}". Use "agent" (the default Agent).`,
        };
    }

    // FEAT-24-04 / ADR-113: profile path skips the Tier-4 justification.
    if (profile) {
        if (!getSubagentProfile(profile)) {
            const known = listSubagentProfileNames();
            return {
                ok: false,
                error:
                    `Unknown subagent profile "${profile}". `
                    + `Available profiles: ${known.length > 0 ? known.join(', ') : '(none registered)'}.`,
            };
        }
        return {
            ok: true,
            value: { mode, message, profile, justificationCategory: '', justificationReason: '' },
        };
    }

    if (!ALLOWED_JUSTIFICATION_CATEGORIES.has(justificationCategory)) {
        return {
            ok: false,
            error:
                `justification_category must be one of PARALLEL, SPECIALIST, ESCALATION ` +
                `(got "${justificationCategory || '<missing>'}"). ` +
                `If none truly applies, do not spawn a sub-agent -- continue with your own tools. ` +
                `For multi-step research, consider profile="research" instead, which skips this justification.`,
        };
    }

    if (justificationReason.length < MIN_JUSTIFICATION_LENGTH) {
        return {
            ok: false,
            error:
                `justification_reason must be a concrete sentence (>=${MIN_JUSTIFICATION_LENGTH} chars). ` +
                `Generic phrases like "better context" are rejected -- name the specific blocker, ` +
                `parallel workload, or specialist need.`,
        };
    }

    if (GENERIC_PHRASE_RE.test(justificationReason)) {
        return {
            ok: false,
            error:
                `justification_reason looks generic. Replace abstract phrases ("better context", ` +
                `"fresh perspective") with the concrete reason: which specific tool failed, which 3+ ` +
                `items run in parallel, or which specialist toolset you need.`,
        };
    }

    return {
        ok: true,
        value: { mode, message, profile: '', justificationCategory, justificationReason },
    };
}
