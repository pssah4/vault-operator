/**
 * Per-conversation reasoning-effort override for the chat model picker.
 *
 * The chat-header picker lets a user pick a reasoning-effort level for the
 * current conversation. The control is revealed only when the thinking toggle
 * is On and the active model is effort-capable. The default is 'auto', which
 * sends no effort field at all, so untouched conversations are byte-identical
 * to before.
 *
 * This module owns only the pure decision logic so it stays unit-testable and
 * free of any Obsidian import.
 */

import type { EffortLevel } from '../../types/model-registry';

/**
 * Per-conversation reasoning-effort override. 'auto' sends no effort field
 * (vendor default, byte-identical to today); every other value is a native
 * level for the active model family:
 *  - Claude: low, medium, high, xhigh, max
 *  - GPT-5 / o-series: minimal, low, medium, high
 */
export type EffortOverride = 'auto' | EffortLevel;

/** The default override: auto, i.e. no effort field is sent. */
export const DEFAULT_EFFORT_OVERRIDE: EffortOverride = 'auto';

/**
 * Whether the override is an explicit level (i.e. it should be applied to the
 * built model and a native effort field should be sent). 'auto' sends nothing.
 */
export function isExplicitEffortOverride(override: EffortOverride): boolean {
    return override !== 'auto';
}

/**
 * Resolve the effective reasoning-effort level for a conversation.
 *
 * 'auto' returns undefined, meaning "no override" so the provider layer sends
 * no effort field. Every other value returns the level verbatim.
 */
export function resolveEffectiveEffort(override: EffortOverride): EffortLevel | undefined {
    return override === 'auto' ? undefined : override;
}

/** What the picker should render for the reasoning-effort control. */
export type EffortControlVisibility = 'control' | 'none';

/**
 * Decide what the chat picker renders for reasoning effort.
 *  - 'control': the thinking toggle is On AND the active model/provider can
 *               send a native effort field
 *  - 'none'   : thinking is Off (effort would be inert), or the model cannot
 *               send effort (e.g. a local or Gemini model); render nothing
 *
 * Hiding the control when thinking is Off replaces the old within-pin coherence
 * collapse: a contradictory Thinking=Off + Effort=High pair can no longer be
 * expressed, so no runtime coherence rule is needed.
 */
export function effortControlVisibility(
    thinkingOn: boolean,
    effortCapable: boolean,
): EffortControlVisibility {
    return thinkingOn && effortCapable ? 'control' : 'none';
}
