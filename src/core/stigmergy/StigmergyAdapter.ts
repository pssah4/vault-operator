/**
 * Stigmergy Adapter -- thin client around a separate Stigmergy daemon.
 *
 * Stigmergy observes which capabilities the agent considers and which it
 * ends up using, so the Studio can later suggest a tighter candidate set.
 * This codebase holds NO engine, model, or storage -- only the client. The
 * embedding model and the pheromone database live in the daemon process
 * (started outside the plugin).
 *
 * The integration uses two packages from the Stigmergy distribution:
 *   - `@agentic-stigmergy/client` provides `createRemoteEngine` + a socket
 *     RPC transport (`socketRpcSend`) that talks to the daemon.
 *   - `@agentic-stigmergy/loop` wraps the engine in a per-turn facade
 *     (`beginTurn` / `instrument` / `end` / `accept`) and exports
 *     `safeEmit`, the degrade-dichte Emit-Variante (loop >= 0.1.2) used by
 *     every hand-rolled hook so a daemon outage cannot break the host loop.
 *
 * Both packages are loaded lazily: when they are not installed, when the
 * daemon socket is unreachable, or when Stigmergy is toggled off in the
 * Studio, every call here degrades to a no-op so the agent loop runs
 * exactly as before. This covers the four explorable capability surfaces
 * the daemon now ranks together: tools, skills, MCP tools, and subagent
 * profiles. Ids are namespaced (skill:* / mcp:server:* / subagent:*) so
 * the substrate keeps them distinct and the registration id matches the
 * id used at instrumentation time -- otherwise phantom capabilities would
 * appear in the graph with no incoming edges.
 */

import { homedir } from 'os';
import { join } from 'path';
import type { ToolDefinition } from '../tools/types';

// ---------------------------------------------------------------------------
// Internal SDK shapes (mirrors `@agentic-stigmergy/*` -- kept local so the
// adapter compiles without the packages and without leaking the SDK types
// into the rest of the codebase).

type RawLifecycleEvent =
    | { type: 'capability_invoked'; taskId: string; capabilityId: string }
    | { type: 'capability_returned'; taskId: string; capabilityId: string; success: boolean };

interface RawStigmergyEngine {
    registerCapability: (cap: { id: string; type: string; description: string }) => Promise<void> | void;
    emit: (event: RawLifecycleEvent) => Promise<void> | void;
}

/**
 * Mirror of the loop SDK's `Decision` discriminated union. We only inspect
 * the fields needed for surfacing (mode + the ordered id list) so the loop
 * SDK can evolve the rest without us tracking it.
 */
type RawDecision =
    | { mode: 'ranked'; ranked: Array<{ capabilityId: string }> }
    | { mode: 'enforce'; ranked: Array<{ capabilityId: string }>; forceFromSet: true }
    | { mode: 'sequence'; nextCapability: string; remainingPath?: string[] };

interface RawStigmergyTurn {
    instrument: <T>(tools: T[]) => T[];
    end: () => Promise<void> | void;
    accept: (tokenCost: number) => Promise<void> | void;
    /**
     * loop >= 0.1.x: continue the same turn after a revision (weaker reward
     * on the eventual accept). Optional in our raw mirror because older SDK
     * stubs may not implement it -- the adapter falls back to a no-op.
     */
    iterate?: (newContext?: string) => Promise<void> | void;
    /**
     * loop >= 0.1.x: resolve the turn as abandoned (negative evidence, no
     * reinforcement). Optional in the raw mirror for the same reason as
     * `iterate`.
     */
    abandon?: () => Promise<void> | void;
    readonly surfaced?: string[];
    readonly enabled?: boolean;
    readonly decision?: RawDecision;
}

interface RawStigmergyLoop {
    beginTurn: (params: {
        task_id: string;
        prompt: string;
        candidate_ids: string[];
    }) => Promise<RawStigmergyTurn> | RawStigmergyTurn;
}

/**
 * Degrade-dichter Emit-Helfer aus loop >= 0.1.2. Wrapped in `Promise.resolve`
 * at the call site so the adapter stays compatible with sync stubs too.
 */
type RawSafeEmit = (engine: RawStigmergyEngine, event: RawLifecycleEvent) => Promise<void> | void;

// ---------------------------------------------------------------------------
// Public adapter surface used by the rest of the loop.

export interface StigmergyTurn {
    /**
     * True when the SDK is connected, the daemon answered, and Stigmergy is
     * enabled in the Studio. False in every degraded mode. Callers should
     * fast-path on `!enabled` to skip per-tool emits without an await.
     */
    readonly enabled: boolean;
    /** The taskId the daemon associates with this turn. */
    readonly taskId: string;
    /**
     * The raw decision mode for this turn. Mirrors `raw.decision?.mode`, with
     * `'none'` for the missing-decision case (and for every NOOP turn). This is
     * the stable read-only surface FEAT-32-01 (ADR-131) reads to enforce the
     * precedence rule and FEAT-32-02 (ADR-133) snapshots into the episode
     * record. No new daemon RPC is involved -- the value is derived once from
     * the closure-bound decision and cached for the lifetime of the turn.
     */
    readonly decisionMode: 'sequence' | 'enforce' | 'ranked' | 'none';
    /**
     * Reorder the tool list by Stigmergy's per-turn ranking, KEEPING every
     * tool (nothing hidden -- ranked first by surfaced index, all other tools
     * appended in their original order). When the turn is disabled or there
     * is no ranking signal, returns a shallow copy of the input unchanged.
     *
     * Cache-safe: only the position changes inside the tools array. The
     * tool schemas themselves are untouched, so the prompt cache key
     * (which hashes individual tool definitions) is preserved.
     */
    orderTools: <T>(tools: readonly T[], idOf: (tool: T) => string) => T[];
    /**
     * Short, model-facing hint built from the consult decision. Returns
     * `{ text: '' }` when there is nothing useful to say (turn disabled
     * or plain ranked mode). The caller appends `text` AFTER the cached
     * prefix (system + tools) so the cache stays valid -- in this codebase
     * that means appending it to the latest user message as an extra text
     * block, NOT prepending it to the system prompt.
     */
    /**
     * Short, model-facing hint built from the consult decision, plus the
     * raw capability path it was built from. `path` carries the ordered
     * capability ids for a `sequence` decision (next step first); empty
     * for `ranked` / `enforce` / disabled turns. `text` is the rendered
     * guidance string the caller appends AFTER the cached prefix; empty
     * when there is nothing useful to say. The caller uses `path` to
     * pre-activate deferred tool ids before the prompt cache is built
     * (ADR-26 Recall-feeds-Retrieval) and `text` as the per-turn hint.
     */
    pathGuidance: (descOf?: (id: string) => string | undefined) => { path: string[]; text: string };
    /** Wrap the tool list before it is shown to the model. Returns the same shape. */
    instrument: (tools: ToolDefinition[]) => ToolDefinition[];
    /**
     * Emit `capability_invoked` for the capability the agent is about to
     * run. Non-fatal: a transport failure is logged but never thrown, so a
     * broken daemon connection cannot swallow the underlying call. Used for
     * tools (in the pipeline) AND for the namespaced inner dispatch points
     * (skill:*, mcp:server:*, subagent:*).
     */
    emitInvoked: (capabilityId: string) => Promise<void>;
    /**
     * Emit `capability_returned` after the underlying call resolves.
     * `success=false` covers BOTH a thrown error and a call that pushed an
     * `<error>` block via its callbacks -- both are negative evidence for
     * the substrate. Non-fatal.
     */
    emitReturned: (capabilityId: string, success: boolean) => Promise<void>;
    /** Mark the turn as resolved (success or error). Safe to call multiple times. */
    end: () => Promise<void>;
    /**
     * Clean-success resolution: full reinforcement of the path the agent
     * took this turn. Call ONLY when the turn ended in a clean
     * attempt_completion with no abort and no error. Safe to call multiple
     * times (idempotent guard inside the adapter). Mutually exclusive with
     * `iterate` and `abandon` -- the first one wins.
     */
    accept: (tokenCost: number) => Promise<void>;
    /**
     * Revision / nachbesserung resolution: weaker reward on the eventual
     * accept of the same task. Call when the turn finished without a
     * thrown error and without abort, but ALSO without a clean
     * attempt_completion (e.g. iteration limit reached, hard-limit
     * recovery answer, model stopped early without completion). Idempotent
     * with the other two resolvers -- the first one wins.
     */
    iterate: (newContext?: string) => Promise<void>;
    /**
     * Abandon resolution: negative evidence, NO reinforcement. Call when
     * the turn ended in an error, was aborted by the user, tripped the
     * consecutive-mistake circuit breaker, or otherwise produced no
     * progress (e.g. ended in find_tool / tool-error churn). Idempotent
     * with the other two resolvers -- the first one wins.
     */
    abandon: () => Promise<void>;
    /** Capabilities surfaced by Stigmergy ranking. Empty when SDK is absent or in observe-only mode. */
    surfaced: string[];
}

const NOOP_TURN: StigmergyTurn = {
    enabled: false,
    taskId: '',
    decisionMode: 'none',
    instrument: (t) => t,
    orderTools: (tools) => Array.from(tools),
    pathGuidance: () => ({ path: [], text: '' }),
    emitInvoked: async () => { /* noop */ },
    emitReturned: async () => { /* noop */ },
    end: async () => { /* noop */ },
    accept: async () => { /* noop */ },
    iterate: async () => { /* noop */ },
    abandon: async () => { /* noop */ },
    surfaced: [],
};

// ---------------------------------------------------------------------------
// One-shot startup connection. The engine + loop are created once and
// reused for the lifetime of the plugin. `initStigmergy` is idempotent --
// calling it again returns the same in-flight promise.

let initPromise: Promise<void> | null = null;
let cachedEngine: RawStigmergyEngine | null = null;
let cachedLoop: RawStigmergyLoop | null = null;
let cachedSafeEmit: RawSafeEmit | null = null;
let lastCapabilitiesHash: string | null = null;

/** Default socket path the Stigmergy daemon listens on. Override via env. */
function defaultSocketPath(): string {
    const env = typeof process !== 'undefined' ? process.env?.STIGMERGY_SOCK : undefined;
    return env && env.length > 0
        ? env
        : join(homedir(), '.stigmergy', 'pheromone.db.daemon.sock');
}

/**
 * Connect to the Stigmergy daemon once. Idempotent. Non-fatal: any failure
 * (package missing, socket unreachable, malformed exports) leaves the
 * adapter in no-op mode and is logged at debug level.
 *
 * The actual `@agentic-stigmergy/*` packages are imported lazily so the
 * plugin still builds when they are not installed. Once installed, the
 * dynamic import resolves them and the engine talks to the daemon over
 * the socket RPC transport. The loop SDK >= 0.1.2 also exports `safeEmit`;
 * when present, every hand-rolled hook routes through it so a transport
 * failure mid-turn cannot escape into the host loop.
 */
export function initStigmergy(socketPath: string = defaultSocketPath()): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
        try {
            const client = await import(/* webpackIgnore: true */ '@agentic-stigmergy/client')
                .catch(() => null);
            const loopMod = await import(/* webpackIgnore: true */ '@agentic-stigmergy/loop')
                .catch(() => null);
            if (!client || !loopMod) {
                console.debug('[Stigmergy] @agentic-stigmergy/* not installed -- adapter is a no-op');
                return;
            }
            const clientMod = client as {
                socketRpcSend?: (path: string) => unknown;
                createRemoteEngine?: (send: unknown) => RawStigmergyEngine;
            };
            const loopExports = loopMod as {
                StigmergyLoop?: new (engine: RawStigmergyEngine) => RawStigmergyLoop;
                safeEmit?: RawSafeEmit;
            };
            if (typeof clientMod.socketRpcSend !== 'function'
                || typeof clientMod.createRemoteEngine !== 'function'
                || typeof loopExports.StigmergyLoop !== 'function') {
                console.debug('[Stigmergy] SDK is missing expected exports -- adapter is a no-op');
                return;
            }
            const send = clientMod.socketRpcSend(socketPath);
            const engine = clientMod.createRemoteEngine(send);
            cachedEngine = engine;
            cachedLoop = new loopExports.StigmergyLoop(engine);
            cachedSafeEmit = typeof loopExports.safeEmit === 'function' ? loopExports.safeEmit : null;
            console.debug(`[Stigmergy] connected to daemon at ${socketPath}`);
        } catch (e) {
            console.debug('[Stigmergy] init failed (non-fatal):', e instanceof Error ? e.message : e);
        }
    })();
    return initPromise;
}

// ---------------------------------------------------------------------------
// Capability registration. Capabilities describe the WHOLE inventory the
// daemon should know about, NOT just the LLM-facing dispatcher tools. Four
// kinds end up here, each with its own stable, namespaced id so the graph
// keeps them distinct and the daemon can rank them together:
//
//   - tools      : `<tool-name>`           type='tool'
//   - skills     : `skill:<slug>`          type='skill'
//   - MCP tools  : `mcp:<server>:<name>`   type='mcp'
//   - subagents  : `subagent:<profile>`    type='subagent'
//
// The id used at registration MUST equal the id used at the instrumentation
// site (emitInvoked / emitReturned), otherwise the daemon ends up with
// phantom capability nodes that never see edges.
//
// The set is mostly stable across turns, so we hash it and skip
// re-registration when nothing changed. This is what the wiring rule
// meant by "gate on a hash so it is not repeated every turn".

/**
 * Minimal description of one non-tool capability the daemon should know
 * about. The `name` becomes the unprefixed fragment of the namespaced id
 * (`skill:<name>`, `mcp:<server>:<name>`, `subagent:<name>`); the
 * `description` is what consult/ranking sees and what the model sees in
 * pathGuidance hints.
 */
export interface CapabilityDescriptor {
    name: string;
    description: string;
}

/** MCP capabilities additionally carry the server they live on. */
export interface McpCapabilityDescriptor extends CapabilityDescriptor {
    server: string;
}

/**
 * Full capability inventory the daemon should keep in sync with. `tools` is
 * the LLM-facing dispatcher schema and is required (the baseline the other
 * surfaces are observed against); the three other sets are optional because
 * callers can register the slices they have. Each set contributes to the
 * hash, so a change in any one of them forces a fresh registration cycle.
 */
export interface CapabilityInputs {
    tools: ToolDefinition[];
    skills?: CapabilityDescriptor[];
    mcp?: McpCapabilityDescriptor[];
    subagents?: CapabilityDescriptor[];
}

/** Build the namespaced id used both at registration AND at emit time. */
export function stigmergyToolId(name: string): string { return name; }
export function stigmergySkillId(name: string): string { return `skill:${name}`; }
/**
 * Compose an MCP capability id `mcp:<server>:<tool>`. AUDIT-035 I-2: the
 * `:` is also the namespace separator, so a `:` inside server or tool
 * name would create ambiguous synthetic ids in the substrate graph.
 * Normalize both segments to `_` here. The same builder is the only path
 * used at registration AND at emit time, so the id stays round-trip
 * stable as long as everyone goes through this function.
 */
export function stigmergyMcpId(server: string, name: string): string {
    return `mcp:${server.replace(/:/g, '_')}:${name.replace(/:/g, '_')}`;
}
export function stigmergySubagentId(name: string): string { return `subagent:${name}`; }

function hashCapabilityInputs(inputs: CapabilityInputs): string {
    // djb2 over the namespaced id + description of every capability in
    // every set. Stable across runs and cheap enough to recompute per turn.
    let h = 5381;
    const fold = (s: string): void => {
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        }
        h = ((h << 5) + h + 0x1f) | 0; // separator between capabilities
    };
    for (const t of inputs.tools) fold(`tool|${t.name}|${t.description}`);
    for (const s of inputs.skills ?? []) fold(`skill|${s.name}|${s.description}`);
    for (const m of inputs.mcp ?? []) fold(`mcp|${m.server}|${m.name}|${m.description}`);
    for (const a of inputs.subagents ?? []) fold(`subagent|${a.name}|${a.description}`);
    return h.toString(36);
}

/**
 * Register every capability the daemon should know about -- tools AND the
 * three other explorable surfaces (skills, MCP tools, subagent profiles).
 * Hash-gated so it costs nothing when the inventory is stable (the normal
 * case); the first call after startup registers, later calls are O(N) for
 * the hash but otherwise free.
 *
 * Accepts either a plain tool list (legacy shape used by the startup wiring
 * before MCP has connected / skills have loaded) or the full
 * `CapabilityInputs` map. Each per-capability registration is wrapped
 * non-fatally so a transient daemon failure does not interrupt the loop
 * or skip remaining items.
 */
export async function registerCapabilitiesIfChanged(
    input: ToolDefinition[] | CapabilityInputs,
): Promise<void> {
    await initPromise; // ensure init has had a chance to run
    if (!cachedEngine) return;
    const inputs: CapabilityInputs = Array.isArray(input) ? { tools: input } : input;
    const hash = hashCapabilityInputs(inputs);
    if (hash === lastCapabilitiesHash) return;
    lastCapabilitiesHash = hash;

    const engine = cachedEngine;
    const tryRegister = async (id: string, type: string, description: string): Promise<void> => {
        try {
            await Promise.resolve(engine.registerCapability({ id, type, description }));
        } catch (e) {
            console.debug(
                `[Stigmergy] registerCapability(${id}) failed (non-fatal):`,
                e instanceof Error ? e.message : e,
            );
        }
    };

    for (const t of inputs.tools) {
        await tryRegister(stigmergyToolId(t.name), 'tool', t.description);
    }
    for (const s of inputs.skills ?? []) {
        await tryRegister(stigmergySkillId(s.name), 'skill', s.description);
    }
    for (const m of inputs.mcp ?? []) {
        await tryRegister(stigmergyMcpId(m.server, m.name), 'mcp', m.description);
    }
    for (const a of inputs.subagents ?? []) {
        await tryRegister(stigmergySubagentId(a.name), 'subagent', a.description);
    }

    const counts = [
        `${inputs.tools.length} tools`,
        `${inputs.skills?.length ?? 0} skills`,
        `${inputs.mcp?.length ?? 0} mcp`,
        `${inputs.subagents?.length ?? 0} subagents`,
    ].join(', ');
    console.debug(`[Stigmergy] registered ${counts} (hash ${hash})`);
}

// ---------------------------------------------------------------------------
// Per-turn entry point. The loop facade no-ops the whole turn when
// Stigmergy is disabled in the Studio or the daemon is down, so we do not
// add our own enable/disable check here.

/**
 * Send one lifecycle event through `safeEmit` when the loop SDK exposes it
 * (>= 0.1.2). Falls back to a hand-rolled try/catch that mirrors the same
 * degrade contract, so the wider adapter still works against an older SDK.
 */
async function emitSafely(event: RawLifecycleEvent): Promise<void> {
    const engine = cachedEngine;
    if (!engine) return;
    if (cachedSafeEmit) {
        try {
            await Promise.resolve(cachedSafeEmit(engine, event));
        } catch (e) {
            // `safeEmit` is documented as non-throwing, but belt-and-braces:
            // a third-party engine could still wedge in something. Log and
            // swallow -- the loop must keep running.
            console.debug(
                `[Stigmergy] safeEmit(${event.type} ${event.capabilityId}) failed (non-fatal):`,
                e instanceof Error ? e.message : e,
            );
        }
        return;
    }
    try {
        await Promise.resolve(engine.emit(event));
    } catch (e) {
        console.debug(
            `[Stigmergy] emit(${event.type} ${event.capabilityId}) failed (non-fatal):`,
            e instanceof Error ? e.message : e,
        );
    }
}

/**
 * Begin a Stigmergy turn for one AgentTask.run() invocation.
 *
 * Returns a turn object whose methods are always safe to call -- if the SDK
 * is missing, mis-configured, or rejects the call, the returned turn is a
 * no-op so the agent loop continues unchanged.
 */
export async function beginStigmergyTurn(params: {
    taskId: string;
    prompt: string;
    candidateIds: string[];
}): Promise<StigmergyTurn> {
    await initPromise;
    if (!cachedLoop || !cachedEngine) return NOOP_TURN;
    try {
        const raw = await Promise.resolve(cachedLoop.beginTurn({
            task_id: params.taskId,
            prompt: params.prompt,
            candidate_ids: params.candidateIds,
        }));
        // ADR-20: the SDK marks the turn disabled when the daemon answered
        // `isEnabled=false` (Studio toggle off, daemon down). Mirror that so
        // the pipeline can fast-path skip per-tool emits.
        const enabled = raw.enabled !== false;
        const surfaced = Array.isArray(raw.surfaced) ? raw.surfaced.slice() : [];
        const decision = raw.decision;
        // ADR-130 / FEAT-32-01: stable decisionMode surface for the precedence
        // resolver in AgentTask and the episode snapshot in EpisodicExtractor.
        // Derived once here; consumers must not re-read raw.decision.
        const decisionMode: StigmergyTurn['decisionMode'] = decision?.mode ?? 'none';
        let ended = false;
        // First-resolver-wins across accept / iterate / abandon. The loop
        // SDK treats the first resolution as authoritative; a duplicate or
        // a second resolver after the first would either double-count or
        // contradict the substrate. Guarding here makes the public surface
        // idempotent so callers (the AgentTask finally, defensive retry
        // paths) can call without bookkeeping.
        let resolved = false;
        return {
            enabled,
            taskId: params.taskId,
            decisionMode,
            instrument: (tools) => {
                try {
                    return raw.instrument(tools);
                } catch (e) {
                    console.debug('[Stigmergy] instrument failed (non-fatal):', e instanceof Error ? e.message : e);
                    return tools;
                }
            },
            orderTools: <T>(tools: readonly T[], idOf: (tool: T) => string): T[] => {
                // No ranking signal -> identity copy. We never DROP tools so a
                // bad ranking can never hide something the agent needs.
                if (!enabled || surfaced.length === 0) return Array.from(tools);
                const rank = new Map<string, number>();
                for (let i = 0; i < surfaced.length; i++) rank.set(surfaced[i], i);
                // Stable sort: ranked tools first by ascending rank; unranked
                // tools keep their original relative order at the end.
                return Array.from(tools)
                    .map((t, originalIdx) => ({ t, originalIdx, r: rank.get(idOf(t)) }))
                    .sort((a, b) => {
                        const ar = a.r ?? Number.POSITIVE_INFINITY;
                        const br = b.r ?? Number.POSITIVE_INFINITY;
                        if (ar !== br) return ar - br;
                        return a.originalIdx - b.originalIdx;
                    })
                    .map((x) => x.t);
            },
            pathGuidance: (descOf) => {
                if (!enabled || !decision) return { path: [], text: '' };
                // AUDIT-035 L-1 + I-3: capability descriptions can come from
                // external sources (MCP-tool descriptions are server-provided,
                // skill descriptions come from user-authored frontmatter).
                // Strip control chars and newlines and cap per-id length so
                // a hostile description cannot inject instruction-injection
                // text into the per-turn guidance block, and cap the total
                // body so a pathological `sequence` decision cannot inflate
                // the user message tail.
                const safeDesc = (id: string): string | undefined => {
                    const raw = descOf?.(id);
                    if (!raw) return undefined;
                    let stripped = '';
                    for (let i = 0; i < raw.length; i++) {
                        const c = raw.charCodeAt(i);
                        stripped += (c < 32 || c === 127) ? ' ' : raw[i];
                    }
                    const cleaned = stripped.replace(/\s+/g, ' ').trim();
                    if (!cleaned) return undefined;
                    return cleaned.length > 200 ? cleaned.slice(0, 200) + '...' : cleaned;
                };
                const line = (id: string) => {
                    const d = safeDesc(id);
                    return d ? `- ${id}: ${d}` : `- ${id}`;
                };
                const MAX_GUIDANCE_CHARS = 2000;
                const cap = (s: string): string =>
                    s.length <= MAX_GUIDANCE_CHARS
                        ? s
                        : s.slice(0, MAX_GUIDANCE_CHARS) + '\n...(truncated)';
                if (decision.mode === 'sequence') {
                    const fullPath = [decision.nextCapability, ...(decision.remainingPath ?? [])];
                    if (fullPath.length === 0) return { path: [], text: '' };
                    // Slice long learned paths to the first 10 steps and add
                    // a trailer so the model still sees the next move first.
                    const shown = fullPath.length > 10 ? fullPath.slice(0, 10) : fullPath;
                    const trailer = fullPath.length > shown.length
                        ? `\n...(and ${fullPath.length - shown.length} more steps)`
                        : '';
                    // ADR-26: `path` carries the FULL ordered capability list
                    // (not the sliced display list) so the caller can pre-
                    // activate every deferred tool on the learned path, not
                    // just the first 10. The substrate may pin a longer
                    // sequence than we want to inline.
                    return {
                        path: fullPath.slice(),
                        text: cap(
                            'Stigmergy has a pinned sequence for this kind of task:\n'
                            + shown.map(line).join('\n')
                            + trailer
                            + '\nFollow it unless the situation does not fit.',
                        ),
                    };
                }
                if (decision.mode === 'enforce') {
                    const ids = decision.ranked.slice(0, 5).map((r) => r.capabilityId);
                    if (ids.length === 0) return { path: [], text: '' };
                    // `enforce` is a pinned SET, not a sequence. The loop
                    // SDK's PathGuidance.path is empty for enforce decisions
                    // (no single learned path applies); we mirror that so
                    // the caller does not pre-activate set entries as if
                    // they were a path. Set semantics belongs in the text.
                    return {
                        path: [],
                        text: cap(
                            'Stigmergy requires the next capability from this pinned set (best first):\n'
                            + ids.map(line).join('\n'),
                        ),
                    };
                }
                // mode === 'ranked': observe-only, no guidance text and no
                // pre-activation. VOs own find_tool / progressive disclosure
                // stays the precise default selector.
                return { path: [], text: '' };
            },
            emitInvoked: async (capabilityId) => {
                if (!enabled) return;
                await emitSafely({
                    type: 'capability_invoked',
                    taskId: params.taskId,
                    capabilityId,
                });
            },
            emitReturned: async (capabilityId, success) => {
                if (!enabled) return;
                await emitSafely({
                    type: 'capability_returned',
                    taskId: params.taskId,
                    capabilityId,
                    success,
                });
            },
            end: async () => {
                if (ended) return;
                ended = true;
                try { await Promise.resolve(raw.end()); }
                catch (e) { console.debug('[Stigmergy] end failed (non-fatal):', e instanceof Error ? e.message : e); }
            },
            accept: async (cost) => {
                if (resolved) return;
                resolved = true;
                try { await Promise.resolve(raw.accept(cost)); }
                catch (e) { console.debug('[Stigmergy] accept failed (non-fatal):', e instanceof Error ? e.message : e); }
            },
            iterate: async (newContext) => {
                if (resolved) return;
                resolved = true;
                // Older raw turns may not implement `iterate` (the loop SDK
                // gained it in 0.1.x). Fall back to a no-op: the turn ends
                // with `end()` and the substrate sees no reinforcement, which
                // is the safer half of the iterate contract.
                if (typeof raw.iterate !== 'function') return;
                try { await Promise.resolve(raw.iterate(newContext)); }
                catch (e) { console.debug('[Stigmergy] iterate failed (non-fatal):', e instanceof Error ? e.message : e); }
            },
            abandon: async () => {
                if (resolved) return;
                resolved = true;
                if (typeof raw.abandon !== 'function') return;
                try { await Promise.resolve(raw.abandon()); }
                catch (e) { console.debug('[Stigmergy] abandon failed (non-fatal):', e instanceof Error ? e.message : e); }
            },
            surfaced,
        };
    } catch (e) {
        console.debug('[Stigmergy] beginTurn failed (non-fatal):', e instanceof Error ? e.message : e);
        return NOOP_TURN;
    }
}

/** Flatten a user message into a plain string for the Stigmergy `prompt` field. */
export function stigmergyPromptOf(userMessage: string | Array<{ type: string; text?: string }>): string {
    if (typeof userMessage === 'string') return userMessage;
    return userMessage
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join(' ');
}

// ---------------------------------------------------------------------------
// Test-only seam (FEAT-32-01 PR 1.1; AUDIT-036 L-1 hardening).
//
// `setCachedLoop` lets unit tests inject a fake loop without going through
// `initStigmergy` (which would require mocking two dynamic ESM imports).
// `reset` clears every module-level cache so each test starts from the same
// pre-init state. Production callers must NEVER use these hooks; the export
// is named with a double underscore prefix so a search for "__test" makes the
// usage easy to find and lint against.
//
// AUDIT-036 L-1: the hooks are gated behind a NODE_ENV check so the
// production bundle ships `undefined`. The esbuild production config sets
// NODE_ENV=production at build time, which lets the dead-code elimination
// pass drop the object literal entirely. In dev / vitest the check returns
// truthy and the hooks are real. Tests dereference via `__testHooks!` since
// the union now includes `undefined`.
const __testHooksImpl = {
    setCachedLoop(loop: unknown): void {
        cachedLoop = loop as RawStigmergyLoop;
        // beginStigmergyTurn requires both engine and loop. Provide a minimal
        // engine stub so the function does not early-return NOOP_TURN. Tests
        // that need real engine behaviour can pass an object with registerCapability/emit.
        cachedEngine = { registerCapability: () => undefined, emit: () => undefined };
        cachedSafeEmit = null;
        initPromise = Promise.resolve();
    },
    reset(): void {
        cachedLoop = null;
        cachedEngine = null;
        cachedSafeEmit = null;
        initPromise = null;
        lastCapabilitiesHash = null;
    },
};

export const __testHooks: typeof __testHooksImpl | undefined =
    (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production')
        ? __testHooksImpl
        : undefined;
