/**
 * Ambient declarations for the Stigmergy SDK.
 *
 * The integration is a thin client: `@agentic-stigmergy/client` provides the
 * remote engine + RPC transport (the daemon owns the embedding model and DB),
 * and `@agentic-stigmergy/loop` provides the per-turn facade. Both are
 * optional at build time -- the adapter degrades to a no-op when they are
 * not installed -- so these declarations exist only to let the TypeScript
 * build pass without requiring the packages to be resolvable on disk.
 */

declare module '@agentic-stigmergy/client' {
    export interface StigmergyCapability {
        id: string;
        type: string;
        description: string;
    }

    /** Subset of lifecycle events the loop emits per single-tool dispatch. */
    export type StigmergyLifecycleEvent =
        | { type: 'capability_invoked'; taskId: string; capabilityId: string }
        | { type: 'capability_returned'; taskId: string; capabilityId: string; success: boolean }
        | { type: string; [k: string]: unknown };

    export interface StigmergyEngine {
        registerCapability: (cap: StigmergyCapability) => Promise<void> | void;
        emit: (event: StigmergyLifecycleEvent) => Promise<void> | void;
    }

    export type RpcSend = (method: string, params?: unknown) => Promise<unknown>;

    export function socketRpcSend(socketPath: string): RpcSend;
    export function createRemoteEngine(send: RpcSend): StigmergyEngine;
}

declare module '@agentic-stigmergy/loop' {
    import type { StigmergyEngine, StigmergyLifecycleEvent } from '@agentic-stigmergy/client';

    export interface StigmergyTurnHandle {
        /** Tools surfaced to the model after Stigmergy ranking. Phase 2 hook. */
        readonly surfaced?: string[];
        instrument: <T>(tools: T[]) => T[];
        end: () => Promise<void> | void;
        accept: (tokenCost: number) => Promise<void> | void;
        /** Continue the same turn after a revision (weaker reward on eventual accept). */
        iterate?: (newContext?: string) => Promise<void> | void;
        /** Resolve the turn as abandoned (negative evidence, no reinforcement). */
        abandon?: () => Promise<void> | void;
    }

    /**
     * Degrade-dichter Emit-Helfer aus loop >= 0.1.2 -- erlaubt hand-rolled
     * Hooks (skill/mcp/subagent dispatch sites that have no wrappable
     * execute) dieselbe ADR-20-Garantie wie `instrumentRun` zu nutzen.
     */
    export function safeEmit(
        engine: StigmergyEngine,
        event: StigmergyLifecycleEvent,
    ): Promise<void>;

    export class StigmergyLoop {
        constructor(engine: StigmergyEngine);
        beginTurn(params: {
            task_id: string;
            prompt: string;
            candidate_ids: string[];
        }): Promise<StigmergyTurnHandle> | StigmergyTurnHandle;
    }
}
