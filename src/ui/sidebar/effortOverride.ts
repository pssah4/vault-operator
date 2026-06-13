/**
 * Per-conversation reasoning-effort override for the chat model picker.
 *
 * The chat-header picker lets a user pick a reasoning-effort level for the
 * current conversation. Effort is a pin-only control: it is revealed only when
 * a specific model is pinned (so the tier router is off), the thinking toggle
 * is On, and that model is effort-capable. In Auto mode no effort is offered;
 * the model keeps its own vendor default. The default is 'auto', which sends no
 * effort field at all, so untouched conversations are byte-identical to before.
 *
 * This module owns only the pure decision logic so it stays unit-testable and
 * free of any Obsidian import.
 */

import type { EffortLevel } from '../../types/model-registry';
import type { ThinkingOverride } from './thinkingOverride';

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

/**
 * Whether the binary thinking switch reads as On. The picker keeps the
 * tri-state ThinkingOverride internally for default preservation: only an
 * explicit 'off' reads as Off, both 'follow' (the byte-identical default) and
 * 'on' read as On. The switch sets an explicit 'on' or 'off' on click.
 */
export function thinkingSwitchIsOn(override: ThinkingOverride): boolean {
    return override !== 'off';
}

/** The ordered effort slider stops: 'auto' (leftmost, sends nothing) then the
 * model-native levels. With no native levels the slider has only 'auto', which
 * is why the caller hides the whole row in that case. */
export function effortStops(levels: EffortLevel[]): EffortOverride[] {
    return ['auto', ...levels];
}

/**
 * Map an effort override to its slider index within the given stops. An
 * override the stops do not contain (e.g. a stale level after the model
 * changed) clamps to 0 ('auto'), so the knob never lands off the track.
 */
export function effortIndexForOverride(stops: EffortOverride[], override: EffortOverride): number {
    const idx = stops.indexOf(override);
    return idx < 0 ? 0 : idx;
}

/**
 * Map a slider index back to its effort override, clamped into range so an
 * out-of-bounds index resolves to 'auto' rather than undefined.
 */
export function effortStopForIndex(stops: EffortOverride[], index: number): EffortOverride {
    if (!Number.isFinite(index)) return 'auto';
    const clamped = Math.min(Math.max(Math.trunc(index), 0), stops.length - 1);
    return stops[clamped] ?? 'auto';
}

/**
 * The knob travel fraction (0..1) for a slider index across `stopCount` stops.
 * 0 is the leftmost stop (knob flush left), 1 the rightmost (knob flush right).
 * With one or zero stops the knob pins to 0 so a degenerate slider never
 * divides by zero. The fraction drives a CSS calc so the knob and the filled
 * track land exactly on each dot, including both extremes (the native range
 * input could never reach flush-right because its thumb is inset by half its
 * width at each end).
 */
export function effortFractionForIndex(index: number, stopCount: number): number {
    if (stopCount <= 1) return 0;
    const clamped = Math.min(Math.max(Math.trunc(index), 0), stopCount - 1);
    return clamped / (stopCount - 1);
}

/**
 * The nearest slider index for a knob travel fraction (0..1) across `stopCount`
 * stops. Rounds to the closest discrete stop and clamps into range, so a drag
 * or click past either end snaps to the first or last stop. A non-finite
 * fraction resolves to 0.
 */
export function effortIndexForFraction(fraction: number, stopCount: number): number {
    if (stopCount <= 1) return 0;
    if (!Number.isFinite(fraction)) return 0;
    const raw = Math.round(fraction * (stopCount - 1));
    return Math.min(Math.max(raw, 0), stopCount - 1);
}

// Effort is a pin-only control: it threads onto the model only when one is
// pinned via the chat header (the tier router is off in that case). In Auto
// mode no effort is offered or sent, so the model keeps its own vendor default.
// There is therefore no "effective model for effort" fall-back to resolve.
