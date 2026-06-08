/**
 * precedenceResolver (FEAT-32-01 PR 1.3, ADR-131 / ADR-133)
 *
 * Pure helpers the AgentTask uses to enforce the VO-Selector-Vorrang contract:
 *
 *   - `resolveStigmergyPrecedence` decides whether the Stigmergy `guidance.text`
 *     should be suppressed for this turn and which Recipe (if any) won the
 *     precedence (Recipe-wins gate of ADR-132).
 *   - `appendGuidanceText` constructs the final user-message content array
 *     when guidance text is NOT suppressed; the helper preserves the
 *     single-block string form when there is nothing to append, so the
 *     cache-stable Anthropic role-alternation contract holds.
 *   - `buildStigmergyDecisionSnapshot` packages the per-turn decision in the
 *     exact shape ADR-133 persists into the episode record. Snapshots the
 *     pinnedPath as a copy so later mutations do not leak.
 *
 * Living separate from `AgentTask.ts` so the precedence rule is unit-testable
 * without spinning up the whole agent loop. Every helper here is pure.
 */

import type { StigmergyTurn } from './StigmergyAdapter';

/** Subset of a user-message content-block array we need to manipulate. */
type UserContentBlock = { type: string; text?: string };

export interface PrecedenceInputs {
    /**
     * True when the FastPath block ran AND the recipe was successfully
     * executed (`result.success === true && result.toolCallsExecuted > 0`).
     * Caller is responsible for the full eligibility chain (depth=0,
     * recipesSection present, score>=0.5, source='learned',
     * successCount>=3, !targetsChatHistory).
     */
    fastPathFired: boolean;
    /**
     * The matched Recipe id when FastPath fired. Null when FastPath did not
     * fire or no recipe matched. Carried verbatim into `recipeWinner` so the
     * episode snapshot (ADR-133) can hand it to RecipePromotionService Gate 1.
     */
    bestMatchRecipeId: string | null;
    /**
     * The `guidance.text` value computed from `StigmergyTurn.pathGuidance()`.
     * Empty string when the turn has no actionable hint (ranked, NOOP).
     */
    guidanceText: string;
}

export interface PrecedenceResult {
    /**
     * When true, the AgentTask MUST push the user message WITHOUT appending
     * `guidance.text`. `guidance.path` (pre-activation deferred tools) is
     * independent and is NOT affected by this flag (ADR-131).
     */
    suppressGuidanceText: boolean;
    /**
     * The Recipe id that won the precedence, or null when no Recipe matched.
     * Threaded through into the episode snapshot so RecipePromotionService
     * can `incrementSuccess(recipeWinner)` instead of double-promoting.
     */
    recipeWinner: string | null;
}

/**
 * Resolve the precedence decision for this turn. See `ADR-131` for the rule:
 *
 *   suppressGuidanceText := fastPathFired AND guidanceText is non-empty
 *   recipeWinner         := fastPathFired ? bestMatchRecipeId : null
 *
 * `guidanceText === ''` short-circuits the suppression because there is
 * nothing to suppress -- without this guard the snapshot would report a
 * suppression that never happened, polluting telemetry.
 */
export function resolveStigmergyPrecedence(input: PrecedenceInputs): PrecedenceResult {
    const suppressGuidanceText = input.fastPathFired && input.guidanceText.length > 0;
    const recipeWinner = input.fastPathFired ? input.bestMatchRecipeId : null;
    return { suppressGuidanceText, recipeWinner };
}

/**
 * Append guidance text to a user message, preserving the input form when
 * there is nothing to append (no needless string-to-array widening). When
 * the input is a plain string and we DO need to append, we widen to the
 * two-block array form so the Anthropic content-block schema is honored.
 *
 * Immutability contract (pinned by cacheStabilityInvariants.test.ts; AUDIT-036
 * L-5 documents it explicitly): the helper MUST NOT mutate the input array
 * and callers MUST NOT mutate the returned array in place. The spread
 * produces a shallow copy at the outer level; inner content blocks are
 * shared by reference. This is acceptable today because every call site
 * treats the message as immutable. A deep clone here would burn allocations
 * on every turn and is premature given the test coverage. If a future call
 * site introduces in-place mutation, switch to `structuredClone`.
 *
 * The `Readonly` annotations on the input array reflect this contract at
 * compile time so a future caller cannot pass a freshly mutated array and
 * expect the helper to defend against it.
 */
export function appendGuidanceText(
    userMessage: string | ReadonlyArray<UserContentBlock>,
    guidanceText: string,
): string | UserContentBlock[] {
    if (!guidanceText) return userMessage as string | UserContentBlock[];
    if (typeof userMessage === 'string') {
        return [
            { type: 'text', text: userMessage },
            { type: 'text', text: guidanceText },
        ];
    }
    return [...userMessage, { type: 'text', text: guidanceText }];
}

export interface SnapshotInputs {
    turn: StigmergyTurn;
    pinnedPath: readonly string[];
    suppressGuidanceText: boolean;
    recipeWinner: string | null;
}

/**
 * Snapshot of the Stigmergy decision for one turn, in the exact shape the
 * episode record persists (ADR-133). Capability ids only -- never user
 * text -- so persistence is privacy-safe.
 */
export interface StigmergyDecisionSnapshot {
    enabled: boolean;
    mode: StigmergyTurn['decisionMode'];
    pinnedPath: string[];
    guidanceTextSuppressed: boolean;
    recipeWinner: string | null;
}

/**
 * Build the per-turn Stigmergy decision snapshot. Copies `pinnedPath` so the
 * snapshot is immutable against later mutations of the source array.
 */
export function buildStigmergyDecisionSnapshot(
    input: SnapshotInputs,
): StigmergyDecisionSnapshot {
    return {
        enabled: input.turn.enabled,
        mode: input.turn.decisionMode,
        pinnedPath: Array.from(input.pinnedPath),
        guidanceTextSuppressed: input.suppressGuidanceText,
        recipeWinner: input.recipeWinner,
    };
}
