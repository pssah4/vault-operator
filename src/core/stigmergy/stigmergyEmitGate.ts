/**
 * stigmergyEmitGate (FEAT-32-01 PR 1.2, ADR-131)
 *
 * Single source of truth for the precedence rule "Substrate sees only model
 * decisions, not plugin mechanics". The Pipeline and the dispatcher tools
 * (use_mcp_tool, invoke_skill, read_skill) call these helpers around every
 * single-tool dispatch instead of inlining the gating logic so the rule
 * cannot drift between call sites.
 *
 * Source semantics:
 *   - 'model'    -> regular AgentTask loop tool call; substrate gets the event.
 *   - 'fastpath' -> ADR-061 Recipe-driven batch executor; substrate is BLIND
 *                   by design (the agent did not pick this tool; Recipe
 *                   mechanic did). Episode-Recording (ADR-133) still
 *                   captures the tool via `recordForEpisodeOnly`.
 *   - 'planner'  -> internal classifier/router call; substrate is BLIND
 *                   for the same reason.
 *   - undefined  -> treated as 'model' for backward compatibility with call
 *                   sites that have not been migrated yet.
 *
 * Every helper degrades to a no-op when the turn is missing or
 * `enabled === false` (NOOP_TURN); a transport failure inside the underlying
 * emit is logged and swallowed in the StigmergyAdapter so the host loop is
 * never blocked.
 */

import type { StigmergyTurn } from './StigmergyAdapter';

/** Source of a single-tool dispatch routed through the Pipeline. */
export type DispatchSource = 'model' | 'fastpath' | 'planner';

/**
 * True when the given turn should receive a capability lifecycle event for
 * a dispatch from the given source. Centralizes the gate so the Pipeline,
 * the dispatcher tools, and any future call site cannot disagree.
 */
export function shouldEmitToStigmergy(
    turn: StigmergyTurn | undefined,
    source: DispatchSource | undefined,
): boolean {
    if (!turn) return false;
    if (turn.enabled !== true) return false;
    const effectiveSource: DispatchSource = source ?? 'model';
    return effectiveSource === 'model';
}

/**
 * AUDIT-036 L-3: code-review audit log. Any dispatch that claims a
 * non-'model' source produces a `[Substrate-Skip]` line at debug level so
 * grep over a session transcript surfaces unexpected callers. Intended
 * callers (FastPathExecutor + future planner) appear in the log too, which
 * is fine -- the value is making the rare, accidental case visible. Cheap.
 */
function logSubstrateSkip(capabilityId: string, source: DispatchSource): void {
    console.debug(`[Substrate-Skip] capability=${capabilityId} source=${source}`);
}

/**
 * Emit `capability_invoked` for the given capabilityId IF and only IF the
 * gate is open. Safe to call with `turn === undefined`. Awaited so the
 * Pipeline can preserve ordering against the actual tool dispatch.
 */
export async function emitStigmergyInvoked(
    turn: StigmergyTurn | undefined,
    capabilityId: string,
    source: DispatchSource | undefined,
): Promise<void> {
    if (!shouldEmitToStigmergy(turn, source)) {
        // AUDIT-036 L-3: only log the substrate-skip when the turn is real
        // and enabled but the source diverted us (i.e. a 'fastpath' /
        // 'planner' dispatch). Skipping a NOOP_TURN is the common case and
        // would flood the log.
        if (turn?.enabled === true && (source ?? 'model') !== 'model') {
            logSubstrateSkip(capabilityId, source ?? 'model');
        }
        return;
    }
    await turn!.emitInvoked(capabilityId);
}

/**
 * Emit `capability_returned` with the given success flag for the given
 * capabilityId IF and only IF the gate is open. `success=false` covers BOTH
 * a thrown error AND a `pushToolResult('<error>...')` from the tool's own
 * callbacks -- both are negative evidence for the substrate. Safe to call
 * with `turn === undefined`.
 */
export async function emitStigmergyReturned(
    turn: StigmergyTurn | undefined,
    capabilityId: string,
    success: boolean,
    source: DispatchSource | undefined,
): Promise<void> {
    if (!shouldEmitToStigmergy(turn, source)) return;
    await turn!.emitReturned(capabilityId, success);
}
